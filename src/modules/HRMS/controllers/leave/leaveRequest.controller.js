// controllers/leave/leaveRequest.controller.js
const mongoose = require('mongoose');
const LeaveRequest = require('../../models/leaveRequest.model');
const LeaveBalance = require('../../models/leaveBalance.model');
 const AttendanceDaily = require('../../models/attendanceDaily.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/catchAsync');
const AppError = require('../../../../core/utils/appError');
const factory = require('../../../../core/utils/handlerFactory');

// ======================================================
// HELPERS & VALIDATIONS
// ======================================================

const getFinancialYear = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Financial year in India: April to March
  return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const calculateWorkingDays = (startDate, endDate, weeklyOffs = [0]) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let days = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (!weeklyOffs.includes(dayOfWeek)) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
};

const validateLeaveRequest = async (data, organizationId, userId, excludeId = null) => {
  const { leaveType, startDate, endDate, daysCount } = data;
  
  // Check dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start > end) {
    throw new AppError('Start date cannot be after end date', 400);
  }
  
  if (start < new Date().setHours(0, 0, 0, 0)) {
    throw new AppError('Cannot apply for leave in the past', 400);
  }
  
  // Check for overlapping leaves
  const overlapping = await LeaveRequest.findOne({
    user: userId,
    organizationId,
    status: { $in: ['pending', 'approved'] },
    _id: { $ne: excludeId },
    $or: [
      { 
        startDate: { $lte: end },
        endDate: { $gte: start }
      }
    ]
  });
  
  if (overlapping) {
    throw new AppError('You already have a leave request in this date range', 400);
  }
  
  // Check leave balance
  const financialYear = getFinancialYear(start);
  const balance = await LeaveBalance.findOne({
    user: userId,
    organizationId,
    financialYear
  });
  
  if (!balance) {
    throw new AppError('Leave balance not found for this financial year', 404);
  }
  
  const leaveField = `${leaveType}Leave`;
  const available = balance[leaveField]?.total - balance[leaveField]?.used || 0;
  
  if (available < daysCount && leaveType !== 'unpaid') {
    throw new AppError(`Insufficient ${leaveType} leave balance. Available: ${available}`, 400);
  }
  
  return { balance, available };
};

