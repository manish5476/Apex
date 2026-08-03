const Employee = require('../../models/employee.model');
const User = require('../../../../auth/core/user.model');
const ApiFeatures = require('../../../../../core/utils/api/ApiFeatures');

const DEFAULT_POPULATE = [
  { path: 'user', select: 'name email phone avatar status isActive role branchId', populate: { path: 'role', select: 'name' } },
  { path: 'branchId', select: 'name branchCode' },
  { path: 'departmentId', select: 'name code' },
  { path: 'designationId', select: 'title code level grade' },
  { path: 'reportingManagerId', select: 'name email avatar' },
  { path: 'attendanceConfig.shiftId', select: 'name startTime endTime' },
  { path: 'attendanceConfig.shiftGroupId', select: 'name' },
  { path: 'attendanceConfig.geoFenceId', select: 'name' }
];

class EmployeeRepository {
  
  async getEmployeeList(orgId, queryString) {
    const baseFilter = { organizationId: orgId };

    // 🔥 Cross-Collection Search Strategy
    if (queryString.search) {
      const userSearchFeatures = new ApiFeatures(User.find({ organizationId: orgId }), queryString)
        .search(['name', 'email', 'phone']);
      
      const matchingUsers = await userSearchFeatures.query.select('_id').lean();
      const userIds = matchingUsers.map(u => u._id);

      // Pass user IDs back into query string so ApiFeatures picks it up
      queryString.user = userIds.length ? userIds.join('|') : 'no-match'; 
    }

    const features = new ApiFeatures(Employee.find(baseFilter), queryString)
      .filter()
      .search(['employeeId', 'employmentType']) 
      .sort()
      .limitFields()
      .paginate()
      .populate(DEFAULT_POPULATE); 

    return await features.execute();
  }

  async getById(orgId, id) {
    return Employee.findOne({ _id: id, organizationId: orgId }).populate(DEFAULT_POPULATE);
  }

  async getByUserId(orgId, userId) {
    return Employee.findOne({ user: userId, organizationId: orgId }).populate(DEFAULT_POPULATE);
  }

  async create(orgId, payload) {
    const doc = await Employee.create({ ...payload, organizationId: orgId });
    // Re-fetch to apply population logic cleanly
    return this.getById(orgId, doc._id);
  }

  async updateById(orgId, id, payload, session = null) {
    const doc = await Employee.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true, session }
    ).populate(DEFAULT_POPULATE);
    return doc;
  }

/**
   * Generates a comprehensive 360-degree view of an employee in a single DB pass.
   */
