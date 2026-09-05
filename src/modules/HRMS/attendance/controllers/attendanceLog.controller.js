const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError = require('../../../../core/utils/api/appError');
const repo = require('../repository/attendanceLog.repository');
const attendanceLogService = require('../services/attendanceLog.service');
const { manualPunchSchema, bulkMachineLogsSchema, flagLogSchema, correctLogSchema } = require('../validation/attendanceLog.validation');
const { success, created } = require('../../middleware/responseFormatter');
const { startOfDay, endOfDay, parseQueryDate } = require('../../../../core/utils/dateHelpers');

// --- Helper ---
const detectSource = (req) => {
  const explicit = req.headers['x-attendance-source'];
  if (explicit && ['machine','web','mobile','admin_manual','api','biometric','rfid'].includes(explicit)) return explicit;
  if (req.headers['user-agent']?.match(/Mobile|Android|iPhone/i)) return 'mobile';
  return 'web';
};

// --- Operations ---

exports.createAttendanceLog = catchAsync(async (req, res) => {
  const payload = manualPunchSchema.parse(req.body);
  const source = detectSource(req);
  const ipAddress = req.ip || req.connection?.remoteAddress;
  
  const result = await attendanceLogService.createManualPunch(
    req.user.organizationId, req.user, payload, source, ipAddress, req.get('User-Agent'), req.headers['x-device-id']
  );

  return created(res, {
    message: 'Punch recorded successfully',
    log: result.log,
    daily: { date: result.daily.date, firstIn: result.daily.firstIn, lastOut: result.daily.lastOut, totalWorkHours: result.daily.totalWorkHours }
  });
});

exports.bulkCreateLogs = catchAsync(async (req, res, next) => {
  const payload = bulkMachineLogsSchema.parse(req.body);
  if (!req.attendanceMachine) return next(new AppError('Machine context missing. Ensure API Key middleware is applied.', 401));

  const results = await attendanceLogService.bulkSyncMachineLogs(req.attendanceMachine, payload.logs);
  
  return created(res, {
    machine: req.attendanceMachine.name,
    created: results.created.length,
    duplicates: results.duplicates.length,
    errors: results.errors.length,
    logs: results.created
  });
});

// --- Retrievals ---

exports.getAllLogs = catchAsync(async (req, res) => {
  const result = await repo.getList(req.user.organizationId, req.query);
  return success(res, result.data, 200, result.pagination);
});

exports.getLog = catchAsync(async (req, res, next) => {
  const log = await repo.getById(req.user.organizationId, req.params.id);
  if (!log) return next(new AppError('Log not found', 404));
  return success(res, { log });
});

exports.getMyLogs = catchAsync(async (req, res) => {
  // Query construction for specific date ranges
  req.query.user = req.user._id.toString();
  const result = await repo.getList(req.user.organizationId, req.query);

  // Today's specific summary (FIX BUG-AL-C06)
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const todayLogs = result.data.filter(l => l.timestamp >= todayStart && l.timestamp <= todayEnd);

  return success(res, {
    summary: {
      today: {
        firstIn: todayLogs.find(l => l.type.includes('in'))?.timestamp,
        lastOut: todayLogs.filter(l => l.type.includes('out')).pop()?.timestamp,
        totalLogs: todayLogs.length,
        punches: todayLogs.map(l => ({ time: l.timestamp, type: l.type, source: l.source }))
      }
    },
    logs: result.data
  }, 200, result.pagination);
});

// --- Actions ---

exports.verifyLog = catchAsync(async (req, res, next) => {
  const log = await repo.getById(req.user.organizationId, req.params.id);
  if (!log) return next(new AppError('Log not found', 404));
  
  log.isVerified = true;
  log.verifiedBy = req.user._id;
  log.verifiedAt = new Date();
  log.processingStatus = 'processed';
  await log.save();
  
  return success(res, { log });
});

exports.flagLog = catchAsync(async (req, res, next) => {
  const payload = flagLogSchema.parse(req.body);
  const log = await repo.getById(req.user.organizationId, req.params.id);
  if (!log) return next(new AppError('Log not found', 404));

  log.processingStatus = 'flagged';
  log.notes = payload.reason;
  log.verifiedBy = req.user._id;
  log.verifiedAt = new Date();
  await log.save();

  return success(res, { log });
});

