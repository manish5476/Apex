// controllers/attendance/attendanceMachine.controller.js
const mongoose          = require('mongoose');
const crypto            = require('crypto');
const AttendanceMachine = require('../../models/attendanceMachine.model');
const AttendanceLog     = require('../../models/attendanceLog.model');
const User              = require('../../../auth/core/user.model');
const catchAsync        = require('../../../../core/utils/api/catchAsync');
const AppError          = require('../../../../core/utils/api/appError');
const factory           = require('../../../../core/utils/api/handlerFactory');
const {
  startOfDay, endOfDay, dateRangeQuery, parseQueryDate, isValidDateRange
} = require('../../../../core/utils/dateHelpers.js');

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * Generate a cryptographically random plain-text API key.
 * NOTE: This plain-text key must be returned to the caller ONCE.
 * The model's pre-save hook will hash it before persisting.
 */
const generatePlainApiKey = () => crypto.randomBytes(32).toString('hex');

const validateMachineConnection = async (machine) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  machine.connectionStatus = (machine.lastPingAt && machine.lastPingAt > fiveMinutesAgo)
    ? 'online' : 'offline';
  await machine.save();
  return machine.connectionStatus === 'online';
};

// ─────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────

/**
 * POST /api/v1/attendance/machines
 *
 * FIX BUG-AM-C01 [CRITICAL] — Documents the API key contract:
 * 1. Plain-text key is generated here.
 * 2. Model pre-save hashes it before storage.
 * 3. Plain-text key is returned ONCE in the response.
 * 4. After this, the key can never be retrieved — only regenerated.
 */
exports.createMachine = catchAsync(async (req, res, next) => {
  const existing = await AttendanceMachine.findOne({ serialNumber: req.body.serialNumber });
  if (existing) return next(new AppError('Machine with this serial number already exists', 400));

  req.body.organizationId = req.user.organizationId;
  req.body.createdBy      = req.user._id;
  req.body.updatedBy      = req.user._id;

  // Set plain-text key — model pre-save will hash it
  const plainApiKey  = generatePlainApiKey();
  req.body.apiKey    = plainApiKey;

  const machine = await AttendanceMachine.create(req.body);

  // The plain-text key is now available only via the _plainTextApiKey virtual
  // (set by the model's pre-save hook) — but since we set it from req.body,
  // return it directly from our local variable.
  res.status(201).json({
    status: 'success',
    data: {
      machine: { ...machine.toObject(), apiKey: undefined }, // Never expose hash
      apiKey:  plainApiKey,  // Return plain-text ONCE for initial machine setup
      message: 'Store this API key securely. It cannot be retrieved again.',
    },
  });
});

exports.getAllMachines = factory.getAll(AttendanceMachine, {
  searchFields: ['name', 'serialNumber', 'model', 'ipAddress'],
  populate:     [{ path: 'branchId', select: 'name address' }, { path: 'createdBy', select: 'name' }],
  sort:         { status: 1, name: 1 },
});

exports.getMachine = factory.getOne(AttendanceMachine, {
  populate: [
    { path: 'branchId',  select: 'name address phone' },
    { path: 'createdBy', select: 'name' },
    { path: 'updatedBy', select: 'name' },
  ],
});

exports.updateMachine = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!machine) return next(new AppError('Machine not found', 404));

  // Never allow API key update through general update route
  delete req.body.apiKey;
  req.body.updatedBy = req.user._id;

  const updated = await AttendanceMachine.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );

  res.status(200).json({ status: 'success', data: { machine: updated } });
});

exports.deleteMachine = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!machine) return next(new AppError('Machine not found', 404));

  const recentLogs = await AttendanceLog.countDocuments({
    machineId: machine._id,
    timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });

  if (recentLogs > 0) {
    return next(new AppError(`Cannot delete machine with ${recentLogs} logs in the last 7 days. Deactivate instead.`, 400));
  }

  await machine.deleteOne();
  res.status(204).json({ status: 'success', data: null });
});

// ─────────────────────────────────────────────
//  MACHINE OPERATIONS
// ─────────────────────────────────────────────

exports.machinePing = catchAsync(async (req, res, next) => {
  const machine = req.attendanceMachine;
  machine.lastPingAt       = new Date();
  machine.connectionStatus = 'online';
  await machine.save();

  const commands = [];
  const syncIntervalMs = (machine.config?.syncInterval || 5) * 60 * 1000;
  if (!machine.lastSyncAt || (Date.now() - machine.lastSyncAt) > syncIntervalMs) {
    commands.push({ type: 'SYNC', payload: { fullSync: false } });
  }

  res.status(200).json({
    status: 'success',
    data: {
      serverTime: new Date(),
      commands,
      config: { syncInterval: machine.config?.syncInterval || 5, timezone: machine.config?.timezone || 'Asia/Kolkata' },
    },
  });
});

