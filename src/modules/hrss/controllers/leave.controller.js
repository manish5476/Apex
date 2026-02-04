const catchAsync = require('../../core/utils/catchAsync');
const AppError = require('../../core/utils/appError');
const LeaveRequest = require('../models/leave.model');
const User = require('../../../modules/auth/core/user.model');
const AttendanceDaily = require('../models/attendance/attendanceDaily.model');
const dayjs = require('dayjs');
const mongoose = require('mongoose');

class LeaveController {
  
  /**
   * Create leave request
   */
  createLeave = catchAsync(async (req, res, next) => {
    const {
      leaveType,
      startDate,
      endDate,
      isHalfDay,
      halfDayType,
      reason,
      contactDuringLeave,
      handoverTo,
      supportingDocs
    } = req.body;
    
    // Validate dates
    if (!dayjs(startDate, 'YYYY-MM-DD', true).isValid() || 
        !dayjs(endDate, 'YYYY-MM-DD', true).isValid()) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }
    
    if (dayjs(startDate).isAfter(dayjs(endDate))) {
      throw new AppError('Start date cannot be after end date', 400);
    }
    
    // Check for overlapping leaves
    const overlappingLeave = await LeaveRequest.findOne({
      user: req.user._id,
      status: { $in: ['pending', 'approved'] },
      $or: [
        { startDate: { $lte: endDate }, endDate: { $gte: startDate } }
      ]
    });
    
    if (overlappingLeave) {
      throw new AppError('You already have a leave request for these dates', 400);
    }
    
    // Calculate days count
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const diffDays = end.diff(start, 'day') + 1;
    const daysCount = isHalfDay ? diffDays * 0.5 : diffDays;
    
    // Check leave balance (implement your own logic)
    const leaveBalance = await this.checkLeaveBalance(req.user._id, leaveType, daysCount);
    if (!leaveBalance.hasBalance) {
      throw new AppError(`Insufficient ${leaveType} leave balance`, 400);
    }
    
    // Get approval chain
    const approvalChain = await this.getApprovalChain(req.user);
    
    const leave = await LeaveRequest.create({
      user: req.user._id,
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      leaveType,
      startDate,
      endDate,
      isHalfDay,
      halfDayType,
      daysCount,
      reason,
      contactDuringLeave,
      handoverTo,
      supportingDocs,
      approvers: approvalChain,
      approvalRequired: approvalChain.length,
      leaveBalanceBefore: leaveBalance.balance,
      leaveBalanceAfter: leaveBalance.balance - daysCount,
      history: [{
        action: 'created',
        by: req.user._id,
        remarks: 'Leave request submitted'
      }]
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Leave request submitted successfully',
      data: leave
    });
  });
  
  /**
   * Get my leaves
   */
  getMyLeaves = catchAsync(async (req, res, next) => {
    const { 
      status, 
      year, 
      leaveType, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    const filter = { 
      user: req.user._id,
      organizationId: req.user.organizationId 
    };
    
    if (status) filter.status = status;
    if (leaveType) filter.leaveType = leaveType;
    if (year) {
      filter.startDate = { $regex: `^${year}` };
    }
    
    const skip = (page - 1) * limit;
    
    const [leaves, total] = await Promise.all([
      LeaveRequest.find(filter)
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('approvedBy', 'name email')
        .populate('handoverTo', 'name email')
        .lean(),
      LeaveRequest.countDocuments(filter)
    ]);
    
    // Calculate leave balances
    const balances = await this.calculateLeaveBalances(req.user._id);
    
    res.status(200).json({
      status: 'success',
      results: leaves.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      balances,
      data: leaves
    });
  });
  
  /**
   * Get all leaves (for managers/admins)
   */
  getAllLeaves = catchAsync(async (req, res, next) => {
    const { 
      status, 
      department, 
      branchId, 
      startDate, 
      endDate,
      page = 1, 
      limit = 50 
    } = req.query;
    
    const filter = { 
      organizationId: req.user.organizationId 
    };
    
    if (status) filter.status = status;
    if (branchId) filter.branchId = branchId;
    if (startDate && endDate) {
      filter.startDate = { $gte: startDate, $lte: endDate };
    }
    
    // Department filter
    if (department) {
      const users = await User.find({ 
        department, 
        organizationId: req.user.organizationId 
      }).select('_id');
      filter.user = { $in: users.map(u => u._id) };
    }
    
    // For managers, only show their team's leaves
    if (req.user.role === 'manager') {
      const teamMembers = await User.find({ 
        manager: req.user._id 
      }).select('_id');
      filter.user = { $in: teamMembers.map(u => u._id) };
    }
    
    const skip = (page - 1) * limit;
    
    const [leaves, total] = await Promise.all([
      LeaveRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user', 'name email department position avatar')
        .populate('approvedBy', 'name email')
        .lean(),
      LeaveRequest.countDocuments(filter)
    ]);
    
    res.status(200).json({
      status: 'success',
      results: leaves.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: leaves
    });
  });
  
  /**
   * Get pending leaves for approval
   */
  getPendingLeaves = catchAsync(async (req, res, next) => {
    const filter = {
      organizationId: req.user.organizationId,
      status: { $in: ['pending', 'under_review'] },
      'approvers.user': req.user._id,
      'approvers.status': 'pending'
    };
    
    const leaves = await LeaveRequest.find(filter)
      .populate('user', 'name email department position avatar')
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();
    
    res.status(200).json({
      status: 'success',
      results: leaves.length,
      data: leaves
    });
  });
  
  /**
   * Process leave (approve/reject)
   */
  processLeave = catchAsync(async (req, res, next) => {
    const { status, comments, rejectionReason } = req.body;
    
    if (!['approved', 'rejected', 'forwarded'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const leave = await LeaveRequest.findById(req.params.id).session(session);
      if (!leave) {
        throw new AppError('Leave request not found', 404);
      }
      
      if (!['pending', 'under_review'].includes(leave.status)) {
        throw new AppError('Leave request already processed', 400);
      }
      
      // Check if user is an approver
      const approverIndex = leave.approvers.findIndex(
        a => String(a.user) === String(req.user._id)
      );
      
      if (approverIndex === -1 && !['admin', 'owner'].includes(req.user.role)) {
        throw new AppError('You are not authorized to approve this leave', 403);
      }
      
      // Update approver status
      if (approverIndex !== -1) {
        leave.approvers[approverIndex].status = status;
        leave.approvers[approverIndex].comments = comments;
        leave.approvers[approverIndex].actedAt = new Date();
      }
      
      // Check approval status
      const pendingApprovers = leave.approvers.filter(a => a.status === 'pending');
      const rejectedApprover = leave.approvers.find(a => a.status === 'rejected');
      const forwardedApprover = leave.approvers.find(a => a.status === 'forwarded');
      
      if (rejectedApprover) {
        leave.status = 'rejected';
        leave.rejectionReason = rejectionReason || comments;
      } else if (forwardedApprover) {
        leave.status = 'under_review';
        leave.currentApprover = leave.currentApprover + 1;
      } else if (pendingApprovers.length === 0) {
        leave.status = 'approved';
        leave.approvedBy = req.user._id;
        leave.approvedAt = new Date();
        
        // Update attendance records
        await this.updateAttendanceForLeave(leave, session);
      } else {
        leave.status = 'under_review';
      }
      
      // Add to history
      leave.history.push({
        action: status,
        by: req.user._id,
        remarks: comments,
        oldStatus: leave.status,
        newStatus: status
      });
      
      await leave.save({ session });
      await session.commitTransaction();
      
      // Send notifications
      await this.sendLeaveNotification(leave, status);
      
      res.status(200).json({
        status: 'success',
        message: `Leave request ${status}`,
        data: leave
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  });
  
  /**
   * Cancel leave
   */
  cancelLeave = catchAsync(async (req, res, next) => {
    const leave = await LeaveRequest.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: { $in: ['pending', 'approved'] }
    });
    
    if (!leave) {
      throw new AppError('Leave request not found or cannot be cancelled', 404);
    }
    
    // Cannot cancel if already started
    if (leave.status === 'approved' && dayjs().isAfter(dayjs(leave.startDate))) {
      throw new AppError('Cannot cancel leave that has already started', 400);
    }
    
    leave.status = 'cancelled';
    leave.cancelledBy = req.user._id;
    leave.cancelledAt = new Date();
    
    // If approved, revert attendance records
    if (leave.attendanceOverrideIds && leave.attendanceOverrideIds.length > 0) {
      await AttendanceDaily.updateMany(
        { _id: { $in: leave.attendanceOverrideIds } },
        { status: 'absent', leaveRequestId: null }
      );
    }
    
    await leave.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Leave request cancelled',
      data: leave
    });
  });
  
  /**
   * Get leave balance
   */
  getLeaveBalance = catchAsync(async (req, res, next) => {
    const balances = await this.calculateLeaveBalances(req.user._id);
    
    res.status(200).json({
      status: 'success',
      data: balances
    });
  });
  
  /**
   * Get leave calendar
   */
  getLeaveCalendar = catchAsync(async (req, res, next) => {
    const { year, month, department, branchId } = req.query;
    
    const filter = {
      organizationId: req.user.organizationId,
      status: 'approved'
    };
    
    if (year && month) {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
      filter.startDate = { $lte: endDate };
      filter.endDate = { $gte: startDate };
    }
    
    if (department) {
      const users = await User.find({ department }).select('_id');
      filter.user = { $in: users.map(u => u._id) };
    }
    
    if (branchId) filter.branchId = branchId;
    
    const leaves = await LeaveRequest.find(filter)
      .populate('user', 'name email department avatar')
      .select('user startDate endDate leaveType isHalfDay')
      .lean();
    
    // Format for calendar
    const calendar = {};
    leaves.forEach(leave => {
      const start = dayjs(leave.startDate);
      const end = dayjs(leave.endDate);
      let current = start;
      
      while (current <= end) {
        const dateStr = current.format('YYYY-MM-DD');
        if (!calendar[dateStr]) {
          calendar[dateStr] = [];
        }
        
        calendar[dateStr].push({
          userId: leave.user._id,
          userName: leave.user.name,
          department: leave.user.department,
          leaveType: leave.leaveType,
          isHalfDay: leave.isHalfDay
        });
        
        current = current.add(1, 'day');
      }
    });
    
    res.status(200).json({
      status: 'success',
      data: calendar
    });
  });
  
  /**
   * Helper: Calculate leave balances
   */
  async calculateLeaveBalances(userId) {
    // This is a simplified version. Implement based on your policy
    const user = await User.findById(userId);
    
    // Get leave accruals (from HR policy)
    const policy = {
      casual: 12, // days per year
      sick: 12,
      earned: 15,
      maternity: 180,
      paternity: 15
    };
    
    // Get used leaves
    const currentYear = dayjs().year();
    const usedLeaves = await LeaveRequest.aggregate([
      {
        $match: {
          user: user._id,
          status: 'approved',
          leaveType: { $in: ['casual', 'sick', 'earned'] },
          startDate: { $regex: `^${currentYear}` }
        }
      },
      {
        $group: {
          _id: '$leaveType',
          totalDays: { $sum: '$daysCount' }
        }
      }
    ]);
    
    // Calculate balances
    const balances = {};
    Object.keys(policy).forEach(type => {
      const used = usedLeaves.find(u => u._id === type);
      balances[type] = {
        allotted: policy[type],
        used: used ? used.totalDays : 0,
        balance: policy[type] - (used ? used.totalDays : 0)
      };
    });
    
    return balances;
  }
  
  /**
   * Helper: Get approval chain
   */
  async getApprovalChain(user) {
    const chain = [];
    
    // Immediate manager
    if (user.manager) {
      chain.push({
        user: user.manager._id,
        role: 'manager',
        status: 'pending',
        order: 1
      });
    }
    
    // HR approval for certain leave types
    const hrUser = await User.findOne({
      organizationId: user.organizationId,
      role: 'hr'
    });
    
    if (hrUser) {
      chain.push({
        user: hrUser._id,
        role: 'hr',
        status: 'pending',
        order: 2
      });
    }
    
    return chain;
  }
  
  /**
   * Helper: Check leave balance
   */
  async checkLeaveBalance(userId, leaveType, requestedDays) {
    const balances = await this.calculateLeaveBalances(userId);
    const balance = balances[leaveType]?.balance || 0;
    
    return {
      hasBalance: balance >= requestedDays,
      balance: balance,
      requested: requestedDays
    };
  }
  
  /**
   * Helper: Update attendance for approved leave
   */
  async updateAttendanceForLeave(leave, session) {
    const start = dayjs(leave.startDate);
    const end = dayjs(leave.endDate);
    let current = start;
    const attendanceIds = [];
    
    while (current <= end) {
      const dateStr = current.format('YYYY-MM-DD');
      
      let daily = await AttendanceDaily.findOne({
        user: leave.user,
        date: dateStr
      }).session(session);
      
      if (!daily) {
        daily = new AttendanceDaily({
          user: leave.user,
          organizationId: leave.organizationId,
          branchId: leave.branchId,
          date: dateStr,
          status: 'on_leave',
          leaveRequestId: leave._id,
          payoutMultiplier: leave.leaveType === 'unpaid' ? 0 : 1
        });
      } else {
        daily.status = 'on_leave';
        daily.leaveRequestId = leave._id;
        daily.payoutMultiplier = leave.leaveType === 'unpaid' ? 0 : 1;
      }
      
      await daily.save({ session });
      attendanceIds.push(daily._id);
      
      current = current.add(1, 'day');
    }
    
    // Save attendance IDs to leave record
    leave.attendanceOverrideIds = attendanceIds;
    await leave.save({ session });
  }
  
  /**
   * Helper: Send leave notification
   */
  async sendLeaveNotification(leave, action) {
    // Implement your notification logic (email, push, etc.)
    console.log(`Leave ${action}: ${leave._id}`);
  }
}

module.exports = new LeaveController();