exports.correctLog = catchAsync(async (req, res) => {
  const payload = correctLogSchema.parse(req.body);
  const result = await attendanceLogService.correctLog(req.user.organizationId, req.params.id, payload, req.user._id);
  return success(res, result);
});

// --- Analytics ---

exports.getLogStats = catchAsync(async (req, res) => {
  const matchStage = { organizationId: req.user.organizationId };
  const from = parseQueryDate(req.query.fromDate);
  const to = parseQueryDate(req.query.toDate);
  
  if (from || to) {
    matchStage.timestamp = {};
    if (from) matchStage.timestamp.$gte = from;
    if (to) matchStage.timestamp.$lte = endOfDay(to);
  }

  const [stats] = await repo.getStatsAggregation(matchStage);
  return success(res, stats);
});

exports.getRealtimeFeed = catchAsync(async (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logs = await repo.getRecentFeed(req.user.organizationId, limit, since);

  // FIX BUG-AL-C09: Avoid setHours(-N) wrapping
  const now = new Date();
  const timeline = [];

  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now.getTime() - i * 3600_000);
    hourStart.setMinutes(0, 0, 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 3600_000);

    const hourLogs = logs.filter(l => l.timestamp >= hourStart && l.timestamp < hourEnd);
    timeline.push({ hour: hourStart.getHours(), count: hourLogs.length, logs: hourLogs.slice(0, 5) });
  }

  return success(res, { total: logs.length, timeline, recent: logs.slice(0, 20) });
});

exports.getUserLogs = catchAsync(async (req, res, next) => {
  const User = require('../../../auth/core/user.model');
  const user = await User.findOne({ _id: req.params.userId, organizationId: req.user.organizationId });
  if (!user) return next(new AppError('User not found', 404));

  req.query.user = req.params.userId;
  const result = await repo.getList(req.user.organizationId, req.query);
  
  return success(res, { logs: result.data }, 200, result.pagination);
});


// // controllers/attendance/attendanceLog.controller.js
// const mongoose      = require('mongoose');
// const AttendanceLog  = require('../../attendance/models/attendanceLog.model');
// const AttendanceDaily = require('../../attendance/models/attendanceDaily.model');
// const Shift          = require('../../attendance/models/shift.model');
// const GeoFence       = require('../../attendance/models/geoFencing.model');
// const User           = require('../../../auth/core/user.model');
// const Employee       = require('../../core-hr/models/employee.model');
// const catchAsync     = require('../../../../core/utils/api/catchAsync');
// const AppError       = require('../../../../core/utils/api/appError');
// const factory        = require('../../../../core/utils/api/handlerFactory');
// const {
//   startOfDay, endOfDay,getPeriodDates,  parseQueryDate} = require('../../../../core/utils/dateHelpers.js');

// // ─────────────────────────────────────────────
// //  HELPERS
// // ─────────────────────────────────────────────

// /**
//  * Shared work-hours calculation (deducts breaks).
//  * Must match the implementation in attendanceDaily.controller.js.
//  */
// const calculateWorkHours = (firstIn, lastOut) => {
//   if (!firstIn || !lastOut) return 0;
//   const diffMs = lastOut - firstIn;
//   return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
// };

// /**
//  * FIX BUG-AL-C05 [HIGH] — geofence applicability now uses correct user fields.
//  * Original compared department/designation ObjectIds against userId, always returning false.
//  *
//  * @param {number[]} coordinates  [longitude, latitude]
//  * @param {ObjectId} organizationId
//  * @param {ObjectId} branchId
//  * @param {Object}   user  - Full user document (needed for dept/designation check)
//  */
// const checkGeoFence = async (coordinates, organizationId, branchId, userId, employee) => {
//   const [longitude, latitude] = coordinates;

//   const geofences = await GeoFence.find({
//     organizationId,
//     $or: [{ branchId }, { applicableToAll: true }],
//     isActive: true,
//   });

//   if (geofences.length === 0) return { status: 'disabled', geofence: null };

//   for (const geofence of geofences) {
//     if (!geofence.applicableToAll) {
//       // FIX BUG-AL-C05 — Compare against the correct employee sub-fields
//       const isApplicable =
//         geofence.applicableUsers?.some(id => id.equals(userId)) ||
//         geofence.applicableDepartments?.some(id =>
//           employee?.departmentId && id.equals(employee.departmentId)
//         ) ||
//         geofence.applicableDesignations?.some(id =>
//           employee?.designationId && id.equals(employee.designationId)
//         );

