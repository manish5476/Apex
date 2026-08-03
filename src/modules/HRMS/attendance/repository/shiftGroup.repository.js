const ShiftGroup = require('../models/shiftGroup.model');
const ShiftAssignment = require('../models/shiftAssignment.model');
const Shift = require('../models/shift.model');
const User = require('../../../auth/core/user.model');
const ApiFeatures = require('../../../../core/utils/api/ApiFeatures');

class ShiftGroupRepository {
  
  async getList(orgId, queryString) {
    const features = new ApiFeatures(ShiftGroup.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['name', 'code', 'description'])
      .sort()
      .paginate()
      .populate([{ path: 'shifts.shiftId', select: 'name code startTime endTime shiftType' }]);
    return await features.execute();
  }

  async getById(orgId, id) {
    return ShiftGroup.findOne({ _id: id, organizationId: orgId }).populate([
      { path: 'shifts.shiftId', select: 'name code startTime endTime shiftType duration' },
      { path: 'applicableDepartments', select: 'name' },
      { path: 'applicableDesignations', select: 'title' }
    ]);
  }

  async getByNameOrCode(orgId, name, code, excludeId = null) {
    const query = { organizationId: orgId, $or: [] };
    if (name) query.$or.push({ name });
    if (code) query.$or.push({ code });
    if (excludeId) query._id = { $ne: excludeId };
    return query.$or.length > 0 ? ShiftGroup.findOne(query) : null;
  }

  async validateShiftsExist(orgId, shiftIds) {
    const validShifts = await Shift.find({ _id: { $in: shiftIds }, organizationId: orgId, isActive: true }).select('_id');
    return validShifts.length === shiftIds.length;
  }

  async create(orgId, payload) {
    return ShiftGroup.create({ ...payload, organizationId: orgId });
  }

  async updateById(orgId, id, payload) {
    return ShiftGroup.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true }
    );
  }

  async getAssignments(orgId, shiftGroupId, query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(200, parseInt(query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = { organizationId: orgId, shiftGroupId, status: 'active' };

    const [assignments, total] = await Promise.all([
      ShiftAssignment.find(filter)
        .populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId')
        .populate('shiftId', 'name code startTime endTime')
        .skip(skip).limit(limit).sort('startDate'),
      ShiftAssignment.countDocuments(filter)
    ]);

    return { assignments, total, page, totalPages: Math.ceil(total / limit) };
  }
}

module.exports = new ShiftGroupRepository();