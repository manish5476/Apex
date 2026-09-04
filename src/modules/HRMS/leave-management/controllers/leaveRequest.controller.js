const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const repo = require('../repository/leaveRequest.repository');
const leaveRequestService = require('../services/leaveRequest.service');
const { createLeaveRequestSchema, updateLeaveRequestSchema, actionSchema, rejectSchema, escalateSchema, bulkApproveSchema } = require('../validation/leaveRequest.validation');
const { success, created } = require('../../../middleware/responseFormatter');
const Employee = require('../../core-hr/models/employee.model'); // For team calendar view

// --- CRUD ---

exports.createLeaveRequest = catchAsync(async (req, res) => {
  const payload = createLeaveRequestSchema.parse(req.body);
  const leaveRequest = await leaveRequestService.create(req.user.organizationId, req.user, payload);
  return created(res, { leaveRequest });
});

exports.getAllLeaveRequests = catchAsync(async (req, res) => {
  const result = await repo.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getLeaveRequest = catchAsync(async (req, res, next) => {
  const leaveRequest = await repo.getById(req.user.organizationId, req.params.id);
  if (!leaveRequest) return next(new AppError('Leave request not found', 404));
  return success(res, { leaveRequest });
});

exports.updateLeaveRequest = catchAsync(async (req, res, next) => {
  const payload = updateLeaveRequestSchema.parse(req.body);
  const leaveReq = await repo.getById(req.user.organizationId, req.params.id);
  if (!leaveReq) return next(new AppError('Leave request not found', 404));
  if (!['draft','pending'].includes(leaveReq.status)) return next(new AppError('Cannot update a processed request', 400));
  
  // Hand off back to model/repo safely...
  Object.assign(leaveReq, payload);
  await leaveReq.save();
  return success(res, { leaveRequest: leaveReq });
});

exports.cancelLeaveRequest = catchAsync(async (req, res) => {
  const leaveRequest = await leaveRequestService.cancel(req.user.organizationId, req.params.id, req.user);
  return success(res, { leaveRequest, message: 'Leave request cancelled' });
});

// --- Workflows ---

exports.approveLeaveRequest = catchAsync(async (req, res) => {
  const payload = actionSchema.parse(req.body);
  const result = await leaveRequestService.approve(req.user.organizationId, req.params.id, req.user._id, payload.comments);
  return success(res, { leaveRequest: result.request, message: result.message });
});

exports.rejectLeaveRequest = catchAsync(async (req, res) => {
  const payload = rejectSchema.parse(req.body);
  const leaveRequest = await leaveRequestService.reject(req.user.organizationId, req.params.id, req.user._id, payload.reason);
  return success(res, { leaveRequest, message: 'Request rejected' });
});

exports.bulkApproveLeaves = catchAsync(async (req, res) => {
  const payload = bulkApproveSchema.parse(req.body);
  const results = await leaveRequestService.bulkApprove(req.user.organizationId, payload.requestIds, req.user._id, payload.comments);
  return success(res, results);
});

exports.escalateLeaveRequest = catchAsync(async (req, res, next) => {
  const payload = escalateSchema.parse(req.body);
  const leaveReq = await repo.getById(req.user.organizationId, req.params.id);
  if (!leaveReq || leaveReq.status !== 'pending') return next(new AppError('Pending leave request not found', 404));

  leaveReq.status = 'escalated';
  leaveReq.escalatedAt = new Date();
  leaveReq.escalatedTo = payload.escalateTo;
  leaveReq.escalationReason = payload.reason || 'Request escalated';
  leaveReq.processedBy = req.user._id;
  await leaveReq.save();

  return success(res, { leaveRequest: leaveReq, message: 'Leave request escalated' });
});

// --- Custom Lookups ---

exports.getPendingApprovals = catchAsync(async (req, res) => {
  const isGlobalAdmin = req.user.role === 'Super Admin' || req.user.isOwner;
  const requests = await repo.getPendingByApprover(req.user.organizationId, req.user._id, isGlobalAdmin);

  // FIX BUG-LR-C06 — Avoiding shadowing `req` parameter using `leaveReq`
  const grouped = requests.reduce((acc, leaveReq) => {
    const approval = leaveReq.approvalFlow.find(a => a.approver.toString() === req.user._id.toString() && a.status === 'pending');
    const level = approval?.level || 1;
    (acc[level] = acc[level] || []).push(leaveReq);
    return acc;
  }, {});

  return success(res, { grouped, requests }, 200, { total: requests.length });
});

exports.getLeaveAnalytics = catchAsync(async (req, res) => {
  const { financialYear, departmentId } = req.query;
  const [analytics] = await repo.getAnalyticsAggregation(req.user.organizationId, financialYear, departmentId);
  return success(res, { financialYear, analytics });
});

exports.getTeamLeaveCalendar = catchAsync(async (req, res) => {
  const targetMonth = Math.min(12, Math.max(1, parseInt(req.query.month) || new Date().getMonth() + 1));
  const targetYear  = parseInt(req.query.year) || new Date().getFullYear();

  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate   = new Date(targetYear, targetMonth, 0, 23, 59, 59);

  const teamMembers = await Employee.find({ organizationId: req.user.organizationId, reportingManagerId: req.user._id }).select('user');
  const teamMemberIds = teamMembers.map(m => m.user);

  const leaves = await mongoose.model('LeaveRequest').find({
    user: { $in: teamMemberIds }, organizationId: req.user.organizationId, status: 'approved',
    $or: [
      { startDate: { $lte: endDate, $gte: startDate } },
      { endDate: { $lte: endDate, $gte: startDate } },
      { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
    ],
  }).populate('user', 'name avatar').sort('startDate');

  const calendar = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const cY = current.getFullYear();
    const cM = current.getMonth();
    const cD = current.getDate();

    // FIX BUG-LR-C08 — Date components used to avoid TZ mismatch
    const dayLeaves = leaves.filter(leave => {
      const ls = new Date(leave.startDate);
      const le = new Date(leave.endDate);
      const leaveStartDay = new Date(ls.getFullYear(), ls.getMonth(), ls.getDate());
      const leaveEndDay   = new Date(le.getFullYear(), le.getMonth(), le.getDate());
      const today = new Date(cY, cM, cD);
      return today >= leaveStartDay && today <= leaveEndDay;
    });

    calendar.push({ date: new Date(current), dayOfWeek: current.getDay(), count: dayLeaves.length, leaves: dayLeaves.map(l => ({ user: l.user, leaveType: l.leaveType })) });
    current.setDate(current.getDate() + 1);
  }

  return success(res, { month: targetMonth, year: targetYear, totalTeamMembers: teamMemberIds.length, totalLeaves: leaves.length, calendar });
});

// // controllers/leave/leaveRequest.controller.js
// const mongoose      = require('mongoose');
// const LeaveRequest  = require('../../leave-management/models/leaveRequest.model');
// const LeaveBalance  = require('../../leave-management/models/leaveBalance.model');
// const AttendanceDaily = require('../../attendance/models/attendanceDaily.model');
// const User          = require('../../../auth/core/user.model');
// const Employee      = require('../../core-hr/models/employee.model');
// const catchAsync    = require('../../../../core/utils/api/catchAsync');
// const AppError      = require('../../../../core/utils/api/appError');
// const factory       = require('../../../../core/utils/api/handlerFactory');
// const { getFinancialYear, getLeaveField } = require('../../../../core/utils/leaveHelpers');
// const { startOfDay, endOfDay,getPeriodDates } = require('../../../../core/utils/dateHelpers');

// // ─────────────────────────────────────────────
// //  HELPERS
// // ─────────────────────────────────────────────

// const calculateWorkingDays = (startDate, endDate, weeklyOffs = [0]) => {
//   const start = new Date(startDate);
//   const end   = new Date(endDate);
//   let days    = 0;
//   const curr  = new Date(start);
//   while (curr <= end) {
//     if (!weeklyOffs.includes(curr.getDay())) days++;
//     curr.setDate(curr.getDate() + 1);
//   }
//   return days;
// };

// const generateImpactedDates = (startDate, endDate, status = 'full_day') => {
//   const dates = [];
//   const curr  = new Date(startDate);
//   const end   = new Date(endDate);
//   while (curr <= end) {
//     dates.push({ date: new Date(curr), status });
//     curr.setDate(curr.getDate() + 1);
//   }
//   return dates;
// };

// /**
//  * FIX BUG-LR-C03 [CRITICAL] — leaveField mapping now uses LEAVE_FIELD_MAP via getLeaveField().
//  * Original used `${leaveType}Leave` which produced 'compensatoryLeave' (undefined on balance)
//  * for 'compensatory' type — balance check returned NaN < amount → false → infinite compensatory.
//  */
// const validateLeaveRequest = async (data, organizationId, userId, excludeId = null) => {
//   const { leaveType, startDate, endDate, daysCount } = data;
//   const start = new Date(startDate);
//   const end   = new Date(endDate);

//   if (start > end) throw new AppError('Start date cannot be after end date', 400);

//   // FIX BUG-LR-C10 [MEDIUM] — Wrap setHours result in new Date() for proper Date comparison
//   const today = new Date(new Date().setHours(0, 0, 0, 0));
//   if (start < today) throw new AppError('Cannot apply for leave in the past', 400);

//   // Overlapping leave check
//   const overlapping = await LeaveRequest.findOne({
//     user: userId, organizationId,
//     status: { $in: ['pending', 'approved'] },
//     _id: { $ne: excludeId },
//     $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
//   });
//   if (overlapping) throw new AppError('You already have a leave request overlapping this date range', 400);

//   const financialYear = getFinancialYear(start);
//   const balance = await LeaveBalance.findOne({ user: userId, organizationId, financialYear });
//   if (!balance) throw new AppError('Leave balance not found for this financial year', 404);

//   // FIX BUG-LR-C03 — Use getLeaveField() for correct field name
//   if (leaveType !== 'unpaid') {
//     const leaveField = getLeaveField(leaveType); // throws if unknown type
//     const available  = (balance[leaveField]?.total || 0) - (balance[leaveField]?.used || 0);
//     if (available < daysCount) {
//       throw new AppError(`Insufficient ${leaveType} leave balance. Available: ${available}, Requested: ${daysCount}`, 400);
//     }
//   }

//   return { balance };
// };

// // ─────────────────────────────────────────────
// //  CRUD
// // ─────────────────────────────────────────────

// /**
//  * POST /api/v1/leave-requests
//  *
//  * FIX BUG-LR-C05 [CRITICAL] — Approval-flow lookups moved BEFORE the transaction.
//  * Read-only lookups (Role, User) inside a transaction hold locks unnecessarily.
//  */
// exports.createLeaveRequest = catchAsync(async (req, res, next) => {
//   req.body.user           = req.user._id;
//   req.body.organizationId = req.user.organizationId;
//   req.body.branchId       = req.user.branchId;
//   // departmentId will be populated from Employee record
//   req.body.appliedBy      = req.user._id;

//   const { balance } = await validateLeaveRequest(req.body, req.user.organizationId, req.user._id);

//   req.body.impactedDates   = generateImpactedDates(req.body.startDate, req.body.endDate, req.body.leaveType);
//   req.body.balanceSnapshot = {
//     before: {
//       casual: (balance.casualLeave?.total || 0)  - (balance.casualLeave?.used || 0),
//       sick:   (balance.sickLeave?.total   || 0)  - (balance.sickLeave?.used   || 0),
//       earned: (balance.earnedLeave?.total  || 0) - (balance.earnedLeave?.used  || 0),
//     },
//   };

//   const { assignedApprover } = req.body;
//   if (!assignedApprover) {
//     throw new AppError('Please select an approver.', 400);
//   }

//   const approvalFlow = [{ approver: assignedApprover, level: 1, status: 'pending' }];
//   req.body.approvalFlow = approvalFlow;

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const [leaveRequest] = await LeaveRequest.create([req.body], { session });
//     await session.commitTransaction();

//     await leaveRequest.populate([
//       { path: 'user',                   select: 'name' },
//       { path: 'approvalFlow.approver',  select: 'name email' },
//       { path: 'handoverTo',             select: 'name' },
//     ]);

//     res.status(201).json({ status: 'success', data: { leaveRequest } });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// exports.getAllLeaveRequests = factory.getAll(LeaveRequest, {
//   searchFields: ['leaveRequestId', 'reason'],
//   populate: [
//     { path: 'user',         select: 'name employeeProfile.employeeId avatar' },
//     { path: 'approvedBy',   select: 'name' },
//     { path: 'handoverTo',   select: 'name' },
//     { path: 'departmentId', select: 'name' },
//   ],
//   sort: { createdAt: -1 },
// });

// exports.getLeaveRequest = factory.getOne(LeaveRequest, {
//   populate: [
//     { path: 'user',                  select: 'name email phone employeeProfile' },
//     { path: 'approvedBy',            select: 'name' },
//     { path: 'handoverTo',            select: 'name email' },
//     { path: 'departmentId',          select: 'name' },
//     { path: 'approvalFlow.approver', select: 'name email avatar' },
//     { path: 'escalatedTo',           select: 'name' },
//   ],
// });

// exports.updateLeaveRequest = catchAsync(async (req, res, next) => {
//   const leaveRequest = await LeaveRequest.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!leaveRequest) return next(new AppError('Leave request not found', 404));
//   if (!['draft','pending'].includes(leaveRequest.status)) return next(new AppError('Cannot update a processed leave request', 400));
//   if (leaveRequest.user.toString() !== req.user._id.toString() && !req.user.isSuperAdmin) return next(new AppError('Not authorized', 403));

//   if (req.body.startDate || req.body.endDate || req.body.leaveType) {
//     await validateLeaveRequest(
//       { ...leaveRequest.toObject(), ...req.body },
//       req.user.organizationId, leaveRequest.user, req.params.id
//     );
//     req.body.impactedDates = generateImpactedDates(
//       req.body.startDate || leaveRequest.startDate,
//       req.body.endDate   || leaveRequest.endDate,
//       req.body.leaveType || leaveRequest.leaveType
//     );
//   }

//   const updated = await LeaveRequest.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
//   res.status(200).json({ status: 'success', data: { leaveRequest: updated } });
// });

// /**
//  * DELETE /api/v1/leave-requests/:id
//  *
//  * FIX BUG-LR-C01 [CRITICAL] — Balance restoration now works correctly.
//  * Original set status = 'cancelled' BEFORE checking if it was 'approved',
//  * so the check always evaluated to false and balance was never restored.
//  *
//  * FIX BUG-LR-C07 [HIGH] — Both leaveRequest.save() and balance.save() wrapped
//  * in the same transaction for atomicity.
//  */
// exports.cancelLeaveRequest = catchAsync(async (req, res, next) => {
//   const leaveRequest = await LeaveRequest.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!leaveRequest) return next(new AppError('Leave request not found', 404));
//   if (!['pending','approved'].includes(leaveRequest.status)) return next(new AppError('Cannot cancel in current state', 400));
//   if (leaveRequest.user.toString() !== req.user._id.toString() && !req.user.isSuperAdmin) return next(new AppError('Not authorized', 403));

//   // FIX BUG-LR-C01 — Capture original status BEFORE changing it
//   const wasApproved = leaveRequest.status === 'approved';

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     leaveRequest.status      = 'cancelled';
//     leaveRequest.processedBy = req.user._id;
//     leaveRequest.processedAt = new Date();
//     // FIX BUG-LR-C07 — save leaveRequest inside the session
//     await leaveRequest.save({ session });

//     // FIX BUG-LR-C01 — Balance restoration happens because wasApproved captured original status
//     if (wasApproved) {
//       const financialYear = getFinancialYear(leaveRequest.startDate);
//       const balance = await LeaveBalance.findOne({
//         user: leaveRequest.user, organizationId: req.user.organizationId, financialYear,
//       }).session(session);

//       if (balance) {
//         // FIX CROSS-A — Use getLeaveField() for correct mapping
//         const leaveField = getLeaveField(leaveRequest.leaveType);
//         if (balance[leaveField]) {
//           balance[leaveField].used = Math.max(0, balance[leaveField].used - leaveRequest.daysCount);
//           // Use $push with $slice cap via atomic update to avoid model method inside session
//           await LeaveBalance.findByIdAndUpdate(balance._id, {
//             $inc:  { [`${leaveField}.used`]: -leaveRequest.daysCount },
//             $push: {
//               recentTransactions: {
//                 $each: [{
//                   leaveType:     leaveField,
//                   changeType:    'adjusted',
//                   amount:        leaveRequest.daysCount,
//                   runningBalance:balance[leaveField].total - Math.max(0, balance[leaveField].used - leaveRequest.daysCount),
//                   referenceId:   leaveRequest._id,
//                   description:   `Leave cancelled: ${leaveRequest.leaveRequestId}`,
//                   processedBy:   req.user._id,
//                 }],
//                 $slice: -20,
//               },
//             },
//           }, { session });
//         }
//       }

//       // Revert attendance records
//       await AttendanceDaily.updateMany(
//         { user: leaveRequest.user, organizationId: req.user.organizationId, leaveRequestId: leaveRequest._id },
//         { $set: { status: 'absent' }, $unset: { leaveRequestId: 1 } },
//         { session }
//       );
//     }

//     await session.commitTransaction();
//     res.status(200).json({ status: 'success', message: 'Leave request cancelled', data: { leaveRequest } });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// // ─────────────────────────────────────────────
// //  APPROVAL OPERATIONS
// // ─────────────────────────────────────────────

// /**
//  * PATCH /api/v1/leave-requests/:id/approve
//  *
//  * FIX BUG-LR-C02 [CRITICAL] — leaveField uses getLeaveField() (compensatoryOff fix).
//  * FIX BUG-LR-C04 [CRITICAL] — AttendanceDaily upserts use bulkWrite (no N+1 in transaction).
//  */
// exports.approveLeaveRequest = catchAsync(async (req, res, next) => {
//   const { comments } = req.body;

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const leaveRequest = await LeaveRequest.findOne({
//       _id: req.params.id, organizationId: req.user.organizationId, status: 'pending',
//     }).session(session);

//     if (!leaveRequest) {
//       await session.abortTransaction();
//       return next(new AppError('Pending leave request not found', 404));
//     }

//     const currentApproval = leaveRequest.approvalFlow.find(a => a.level === leaveRequest.currentApprovalLevel);
//     if (!currentApproval || currentApproval.approver.toString() !== req.user._id.toString()) {
//       await session.abortTransaction();
//       return next(new AppError('Not authorized to approve at this level', 403));
//     }

//     currentApproval.status   = 'approved';
//     currentApproval.comments = comments;
//     currentApproval.actionAt = new Date();

//     const nextLevel    = leaveRequest.currentApprovalLevel + 1;
//     const nextApproval = leaveRequest.approvalFlow.find(a => a.level === nextLevel);

//     if (!nextApproval) {
//       // Final approval
//       leaveRequest.status     = 'approved';
//       leaveRequest.approvedBy = req.user._id;
//       leaveRequest.approvedAt = new Date();

//       const financialYear = getFinancialYear(leaveRequest.startDate);
//       const balance = await LeaveBalance.findOne({
//         user: leaveRequest.user, organizationId: req.user.organizationId, financialYear,
//       }).session(session);

//       if (!balance) throw new AppError('Leave balance not found for this financial year', 404);

//       // FIX BUG-LR-C02 [CRITICAL] — getLeaveField() handles 'compensatory' → 'compensatoryOff'
//       const leaveField = getLeaveField(leaveRequest.leaveType);
//       if (!balance[leaveField]) throw new AppError(`Balance field '${leaveField}' not found`, 500);

//       // Snapshot after balance
//       leaveRequest.balanceSnapshot = leaveRequest.balanceSnapshot || {};
//       leaveRequest.balanceSnapshot.after = {
//         [leaveRequest.leaveType]: (balance[leaveField].total - balance[leaveField].used) - leaveRequest.daysCount,
//       };

//       // Debit via model method (atomic + respects recentTransactions cap)
//       await balance.debitLeave(
//         leaveField,
//         leaveRequest.daysCount,
//         leaveRequest._id,
//         `Leave approved: ${leaveRequest.leaveRequestId}`,
//         req.user._id
//       );

//       // FIX BUG-LR-C04 [CRITICAL] — Use bulkWrite instead of N sequential upserts in transaction.
//       // For a 30-day leave: original = 30 findOneAndUpdate calls → timeout risk.
//       if (leaveRequest.impactedDates?.length) {
//         const bulkOps = leaveRequest.impactedDates.map(impacted => ({
//           updateOne: {
//             filter: {
//               user:           leaveRequest.user,
//               organizationId: req.user.organizationId,
//               date:           { $gte: startOfDay(impacted.date), $lte: endOfDay(impacted.date) },
//             },
//             update: {
//               $set:       { status: 'on_leave', leaveRequestId: leaveRequest._id },
//               $setOnInsert: { user: leaveRequest.user, organizationId: req.user.organizationId, date: startOfDay(impacted.date) },
//             },
//             upsert: true,
//           },
//         }));
//         await AttendanceDaily.bulkWrite(bulkOps, { session });
//       }
//     } else {
//       leaveRequest.currentApprovalLevel = nextLevel;
//     }

//     leaveRequest.processedBy = req.user._id;
//     leaveRequest.processedAt = new Date();
//     await leaveRequest.save({ session });

//     await session.commitTransaction();

//     res.status(200).json({
//       status: 'success',
//       message: nextApproval ? 'Approved — moving to next level' : 'Leave fully approved',
//       data: { leaveRequest },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// exports.rejectLeaveRequest = catchAsync(async (req, res, next) => {
//   const { reason } = req.body;
//   if (!reason) return next(new AppError('Please provide rejection reason', 400));

//   const leaveRequest = await LeaveRequest.findOne({ _id: req.params.id, organizationId: req.user.organizationId, status: 'pending' });
//   if (!leaveRequest) return next(new AppError('Pending leave request not found', 404));

//   const isApprover = leaveRequest.approvalFlow.some(a => a.approver.toString() === req.user._id.toString());
//   if (!isApprover && !req.user.isSuperAdmin) return next(new AppError('Not authorized', 403));

//   leaveRequest.status          = 'rejected';
//   leaveRequest.rejectionReason = reason;
//   leaveRequest.processedBy     = req.user._id;
//   leaveRequest.processedAt     = new Date();

//   const currentApproval = leaveRequest.approvalFlow.find(a => a.level === leaveRequest.currentApprovalLevel);
//   if (currentApproval) { currentApproval.status = 'rejected'; currentApproval.comments = reason; currentApproval.actionAt = new Date(); }

//   await leaveRequest.save();
//   res.status(200).json({ status: 'success', message: 'Leave request rejected', data: { leaveRequest } });
// });

// exports.escalateLeaveRequest = catchAsync(async (req, res, next) => {
//   const { reason, escalateTo } = req.body;

//   const leaveRequest = await LeaveRequest.findOne({ _id: req.params.id, organizationId: req.user.organizationId, status: 'pending' });
//   if (!leaveRequest) return next(new AppError('Pending leave request not found', 404));

//   const targetUser = await User.findOne({ _id: escalateTo, organizationId: req.user.organizationId, isActive: true });
//   if (!targetUser) return next(new AppError('Target user for escalation not found', 404));

//   leaveRequest.status            = 'escalated';
//   leaveRequest.escalatedAt       = new Date();
//   leaveRequest.escalatedTo       = escalateTo;
//   leaveRequest.escalationReason  = reason || 'Request escalated';
//   leaveRequest.processedBy       = req.user._id;
//   await leaveRequest.save();

//   res.status(200).json({ status: 'success', message: 'Leave request escalated', data: { leaveRequest } });
// });

// // ─────────────────────────────────────────────
// //  USER OPERATIONS
// // ─────────────────────────────────────────────

// exports.getMyLeaveRequests = catchAsync(async (req, res, next) => {
//   const page  = Math.max(1, parseInt(req.query.page)  || 1);
//   const limit = Math.min(100, parseInt(req.query.limit) || 20);
//   const skip  = (page - 1) * limit;

//   const query = { user: req.user._id, organizationId: req.user.organizationId };
//   if (req.query.status) query.status = req.query.status;
//   if (req.query.fromDate || req.query.toDate) {
//     query.startDate = {};
//     if (req.query.fromDate) query.startDate.$gte = new Date(req.query.fromDate);
//     if (req.query.toDate)   query.startDate.$lte = new Date(req.query.toDate);
//   }

//   const [requests, total] = await Promise.all([
//     LeaveRequest.find(query).populate('approvedBy','name').populate('approvalFlow.approver','name email').skip(skip).limit(limit).sort({ createdAt: -1 }),
//     LeaveRequest.countDocuments(query),
//   ]);

//   res.status(200).json({ status: 'success', results: requests.length, total, page, totalPages: Math.ceil(total / limit), data: { leaveRequests: requests } });
// });

// /**
//  * GET /api/v1/leave-requests/pending-approvals
//  *
//  * FIX BUG-LR-C06 [CRITICAL] — Renamed inner `req` variable to `leaveReq` to prevent
//  * shadowing the outer Express `req` object. Original: `req.user._id` inside the
//  * reduce callback referred to a LeaveRequest document, not the Express request —
//  * causing `TypeError: Cannot read properties of undefined (reading '_id')`.
//  */
// exports.getPendingApprovals = catchAsync(async (req, res, next) => {
//   const query = {
//     organizationId: req.user.organizationId,
//     status:         'pending'
//   };

//   // If the user is not a Super Admin or Owner, restrict to requests assigned to them
//   if (req.user.role !== 'Super Admin' && !req.user.isOwner) {
//     query.assignedApprover = req.user._id;
//   }

//   const requests = await LeaveRequest.find(query)
//     .populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId avatar')
//     .populate('departmentId', 'name')
//     .sort({ createdAt: -1 });

//   // FIX BUG-LR-C06 — `leaveReq` avoids shadowing outer `req`
//   const grouped = requests.reduce((acc, leaveReq) => {
//     const approval = leaveReq.approvalFlow.find(a =>
//       a.approver.toString() === req.user._id.toString() && a.status === 'pending'
//     );
//     const level = approval?.level || 1;
//     (acc[level] = acc[level] || []).push(leaveReq);
//     return acc;
//   }, {});

//   res.status(200).json({ status: 'success', total: requests.length, data: { grouped, requests } });
// });

// exports.getLeaveBalanceSummary = catchAsync(async (req, res, next) => {
//   const { financialYear = getFinancialYear() } = req.query;

//   const balance = await LeaveBalance.findOne({ user: req.user._id, organizationId: req.user.organizationId, financialYear });
//   if (!balance) return next(new AppError('Leave balance not found for this financial year', 404));

//   const [upcomingLeaves, recentLeaves] = await Promise.all([
//     LeaveRequest.find({ user: req.user._id, organizationId: req.user.organizationId, status: 'approved', startDate: { $gte: new Date() } }).select('leaveType startDate endDate daysCount').sort('startDate').limit(5),
//     LeaveRequest.find({ user: req.user._id, organizationId: req.user.organizationId, status: { $in: ['approved','rejected','cancelled'] } }).select('leaveType startDate endDate status createdAt').sort('-createdAt').limit(5),
//   ]);

//   res.status(200).json({
//     status: 'success',
//     data: {
//       financialYear,
//       balance: {
//         casual:  { total: balance.casualLeave?.total,  used: balance.casualLeave?.used,  available: (balance.casualLeave?.total  || 0) - (balance.casualLeave?.used  || 0) },
//         sick:    { total: balance.sickLeave?.total,    used: balance.sickLeave?.used,    available: (balance.sickLeave?.total    || 0) - (balance.sickLeave?.used    || 0) },
//         earned:  { total: balance.earnedLeave?.total,  used: balance.earnedLeave?.used,  available: (balance.earnedLeave?.total  || 0) - (balance.earnedLeave?.used  || 0) },
//         unpaid:  { used: balance.unpaidLeave?.used || 0 },
//       },
//       upcomingLeaves,
//       recentLeaves,
//       recentTransactions: (balance.recentTransactions || []).slice(-10),
//     },
//   });
// });

// // ─────────────────────────────────────────────
// //  ADMIN/HR OPERATIONS
// // ─────────────────────────────────────────────

// /**
//  * GET /api/v1/leave-requests/team-calendar
//  *
//  * FIX BUG-LR-C08 [HIGH] — Date comparison uses year/month/day components, not toISOString().
//  * Timezone-safe: avoids UTC vs local midnight mismatch.
//  */
// exports.getTeamLeaveCalendar = catchAsync(async (req, res, next) => {
//   const targetMonth = Math.min(12, Math.max(1, parseInt(req.query.month) || new Date().getMonth() + 1));
//   const targetYear  = parseInt(req.query.year) || new Date().getFullYear();

//   const startDate = new Date(targetYear, targetMonth - 1, 1);
//   const endDate   = new Date(targetYear, targetMonth, 0, 23, 59, 59);

//   const teamMembers   = await Employee.find({ organizationId: req.user.organizationId, reportingManagerId: req.user._id }).select('user');
//   const teamMemberIds = teamMembers.map(m => m.user);

//   const leaves = await LeaveRequest.find({
//     user:           { $in: teamMemberIds },
//     organizationId: req.user.organizationId,
//     status:         'approved',
//     $or: [
//       { startDate: { $lte: endDate, $gte: startDate } },
//       { endDate:   { $lte: endDate, $gte: startDate } },
//       { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
//     ],
//   }).populate('user', 'name avatar').sort('startDate');

//   const calendar = [];
//   const current  = new Date(startDate);

//   while (current <= endDate) {
//     const cY = current.getFullYear();
//     const cM = current.getMonth();
//     const cD = current.getDate();

//     // FIX BUG-LR-C08 — Component-wise comparison avoids UTC/local timezone mismatch
//     const dayLeaves = leaves.filter(leave => {
//       const ls = new Date(leave.startDate);
//       const le = new Date(leave.endDate);
//       const leaveStartDay = new Date(ls.getFullYear(), ls.getMonth(), ls.getDate());
//       const leaveEndDay   = new Date(le.getFullYear(), le.getMonth(), le.getDate());
//       const today         = new Date(cY, cM, cD);
//       return today >= leaveStartDay && today <= leaveEndDay;
//     });

//     calendar.push({
//       date:      new Date(current),
//       dayOfWeek: current.getDay(),
//       leaves:    dayLeaves.map(l => ({ user: l.user, leaveType: l.leaveType, leaveRequestId: l.leaveRequestId })),
//       count:     dayLeaves.length,
//     });

//     current.setDate(current.getDate() + 1);
//   }

//   res.status(200).json({ status: 'success', data: { month: targetMonth, year: targetYear, totalTeamMembers: teamMemberIds.length, totalLeaves: leaves.length, calendar } });
// });

// /**
//  * GET /api/v1/leave-requests/analytics
//  *
//  * FIX BUG-LR-C09 [HIGH] — `new mongoose.Types.ObjectId()` with `new`.
//  */
// exports.getLeaveAnalytics = catchAsync(async (req, res, next) => {
//   const { financialYear = getFinancialYear(), departmentId } = req.query;

//   const matchStage = { organizationId: req.user.organizationId, status: 'approved' };

//   if (financialYear) {
//     const [startYear] = financialYear.split('-');
//     matchStage.startDate = { $gte: new Date(parseInt(startYear), 3, 1), $lte: new Date(parseInt(startYear) + 1, 2, 31) };
//   }

//   if (departmentId) {
//     // FIX BUG-LR-C09 — Added `new` keyword
//     matchStage.departmentId = new mongoose.Types.ObjectId(departmentId);
//   }

//   const analytics = await LeaveRequest.aggregate([
//     { $match: matchStage },
//     {
//       $facet: {
//         byLeaveType: [{ $group: { _id: '$leaveType', count: { $sum: 1 }, totalDays: { $sum: '$daysCount' }, avgDays: { $avg: '$daysCount' } } }],
//         byMonth:     [{ $group: { _id: { $month: '$startDate' }, count: { $sum: 1 }, totalDays: { $sum: '$daysCount' } } }, { $sort: { _id: 1 } }],
//         byDepartment:[
//           { $group: { _id: '$departmentId', count: { $sum: 1 }, totalDays: { $sum: '$daysCount' } } },
//           { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
//           { $unwind: { path: '$department', preserveNullAndEmpty: true } },
//         ],
//         overall: [{ $group: { _id: null, totalRequests: { $sum: 1 }, totalLeaveDays: { $sum: '$daysCount' }, avgLeaveDays: { $avg: '$daysCount' }, maxLeaveDays: { $max: '$daysCount' } } }],
//       },
//     },
//   ]);

//   res.status(200).json({ status: 'success', data: { financialYear, analytics: analytics[0] } });
// });

// /**
//  * POST /api/v1/leave-requests/bulk-approve
//  *
//  * FIX BUG-LR-C11 [MEDIUM] — AttendanceDaily records updated for bulk-approved leaves.
//  */
// exports.bulkApproveLeaves = catchAsync(async (req, res, next) => {
//   const { requestIds, comments } = req.body;
//   if (!requestIds?.length) return next(new AppError('Please provide leave request IDs', 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const results = { approved: [], failed: [] };

//     for (const requestId of requestIds) {
//       try {
//         const leaveRequest = await LeaveRequest.findOne({ _id: requestId, organizationId: req.user.organizationId, status: 'pending' }).session(session);
//         if (!leaveRequest) { results.failed.push({ id: requestId, reason: 'Not found or already processed' }); continue; }

//         const isApprover = leaveRequest.approvalFlow.some(a => a.approver.toString() === req.user._id.toString());
//         if (!isApprover && !req.user.isSuperAdmin) { results.failed.push({ id: requestId, reason: 'Not authorized' }); continue; }

//         const currentApproval = leaveRequest.approvalFlow.find(a => a.level === leaveRequest.currentApprovalLevel);
//         if (currentApproval) { currentApproval.status = 'approved'; currentApproval.comments = comments; currentApproval.actionAt = new Date(); }

//         const nextLevel    = leaveRequest.currentApprovalLevel + 1;
//         const nextApproval = leaveRequest.approvalFlow.find(a => a.level === nextLevel);

//         if (!nextApproval) {
//           leaveRequest.status     = 'approved';
//           leaveRequest.approvedBy = req.user._id;
//           leaveRequest.approvedAt = new Date();

//           const financialYear = getFinancialYear(leaveRequest.startDate);
//           const balance = await LeaveBalance.findOne({ user: leaveRequest.user, organizationId: req.user.organizationId, financialYear }).session(session);

//           if (balance) {
//             // FIX CROSS-A — Use getLeaveField()
//             const leaveField = getLeaveField(leaveRequest.leaveType);
//             await balance.debitLeave(leaveField, leaveRequest.daysCount, leaveRequest._id, `Bulk approved: ${leaveRequest.leaveRequestId}`, req.user._id);
//           }

//           // FIX BUG-LR-C11 — Update attendance records for bulk-approved leaves
//           if (leaveRequest.impactedDates?.length) {
//             const bulkOps = leaveRequest.impactedDates.map(impacted => ({
//               updateOne: {
//                 filter: { user: leaveRequest.user, organizationId: req.user.organizationId, date: { $gte: startOfDay(impacted.date), $lte: endOfDay(impacted.date) } },
//                 update: { $set: { status: 'on_leave', leaveRequestId: leaveRequest._id }, $setOnInsert: { user: leaveRequest.user, organizationId: req.user.organizationId, date: startOfDay(impacted.date) } },
//                 upsert: true,
//               },
//             }));
//             await AttendanceDaily.bulkWrite(bulkOps, { session });
//           }
//         } else {
//           leaveRequest.currentApprovalLevel = nextLevel;
//         }

//         leaveRequest.processedBy = req.user._id;
//         leaveRequest.processedAt = new Date();
//         await leaveRequest.save({ session });
//         results.approved.push(leaveRequest);
//       } catch (error) {
//         results.failed.push({ id: requestId, reason: error.message });
//       }
//     }

//     await session.commitTransaction();
//     res.status(200).json({ status: 'success', data: results });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });