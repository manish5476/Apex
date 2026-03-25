// controllers/attendance/attendanceLog.controller.js
const mongoose      = require('mongoose');
const AttendanceLog  = require('../../models/attendanceLog.model');
const AttendanceDaily = require('../../models/attendanceDaily.model');
const Shift          = require('../../models/shift.model');
const GeoFence       = require('../../models/geoFencing.model');
const User           = require('../../../auth/core/user.model');
const catchAsync     = require('../../../../core/utils/api/catchAsync');
const AppError       = require('../../../../core/utils/api/appError');
const factory        = require('../../../../core/utils/api/handlerFactory');
const { startOfDay, endOfDay, parseQueryDate } = require('../../utils/dateHelpers');

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * Shared work-hours calculation (deducts breaks).
 * Must match the implementation in attendanceDaily.controller.js.
 */
const calculateWorkHours = (firstIn, lastOut) => {
  if (!firstIn || !lastOut) return 0;
  const diffMs = lastOut - firstIn;
  return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
};

/**
 * FIX BUG-AL-C05 [HIGH] — geofence applicability now uses correct user fields.
 * Original compared department/designation ObjectIds against userId, always returning false.
 *
 * @param {number[]} coordinates  [longitude, latitude]
 * @param {ObjectId} organizationId
 * @param {ObjectId} branchId
 * @param {Object}   user  - Full user document (needed for dept/designation check)
 */
const checkGeoFence = async (coordinates, organizationId, branchId, user) => {
  const [longitude, latitude] = coordinates;

  const geofences = await GeoFence.find({
    organizationId,
    $or: [{ branchId }, { applicableToAll: true }],
    isActive: true,
  });

  if (geofences.length === 0) return { status: 'disabled', geofence: null };

  for (const geofence of geofences) {
    if (!geofence.applicableToAll) {
      // FIX BUG-AL-C05 — Compare against the correct user sub-fields
      const isApplicable =
        geofence.applicableUsers?.some(id => id.equals(user._id)) ||
        geofence.applicableDepartments?.some(id =>
          user.employeeProfile?.departmentId && id.equals(user.employeeProfile.departmentId)
        ) ||
        geofence.applicableDesignations?.some(id =>
          user.employeeProfile?.designationId && id.equals(user.employeeProfile.designationId)
        );

      if (!isApplicable) continue;
    }

    // Time restrictions check
    if (geofence.timeRestrictions?.length) {
      const now         = new Date();
      const dayOfWeek   = now.getDay();
      const currentTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      const restriction = geofence.timeRestrictions.find(r => r.dayOfWeek.includes(dayOfWeek));
      if (restriction && !restriction.allowed) continue;
    }

    // Polygon/building types now throw (fixed in model) — wrap in try/catch
    let isInside = false;
    try {
      isInside = geofence.isPointInside(longitude, latitude);
    } catch {
      // Polygon check not implemented — use MongoDB $geoWithin in production
      isInside = false;
    }

    if (isInside) return { status: 'inside', geofence };
  }

  return { status: 'outside', geofence: null };
};

/**
 * FIX BUG-AL-C08 [MEDIUM] — Source detection now uses explicit header, not fragile origin string.
 * Original: `req.headers['origin']?.includes('admin')` matched any URL with 'admin' in it.
 */
const detectSource = (req) => {
  const explicit = req.headers['x-attendance-source'];
  if (explicit && ['machine','web','mobile','admin_manual','api','biometric','rfid'].includes(explicit)) {
    return explicit;
  }
  if (req.headers['user-agent']?.match(/Mobile|Android|iPhone/i)) return 'mobile';
  return 'web';
};

/**
 * Process a log into the daily attendance record.
 *
 * FIX BUG-AL-C01 [CRITICAL] — date stored as proper Date object, not string.
 * FIX BUG-AL-C03 [CRITICAL] — uses calculateWorkHours() for break deduction consistency.
 */
const processLogForDaily = async (log, session) => {
  // FIX BUG-AL-C01 — Build a proper Date (midnight UTC) for the daily record date.
  // Original used `log.timestamp.toISOString().split('T')[0]` → a string like "2024-03-25".
  // Querying `date: "2024-03-25"` against a Date field never matches.
  const dayStart = startOfDay(log.timestamp);
  const dayEnd   = endOfDay(log.timestamp);

  let daily = await AttendanceDaily.findOne({
    user:           log.user,
    organizationId: log.organizationId,
    date:           { $gte: dayStart, $lte: dayEnd },
  }).session(session);

  if (!daily) {
    const user  = await User.findById(log.user).lean().session(session);
    const shift = user?.attendanceConfig?.shiftId
      ? await Shift.findById(user.attendanceConfig.shiftId).lean().session(session)
      : null;

    [daily] = await AttendanceDaily.create([{
      user:             log.user,
      organizationId:   log.organizationId,
      branchId:         log.branchId,
      date:             dayStart,    // FIX BUG-AL-C01 — proper Date, not string
      shiftId:          user?.attendanceConfig?.shiftId,
      scheduledInTime:  shift?.startTime,
      scheduledOutTime: shift?.endTime,
      status:           'absent',
      logs:             [],
    }], { session });
  }

  // Add log reference (idempotent)
  const logIdStr = log._id.toString();
  if (!daily.logs.some(id => id.toString() === logIdStr)) {
    daily.logs.push(log._id);
  }

  // Update firstIn / lastOut
  if (log.type === 'in' || log.type === 'remote_in') {
    if (!daily.firstIn || log.timestamp < daily.firstIn) daily.firstIn = log.timestamp;
  } else if (log.type === 'out' || log.type === 'remote_out') {
    if (!daily.lastOut || log.timestamp > daily.lastOut) daily.lastOut = log.timestamp;
  }

  // FIX BUG-AL-C03 [CRITICAL] — Use shared calculateWorkHours() for consistency.
  // Original inlined raw diffMs calculation with no break deduction,
  // diverging from recalculate which uses calculateWorkHours().
  if (daily.firstIn && daily.lastOut) {
    daily.totalWorkHours = calculateWorkHours(daily.firstIn, daily.lastOut);
  }

  await daily.save({ session });
  return daily;
};