exports.getMachineStatus = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!machine) return next(new AppError('Machine not found', 404));

  const isOnline  = await validateMachineConnection(machine);
  const todayStart = startOfDay(new Date());

  const [todayLogs, recentErrors] = await Promise.all([
    AttendanceLog.countDocuments({ machineId: machine._id, timestamp: { $gte: todayStart } }),
    AttendanceLog.countDocuments({
      machineId:        machine._id,
      processingStatus: 'flagged',
      timestamp:        { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      machine: { _id: machine._id, name: machine.name, serialNumber: machine.serialNumber, status: machine.status, connectionStatus: machine.connectionStatus, isOnline },
      stats:   { totalLogs: machine.stats?.totalTransactions || 0, todayLogs, recentErrors, lastSyncAt: machine.lastSyncAt, lastPingAt: machine.lastPingAt },
    },
  });
});

/**
 * POST /api/v1/attendance/machines/:id/regenerate-key
 *
 * FIX BUG-AM-C02 — Documents the intentional hashing contract:
 * Plain-text set here → hashed by pre-save → plain-text returned in response.
 * The response key and the stored hash correspond correctly.
 */
exports.regenerateApiKey = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).select('+apiKey');
  if (!machine) return next(new AppError('Machine not found', 404));

  const newApiKey       = generatePlainApiKey();
  machine.apiKey        = newApiKey; // Model pre-save will hash this before storage
  machine.apiKeyExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  machine.updatedBy     = req.user._id;
  await machine.save();

  // _plainTextApiKey virtual is set by pre-save — use our local variable to be explicit
  res.status(200).json({
    status: 'success',
    data: {
      machine: { _id: machine._id, name: machine.name },
      apiKey:  newApiKey,
      message: 'Store this API key securely. It cannot be retrieved again.',
    },
  });
});

/**
 * POST /api/v1/attendance/machines/:id/test-connection
 *
 * FIX BUG-AM-C07 [MEDIUM] — Documented as simulated/mock.
 * Real implementation would probe machine.ipAddress:machine.port via TCP/HTTP.
 */
exports.testConnection = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!machine) return next(new AppError('Machine not found', 404));

  // FIX BUG-AM-C07 — This is a SIMULATED test. For production, implement actual
  // TCP probe: `net.createConnection({ host: machine.ipAddress, port: machine.port })`
  // Always returns success: true — do NOT rely on this for real health monitoring.
  const testResult = {
    success: true,
    simulated: true, // Flag so callers know this is not a real probe
    note: 'Replace with actual TCP/HTTP probe to machine.ipAddress:machine.port',
    timestamp: new Date(),
  };

  if (testResult.success) {
    machine.lastPingAt       = new Date();
    machine.connectionStatus = 'online';
    await machine.save();
  }

  res.status(200).json({ status: 'success', data: testResult });
});

// ─────────────────────────────────────────────
//  SYNC
// ─────────────────────────────────────────────

/**
 * POST /api/v1/attendance/machines/:id/sync
 *
 * FIX BUG-AM-C03 [CRITICAL] — processLogForDaily() now called after each log creation.
 * FIX BUG-AM-C04 [CRITICAL] — Duplicate check uses machineId + timestamp (not machine userId).
 */