const generateImpactedDates = (startDate, endDate, leaveType, status = 'full_day') => {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);
  
  while (current <= end) {
    dates.push({
      date: new Date(current),
      status
    });
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create leave request
 * @route   POST /api/v1/leave-requests
 * @access  Private
 */
exports.createLeaveRequest = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Set basic fields
    req.body.user = req.user._id;
    req.body.organizationId = req.user.organizationId;
    req.body.branchId = req.user.branchId;
    req.body.departmentId = req.user.employeeProfile?.departmentId;
    req.body.appliedBy = req.user._id;
    
    // Validate request
    const { balance, available } = await validateLeaveRequest(
      req.body, 
      req.user.organizationId, 
      req.user._id
    );
    
    // Generate impacted dates
    req.body.impactedDates = generateImpactedDates(
      req.body.startDate, 
      req.body.endDate,
      req.body.leaveType
    );
    
    // Take balance snapshot
    req.body.balanceSnapshot = {
      before: {
        casual: balance.casualLeave?.total - balance.casualLeave?.used,
        sick: balance.sickLeave?.total - balance.sickLeave?.used,
        earned: balance.earnedLeave?.total - balance.earnedLeave?.used
      }
    };
    
    // Determine approval flow based on leave type and duration
    const user = await User.findById(req.user._id)
      .populate('employeeProfile.designationId')
      .populate('employeeProfile.reportingManagerId');
    
    // Build approval flow
    req.body.approvalFlow = [];
    
    // Level 1: Reporting Manager
    if (user.employeeProfile?.reportingManagerId) {
      req.body.approvalFlow.push({
        approver: user.employeeProfile.reportingManagerId,
        level: 1,
        status: 'pending'
      });
    }
    
    // Level 2: Department Head (if different from reporting manager)
    const department = await mongoose.model('Department').findById(user.employeeProfile?.departmentId);
    if (department?.headOfDepartment && 
        department.headOfDepartment.toString() !== user.employeeProfile?.reportingManagerId?.toString()) {
      req.body.approvalFlow.push({
        approver: department.headOfDepartment,
        level: 2,
        status: 'pending'
      });
    }
    
    // Level 3: HR for long leaves
    if (req.body.daysCount > 5) {
      const hrRole = await mongoose.model('Role').findOne({ 
        organizationId: req.user.organizationId,
        name: 'HR Manager'
      });
      if (hrRole) {
        const hrUsers = await User.find({ 
          role: hrRole._id,
          organizationId: req.user.organizationId,
          isActive: true
        }).limit(1);
        
        if (hrUsers.length) {
          req.body.approvalFlow.push({
            approver: hrUsers[0]._id,
            level: 3,
            status: 'pending'
          });
        }
      }
    }
    
    // Create leave request
    const [leaveRequest] = await LeaveRequest.create([req.body], { session });
    
    await session.commitTransaction();
    
    // Populate for response
    await leaveRequest.populate([
      { path: 'user', select: 'name employeeProfile.employeeId' },
      { path: 'approvalFlow.approver', select: 'name email' },
      { path: 'handoverTo', select: 'name' }
    ]);
    
    res.status(201).json({
      status: 'success',
      data: { leaveRequest }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Get all leave requests
 * @route   GET /api/v1/leave-requests
 * @access  Private
 */
exports.getAllLeaveRequests = factory.getAll(LeaveRequest, {
  searchFields: ['leaveRequestId', 'reason', 'additionalNotes'],
  populate: [
    { path: 'user', select: 'name employeeProfile.employeeId avatar' },
    { path: 'approvedBy', select: 'name' },
    { path: 'handoverTo', select: 'name' },
    { path: 'departmentId', select: 'name' }
  ],
  sort: { createdAt: -1 }
});

/**
 * @desc    Get single leave request
 * @route   GET /api/v1/leave-requests/:id
 * @access  Private
 */
exports.getLeaveRequest = factory.getOne(LeaveRequest, {
  populate: [
    { path: 'user', select: 'name email phone employeeProfile employeeProfile.designationId employeeProfile.departmentId' },
    { path: 'approvedBy', select: 'name' },
    { path: 'handoverTo', select: 'name email' },
    { path: 'departmentId', select: 'name' },
    { path: 'approvalFlow.approver', select: 'name email avatar' },
    { path: 'escalatedTo', select: 'name' }
  ]
});

/**
 * @desc    Update leave request
 * @route   PATCH /api/v1/leave-requests/:id
 * @access  Private (Owner or Admin)
 */
exports.updateLeaveRequest = catchAsync(async (req, res, next) => {
  const leaveRequest = await LeaveRequest.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!leaveRequest) {
    return next(new AppError('Leave request not found', 404));
  }
  
  // Only allow updates if status is draft or pending
  if (!['draft', 'pending'].includes(leaveRequest.status)) {
    return next(new AppError('Cannot update leave request that is already processed', 400));
  }
  
  // Only owner or admin can update
  if (leaveRequest.user.toString() !== req.user._id.toString() && !req.user.isSuperAdmin) {
    return next(new AppError('You are not authorized to update this request', 403));
  }
  
  // If dates changed, revalidate
  if (req.body.startDate || req.body.endDate || req.body.leaveType) {
    await validateLeaveRequest(
      { ...leaveRequest.toObject(), ...req.body },
      req.user.organizationId,
      leaveRequest.user,
      req.params.id
    );
    
    // Regenerate impacted dates
    req.body.impactedDates = generateImpactedDates(
      req.body.startDate || leaveRequest.startDate,
      req.body.endDate || leaveRequest.endDate,
      req.body.leaveType || leaveRequest.leaveType
    );
  }
  
  req.body.updatedBy = req.user._id;
  
  const updatedRequest = await LeaveRequest.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  ).populate('user', 'name employeeProfile.employeeId');
  
  res.status(200).json({
    status: 'success',
    data: { leaveRequest: updatedRequest }
  });
});

/**
 * @desc    Delete/cancel leave request
 * @route   DELETE /api/v1/leave-requests/:id
 * @access  Private
 */
exports.cancelLeaveRequest = catchAsync(async (req, res, next) => {
  const leaveRequest = await LeaveRequest.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!leaveRequest) {
    return next(new AppError('Leave request not found', 404));
  }
  
  // Only allow cancellation if pending or approved
  if (!['pending', 'approved'].includes(leaveRequest.status)) {
    return next(new AppError('Cannot cancel leave request in current state', 400));
  }
  
  // Only owner or admin can cancel
  if (leaveRequest.user.toString() !== req.user._id.toString() && !req.user.isSuperAdmin) {
    return next(new AppError('You are not authorized to cancel this request', 403));
  }
  
  leaveRequest.status = 'cancelled';
  leaveRequest.processedBy = req.user._id;
  leaveRequest.processedAt = new Date();
  await leaveRequest.save();
  
  // If it was approved, restore leave balance
  if (leaveRequest.status === 'approved') {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const financialYear = getFinancialYear(leaveRequest.startDate);
      const balance = await LeaveBalance.findOne({
        user: leaveRequest.user,
        organizationId: req.user.organizationId,
        financialYear
      }).session(session);
      
      if (balance) {
        const leaveField = `${leaveRequest.leaveType}Leave`;
        balance[leaveField].used -= leaveRequest.daysCount;
        
        balance.transactions.push({
          leaveType: leaveRequest.leaveType,
          changeType: 'adjusted',
          amount: -leaveRequest.daysCount,
          runningBalance: balance[leaveField].total - balance[leaveField].used,
          referenceId: leaveRequest._id,
          description: 'Leave cancelled',
          processedBy: req.user._id
        });
        
        await balance.save({ session });
      }
      
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Leave request cancelled successfully',
    data: { leaveRequest }
  });
});

