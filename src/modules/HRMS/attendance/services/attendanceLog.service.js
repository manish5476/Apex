const mongoose = require('mongoose');
const repo = require('../repository/attendanceLog.repository');
const AttendanceLog = require('../models/attendanceLog.model');
const AttendanceDaily = require('../models/attendanceDaily.model');
const Employee = require('../../core-hr/models/employee.model');
const User = require('../../../auth/core/user.model');
const Shift = require('../models/shift.model');
const AppError = require('../../../../core/utils/api/appError');
const { startOfDay, endOfDay } = require('../../../../core/utils/dateHelpers');

class AttendanceLogService {

  // --- Internal Helpers ---
  _calculateWorkHours(firstIn, lastOut) {
    if (!firstIn || !lastOut) return 0;
    const diffMs = lastOut - firstIn;
    return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
  }

  async _checkGeoFence(coordinates, orgId, branchId, userId, employee) {
    const [longitude, latitude] = coordinates;
    const geofences = await repo.getActiveGeofences(orgId, branchId);

    if (geofences.length === 0) return { status: 'disabled', geofence: null };

    for (const geofence of geofences) {
      if (!geofence.applicableToAll) {
        const isApplicable =
          geofence.applicableUsers?.some(id => id.equals(userId)) ||
          geofence.applicableDepartments?.some(id => employee?.departmentId && id.equals(employee.departmentId)) ||
          geofence.applicableDesignations?.some(id => employee?.designationId && id.equals(employee.designationId));
        if (!isApplicable) continue;
      }

      if (geofence.timeRestrictions?.length) {
        const now = new Date();
        const restriction = geofence.timeRestrictions.find(r => r.dayOfWeek.includes(now.getDay()));
        if (restriction && !restriction.allowed) continue;
      }

      try {
        if (geofence.isPointInside(longitude, latitude)) return { status: 'inside', geofence };
      } catch {
        // Polygon types fallback (MongoDB $geoWithin should be used in production)
      }
    }
    return { status: 'outside', geofence: null };
  }

  // Idempotent reconciliation logic (FIX BUG-AL-C01, BUG-AL-C03)
  async _processLogForDaily(log, session) {
    const dayStart = startOfDay(log.timestamp);
    const dayEnd = endOfDay(log.timestamp);

    let daily = await AttendanceDaily.findOne({
      user: log.user, organizationId: log.organizationId, date: { $gte: dayStart, $lte: dayEnd }
    }).session(session);

    if (!daily) {
      const employee = await Employee.findOne({ user: log.user }).lean().session(session);
      const shift = employee?.attendanceConfig?.shiftId ? await Shift.findById(employee.attendanceConfig.shiftId).lean().session(session) : null;
      
      [daily] = await AttendanceDaily.create([{
        user: log.user, organizationId: log.organizationId, branchId: log.branchId,
        date: dayStart, shiftId: employee?.attendanceConfig?.shiftId,
        scheduledInTime: shift?.startTime, scheduledOutTime: shift?.endTime,
        status: 'absent', logs: []
      }], { session });
    }

    if (!daily.logs.includes(log._id)) daily.logs.push(log._id);

    if (log.type === 'in' || log.type === 'remote_in') {
      if (!daily.firstIn || log.timestamp < daily.firstIn) daily.firstIn = log.timestamp;
    } else if (log.type === 'out' || log.type === 'remote_out') {
      if (!daily.lastOut || log.timestamp > daily.lastOut) daily.lastOut = log.timestamp;
    }

    if (daily.firstIn && daily.lastOut) {
      daily.totalWorkHours = this._calculateWorkHours(daily.firstIn, daily.lastOut);
    }

    await daily.save({ session });
    return daily;
  }

  // --- Core Endpoints ---

