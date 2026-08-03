const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const { createMachineSchema, updateMachineSchema, bulkStatusSchema, mapUserSchema, bulkMapSchema } = require('../validation/attendanceMachine.validation');
const repo = require('../repository/attendanceMachine.repository');
const machineService = require('../services/attendanceMachine.service');
const attendanceLogService = require('../services/attendanceLog.service'); // Connected!
const { success, created, noContent } = require('../../middleware/responseFormatter');
const AttendanceMachine = require('../models/attendanceMachine.model');
const User = require('../../../auth/core/user.model');

// --- CRUD ---

exports.createMachine = catchAsync(async (req, res) => {
  const payload = createMachineSchema.parse(req.body);
  const result = await machineService.createMachine(req.user.organizationId, payload, req.user._id);
  
  return created(res, {
    machine: result.machine,
    apiKey: result.apiKey,
    message: 'Store this API key securely. It cannot be retrieved again.'
  });
});

exports.getAllMachines = catchAsync(async (req, res) => {
  const result = await repo.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getMachine = catchAsync(async (req, res, next) => {
  const machine = await repo.getById(req.user.organizationId, req.params.id);
  if (!machine) return next(new AppError('Machine not found', 404));
  return success(res, { machine });
});

exports.updateMachine = catchAsync(async (req, res, next) => {
  const payload = updateMachineSchema.parse(req.body);
  const machine = await repo.updateById(req.user.organizationId, req.params.id, payload);
  if (!machine) return next(new AppError('Machine not found', 404));
  return success(res, { machine });
});

exports.deleteMachine = catchAsync(async (req, res) => {
  await machineService.deleteMachine(req.user.organizationId, req.params.id);
  return noContent(res);
});

// --- Machine Specific Operations ---

exports.getMachineStatus = catchAsync(async (req, res) => {
  const result = await machineService.getMachineStatus(req.user.organizationId, req.params.id);
  return success(res, result);
});

exports.regenerateApiKey = catchAsync(async (req, res) => {
  const result = await machineService.regenerateKey(req.user.organizationId, req.params.id, req.user._id);
  return success(res, {
    machine: { _id: result.machine._id, name: result.machine.name },
    apiKey: result.apiKey,
    message: 'Store this API key securely. It cannot be retrieved again.'
  });
});

exports.testConnection = catchAsync(async (req, res, next) => {
  const machine = await repo.getById(req.user.organizationId, req.params.id);
  if (!machine) return next(new AppError('Machine not found', 404));

  // Simulated for now
  machine.lastPingAt = new Date();
  machine.connectionStatus = 'online';
  await machine.save();

  return success(res, { success: true, simulated: true, note: 'Replace with real TCP/HTTP probe', timestamp: new Date() });
});

exports.bulkUpdateStatus = catchAsync(async (req, res) => {
  const payload = bulkStatusSchema.parse(req.body);
  
  const result = await AttendanceMachine.updateMany(
    { _id: { $in: payload.machineIds }, organizationId: req.user.organizationId },
    { $set: { status: payload.status, lastError: payload.reason, updatedBy: req.user._id } }
  );

  return success(res, { status: payload.status, matched: result.matchedCount, modified: result.modifiedCount });
});

// --- Hardware Sync Routing ---

exports.machinePing = catchAsync(async (req, res) => {
  const machine = req.attendanceMachine; // Intercepted by auth middleware
  machine.lastPingAt = new Date();
  machine.connectionStatus = 'online';
  await machine.save();

  const commands = [];
  const syncIntervalMs = (machine.config?.syncInterval || 5) * 60 * 1000;
  if (!machine.lastSyncAt || (Date.now() - machine.lastSyncAt) > syncIntervalMs) {
    commands.push({ type: 'SYNC', payload: { fullSync: false } });
  }

  return success(res, { serverTime: new Date(), commands, config: machine.config });
});

/**
 * 🚀 The Beauty of Modular Architecture:
 * The syncMachine logic is no longer a 100-line controller file.
 * It simply hands the verified Machine and payload over to the Log Service.
 */
exports.syncMachine = catchAsync(async (req, res, next) => {
  if (!req.attendanceMachine) return next(new AppError('Machine context missing.', 401));

  // Delegate the massive transaction and reconciliation logic to the specialized Log Service
  const results = await attendanceLogService.bulkSyncMachineLogs(req.attendanceMachine, req.body.logs);

  const pendingUsers = await User.find({
    organizationId: req.attendanceMachine.organizationId,
    isActive: true,
    'attendanceConfig.machineUserId': { $exists: true, $ne: null },
  }).select('attendanceConfig.machineUserId name employeeProfile.employeeId').lean();

  return success(res, { syncResults: results, serverTime: new Date(), pendingData: { users: pendingUsers, commands: [] } });
});


// --- User Mapping ---

exports.getUnmappedUsers = catchAsync(async (req, res) => {
  const users = await User.find({
    organizationId: req.user.organizationId, isActive: true, 'attendanceConfig.machineUserId': { $exists: false }
  }).select('name employeeProfile.employeeId employeeProfile.departmentId').limit(100);
  return success(res, { users });
});

exports.mapUserToMachine = catchAsync(async (req, res) => {
  const payload = mapUserSchema.parse(req.body);
  const user = await machineService.mapSingleUser(req.user.organizationId, payload.userId, payload.machineUserId, req.user._id);
  return success(res, { user });
});

exports.bulkMapUsers = catchAsync(async (req, res) => {
  const payload = bulkMapSchema.parse(req.body);
  const results = await machineService.bulkMapUsers(req.user.organizationId, payload.mappings, payload.deviceId);
  return success(res, results);
});

// --- Analytics ---

exports.getMachineLogs = catchAsync(async (req, res, next) => {
  const machine = await repo.getById(req.user.organizationId, req.params.id);
  if (!machine) return next(new AppError('Machine not found', 404));

  const logRepo = require('../repository/attendanceLog.repository');
  req.query.machineId = machine._id;
  const result = await logRepo.getList(req.user.organizationId, req.query);
  
  return success(res, { logs: result.data }, 200, result.pagination);
});

exports.getMachineAnalytics = catchAsync(async (req, res) => {
  const data = await machineService.getAnalytics(req.user.organizationId, req.query.days);
  return success(res, data);
});


// // controllers/attendance/attendanceMachine.controller.js
// const mongoose          = require('mongoose');
// const crypto            = require('crypto');
// const AttendanceMachine = require('../../attendance/models/attendanceMachine.model');
// const AttendanceLog     = require('../../attendance/models/attendanceLog.model');
// const AttendanceDaily   = require('../../attendance/models/attendanceDaily.model');
// const User              = require('../../../auth/core/user.model');
// const catchAsync        = require('../../../../core/utils/api/catchAsync');
// const AppError          = require('../../../../core/utils/api/appError');
// const factory           = require('../../../../core/utils/api/handlerFactory');
// const {
//   startOfDay, endOfDay, dateRangeQuery, parseQueryDate, isValidDateRange
// } = require('../../../../core/utils/dateHelpers.js');

// // ─────────────────────────────────────────────
// //  HELPERS
// // ─────────────────────────────────────────────

// /**
//  * Generate a cryptographically random plain-text API key.
//  * NOTE: This plain-text key must be returned to the caller ONCE.
//  * The model's pre-save hook will hash it before persisting.
//  */
// const generatePlainApiKey = () => crypto.randomBytes(32).toString('hex');

// const validateMachineConnection = async (machine) => {
//   const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
//   machine.connectionStatus = (machine.lastPingAt && machine.lastPingAt > fiveMinutesAgo)
//     ? 'online' : 'offline';
//   await machine.save();
//   return machine.connectionStatus === 'online';
// };

// // ─────────────────────────────────────────────
// //  CRUD
// // ─────────────────────────────────────────────

// /**
//  * POST /api/v1/attendance/machines
//  *
//  * FIX BUG-AM-C01 [CRITICAL] — Documents the API key contract:
//  * 1. Plain-text key is generated here.
//  * 2. Model pre-save hashes it before storage.
//  * 3. Plain-text key is returned ONCE in the response.
//  * 4. After this, the key can never be retrieved — only regenerated.
//  */
// exports.createMachine = catchAsync(async (req, res, next) => {
//   const existing = await AttendanceMachine.findOne({ serialNumber: req.body.serialNumber });
//   if (existing) return next(new AppError('Machine with this serial number already exists', 400));

//   req.body.organizationId = req.user.organizationId;
//   req.body.createdBy      = req.user._id;
//   req.body.updatedBy      = req.user._id;

//   // Set plain-text key — model pre-save will hash it
//   const plainApiKey  = generatePlainApiKey();
//   req.body.apiKey    = plainApiKey;

//   const machine = await AttendanceMachine.create(req.body);

//   // The plain-text key is now available only via the _plainTextApiKey virtual
//   // (set by the model's pre-save hook) — but since we set it from req.body,
//   // return it directly from our local variable.
//   res.status(201).json({
//     status: 'success',
//     data: {
//       machine: { ...machine.toObject(), apiKey: undefined }, // Never expose hash
//       apiKey:  plainApiKey,  // Return plain-text ONCE for initial machine setup
//       message: 'Store this API key securely. It cannot be retrieved again.',
//     },
//   });
// });

// exports.getAllMachines = factory.getAll(AttendanceMachine, {
//   searchFields: ['name', 'serialNumber', 'model', 'ipAddress'],
//   populate:     [{ path: 'branchId', select: 'name address' }, { path: 'createdBy', select: 'name' }],
//   sort:         { status: 1, name: 1 },
// });

// exports.getMachine = factory.getOne(AttendanceMachine, {
//   populate: [
//     { path: 'branchId',  select: 'name address phone' },
//     { path: 'createdBy', select: 'name' },
//     { path: 'updatedBy', select: 'name' },
//   ],
// });

// exports.updateMachine = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!machine) return next(new AppError('Machine not found', 404));

//   // Never allow API key update through general update route
//   delete req.body.apiKey;
//   req.body.updatedBy = req.user._id;

//   const updated = await AttendanceMachine.findByIdAndUpdate(
//     req.params.id,
//     { $set: req.body },
//     { new: true, runValidators: true }
//   );

//   res.status(200).json({ status: 'success', data: { machine: updated } });
// });

// exports.deleteMachine = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!machine) return next(new AppError('Machine not found', 404));

//   const recentLogs = await AttendanceLog.countDocuments({
//     machineId: machine._id,
//     timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
//   });

//   if (recentLogs > 0) {
//     return next(new AppError(`Cannot delete machine with ${recentLogs} logs in the last 7 days. Deactivate instead.`, 400));
//   }

//   await machine.deleteOne();
//   res.status(204).json({ status: 'success', data: null });
// });

// // ─────────────────────────────────────────────
// //  MACHINE OPERATIONS
// // ─────────────────────────────────────────────

// exports.machinePing = catchAsync(async (req, res, next) => {
//   const machine = req.attendanceMachine;
//   machine.lastPingAt       = new Date();
//   machine.connectionStatus = 'online';
//   await machine.save();

//   const commands = [];
//   const syncIntervalMs = (machine.config?.syncInterval || 5) * 60 * 1000;
//   if (!machine.lastSyncAt || (Date.now() - machine.lastSyncAt) > syncIntervalMs) {
//     commands.push({ type: 'SYNC', payload: { fullSync: false } });
//   }

//   res.status(200).json({
//     status: 'success',
//     data: {
//       serverTime: new Date(),
//       commands,
//       config: { syncInterval: machine.config?.syncInterval || 5, timezone: machine.config?.timezone || 'Asia/Kolkata' },
//     },
//   });
// });

// exports.getMachineStatus = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!machine) return next(new AppError('Machine not found', 404));

//   const isOnline  = await validateMachineConnection(machine);
//   const todayStart = startOfDay(new Date());

//   const [todayLogs, recentErrors] = await Promise.all([
//     AttendanceLog.countDocuments({ machineId: machine._id, timestamp: { $gte: todayStart } }),
//     AttendanceLog.countDocuments({
//       machineId:        machine._id,
//       processingStatus: 'flagged',
//       timestamp:        { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
//     }),
//   ]);

//   res.status(200).json({
//     status: 'success',
//     data: {
//       machine: { _id: machine._id, name: machine.name, serialNumber: machine.serialNumber, status: machine.status, connectionStatus: machine.connectionStatus, isOnline },
//       stats:   { totalLogs: machine.stats?.totalTransactions || 0, todayLogs, recentErrors, lastSyncAt: machine.lastSyncAt, lastPingAt: machine.lastPingAt },
//     },
//   });
// });

// /**
//  * POST /api/v1/attendance/machines/:id/regenerate-key
//  *
//  * FIX BUG-AM-C02 — Documents the intentional hashing contract:
//  * Plain-text set here → hashed by pre-save → plain-text returned in response.
//  * The response key and the stored hash correspond correctly.
//  */
// exports.regenerateApiKey = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).select('+apiKey');
//   if (!machine) return next(new AppError('Machine not found', 404));

//   const newApiKey       = generatePlainApiKey();
//   machine.apiKey        = newApiKey; // Model pre-save will hash this before storage
//   machine.apiKeyExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
//   machine.updatedBy     = req.user._id;
//   await machine.save();

//   // _plainTextApiKey virtual is set by pre-save — use our local variable to be explicit
//   res.status(200).json({
//     status: 'success',
//     data: {
//       machine: { _id: machine._id, name: machine.name },
//       apiKey:  newApiKey,
//       message: 'Store this API key securely. It cannot be retrieved again.',
//     },
//   });
// });

// /**
//  * POST /api/v1/attendance/machines/:id/test-connection
//  *
//  * FIX BUG-AM-C07 [MEDIUM] — Documented as simulated/mock.
//  * Real implementation would probe machine.ipAddress:machine.port via TCP/HTTP.
//  */
// exports.testConnection = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!machine) return next(new AppError('Machine not found', 404));

//   // FIX BUG-AM-C07 — This is a SIMULATED test. For production, implement actual
//   // TCP probe: `net.createConnection({ host: machine.ipAddress, port: machine.port })`
//   // Always returns success: true — do NOT rely on this for real health monitoring.
//   const testResult = {
//     success: true,
//     simulated: true, // Flag so callers know this is not a real probe
//     note: 'Replace with actual TCP/HTTP probe to machine.ipAddress:machine.port',
//     timestamp: new Date(),
//   };

//   if (testResult.success) {
//     machine.lastPingAt       = new Date();
//     machine.connectionStatus = 'online';
//     await machine.save();
//   }

//   res.status(200).json({ status: 'success', data: testResult });
// });

// // ─────────────────────────────────────────────
// //  SYNC
// // ─────────────────────────────────────────────

// /**
//  * POST /api/v1/attendance/machines/:id/sync
//  *
//  * FIX BUG-AM-C03 [CRITICAL] — processLogForDaily() now called after each log creation.
//  * FIX BUG-AM-C04 [CRITICAL] — Duplicate check uses machineId + timestamp (not machine userId).
//  */
// exports.syncMachine = catchAsync(async (req, res, next) => {
//   const machine = req.attendanceMachine;
//   const { logs  } = req.body;

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const results = { received: 0, processed: 0, duplicates: 0, errors: [] };

//     // Inline import to avoid circular dependency
//     if (Array.isArray(logs)) {
//       results.received = logs.length;

//       for (const logData of logs) {
//         try {
//           // FIX BUG-AM-C04 [CRITICAL] — logData.userId is the MACHINE's internal numeric ID
//           // (e.g. "1042"), not a MongoDB ObjectId. Using it in AttendanceLog.user will never match.
//           // Duplicate check uses timestamp + machineId only.
//           const existing = await AttendanceLog.findOne({
//             machineId: machine._id,
//             timestamp: new Date(logData.timestamp),
//           }).session(session);

//           if (existing) { results.duplicates++; continue; }

//           // Map machine user ID → MongoDB User
//           const user = await User.findOne({
//             organizationId: machine.organizationId,
//             'attendanceConfig.machineUserId': logData.userId?.toString(),
//           }).lean().session(session);

//           if (!user) {
//             results.errors.push({ userId: logData.userId, reason: 'User not mapped to any account' });
//             continue;
//           }

//           const [log] = await AttendanceLog.create([{
//             user:            user._id,
//             organizationId:  machine.organizationId,
//             branchId:        machine.branchId,
//             machineId:       machine._id,
//             timestamp:       new Date(logData.timestamp),
//             type:            logData.type,
//             source:          'machine',
//             processingStatus:'pending',
//             biometricData:   logData.biometricData,
//             serverTimestamp: new Date(),
//           }], { session });

//           // FIX BUG-AM-C03 [CRITICAL] — Must process each log into daily record.
//           // Original skipped this entirely — daily attendance was never updated from machine sync.
//           const { processLogForDaily: processLog } = require('./attendanceLog.controller');
//           // Use the shared helper directly to avoid circular require issues
//           const dayStart = new Date(log.timestamp); dayStart.setUTCHours(0,0,0,0);
//           const dayEnd   = new Date(log.timestamp); dayEnd.setUTCHours(23,59,59,999);

//           let daily = await AttendanceDaily.findOne({
//             user: log.user, organizationId: log.organizationId, date: { $gte: dayStart, $lte: dayEnd },
//           }).session(session);

//           if (!daily) {
//             [daily] = await AttendanceDaily.create([{
//               user: log.user, organizationId: log.organizationId, branchId: log.branchId,
//               date: dayStart, status: 'absent', logs: [],
//             }], { session });
//           }

//           if (!daily.logs.some(id => id.toString() === log._id.toString())) daily.logs.push(log._id);
//           if ((log.type === 'in' || log.type === 'remote_in') && (!daily.firstIn || log.timestamp < daily.firstIn)) daily.firstIn = log.timestamp;
//           if ((log.type === 'out'|| log.type === 'remote_out') && (!daily.lastOut || log.timestamp > daily.lastOut)) daily.lastOut = log.timestamp;
//           if (daily.firstIn && daily.lastOut) {
//             daily.totalWorkHours = Math.round(((daily.lastOut - daily.firstIn) / 3600000) * 100) / 100;
//           }
//           await daily.save({ session });

//           log.processingStatus = 'processed';
//           await log.save({ session });

//           results.processed++;
//         } catch (error) {
//           results.errors.push({ data: logData, error: error.message });
//         }
//       }
//     }

//     // FIX — Use $inc for atomic stat updates
//     await AttendanceMachine.findByIdAndUpdate(machine._id, {
//       $inc: {
//         'stats.totalTransactions': results.processed,
//         'stats.successfulReads':   results.processed,
//         'stats.failedReads':       results.errors.length,
//       },
//       $set: { lastSyncAt: new Date(), connectionStatus: 'online' },
//     }, { session });

//     const pendingUsers = await User.find({
//       organizationId: machine.organizationId,
//       isActive: true,
//       'attendanceConfig.machineUserId': { $exists: true, $ne: null },
//     }).select('attendanceConfig.machineUserId name employeeProfile.employeeId').lean();

//     await session.commitTransaction();

//     res.status(200).json({
//       status: 'success',
//       data: { syncResults: results, serverTime: new Date(), pendingData: { users: pendingUsers, commands: [] } },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
//   const { machineIds, status, reason } = req.body;
//   if (!Array.isArray(machineIds) || machineIds.length === 0 || !status) {
//     return next(new AppError('Please provide machine IDs and status', 400));
//   }

//   const allowedStatuses = ['active', 'inactive', 'maintenance', 'offline', 'error'];
//   if (!allowedStatuses.includes(status)) {
//     return next(new AppError(`Invalid status. Allowed values: ${allowedStatuses.join(', ')}`, 400));
//   }

//   const result = await AttendanceMachine.updateMany(
//     { _id: { $in: machineIds }, organizationId: req.user.organizationId },
//     { $set: { status, lastError: reason, updatedBy: req.user._id } }
//   );

//   res.status(200).json({
//     success: true,
//     status: 'success',
//     message: `Updated ${result.modifiedCount} machine(s) to ${status}`,
//     data: {
//       status,
//       matched: result.matchedCount,
//       modified: result.modifiedCount,
//     },
//   });
// });

// // ─────────────────────────────────────────────
// //  USER-MACHINE MAPPING
// // ─────────────────────────────────────────────

// exports.getUnmappedUsers = catchAsync(async (req, res, next) => {
//   const users = await User.find({
//     organizationId: req.user.organizationId,
//     isActive: true,
//     'attendanceConfig.machineUserId': { $exists: false },
//   }).select('name employeeProfile.employeeId employeeProfile.departmentId').limit(100);

//   res.status(200).json({ status: 'success', data: { users } });
// });

// exports.mapUserToMachine = catchAsync(async (req, res, next) => {
//   const { userId, machineUserId } = req.body;
//   const user = await User.findOne({ _id: userId, organizationId: req.user.organizationId });
//   if (!user) return next(new AppError('User not found', 404));

//   const existing = await User.findOne({
//     organizationId: req.user.organizationId,
//     'attendanceConfig.machineUserId': machineUserId,
//     _id: { $ne: userId },
//   });
//   if (existing) return next(new AppError('Machine User ID already assigned to another user', 400));

//   user.attendanceConfig.machineUserId       = machineUserId;
//   user.attendanceConfig.biometricVerified   = true;
//   user.updatedBy = req.user._id;
//   await user.save();

//   res.status(200).json({ status: 'success', data: { user } });
// });

// /**
//  * POST /api/v1/attendance/machines/bulk-map
//  *
//  * FIX BUG-AM-C05 [HIGH] — `$push` to biometricDevices only when deviceId is provided.
//  * Original: `req.body.deviceId` was always undefined in a bulk-map request body.
//  */
// exports.bulkMapUsers = catchAsync(async (req, res, next) => {
//   const { mappings, deviceId } = req.body; // FIX: deviceId at top level of body

//   if (!Array.isArray(mappings) || mappings.length === 0) {
//     return next(new AppError('Please provide an array of mappings', 400));
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const results = { mapped: [], errors: [] };

//     for (const mapping of mappings) {
//       try {
//         const { userId, machineUserId } = mapping;

//         const existing = await User.findOne({
//           organizationId: req.user.organizationId,
//           'attendanceConfig.machineUserId': machineUserId,
//           _id: { $ne: userId },
//         }).session(session);

//         if (existing) {
//           results.errors.push({ userId, machineUserId, reason: 'Machine User ID already taken' });
//           continue;
//         }

//         const setFields = {
//           'attendanceConfig.machineUserId':     machineUserId,
//           'attendanceConfig.biometricVerified': true,
//         };

//         const updateOp = { $set: setFields };

//         // FIX BUG-AM-C05 — Only push deviceId if actually provided
//         if (deviceId) {
//           updateOp.$addToSet = { 'attendanceConfig.biometricDevices': deviceId };
//         }

//         const user = await User.findByIdAndUpdate(userId, updateOp, { new: true, session });

//         if (user) results.mapped.push({ userId: user._id, name: user.name, machineUserId });
//       } catch (error) {
//         results.errors.push({ mapping, error: error.message });
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

// // ─────────────────────────────────────────────
// //  ANALYTICS
// // ─────────────────────────────────────────────

// /**
//  * GET /api/v1/attendance/machines/analytics
//  *
//  * FIX BUG-AM-C06 [HIGH] — uniqueUsers computed correctly via $group $addToSet.
//  */
// exports.getMachineAnalytics = catchAsync(async (req, res, next) => {
//   const days      = Math.min(parseInt(req.query.days) || 30, 365);
//   const startDate = new Date();
//   startDate.setDate(startDate.getDate() - days);

//   const analytics = await AttendanceMachine.aggregate([
//     { $match: { organizationId: req.user.organizationId } },
//     {
//       $lookup: {
//         from: 'attendancelogs',
//         let:  { machineId: '$_id' },
//         pipeline: [
//           { $match: { $expr: { $eq: ['$machineId', '$$machineId'] }, timestamp: { $gte: startDate } } },
//           // FIX BUG-AM-C06 — project only needed fields to reduce memory usage
//           { $project: { user: 1, timestamp: 1 } },
//         ],
//         as: 'recentLogs',
//       },
//     },
//     {
//       $project: {
//         name:             1,
//         serialNumber:     1,
//         status:           1,
//         connectionStatus: 1,
//         providerType:     1,
//         branchId:         1,
//         stats:            1,
//         totalLogs:        { $size: '$recentLogs' },
//         lastLogAt:        { $max: '$recentLogs.timestamp' },
//         // FIX BUG-AM-C06 — correct: collect all user IDs into a set, then get size
//         uniqueUserSet:    { $setUnion: ['$recentLogs.user', []] },
//       },
//     },
//     { $addFields: { uniqueUsers: { $size: '$uniqueUserSet' } } },
//     {
//       $facet: {
//         summary: [
//           { $group: { _id:null, totalMachines:{ $sum:1 }, activeMachines:{ $sum:{ $cond:[{ $eq:['$status','active']},1,0] } }, onlineMachines:{ $sum:{ $cond:[{ $eq:['$connectionStatus','online']},1,0] } }, totalLogs:{ $sum:'$totalLogs' }, totalUniqueUsers:{ $sum:'$uniqueUsers' } } },
//         ],
//         byStatus:   [{ $group:{ _id:'$status',   count:{ $sum:1 }, totalLogs:{ $sum:'$totalLogs' } } }],
//         byProvider: [{ $group:{ _id:'$providerType', count:{ $sum:1 } } }],
//         machines:   [{ $sort:{ totalLogs:-1 } }, { $project:{ uniqueUserSet:0 } }],
//       },
//     },
//   ]);

//   res.status(200).json({ status:'success', data:{ period:`${days} days`, ...analytics[0] } });
// });

// exports.getMachineLogs = catchAsync(async (req, res, next) => {
//   const machine = await AttendanceMachine.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!machine) return next(new AppError('Machine not found', 404));

//   const page  = Math.max(1, parseInt(req.query.page)  || 1);
//   const limit = Math.min(200, parseInt(req.query.limit) || 50);
//   const skip  = (page - 1) * limit;
//   const query = { machineId: machine._id };

//   if (req.query.fromDate || req.query.toDate) {
//     query.timestamp = {};
//     const from = parseQueryDate(req.query.fromDate);
//     const to   = parseQueryDate(req.query.toDate);
//     if (from) query.timestamp.$gte = from;
//     if (to)   query.timestamp.$lte = to;
//   }

//   const [logs, total] = await Promise.all([
//     AttendanceLog.find(query).populate('user','name employeeProfile.employeeId').skip(skip).limit(limit).sort('-timestamp'),
//     AttendanceLog.countDocuments(query),
//   ]);

//   res.status(200).json({ status:'success', results:logs.length, total, page, totalPages:Math.ceil(total/limit), data:{ logs } });
// });

