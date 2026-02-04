const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');
const AttendanceRequest = require('../../models/attendance/attendanceRequest.model');
const AttendanceDaily = require('../../models/attendance/attendanceDaily.model');
const AttendanceLog = require('../../models/attendance/attendanceLog.model');
const User = require('../../../../modules/auth/core/user.model');
const mongoose = require('mongoose');
const dayjs = require('dayjs');

class RequestController {
  
  /**
   * Get my attendance requests
   */
  getMyRequests = catchAsync(async (req, res, next) => {
    const { 
      status, 
      startDate, 
      endDate, 
      type,
      page = 1, 
      limit = 20 
    } = req.query;
    
    const filter = { 
      user: req.user._id,
      organizationId: req.user.organizationId 
    };
    
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (startDate && endDate) {
      filter.targetDate = { $gte: startDate, $lte: endDate };
    }
    
    const skip = (page - 1) * limit;
    
    const [requests, total] = await Promise.all([
      AttendanceRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('approvedBy', 'name email')
        .populate({
          path: 'approvers.user',
          select: 'name email role'
        })
        .lean(),
      AttendanceRequest.countDocuments(filter)
    ]);
    
    // Get pending count for badges
    const pendingCount = await AttendanceRequest.countDocuments({
      ...filter,
      status: { $in: ['pending', 'under_review'] }
    });
    
    res.status(200).json({
      status: 'success',
      results: requests.length,
      total,
      pendingCount,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: requests
    });
  });
  
  /**
   * Get pending requests for approval
   */
  getPendingRequests = catchAsync(async (req, res, next) => {
    const { 
      branchId, 
      department, 
      startDate, 
      endDate, 
      type,
      priority,
      page = 1, 
      limit = 50 
    } = req.query;
    
    const filter = {
      organizationId: req.user.organizationId,
      status: { $in: ['pending', 'under_review'] }
    };
    
    if (branchId) filter.branchId = branchId;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;
    if (startDate && endDate) {
      filter.targetDate = { $gte: startDate, $lte: endDate };
    }
    
    // Check user role for filtering
    const isAdminOrOwner = ['admin', 'owner'].includes(req.user.role);
    const isSuperAdmin = req.user.isSuperAdmin;
    
    if (!isAdminOrOwner && !isSuperAdmin) {
      // For managers, only show requests where they are approvers
      filter['approvers.user'] = req.user._id;
      filter['approvers.status'] = 'pending';
    }
    
    // Department filter
    if (department) {
      const users = await User.find({ 
        department, 
        organizationId: req.user.organizationId 
      }).select('_id');
      filter.user = { $in: users.map(u => u._id) };
    }
    
    const skip = (page - 1) * limit;
    
    const [requests, total] = await Promise.all([
      AttendanceRequest.find(filter)
        .sort({ 
          isOverdue: -1, 
          priority: -1, 
          createdAt: 1 
        })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user', 'name email avatar department position')
        .populate({
          path: 'approvers.user',
          select: 'name email role'
        })
        .lean(),
      AttendanceRequest.countDocuments(filter)
    ]);
    
    // Calculate statistics
    const stats = {
      total,
      overdue: await AttendanceRequest.countDocuments({
        ...filter,
        isOverdue: true
      }),
      highPriority: await AttendanceRequest.countDocuments({
        ...filter,
        priority: 'high'
      }),
      critical: await AttendanceRequest.countDocuments({
        ...filter,
        priority: 'critical'
      })
    };
    
    res.status(200).json({
      status: 'success',
      results: requests.length,
      stats,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: requests
    });
  });
  
  /**
   * Get request by ID
   */
  getRequestById = catchAsync(async (req, res, next) => {
    const request = await AttendanceRequest.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    })
      .populate('user', 'name email avatar department position employeeId')
      .populate('approvedBy', 'name email')
      .populate('cancelledBy', 'name email')
      .populate({
        path: 'approvers.user',
        select: 'name email role avatar'
      })
      .populate({
        path: 'linkedAttendanceIds',
        select: 'date firstIn lastOut totalWorkHours status'
      })
      .populate({
        path: 'linkedLogIds',
        select: 'timestamp type source location'
      });
    
