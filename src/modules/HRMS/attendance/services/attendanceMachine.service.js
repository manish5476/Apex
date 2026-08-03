const mongoose = require('mongoose');
const crypto = require('crypto');
const repo = require('../repository/attendanceMachine.repository');
const AttendanceLog = require('../models/attendanceLog.model');
const User = require('../../../auth/core/user.model');
const AppError = require('../../../../core/utils/api/appError');
const { startOfDay } = require('../../../../core/utils/dateHelpers');

class AttendanceMachineService {

  _generatePlainApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  async _validateMachineConnection(machine) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    machine.connectionStatus = (machine.lastPingAt && machine.lastPingAt > fiveMinutesAgo) ? 'online' : 'offline';
    await machine.save();
    return machine.connectionStatus === 'online';
  }

  // --- CRUD & Operations ---

  async createMachine(orgId, payload, actorId) {
    const existing = await repo.getBySerialNumber(payload.serialNumber);
    if (existing) throw new AppError('Machine with this serial number already exists', 400);

    const plainApiKey = this._generatePlainApiKey();
    payload.apiKey = plainApiKey; // Pre-save hook hashes it automatically
    payload.createdBy = actorId;
    payload.updatedBy = actorId;

    const machine = await repo.create(orgId, payload);
    return { machine, apiKey: plainApiKey };
  }

  async deleteMachine(orgId, id) {
    const machine = await repo.getById(orgId, id);
    if (!machine) throw new AppError('Machine not found', 404);

    const recentLogs = await AttendanceLog.countDocuments({
      machineId: machine._id,
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    if (recentLogs > 0) {
      throw new AppError(`Cannot delete machine with ${recentLogs} logs in the last 7 days. Deactivate it instead.`, 400);
    }
    await repo.deleteById(orgId, id);
  }

  async regenerateKey(orgId, id, actorId) {
    // We must select +apiKey so the pre-save hook can recognize modification
    const machine = await repo.getById(orgId, id, '+apiKey');
    if (!machine) throw new AppError('Machine not found', 404);

    const newApiKey = this._generatePlainApiKey();
    machine.apiKey = newApiKey;
    machine.apiKeyExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    machine.updatedBy = actorId;
    
    await machine.save();
    return { machine, apiKey: newApiKey };
  }

  async getMachineStatus(orgId, id) {
    const machine = await repo.getById(orgId, id);
    if (!machine) throw new AppError('Machine not found', 404);

    const isOnline = await this._validateMachineConnection(machine);
    const todayStart = startOfDay(new Date());

    const [todayLogs, recentErrors] = await Promise.all([
      AttendanceLog.countDocuments({ machineId: machine._id, timestamp: { $gte: todayStart } }),
      AttendanceLog.countDocuments({
        machineId: machine._id, processingStatus: 'flagged',
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);

    return { machine: { ...machine.toObject(), connectionStatus: machine.connectionStatus, isOnline }, stats: { todayLogs, recentErrors, lastSyncAt: machine.lastSyncAt } };
  }

  // --- User Mapping (Transactions) ---

  async mapSingleUser(orgId, userId, machineUserId, actorId) {
    const user = await User.findOne({ _id: userId, organizationId: orgId });
    if (!user) throw new AppError('User not found', 404);

    const existing = await User.findOne({
      organizationId: orgId, 'attendanceConfig.machineUserId': machineUserId, _id: { $ne: userId }
    });
    if (existing) throw new AppError('Machine User ID already assigned to another user', 400);

    user.attendanceConfig.machineUserId = machineUserId;
    user.attendanceConfig.biometricVerified = true;
    user.updatedBy = actorId;
    await user.save();
    return user;
  }

  async bulkMapUsers(orgId, mappings, deviceId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const results = { mapped: [], errors: [] };

      for (const mapping of mappings) {
        try {
          const { userId, machineUserId } = mapping;
          const existing = await User.findOne({
            organizationId: orgId, 'attendanceConfig.machineUserId': machineUserId, _id: { $ne: userId }
          }).session(session);

          if (existing) { results.errors.push({ userId, machineUserId, reason: 'Machine User ID taken' }); continue; }

          const updateOp = { $set: { 'attendanceConfig.machineUserId': machineUserId, 'attendanceConfig.biometricVerified': true } };
          if (deviceId) updateOp.$addToSet = { 'attendanceConfig.biometricDevices': deviceId };

          const user = await User.findByIdAndUpdate(userId, updateOp, { new: true, session });
          if (user) results.mapped.push({ userId: user._id, name: user.name, machineUserId });
        } catch (error) {
          results.errors.push({ mapping, error: error.message });
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

  async getAnalytics(orgId, requestedDays) {
    const days = Math.min(parseInt(requestedDays) || 30, 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await repo.getAnalyticsAggregation(orgId, startDate);
    return { period: `${days} days`, ...analytics[0] };
  }
}

module.exports = new AttendanceMachineService();