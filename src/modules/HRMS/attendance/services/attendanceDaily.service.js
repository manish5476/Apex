// src/modules/HRMS/attendance/services/attendanceDaily.service.js
const AttendanceDaily = require('../models/attendanceDaily.model');
const AttendanceLog = require('../models/attendanceLog.model');
const Shift = require('../models/shift.model');
const User = require('../../../auth/core/user.model');
const Holiday = require('../../leave-management/models/holiday.model');
const LeaveRequest = require('../../leave-management/models/leaveRequest.model');
const { startOfDay, endOfDay, parseQueryDate } = require('../../../../core/utils/dateHelpers.js');

class AttendanceDailyService {
  
  /**
   * Calculate net work hours from firstIn/lastOut, deducting breaks.
   */
  calculateWorkHours(firstIn, lastOut, breaks = []) {
    if (!firstIn || !lastOut) return 0;
    const totalMs = lastOut - firstIn;
    let totalHours = totalMs / (1000 * 60 * 60);
    breaks.forEach(b => {
      if (b.start && b.end) totalHours -= (b.end - b.start) / (1000 * 60 * 60);
    });
    return Math.max(0, Math.round(totalHours * 100) / 100);
  }

  /**
   * Determine attendance status based on priority:
   * leave > holiday > week_off > present/absent
   */
  determineStatus(daily, shift, holiday, leave) {
    if (leave) return 'on_leave';
    if (holiday) return holiday.isOptional ? 'present' : 'holiday';
    if (shift && shift.weeklyOffs?.includes(new Date(daily.date).getUTCDay())) {
      return 'week_off';
    }
    if (daily.firstIn) {
      if (daily.isHalfDay) return 'half_day';
      if (daily.isLate) return 'late';
      return 'present';
    }
    return 'absent';
  }

  calculateOvertime(totalWorkHours, shift) {
    if (!shift?.overtimeRules?.enabled) return 0;
    const regularHours = shift.overtimeRules.afterHours || 8;
    if (totalWorkHours <= regularHours) return 0;
    return Math.round((totalWorkHours - regularHours) * 100) / 100;
  }

  /**
   * Fetch today's attendance state for an employee.
   * Cross-domain orchestration: Checks Leave and Holiday bounded contexts.
   */
  async getTodayAttendance(user) {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    let daily = await AttendanceDaily.findOne({
      user: user._id,
      organizationId: user.organizationId,
      date: { $gte: todayStart, $lte: todayEnd },
    }).populate([
      { path: 'shiftId', select: 'name startTime endTime gracePeriodMins' },
      { path: 'logs', select: 'timestamp type source' },
      { path: 'leaveRequestId', select: 'leaveType status' },
    ]);

    if (!daily) {
      const userData = await User.findById(user._id).lean();
      const shift = userData?.attendanceConfig?.shiftId
        ? await Shift.findById(userData.attendanceConfig.shiftId).lean()
        : null;

      // Cross-domain call to Leave Management (Holiday)
      const holiday = await Holiday.findOne({
        organizationId: user.organizationId,
        $or: [{ branchId: user.branchId }, { branchId: null }],
        date: { $gte: todayStart, $lte: todayEnd },
        isActive: true,
      }).lean();

      // Cross-domain call to Leave Management (LeaveRequest)
      const leave = await LeaveRequest.findOne({
        user: user._id,
        organizationId: user.organizationId,
        status: 'approved',
        startDate: { $lte: todayEnd },
        endDate: { $gte: todayStart },
      }).lean();

      daily = {
        date: todayStart,
        shiftId: shift,
        scheduledInTime: shift?.startTime,
        scheduledOutTime: shift?.endTime,
        status: leave ? 'on_leave' : (holiday ? 'holiday' : 'absent'),
        logs: [],
        firstIn: null,
        lastOut: null,
        totalWorkHours: 0,
      };
    }

    const todayLogs = await AttendanceLog.find({
      user: user._id,
      timestamp: { $gte: todayStart, $lte: todayEnd },
    }).sort('timestamp');

    return {
      ...(daily.toObject ? daily.toObject() : daily),
      todaysLogs: todayLogs,
    };
  }
}

module.exports = new AttendanceDailyService();