//       if (!isApplicable) continue;
//     }

//     // Time restrictions check
//     if (geofence.timeRestrictions?.length) {
//       const now         = new Date();
//       const dayOfWeek   = now.getDay();
//       const currentTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
//       const restriction = geofence.timeRestrictions.find(r => r.dayOfWeek.includes(dayOfWeek));
//       if (restriction && !restriction.allowed) continue;
//     }

//     // Polygon/building types now throw (fixed in model) — wrap in try/catch
//     let isInside = false;
//     try {
//       isInside = geofence.isPointInside(longitude, latitude);
//     } catch {
//       // Polygon check not implemented — use MongoDB $geoWithin in production
//       isInside = false;
//     }

//     if (isInside) return { status: 'inside', geofence };
//   }

//   return { status: 'outside', geofence: null };
// };

// /**
//  * FIX BUG-AL-C08 [MEDIUM] — Source detection now uses explicit header, not fragile origin string.
//  * Original: `req.headers['origin']?.includes('admin')` matched any URL with 'admin' in it.
//  */
// const detectSource = (req) => {
//   const explicit = req.headers['x-attendance-source'];
//   if (explicit && ['machine','web','mobile','admin_manual','api','biometric','rfid'].includes(explicit)) {
//     return explicit;
//   }
//   if (req.headers['user-agent']?.match(/Mobile|Android|iPhone/i)) return 'mobile';
//   return 'web';
// };

// /**
//  * Process a log into the daily attendance record.
//  *
//  * FIX BUG-AL-C01 [CRITICAL] — date stored as proper Date object, not string.
//  * FIX BUG-AL-C03 [CRITICAL] — uses calculateWorkHours() for break deduction consistency.
//  */
// const processLogForDaily = async (log, session) => {
//   // FIX BUG-AL-C01 — Build a proper Date (midnight UTC) for the daily record date.
//   // Original used `log.timestamp.toISOString().split('T')[0]` → a string like "2024-03-25".
//   // Querying `date: "2024-03-25"` against a Date field never matches.
//   const dayStart = startOfDay(log.timestamp);
//   const dayEnd   = endOfDay(log.timestamp);

//   let daily = await AttendanceDaily.findOne({
//     user:           log.user,
//     organizationId: log.organizationId,
//     date:           { $gte: dayStart, $lte: dayEnd },
//   }).session(session);

//   if (!daily) {
//     const employee = await Employee.findOne({ user: log.user }).lean().session(session);
//     const shift = employee?.attendanceConfig?.shiftId
//       ? await Shift.findById(employee.attendanceConfig.shiftId).lean().session(session)
//       : null;

//     [daily] = await AttendanceDaily.create([{
//       user:             log.user,
//       organizationId:   log.organizationId,
//       branchId:         log.branchId,
//       date:             dayStart,    // FIX BUG-AL-C01 — proper Date, not string
//       shiftId:          employee?.attendanceConfig?.shiftId,
//       scheduledInTime:  shift?.startTime,
//       scheduledOutTime: shift?.endTime,
//       status:           'absent',
//       logs:             [],
//     }], { session });
//   }

//   // Add log reference (idempotent)
//   const logIdStr = log._id.toString();
//   if (!daily.logs.some(id => id.toString() === logIdStr)) {
//     daily.logs.push(log._id);
//   }

//   // Update firstIn / lastOut
//   if (log.type === 'in' || log.type === 'remote_in') {
//     if (!daily.firstIn || log.timestamp < daily.firstIn) daily.firstIn = log.timestamp;
//   } else if (log.type === 'out' || log.type === 'remote_out') {
//     if (!daily.lastOut || log.timestamp > daily.lastOut) daily.lastOut = log.timestamp;
//   }

//   // FIX BUG-AL-C03 [CRITICAL] — Use shared calculateWorkHours() for consistency.
//   // Original inlined raw diffMs calculation with no break deduction,
//   // diverging from recalculate which uses calculateWorkHours().
//   if (daily.firstIn && daily.lastOut) {
//     daily.totalWorkHours = calculateWorkHours(daily.firstIn, daily.lastOut);
//   }

