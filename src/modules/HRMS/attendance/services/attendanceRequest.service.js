const mongoose = require('mongoose');
const repo = require('../repository/attendanceRequest.repository');
const AttendanceDaily = require('../models/attendanceDaily.model');
const AppError = require('../../../../core/utils/api/appError');
const { startOfDay, endOfDay } = require('../../../../core/utils/dateHelpers');

class AttendanceRequestService {

  _calculateWorkHours(firstIn, lastOut) {
    if (!firstIn || !lastOut) return 0;
    const diffMs = new Date(lastOut) - new Date(firstIn);
    return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
  }

  async createRequest(orgId, user, payload) {
    // 1. Prevent Duplicates
    const existing = await repo.findPendingForDate(orgId, user._id, payload.targetDate);
    if (existing) throw new AppError('You already have a pending request for this date.', 400);

    // 2. Link to existing Daily Attendance if present
    const targetStart = startOfDay(new Date(payload.targetDate));
    const targetEnd = endOfDay(new Date(payload.targetDate));
    
    const daily = await AttendanceDaily.findOne({
      user: user._id, organizationId: orgId, date: { $gte: targetStart, $lte: targetEnd }
    }).lean();

    // 3. Construct Payload
    const requestData = {
      ...payload,
      user: user._id,
      organizationId: orgId,
      branchId: user.branchId,
      appliedBy: user._id,
      attendanceDailyId: daily?._id || undefined,
      approvalFlow: [{ approver: payload.assignedApprover, level: 1, status: 'pending' }]
    };

    return repo.create(orgId, requestData);
  }

  async getMyRequests(orgId, userId, query) {
    return repo.getMyRequests(orgId, userId, query);
  }

  async getPendingApprovals(orgId, user) {
    const isGlobalAdmin = user.role === 'Super Admin' || user.isOwner;
    const requests = await repo.getPendingByApprover(orgId, user._id, isGlobalAdmin);

    // Group by approval level
    const grouped = requests.reduce((acc, attReq) => {
      const approval = attReq.approvalFlow.find(a => a.approver.toString() === user._id.toString() && a.status === 'pending');
      const level = approval?.level || 1;
      (acc[level] = acc[level] || []).push(attReq);
      return acc;
    }, {});

    return { grouped, requests };
  }

  // --- Transactions ---

