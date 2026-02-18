// controllers/attendance/attendanceLog.controller.js
const mongoose = require('mongoose');
const AttendanceLog = require('../../models/attendanceLog.model');
const AttendanceDaily = require('../../models/attendanceDaily.model');
const Shift = require('../../models/shift.model');
const GeoFence = require('../../models/geoFencing.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/catchAsync');
const AppError = require('../../../../core/utils/appError');
const factory = require('../../../../core/utils/handlerFactory');

// ======================================================
// HELPERS & UTILITIES
// ======================================================

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

const checkGeoFence = async (coordinates, organizationId, branchId, userId) => {
  const [longitude, latitude] = coordinates;
  
  // Find active geofences for this organization/branch
  const geofences = await GeoFence.find({
    organizationId,
    $or: [
      { branchId: branchId },
      { applicableToAll: true }
    ],
    isActive: true
  });
  
  if (geofences.length === 0) {
    return { status: 'disabled', geofence: null };
  }
  
  // Check each geofence
  for (const geofence of geofences) {
    // Check if user is applicable
    if (!geofence.applicableToAll) {
      const isApplicable = 
        geofence.applicableUsers?.includes(userId) ||
        geofence.applicableDepartments?.some(d => d.equals(userId)) ||
        geofence.applicableDesignations?.some(d => d.equals(userId));
      
      if (!isApplicable) continue;
    }
    
    // Check time restrictions
    if (geofence.timeRestrictions?.length) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const restriction = geofence.timeRestrictions.find(r => 
        r.dayOfWeek.includes(dayOfWeek)
      );
      
      if (restriction && !restriction.allowed) {
        continue; // Skip this geofence if not allowed at this time
      }
    }
    
    // Check if point is inside
    const isInside = geofence.isPointInside(longitude, latitude);
    
    if (isInside) {
      return { status: 'inside', geofence };
    }
  }
  
  return { status: 'outside', geofence: null };
};

const detectSource = (req) => {
  if (req.headers['x-attendance-source'] === 'machine') return 'machine';
  if (req.headers['user-agent']?.includes('Mobile')) return 'mobile';
  if (req.headers['origin']?.includes('admin')) return 'admin_manual';
  return 'web';
};

const processLogForDaily = async (log, session) => {
  const dateStr = log.timestamp.toISOString().split('T')[0];
  const startOfDay = new Date(log.timestamp);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(log.timestamp);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Find or create daily record
  let daily = await AttendanceDaily.findOne({
    user: log.user,
    date: dateStr,
    organizationId: log.organizationId
  }).session(session);
  
  if (!daily) {
    // Get user's shift
    const user = await User.findById(log.user).session(session);
    const shift = user?.attendanceConfig?.shiftId ? 
      await Shift.findById(user.attendanceConfig.shiftId).session(session) : null;
    
    daily = await AttendanceDaily.create([{
      user: log.user,
      organizationId: log.organizationId,
      branchId: log.branchId,
      date: dateStr,
      shiftId: user?.attendanceConfig?.shiftId,
      scheduledInTime: shift?.startTime,
      scheduledOutTime: shift?.endTime,
      status: 'absent',
      logs: []
    }], { session });
    
    daily = daily[0];
  }
  
  // Add log to daily record
  if (!daily.logs.includes(log._id)) {
    daily.logs.push(log._id);
  }
  
  // Update first in / last out
  if (log.type === 'in' || log.type === 'remote_in') {
    if (!daily.firstIn || log.timestamp < daily.firstIn) {
      daily.firstIn = log.timestamp;
    }
  } else if (log.type === 'out' || log.type === 'remote_out') {
    if (!daily.lastOut || log.timestamp > daily.lastOut) {
      daily.lastOut = log.timestamp;
    }
  }
  
  // Calculate total hours if we have both in and out
  if (daily.firstIn && daily.lastOut) {
    const diffMs = daily.lastOut - daily.firstIn;
    daily.totalWorkHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  }
  
  await daily.save({ session });
  
  return daily;
};

// ======================================================
// LOG CREATION & PROCESSING
// ======================================================

/**
 * @desc    Create attendance log (punch in/out)
 * @route   POST /api/v1/attendance/logs
 * @access  Private
 */