//   await daily.save({ session });
//   return daily;
// };

// // ─────────────────────────────────────────────
// //  LOG CREATION
// // ─────────────────────────────────────────────

// /**
//  * POST /api/v1/attendance/logs
//  *
//  * FIX BUG-AL-C02 [CRITICAL] — All permission/validation checks moved BEFORE the transaction.
//  * FIX BUG-AL-C10 [MEDIUM]   — Duplicate check includes punch type.
//  */
// exports.createAttendanceLog = catchAsync(async (req, res, next) => {
//   // FIX BUG-AL-C02 — Run all validation BEFORE opening a transaction.
//   // Validations don't need to be transactional and their errors should not
//   // go through abortTransaction() — they are business rule rejections, not DB errors.

//   const employee = await Employee.findOne({ user: req.user._id, organizationId: req.user.organizationId });
//   if (!employee) {
//     return next(new AppError('Employee profile not found', 404));
//   }

//   if (!employee.attendanceConfig?.isAttendanceEnabled) {
//     return next(new AppError('Attendance is disabled for your account', 403));
//   }

//   const source = detectSource(req);

//   if (source === 'web'    && !employee.attendanceConfig?.allowWebPunch) {
//     return next(new AppError('Web punch is not allowed for your account', 403));
//   }
//   if (source === 'mobile' && !employee.attendanceConfig?.allowMobilePunch) {
//     return next(new AppError('Mobile punch is not allowed for your account', 403));
//   }

//   // Geofence check (no transaction needed)
//   let geofenceStatus = 'disabled';
//   let geofenceId     = null;

//   if (req.body.location?.geoJson?.coordinates) {
//     const geoResult = await checkGeoFence(
//       req.body.location.geoJson.coordinates,
//       req.user.organizationId,
//       req.user.branchId,
//       req.user._id,  // FIX BUG-AL-C05 — pass user ID
//       employee       // pass employee doc
//     );

//     geofenceStatus = geoResult.status;
//     geofenceId     = geoResult.geofence?._id || null;

//     if (employee.attendanceConfig?.enforceGeoFence && geoResult.status === 'outside') {
//       return next(new AppError('You are outside the allowed geofence area', 403));
//     }
//   }

//   // FIX BUG-AL-C10 [MEDIUM] — Duplicate check includes punch TYPE to allow valid IN→OUT within 30s
//   const recentLog = await AttendanceLog.findOne({
//     user:      req.user._id,
//     type:      req.body.type,
//     timestamp: { $gte: new Date(Date.now() - 30_000) },
//   });
//   if (recentLog) return next(new AppError('Please wait 30 seconds between punches of the same type', 429));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const logData = {
//       user:            req.user._id,
//       organizationId:  req.user.organizationId,
//       branchId:        req.user.branchId,
//       source,
//       type:            req.body.type,
//       timestamp:       req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
//       serverTimestamp: new Date(),
//       processingStatus:'pending',
//       ipAddress:       req.ip || req.connection?.remoteAddress,
//       userAgent:       req.get('User-Agent'),
//       deviceId:        req.headers['x-device-id'],
//       location:        req.body.location?.geoJson?.coordinates?.length === 2
//         ? { 
//             ...req.body.location, 
//             geoJson: { type: 'Point', coordinates: req.body.location.geoJson.coordinates },
//             geofenceStatus, 
//             geofenceId 
//           }
//         : undefined,
//     };

//     const [log] = await AttendanceLog.create([logData], { session });

//     const daily = await processLogForDaily(log, session);

//     log.processingStatus = 'processed';
//     log.isVerified       = true;
//     await log.save({ session });

//     await session.commitTransaction();

//     await log.populate([
//       { path: 'machineId', select: 'name serialNumber' },
//     ]);

//     res.status(201).json({
//       status: 'success',
//       data: {
//         log,
//         daily: {
//           date:           daily.date,
//           firstIn:        daily.firstIn,
//           lastOut:        daily.lastOut,
//           totalWorkHours: daily.totalWorkHours,
//         },
//       },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// /**
//  * POST /api/v1/attendance/logs/bulk
//  *
//  * FIX BUG-AL-C04 [CRITICAL] — Machine stats use $inc (atomic), not read-modify-write.
//  */
// exports.bulkCreateLogs = catchAsync(async (req, res, next) => {
//   const { logs } = req.body;
//   if (!Array.isArray(logs) || logs.length === 0) {
//     return next(new AppError('Please provide an array of logs', 400));
//   }

