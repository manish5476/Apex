const AttendanceRequest = require('../models/attendanceRequest.model');
const ApiFeatures = require('../../../../core/utils/api.utils');

class AttendanceRequestRepository {
  
  async getList(orgId, queryString) {
    const features = new ApiFeatures(AttendanceRequest.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['type', 'status'])
      .sort()
      .paginate()
      .populate([
        { path: 'user', select: 'name employeeProfile.employeeId avatar' },
        { path: 'approvedBy', select: 'name' }
      ]);
    return await features.execute();
  }

  async getById(orgId, id, session = null) {
    return AttendanceRequest.findOne({ _id: id, organizationId: orgId }).session(session).populate([
      { path: 'user', select: 'name email phone employeeProfile' },
      { path: 'approvedBy', select: 'name' },
      { path: 'approvalFlow.approver', select: 'name email avatar' }
    ]);
  }

  async getPendingByApprover(orgId, userId, isSuperAdminOrOwner) {
    const query = { organizationId: orgId, status: 'pending' };
    
    // If not a global admin, restrict to requests specifically assigned to this user
    if (!isSuperAdminOrOwner) {
      query.assignedApprover = userId;
    }

    return AttendanceRequest.find(query)
      .populate('user', 'name employeeProfile.employeeId avatar')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getMyRequests(orgId, userId, queryString) {
    const features = new ApiFeatures(AttendanceRequest.find({ organizationId: orgId, user: userId }), queryString)
      .filter()
      .sort()
      .paginate()
      .populate([
        { path: 'approvedBy', select: 'name' },
        { path: 'approvalFlow.approver', select: 'name email avatar' }
      ]);
    return await features.execute();
  }

  async findPendingForDate(orgId, userId, date) {
    return AttendanceRequest.findOne({
      user: userId,
      organizationId: orgId,
      targetDate: new Date(date),
      status: 'pending'
    });
  }

  async create(orgId, payload) {
    return AttendanceRequest.create({ ...payload, organizationId: orgId });
  }
}

module.exports = new AttendanceRequestRepository();