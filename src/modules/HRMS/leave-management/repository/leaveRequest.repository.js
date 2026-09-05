const mongoose = require('mongoose');
const LeaveRequest = require('../models/leaveRequest.model');
const ApiFeatures = require('../../../../core/utils/api/ApiFeatures');
require('../../../auth/core/user.model');
require('../../core-hr/models/employee.model');
require('../../core-hr/models/department.model');

class LeaveRequestRepository {

  async getList(orgId, queryString) {
    const features = new ApiFeatures(LeaveRequest.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['leaveRequestId', 'reason'])
      .sort({ createdAt: -1 })
      .paginate()
      .populate([
        { path: 'user', select: 'name email phone avatar' },
        { path: 'employeeRef', select: 'employeeId firstName lastName displayName officialEmail' },
        { path: 'approvedBy', select: 'name' },
        { path: 'handoverTo', select: 'name' },
        { path: 'departmentId', select: 'name' }
      ]);
    return await features.execute();
  }

  async getMyRequests(orgId, userId, queryString) {
    const filter = { organizationId: orgId, user: userId };
    const features = new ApiFeatures(LeaveRequest.find(filter), queryString)
      .filter()
      .search(['leaveRequestId', 'reason'])
      .sort({ createdAt: -1 })
      .paginate()
      .populate([
        { path: 'approvedBy', select: 'name' },
        { path: 'approvalFlow.approver', select: 'name email' }
      ]);
    return await features.execute();
  }

  async getById(orgId, id, session = null) {
    return LeaveRequest.findOne({ _id: id, organizationId: orgId }).session(session).populate([
      { path: 'user', select: 'name email phone avatar' },
      { path: 'employeeRef', select: 'employeeId firstName lastName displayName officialEmail phone' },
      { path: 'approvedBy', select: 'name' },
      { path: 'handoverTo', select: 'name email' },
      { path: 'departmentId', select: 'name' },
      { path: 'approvalFlow.approver', select: 'name email avatar' },
      { path: 'escalatedTo', select: 'name' }
    ]);
  }

  async checkOverlap(orgId, userId, start, end, excludeId = null) {
    const query = {
      user: userId, organizationId: orgId,
      status: { $in: ['pending', 'approved'] },
      $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }]
    };
    if (excludeId) query._id = { $ne: excludeId };
    return LeaveRequest.findOne(query);
  }

  async getPendingByApprover(orgId, approverId, isGlobalAdmin) {
    const query = { organizationId: orgId, status: 'pending' };
    if (!isGlobalAdmin) query.assignedApprover = approverId;

    return LeaveRequest.find(query)
      .populate('user', 'name email avatar')
      .populate('employeeRef', 'employeeId firstName lastName displayName')
      .populate('departmentId', 'name')
      .sort({ createdAt: -1 });
  }

  async getAnalyticsAggregation(orgId, financialYear, departmentId) {
    const matchStage = { organizationId: orgId, status: 'approved' };

    if (financialYear) {
      const [startYear] = financialYear.split('-');
      matchStage.startDate = {
        $gte: new Date(parseInt(startYear), 3, 1),
        $lte: new Date(parseInt(startYear) + 1, 2, 31)
      };
    }

    if (departmentId) {
      matchStage.departmentId = new mongoose.Types.ObjectId(departmentId); // FIX BUG-LR-C09
    }

    return LeaveRequest.aggregate([
      { $match: matchStage },
      {
        $facet: {
          byLeaveType: [{ $group: { _id: '$leaveType', count: { $sum: 1 }, totalDays: { $sum: '$daysCount' }, avgDays: { $avg: '$daysCount' } } }],
          byMonth: [{ $group: { _id: { $month: '$startDate' }, count: { $sum: 1 }, totalDays: { $sum: '$daysCount' } } }, { $sort: { _id: 1 } }],
          byDepartment: [
            { $group: { _id: '$departmentId', count: { $sum: 1 }, totalDays: { $sum: '$daysCount' } } },
            { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
            { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
          ],
          overall: [{ $group: { _id: null, totalRequests: { $sum: 1 }, totalLeaveDays: { $sum: '$daysCount' }, avgLeaveDays: { $avg: '$daysCount' }, maxLeaveDays: { $max: '$daysCount' } } }],
        }
      }
    ]);
  }
}

module.exports = new LeaveRequestRepository();