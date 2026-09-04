const mongoose = require('mongoose');
const repo = require('../repository/leaveRequest.repository');
const LeaveBalance = require('../models/leaveBalance.model');
const AttendanceDaily = require('../../attendance/models/attendanceDaily.model');
const User = require('../../../auth/core/user.model');
const Employee = require('../../core-hr/models/employee.model');
const AppError = require('../../../../core/utils/api/appError');
const { getFinancialYear, getLeaveField } = require('../../../../core/utils/leaveHelpers');
const { startOfDay, endOfDay } = require('../../../../core/utils/dateHelpers');

class LeaveRequestService {

  // --- Internal Domain Math ---
  _generateImpactedDates(startDate, endDate, status = 'full_day') {
    const dates = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      dates.push({ date: new Date(curr), status });
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }

  async _validateLeaveRules(orgId, userId, payload, excludeId = null) {
    const start = new Date(payload.startDate);
    const end = new Date(payload.endDate);

    const today = new Date(new Date().setHours(0, 0, 0, 0)); // FIX BUG-LR-C10
    if (start < today) throw new AppError('Cannot apply for leave in the past', 400);

    const overlapping = await repo.checkOverlap(orgId, userId, start, end, excludeId);
    if (overlapping) throw new AppError('You already have a leave request overlapping this date range', 400);

    const financialYear = getFinancialYear(start);
    const balance = await LeaveBalance.findOne({ user: userId, organizationId: orgId, financialYear });
    if (!balance) throw new AppError('Leave balance not found for this financial year', 404);

    if (payload.leaveType !== 'unpaid') {
      const leaveField = getLeaveField(payload.leaveType); // FIX BUG-LR-C03
      const available = (balance[leaveField]?.total || 0) - (balance[leaveField]?.used || 0);
      if (available < payload.daysCount) {
        throw new AppError(`Insufficient ${payload.leaveType} balance. Available: ${available}, Requested: ${payload.daysCount}`, 400);
      }
    }
    return balance;
  }

  // --- Transactions ---