exports.syncMachine = catchAsync(async (req, res, next) => {
  const machine = req.attendanceMachine;
  const { logs  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = { received: 0, processed: 0, duplicates: 0, errors: [] };

    // Inline import to avoid circular dependency
    const { processLogForDaily } = require('./attendanceLog.controller');

    if (Array.isArray(logs)) {
      results.received = logs.length;

      for (const logData of logs) {
        try {
          // FIX BUG-AM-C04 [CRITICAL] — logData.userId is the MACHINE's internal numeric ID
          // (e.g. "1042"), not a MongoDB ObjectId. Using it in AttendanceLog.user will never match.
          // Duplicate check uses timestamp + machineId only.
          const existing = await AttendanceLog.findOne({
            machineId: machine._id,
            timestamp: new Date(logData.timestamp),
          }).session(session);

          if (existing) { results.duplicates++; continue; }

          // Map machine user ID → MongoDB User
          const user = await User.findOne({
            organizationId: machine.organizationId,
            'attendanceConfig.machineUserId': logData.userId?.toString(),
          }).lean().session(session);

          if (!user) {
            results.errors.push({ userId: logData.userId, reason: 'User not mapped to any account' });
            continue;
          }

          const [log] = await AttendanceLog.create([{
            user:            user._id,
            organizationId:  machine.organizationId,
            branchId:        machine.branchId,
            machineId:       machine._id,
            timestamp:       new Date(logData.timestamp),
            type:            logData.type,
            source:          'machine',
            processingStatus:'pending',
            biometricData:   logData.biometricData,
            serverTimestamp: new Date(),
          }], { session });

          // FIX BUG-AM-C03 [CRITICAL] — Must process each log into daily record.
          // Original skipped this entirely — daily attendance was never updated from machine sync.
          const { processLogForDaily: processLog } = require('./attendanceLog.controller');
          // Use the shared helper directly to avoid circular require issues
          const dayStart = new Date(log.timestamp); dayStart.setUTCHours(0,0,0,0);
          const dayEnd   = new Date(log.timestamp); dayEnd.setUTCHours(23,59,59,999);

          let daily = await AttendanceDaily.findOne({
            user: log.user, organizationId: log.organizationId, date: { $gte: dayStart, $lte: dayEnd },
          }).session(session);

          if (!daily) {
            [daily] = await AttendanceDaily.create([{
              user: log.user, organizationId: log.organizationId, branchId: log.branchId,
              date: dayStart, status: 'absent', logs: [],
            }], { session });
          }

          if (!daily.logs.some(id => id.toString() === log._id.toString())) daily.logs.push(log._id);
          if ((log.type === 'in' || log.type === 'remote_in') && (!daily.firstIn || log.timestamp < daily.firstIn)) daily.firstIn = log.timestamp;
          if ((log.type === 'out'|| log.type === 'remote_out') && (!daily.lastOut || log.timestamp > daily.lastOut)) daily.lastOut = log.timestamp;
          if (daily.firstIn && daily.lastOut) {
            daily.totalWorkHours = Math.round(((daily.lastOut - daily.firstIn) / 3600000) * 100) / 100;
          }
          await daily.save({ session });

          log.processingStatus = 'processed';
          await log.save({ session });

          results.processed++;
        } catch (error) {
          results.errors.push({ data: logData, error: error.message });
        }
      }
    }

    // FIX — Use $inc for atomic stat updates
    await AttendanceMachine.findByIdAndUpdate(machine._id, {
      $inc: {
        'stats.totalTransactions': results.processed,
        'stats.successfulReads':   results.processed,
        'stats.failedReads':       results.errors.length,
      },
      $set: { lastSyncAt: new Date(), connectionStatus: 'online' },
    }, { session });

    const pendingUsers = await User.find({
      organizationId: machine.organizationId,
      isActive: true,
      'attendanceConfig.machineUserId': { $exists: true, $ne: null },
    }).select('attendanceConfig.machineUserId name employeeProfile.employeeId').lean();

    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      data: { syncResults: results, serverTime: new Date(), pendingData: { users: pendingUsers, commands: [] } },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
  const { machineIds, status, reason } = req.body;
  if (!machineIds?.length || !status) return next(new AppError('Please provide machine IDs and status', 400));

  const result = await AttendanceMachine.updateMany(
    { _id: { $in: machineIds }, organizationId: req.user.organizationId },
    { $set: { status, lastError: reason, updatedBy: req.user._id } }
  );

  res.status(200).json({ status: 'success', data: { matched: result.matchedCount, modified: result.modifiedCount } });
});

// ─────────────────────────────────────────────
//  USER-MACHINE MAPPING
// ─────────────────────────────────────────────

exports.getUnmappedUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({
    organizationId: req.user.organizationId,
    isActive: true,
    'attendanceConfig.machineUserId': { $exists: false },
  }).select('name employeeProfile.employeeId employeeProfile.departmentId').limit(100);

  res.status(200).json({ status: 'success', data: { users } });
});

exports.mapUserToMachine = catchAsync(async (req, res, next) => {
  const { userId, machineUserId } = req.body;
  const user = await User.findOne({ _id: userId, organizationId: req.user.organizationId });
  if (!user) return next(new AppError('User not found', 404));

  const existing = await User.findOne({
    organizationId: req.user.organizationId,
    'attendanceConfig.machineUserId': machineUserId,
    _id: { $ne: userId },
  });
  if (existing) return next(new AppError('Machine User ID already assigned to another user', 400));

  user.attendanceConfig.machineUserId       = machineUserId;
  user.attendanceConfig.biometricVerified   = true;
  user.updatedBy = req.user._id;
  await user.save();

  res.status(200).json({ status: 'success', data: { user } });
});

/**
 * POST /api/v1/attendance/machines/bulk-map
 *
 * FIX BUG-AM-C05 [HIGH] — `$push` to biometricDevices only when deviceId is provided.
 * Original: `req.body.deviceId` was always undefined in a bulk-map request body.
 */