    if (!request) {
      throw new AppError('Request not found', 404);
    }
    
    // Check permission
    const canView = 
      String(request.user._id) === String(req.user._id) ||
      request.approvers.some(a => String(a.user._id) === String(req.user._id)) ||
      ['admin', 'owner', 'hr'].includes(req.user.role);
    
    if (!canView) {
      throw new AppError('You are not authorized to view this request', 403);
    }
    
    res.status(200).json({
      status: 'success',
      data: request
    });
  });
  
  /**
   * Approve/Reject request
   */
  decideRegularization = catchAsync(async (req, res, next) => {
    const { status, comments, rejectionReason, forwardTo } = req.body;
    
    if (!['approved', 'rejected', 'forwarded'].includes(status)) {
      throw new AppError('Invalid status. Use "approved", "rejected", or "forwarded"', 400);
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const request = await AttendanceRequest.findById(req.params.id).session(session);
      if (!request) {
        throw new AppError('Request not found', 404);
      }
      
      if (!['pending', 'under_review'].includes(request.status)) {
        throw new AppError('Request already processed', 400);
      }
      
      // Check permission
      const canApprove = this.checkApprovalPermission(request, req.user);
      if (!canApprove) {
        throw new AppError('You are not authorized to approve this request', 403);
      }
      
      // Update approver status
      const approverIndex = request.approvers.findIndex(
        a => String(a.user) === String(req.user._id)
      );
      
      if (approverIndex !== -1) {
        request.approvers[approverIndex].status = status;
        request.approvers[approverIndex].comments = comments;
        request.approvers[approverIndex].actedAt = new Date();
      } else if (['admin', 'owner'].includes(req.user.role)) {
        // Admin override
        request.approvers.push({
          user: req.user._id,
          role: req.user.role,
          status: status,
          comments: comments,
          actedAt: new Date(),
          isMandatory: false,
          order: 999
        });
      }
      
      // Handle forwarding
      if (status === 'forwarded' && forwardTo) {
        const forwardUser = await User.findOne({
          _id: forwardTo,
          organizationId: request.organizationId
        }).session(session);
        
        if (forwardUser) {
          request.approvers.push({
            user: forwardUser._id,
            role: forwardUser.role,
            status: 'pending',
            comments: `Forwarded by ${req.user.name}: ${comments}`,
            order: request.approvers.length + 1
          });
          request.approvalRequired += 1;
        }
      }
      
      // Check approval status
      const pendingApprovers = request.approvers.filter(a => a.status === 'pending');
      const rejectedApprover = request.approvers.find(a => a.status === 'rejected');
      const mandatoryApprovers = request.approvers.filter(a => a.isMandatory);
      const approvedMandatory = mandatoryApprovers.every(a => a.status === 'approved');
      
      if (rejectedApprover) {
        request.status = 'rejected';
        request.rejectionReason = rejectionReason || comments || 'Rejected by approver';
      } else if (pendingApprovers.length === 0 && approvedMandatory) {
        request.status = 'approved';
        request.approvedBy = req.user._id;
        request.approvedAt = new Date();
        
        // Apply corrections
        await this.applyRequestCorrections(request, session);
      } else {
        request.status = 'under_review';
        request.currentApproverLevel = request.currentApproverLevel + 1;
      }
      
      // Add to history
      request.addHistory(
        status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'forwarded',
        req.user._id,
        comments,
        { forwardTo }
      );
      
      await request.save({ session });
      await session.commitTransaction();
      
      // Send notifications
      await this.sendRequestNotification(request, status);
      
      res.status(200).json({
        status: 'success',
        message: `Request ${request.status}`,
        data: request
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  });
  
  /**
   * Cancel request
   */
  cancelRequest = catchAsync(async (req, res, next) => {
    const request = await AttendanceRequest.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: { $in: ['draft', 'pending'] }
    });
    
    if (!request) {
      throw new AppError('Request not found or cannot be cancelled', 404);
    }
    
    request.status = 'cancelled';
    request.cancelledBy = req.user._id;
    request.cancelledAt = new Date();
    request.addHistory('cancelled', req.user._id, 'Request cancelled by user');
    
    await request.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Request cancelled successfully',
      data: request
    });
  });
  
  /**
   * Get request statistics
   */
  getRequestStats = catchAsync(async (req, res, next) => {
    const { startDate, endDate, branchId, department } = req.query;
    
    const filter = {
      organizationId: req.user.organizationId,
      createdAt: {
        $gte: startDate ? new Date(startDate) : dayjs().startOf('month').toDate(),
        $lte: endDate ? new Date(endDate) : new Date()
      }
    };
    
    if (branchId) filter.branchId = branchId;
    
    // Department filter
    if (department) {
      const users = await User.find({ 
        department, 
        organizationId: req.user.organizationId 
      }).select('_id');
      filter.user = { $in: users.map(u => u._id) };
    }
    
    const stats = await AttendanceRequest.aggregate([
      { $match: filter },
      {
        $facet: {
          // Status breakdown
          statusStats: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ],
          // Type breakdown
          typeStats: [
            {
              $group: {
                _id: '$type',
                count: { $sum: 1 }
              }
            }
          ],
          // Priority breakdown
          priorityStats: [
            {
              $group: {
                _id: '$priority',
                count: { $sum: 1 }
              }
            }
          ],
          // Monthly trend
          monthlyTrend: [
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' }
                },
                count: { $sum: 1 },
                approved: {
                  $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                },
                rejected: {
                  $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
                }
              }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
          ],
          // Average response time
          responseTime: [
            {
              $match: {
                status: { $in: ['approved', 'rejected'] },
                responseTime: { $exists: true }
              }
            },
            {
              $group: {
                _id: null,
                avgResponseTime: { $avg: '$responseTime' },
                minResponseTime: { $min: '$responseTime' },
                maxResponseTime: { $max: '$responseTime' }
              }
            }
          ],
          // Overdue requests
          overdueStats: [
            {
              $match: {
                status: { $in: ['pending', 'under_review'] },
                isOverdue: true
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);
    
    // Format response
    const formattedStats = {
      period: {
        startDate: filter.createdAt.$gte,
        endDate: filter.createdAt.$lte
      },
      status: stats[0].statusStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      types: stats[0].typeStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      priorities: stats[0].priorityStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      monthlyTrend: stats[0].monthlyTrend.map(item => ({
        period: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
        total: item.count,
        approved: item.approved,
        rejected: item.rejected,
        approvalRate: item.count > 0 ? (item.approved / item.count) * 100 : 0
      })),
      responseTime: stats[0].responseTime[0] || {
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0
      },
      overdue: stats[0].overdueStats[0]?.count || 0
    };
    
    res.status(200).json({
      status: 'success',
      data: formattedStats
    });
  });
  
  /**
   * Bulk approve/reject requests
   */
  bulkProcessRequests = catchAsync(async (req, res, next) => {
    const { requestIds, status, comments, rejectionReason } = req.body;
    
    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      throw new AppError('Please provide request IDs', 400);
    }
    
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const results = {
        processed: 0,
        failed: 0,
        details: []
      };
      
      for (const requestId of requestIds) {
        try {
          const request = await AttendanceRequest.findById(requestId).session(session);
          
          if (!request || 
              request.organizationId.toString() !== req.user.organizationId.toString() ||
              !['pending', 'under_review'].includes(request.status)) {
            results.failed++;
            results.details.push({
              requestId,
              status: 'skipped',
              reason: 'Invalid request or already processed'
            });
            continue;
          }
          
          // Check permission
          const canApprove = this.checkApprovalPermission(request, req.user);
          if (!canApprove) {
            results.failed++;
            results.details.push({
              requestId,
              status: 'skipped',
              reason: 'Unauthorized'
            });
            continue;
          }
          
          // Update request
          request.status = status;
          request.approvedBy = req.user._id;
          request.approvedAt = new Date();
          
          if (status === 'rejected') {
            request.rejectionReason = rejectionReason || comments || 'Bulk rejected';
          } else {
            // Apply corrections for approved requests
            await this.applyRequestCorrections(request, session);
          }
          
          request.addHistory(
            status === 'approved' ? 'bulk_approved' : 'bulk_rejected',
            req.user._id,
            `Bulk processed: ${comments}`
          );
          
          await request.save({ session });
          
          results.processed++;
          results.details.push({
            requestId,
            status: 'processed'
          });
          
        } catch (error) {
          results.failed++;
          results.details.push({
            requestId,
            status: 'failed',
            reason: error.message
          });
        }
      }
      
      await session.commitTransaction();
      
      res.status(200).json({
        status: 'success',
        message: `Processed ${results.processed} requests, ${results.failed} failed`,
        data: results
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  });
  
  /**
   * Helper: Check approval permission
   */
  checkApprovalPermission(request, user) {
    // Admin/Owner can approve anything
    if (['admin', 'owner'].includes(user.role)) {
      return true;
    }
    
    // Check if user is in approvers list and has pending status
    const isApprover = request.approvers.some(
      a => String(a.user) === String(user._id) && a.status === 'pending'
    );
    
    // Check if user is the requestor's manager
    const isManager = String(request.user) === String(user._id) && user.manager;
    
    return isApprover || isManager;
  }
  
  /**
   * Helper: Apply request corrections
   */
  async applyRequestCorrections(request, session) {
    const linkedAttendanceIds = [];
    
    switch (request.type) {
      case 'missed_punch':
      case 'correction':
        await this.applyTimeCorrection(request, session, linkedAttendanceIds);
        break;
        
      case 'work_from_home':
        await this.applyWFHCorrection(request, session, linkedAttendanceIds);
        break;
        
      case 'on_duty':
        await this.applyOnDutyCorrection(request, session, linkedAttendanceIds);
        break;
        
      case 'leave_reversal':
        await this.applyLeaveReversal(request, session, linkedAttendanceIds);
        break;
    }
    
    // Save linked attendance IDs
    request.linkedAttendanceIds = linkedAttendanceIds;
  }
  
  /**
   * Helper: Apply time correction
   */
  async applyTimeCorrection(request, session, linkedAttendanceIds) {
    let daily = await AttendanceDaily.findOne({
      user: request.user,
      date: request.targetDate
    }).session(session);
    
    if (!daily) {
      daily = new AttendanceDaily({
        user: request.user,
        organizationId: request.organizationId,
        branchId: request.branchId,
        date: request.targetDate,
        status: 'present',
        verifiedBy: request.approvedBy,
        verifiedAt: new Date()
      });
    }
    
    // Store old values for audit
    if (request.correction) {
      request.correction.oldFirstIn = daily.firstIn;
      request.correction.oldLastOut = daily.lastOut;
    }
    
    // Apply corrections
    if (request.correction.newFirstIn) {
      daily.firstIn = request.correction.newFirstIn;
      
      // Create correction log
      const log = new AttendanceLog({
        source: 'admin_manual',
        user: request.user,
        organizationId: request.organizationId,
        branchId: request.branchId,
        timestamp: request.correction.newFirstIn,
        type: 'in',
        isVerified: true,
        verificationMethod: 'manager',
        verifiedBy: request.approvedBy,
        processingStatus: 'corrected',
        processingNotes: `Corrected via request ${request._id}: ${request.correction.reason}`,
        attendanceRequestId: request._id
      });
      
      await log.save({ session });
      daily.logs.push(log._id);
      request.linkedLogIds.push(log._id);
    }
    
    if (request.correction.newLastOut) {
      daily.lastOut = request.correction.newLastOut;
      
      const log = new AttendanceLog({
        source: 'admin_manual',
        user: request.user,
        organizationId: request.organizationId,
        branchId: request.branchId,
        timestamp: request.correction.newLastOut,
        type: 'out',
        isVerified: true,
        verificationMethod: 'manager',
        verifiedBy: request.approvedBy,
        processingStatus: 'corrected',
        processingNotes: `Corrected via request ${request._id}: ${request.correction.reason}`,
        attendanceRequestId: request._id
      });
      
      await log.save({ session });
      daily.logs.push(log._id);
      request.linkedLogIds.push(log._id);
    }
    
    // Recalculate hours
    if (daily.firstIn && daily.lastOut) {
      const diffMs = new Date(daily.lastOut) - new Date(daily.firstIn);
      daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
    }
    
    await daily.save({ session });
    linkedAttendanceIds.push(daily._id);
  }
  
  /**
   * Helper: Apply WFH correction
   */
  async applyWFHCorrection(request, session, linkedAttendanceIds) {
    let daily = await AttendanceDaily.findOne({
      user: request.user,
      date: request.targetDate
    }).session(session);
    
    if (!daily) {
      daily = new AttendanceDaily({
        user: request.user,
        organizationId: request.organizationId,
        branchId: request.branchId,
        date: request.targetDate,
        status: 'work_from_home',
        remarks: request.correction?.reason || 'Work from home approved',
        verifiedBy: request.approvedBy,
        verifiedAt: new Date()
      });
    } else {
      daily.status = 'work_from_home';
      daily.remarks = request.correction?.reason || 'Work from home approved';
      daily.verifiedBy = request.approvedBy;
      daily.verifiedAt = new Date();
    }
    
    await daily.save({ session });
    linkedAttendanceIds.push(daily._id);
  }
  
  /**
   * Helper: Apply on-duty correction
   */
  async applyOnDutyCorrection(request, session, linkedAttendanceIds) {
    let daily = await AttendanceDaily.findOne({
      user: request.user,
      date: request.targetDate
    }).session(session);
    
    if (!daily) {
      daily = new AttendanceDaily({
        user: request.user,
        organizationId: request.organizationId,
        branchId: request.branchId,
        date: request.targetDate,
        status: 'on_duty',
        remarks: request.correction?.reason || 'On duty approved',
        verifiedBy: request.approvedBy,
        verifiedAt: new Date()
      });
    } else {
      daily.status = 'on_duty';
      daily.remarks = request.correction?.reason || 'On duty approved';
      daily.verifiedBy = request.approvedBy;
      daily.verifiedAt = new Date();
    }
    
    await daily.save({ session });
    linkedAttendanceIds.push(daily._id);
  }
  
  /**
   * Helper: Apply leave reversal
   */
  async applyLeaveReversal(request, session, linkedAttendanceIds) {
    const daily = await AttendanceDaily.findOne({
      user: request.user,
      date: request.targetDate,
      status: 'on_leave'
    }).session(session);
    
    if (daily) {
      daily.status = 'present';
      daily.leaveRequestId = null;
      daily.remarks = request.correction?.reason || 'Leave reversal approved';
      daily.verifiedBy = request.approvedBy;
      daily.verifiedAt = new Date();
      
      await daily.save({ session });
      linkedAttendanceIds.push(daily._id);
    }
  }
  
  /**
   * Helper: Send request notification
   */
  async sendRequestNotification(request, action) {
    // Implement notification logic (email, push, socket, etc.)
    console.log(`Request ${request._id} ${action} by ${request.approvedBy}`);
  }
}

module.exports = new RequestController();