exports.createAttendanceLog = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Set basic fields
    req.body.user = req.user._id;
    req.body.organizationId = req.user.organizationId;
    req.body.branchId = req.user.branchId;
    req.body.source = detectSource(req);
    req.body.serverTimestamp = new Date();
    req.body.processingStatus = 'pending';
    
    // Add device info
    req.body.ipAddress = req.ip || req.connection.remoteAddress;
    req.body.userAgent = req.get('User-Agent');
    req.body.deviceId = req.headers['x-device-id'];
    
    // Check geofence if location provided
    if (req.body.location?.coordinates) {
      const geoResult = await checkGeoFence(
        req.body.location.coordinates,
        req.user.organizationId,
        req.user.branchId,
        req.user._id
      );
      
      req.body.location.geofenceStatus = geoResult.status;
      if (geoResult.geofence) {
        req.body.location.geofenceId = geoResult.geofence._id;
      }
      
      // Enforce geofence if required
      if (req.user.attendanceConfig?.enforceGeoFence && geoResult.status === 'outside') {
        throw new AppError('You are outside the allowed geofence area', 403);
      }
    }
    
    // Check if user is allowed to punch
    if (!req.user.attendanceConfig?.isAttendanceEnabled) {
      throw new AppError('Attendance is disabled for your account', 403);
    }
    
    // Check punch method
    if (req.body.source === 'web' && !req.user.attendanceConfig?.allowWebPunch) {
      throw new AppError('Web punch is not allowed for your account', 403);
    }
    
    if (req.body.source === 'mobile' && !req.user.attendanceConfig?.allowMobilePunch) {
      throw new AppError('Mobile punch is not allowed for your account', 403);
    }
    
    // Check for duplicate in last 30 seconds
    const recentLog = await AttendanceLog.findOne({
      user: req.user._id,
      timestamp: { $gte: new Date(Date.now() - 30000) } // Last 30 seconds
    }).session(session);
    
    if (recentLog) {
      throw new AppError('Please wait 30 seconds between punches', 429);
    }
    
    // Create log
    const [log] = await AttendanceLog.create([req.body], { session });
    
    // Process for daily attendance
    const daily = await processLogForDaily(log, session);
    
    // Mark as processed
    log.processingStatus = 'processed';
    log.isVerified = true;
    await log.save({ session });
    
    await session.commitTransaction();
    
    // Populate for response
    await log.populate([
      { path: 'machineId', select: 'name serialNumber' },
      { path: 'location.geofenceId', select: 'name' }
    ]);
    
    res.status(201).json({
      status: 'success',
      data: {
        log,
        daily: {
          date: daily.date,
          firstIn: daily.firstIn,
          lastOut: daily.lastOut,
          totalWorkHours: daily.totalWorkHours
        }
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Bulk create logs (for machines)
 * @route   POST /api/v1/attendance/logs/bulk
 * @access  Private (Machine/API Key)
 */
exports.bulkCreateLogs = catchAsync(async (req, res, next) => {
  const { logs } = req.body;
  
  if (!Array.isArray(logs) || logs.length === 0) {
    return next(new AppError('Please provide an array of logs', 400));
  }
  
  // Verify machine API key (middleware would handle this)
  const machine = req.attendanceMachine;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = {
      created: [],
      duplicates: [],
      errors: []
    };
    
    for (const logData of logs) {
      try {
        // Check for duplicate
        const existing = await AttendanceLog.findOne({
          machineId: machine._id,
          user: logData.user,
          timestamp: logData.timestamp
        }).session(session);
        
        if (existing) {
          results.duplicates.push(logData);
          continue;
        }
        
        // Set common fields
        logData.organizationId = machine.organizationId;
        logData.branchId = machine.branchId;
        logData.machineId = machine._id;
        logData.source = 'machine';
        logData.serverTimestamp = new Date();
        logData.processingStatus = 'pending';
        
        // Create log
        const [log] = await AttendanceLog.create([logData], { session });
        
        // Process for daily
        await processLogForDaily(log, session);
        
        log.processingStatus = 'processed';
        await log.save({ session });
        
        results.created.push(log);
      } catch (error) {
        results.errors.push({ data: logData, error: error.message });
      }
    }
    
    // Update machine stats
    machine.stats.totalTransactions += results.created.length;
    machine.stats.successfulReads += results.created.length;
    machine.stats.lastTransactionAt = new Date();
    await machine.save({ session });
    
    await session.commitTransaction();
    
    res.status(201).json({
      status: 'success',
      data: {
        machine: machine.name,
        created: results.created.length,
        duplicates: results.duplicates.length,
        errors: results.errors.length,
        logs: results.created
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ======================================================
// READ OPERATIONS
// ======================================================

/**
 * @desc    Get all attendance logs
 * @route   GET /api/v1/attendance/logs
 * @access  Private
 */
exports.getAllLogs = factory.getAll(AttendanceLog, {
  searchFields: ['type', 'source', 'ipAddress'],
  populate: [
    { path: 'user', select: 'name employeeProfile.employeeId' },
    { path: 'machineId', select: 'name serialNumber' },
    { path: 'location.geofenceId', select: 'name' }
  ],
  sort: { timestamp: -1 }
});

/**
 * @desc    Get single log
 * @route   GET /api/v1/attendance/logs/:id
 * @access  Private
 */
exports.getLog = factory.getOne(AttendanceLog, {
  populate: [
    { path: 'user', select: 'name employeeProfile.employeeId email' },
    { path: 'machineId', select: 'name serialNumber providerType' },
    { path: 'location.geofenceId', select: 'name address' },
    { path: 'verifiedBy', select: 'name' }
  ]
});

/**
 * @desc    Get my logs
 * @route   GET /api/v1/attendance/logs/my-logs
 * @access  Private
 */
exports.getMyLogs = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  
  const query = {
    user: req.user._id,
    organizationId: req.user.organizationId
  };
  
  // Date range filter
  if (req.query.fromDate || req.query.toDate) {
    query.timestamp = {};
    if (req.query.fromDate) query.timestamp.$gte = new Date(req.query.fromDate);
    if (req.query.toDate) query.timestamp.$lte = new Date(req.query.toDate);
  }
  
  // Type filter
  if (req.query.type) {
    query.type = req.query.type;
  }
  
  const [logs, total] = await Promise.all([
    AttendanceLog.find(query)
      .populate('machineId', 'name')
      .populate('location.geofenceId', 'name')
      .skip(skip)
      .limit(limit)
      .sort(req.query.sort || '-timestamp'),
    AttendanceLog.countDocuments(query)
  ]);
  
  // Get today's summary
  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter(l => 
    l.timestamp.toISOString().split('T')[0] === today
  );
  
  const firstIn = todayLogs.find(l => l.type.includes('in'))?.timestamp;
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
          punches: todayLogs.map(l => ({
            time: l.timestamp,
            type: l.type,
            source: l.source
          }))
        }
      },
      logs
    }
  });
});

/**
 * @desc    Get user logs (Admin)
 * @route   GET /api/v1/attendance/logs/user/:userId
 * @access  Private (Admin/HR)
 */
exports.getUserLogs = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  
  // Verify user exists in org
  const user = await User.findOne({
    _id: userId,
    organizationId: req.user.organizationId
  });
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  
  const query = {
    user: userId,
    organizationId: req.user.organizationId
  };
  
  // Date range
  if (req.query.fromDate || req.query.toDate) {
    query.timestamp = {};
    if (req.query.fromDate) query.timestamp.$gte = new Date(req.query.fromDate);
    if (req.query.toDate) query.timestamp.$lte = new Date(req.query.toDate);
  }
  
  const [logs, total] = await Promise.all([
    AttendanceLog.find(query)
      .populate('machineId', 'name')
      .populate('verifiedBy', 'name')
      .skip(skip)
      .limit(limit)
      .sort('-timestamp'),
    AttendanceLog.countDocuments(query)
  ]);
  
  res.status(200).json({
    status: 'success',
    results: logs.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { logs }
  });
});