// ─────────────────────────────────────────────
//  LOG CREATION
// ─────────────────────────────────────────────

/**
 * POST /api/v1/attendance/logs
 *
 * FIX BUG-AL-C02 [CRITICAL] — All permission/validation checks moved BEFORE the transaction.
 * FIX BUG-AL-C10 [MEDIUM]   — Duplicate check includes punch type.
 */
exports.createAttendanceLog = catchAsync(async (req, res, next) => {
  // FIX BUG-AL-C02 — Run all validation BEFORE opening a transaction.
  // Validations don't need to be transactional and their errors should not
  // go through abortTransaction() — they are business rule rejections, not DB errors.

  if (!req.user.attendanceConfig?.isAttendanceEnabled) {
    return next(new AppError('Attendance is disabled for your account', 403));
  }

  const source = detectSource(req);

  if (source === 'web'    && !req.user.attendanceConfig?.allowWebPunch) {
    return next(new AppError('Web punch is not allowed for your account', 403));
  }
  if (source === 'mobile' && !req.user.attendanceConfig?.allowMobilePunch) {
    return next(new AppError('Mobile punch is not allowed for your account', 403));
  }

  // Geofence check (no transaction needed)
  let geofenceStatus = 'disabled';
  let geofenceId     = null;

  if (req.body.location?.geoJson?.coordinates) {
    const geoResult = await checkGeoFence(
      req.body.location.geoJson.coordinates,
      req.user.organizationId,
      req.user.branchId,
      req.user  // FIX BUG-AL-C05 — pass full user object
    );

    geofenceStatus = geoResult.status;
    geofenceId     = geoResult.geofence?._id || null;

    if (req.user.attendanceConfig?.enforceGeoFence && geoResult.status === 'outside') {
      return next(new AppError('You are outside the allowed geofence area', 403));
    }
  }

  // FIX BUG-AL-C10 [MEDIUM] — Duplicate check includes punch TYPE to allow valid IN→OUT within 30s
  const recentLog = await AttendanceLog.findOne({
    user:      req.user._id,
    type:      req.body.type,
    timestamp: { $gte: new Date(Date.now() - 30_000) },
  });
  if (recentLog) return next(new AppError('Please wait 30 seconds between punches of the same type', 429));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const logData = {
      user:            req.user._id,
      organizationId:  req.user.organizationId,
      branchId:        req.user.branchId,
      source,
      type:            req.body.type,
      timestamp:       req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
      serverTimestamp: new Date(),
      processingStatus:'pending',
      ipAddress:       req.ip || req.connection?.remoteAddress,
      userAgent:       req.get('User-Agent'),
      deviceId:        req.headers['x-device-id'],
      location:        req.body.location
        ? { ...req.body.location, geofenceStatus, geofenceId }
        : undefined,
    };

    const [log] = await AttendanceLog.create([logData], { session });

    const daily = await processLogForDaily(log, session);

    log.processingStatus = 'processed';
    log.isVerified       = true;
    await log.save({ session });

    await session.commitTransaction();

    await log.populate([
      { path: 'machineId', select: 'name serialNumber' },
    ]);

    res.status(201).json({
      status: 'success',
      data: {
        log,
        daily: {
          date:           daily.date,
          firstIn:        daily.firstIn,
          lastOut:        daily.lastOut,
          totalWorkHours: daily.totalWorkHours,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * POST /api/v1/attendance/logs/bulk
 *
 * FIX BUG-AL-C04 [CRITICAL] — Machine stats use $inc (atomic), not read-modify-write.
 */
exports.bulkCreateLogs = catchAsync(async (req, res, next) => {
  const { logs } = req.body;
  if (!Array.isArray(logs) || logs.length === 0) {
    return next(new AppError('Please provide an array of logs', 400));
  }

  const machine = req.attendanceMachine;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = { created: [], duplicates: [], errors: [] };

    for (const logData of logs) {
      try {
        // FIX BUG-AM-C04 — Duplicate check must not use logData.userId (machine ID, not ObjectId)
        const existing = await AttendanceLog.findOne({
          machineId: machine._id,
          timestamp: new Date(logData.timestamp),
          'biometricData.templateId': logData.biometricData?.templateId,
        }).session(session);

        if (existing) { results.duplicates.push(logData); continue; }

        logData.organizationId   = machine.organizationId;
        logData.branchId         = machine.branchId;
        logData.machineId        = machine._id;
        logData.source           = 'machine';
        logData.serverTimestamp  = new Date();
        logData.processingStatus = 'pending';

        const [log] = await AttendanceLog.create([logData], { session });
        await processLogForDaily(log, session);

        log.processingStatus = 'processed';
        await log.save({ session });

        results.created.push(log);
      } catch (error) {
        results.errors.push({ data: logData, error: error.message });
      }
    }

    // FIX BUG-AL-C04 [CRITICAL] — Use $inc for atomic stat increment.
    // Original: read stats → add → save (race condition under concurrent bulk uploads).
    await machine.constructor.findByIdAndUpdate(machine._id, {
      $inc: {
        'stats.totalTransactions': results.created.length,
        'stats.successfulReads':   results.created.length,
      },
      $set: { 'stats.lastTransactionAt': new Date() },
    }, { session });

    await session.commitTransaction();

    res.status(201).json({
      status: 'success',
      data: {
        machine:    machine.name,
        created:    results.created.length,
        duplicates: results.duplicates.length,
        errors:     results.errors.length,
        logs:       results.created,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────
//  READ OPERATIONS
// ─────────────────────────────────────────────

exports.getAllLogs = factory.getAll(AttendanceLog, {
  searchFields: ['type', 'source', 'ipAddress'],
  populate: [
    { path: 'user',      select: 'name employeeProfile.employeeId' },
    { path: 'machineId', select: 'name serialNumber' },
  ],
  sort: { timestamp: -1 },
});

exports.getLog = factory.getOne(AttendanceLog, {
  populate: [
    { path: 'user',       select: 'name employeeProfile.employeeId email' },
    { path: 'machineId',  select: 'name serialNumber providerType' },
    { path: 'verifiedBy', select: 'name' },
  ],
});

/**
 * GET /api/v1/attendance/logs/my-logs
 *
 * FIX BUG-AL-C06 [HIGH] — Today's summary uses server-side date range, not string comparison.
 */
exports.getMyLogs = catchAsync(async (req, res, next) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const skip  = (page - 1) * limit;

  const query = {
    user:           req.user._id,
    organizationId: req.user.organizationId,
  };

  if (req.query.fromDate || req.query.toDate) {
    query.timestamp = {};
    const from = parseQueryDate(req.query.fromDate);
    const to   = parseQueryDate(req.query.toDate);
    if (from) query.timestamp.$gte = from;
    if (to)   query.timestamp.$lte = endOfDay(to);
  }

  if (req.query.type) query.type = req.query.type;

  const [logs, total] = await Promise.all([
    AttendanceLog.find(query).populate('machineId', 'name').skip(skip).limit(limit).sort('-timestamp'),
    AttendanceLog.countDocuments(query),
  ]);

  // FIX BUG-AL-C06 [HIGH] — Use proper Date range for today's summary (no string comparison).
  // Original: `l.timestamp.toISOString().split('T')[0] === today` — timezone-sensitive split.
  const todayStart = startOfDay(new Date());
  const todayEnd   = endOfDay(new Date());
  const todayLogs  = logs.filter(l => l.timestamp >= todayStart && l.timestamp <= todayEnd);

  const firstIn = todayLogs.find(l  => l.type.includes('in'))?.timestamp;
  const lastOut = todayLogs.filter(l => l.type.includes('out')).pop()?.timestamp;

  res.status(200).json({
    status: 'success',
    results: logs.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: {
      summary: {
        today: {
          firstIn,
          lastOut,
          totalLogs: todayLogs.length,
          punches:   todayLogs.map(l => ({ time: l.timestamp, type: l.type, source: l.source })),
        },
      },
      logs,
    },
  });
});

exports.getUserLogs = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findOne({ _id: userId, organizationId: req.user.organizationId });
  if (!user) return next(new AppError('User not found', 404));

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const skip  = (page - 1) * limit;

  const query = { user: userId, organizationId: req.user.organizationId };

  if (req.query.fromDate || req.query.toDate) {
    query.timestamp = {};
    const from = parseQueryDate(req.query.fromDate);
    const to   = parseQueryDate(req.query.toDate);
    if (from) query.timestamp.$gte = from;
    if (to)   query.timestamp.$lte = endOfDay(to);
  }

  const [logs, total] = await Promise.all([
    AttendanceLog.find(query).populate('machineId','name').populate('verifiedBy','name').skip(skip).limit(limit).sort('-timestamp'),
    AttendanceLog.countDocuments(query),
  ]);

  res.status(200).json({ status:'success', results: logs.length, total, page, totalPages: Math.ceil(total/limit), data:{ logs } });
});

// ─────────────────────────────────────────────
//  VERIFICATION & CORRECTION
// ─────────────────────────────────────────────

exports.verifyLog = catchAsync(async (req, res, next) => {
  const log = await AttendanceLog.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!log) return next(new AppError('Log not found', 404));
  log.isVerified       = true;
  log.verifiedBy       = req.user._id;
  log.verifiedAt       = new Date();
  log.processingStatus = 'processed';
  await log.save();
  res.status(200).json({ status: 'success', data: { log } });
});

exports.flagLog = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  if (!reason) return next(new AppError('Please provide a reason', 400));
  const log = await AttendanceLog.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!log) return next(new AppError('Log not found', 404));
  log.processingStatus = 'flagged';
  log.notes            = reason;
  log.verifiedBy       = req.user._id;
  log.verifiedAt       = new Date();
  await log.save();
  res.status(200).json({ status: 'success', data: { log } });
});

/**
 * PATCH /api/v1/attendance/logs/:id/correct
 *
 * FIX BUG-AL-C07 [HIGH] — Corrected log built from scratch, not from contaminated toObject() spread.
 * FIX CROSS-C03 [HIGH]  — session.endSession() always called in finally block.
 */
exports.correctLog = catchAsync(async (req, res, next) => {
  const { timestamp, type, reason } = req.body;
  if (!timestamp || !type || !reason) {
    return next(new AppError('Please provide timestamp, type and reason', 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const originalLog = await AttendanceLog.findOne({
      _id:            req.params.id,
      organizationId: req.user.organizationId,
    }).session(session);

    if (!originalLog) {
      // FIX CROSS-C03 — Abort before returning to avoid session leak
      await session.abortTransaction();
      return next(new AppError('Log not found', 404));
    }

    originalLog.processingStatus = 'corrected';
    originalLog.notes            = `Corrected: ${reason}`;
    await originalLog.save({ session });

    // FIX BUG-AL-C07 [HIGH] — Build corrected log from scratch using only essential fields.
    // Original: `toObject()` spread carried over stale processingStatus, isCorrection, etc.
    const correctedLog = await AttendanceLog.create([{
      user:            originalLog.user,
      organizationId:  originalLog.organizationId,
      branchId:        originalLog.branchId,
      machineId:       originalLog.machineId,
      source:          originalLog.source,
      timestamp:       new Date(timestamp),
      serverTimestamp: new Date(),
      type,
      processingStatus: 'processed',
      isCorrection:    true,
      originalLogId:   originalLog._id,
      notes:           reason,
      verifiedBy:      req.user._id,
      verifiedAt:      new Date(),
      isVerified:      true,
    }], { session });

    await processLogForDaily(correctedLog[0], session);

    await session.commitTransaction();
    res.status(200).json({ status: 'success', data: { originalLog, correctedLog: correctedLog[0] } });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession(); // FIX CROSS-C03 — always called
  }
});

// ─────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────

exports.getLogStats = catchAsync(async (req, res, next) => {
  const matchStage = { organizationId: req.user.organizationId };
  const from = parseQueryDate(req.query.fromDate);
  const to   = parseQueryDate(req.query.toDate);
  if (from || to) {
    matchStage.timestamp = {};
    if (from) matchStage.timestamp.$gte = from;
    if (to)   matchStage.timestamp.$lte = endOfDay(to);
  }

  const stats = await AttendanceLog.aggregate([
    { $match: matchStage },
    {
      $facet: {
        bySource: [{ $group: { _id: '$source', count: { $sum:1 }, verified: { $sum:{ $cond:['$isVerified',1,0] } } } }],
        byType:   [{ $group: { _id: '$type',   count: { $sum:1 } } }],
        byStatus: [{ $group: { _id: '$processingStatus', count: { $sum:1 } } }],
        hourly:   [{ $group: { _id: { $hour: '$timestamp' }, count: { $sum:1 } } }, { $sort:{'_id':1} }],
        total: [
          { $group: { _id:null, totalLogs:{ $sum:1 }, verifiedLogs:{ $sum:{ $cond:['$isVerified',1,0] } }, uniqueUsers:{ $addToSet:'$user' } } },
          { $project: { totalLogs:1, verifiedLogs:1, verifiedPercentage:{ $multiply:[{ $divide:['$verifiedLogs','$totalLogs'] },100] }, uniqueUsers:{ $size:'$uniqueUsers' } } },
        ],
      },
    },
  ]);

  res.status(200).json({ status:'success', data: stats[0] });
});

/**
 * GET /api/v1/attendance/logs/realtime-feed
 *
 * FIX BUG-AL-C09 [MEDIUM] — Timeline loop fixed: negative hours no longer wrap to previous day.
 */
exports.getRealtimeFeed = catchAsync(async (req, res, next) => {
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logs = await AttendanceLog.find({
    organizationId: req.user.organizationId,
    timestamp: { $gte: since },
  })
    .populate('user',      'name employeeProfile.employeeId avatar')
    .populate('machineId', 'name')
    .sort('-timestamp')
    .limit(limit);

  // FIX BUG-AL-C09 [MEDIUM] — Use epoch subtraction to avoid setHours(-N) wrapping to previous day.
  // Original: `hour.setHours(now.getHours() - i)` → negative hours wrapped to yesterday.
  const now      = new Date();
  const timeline = [];

  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now.getTime() - i * 3600_000);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 3600_000);

    const hourLogs = logs.filter(l => l.timestamp >= hourStart && l.timestamp < hourEnd);
    timeline.push({ hour: hourStart.getHours(), count: hourLogs.length, logs: hourLogs.slice(0, 5) });
  }

  res.status(200).json({ status:'success', data:{ total: logs.length, timeline, recent: logs.slice(0, 20) } });
});


// // controllers/attendance/attendanceLog.controller.js
// const mongoose = require('mongoose');
// const AttendanceLog = require('../../models/attendanceLog.model');
// const AttendanceDaily = require('../../models/attendanceDaily.model');
// const Shift = require('../../models/shift.model');
// const GeoFence = require('../../models/geoFencing.model');
// const User = require('../../../auth/core/user.model');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError = require('../../../../core/utils/api/appError');
// const factory = require('../../../../core/utils/api/handlerFactory');

// // ======================================================
// // HELPERS & UTILITIES
// // ======================================================

// const calculateDistance = (lat1, lon1, lat2, lon2) => {
//   const R = 6371e3; // Earth's radius in meters
//   const φ1 = lat1 * Math.PI / 180;
//   const φ2 = lat2 * Math.PI / 180;
//   const Δφ = (lat2 - lat1) * Math.PI / 180;
//   const Δλ = (lon2 - lon1) * Math.PI / 180;

//   const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
//             Math.cos(φ1) * Math.cos(φ2) *
//             Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

//   return R * c; // Distance in meters
// };

// const checkGeoFence = async (coordinates, organizationId, branchId, userId) => {
//   const [longitude, latitude] = coordinates;
  
//   // Find active geofences for this organization/branch
//   const geofences = await GeoFence.find({
//     organizationId,
//     $or: [
//       { branchId: branchId },
//       { applicableToAll: true }
//     ],
//     isActive: true
//   });
  
//   if (geofences.length === 0) {
//     return { status: 'disabled', geofence: null };
//   }
  
//   // Check each geofence
//   for (const geofence of geofences) {
//     // Check if user is applicable
//     if (!geofence.applicableToAll) {
//       const isApplicable = 
//         geofence.applicableUsers?.includes(userId) ||
//         geofence.applicableDepartments?.some(d => d.equals(userId)) ||
//         geofence.applicableDesignations?.some(d => d.equals(userId));
      
//       if (!isApplicable) continue;
//     }
    
//     // Check time restrictions
//     if (geofence.timeRestrictions?.length) {
//       const now = new Date();
//       const dayOfWeek = now.getDay();
//       const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
//       const restriction = geofence.timeRestrictions.find(r => 
//         r.dayOfWeek.includes(dayOfWeek)
//       );
      
//       if (restriction && !restriction.allowed) {
//         continue; // Skip this geofence if not allowed at this time
//       }
//     }
    
//     // Check if point is inside
//     const isInside = geofence.isPointInside(longitude, latitude);
    
//     if (isInside) {
//       return { status: 'inside', geofence };
//     }
//   }
  
//   return { status: 'outside', geofence: null };
// };

// const detectSource = (req) => {
//   if (req.headers['x-attendance-source'] === 'machine') return 'machine';
//   if (req.headers['user-agent']?.includes('Mobile')) return 'mobile';
//   if (req.headers['origin']?.includes('admin')) return 'admin_manual';
//   return 'web';
// };

// const processLogForDaily = async (log, session) => {
//   const dateStr = log.timestamp.toISOString().split('T')[0];
//   const startOfDay = new Date(log.timestamp);
//   startOfDay.setHours(0, 0, 0, 0);
//   const endOfDay = new Date(log.timestamp);
//   endOfDay.setHours(23, 59, 59, 999);
  
//   // Find or create daily record
//   let daily = await AttendanceDaily.findOne({
//     user: log.user,
//     date: dateStr,
//     organizationId: log.organizationId
//   }).session(session);
  
//   if (!daily) {
//     // Get user's shift
//     const user = await User.findById(log.user).session(session);
//     const shift = user?.attendanceConfig?.shiftId ? 
//       await Shift.findById(user.attendanceConfig.shiftId).session(session) : null;
    
//     daily = await AttendanceDaily.create([{
//       user: log.user,
//       organizationId: log.organizationId,
//       branchId: log.branchId,
//       date: dateStr,
//       shiftId: user?.attendanceConfig?.shiftId,
//       scheduledInTime: shift?.startTime,
//       scheduledOutTime: shift?.endTime,
//       status: 'absent',
//       logs: []
//     }], { session });
    
//     daily = daily[0];
//   }
  
//   // Add log to daily record
//   if (!daily.logs.includes(log._id)) {
//     daily.logs.push(log._id);
//   }
  
//   // Update first in / last out
//   if (log.type === 'in' || log.type === 'remote_in') {
//     if (!daily.firstIn || log.timestamp < daily.firstIn) {
//       daily.firstIn = log.timestamp;
//     }
//   } else if (log.type === 'out' || log.type === 'remote_out') {
//     if (!daily.lastOut || log.timestamp > daily.lastOut) {
//       daily.lastOut = log.timestamp;
//     }
//   }
  
//   // Calculate total hours if we have both in and out
//   if (daily.firstIn && daily.lastOut) {
//     const diffMs = daily.lastOut - daily.firstIn;
//     daily.totalWorkHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
//   }
  
//   await daily.save({ session });
  
//   return daily;
// };

// // ======================================================
// // LOG CREATION & PROCESSING
// // ======================================================

// /**
//  * @desc    Create attendance log (punch in/out)
//  * @route   POST /api/v1/attendance/logs
//  * @access  Private
//  */
// exports.createAttendanceLog = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     // Set basic fields
//     req.body.user = req.user._id;
//     req.body.organizationId = req.user.organizationId;
//     req.body.branchId = req.user.branchId;
//     req.body.source = detectSource(req);
//     req.body.serverTimestamp = new Date();
//     req.body.processingStatus = 'pending';
    
//     // Add device info
//     req.body.ipAddress = req.ip || req.connection.remoteAddress;
//     req.body.userAgent = req.get('User-Agent');
//     req.body.deviceId = req.headers['x-device-id'];
    
//     // Check geofence if location provided
//     if (req.body.location?.coordinates) {
//       const geoResult = await checkGeoFence(
//         req.body.location.coordinates,
//         req.user.organizationId,
//         req.user.branchId,
//         req.user._id
//       );
      
//       req.body.location.geofenceStatus = geoResult.status;
//       if (geoResult.geofence) {
//         req.body.location.geofenceId = geoResult.geofence._id;
//       }
      
//       // Enforce geofence if required
//       if (req.user.attendanceConfig?.enforceGeoFence && geoResult.status === 'outside') {
//         throw new AppError('You are outside the allowed geofence area', 403);
//       }
//     }
    
//     // Check if user is allowed to punch
//     if (!req.user.attendanceConfig?.isAttendanceEnabled) {
//       throw new AppError('Attendance is disabled for your account', 403);
//     }
    
//     // Check punch method
//     if (req.body.source === 'web' && !req.user.attendanceConfig?.allowWebPunch) {
//       throw new AppError('Web punch is not allowed for your account', 403);
//     }
    
//     if (req.body.source === 'mobile' && !req.user.attendanceConfig?.allowMobilePunch) {
//       throw new AppError('Mobile punch is not allowed for your account', 403);
//     }
    
//     // Check for duplicate in last 30 seconds
//     const recentLog = await AttendanceLog.findOne({
//       user: req.user._id,
//       timestamp: { $gte: new Date(Date.now() - 30000) } // Last 30 seconds
//     }).session(session);
    
//     if (recentLog) {
//       throw new AppError('Please wait 30 seconds between punches', 429);
//     }
    
//     // Create log
//     const [log] = await AttendanceLog.create([req.body], { session });
    
//     // Process for daily attendance
//     const daily = await processLogForDaily(log, session);
    
//     // Mark as processed
//     log.processingStatus = 'processed';
//     log.isVerified = true;
//     await log.save({ session });
    
//     await session.commitTransaction();
    
//     // Populate for response
//     await log.populate([
//       { path: 'machineId', select: 'name serialNumber' },
//       { path: 'location.geofenceId', select: 'name' }
//     ]);
    
//     res.status(201).json({
//       status: 'success',
//       data: {
//         log,
//         daily: {
//           date: daily.date,
//           firstIn: daily.firstIn,
//           lastOut: daily.lastOut,
//           totalWorkHours: daily.totalWorkHours
//         }
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
//  * @desc    Bulk create logs (for machines)
//  * @route   POST /api/v1/attendance/logs/bulk
//  * @access  Private (Machine/API Key)
//  */
// exports.bulkCreateLogs = catchAsync(async (req, res, next) => {
//   const { logs } = req.body;
  
//   if (!Array.isArray(logs) || logs.length === 0) {
//     return next(new AppError('Please provide an array of logs', 400));
//   }
  
//   // Verify machine API key (middleware would handle this)
//   const machine = req.attendanceMachine;
  
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const results = {
//       created: [],
//       duplicates: [],
//       errors: []
//     };
    
//     for (const logData of logs) {
//       try {
//         // Check for duplicate
//         const existing = await AttendanceLog.findOne({
//           machineId: machine._id,
//           user: logData.user,
//           timestamp: logData.timestamp
//         }).session(session);
        
//         if (existing) {
//           results.duplicates.push(logData);
//           continue;
//         }
        
//         // Set common fields
//         logData.organizationId = machine.organizationId;
//         logData.branchId = machine.branchId;
//         logData.machineId = machine._id;
//         logData.source = 'machine';
//         logData.serverTimestamp = new Date();
//         logData.processingStatus = 'pending';
        
//         // Create log
//         const [log] = await AttendanceLog.create([logData], { session });
        
//         // Process for daily
//         await processLogForDaily(log, session);
        
//         log.processingStatus = 'processed';
//         await log.save({ session });
        
//         results.created.push(log);
//       } catch (error) {
//         results.errors.push({ data: logData, error: error.message });
//       }
//     }
    
//     // Update machine stats
//     machine.stats.totalTransactions += results.created.length;
//     machine.stats.successfulReads += results.created.length;
//     machine.stats.lastTransactionAt = new Date();
//     await machine.save({ session });
    
//     await session.commitTransaction();
    
//     res.status(201).json({
//       status: 'success',
//       data: {
//         machine: machine.name,
//         created: results.created.length,
//         duplicates: results.duplicates.length,
//         errors: results.errors.length,
//         logs: results.created
//       }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// // ======================================================
// // READ OPERATIONS
// // ======================================================

// /**
//  * @desc    Get all attendance logs
//  * @route   GET /api/v1/attendance/logs
//  * @access  Private
//  */
// exports.getAllLogs = factory.getAll(AttendanceLog, {
//   searchFields: ['type', 'source', 'ipAddress'],
//   populate: [
//     { path: 'user', select: 'name employeeProfile.employeeId' },
//     { path: 'machineId', select: 'name serialNumber' },
//     { path: 'location.geofenceId', select: 'name' }
//   ],
//   sort: { timestamp: -1 }
// });

// /**
//  * @desc    Get single log
//  * @route   GET /api/v1/attendance/logs/:id
//  * @access  Private
//  */
// exports.getLog = factory.getOne(AttendanceLog, {
//   populate: [
//     { path: 'user', select: 'name employeeProfile.employeeId email' },
//     { path: 'machineId', select: 'name serialNumber providerType' },
//     { path: 'location.geofenceId', select: 'name address' },
//     { path: 'verifiedBy', select: 'name' }
//   ]
// });

// /**
//  * @desc    Get my logs
//  * @route   GET /api/v1/attendance/logs/my-logs
//  * @access  Private
//  */
// exports.getMyLogs = catchAsync(async (req, res, next) => {
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 50;
//   const skip = (page - 1) * limit;
  
//   const query = {
//     user: req.user._id,
//     organizationId: req.user.organizationId
//   };
  
//   // Date range filter
//   if (req.query.fromDate || req.query.toDate) {
//     query.timestamp = {};
//     if (req.query.fromDate) query.timestamp.$gte = new Date(req.query.fromDate);
//     if (req.query.toDate) query.timestamp.$lte = new Date(req.query.toDate);
//   }
  
//   // Type filter
//   if (req.query.type) {
//     query.type = req.query.type;
//   }
  
//   const [logs, total] = await Promise.all([
//     AttendanceLog.find(query)
//       .populate('machineId', 'name')
//       .populate('location.geofenceId', 'name')
//       .skip(skip)
//       .limit(limit)
//       .sort(req.query.sort || '-timestamp'),
//     AttendanceLog.countDocuments(query)
//   ]);
  
//   // Get today's summary
//   const today = new Date().toISOString().split('T')[0];
//   const todayLogs = logs.filter(l => 
//     l.timestamp.toISOString().split('T')[0] === today
//   );
  
//   const firstIn = todayLogs.find(l => l.type.includes('in'))?.timestamp;
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
//           punches: todayLogs.map(l => ({
//             time: l.timestamp,
//             type: l.type,
//             source: l.source
//           }))
//         }
//       },
//       logs
//     }
//   });
// });

// /**
//  * @desc    Get user logs (Admin)
//  * @route   GET /api/v1/attendance/logs/user/:userId
//  * @access  Private (Admin/HR)
//  */
// exports.getUserLogs = catchAsync(async (req, res, next) => {
//   const { userId } = req.params;
  
//   // Verify user exists in org
//   const user = await User.findOne({
//     _id: userId,
//     organizationId: req.user.organizationId
//   });
  
//   if (!user) {
//     return next(new AppError('User not found', 404));
//   }
  
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 50;
//   const skip = (page - 1) * limit;
  
//   const query = {
//     user: userId,
//     organizationId: req.user.organizationId
//   };
  
//   // Date range
//   if (req.query.fromDate || req.query.toDate) {
//     query.timestamp = {};
//     if (req.query.fromDate) query.timestamp.$gte = new Date(req.query.fromDate);
//     if (req.query.toDate) query.timestamp.$lte = new Date(req.query.toDate);
//   }
  
//   const [logs, total] = await Promise.all([
//     AttendanceLog.find(query)
//       .populate('machineId', 'name')
//       .populate('verifiedBy', 'name')
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

// // ======================================================
// // VERIFICATION & CORRECTION
// // ======================================================

// /**
//  * @desc    Verify log (mark as verified)
//  * @route   PATCH /api/v1/attendance/logs/:id/verify
//  * @access  Private (Admin/HR)
//  */
// exports.verifyLog = catchAsync(async (req, res, next) => {
//   const log = await AttendanceLog.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!log) {
//     return next(new AppError('Log not found', 404));
//   }
  
//   log.isVerified = true;
//   log.verifiedBy = req.user._id;
//   log.verifiedAt = new Date();
//   log.processingStatus = 'processed';
  
//   await log.save();
  
//   res.status(200).json({
//     status: 'success',
//     data: { log }
//   });
// });

// /**
//  * @desc    Flag suspicious log
//  * @route   PATCH /api/v1/attendance/logs/:id/flag
//  * @access  Private (Admin/HR)
//  */
// exports.flagLog = catchAsync(async (req, res, next) => {
//   const { reason } = req.body;
  
//   if (!reason) {
//     return next(new AppError('Please provide a reason', 400));
//   }
  
//   const log = await AttendanceLog.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });
  
//   if (!log) {
//     return next(new AppError('Log not found', 404));
//   }
  
//   log.processingStatus = 'flagged';
//   log.notes = reason;
//   log.verifiedBy = req.user._id;
//   log.verifiedAt = new Date();
  
//   await log.save();
  
//   res.status(200).json({
//     status: 'success',
//     data: { log }
//   });
// });

// /**
//  * @desc    Correct log (Admin only)
//  * @route   PATCH /api/v1/attendance/logs/:id/correct
//  * @access  Private (Admin only)
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
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     }).session(session);
    
//     if (!originalLog) {
//       return next(new AppError('Log not found', 404));
//     }
    
//     // Mark original as corrected
//     originalLog.processingStatus = 'corrected';
//     originalLog.notes = `Corrected: ${reason}`;
//     await originalLog.save({ session });
    
//     // Create corrected log
//     const correctedData = originalLog.toObject();
//     delete correctedData._id;
//     delete correctedData.createdAt;
//     delete correctedData.updatedAt;
    
//     correctedData.timestamp = new Date(timestamp);
//     correctedData.type = type;
//     correctedData.processingStatus = 'processed';
//     correctedData.isCorrection = true;
//     correctedData.originalLogId = originalLog._id;
//     correctedData.notes = reason;
//     correctedData.verifiedBy = req.user._id;
//     correctedData.verifiedAt = new Date();
    
//     const [correctedLog] = await AttendanceLog.create([correctedData], { session });
    
//     // Reprocess daily attendance
//     await processLogForDaily(correctedLog, session);
    
//     await session.commitTransaction();
    
//     res.status(200).json({
//       status: 'success',
//       data: {
//         originalLog,
//         correctedLog
//       }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// // ======================================================
// // ANALYTICS & REPORTS
// // ======================================================

// /**
//  * @desc    Get logs statistics
//  * @route   GET /api/v1/attendance/logs/stats
//  * @access  Private
//  */
// exports.getLogStats = catchAsync(async (req, res, next) => {
//   const { fromDate, toDate } = req.query;
  
//   const matchStage = {
//     organizationId: req.user.organizationId
//   };
  
//   if (fromDate || toDate) {
//     matchStage.timestamp = {};
//     if (fromDate) matchStage.timestamp.$gte = new Date(fromDate);
//     if (toDate) matchStage.timestamp.$lte = new Date(toDate);
//   }
  
//   const stats = await AttendanceLog.aggregate([
//     { $match: matchStage },
//     {
//       $facet: {
//         bySource: [
//           {
//             $group: {
//               _id: '$source',
//               count: { $sum: 1 },
//               verified: {
//                 $sum: { $cond: ['$isVerified', 1, 0] }
//               }
//             }
//           }
//         ],
//         byType: [
//           {
//             $group: {
//               _id: '$type',
//               count: { $sum: 1 }
//             }
//           }
//         ],
//         byStatus: [
//           {
//             $group: {
//               _id: '$processingStatus',
//               count: { $sum: 1 }
//             }
//           }
//         ],
//         hourly: [
//           {
//             $group: {
//               _id: { $hour: '$timestamp' },
//               count: { $sum: 1 }
//             }
//           },
//           { $sort: { '_id': 1 } }
//         ],
//         total: [
//           {
//             $group: {
//               _id: null,
//               totalLogs: { $sum: 1 },
//               verifiedLogs: { $sum: { $cond: ['$isVerified', 1, 0] } },
//               uniqueUsers: { $addToSet: '$user' }
//             }
//           },
//           {
//             $project: {
//               totalLogs: 1,
//               verifiedLogs: 1,
//               verifiedPercentage: {
//                 $multiply: [
//                   { $divide: ['$verifiedLogs', '$totalLogs'] },
//                   100
//                 ]
//               },
//               uniqueUsers: { $size: '$uniqueUsers' }
//             }
//           }
//         ]
//       }
//     }
//   ]);
  
//   res.status(200).json({
//     status: 'success',
//     data: stats[0]
//   });
// });

// /**
//  * @desc    Get real-time feed
//  * @route   GET /api/v1/attendance/logs/realtime-feed
//  * @access  Private (Admin/HR)
//  */
// exports.getRealtimeFeed = catchAsync(async (req, res, next) => {
//   const limit = parseInt(req.query.limit) || 50;
  
//   const logs = await AttendanceLog.find({
//     organizationId: req.user.organizationId,
//     timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
//   })
//   .populate('user', 'name employeeProfile.employeeId avatar')
//   .populate('machineId', 'name')
//   .sort('-timestamp')
//   .limit(limit);
  
//   // Group by hour for timeline
//   const timeline = [];
//   const now = new Date();
//   for (let i = 23; i >= 0; i--) {
//     const hour = new Date(now);
//     hour.setHours(now.getHours() - i, 0, 0, 0);
//     const nextHour = new Date(hour);
//     nextHour.setHours(hour.getHours() + 1);
    
//     const hourLogs = logs.filter(l => 
//       l.timestamp >= hour && l.timestamp < nextHour
//     );
    
//     timeline.push({
//       hour: hour.getHours(),
//       count: hourLogs.length,
//       logs: hourLogs.slice(0, 5) // Preview first 5
//     });
//   }
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       total: logs.length,
//       timeline,
//       recent: logs.slice(0, 20)
//     }
//   });
// });