//   const machine = req.attendanceMachine;

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const results = { created: [], duplicates: [], errors: [] };

//     for (const logData of logs) {
//       try {
//         // FIX BUG-AM-C04 — Duplicate check must not use logData.userId (machine ID, not ObjectId)
//         const existing = await AttendanceLog.findOne({
//           machineId: machine._id,
//           timestamp: new Date(logData.timestamp),
//           'biometricData.templateId': logData.biometricData?.templateId,
//         }).session(session);

//         if (existing) { results.duplicates.push(logData); continue; }

//         logData.organizationId   = machine.organizationId;
//         logData.branchId         = machine.branchId;
//         logData.machineId        = machine._id;
//         logData.source           = 'machine';
//         logData.serverTimestamp  = new Date();
//         logData.processingStatus = 'pending';

//         const [log] = await AttendanceLog.create([logData], { session });
//         await processLogForDaily(log, session);

//         log.processingStatus = 'processed';
//         await log.save({ session });

//         results.created.push(log);
//       } catch (error) {
//         results.errors.push({ data: logData, error: error.message });
//       }
//     }

//     // FIX BUG-AL-C04 [CRITICAL] — Use $inc for atomic stat increment.
//     // Original: read stats → add → save (race condition under concurrent bulk uploads).
//     await machine.constructor.findByIdAndUpdate(machine._id, {
//       $inc: {
//         'stats.totalTransactions': results.created.length,
//         'stats.successfulReads':   results.created.length,
//       },
//       $set: { 'stats.lastTransactionAt': new Date() },
//     }, { session });

//     await session.commitTransaction();

//     res.status(201).json({
//       status: 'success',
//       data: {
//         machine:    machine.name,
//         created:    results.created.length,
//         duplicates: results.duplicates.length,
//         errors:     results.errors.length,
//         logs:       results.created,
//       },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// // ─────────────────────────────────────────────
// //  READ OPERATIONS
// // ─────────────────────────────────────────────

// exports.getAllLogs = factory.getAll(AttendanceLog, {
//   searchFields: ['type', 'source', 'ipAddress'],
//   populate: [
//     { path: 'user',      select: 'name employeeProfile.employeeId' },
//     { path: 'machineId', select: 'name serialNumber' },
//   ],
//   sort: { timestamp: -1 },
// });

// exports.getLog = factory.getOne(AttendanceLog, {
//   populate: [
//     { path: 'user',       select: 'name employeeProfile.employeeId email' },
//     { path: 'machineId',  select: 'name serialNumber providerType' },
//     { path: 'verifiedBy', select: 'name' },
//   ],
// });

// /**
//  * GET /api/v1/attendance/logs/my-logs
//  *
//  * FIX BUG-AL-C06 [HIGH] — Today's summary uses server-side date range, not string comparison.
//  */
// exports.getMyLogs = catchAsync(async (req, res, next) => {
//   const page  = Math.max(1, parseInt(req.query.page)  || 1);
//   const limit = Math.min(200, parseInt(req.query.limit) || 50);
//   const skip  = (page - 1) * limit;

//   const query = {
//     user:           req.user._id,
//     organizationId: req.user.organizationId,
//   };

//   if (req.query.fromDate || req.query.toDate) {
//     query.timestamp = {};
//     const from = parseQueryDate(req.query.fromDate);
//     const to   = parseQueryDate(req.query.toDate);
//     if (from) query.timestamp.$gte = from;
//     if (to)   query.timestamp.$lte = endOfDay(to);
//   }

//   if (req.query.type) query.type = req.query.type;

//   const [logs, total] = await Promise.all([
//     AttendanceLog.find(query).populate('machineId', 'name').skip(skip).limit(limit).sort('-timestamp'),
//     AttendanceLog.countDocuments(query),
//   ]);

//   // FIX BUG-AL-C06 [HIGH] — Use proper Date range for today's summary (no string comparison).
//   // Original: `l.timestamp.toISOString().split('T')[0] === today` — timezone-sensitive split.
//   const todayStart = startOfDay(new Date());
//   const todayEnd   = endOfDay(new Date());
//   const todayLogs  = logs.filter(l => l.timestamp >= todayStart && l.timestamp <= todayEnd);