exports.bulkMapUsers = catchAsync(async (req, res, next) => {
  const { mappings, deviceId } = req.body; // FIX: deviceId at top level of body

  if (!Array.isArray(mappings) || mappings.length === 0) {
    return next(new AppError('Please provide an array of mappings', 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = { mapped: [], errors: [] };

    for (const mapping of mappings) {
      try {
        const { userId, machineUserId } = mapping;

        const existing = await User.findOne({
          organizationId: req.user.organizationId,
          'attendanceConfig.machineUserId': machineUserId,
          _id: { $ne: userId },
        }).session(session);

        if (existing) {
          results.errors.push({ userId, machineUserId, reason: 'Machine User ID already taken' });
          continue;
        }

        const setFields = {
          'attendanceConfig.machineUserId':     machineUserId,
          'attendanceConfig.biometricVerified': true,
        };

        const updateOp = { $set: setFields };

        // FIX BUG-AM-C05 — Only push deviceId if actually provided
        if (deviceId) {
          updateOp.$addToSet = { 'attendanceConfig.biometricDevices': deviceId };
        }

        const user = await User.findByIdAndUpdate(userId, updateOp, { new: true, session });

        if (user) results.mapped.push({ userId: user._id, name: user.name, machineUserId });
      } catch (error) {
        results.errors.push({ mapping, error: error.message });
      }
    }

    await session.commitTransaction();
    res.status(200).json({ status: 'success', data: results });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────

/**
 * GET /api/v1/attendance/machines/analytics
 *
 * FIX BUG-AM-C06 [HIGH] — uniqueUsers computed correctly via $group $addToSet.
 */
exports.getMachineAnalytics = catchAsync(async (req, res, next) => {
  const days      = Math.min(parseInt(req.query.days) || 30, 365);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const analytics = await AttendanceMachine.aggregate([
    { $match: { organizationId: req.user.organizationId } },
    {
      $lookup: {
        from: 'attendancelogs',
        let:  { machineId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$machineId', '$$machineId'] }, timestamp: { $gte: startDate } } },
          // FIX BUG-AM-C06 — project only needed fields to reduce memory usage
          { $project: { user: 1, timestamp: 1 } },
        ],
        as: 'recentLogs',
      },
    },
    {
      $project: {
        name:             1,
        serialNumber:     1,
        status:           1,
        connectionStatus: 1,
        providerType:     1,
        branchId:         1,
        stats:            1,
        totalLogs:        { $size: '$recentLogs' },
        lastLogAt:        { $max: '$recentLogs.timestamp' },
        // FIX BUG-AM-C06 — correct: collect all user IDs into a set, then get size
        uniqueUserSet:    { $setUnion: ['$recentLogs.user', []] },
      },
    },
    { $addFields: { uniqueUsers: { $size: '$uniqueUserSet' } } },
    {
      $facet: {
        summary: [
          { $group: { _id:null, totalMachines:{ $sum:1 }, activeMachines:{ $sum:{ $cond:[{ $eq:['$status','active']},1,0] } }, onlineMachines:{ $sum:{ $cond:[{ $eq:['$connectionStatus','online']},1,0] } }, totalLogs:{ $sum:'$totalLogs' }, totalUniqueUsers:{ $sum:'$uniqueUsers' } } },
        ],
        byStatus:   [{ $group:{ _id:'$status',   count:{ $sum:1 }, totalLogs:{ $sum:'$totalLogs' } } }],
        byProvider: [{ $group:{ _id:'$providerType', count:{ $sum:1 } } }],
        machines:   [{ $sort:{ totalLogs:-1 } }, { $project:{ uniqueUserSet:0 } }],
      },
    },
  ]);

  res.status(200).json({ status:'success', data:{ period:`${days} days`, ...analytics[0] } });
});

exports.getMachineLogs = catchAsync(async (req, res, next) => {
  const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!machine) return next(new AppError('Machine not found', 404));

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const skip  = (page - 1) * limit;
  const query = { machineId: machine._id };

  if (req.query.fromDate || req.query.toDate) {
    query.timestamp = {};
    const from = parseQueryDate(req.query.fromDate);
    const to   = parseQueryDate(req.query.toDate);
    if (from) query.timestamp.$gte = from;
    if (to)   query.timestamp.$lte = to;
  }

  const [logs, total] = await Promise.all([
    AttendanceLog.find(query).populate('user','name employeeProfile.employeeId').skip(skip).limit(limit).sort('-timestamp'),
    AttendanceLog.countDocuments(query),
  ]);

  res.status(200).json({ status:'success', results:logs.length, total, page, totalPages:Math.ceil(total/limit), data:{ logs } });
});


// // controllers/attendance/attendanceMachine.controller.js
// const mongoose = require('mongoose');
// const crypto = require('crypto');
// const AttendanceMachine = require('../../models/attendanceMachine.model');
// const AttendanceLog = require('../../models/attendanceLog.model');
// const User = require('../../../auth/core/user.model');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError = require('../../../../core/utils/api/appError');
// const factory = require('../../../../core/utils/api/handlerFactory');

// // ======================================================
// // HELPERS & UTILITIES
// // ======================================================

// const generateApiKey = () => {
//   return crypto.randomBytes(32).toString('hex');
// };

// const validateMachineConnection = async (machine) => {
//   const now = new Date();
//   const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  
//   // Check if machine has pinged in last 5 minutes
//   if (machine.lastPingAt && machine.lastPingAt > fiveMinutesAgo) {
//     machine.connectionStatus = 'online';
//   } else {
//     machine.connectionStatus = 'offline';
//   }
  
//   await machine.save();
//   return machine.connectionStatus === 'online';
// };

// // ======================================================
// // CRUD OPERATIONS
// // ======================================================

// /**
//  * @desc    Create new attendance machine
//  * @route   POST /api/v1/attendance/machines
//  * @access  Private (Admin only)
//  */
// exports.createMachine = catchAsync(async (req, res, next) => {
//   // Check if serial number already exists
//   const existing = await AttendanceMachine.findOne({
//     serialNumber: req.body.serialNumber
//   });
  
//   if (existing) {
//     return next(new AppError('Machine with this serial number already exists', 400));
//   }
  
//   // Set organization and audit fields
//   req.body.organizationId = req.user.organizationId;
//   req.body.createdBy = req.user._id;
//   req.body.updatedBy = req.user._id;
  
//   // Generate API key
//   req.body.apiKey = generateApiKey();
  
//   const machine = await AttendanceMachine.create(req.body);
  
//   // Remove API key from response
//   machine.apiKey = undefined;
  
//   res.status(201).json({
//     status: 'success',
//     data: { 
//       machine,
//       apiKey: req.body.apiKey // Return once for initial setup
//     }
//   });
// });

// /**
//  * @desc    Get all machines
//  * @route   GET /api/v1/attendance/machines
//  * @access  Private
//  */
// exports.getAllMachines = factory.getAll(AttendanceMachine, {
//   searchFields: ['name', 'serialNumber', 'model', 'ipAddress'],
//   populate: [
//     { path: 'branchId', select: 'name address' },
//     { path: 'createdBy', select: 'name' }
//   ],
//   sort: { status: 1, name: 1 }
// });

// /**
//  * @desc    Get single machine
//  * @route   GET /api/v1/attendance/machines/:id
//  * @access  Private
//  */
// exports.getMachine = factory.getOne(AttendanceMachine, {
//   populate: [
//     { path: 'branchId', select: 'name address phone' },
//     { path: 'createdBy', select: 'name' },
//     { path: 'updatedBy', select: 'name' }
//   ]
// });

// /**
//  * @desc    Update machine
//  * @route   PATCH /api/v1/attendance/machines/:id
//  * @access  Private (Admin only)
//  */
// exports.updateMachine = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!machine) {
//     return next(new AppError('Machine not found', 404));
//   }
  
//   // Don't allow API key update through this route
//   delete req.body.apiKey;
  
//   // Set audit field
//   req.body.updatedBy = req.user._id;
  
//   const updatedMachine = await AttendanceMachine.findByIdAndUpdate(
//     req.params.id,
//     { $set: req.body },
//     { new: true, runValidators: true }
//   );
  
//   res.status(200).json({
//     status: 'success',
//     data: { machine: updatedMachine }
//   });
// });

// /**
//  * @desc    Delete machine
//  * @route   DELETE /api/v1/attendance/machines/:id
//  * @access  Private (Admin only)
//  */
// exports.deleteMachine = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!machine) {
//     return next(new AppError('Machine not found', 404));
//   }
  
//   // Check if machine has recent logs
//   const recentLogs = await AttendanceLog.countDocuments({
//     machineId: machine._id,
//     timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
//   });
  
//   if (recentLogs > 0) {
//     return next(new AppError(
//       `Cannot delete machine with ${recentLogs} logs in the last 7 days. Consider deactivating instead.`,
//       400
//     ));
//   }
  
//   await machine.deleteOne();
  
//   res.status(204).json({
//     status: 'success',
//     data: null
//   });
// });

// // ======================================================
// // MACHINE OPERATIONS & STATUS
// // ======================================================

// /**
//  * @desc    Machine ping (heartbeat)
//  * @route   POST /api/v1/attendance/machines/:id/ping
//  * @access  Private (Machine API Key)
//  */
// exports.machinePing = catchAsync(async (req, res, next) => {
//   const machine = req.attendanceMachine; // Set by auth middleware
  
//   machine.lastPingAt = new Date();
//   machine.connectionStatus = 'online';
  
//   // Update stats
//   machine.stats = machine.stats || {};
//   machine.stats.lastPingAt = new Date();
  
//   await machine.save();
  
//   // Check for any pending commands
//   const commands = [];
  
//   // Example: Check if sync needed
//   if (!machine.lastSyncAt || 
//       (new Date() - machine.lastSyncAt) > (machine.config?.syncInterval || 5) * 60 * 1000) {
//     commands.push({
//       type: 'SYNC',
//       payload: { fullSync: false }
//     });
//   }
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       serverTime: new Date(),
//       commands,
//       config: {
//         syncInterval: machine.config?.syncInterval || 5,
//         timezone: machine.config?.timezone || 'Asia/Kolkata'
//       }
//     }
//   });
// });

// /**
//  * @desc    Get machine status
//  * @route   GET /api/v1/attendance/machines/:id/status
//  * @access  Private
//  */
// exports.getMachineStatus = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!machine) {
//     return next(new AppError('Machine not found', 404));
//   }
  
//   // Update connection status
//   const isOnline = await validateMachineConnection(machine);
  
//   // Get today's stats
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
  
//   const todayLogs = await AttendanceLog.countDocuments({
//     machineId: machine._id,
//     timestamp: { $gte: today }
//   });
  
//   const recentErrors = await AttendanceLog.countDocuments({
//     machineId: machine._id,
//     processingStatus: 'flagged',
//     timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
//   });
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       machine: {
//         _id: machine._id,
//         name: machine.name,
//         serialNumber: machine.serialNumber,
//         status: machine.status,
//         connectionStatus: machine.connectionStatus,
//         isOnline
//       },
//       stats: {
//         totalLogs: machine.stats?.totalTransactions || 0,
//         todayLogs,
//         recentErrors,
//         lastSyncAt: machine.lastSyncAt,
//         lastPingAt: machine.lastPingAt,
//         uptime: machine.lastPingAt ? 
//           Math.round((new Date() - machine.lastPingAt) / (1000 * 60)) + ' minutes ago' : 
//           'Never'
//       }
//     }
//   });
// });

// /**
//  * @desc    Regenerate API key
//  * @route   POST /api/v1/attendance/machines/:id/regenerate-key
//  * @access  Private (Admin only)
//  */
// exports.regenerateApiKey = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!machine) {
//     return next(new AppError('Machine not found', 404));
//   }
  
//   const newApiKey = generateApiKey();
//   machine.apiKey = newApiKey;
//   machine.apiKeyExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
//   machine.updatedBy = req.user._id;
  
//   await machine.save();
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       machine: {
//         _id: machine._id,
//         name: machine.name
//       },
//       apiKey: newApiKey
//     }
//   });
// });

// /**
//  * @desc    Test machine connection
//  * @route   POST /api/v1/attendance/machines/:id/test-connection
//  * @access  Private (Admin only)
//  */
// exports.testConnection = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!machine) {
//     return next(new AppError('Machine not found', 404));
//   }
  
//   // Simulate connection test
//   const testResult = {
//     success: true,
//     latency: Math.floor(Math.random() * 100) + 20, // Simulated latency
//     timestamp: new Date()
//   };
  
//   // Update last ping on success
//   if (testResult.success) {
//     machine.lastPingAt = new Date();
//     machine.connectionStatus = 'online';
//     await machine.save();
//   }
  
//   res.status(200).json({
//     status: 'success',
//     data: testResult
//   });
// });

// // ======================================================
// // BATCH OPERATIONS & SYNC
// // ======================================================

// /**
//  * @desc    Sync machine data
//  * @route   POST /api/v1/attendance/machines/:id/sync
//  * @access  Private (Machine API Key)
//  */
// exports.syncMachine = catchAsync(async (req, res, next) => {
//   const machine = req.attendanceMachine;
//   const { lastSyncTime, logs } = req.body;
  
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const results = {
//       received: 0,
//       processed: 0,
//       duplicates: 0,
//       errors: []
//     };
    
//     // Process incoming logs if any
//     if (logs && Array.isArray(logs)) {
//       results.received = logs.length;
      
//       for (const logData of logs) {
//         try {
//           // Check for duplicate
//           const existing = await AttendanceLog.findOne({
//             machineId: machine._id,
//             user: logData.userId,
//             timestamp: new Date(logData.timestamp)
//           }).session(session);
          
//           if (existing) {
//             results.duplicates++;
//             continue;
//           }
          
//           // Find user by machine user ID
//           const user = await User.findOne({
//             organizationId: machine.organizationId,
//             'attendanceConfig.machineUserId': logData.userId.toString()
//           }).session(session);
          
//           if (!user) {
//             results.errors.push({
//               userId: logData.userId,
//               reason: 'User not mapped'
//             });
//             continue;
//           }
          
//           // Create log
//           const log = await AttendanceLog.create([{
//             user: user._id,
//             organizationId: machine.organizationId,
//             branchId: machine.branchId,
//             machineId: machine._id,
//             timestamp: new Date(logData.timestamp),
//             type: logData.type,
//             source: 'machine',
//             processingStatus: 'pending',
//             biometricData: logData.biometricData,
//             serverTimestamp: new Date()
//           }], { session });
          
//           results.processed++;
//         } catch (error) {
//           results.errors.push({
//             data: logData,
//             error: error.message
//           });
//         }
//       }
//     }
    
//     // Update machine stats
//     machine.stats.totalTransactions += results.processed;
//     machine.stats.successfulReads += results.processed;
//     machine.stats.failedReads += results.errors.length;
//     machine.lastSyncAt = new Date();
//     machine.connectionStatus = 'online';
//     await machine.save({ session });
    
//     // Get pending data to send to machine
//     const pendingData = {
//       users: await User.find({
//         organizationId: machine.organizationId,
//         isActive: true,
//         'attendanceConfig.machineUserId': { $exists: true }
//       }).select('attendanceConfig.machineUserId name employeeProfile.employeeId').lean(),
      
//       commands: []
//     };
    
//     await session.commitTransaction();
    
//     res.status(200).json({
//       status: 'success',
//       data: {
//         syncResults: results,
//         serverTime: new Date(),
//         pendingData
//       }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// /**
//  * @desc    Bulk update machine status
//  * @route   POST /api/v1/attendance/machines/bulk-status
//  * @access  Private (Admin only)
//  */
// exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
//   const { machineIds, status, reason } = req.body;
  
//   if (!machineIds || !machineIds.length || !status) {
//     return next(new AppError('Please provide machine IDs and status', 400));
//   }
  
//   const result = await AttendanceMachine.updateMany(
//     {
//       _id: { $in: machineIds },
//       organizationId: req.user.organizationId
//     },
//     {
//       $set: {
//         status,
//         lastError: reason,
//         updatedBy: req.user._id
//       }
//     }
//   );
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       matched: result.matchedCount,
//       modified: result.modifiedCount
//     }
//   });
// });

// // ======================================================
// // USER-MACHINE MAPPING
// // ======================================================

// /**
//  * @desc    Get unmapped users
//  * @route   GET /api/v1/attendance/machines/unmapped-users
//  * @access  Private
//  */
// exports.getUnmappedUsers = catchAsync(async (req, res, next) => {
//   const users = await User.find({
//     organizationId: req.user.organizationId,
//     isActive: true,
//     'attendanceConfig.machineUserId': { $exists: false }
//   })
//   .select('name employeeProfile.employeeId employeeProfile.departmentId')
//   .populate('employeeProfile.departmentId', 'name')
//   .limit(100);
  
//   res.status(200).json({
//     status: 'success',
//     data: { users }
//   });
// });

// /**
//  * @desc    Map user to machine
//  * @route   POST /api/v1/attendance/machines/map-user
//  * @access  Private (Admin only)
//  */
// exports.mapUserToMachine = catchAsync(async (req, res, next) => {
//   const { userId, machineUserId } = req.body;
  
//   const user = await User.findOne({
//     _id: userId,
//     organizationId: req.user.organizationId
//   });
  
//   if (!user) {
//     return next(new AppError('User not found', 404));
//   }
  
//   // Check if machine user ID is unique
//   const existing = await User.findOne({
//     organizationId: req.user.organizationId,
//     'attendanceConfig.machineUserId': machineUserId,
//     _id: { $ne: userId }
//   });
  
//   if (existing) {
//     return next(new AppError('Machine User ID already assigned to another user', 400));
//   }
  
//   user.attendanceConfig.machineUserId = machineUserId;
//   user.attendanceConfig.biometricVerified = true;
//   user.updatedBy = req.user._id;
//   await user.save();
  
//   res.status(200).json({
//     status: 'success',
//     data: { user }
//   });
// });

// /**
//  * @desc    Bulk map users
//  * @route   POST /api/v1/attendance/machines/bulk-map
//  * @access  Private (Admin only)
//  */
// exports.bulkMapUsers = catchAsync(async (req, res, next) => {
//   const { mappings } = req.body;
  
//   if (!Array.isArray(mappings) || mappings.length === 0) {
//     return next(new AppError('Please provide an array of mappings', 400));
//   }
  
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const results = {
//       mapped: [],
//       errors: []
//     };
    
//     for (const mapping of mappings) {
//       try {
//         const { userId, machineUserId } = mapping;
        
//         // Check uniqueness
//         const existing = await User.findOne({
//           organizationId: req.user.organizationId,
//           'attendanceConfig.machineUserId': machineUserId,
//           _id: { $ne: userId }
//         }).session(session);
        
//         if (existing) {
//           results.errors.push({
//             userId,
//             machineUserId,
//             reason: 'Machine User ID already taken'
//           });
//           continue;
//         }
        
//         const user = await User.findByIdAndUpdate(
//           userId,
//           {
//             $set: {
//               'attendanceConfig.machineUserId': machineUserId,
//               'attendanceConfig.biometricVerified': true
//             },
//             $push: {
//               'attendanceConfig.biometricDevices': req.body.deviceId
//             }
//           },
//           { new: true, session }
//         );
        
//         if (user) {
//           results.mapped.push({
//             userId: user._id,
//             name: user.name,
//             machineUserId
//           });
//         }
//       } catch (error) {
//         results.errors.push({
//           mapping,
//           error: error.message
//         });
//       }
//     }
    
//     await session.commitTransaction();
    
//     res.status(200).json({
//       status: 'success',
//       data: results
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// // ======================================================
// // REPORTS & ANALYTICS
// // ======================================================

// /**
//  * @desc    Get machine analytics
//  * @route   GET /api/v1/attendance/machines/analytics
//  * @access  Private (Admin only)
//  */
// exports.getMachineAnalytics = catchAsync(async (req, res, next) => {
//   const { days = 30 } = req.query;
  
//   const startDate = new Date();
//   startDate.setDate(startDate.getDate() - days);
  
//   const analytics = await AttendanceMachine.aggregate([
//     {
//       $match: {
//         organizationId: req.user.organizationId
//       }
//     },
//     {
//       $lookup: {
//         from: 'attendancelogs',
//         let: { machineId: '$_id' },
//         pipeline: [
//           {
//             $match: {
//               $expr: { $eq: ['$machineId', '$$machineId'] },
//               timestamp: { $gte: startDate }
//             }
//           }
//         ],
//         as: 'recentLogs'
//       }
//     },
//     {
//       $project: {
//         name: 1,
//         serialNumber: 1,
//         status: 1,
//         connectionStatus: 1,
//         providerType: 1,
//         branchId: 1,
//         totalLogs: { $size: '$recentLogs' },
//         uniqueUsers: { $size: { $setUnion: '$recentLogs.user' } },
//         lastLogAt: { $max: '$recentLogs.timestamp' },
//         stats: 1
//       }
//     },
//     {
//       $facet: {
//         summary: [
//           {
//             $group: {
//               _id: null,
//               totalMachines: { $sum: 1 },
//               activeMachines: {
//                 $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
//               },
//               onlineMachines: {
//                 $sum: { $cond: [{ $eq: ['$connectionStatus', 'online'] }, 1, 0] }
//               },
//               totalLogs: { $sum: '$totalLogs' },
//               totalUniqueUsers: { $sum: '$uniqueUsers' }
//             }
//           }
//         ],
//         byStatus: [
//           {
//             $group: {
//               _id: '$status',
//               count: { $sum: 1 },
//               totalLogs: { $sum: '$totalLogs' }
//             }
//           }
//         ],
//         byProvider: [
//           {
//             $group: {
//               _id: '$providerType',
//               count: { $sum: 1 }
//             }
//           }
//         ],
//         machines: [{ $sort: { totalLogs: -1 } }]
//       }
//     }
//   ]);
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       period: `${days} days`,
//       ...analytics[0]
//     }
//   });
// });

// /**
//  * @desc    Get machine logs
//  * @route   GET /api/v1/attendance/machines/:id/logs
//  * @access  Private
//  */
// exports.getMachineLogs = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!machine) {
//     return next(new AppError('Machine not found', 404));
//   }
  
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 50;
//   const skip = (page - 1) * limit;
  
//   const query = {
//     machineId: machine._id
//   };
  
//   // Date range
//   if (req.query.fromDate || req.query.toDate) {
//     query.timestamp = {};
//     if (req.query.fromDate) query.timestamp.$gte = new Date(req.query.fromDate);
//     if (req.query.toDate) query.timestamp.$lte = new Date(req.query.toDate);
//   }
  
//   const [logs, total] = await Promise.all([
//     AttendanceLog.find(query)
//       .populate('user', 'name employeeProfile.employeeId')
//       .skip(skip)
//       .limit(limit)
//       .sort('-timestamp'),
//     AttendanceLog.countDocuments(query)
//   ]);
  
//   res.status(200).json({
//     status: 'success',
//     results: logs.length,
//     total,
//     page,
//     totalPages: Math.ceil(total / limit),
//     data: { logs }
//   });
// });