const mongoose = require('mongoose');
const AttendanceDaily = require('../models/attendanceDaily.model');
const AttendanceLog = require('../models/attendanceLog.model');
const Shift = require('../models/shift.model');
const Holiday = require('../../leave-management/models/holiday.model');
const LeaveRequest = require('../../leave-management/models/leaveRequest.model');
const User = require('../../../auth/core/user.model');
const repo = require('../repository/attendanceDaily.repository');
const AppError = require('../../../../core/utils/api/appError');
const { startOfDay, endOfDay, dateRangeQuery, parseQueryDate } = require('../../../../core/utils/dateHelpers.js');

class AttendanceDailyService {

  // --- Internal Calculation Helpers (Copied from your original logic) ---
  _calculateWorkHours(firstIn, lastOut, breaks = []) {
    if (!firstIn || !lastOut) return 0;
    const totalMs = lastOut - firstIn;
    let totalHours = totalMs / (1000 * 60 * 60);
    breaks.forEach(b => { if (b.start && b.end) totalHours -= (b.end - b.start) / (1000 * 60 * 60); });
    return Math.max(0, Math.round(totalHours * 100) / 100);
  }

  _determineStatus(daily, shift, holiday, leave) {
    if (leave) return 'on_leave';
    if (holiday) return holiday.isOptional ? 'present' : 'holiday';
    if (shift && shift.weeklyOffs?.includes(new Date(daily.date).getUTCDay())) return 'week_off';
    if (daily.firstIn) {
      if (daily.isHalfDay) return 'half_day';
      if (daily.isLate) return 'late';
      return 'present';
    }
    return 'absent';
  }

  _calculateOvertime(totalWorkHours, shift) {
    if (!shift?.overtimeRules?.enabled) return 0;
    const regularHours = shift.overtimeRules.afterHours || 8;
    if (totalWorkHours <= regularHours) return 0;
    return Math.round((totalWorkHours - regularHours) * 100) / 100;
  }

  // --- Endpoints Logic ---

  async getMyAttendance(orgId, userId, query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, parseInt(query.limit) || 30);
    const skip = (page - 1) * limit;

    const filter = { user: userId, organizationId: orgId };
    
    if (query.fromDate || query.toDate) {
      const from = parseQueryDate(query.fromDate);
      const to = parseQueryDate(query.toDate);
      filter.date = {};
      if (from) filter.date.$gte = startOfDay(from);
      if (to) filter.date.$lte = endOfDay(to);
    }
    if (query.status) filter.status = query.status;

    const [records, total, [summaryAgg]] = await Promise.all([
      AttendanceDaily.find(filter).populate('shiftId', 'name startTime endTime').populate('leaveRequestId', 'leaveType').populate('holidayId', 'name').skip(skip).limit(limit).sort({ date: -1 }),
      AttendanceDaily.countDocuments(filter),
      repo.getMyAttendanceSummary(filter)
    ]);