//   const firstIn = todayLogs.find(l  => l.type.includes('in'))?.timestamp;
//   const lastOut = todayLogs.filter(l => l.type.includes('out')).pop()?.timestamp;

//   res.status(200).json({
//     status: 'success',
//     results: logs.length,
//     total,
//     page,
//     totalPages: Math.ceil(total / limit),
//     data: {
//       summary: {
//         today: {
//           firstIn,
//           lastOut,
//           totalLogs: todayLogs.length,
//           punches:   todayLogs.map(l => ({ time: l.timestamp, type: l.type, source: l.source })),
//         },
//       },
//       logs,
//     },
//   });
// });

// exports.getUserLogs = catchAsync(async (req, res, next) => {
//   const { userId } = req.params;
//   const user = await User.findOne({ _id: userId, organizationId: req.user.organizationId });
//   if (!user) return next(new AppError('User not found', 404));

//   const page  = Math.max(1, parseInt(req.query.page)  || 1);
//   const limit = Math.min(200, parseInt(req.query.limit) || 50);
//   const skip  = (page - 1) * limit;

//   const query = { user: userId, organizationId: req.user.organizationId };

//   if (req.query.fromDate || req.query.toDate) {
//     query.timestamp = {};
//     const from = parseQueryDate(req.query.fromDate);
//     const to   = parseQueryDate(req.query.toDate);
//     if (from) query.timestamp.$gte = from;
//     if (to)   query.timestamp.$lte = endOfDay(to);
//   }

//   const [logs, total] = await Promise.all([
//     AttendanceLog.find(query).populate('machineId','name').populate('verifiedBy','name').skip(skip).limit(limit).sort('-timestamp'),
//     AttendanceLog.countDocuments(query),
//   ]);

//   res.status(200).json({ status:'success', results: logs.length, total, page, totalPages: Math.ceil(total/limit), data:{ logs } });
// });

// // ─────────────────────────────────────────────
// //  VERIFICATION & CORRECTION
// // ─────────────────────────────────────────────

// exports.verifyLog = catchAsync(async (req, res, next) => {
//   const log = await AttendanceLog.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!log) return next(new AppError('Log not found', 404));
//   log.isVerified       = true;
//   log.verifiedBy       = req.user._id;
//   log.verifiedAt       = new Date();
//   log.processingStatus = 'processed';
//   await log.save();
//   res.status(200).json({ status: 'success', data: { log } });
// });

// exports.flagLog = catchAsync(async (req, res, next) => {
//   const { reason } = req.body;
//   if (!reason) return next(new AppError('Please provide a reason', 400));
//   const log = await AttendanceLog.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!log) return next(new AppError('Log not found', 404));
//   log.processingStatus = 'flagged';
//   log.notes            = reason;
//   log.verifiedBy       = req.user._id;
//   log.verifiedAt       = new Date();
//   await log.save();
//   res.status(200).json({ status: 'success', data: { log } });
// });

