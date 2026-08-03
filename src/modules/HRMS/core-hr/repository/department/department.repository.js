const Department = require('../../models/department.model');
const ApiFeatures = require('../../../../utils/api.utils'); // Assuming ApiFeatures was moved here

class DepartmentRepository {
  
  async getList(orgId, queryString) {
    const filter = { organizationId: orgId };
    
    const features = new ApiFeatures(Department.find(filter), queryString)
      .filter()
      .search(['name', 'code', 'description'])
      .sort()
      .limitFields()
      .paginate()
      .populate([
        { path: 'headOfDepartment', select: 'name avatar email' },
        { path: 'parentDepartment', select: 'name code' },
        { path: 'branchId', select: 'name' }
      ]);

    return await features.execute();
  }

  async getAllActive(orgId) {
    return Department.find({ organizationId: orgId, isActive: true })
      .select('name code level path headOfDepartment employeeCount parentDepartment')
      .populate('headOfDepartment', 'name avatar email')
      .lean();
  }

  async getById(orgId, id) {
    return Department.findOne({ _id: id, organizationId: orgId })
      .populate([
        { path: 'headOfDepartment', select: 'name email phone avatar' },
        { path: 'assistantHOD', select: 'name email' },
        { path: 'parentDepartment', select: 'name code path' },
        { path: 'branchId', select: 'name' }
      ]);
  }

  async getByNameOrCode(orgId, name, code, excludeId = null) {
    const query = { organizationId: orgId, $or: [] };
    if (name) query.$or.push({ name });
    if (code) query.$or.push({ code });
    if (excludeId) query._id = { $ne: excludeId };
    
    return query.$or.length > 0 ? Department.findOne(query) : null;
  }

  async create(orgId, payload) {
    return Department.create({ ...payload, organizationId: orgId });
  }

  async updateById(orgId, id, payload, session = null) {
    return Department.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true, session }
    );
  }

  async countDescendants(orgId, path) {
    // Escape regex metacharacters in path to prevent injection/errors
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Department.countDocuments({
      organizationId: orgId,
      path: new RegExp(`^${escapedPath}/`),
      isActive: true
    });
  }

  async getStatsAggregation(orgId) {
    return Department.aggregate([
      { $match: { organizationId: orgId, isActive: true } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'employeeProfile.departmentId', // Assuming user links to dept
          as: 'employees',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'headOfDepartment',
          foreignField: '_id',
          as: 'hodUser',
        },
      },
      {
        $project: {
          name: 1,
          code: 1,
          level: 1,
          employeeCount: { $size: '$employees' }, // Computed dynamically
          hodName: { $arrayElemAt: ['$hodUser.name', 0] },
        },
      },
      {
        $group: {
          _id: null,
          totalDepartments: { $sum: 1 },
          totalEmployees: { $sum: '$employeeCount' },
          avgEmployeesPerDept: { $avg: '$employeeCount' },
          departments: { $push: '$$ROOT' },
        },
      }
    ]);
  }
}

module.exports = new DepartmentRepository();