    const summary = summaryAgg ? { ...summaryAgg, total, _id: undefined } : { total, present: 0, absent: 0, leave: 0, holiday: 0, weekOff: 0, totalWorkHours: 0, totalOvertime: 0 };
    return { records, total, page, totalPages: Math.ceil(total / limit), summary };
  }

  async getDashboard(orgId, rawDate) {
    const dayStart = startOfDay(rawDate);
    const dayEnd = endOfDay(rawDate);

    const [[totalUsers, todayAttendance, todayLogCount, pendingRegularizations], deptWise] = await Promise.all([
      repo.getDashboardStats(orgId, dayStart, dayEnd),
      repo.getDashboardDeptWise(orgId, dayStart, dayEnd)
    ]);

    const stats = {
      total: totalUsers,
      present: todayAttendance.filter(r => ['present','late','half_day'].includes(r.status)).length,
      absent: todayAttendance.filter(r => r.status === 'absent').length,
      onLeave: todayAttendance.filter(r => r.status === 'on_leave').length,
      onHoliday: todayAttendance.filter(r => r.status === 'holiday').length,
      weekOff: todayAttendance.filter(r => r.status === 'week_off').length,
      late: todayAttendance.filter(r => r.isLate).length,
      halfDay: todayAttendance.filter(r => r.isHalfDay).length,
      pending: totalUsers - todayAttendance.length,
      pendingRegularizations,
      todayLogs: todayLogCount,
      attendancePercentage: totalUsers > 0 ? Math.round(((todayAttendance.filter(r => ['present','late','half_day'].includes(r.status)).length) / totalUsers) * 100) : 0
    };

    const recentActivity = await AttendanceLog.find({ organizationId: orgId, timestamp: { $gte: dayStart } }).populate('user', 'name avatar').sort('-timestamp').limit(20);

    return { date: dayStart, summary: stats, departmentWise: deptWise, recentActivity, records: todayAttendance.slice(0, 50) };
  }

  async regularize(orgId, recordId, payload, actorId) {
    const daily = await repo.getById(orgId, recordId);
    if (!daily) throw new AppError('Attendance record not found', 404);

    if (payload.firstIn) daily.firstIn = new Date(payload.firstIn);
    if (payload.lastOut) daily.lastOut = new Date(payload.lastOut);
    if (payload.status) daily.status = payload.status;

    if (daily.firstIn && daily.lastOut) {
      daily.totalWorkHours = this._calculateWorkHours(daily.firstIn, daily.lastOut);
    }

    daily.isRegularized = true;
    daily.regularizedById = actorId;
    daily.regularizedAt = new Date();
    daily.regularizationReason = payload.reason;

    await daily.save();
    return daily;
  }

  async bulkUpdate(orgId, updates, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const results = [];
      for (const update of updates) {
        const { userId, date, ...safeFields } = update;
        const dayStart = startOfDay(new Date(date));
        const dayEnd = endOfDay(new Date(date));

        const daily = await AttendanceDaily.findOneAndUpdate(
          { user: userId, organizationId: orgId, date: { $gte: dayStart, $lte: dayEnd } },
          { $set: { ...safeFields, isRegularized: true, regularizedById: actorId, regularizedAt: new Date() } },
          { new: true, session }
        );
        if (daily) results.push(daily);
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

  async getReport(orgId, from, to, departmentId, userId) {
    const matchStage = { organizationId: orgId, date: dateRangeQuery(from, to) };
    const report = await repo.getReportAggregation(matchStage, departmentId, userId);

    const summary = {
      totalEmployees: report.length,
      totalDays: report.reduce((s, r) => s + r.totalDays, 0),
      totalPresent: report.reduce((s, r) => s + r.present, 0),
      totalAbsent: report.reduce((s, r) => s + r.absent, 0),
      totalLate: report.reduce((s, r) => s + r.late, 0),
      totalHalfDay: report.reduce((s, r) => s + r.halfDay, 0),
      totalLeave: report.reduce((s, r) => s + r.onLeave, 0),
      totalWorkHours: report.reduce((s, r) => s + r.totalWorkHours, 0),
      totalOvertime: report.reduce((s, r) => s + r.totalOvertime, 0),
      avgAttendancePercentage: report.length > 0 ? report.reduce((s, r) => s + r.attendancePercentage, 0) / report.length : 0,
    };

    return { summary, report };
  }

  async getTrends(orgId, requestedMonths) {
    const months = Math.min(Math.max(requestedMonths || 3, 1), 24);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const trends = await repo.getTrendsAggregation(orgId, startDate, endDate);

    return trends.map((item, index) => {
      const window = trends.slice(Math.max(0, index - 6), index + 1);
      const avgPresent = window.reduce((s, w) => s + w.present, 0) / window.length;
      return {
        ...item,
        movingAveragePresent: Math.round(avgPresent * 100) / 100,
        attendanceRate: item.total > 0 ? Math.round((item.present / item.total) * 100) : 0,
      };
    });
  }

  async recalculateDaily(orgId, date) {
    const dayStart = startOfDay(new Date(date));
    const dayEnd = endOfDay(new Date(date));

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const [users, allLogs, holidays, approvedLeaves] = await Promise.all([
        User.find({ organizationId: orgId, isActive: true }).select('_id attendanceConfig branchId').lean(),
        AttendanceLog.find({ organizationId: orgId, timestamp: { $gte: dayStart, $lte: dayEnd } }).sort('timestamp').lean(),
        Holiday.find({ organizationId: orgId, date: { $gte: dayStart, $lte: dayEnd }, isActive: true }).lean(),
        LeaveRequest.find({ organizationId: orgId, status: 'approved', startDate: { $lte: dayEnd }, endDate: { $gte: dayStart } }).lean(),
      ]);

      const shiftIds = [...new Set(users.map(u => u.attendanceConfig?.shiftId).filter(Boolean).map(String))];
      const shiftsArr = await Shift.find({ _id: { $in: shiftIds } }).lean();
      const shiftMap = Object.fromEntries(shiftsArr.map(s => [s._id.toString(), s]));

      const logsByUser = {};
      allLogs.forEach(l => { const uid = l.user.toString(); (logsByUser[uid] = logsByUser[uid] || []).push(l); });

      const leaveByUser = {};
      approvedLeaves.forEach(l => { leaveByUser[l.user.toString()] = l; });

      const orgWideHoliday = holidays.find(h => !h.branchId) || null;
      const branchHolidayMap = {};
      holidays.forEach(h => { if (h.branchId) branchHolidayMap[h.branchId.toString()] = h; });

      const results = [];

      for (const user of users) {
        const uid = user._id.toString();
        const logs = logsByUser[uid] || [];
        if (logs.length === 0) continue;

        const shift = user.attendanceConfig?.shiftId ? shiftMap[user.attendanceConfig.shiftId.toString()] : null;
        const leave = leaveByUser[uid] || null;
        const holiday = (user.branchId && branchHolidayMap[user.branchId.toString()]) || orgWideHoliday || null;

        const firstIn = logs.find(l => l.type.includes('in'))?.timestamp || null;
        const lastOut = logs.filter(l => l.type.includes('out')).pop()?.timestamp || null;
        const totalWorkHours = this._calculateWorkHours(firstIn, lastOut);

        const isHalfDay = firstIn !== null && totalWorkHours > 0 && totalWorkHours < (shift?.halfDayThresholdHrs || 4);

        let isLate = false;
        if (firstIn && shift && !leave && !holiday) {
          const [h, m] = shift.startTime.split(':').map(Number);
          const scheduledIn = new Date(firstIn);
          scheduledIn.setHours(h, m, 0, 0);
          const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
          isLate = firstIn > new Date(scheduledIn.getTime() + graceMs);
        }

        const overtimeHours = this._calculateOvertime(totalWorkHours, shift);
        const status = this._determineStatus({ firstIn, lastOut, totalWorkHours, isHalfDay, isLate, date: dayStart }, shift, holiday, leave);

        const daily = await AttendanceDaily.findOneAndUpdate(
          { user: user._id, organizationId: orgId, date: { $gte: dayStart, $lte: dayEnd } },
          {
            $set: {
              firstIn, lastOut, totalWorkHours, overtimeHours, status, isLate, isHalfDay,
              isOvertime: overtimeHours > 0, shiftId: shift?._id, scheduledInTime: shift?.startTime,
              scheduledOutTime: shift?.endTime, leaveRequestId: leave?._id, holidayId: holiday?._id,
              logs: logs.map(l => l._id),
            },
          },
          { upsert: true, new: true, session }
        );
        results.push(daily);
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
}

module.exports = new AttendanceDailyService();

// // src/modules/HRMS/attendance/services/attendanceDaily.service.js
// const AttendanceDaily = require('../models/attendanceDaily.model');
// const AttendanceLog = require('../models/attendanceLog.model');
// const Shift = require('../models/shift.model');
// const User = require('../../../auth/core/user.model');
// const Holiday = require('../../leave-management/models/holiday.model');
// const LeaveRequest = require('../../leave-management/models/leaveRequest.model');
// const { startOfDay, endOfDay, parseQueryDate } = require('../../../../core/utils/dateHelpers.js');

// class AttendanceDailyService {
  
//   /**
//    * Calculate net work hours from firstIn/lastOut, deducting breaks.
//    */
//   calculateWorkHours(firstIn, lastOut, breaks = []) {
//     if (!firstIn || !lastOut) return 0;
//     const totalMs = lastOut - firstIn;
//     let totalHours = totalMs / (1000 * 60 * 60);
//     breaks.forEach(b => {
//       if (b.start && b.end) totalHours -= (b.end - b.start) / (1000 * 60 * 60);
//     });
//     return Math.max(0, Math.round(totalHours * 100) / 100);
//   }

//   /**
//    * Determine attendance status based on priority:
//    * leave > holiday > week_off > present/absent
//    */
//   determineStatus(daily, shift, holiday, leave) {
//     if (leave) return 'on_leave';
//     if (holiday) return holiday.isOptional ? 'present' : 'holiday';
//     if (shift && shift.weeklyOffs?.includes(new Date(daily.date).getUTCDay())) {
//       return 'week_off';
//     }
//     if (daily.firstIn) {
//       if (daily.isHalfDay) return 'half_day';
//       if (daily.isLate) return 'late';
//       return 'present';
//     }
//     return 'absent';
//   }

//   calculateOvertime(totalWorkHours, shift) {
//     if (!shift?.overtimeRules?.enabled) return 0;
//     const regularHours = shift.overtimeRules.afterHours || 8;
//     if (totalWorkHours <= regularHours) return 0;
//     return Math.round((totalWorkHours - regularHours) * 100) / 100;
//   }

//   /**
//    * Fetch today's attendance state for an employee.
//    * Cross-domain orchestration: Checks Leave and Holiday bounded contexts.
//    */
//   async getTodayAttendance(user) {
//     const todayStart = startOfDay(new Date());
//     const todayEnd = endOfDay(new Date());

//     let daily = await AttendanceDaily.findOne({
//       user: user._id,
//       organizationId: user.organizationId,
//       date: { $gte: todayStart, $lte: todayEnd },
//     }).populate([
//       { path: 'shiftId', select: 'name startTime endTime gracePeriodMins' },
//       { path: 'logs', select: 'timestamp type source' },
//       { path: 'leaveRequestId', select: 'leaveType status' },
//     ]);

//     if (!daily) {
//       const userData = await User.findById(user._id).lean();
//       const shift = userData?.attendanceConfig?.shiftId
//         ? await Shift.findById(userData.attendanceConfig.shiftId).lean()
//         : null;

//       // Cross-domain call to Leave Management (Holiday)
//       const holiday = await Holiday.findOne({
//         organizationId: user.organizationId,
//         $or: [{ branchId: user.branchId }, { branchId: null }],
//         date: { $gte: todayStart, $lte: todayEnd },
//         isActive: true,
//       }).lean();

//       // Cross-domain call to Leave Management (LeaveRequest)
//       const leave = await LeaveRequest.findOne({
//         user: user._id,
//         organizationId: user.organizationId,
//         status: 'approved',
//         startDate: { $lte: todayEnd },
//         endDate: { $gte: todayStart },
//       }).lean();

//       daily = {
//         date: todayStart,
//         shiftId: shift,
//         scheduledInTime: shift?.startTime,
//         scheduledOutTime: shift?.endTime,
//         status: leave ? 'on_leave' : (holiday ? 'holiday' : 'absent'),
//         logs: [],
//         firstIn: null,
//         lastOut: null,
//         totalWorkHours: 0,
//       };
//     }

//     const todayLogs = await AttendanceLog.find({
//       user: user._id,
//       timestamp: { $gte: todayStart, $lte: todayEnd },
//     }).sort('timestamp');

//     return {
//       ...(daily.toObject ? daily.toObject() : daily),
//       todaysLogs: todayLogs,
//     };
//   }
// }

// module.exports = new AttendanceDailyService();