// /**
//  * PATCH /api/v1/attendance/logs/:id/correct
//  *
//  * FIX BUG-AL-C07 [HIGH] — Corrected log built from scratch, not from contaminated toObject() spread.
//  * FIX CROSS-C03 [HIGH]  — session.endSession() always called in finally block.
//  */
// exports.correctLog = catchAsync(async (req, res, next) => {
//   const { timestamp, type, reason } = req.body;
//   if (!timestamp || !type || !reason) {
//     return next(new AppError('Please provide timestamp, type and reason', 400));
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const originalLog = await AttendanceLog.findOne({
//       _id:            req.params.id,
//       organizationId: req.user.organizationId,
//     }).session(session);

//     if (!originalLog) {
//       // FIX CROSS-C03 — Abort before returning to avoid session leak
//       await session.abortTransaction();
//       return next(new AppError('Log not found', 404));
//     }

//     originalLog.processingStatus = 'corrected';
//     originalLog.notes            = `Corrected: ${reason}`;
//     await originalLog.save({ session });

//     // FIX BUG-AL-C07 [HIGH] — Build corrected log from scratch using only essential fields.
//     // Original: `toObject()` spread carried over stale processingStatus, isCorrection, etc.
//     const correctedLog = await AttendanceLog.create([{
//       user:            originalLog.user,
//       organizationId:  originalLog.organizationId,
//       branchId:        originalLog.branchId,
//       machineId:       originalLog.machineId,
//       source:          originalLog.source,
//       timestamp:       new Date(timestamp),
//       serverTimestamp: new Date(),
//       type,
//       processingStatus: 'processed',
//       isCorrection:    true,
//       originalLogId:   originalLog._id,
//       notes:           reason,
//       verifiedBy:      req.user._id,
//       verifiedAt:      new Date(),
//       isVerified:      true,
//     }], { session });

//     await processLogForDaily(correctedLog[0], session);

//     await session.commitTransaction();
//     res.status(200).json({ status: 'success', data: { originalLog, correctedLog: correctedLog[0] } });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession(); // FIX CROSS-C03 — always called
//   }
// });

// // ─────────────────────────────────────────────
// //  ANALYTICS
// // ─────────────────────────────────────────────

// exports.getLogStats = catchAsync(async (req, res, next) => {
//   const matchStage = { organizationId: req.user.organizationId };
//   const from = parseQueryDate(req.query.fromDate);
//   const to   = parseQueryDate(req.query.toDate);
//   if (from || to) {
//     matchStage.timestamp = {};
//     if (from) matchStage.timestamp.$gte = from;
//     if (to)   matchStage.timestamp.$lte = endOfDay(to);
//   }

//   const stats = await AttendanceLog.aggregate([
//     { $match: matchStage },
//     {
//       $facet: {
//         bySource: [{ $group: { _id: '$source', count: { $sum:1 }, verified: { $sum:{ $cond:['$isVerified',1,0] } } } }],
//         byType:   [{ $group: { _id: '$type',   count: { $sum:1 } } }],
//         byStatus: [{ $group: { _id: '$processingStatus', count: { $sum:1 } } }],
//         hourly:   [{ $group: { _id: { $hour: '$timestamp' }, count: { $sum:1 } } }, { $sort:{'_id':1} }],
//         total: [
//           { $group: { _id:null, totalLogs:{ $sum:1 }, verifiedLogs:{ $sum:{ $cond:['$isVerified',1,0] } }, uniqueUsers:{ $addToSet:'$user' } } },
//           { $project: { totalLogs:1, verifiedLogs:1, verifiedPercentage:{ $multiply:[{ $divide:['$verifiedLogs','$totalLogs'] },100] }, uniqueUsers:{ $size:'$uniqueUsers' } } },
//         ],
//       },
//     },
//   ]);

//   res.status(200).json({ status:'success', data: stats[0] });
// });

// /**
//  * GET /api/v1/attendance/logs/realtime-feed
//  *
//  * FIX BUG-AL-C09 [MEDIUM] — Timeline loop fixed: negative hours no longer wrap to previous day.
//  */
// exports.getRealtimeFeed = catchAsync(async (req, res, next) => {
//   const limit = Math.min(200, parseInt(req.query.limit) || 50);
//   const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

//   const logs = await AttendanceLog.find({
//     organizationId: req.user.organizationId,
//     timestamp: { $gte: since },
//   })
//     .populate('user',      'name employeeProfile.employeeId avatar')
//     .populate('machineId', 'name')
//     .sort('-timestamp')
//     .limit(limit);

//   // FIX BUG-AL-C09 [MEDIUM] — Use epoch subtraction to avoid setHours(-N) wrapping to previous day.
//   // Original: `hour.setHours(now.getHours() - i)` → negative hours wrapped to yesterday.
//   const now      = new Date();
//   const timeline = [];

//   for (let i = 23; i >= 0; i--) {
//     const hourStart = new Date(now.getTime() - i * 3600_000);
//     hourStart.setMinutes(0, 0, 0);
//     const hourEnd = new Date(hourStart.getTime() + 3600_000);

//     const hourLogs = logs.filter(l => l.timestamp >= hourStart && l.timestamp < hourEnd);
//     timeline.push({ hour: hourStart.getHours(), count: hourLogs.length, logs: hourLogs.slice(0, 5) });
//   }

//   res.status(200).json({ status:'success', data:{ total: logs.length, timeline, recent: logs.slice(0, 20) } });
// });