  async approveRequest(orgId, requestId, user, comments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const attRequest = await repo.getById(orgId, requestId, session);
      if (!attRequest || attRequest.status !== 'pending') {
        throw new AppError('Pending request not found', 404);
      }

      const currentApproval = attRequest.approvalFlow.find(a => a.level === attRequest.currentApprovalLevel);
      if (!currentApproval || currentApproval.approver._id.toString() !== user._id.toString()) {
        throw new AppError('Not authorized to approve at this level', 403);
      }

      currentApproval.status = 'approved';
      currentApproval.comments = comments;
      currentApproval.actionAt = new Date();

      const nextLevel = attRequest.currentApprovalLevel + 1;
      const nextApproval = attRequest.approvalFlow.find(a => a.level === nextLevel);

      let message = 'Request fully approved';

      if (!nextApproval) {
        // Final approval reached -> Update actual attendance record
        attRequest.status = 'approved';
        attRequest.approvedBy = user._id;
        attRequest.approvedAt = new Date();
        attRequest.processedBy = user._id;
        attRequest.processedAt = new Date();

        const targetStart = startOfDay(new Date(attRequest.targetDate));
        const targetEnd = endOfDay(new Date(attRequest.targetDate));

        let daily = await AttendanceDaily.findOne({
          user: attRequest.user._id, organizationId: orgId, date: { $gte: targetStart, $lte: targetEnd }
        }).session(session);

        if (!daily) {
          daily = new AttendanceDaily({
            user: attRequest.user._id, organizationId: orgId, date: targetStart, status: 'absent'
          });
        }

        // Apply Correction Math
        if (attRequest.type === 'correction' && attRequest.correction) {
          if (attRequest.correction.newFirstIn) daily.firstIn = attRequest.correction.newFirstIn;
          if (attRequest.correction.newLastOut) daily.lastOut = attRequest.correction.newLastOut;
          if (daily.firstIn && daily.lastOut) {
            daily.totalWorkHours = this._calculateWorkHours(daily.firstIn, daily.lastOut);
          }
        }

        if (['correction', 'missed_punch', 'regularization'].includes(attRequest.type) && daily.firstIn) {
          daily.status = 'present'; 
        }

        daily.isRegularized = true;
        daily.regularizedById = user._id;
        daily.regularizedAt = new Date();
        daily.regularizationReason = attRequest.type;
        
        await daily.save({ session });
      } else {
        attRequest.currentApprovalLevel = nextLevel;
        message = 'Approved — moving to next level';
      }

      await attRequest.save({ session });
      await session.commitTransaction();

      return { request: attRequest, message };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async rejectRequest(orgId, requestId, user, reason) {
    const attRequest = await repo.getById(orgId, requestId);
    if (!attRequest || attRequest.status !== 'pending') throw new AppError('Pending request not found', 404);

    const isApprover = attRequest.approvalFlow.some(a => a.approver._id.toString() === user._id.toString());
    if (!isApprover && !user.isSuperAdmin && !user.isOwner) throw new AppError('Not authorized', 403);

    attRequest.status = 'rejected';
    attRequest.rejectionReason = reason;
    attRequest.processedBy = user._id;
    attRequest.processedAt = new Date();

    const currentApproval = attRequest.approvalFlow.find(a => a.level === attRequest.currentApprovalLevel);
    if (currentApproval) {
      currentApproval.status = 'rejected';
      currentApproval.comments = reason;
      currentApproval.actionAt = new Date();
    }

    await attRequest.save();
    return attRequest;
  }

  async cancelRequest(orgId, requestId, user) {
    const attRequest = await repo.getById(orgId, requestId);
    if (!attRequest) throw new AppError('Request not found', 404);
    if (attRequest.status !== 'pending') throw new AppError('Cannot cancel a processed request', 400);
    if (attRequest.user._id.toString() !== user._id.toString() && !user.isSuperAdmin) throw new AppError('Not authorized', 403);

    attRequest.status = 'cancelled';
    attRequest.processedBy = user._id;
    attRequest.processedAt = new Date();
    
    await attRequest.save();
    return attRequest;
  }
}

module.exports = new AttendanceRequestService();

// // services/attendanceRequest.service.js
// const mongoose = require('mongoose');
// const AttendanceRequest = require('../models/attendanceRequest.model');
// const AttendanceDaily = require('../models/attendanceDaily.model');
// const AppError = require('../../../../core/utils/api/appError');
// const { startOfDay, endOfDay } = require('../../../../core/utils/dateHelpers');

// class AttendanceRequestService {
//   /**
//    * Helper to calculate work hours
//    */
//   _calculateWorkHours(firstIn, lastOut, breaks = []) {
//     if (!firstIn || !lastOut) return 0;
//     const totalMs = lastOut - firstIn;
//     let totalHours = totalMs / (1000 * 60 * 60);
//     breaks.forEach(b => {
//       if (b.start && b.end) totalHours -= (b.end - b.start) / (1000 * 60 * 60);
//     });
//     return Math.max(0, Math.round(totalHours * 100) / 100);
//   }

//   /**
//    * Create a new attendance request
//    */
//   async createRequest(payload, user) {
//     const { targetDate, type, assignedApprover, correction } = payload;

//     if (!targetDate || !type) {
//       throw new AppError('Please provide targetDate and type', 400);
//     }

//     if (!assignedApprover) {
//       throw new AppError('Please select an approver.', 400);
//     }

//     // Prevent duplicates
//     const existingRequest = await AttendanceRequest.findOne({
//       user: user._id,
//       targetDate: new Date(targetDate),
//       status: 'pending'
//     });

//     if (existingRequest) {
//       throw new AppError('You already have a pending request for this date.', 400);
//     }

//     // Link to existing Daily Attendance if present
//     const targetStart = startOfDay(new Date(targetDate));
//     const targetEnd = endOfDay(new Date(targetDate));
    
//     const daily = await AttendanceDaily.findOne({
//       user: user._id,
//       organizationId: user.organizationId,
//       date: { $gte: targetStart, $lte: targetEnd }
//     });

//     const requestData = {
//       ...payload,
//       user: user._id,
//       organizationId: user.organizationId,
//       branchId: user.branchId,
//       appliedBy: user._id,
//       approvalFlow: [{ approver: assignedApprover, level: 1, status: 'pending' }]
//     };

//     if (daily) {
//       requestData.attendanceDailyId = daily._id;
//     }

//     return await AttendanceRequest.create(requestData);
//   }

//   /**
//    * Approve a request and process side effects
//    */
//   async approveRequest(requestId, user, comments) {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const attRequest = await AttendanceRequest.findOne({
//         _id: requestId,
//         organizationId: user.organizationId,
//         status: 'pending'
//       }).session(session);

//       if (!attRequest) {
//         await session.abortTransaction();
//         throw new AppError('Pending request not found', 404);
//       }

//       const currentApproval = attRequest.approvalFlow.find(a => a.level === attRequest.currentApprovalLevel);
//       if (!currentApproval || currentApproval.approver.toString() !== user._id.toString()) {
//         await session.abortTransaction();
//         throw new AppError('Not authorized to approve at this level', 403);
//       }

//       currentApproval.status = 'approved';
//       currentApproval.comments = comments;
//       currentApproval.actionAt = new Date();

//       const nextLevel = attRequest.currentApprovalLevel + 1;
//       const nextApproval = attRequest.approvalFlow.find(a => a.level === nextLevel);

//       let message = 'Request fully approved';

//       if (!nextApproval) {
//         // Final approval
//         attRequest.status = 'approved';
//         attRequest.approvedBy = user._id;
//         attRequest.approvedAt = new Date();
//         attRequest.processedBy = user._id;
//         attRequest.processedAt = new Date();

//         // Apply changes to Daily Attendance
//         const targetStart = startOfDay(new Date(attRequest.targetDate));
//         const targetEnd = endOfDay(new Date(attRequest.targetDate));

//         let daily = await AttendanceDaily.findOne({
//           user: attRequest.user,
//           organizationId: user.organizationId,
//           date: { $gte: targetStart, $lte: targetEnd }
//         }).session(session);

//         if (!daily) {
//           daily = new AttendanceDaily({
//             user: attRequest.user,
//             organizationId: user.organizationId,
//             date: targetStart,
//             status: 'absent'
//           });
//         }

//         if (attRequest.type === 'correction' && attRequest.correction) {
//           if (attRequest.correction.newFirstIn) daily.firstIn = attRequest.correction.newFirstIn;
//           if (attRequest.correction.newLastOut) daily.lastOut = attRequest.correction.newLastOut;
          
//           if (daily.firstIn && daily.lastOut) {
//             daily.totalWorkHours = this._calculateWorkHours(daily.firstIn, daily.lastOut);
//           }
//         }

//         if (['correction', 'missed_punch', 'regularization'].includes(attRequest.type)) {
//           if (daily.firstIn) {
//             daily.status = 'present'; 
//           }
//         }

//         daily.isRegularized = true;
//         daily.regularizedById = user._id;
//         daily.regularizedAt = new Date();
//         daily.regularizationReason = attRequest.type;
        
//         await daily.save({ session });
//       } else {
//         attRequest.currentApprovalLevel = nextLevel;
//         message = 'Approved — moving to next level';
//       }

//       await attRequest.save({ session });
//       await session.commitTransaction();

//       return { request: attRequest, message };
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

//   /**
//    * Reject a request
//    */
//   async rejectRequest(requestId, user, reason) {
//     if (!reason) throw new AppError('Please provide rejection reason', 400);

//     const attRequest = await AttendanceRequest.findOne({
//       _id: requestId,
//       organizationId: user.organizationId,
//       status: 'pending'
//     });

//     if (!attRequest) throw new AppError('Pending request not found', 404);

//     const isApprover = attRequest.approvalFlow.some(a => a.approver.toString() === user._id.toString());
//     if (!isApprover && !user.isSuperAdmin) throw new AppError('Not authorized', 403);

//     attRequest.status = 'rejected';
//     attRequest.rejectionReason = reason;
//     attRequest.processedBy = user._id;
//     attRequest.processedAt = new Date();

//     const currentApproval = attRequest.approvalFlow.find(a => a.level === attRequest.currentApprovalLevel);
//     if (currentApproval) {
//       currentApproval.status = 'rejected';
//       currentApproval.comments = reason;
//       currentApproval.actionAt = new Date();
//     }

//     await attRequest.save();
//     return attRequest;
//   }

//   /**
//    * Cancel a request
//    */
//   async cancelRequest(requestId, user) {
//     const attRequest = await AttendanceRequest.findOne({
//       _id: requestId,
//       organizationId: user.organizationId
//     });

//     if (!attRequest) throw new AppError('Request not found', 404);
//     if (attRequest.status !== 'pending') throw new AppError('Cannot cancel in current state', 400);
//     if (attRequest.user.toString() !== user._id.toString() && !user.isSuperAdmin) throw new AppError('Not authorized', 403);

//     attRequest.status = 'cancelled';
//     attRequest.processedBy = user._id;
//     attRequest.processedAt = new Date();
    
//     await attRequest.save();
//     return attRequest;
//   }
// }

// module.exports = new AttendanceRequestService();