// ======================================================
// APPROVAL OPERATIONS
// ======================================================

/**
 * @desc    Approve leave request
 * @route   PATCH /api/v1/leave-requests/:id/approve
 * @access  Private (Approver only)
 */
exports.approveLeaveRequest = catchAsync(async (req, res, next) => {
  const { comments } = req.body;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const leaveRequest = await LeaveRequest.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
      status: 'pending'
    }).session(session);
    
    if (!leaveRequest) {
      return next(new AppError('Pending leave request not found', 404));
    }
    
    // Check if current user is an approver at current level
    const currentApproval = leaveRequest.approvalFlow.find(
      a => a.level === leaveRequest.currentApprovalLevel
    );
    
    if (!currentApproval || currentApproval.approver.toString() !== req.user._id.toString()) {
      return next(new AppError('You are not authorized to approve this request', 403));
    }
    
    // Update approval flow
    currentApproval.status = 'approved';
    currentApproval.comments = comments;
    currentApproval.actionAt = new Date();
    
    // Check if all approvals done
    const nextLevel = leaveRequest.currentApprovalLevel + 1;
    const nextApproval = leaveRequest.approvalFlow.find(a => a.level === nextLevel);
    
    if (!nextApproval) {
      // All approvals done
      leaveRequest.status = 'approved';
      leaveRequest.approvedBy = req.user._id;
      leaveRequest.approvedAt = new Date();
      
      // Deduct from leave balance
      const financialYear = getFinancialYear(leaveRequest.startDate);
      const balance = await LeaveBalance.findOne({
        user: leaveRequest.user,
        organizationId: req.user.organizationId,
        financialYear
      }).session(session);
      
      if (!balance) {
        throw new AppError('Leave balance not found', 404);
      }
      
      const leaveField = `${leaveRequest.leaveType}Leave`;
      
      // Store after balance
      leaveRequest.balanceSnapshot.after = {
        [leaveRequest.leaveType]: balance[leaveField].total - balance[leaveField].used - leaveRequest.daysCount
      };
      
      // Deduct leave
      await balance.debitLeave(
        leaveRequest.leaveType,
        leaveRequest.daysCount,
        leaveRequest._id,
        `Leave approved: ${leaveRequest.leaveRequestId}`,
        req.user._id
      );
      
      // Mark attendance for these dates as 'on_leave'
      for (const impacted of leaveRequest.impactedDates) {
        await AttendanceDaily.findOneAndUpdate(
          {
            user: leaveRequest.user,
            date: impacted.date,
            organizationId: req.user.organizationId
          },
          {
            $set: {
              status: 'on_leave',
              leaveRequestId: leaveRequest._id
            }
          },
          { upsert: true, session }
        );
      }
    } else {
      // Move to next level
      leaveRequest.currentApprovalLevel = nextLevel;
    }
    
    leaveRequest.processedBy = req.user._id;
    leaveRequest.processedAt = new Date();
    await leaveRequest.save({ session });
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      message: nextApproval ? 'Leave request approved, moving to next approver' : 'Leave request fully approved',
      data: { leaveRequest }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Reject leave request
 * @route   PATCH /api/v1/leave-requests/:id/reject
 * @access  Private (Approver only)
 */