// ======================================================
// VERIFICATION & CORRECTION
// ======================================================

/**
 * @desc    Verify log (mark as verified)
 * @route   PATCH /api/v1/attendance/logs/:id/verify
 * @access  Private (Admin/HR)
 */
exports.verifyLog = catchAsync(async (req, res, next) => {
  const log = await AttendanceLog.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!log) {
    return next(new AppError('Log not found', 404));
  }
  
  log.isVerified = true;
  log.verifiedBy = req.user._id;
  log.verifiedAt = new Date();
  log.processingStatus = 'processed';
  
  await log.save();
  
  res.status(200).json({
    status: 'success',
    data: { log }
  });
});

/**
 * @desc    Flag suspicious log
 * @route   PATCH /api/v1/attendance/logs/:id/flag
 * @access  Private (Admin/HR)
 */
exports.flagLog = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  
  if (!reason) {
    return next(new AppError('Please provide a reason', 400));
  }
  
  const log = await AttendanceLog.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!log) {
    return next(new AppError('Log not found', 404));
  }
  
  log.processingStatus = 'flagged';
  log.notes = reason;
  log.verifiedBy = req.user._id;
  log.verifiedAt = new Date();
  
  await log.save();
  
  res.status(200).json({
    status: 'success',
    data: { log }
  });
});

