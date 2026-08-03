const Designation = require('../../models/designation.model');
const Employee = require('../../models/employee.model');
const ApiFeatures = require('../../../../../core/utils/api/ApiFeatures');

class DesignationRepository {
  
  async getList(orgId, queryString) {
    const features = new ApiFeatures(Designation.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['title', 'code', 'description', 'jobFamily'])
      .sort()
      .limitFields()
      .paginate()
      .populate([
        { path: 'nextDesignation', select: 'title code level grade' },
        { path: 'reportsTo', select: 'title code level' }
      ]);

    return await features.execute();
  }

  async getAllActive(orgId) {
    return Designation.find({ organizationId: orgId, isActive: true })
      .select('title code level grade salaryBand promotionAfterYears nextDesignation reportsTo jobFamily')
      .lean();
  }

  async getById(orgId, id) {
    return Designation.findOne({ _id: id, organizationId: orgId })
      .populate([
        { path: 'nextDesignation', select: 'title code level grade salaryBand' },
        { path: 'reportsTo', select: 'title code level' }
      ]);
  }

  async getByTitleOrCode(orgId, title, code, excludeId = null) {
    const query = { organizationId: orgId, $or: [] };
    if (title) query.$or.push({ title });
    if (code) query.$or.push({ code });
    if (excludeId) query._id = { $ne: excludeId };
    
    return query.$or.length > 0 ? Designation.findOne(query) : null;
  }

  async create(orgId, payload, session = null) {
    const docs = await Designation.create([{ ...payload, organizationId: orgId }], { session });
    return docs[0];
  }

  async updateById(orgId, id, payload) {
    return Designation.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true }
    );
  }

  async getSalaryBandsAggregation(orgId) {
    return Designation.aggregate([
      { $match: { organizationId: orgId, isActive: true, 'salaryBand.min': { $exists: true } } },
      {
        $group: {
          _id: { level: '$level', grade: '$grade' },
          minSalary: { $min: '$salaryBand.min' },
          maxSalary: { $max: '$salaryBand.max' },
          avgSalary: { $avg: '$salaryBand.min' },
          designations: { $push: { title: '$title', code: '$code' } },
          count: { $sum: 1 },
        }
      },
      { $sort: { '_id.level': 1, '_id.grade': 1 } }
    ]);
  }

  async getEligibleEmployees(orgId, designationId, cutoffDate) {
    return Employee.find({
      organizationId: orgId,
      designationId: designationId,
      dateOfJoining: { $lte: cutoffDate },
      isActive: true
    })
    .select('user employeeId dateOfJoining departmentId designationId')
    .populate('user', 'name status isActive avatar')
    .populate('departmentId', 'name')
    .lean();
  }

  async isReferenced(orgId, designationId) {
    const [employeeCount, nextDesigCount] = await Promise.all([
      Employee.countDocuments({ organizationId: orgId, designationId }),
      Designation.countDocuments({ organizationId: orgId, nextDesignation: designationId })
    ]);
    return { employeeCount, nextDesigCount };
  }
}

module.exports = new DesignationRepository();