async getEmployee360Workspace(orgId, employeeId) {
  const mongoose = require('mongoose');
  
  const pipeline = [
    // 1. Match the exact employee and enforce tenant isolation
    { 
      $match: { 
        _id: new mongoose.Types.ObjectId(employeeId), 
        organizationId: new mongoose.Types.ObjectId(orgId) 
      } 
    },

    // 2. Lookup Core Identity (User)
    { 
      $lookup: { 
        from: 'users', 
        localField: 'user', 
        foreignField: '_id', 
        as: 'userData' 
      } 
    },
    { $unwind: { path: '$userData', preserveNullAndEmptyArrays: true } },

    // 3. Lookup Organizational Placement
    { 
      $lookup: { from: 'departments', localField: 'departmentId', foreignField: '_id', as: 'department' } 
    },
    { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
    
    { 
      $lookup: { from: 'designations', localField: 'designationId', foreignField: '_id', as: 'designation' } 
    },
    { $unwind: { path: '$designation', preserveNullAndEmptyArrays: true } },
    
    { 
      $lookup: { from: 'users', localField: 'reportingManagerId', foreignField: '_id', as: 'manager' } 
    },
    { $unwind: { path: '$manager', preserveNullAndEmptyArrays: true } },

    // 4. Lookup Assigned Assets (Filtered by 'assigned' status)
    {
      $lookup: {
        from: 'companyassets',
        let: { userId: '$user' },
        pipeline: [
          { 
            $match: { 
              $expr: { 
                $and: [ 
                  { $eq: ['$assignedTo', '$$userId'] }, 
                  { $eq: ['$status', 'assigned'] } 
                ] 
              } 
            } 
          },
          { $project: { assetCode: 1, name: 1, category: 1, condition: 1, assignedAt: 1 } }
        ],
        as: 'assets'
      }
    },

    // 5. Lookup Uploaded Documents (Excluding soft-deleted)
    {
      $lookup: {
        from: 'employeedocuments',
        let: { empId: '$_id' },
        pipeline: [
          { 
            $match: { 
              $expr: { 
                $and: [ 
                  { $eq: ['$employeeRef', '$$empId'] }, 
                  { $eq: ['$isDeleted', false] } 
                ] 
              } 
            } 
          },
          { $project: { title: 1, documentType: 1, 'verification.status': 1, createdAt: 1 } }
        ],
        as: 'documents'
      }
    },

    // 6. Project the UI-Optimized DTO
    {
      $project: {
        _id: 0,
        identity: {
          id: '$_id',
          employeeId: '$employeeId',
          name: '$userData.name',
          email: '$userData.email',
          avatar: '$userData.avatar',
          phone: '$userData.phone',
          status: '$status',
          employmentType: '$employmentType',
          dateOfJoining: '$dateOfJoining',
          workMode: '$workMode'
        },
        organization: {
          department: { id: '$department._id', name: '$department.name', code: '$department.code' },
          designation: { id: '$designation._id', title: '$designation.title', level: '$designation.level' },
          manager: { id: '$manager._id', name: '$manager.name', avatar: '$manager.avatar' }
        },
        attendanceConfig: 1,
        assets: 1,
        documents: 1,
        // Calculate compliance dynamically in the database
        compliance: {
           totalDocuments: { $size: '$documents' },
           verifiedDocuments: {
              $size: {
                 $filter: { 
                   input: '$documents', 
                   as: 'doc', 
                   cond: { $eq: ['$$doc.verification.status', 'verified'] } 
                 }
              }
           }
        }
      }
    }
  ];

  const result = await Employee.aggregate(pipeline);
  return result[0] || null;
}
}
module.exports = new EmployeeRepository();

// const Employee = require('../../core-hr/models/employee.model');
// const User = require('../../auth/core/user.model');
// const ApiFeatures = require('../../core/utils/ApiFeatures');

// class EmployeeRepository {
  
//   async getEmployeeList(orgId, queryString) {
//     const baseFilter = { organizationId: orgId };

//     // 🔥 FIX: Cross-Collection Search
//     // If there is a search term, find matching Users first, then inject their IDs into the Employee filter.
//     if (queryString.search) {
//       const userSearchFeatures = new ApiFeatures(User.find({ organizationId: orgId }), queryString)
//         .search(['name', 'email', 'phone']);
      
//       const matchingUsers = await userSearchFeatures.query.select('_id').lean();
//       const userIds = matchingUsers.map(u => u._id);

//       // We append this to the query string so ApiFeatures picks it up as an exact filter
//       queryString.user = userIds.join('|'); 
//     }

//     // Now use your existing ApiFeatures for the rest of the logic
//     const features = new ApiFeatures(Employee.find(baseFilter), queryString)
//       .filter()
//       .search(['employeeId', 'employmentType']) // Fields directly on Employee schema
//       .sort()
//       .limitFields()
//       .paginate()
//       .populate('user departmentId designationId'); // Adjust fields as needed

//     return await features.execute();
//   }

//   async updateById(orgId, id, data, session = null) {
//     return Employee.findOneAndUpdate(
//       { _id: id, organizationId: orgId },
//       { $set: data },
//       { new: true, runValidators: true, session }
//     );
//   }
// }

// module.exports = new EmployeeRepository();