/**
 * @desc    Correct log (Admin only)
 * @route   PATCH /api/v1/attendance/logs/:id/correct
 * @access  Private (Admin only)
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
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);
    
    if (!originalLog) {
      return next(new AppError('Log not found', 404));
    }
    
    // Mark original as corrected
    originalLog.processingStatus = 'corrected';
    originalLog.notes = `Corrected: ${reason}`;
    await originalLog.save({ session });
    
    // Create corrected log
    const correctedData = originalLog.toObject();
    delete correctedData._id;
    delete correctedData.createdAt;
    delete correctedData.updatedAt;
    
    correctedData.timestamp = new Date(timestamp);
    correctedData.type = type;
    correctedData.processingStatus = 'processed';
    correctedData.isCorrection = true;
    correctedData.originalLogId = originalLog._id;
    correctedData.notes = reason;
    correctedData.verifiedBy = req.user._id;
    correctedData.verifiedAt = new Date();
    
    const [correctedLog] = await AttendanceLog.create([correctedData], { session });
    
    // Reprocess daily attendance
    await processLogForDaily(correctedLog, session);
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: {
        originalLog,
        correctedLog
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ======================================================
// ANALYTICS & REPORTS
// ======================================================

/**
 * @desc    Get logs statistics
 * @route   GET /api/v1/attendance/logs/stats
 * @access  Private
 */
exports.getLogStats = catchAsync(async (req, res, next) => {
  const { fromDate, toDate } = req.query;
  
  const matchStage = {
    organizationId: req.user.organizationId
  };
  
  if (fromDate || toDate) {
    matchStage.timestamp = {};
    if (fromDate) matchStage.timestamp.$gte = new Date(fromDate);
    if (toDate) matchStage.timestamp.$lte = new Date(toDate);
  }
  
  const stats = await AttendanceLog.aggregate([
    { $match: matchStage },
    {
      $facet: {
        bySource: [
          {
            $group: {
              _id: '$source',
              count: { $sum: 1 },
              verified: {
                $sum: { $cond: ['$isVerified', 1, 0] }
              }
            }
          }
        ],
        byType: [
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 }
            }
          }
        ],
        byStatus: [
          {
            $group: {
              _id: '$processingStatus',
              count: { $sum: 1 }
            }
          }
        ],
        hourly: [
          {
            $group: {
              _id: { $hour: '$timestamp' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id': 1 } }
        ],
        total: [
          {
            $group: {
              _id: null,
              totalLogs: { $sum: 1 },
              verifiedLogs: { $sum: { $cond: ['$isVerified', 1, 0] } },
              uniqueUsers: { $addToSet: '$user' }
            }
          },
          {
            $project: {
              totalLogs: 1,
              verifiedLogs: 1,
              verifiedPercentage: {
                $multiply: [
                  { $divide: ['$verifiedLogs', '$totalLogs'] },
                  100
                ]
              },
              uniqueUsers: { $size: '$uniqueUsers' }
            }
          }
        ]
      }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: stats[0]
  });
});

/**
 * @desc    Get real-time feed
 * @route   GET /api/v1/attendance/logs/realtime-feed
 * @access  Private (Admin/HR)
 */
exports.getRealtimeFeed = catchAsync(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 50;
  
  const logs = await AttendanceLog.find({
    organizationId: req.user.organizationId,
    timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
  })
  .populate('user', 'name employeeProfile.employeeId avatar')
  .populate('machineId', 'name')
  .sort('-timestamp')
  .limit(limit);
  
  // Group by hour for timeline
  const timeline = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const hour = new Date(now);
    hour.setHours(now.getHours() - i, 0, 0, 0);
    const nextHour = new Date(hour);
    nextHour.setHours(hour.getHours() + 1);
    
    const hourLogs = logs.filter(l => 
      l.timestamp >= hour && l.timestamp < nextHour
    );
    
    timeline.push({
      hour: hour.getHours(),
      count: hourLogs.length,
      logs: hourLogs.slice(0, 5) // Preview first 5
    });
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      total: logs.length,
      timeline,
      recent: logs.slice(0, 20)
    }
  });
});