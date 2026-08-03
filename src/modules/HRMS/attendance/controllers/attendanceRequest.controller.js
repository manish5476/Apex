const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const repo = require('../repository/attendanceRequest.repository');
const attendanceRequestService = require('../services/attendanceRequest.service');
const { createRequestSchema, approveRequestSchema, rejectRequestSchema } = require('../validation/attendanceRequest.validation');
const { success, created } = require('../../middleware/responseFormatter');

// ─────────────────────────────────────────────
//  READ & GET OPERATIONS
// ─────────────────────────────────────────────

exports.getAllRequests = catchAsync(async (req, res) => {
  const result = await repo.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getRequest = catchAsync(async (req, res, next) => {
  const attendanceRequest = await repo.getById(req.user.organizationId, req.params.id);
  if (!attendanceRequest) return next(new AppError('Request not found', 404));
  return success(res, { attendanceRequest });
});

exports.getMyRequests = catchAsync(async (req, res) => {
  const result = await attendanceRequestService.getMyRequests(req.user.organizationId, req.user._id, req.query);
  return success(res, { requests: result.data }, 200, result.pagination);
});

exports.getPendingApprovals = catchAsync(async (req, res) => {
  const data = await attendanceRequestService.getPendingApprovals(req.user.organizationId, req.user);
  return success(res, data); // Returns { grouped: {...}, requests: [...] }
});

// ─────────────────────────────────────────────
//  ACTION OPERATIONS
// ─────────────────────────────────────────────

exports.createRequest = catchAsync(async (req, res) => {
  const payload = createRequestSchema.parse(req.body);
  const newRequest = await attendanceRequestService.createRequest(req.user.organizationId, req.user, payload);
  return created(res, { attendanceRequest: newRequest });
});

exports.approveRequest = catchAsync(async (req, res) => {
  const payload = approveRequestSchema.parse(req.body);
  const result = await attendanceRequestService.approveRequest(req.user.organizationId, req.params.id, req.user, payload.comments);
  return success(res, { attendanceRequest: result.request, message: result.message });
});

exports.rejectRequest = catchAsync(async (req, res) => {
  const payload = rejectRequestSchema.parse(req.body);
  const attRequest = await attendanceRequestService.rejectRequest(req.user.organizationId, req.params.id, req.user, payload.reason);
  return success(res, { attendanceRequest: attRequest, message: 'Request rejected' });
});

exports.cancelRequest = catchAsync(async (req, res) => {
  const attRequest = await attendanceRequestService.cancelRequest(req.user.organizationId, req.params.id, req.user);
  return success(res, { attendanceRequest: attRequest, message: 'Request cancelled' });
});


// // controllers/attendance/attendanceRequest.controller.js
// const AttendanceRequest = require('../../attendance/models/attendanceRequest.model');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const factory = require('../../../../core/utils/api/handlerFactory');
// const attendanceRequestService = require('../services/attendanceRequest.service');

// // ─────────────────────────────────────────────
// //  CRUD & CREATE
// // ─────────────────────────────────────────────

// /**
//  * POST /api/v1/hrms/attendance/requests
//  */
// exports.createRequest = catchAsync(async (req, res, next) => {
//   const newRequest = await attendanceRequestService.createRequest(req.body, req.user);

//   res.status(201).json({
//     status: 'success',
//     data: { attendanceRequest: newRequest }
//   });
// });

// /**
//  * GET /api/v1/hrms/attendance/requests/my-requests
//  */
// exports.getMyRequests = catchAsync(async (req, res, next) => {
//   const page = Math.max(1, parseInt(req.query.page) || 1);
//   const limit = Math.min(100, parseInt(req.query.limit) || 20);
//   const skip = (page - 1) * limit;

//   const query = { user: req.user._id, organizationId: req.user.organizationId };

//   if (req.query.status) query.status = req.query.status;

//   const [requests, total] = await Promise.all([
//     AttendanceRequest.find(query)
//       .populate('approvedBy', 'name')
//       .populate('approvalFlow.approver', 'name email avatar')
//       .skip(skip)
//       .limit(limit)
//       .sort({ createdAt: -1 }),
//     AttendanceRequest.countDocuments(query),
//   ]);

//   res.status(200).json({
//     status: 'success',
//     results: requests.length,
//     total,
//     page,
//     totalPages: Math.ceil(total / limit),
//     data: { requests }
//   });
// });

// /**
//  * GET /api/v1/hrms/attendance/requests/pending-approvals
//  */
// exports.getPendingApprovals = catchAsync(async (req, res, next) => {
//   const query = {
//     organizationId: req.user.organizationId,
//     status: 'pending'
//   };

//   // If the user is not a Super Admin or Owner, restrict to requests assigned to them
//   if (req.user.role !== 'Super Admin' && !req.user.isOwner) {
//     query.assignedApprover = req.user._id;
//   }

//   const requests = await AttendanceRequest.find(query)
//     .populate('user', 'name employeeProfile.employeeId avatar')
//     .sort({ createdAt: -1 });

//   // Group by level like in leave requests
//   const grouped = requests.reduce((acc, attReq) => {
//     const approval = attReq.approvalFlow.find(a =>
//       a.approver.toString() === req.user._id.toString() && a.status === 'pending'
//     );
//     const level = approval?.level || 1;
//     (acc[level] = acc[level] || []).push(attReq);
//     return acc;
//   }, {});

//   res.status(200).json({
//     status: 'success',
//     total: requests.length,
//     data: { grouped, requests }
//   });
// });

// exports.getAllRequests = factory.getAll(AttendanceRequest, {
//   populate: [
//     { path: 'user', select: 'name employeeProfile.employeeId avatar' },
//     { path: 'approvedBy', select: 'name' }
//   ],
//   sort: { createdAt: -1 }
// });

// exports.getRequest = factory.getOne(AttendanceRequest, {
//   populate: [
//     { path: 'user', select: 'name email phone employeeProfile' },
//     { path: 'approvedBy', select: 'name' },
//     { path: 'approvalFlow.approver', select: 'name email avatar' }
//   ]
// });

// // ─────────────────────────────────────────────
// //  APPROVAL OPERATIONS
// // ─────────────────────────────────────────────

// /**
//  * PATCH /api/v1/hrms/attendance/requests/:id/approve
//  */
// exports.approveRequest = catchAsync(async (req, res, next) => {
//   const result = await attendanceRequestService.approveRequest(req.params.id, req.user, req.body.comments);

//   res.status(200).json({
//     status: 'success',
//     message: result.message,
//     data: { attendanceRequest: result.request }
//   });
// });

// /**
//  * PATCH /api/v1/hrms/attendance/requests/:id/reject
//  */
// exports.rejectRequest = catchAsync(async (req, res, next) => {
//   const attRequest = await attendanceRequestService.rejectRequest(req.params.id, req.user, req.body.reason);

//   res.status(200).json({
//     status: 'success',
//     message: 'Request rejected',
//     data: { attendanceRequest: attRequest }
//   });
// });

// /**
//  * PATCH /api/v1/hrms/attendance/requests/:id/cancel
//  */
// exports.cancelRequest = catchAsync(async (req, res, next) => {
//   const attRequest = await attendanceRequestService.cancelRequest(req.params.id, req.user);

//   res.status(200).json({
//     status: 'success',
//     message: 'Request cancelled',
//     data: { attendanceRequest: attRequest }
//   });
// });