  async createManualPunch(orgId, user, payload, source, ipAddress, userAgent, deviceId) {
    const employee = await Employee.findOne({ user: user._id, organizationId: orgId });
    if (!employee) throw new AppError('Employee profile not found', 404);
    if (!employee.attendanceConfig?.isAttendanceEnabled) throw new AppError('Attendance is disabled', 403);
    if (source === 'web' && !employee.attendanceConfig?.allowWebPunch) throw new AppError('Web punch disabled', 403);
    if (source === 'mobile' && !employee.attendanceConfig?.allowMobilePunch) throw new AppError('Mobile punch disabled', 403);

    // FIX BUG-AL-C10: Duplicate punch prevention (30 seconds)
    if (await repo.getRecentLog(user._id, payload.type, 30)) {
      throw new AppError('Please wait 30 seconds between punches of the same type', 429);
    }

    let geofenceStatus = 'disabled', geofenceId = null;
    if (payload.location?.geoJson?.coordinates) {
      const geoResult = await this._checkGeoFence(payload.location.geoJson.coordinates, orgId, user.branchId, user._id, employee);
      geofenceStatus = geoResult.status;
      geofenceId = geoResult.geofence?._id || null;

      if (employee.attendanceConfig?.enforceGeoFence && geofenceStatus === 'outside') {
        throw new AppError('You are outside the allowed geofence area', 403);
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
      const [log] = await AttendanceLog.create([{
        user: user._id, organizationId: orgId, branchId: user.branchId, source, type: payload.type,
        timestamp, serverTimestamp: new Date(), processingStatus: 'pending',
        ipAddress, userAgent, deviceId,
        location: payload.location?.geoJson?.coordinates ? { ...payload.location, geoJson: { type: 'Point', coordinates: payload.location.geoJson.coordinates }, geofenceStatus, geofenceId } : undefined
      }], { session });

      const daily = await this._processLogForDaily(log, session);

      log.processingStatus = 'processed';
      log.isVerified = true;
      log.dailyAttendanceId = daily._id;
      await log.save({ session });

      await session.commitTransaction();
      await log.populate([{ path: 'machineId', select: 'name serialNumber' }]);

      return { log, daily };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // FIX BUG-AM-C04: Atomic Machine Sync with Transaction
  async bulkSyncMachineLogs(machine, logsArray) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const results = { created: [], duplicates: [], errors: [] };

      // Cache User lookups to prevent massive N+1 queries
      const uniqueMachineUserIds = [...new Set(logsArray.map(l => l.userId))];
      const users = await User.find({ organizationId: machine.organizationId, 'attendanceConfig.machineUserId': { $in: uniqueMachineUserIds } }).select('_id attendanceConfig branchId').lean().session(session);
      const userMap = Object.fromEntries(users.map(u => [u.attendanceConfig.machineUserId, u]));

      for (const logData of logsArray) {
        try {
          const existing = await AttendanceLog.findOne({
            machineId: machine._id, timestamp: new Date(logData.timestamp)
          }).session(session);

          if (existing) { results.duplicates.push(logData); continue; }

          const mappedUser = userMap[logData.userId];
          if (!mappedUser) {
            results.errors.push({ userId: logData.userId, reason: 'Unmapped Machine User ID' });
            continue;
          }

          const [log] = await AttendanceLog.create([{
            user: mappedUser._id, organizationId: machine.organizationId, branchId: machine.branchId,
            machineId: machine._id, source: 'machine', type: logData.type,
            timestamp: new Date(logData.timestamp), serverTimestamp: new Date(),
            biometricData: logData.biometricData, processingStatus: 'pending'
          }], { session });

          await this._processLogForDaily(log, session);

          log.processingStatus = 'processed';
          await log.save({ session });
          results.created.push(log);
        } catch (err) {
          results.errors.push({ data: logData, error: err.message });
        }
      }

      // FIX BUG-AL-C04: Atomic $inc update, preventing race conditions
      if (results.created.length > 0) {
        await mongoose.model('AttendanceMachine').findByIdAndUpdate(machine._id, {
          $inc: { 'stats.totalTransactions': results.created.length, 'stats.successfulReads': results.created.length },
          $set: { 'stats.lastTransactionAt': new Date() }
        }, { session });
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

  // FIX BUG-AL-C07 & CROSS-C03
  async correctLog(orgId, logId, payload, actorId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const originalLog = await repo.getById(orgId, logId, session);
      if (!originalLog) {
        await session.abortTransaction();
        throw new AppError('Log not found', 404);
      }

      originalLog.processingStatus = 'corrected';
      originalLog.notes = `Corrected: ${payload.reason}`;
      await originalLog.save({ session });

      const [correctedLog] = await AttendanceLog.create([{
        user: originalLog.user, organizationId: originalLog.organizationId, branchId: originalLog.branchId,
        machineId: originalLog.machineId, source: originalLog.source,
        timestamp: new Date(payload.timestamp), type: payload.type, serverTimestamp: new Date(),
        processingStatus: 'processed', isCorrection: true, originalLogId: originalLog._id,
        notes: payload.reason, verifiedBy: actorId, verifiedAt: new Date(), isVerified: true
      }], { session });

      await this._processLogForDaily(correctedLog, session);
      
      await session.commitTransaction();
      return { originalLog, correctedLog };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new AttendanceLogService();