exports.rejectLeaveRequest = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  
  if (!reason) {
    return next(new AppError('Please provide rejection reason', 400));
  }
  
  const leaveRequest = await LeaveRequest.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    status: 'pending'
  });
  
  if (!leaveRequest) {
    return next(new AppError('Pending leave request not found', 404));
  }
  
  // Check if current user is an approver
  const isApprover = leaveRequest.approvalFlow.some(
    a => a.approver.toString() === req.user._id.toString()
  );
  
  if (!isApprover && !req.user.isSuperAdmin) {
    return next(new AppError('You are not authorized to reject this request', 403));
  }
  
  leaveRequest.status = 'rejected';
  leaveRequest.rejectionReason = reason;
  leaveRequest.processedBy = req.user._id;
  leaveRequest.processedAt = new Date();
  
  // Update approval flow
  const currentApproval = leaveRequest.approvalFlow.find(
    a => a.level === leaveRequest.currentApprovalLevel
  );
  if (currentApproval) {
    currentApproval.status = 'rejected';
    currentApproval.comments = reason;
    currentApproval.actionAt = new Date();
  }
  
  await leaveRequest.save();
  
  res.status(200).json({
    status: 'success',
    message: 'Leave request rejected',
    data: { leaveRequest }
  });
});

/**
 * @desc    Escalate leave request
 * @route   PATCH /api/v1/leave-requests/:id/escalate
 * @access  Private (Approver only)
 */
exports.escalateLeaveRequest = catchAsync(async (req, res, next) => {
  const { reason, escalateTo } = req.body;
  
  const leaveRequest = await LeaveRequest.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    status: 'pending'
  });
  
  if (!leaveRequest) {
    return next(new AppError('Pending leave request not found', 404));
  }
  
  // Verify escalateTo user exists and is in org
  const targetUser = await User.findOne({
    _id: escalateTo,
    organizationId: req.user.organizationId,
    isActive: true
  });
  
  if (!targetUser) {
    return next(new AppError('Target user for escalation not found', 404));
  }
  
  leaveRequest.status = 'escalated';
  leaveRequest.escalatedAt = new Date();
  leaveRequest.escalatedTo = escalateTo;
  leaveRequest.escalationReason = reason || 'Request escalated';
  leaveRequest.processedBy = req.user._id;
  
  await leaveRequest.save();
  
  res.status(200).json({
    status: 'success',
    message: 'Leave request escalated',
    data: { leaveRequest }
  });
});

// ======================================================
// USER-SPECIFIC OPERATIONS
// ======================================================

/**
 * @desc    Get my leave requests
 * @route   GET /api/v1/leave-requests/my-requests
 * @access  Private
 */
exports.getMyLeaveRequests = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  
  const query = {
    user: req.user._id,
    organizationId: req.user.organizationId
  };
  
  // Filter by status
  if (req.query.status) {
    query.status = req.query.status;
  }
  
  // Filter by date range
  if (req.query.fromDate || req.query.toDate) {
    query.startDate = {};
    if (req.query.fromDate) query.startDate.$gte = new Date(req.query.fromDate);
    if (req.query.toDate) query.startDate.$lte = new Date(req.query.toDate);
  }
  
  const [requests, total] = await Promise.all([
    LeaveRequest.find(query)
      .populate('approvedBy', 'name')
      .populate('approvalFlow.approver', 'name email')
      .skip(skip)
      .limit(limit)
      .sort(req.query.sort || '-createdAt'),
    LeaveRequest.countDocuments(query)
  ]);
  
  res.status(200).json({
    status: 'success',
    results: requests.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { leaveRequests: requests }
  });
});

/**
 * @desc    Get pending approvals for current user
 * @route   GET /api/v1/leave-requests/pending-approvals
 * @access  Private
 */
exports.getPendingApprovals = catchAsync(async (req, res, next) => {
  const requests = await LeaveRequest.find({
    organizationId: req.user.organizationId,
    status: 'pending',
    'approvalFlow': {
      $elemMatch: {
        approver: req.user._id,
        status: 'pending',
        level: { $lte: 5 } // Reasonable max levels
      }
    }
  })
  .populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId avatar')
  .populate('departmentId', 'name')
  .sort({ createdAt: -1 });
  
  // Group by level
  const grouped = requests.reduce((acc, req) => {
    const approval = req.approvalFlow.find(a => 
      a.approver.toString() === req.user._id.toString() && a.status === 'pending'
    );
    const level = approval?.level || 1;
    
    if (!acc[level]) acc[level] = [];
    acc[level].push(req);
    return acc;
  }, {});
  
  res.status(200).json({
    status: 'success',
    total: requests.length,
    data: { 
      grouped,
      requests 
    }
  });
});

