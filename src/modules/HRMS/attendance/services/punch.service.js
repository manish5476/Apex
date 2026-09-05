const mongoose = require('mongoose');
const attendanceRepository = require('../repository/attendance.repository');
const Employee = require('../../core-hr/models/employee.model');
const AppError = require('../../../../core/utils/api/appError');
const { startOfDay, endOfDay } = require('../../../../core/utils/dateHelpers');

class PunchService {

  // --- Core Domain Logic: Idempotent Daily Processing ---
  _calculateWorkHours(firstIn, lastOut) {
    if (!firstIn || !lastOut) return 0;
    const diffMs = lastOut - firstIn;
    return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
  }

  // Helper: compute break duration in minutes from a break object with startTime/endTime
  _breakDurationMins(breakObj) {
    if (!breakObj.startTime || !breakObj.endTime) return 0;
    const [sh, sm] = breakObj.startTime.split(':').map(Number);
    const [eh, em] = breakObj.endTime.split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return Math.max(0, end - start);
  }

  async _processLogIntoDaily(log, employee, session) {
    const dayStart = startOfDay(log.timestamp);
    const dayEnd = endOfDay(log.timestamp);

    let daily = await attendanceRepository.getDailyRecord(log.organizationId, log.user, dayStart, dayEnd, session);

    if (!daily) {
      daily = await attendanceRepository.createDailyRecord({
        user: log.user,
        organizationId: log.organizationId,
        branchId: log.branchId,
        date: dayStart,
        shiftId: employee?.attendanceConfig?.shiftId,
        status: 'absent',
        logs: []
      }, session);
    }

    // Link the log
    if (!daily.logs.includes(log._id)) {
      daily.logs.push(log._id);
    }

    // Time boundaries (First In, Last Out)
    const isPunchIn = log.type.includes('in');
    const isPunchOut = log.type.includes('out');

    if (isPunchIn && (!daily.firstIn || log.timestamp < daily.firstIn)) {
      daily.firstIn = log.timestamp;
    }
    if (isPunchOut && (!daily.lastOut || log.timestamp > daily.lastOut)) {
      daily.lastOut = log.timestamp;
    }

    // --- Resolve shift config for accurate late/half-day evaluation ---
    // Populates scheduledInTime/scheduledOutTime so the Mongoose pre-save hook
    // (attendanceDaily.model.js) can compute isLate + isHalfDay flags correctly.
    let shift = null;
    const shiftId = daily.shiftId || employee?.attendanceConfig?.shiftId;

    if (shiftId) {
      const Shift = mongoose.model('Shift');
      shift = await Shift.findById(shiftId).lean();
    }

    if (shift) {
      if (!daily.scheduledInTime) daily.scheduledInTime = shift.startTime;
      if (!daily.scheduledOutTime) daily.scheduledOutTime = shift.endTime;
    }

    // --- Compute work hours with break deduction ---
    if (daily.firstIn && daily.lastOut) {
      const grossHours = this._calculateWorkHours(daily.firstIn, daily.lastOut);

      // Deduct unpaid breaks from gross work hours
      let unpaidBreakHours = 0;
      if (shift) {
        if (shift.breaks && shift.breaks.length > 0) {
          const unpaidMins = shift.breaks
            .filter(b => !b.isPaid)
            .reduce((sum, b) => sum + this._breakDurationMins(b), 0);
          unpaidBreakHours = Math.round((unpaidMins / 60) * 100) / 100;
        } else if (shift.breakDurationMins > 0) {
          // Fallback: treat all breakDurationMins as unpaid
          unpaidBreakHours = Math.round((shift.breakDurationMins / 60) * 100) / 100;
        }
      }

      daily.breakHours = unpaidBreakHours;
      daily.totalWorkHours = Math.max(0, Math.round((grossHours - unpaidBreakHours) * 100) / 100);
    }

    // --- FIX [CRITICAL]: Derive attendance status from punches ---
    // Previously: status was initialized as 'absent' and NEVER updated,
    // so every employee appeared absent regardless of how many punches they recorded.
    // Now: any punch-in transitions 'absent' → 'present' | 'late' | 'half_day'.
    const protectedStatuses = ['on_leave', 'holiday', 'week_off'];
    if (!protectedStatuses.includes(daily.status) && daily.firstIn) {
      if (shift) {
        const graceMs = (shift.gracePeriodMins ?? 15) * 60 * 1000;
        const halfDayThresholdHrs = shift.halfDayThresholdHrs ?? 4;

        // Anchor scheduled-in to the real punch date (handles night shifts crossing midnight)
        const scheduledIn = new Date(daily.firstIn);
        const [inH, inM] = (shift.startTime || '09:00').split(':').map(Number);
        scheduledIn.setHours(inH, inM, 0, 0);

        const isLate = daily.firstIn > new Date(scheduledIn.getTime() + graceMs);
        const netHours = Math.max(0, daily.totalWorkHours);

        if (netHours > 0 && netHours < halfDayThresholdHrs) {
          daily.status = 'half_day';
          daily.isHalfDay = true;
          daily.isLate = isLate;
        } else if (isLate) {
          daily.status = 'late';
          daily.isLate = true;
          daily.isHalfDay = false;
        } else {
          daily.status = 'present';
          daily.isLate = false;
          daily.isHalfDay = false;
        }
      } else {
        // No shift template → any punch-in counts as present
        daily.status = 'present';
        daily.isLate = false;
        daily.isHalfDay = false;
      }
    }

    await daily.save({ session });
    return daily;
  }

