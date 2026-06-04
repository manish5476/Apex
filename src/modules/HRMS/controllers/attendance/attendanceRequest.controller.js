// controllers/attendance/attendanceRequest.controller.js
const mongoose = require('mongoose');
const AttendanceRequest = require('../../models/attendanceRequest.model');
const AttendanceDaily = require('../../models/attendanceDaily.model');
const Employee = require('../../models/employee.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const factory = require('../../../../core/utils/api/handlerFactory');
const { startOfDay, endOfDay } = require('../../../../core/utils/dateHelpers');

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

const calculateWorkHours = (firstIn, lastOut, breaks = []) => {
  if (!firstIn || !lastOut) return 0;
  const totalMs = lastOut - firstIn;
  let totalHours = totalMs / (1000 * 60 * 60);
  breaks.forEach(b => {
    if (b.start && b.end) totalHours -= (b.end - b.start) / (1000 * 60 * 60);
  });
  return Math.max(0, Math.round(totalHours * 100) / 100);
};

// ─────────────────────────────────────────────
//  CRUD & CREATE
// ─────────────────────────────────────────────

/**
 * POST /api/v1/hrms/attendance/requests
 */
exports.createRequest = catchAsync(async (req, res, next) => {
  req.body.user = req.user._id;
  req.body.organizationId = req.user.organizationId;
  req.body.branchId = req.user.branchId;
  req.body.appliedBy = req.user._id;

  const { targetDate, type, correction } = req.body;

  if (!targetDate || !type) {
    return next(new AppError('Please provide targetDate and type', 400));
  }

  // Prevent duplicates
  const existingRequest = await AttendanceRequest.findOne({
    user: req.user._id,
    targetDate: new Date(targetDate),
    status: 'pending'
  });

  if (existingRequest) {
    return next(new AppError('You already have a pending request for this date.', 400));
  }

  // Link to existing Daily Attendance if present
  const targetStart = startOfDay(new Date(targetDate));
  const targetEnd = endOfDay(new Date(targetDate));
  
  const daily = await AttendanceDaily.findOne({
    user: req.user._id,
    organizationId: req.user.organizationId,
    date: { $gte: targetStart, $lte: targetEnd }
  });

  if (daily) {
    req.body.attendanceDailyId = daily._id;
  }

  const { assignedApprover } = req.body;
  if (!assignedApprover) {
    return next(new AppError('Please select an approver.', 400));
  }

  const approvalFlow = [{ approver: assignedApprover, level: 1, status: 'pending' }];
  req.body.approvalFlow = approvalFlow;

  const newRequest = await AttendanceRequest.create(req.body);

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
  const { comments } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const attRequest = await AttendanceRequest.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
      status: 'pending'
    }).session(session);

    if (!attRequest) {
      await session.abortTransaction();
      return next(new AppError('Pending request not found', 404));
    }

    const currentApproval = attRequest.approvalFlow.find(a => a.level === attRequest.currentApprovalLevel);
    if (!currentApproval || currentApproval.approver.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      return next(new AppError('Not authorized to approve at this level', 403));
    }

    currentApproval.status = 'approved';
    currentApproval.comments = comments;
    currentApproval.actionAt = new Date();

    const nextLevel = attRequest.currentApprovalLevel + 1;
    const nextApproval = attRequest.approvalFlow.find(a => a.level === nextLevel);

    if (!nextApproval) {
      // Final approval
      attRequest.status = 'approved';
      attRequest.approvedBy = req.user._id;
      attRequest.approvedAt = new Date();
      attRequest.processedBy = req.user._id;
      attRequest.processedAt = new Date();

      // Apply changes to Daily Attendance
      const targetStart = startOfDay(new Date(attRequest.targetDate));
      const targetEnd = endOfDay(new Date(attRequest.targetDate));

      let daily = await AttendanceDaily.findOne({
        user: attRequest.user,
        organizationId: req.user.organizationId,
        date: { $gte: targetStart, $lte: targetEnd }
      }).session(session);

      if (!daily) {
        // Create it if it doesn't exist
        daily = new AttendanceDaily({
          user: attRequest.user,
          organizationId: req.user.organizationId,
          date: targetStart,
          status: 'absent'
        });
      }

      if (attRequest.type === 'correction' && attRequest.correction) {
        if (attRequest.correction.newFirstIn) daily.firstIn = attRequest.correction.newFirstIn;
        if (attRequest.correction.newLastOut) daily.lastOut = attRequest.correction.newLastOut;
        
        if (daily.firstIn && daily.lastOut) {
          daily.totalWorkHours = calculateWorkHours(daily.firstIn, daily.lastOut);
        }
      }

      // Automatically mark present if they corrected a missed punch 
      // (This logic can be customized based on requirements)
      if (['correction', 'missed_punch', 'regularization'].includes(attRequest.type)) {
        if (daily.firstIn) {
          daily.status = 'present'; 
        }
      }

      daily.isRegularized = true;
      daily.regularizedById = req.user._id;
      daily.regularizedAt = new Date();
      daily.regularizationReason = attRequest.type;
      
      await daily.save({ session });
    } else {
      attRequest.currentApprovalLevel = nextLevel;
    }

    await attRequest.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      message: nextApproval ? 'Approved — moving to next level' : 'Request fully approved',
      data: { attendanceRequest: attRequest }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * PATCH /api/v1/hrms/attendance/requests/:id/reject
 */
exports.rejectRequest = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  if (!reason) return next(new AppError('Please provide rejection reason', 400));

  const attRequest = await AttendanceRequest.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    status: 'pending'
  });

  if (!attRequest) return next(new AppError('Pending request not found', 404));

  const isApprover = attRequest.approvalFlow.some(a => a.approver.toString() === req.user._id.toString());
  if (!isApprover && !req.user.isSuperAdmin) return next(new AppError('Not authorized', 403));

  attRequest.status = 'rejected';
  attRequest.rejectionReason = reason;
  attRequest.processedBy = req.user._id;
  attRequest.processedAt = new Date();

  const currentApproval = attRequest.approvalFlow.find(a => a.level === attRequest.currentApprovalLevel);
  if (currentApproval) {
    currentApproval.status = 'rejected';
    currentApproval.comments = reason;
    currentApproval.actionAt = new Date();
  }

  await attRequest.save();

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
  const attRequest = await AttendanceRequest.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });

  if (!attRequest) return next(new AppError('Request not found', 404));
  if (attRequest.status !== 'pending') return next(new AppError('Cannot cancel in current state', 400));
  if (attRequest.user.toString() !== req.user._id.toString() && !req.user.isSuperAdmin) return next(new AppError('Not authorized', 403));

  attRequest.status = 'cancelled';
  attRequest.processedBy = req.user._id;
  attRequest.processedAt = new Date();
  
  await attRequest.save();

  res.status(200).json({
    status: 'success',
    message: 'Request cancelled',
    data: { attendanceRequest: attRequest }
  });
});