  async create(orgId, user, payload) {
    const balance = await this._validateLeaveRules(orgId, user._id, payload);

    payload.user = user._id;
    payload.organizationId = orgId;
    payload.branchId = user.branchId;
    payload.appliedBy = user._id;
    payload.impactedDates = this._generateImpactedDates(payload.startDate, payload.endDate, payload.leaveType);
    
    payload.balanceSnapshot = {
      before: {
        casual: (balance.casualLeave?.total || 0)  - (balance.casualLeave?.used || 0),
        sick:   (balance.sickLeave?.total   || 0)  - (balance.sickLeave?.used   || 0),
        earned: (balance.earnedLeave?.total  || 0) - (balance.earnedLeave?.used  || 0),
      }
    };
    payload.approvalFlow = [{ approver: payload.assignedApprover, level: 1, status: 'pending' }];

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const [leaveReq] = await mongoose.model('LeaveRequest').create([payload], { session });
      await session.commitTransaction();
      return leaveReq;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async cancel(orgId, id, actor) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const leaveReq = await repo.getById(orgId, id, session);
      if (!leaveReq) throw new AppError('Leave request not found', 404);
      if (!['pending','approved'].includes(leaveReq.status)) throw new AppError('Cannot cancel in current state', 400);
      if (leaveReq.user._id.toString() !== actor._id.toString() && !actor.isSuperAdmin) throw new AppError('Not authorized', 403);

      const wasApproved = leaveReq.status === 'approved'; // FIX BUG-LR-C01

      leaveReq.status = 'cancelled';
      leaveReq.processedBy = actor._id;
      leaveReq.processedAt = new Date();
      await leaveReq.save({ session }); // FIX BUG-LR-C07

      if (wasApproved) {
        const financialYear = getFinancialYear(leaveReq.startDate);
        const balance = await LeaveBalance.findOne({ user: leaveReq.user._id, organizationId: orgId, financialYear }).session(session);

        if (balance) {
          const leaveField = getLeaveField(leaveReq.leaveType);
          if (balance[leaveField]) {
            balance[leaveField].used = Math.max(0, balance[leaveField].used - leaveReq.daysCount);
            await LeaveBalance.findByIdAndUpdate(balance._id, {
              $inc: { [`${leaveField}.used`]: -leaveReq.daysCount },
              $push: {
                recentTransactions: {
                  $each: [{
                    leaveType: leaveField, changeType: 'adjusted', amount: leaveReq.daysCount,
                    runningBalance: balance[leaveField].total - Math.max(0, balance[leaveField].used - leaveReq.daysCount),
                    referenceId: leaveReq._id, description: `Leave cancelled: ${leaveReq.leaveRequestId}`, processedBy: actor._id
                  }],
                  $slice: -20
                }
              }
            }, { session });
          }
        }

        await AttendanceDaily.updateMany(
          { user: leaveReq.user._id, organizationId: orgId, leaveRequestId: leaveReq._id },
          { $set: { status: 'absent' }, $unset: { leaveRequestId: 1 } },
          { session }
        );
      }

      await session.commitTransaction();
      return leaveReq;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // --- Core Approval Engine ---

  async _processApprovalInternal(orgId, leaveReq, actorId, comments, session) {
    const currentApproval = leaveReq.approvalFlow.find(a => a.level === leaveReq.currentApprovalLevel);
    if (!currentApproval || currentApproval.approver._id.toString() !== actorId.toString()) {
      throw new AppError('Not authorized to approve at this level', 403);
    }

    currentApproval.status = 'approved';
    currentApproval.comments = comments;
    currentApproval.actionAt = new Date();

    const nextLevel = leaveReq.currentApprovalLevel + 1;
    const nextApproval = leaveReq.approvalFlow.find(a => a.level === nextLevel);

    if (!nextApproval) {
      // Final Approval Logic
      leaveReq.status = 'approved';
      leaveReq.approvedBy = actorId;
      leaveReq.approvedAt = new Date();

      const financialYear = getFinancialYear(leaveReq.startDate);
      const balance = await LeaveBalance.findOne({ user: leaveReq.user._id, organizationId: orgId, financialYear }).session(session);
      if (!balance) throw new AppError('Leave balance not found', 404);

      const leaveField = getLeaveField(leaveReq.leaveType); // FIX BUG-LR-C02
      
      leaveReq.balanceSnapshot = leaveReq.balanceSnapshot || {};
      leaveReq.balanceSnapshot.after = {
        [leaveReq.leaveType]: (balance[leaveField].total - balance[leaveField].used) - leaveReq.daysCount,
      };

      await balance.debitLeave(leaveField, leaveReq.daysCount, leaveReq._id, `Approved: ${leaveReq.leaveRequestId}`, actorId, session);

      // FIX BUG-LR-C04: Atomic bulkWrite for daily attendance
      if (leaveReq.impactedDates?.length) {
        const bulkOps = leaveReq.impactedDates.map(impacted => ({
          updateOne: {
            filter: { user: leaveReq.user._id, organizationId: orgId, date: { $gte: startOfDay(impacted.date), $lte: endOfDay(impacted.date) } },
            update: { 
              $set: { status: 'on_leave', leaveRequestId: leaveReq._id },
              $setOnInsert: { user: leaveReq.user._id, organizationId: orgId, date: startOfDay(impacted.date) }
            },
            upsert: true
          }
        }));
        await AttendanceDaily.bulkWrite(bulkOps, { session });
      }
      return 'Leave fully approved';
    } else {
      leaveReq.currentApprovalLevel = nextLevel;
      return 'Approved — moving to next level';
    }
  }

  async approve(orgId, id, actorId, comments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const leaveReq = await repo.getById(orgId, id, session);
      if (!leaveReq || leaveReq.status !== 'pending') {
        await session.abortTransaction();
        throw new AppError('Pending leave request not found', 404);
      }

      const message = await this._processApprovalInternal(orgId, leaveReq, actorId, comments, session);
      
      leaveReq.processedBy = actorId;
      leaveReq.processedAt = new Date();
      await leaveReq.save({ session });

      await session.commitTransaction();
      return { request: leaveReq, message };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async bulkApprove(orgId, requestIds, actorId, comments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const results = { approved: [], failed: [] };

      for (const requestId of requestIds) {
        try {
          const leaveReq = await repo.getById(orgId, requestId, session);
          if (!leaveReq || leaveReq.status !== 'pending') {
            results.failed.push({ id: requestId, reason: 'Not found or already processed' });
            continue;
          }

          await this._processApprovalInternal(orgId, leaveReq, actorId, comments, session);
          
          leaveReq.processedBy = actorId;
          leaveReq.processedAt = new Date();
          await leaveReq.save({ session });
          results.approved.push(leaveReq);
        } catch (error) {
          results.failed.push({ id: requestId, reason: error.message });
        }
      }

      await session.commitTransaction();
      return results;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async reject(orgId, id, actorId, reason) {
    const leaveReq = await repo.getById(orgId, id);
    if (!leaveReq || leaveReq.status !== 'pending') throw new AppError('Pending leave request not found', 404);

    const isApprover = leaveReq.approvalFlow.some(a => a.approver._id.toString() === actorId.toString());
    if (!isApprover) throw new AppError('Not authorized', 403);

    leaveReq.status = 'rejected';
    leaveReq.rejectionReason = reason;
    leaveReq.processedBy = actorId;
    leaveReq.processedAt = new Date();

    const currentApproval = leaveReq.approvalFlow.find(a => a.level === leaveReq.currentApprovalLevel);
    if (currentApproval) {
      currentApproval.status = 'rejected';
      currentApproval.comments = reason;
      currentApproval.actionAt = new Date();
    }

    await leaveReq.save();
    return leaveReq;
  }
}

module.exports = new LeaveRequestService();