  // --- Main Use Case: Employee Web/Mobile Punch ---
  async processManualPunch(orgId, user, payload, source, ipAddress, userAgent) {
    // 1. Employee Validation
    const employee = await Employee.findOne({ user: user._id, organizationId: orgId }).lean();
    if (!employee) throw new AppError('Employee profile not found', 404);
    if (!employee.attendanceConfig?.isAttendanceEnabled) throw new AppError('Attendance is disabled for your account', 403);

    // 2. Anti-Spam (30 seconds)
    const recentLog = await attendanceRepository.getRecentLog(orgId, user._id, payload.type, 30);
    if (recentLog) throw new AppError('Please wait 30 seconds between punches of the same type', 429);

    // 3. Geofence Evaluation
    let geofenceStatus = 'disabled';
    let geofenceId = null;

    if (payload.location?.geoJson?.coordinates?.length === 2) {
      const [lon, lat] = payload.location.geoJson.coordinates;
      const enclosingFence = await attendanceRepository.findEnclosingGeofence(orgId, lon, lat, user._id, employee.departmentId);
      
      if (enclosingFence) {
        geofenceStatus = 'inside';
        geofenceId = enclosingFence._id;
      } else {
        geofenceStatus = 'outside';
        if (employee.attendanceConfig?.enforceGeoFence) {
          throw new AppError('You are outside the allowed geofence area. Punch rejected.', 403);
        }
      }
    }

    // 4. Atomic Transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create Log
      const logData = {
        user: user._id,
        organizationId: orgId,
        branchId: user.branchId,
        source,
        type: payload.type,
        timestamp: payload.timestamp,
        serverTimestamp: new Date(),
        processingStatus: 'pending',
        ipAddress,
        userAgent,
        location: payload.location ? { ...payload.location, geofenceStatus, geofenceId } : undefined
      };

      const log = await attendanceRepository.createLog(logData, session);

      // Reconcile Daily Record
      const daily = await this._processLogIntoDaily(log, employee, session);

      // Mark Log Processed
      log.processingStatus = 'processed';
      log.isVerified = true;
      log.dailyAttendanceId = daily._id;
      await log.save({ session });

      await session.commitTransaction();

      // Async Domain Event (e.g., trigger notification for late check-in)
      // eventBus.publish('ATTENDANCE_PUNCHED', { userId: user._id, type: payload.type, time: payload.timestamp });

      return { log, daily };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new PunchService();