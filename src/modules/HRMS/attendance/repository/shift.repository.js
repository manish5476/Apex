const Shift = require('../models/shift.model');
const User = require('../../../auth/core/user.model');
const Employee = require('../../core-hr/models/employee.model');
const ShiftGroup = require('../models/shiftGroup.model');
const ApiFeatures = require('../../../../core/utils/api.utils');

class ShiftRepository {
  
  async getList(orgId, queryString) {
    const features = new ApiFeatures(Shift.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['name', 'code', 'description'])
      .sort({ shiftType: 1, startTime: 1 })
      .paginate()
      .populate([{ path: 'createdBy', select: 'name' }]);
    return await features.execute();
  }

  async getActiveShifts(orgId) {
    return Shift.find({ organizationId: orgId, isActive: true }).lean();
  }

  async getById(orgId, id) {
    return Shift.findOne({ _id: id, organizationId: orgId }).populate([
      { path: 'createdBy', select: 'name' },
      { path: 'updatedBy', select: 'name' }
    ]);
  }

  async getByNameOrCode(orgId, name, code, excludeId = null) {
    const query = { organizationId: orgId, $or: [] };
    if (name) query.$or.push({ name });
    if (code) query.$or.push({ code });
    if (excludeId) query._id = { $ne: excludeId };
    return query.$or.length > 0 ? Shift.findOne(query) : null;
  }

  async create(orgId, payload) {
    return Shift.create({ ...payload, organizationId: orgId });
  }

  async updateById(orgId, id, payload) {
    return Shift.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true }
    );
  }

  // --- Specialized Queries ---

  async checkDependencies(orgId, shiftId) {
    const [assignedUsers, inGroups] = await Promise.all([
      User.countDocuments({ organizationId: orgId, 'attendanceConfig.shiftId': shiftId, isActive: true }),
      ShiftGroup.countDocuments({ organizationId: orgId, 'shifts.shiftId': shiftId, isActive: true })
    ]);
    return { assignedUsers, inGroups };
  }

  async getShiftAssignments(orgId, shiftId, query) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { organizationId: orgId, 'attendanceConfig.shiftId': shiftId };

    const [users, total] = await Promise.all([
      Employee.find(filter)
        .select('user employeeId departmentId attendanceConfig')
        .populate('user', 'name')
        .populate('departmentId', 'name')
        .skip(skip)
        .limit(limit),
      Employee.countDocuments(filter)
    ]);

    return { users, total, page, totalPages: Math.ceil(total / limit) };
  }

  // FIX N+1 Query: Get all user counts per shift in a single aggregation
  async getCoverageCounts(orgId, shiftIds) {
    const counts = await User.aggregate([
      { $match: { organizationId: orgId, 'attendanceConfig.shiftId': { $in: shiftIds }, isActive: true } },
      { $group: { _id: '$attendanceConfig.shiftId', count: { $sum: 1 } } }
    ]);
    return Object.fromEntries(counts.map(c => [c._id.toString(), c.count]));
  }
}

module.exports = new ShiftRepository();