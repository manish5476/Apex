// controllers/attendance/attendanceRequest.controller.js
const AttendanceRequest = require('../../attendance/models/attendanceRequest.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const factory = require('../../../../core/utils/api/handlerFactory');
const attendanceRequestService = require('../services/attendanceRequest.service');

// ─────────────────────────────────────────────
//  CRUD & CREATE
// ─────────────────────────────────────────────

/**
 * POST /api/v1/hrms/attendance/requests
 */
exports.createRequest = catchAsync(async (req, res, next) => {
  const newRequest = await attendanceRequestService.createRequest(req.body, req.user);

  res.status(201).json({
    status: 'success',
    data: { attendanceRequest: newRequest }
  });
});

/**
 * GET /api/v1/hrms/attendance/requests/my-requests
 */
exports.getMyRequests = catchAsync(async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const query = { user: req.user._id, organizationId: req.user.organizationId };

  if (req.query.status) query.status = req.query.status;

  const [requests, total] = await Promise.all([
    AttendanceRequest.find(query)
      .populate('approvedBy', 'name')
      .populate('approvalFlow.approver', 'name email avatar')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    AttendanceRequest.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: requests.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { requests }
  });
});

/**
 * GET /api/v1/hrms/attendance/requests/pending-approvals
 */
exports.getPendingApprovals = catchAsync(async (req, res, next) => {
  const query = {
    organizationId: req.user.organizationId,
    status: 'pending'
  };

  // If the user is not a Super Admin or Owner, restrict to requests assigned to them
  if (req.user.role !== 'Super Admin' && !req.user.isOwner) {
    query.assignedApprover = req.user._id;
  }

  const requests = await AttendanceRequest.find(query)
    .populate('user', 'name employeeProfile.employeeId avatar')
    .sort({ createdAt: -1 });

  // Group by level like in leave requests
  const grouped = requests.reduce((acc, attReq) => {
    const approval = attReq.approvalFlow.find(a =>
      a.approver.toString() === req.user._id.toString() && a.status === 'pending'
    );
    const level = approval?.level || 1;
    (acc[level] = acc[level] || []).push(attReq);
    return acc;
  }, {});

  res.status(200).json({
    status: 'success',
    total: requests.length,
    data: { grouped, requests }
  });
});

exports.getAllRequests = factory.getAll(AttendanceRequest, {
  populate: [
    { path: 'user', select: 'name employeeProfile.employeeId avatar' },
    { path: 'approvedBy', select: 'name' }
  ],
  sort: { createdAt: -1 }
});

exports.getRequest = factory.getOne(AttendanceRequest, {
  populate: [
    { path: 'user', select: 'name email phone employeeProfile' },
    { path: 'approvedBy', select: 'name' },
    { path: 'approvalFlow.approver', select: 'name email avatar' }
  ]
});

// ─────────────────────────────────────────────
//  APPROVAL OPERATIONS
// ─────────────────────────────────────────────

/**
 * PATCH /api/v1/hrms/attendance/requests/:id/approve
 */
exports.approveRequest = catchAsync(async (req, res, next) => {
  const result = await attendanceRequestService.approveRequest(req.params.id, req.user, req.body.comments);

  res.status(200).json({
    status: 'success',
    message: result.message,
    data: { attendanceRequest: result.request }
  });
});

/**
 * PATCH /api/v1/hrms/attendance/requests/:id/reject
 */
exports.rejectRequest = catchAsync(async (req, res, next) => {
  const attRequest = await attendanceRequestService.rejectRequest(req.params.id, req.user, req.body.reason);

  res.status(200).json({
    status: 'success',
    message: 'Request rejected',
    data: { attendanceRequest: attRequest }
  });
});

/**
 * PATCH /api/v1/hrms/attendance/requests/:id/cancel
 */
exports.cancelRequest = catchAsync(async (req, res, next) => {
  const attRequest = await attendanceRequestService.cancelRequest(req.params.id, req.user);

  res.status(200).json({
    status: 'success',
    message: 'Request cancelled',
    data: { attendanceRequest: attRequest }
  });
});