/**
 * @desc    Get leave balance summary
 * @route   GET /api/v1/leave-requests/balance-summary
 * @access  Private
 */
exports.getLeaveBalanceSummary = catchAsync(async (req, res, next) => {
  const { financialYear = getFinancialYear() } = req.query;
  
  const balance = await LeaveBalance.findOne({
    user: req.user._id,
    organizationId: req.user.organizationId,
    financialYear
  });
  
  if (!balance) {
    return next(new AppError('Leave balance not found for this financial year', 404));
  }
  
  // Get upcoming leaves
  const upcomingLeaves = await LeaveRequest.find({
    user: req.user._id,
    organizationId: req.user.organizationId,
    status: 'approved',
    startDate: { $gte: new Date() }
  })
  .select('leaveType startDate endDate daysCount')
  .sort('startDate')
  .limit(5);
  
  // Get recent leaves
  const recentLeaves = await LeaveRequest.find({
    user: req.user._id,
    organizationId: req.user.organizationId,
    status: { $in: ['approved', 'rejected', 'cancelled'] }
  })
  .select('leaveType startDate endDate status createdAt')
  .sort('-createdAt')
  .limit(5);
  
  res.status(200).json({
    status: 'success',
    data: {
      financialYear,
      balance: {
        casual: {
          total: balance.casualLeave.total,
          used: balance.casualLeave.used,
          available: balance.casualLeave.total - balance.casualLeave.used
        },
        sick: {
          total: balance.sickLeave.total,
          used: balance.sickLeave.used,
          available: balance.sickLeave.total - balance.sickLeave.used
        },
        earned: {
          total: balance.earnedLeave.total,
          used: balance.earnedLeave.used,
          available: balance.earnedLeave.total - balance.earnedLeave.used
        },
        unpaid: {
          used: balance.unpaidLeave.used
        }
      },
      upcomingLeaves,
      recentLeaves,
      transactions: balance.transactions.slice(-10) // Last 10 transactions
    }
  });
});

// ======================================================
// ADMIN/HR OPERATIONS
// ======================================================

/**
 * @desc    Get team leave calendar
 * @route   GET /api/v1/leave-requests/team-calendar
 * @access  Private (Managers)
 */
exports.getTeamLeaveCalendar = catchAsync(async (req, res, next) => {
  const { month, year } = req.query;
  const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
  const targetYear = year ? parseInt(year) : new Date().getFullYear();
  
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
  
  // Find team members (users reporting to current user)
  const teamMembers = await User.find({
    organizationId: req.user.organizationId,
    'employeeProfile.reportingManagerId': req.user._id,
    isActive: true
  }).select('_id');
  
  const teamMemberIds = teamMembers.map(m => m._id);
  
  // Get leave requests for team
  const leaves = await LeaveRequest.find({
    user: { $in: teamMemberIds },
    organizationId: req.user.organizationId,
    status: 'approved',
    $or: [
      { startDate: { $lte: endDate, $gte: startDate } },
      { endDate: { $lte: endDate, $gte: startDate } },
      {
        startDate: { $lte: startDate },
        endDate: { $gte: endDate }
      }
    ]
  })
  .populate('user', 'name employeeProfile.employeeId avatar')
  .sort('startDate');
  
  // Build calendar
  const calendar = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayLeaves = leaves.filter(leave => {
      const leaveStart = new Date(leave.startDate).toISOString().split('T')[0];
      const leaveEnd = new Date(leave.endDate).toISOString().split('T')[0];
      return dateStr >= leaveStart && dateStr <= leaveEnd;
    });
    
    calendar.push({
      date: new Date(currentDate),
      dayOfWeek: currentDate.getDay(),
      leaves: dayLeaves.map(l => ({
        user: l.user,
        leaveType: l.leaveType,
        leaveRequestId: l.leaveRequestId
      })),
      count: dayLeaves.length
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      month: targetMonth,
      year: targetYear,
      totalTeamMembers: teamMemberIds.length,
      totalLeaves: leaves.length,
      calendar
    }
  });
});

/**
 * @desc    Get leave analytics
 * @route   GET /api/v1/leave-requests/analytics
 * @access  Private (Admin/HR)
 */
exports.getLeaveAnalytics = catchAsync(async (req, res, next) => {
  const { financialYear = getFinancialYear(), departmentId } = req.query;
  
  const matchStage = {
    organizationId: req.user.organizationId,
    status: 'approved'
  };
  
  if (financialYear) {
    const [startYear] = financialYear.split('-');
    const startDate = new Date(parseInt(startYear), 3, 1); // April 1st
    const endDate = new Date(parseInt(startYear) + 1, 2, 31); // March 31st next year
    
    matchStage.startDate = { $gte: startDate, $lte: endDate };
  }
  
  // Filter by department if specified
  if (departmentId) {
    matchStage.departmentId = mongoose.Types.ObjectId(departmentId);
  }
  
  const analytics = await LeaveRequest.aggregate([
    { $match: matchStage },
    {
      $facet: {
        // By leave type
        byLeaveType: [
          {
            $group: {
              _id: '$leaveType',
              count: { $sum: 1 },
              totalDays: { $sum: '$daysCount' },
              avgDays: { $avg: '$daysCount' }
            }
          }
        ],
        
        // By month
        byMonth: [
          {
            $group: {
              _id: { $month: '$startDate' },
              count: { $sum: 1 },
              totalDays: { $sum: '$daysCount' }
            }
          },
          { $sort: { '_id': 1 } }
        ],
        
        // By department
        byDepartment: [
          {
            $group: {
              _id: '$departmentId',
              count: { $sum: 1 },
              totalDays: { $sum: '$daysCount' }
            }
          },
          {
            $lookup: {
              from: 'departments',
              localField: '_id',
              foreignField: '_id',
              as: 'department'
            }
          },
          { $unwind: '$department' }
        ],
        
        // Overall stats
        overall: [
          {
            $group: {
              _id: null,
              totalRequests: { $sum: 1 },
              totalLeaveDays: { $sum: '$daysCount' },
              avgLeaveDays: { $avg: '$daysCount' },
              maxLeaveDays: { $max: '$daysCount' }
            }
          }
        ]
      }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: {
      financialYear,
      analytics: analytics[0]
    }
  });
});

/**
 * @desc    Bulk approve leave requests
 * @route   POST /api/v1/leave-requests/bulk-approve
 * @access  Private (Admin/HR)
 */
exports.bulkApproveLeaves = catchAsync(async (req, res, next) => {
  const { requestIds, comments } = req.body;
  
  if (!requestIds || !requestIds.length) {
    return next(new AppError('Please provide leave request IDs', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = {
      approved: [],
      failed: []
    };
    
    for (const requestId of requestIds) {
      try {
        const leaveRequest = await LeaveRequest.findOne({
          _id: requestId,
          organizationId: req.user.organizationId,
          status: 'pending'
        }).session(session);
        
        if (!leaveRequest) {
          results.failed.push({ id: requestId, reason: 'Not found or already processed' });
          continue;
        }
        
        // Check if user is approver
        const isApprover = leaveRequest.approvalFlow.some(
          a => a.approver.toString() === req.user._id.toString()
        );
        
        if (!isApprover && !req.user.isSuperAdmin) {
          results.failed.push({ id: requestId, reason: 'Not authorized' });
          continue;
        }
        
        // Update approval flow
        const currentApproval = leaveRequest.approvalFlow.find(
          a => a.level === leaveRequest.currentApprovalLevel
        );
        
        if (currentApproval) {
          currentApproval.status = 'approved';
          currentApproval.comments = comments;
          currentApproval.actionAt = new Date();
        }
        
        // Check if this is final approval
        const nextLevel = leaveRequest.currentApprovalLevel + 1;
        const nextApproval = leaveRequest.approvalFlow.find(a => a.level === nextLevel);
        
        if (!nextApproval) {
          // Final approval
          leaveRequest.status = 'approved';
          leaveRequest.approvedBy = req.user._id;
          leaveRequest.approvedAt = new Date();
          
          // Deduct from balance
          const financialYear = getFinancialYear(leaveRequest.startDate);
          const balance = await LeaveBalance.findOne({
            user: leaveRequest.user,
            organizationId: req.user.organizationId,
            financialYear
          }).session(session);
          
          if (balance) {
            await balance.debitLeave(
              leaveRequest.leaveType,
              leaveRequest.daysCount,
              leaveRequest._id,
              `Bulk approved: ${leaveRequest.leaveRequestId}`,
              req.user._id
            );
          }
        } else {
          leaveRequest.currentApprovalLevel = nextLevel;
        }
        
        leaveRequest.processedBy = req.user._id;
        leaveRequest.processedAt = new Date();
        await leaveRequest.save({ session });
        
        results.approved.push(leaveRequest);
      } catch (error) {
        results.failed.push({ id: requestId, reason: error.message });
      }
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: results
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});