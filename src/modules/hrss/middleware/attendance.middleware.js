const AppError = require('../../core/utils/appError');
const catchAsync = require('../../core/utils/catchAsync');
const User = require('../../../modules/auth/core/user.model');
const AttendanceDaily = require('../models/attendance/attendanceDaily.model');
const dayjs = require('dayjs');

/**
 * Check if user can mark attendance (working hours, permissions, etc.)
 */
exports.checkAttendancePermission = catchAsync(async (req, res, next) => {
  const user = req.user;
  
  // Check if attendance is enabled for user
  if (!user.attendanceConfig?.isAttendanceEnabled) {
    return next(new AppError('Attendance is not enabled for your account', 403));
  }
  
  // Check if within allowed punch times
  if (req.body.type === 'in' || req.body.type === 'out') {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (user.attendanceConfig.punchRestrictions) {
      const { allowedStart, allowedEnd } = user.attendanceConfig.punchRestrictions;
      if (currentHour < allowedStart || currentHour > allowedEnd) {
        return next(new AppError(`Punching allowed only between ${allowedStart}:00 and ${allowedEnd}:00`, 400));
      }
    }
  }
  
  // Check for duplicate recent punch
  const recentPunch = await require('../models/attendance/attendanceLog.model').findOne({
    user: user._id,
    type: req.body.type,
    timestamp: { $gte: dayjs().subtract(2, 'minutes').toDate() }
  });
  
  if (recentPunch) {
    return next(new AppError('Duplicate punch detected. Please wait before punching again.', 429));
  }
  
  // Check if user is on leave
  const today = dayjs().format('YYYY-MM-DD');
  const leaveCheck = await AttendanceDaily.findOne({
    user: user._id,
    date: today,
    status: 'on_leave'
  });
  
  if (leaveCheck && req.body.type === 'in') {
    return next(new AppError('You are on leave today. Cannot mark attendance.', 400));
  }
  
  next();
});

/**
 * Validate geo-fencing for attendance
 */
exports.validateGeoFencing = catchAsync(async (req, res, next) => {
  const user = req.user;
  const { latitude, longitude } = req.body;
  
  if (!user.attendanceConfig?.enforceGeoFence) {
    return next();
  }
  
  if (latitude == null || longitude == null) {
    return next(new AppError('Location is required for attendance marking', 400));
  }
  
  // Get branch location
  const Branch = require('../../../modules/organization/core/branch.model');
  const branch = await Branch.findById(user.branchId);
  
  if (!branch?.location || branch.location.lat == null || branch.location.lng == null) {
    return next(new AppError('Branch location is not configured', 400));
  }
  
  // Calculate distance
  const distance = calculateDistance(
    latitude,
    longitude,
    branch.location.lat,
    branch.location.lng
  );
  
  const maxRadius = user.attendanceConfig.geoFenceRadius || 100; // meters
  
  if (distance > maxRadius) {
    return next(new AppError(`You are ${Math.round(distance)}m away from office. Must be within ${maxRadius}m.`, 400));
  }
  
  // Add distance to request for logging
  req.attendanceDistance = distance;
  
  next();
});

/**
 * Check if date is eligible for regularization
 */
exports.validateRegularizationDate = catchAsync(async (req, res, next) => {
  const { targetDate } = req.body;
  
  if (!targetDate) {
    return next(new AppError('Target date is required', 400));
  }
  
  if (!dayjs(targetDate, 'YYYY-MM-DD', true).isValid()) {
    return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
  }
  
  // Cannot regularize future dates
  if (dayjs(targetDate).isAfter(dayjs(), 'day')) {
    return next(new AppError('Cannot regularize future dates', 400));
  }
  
  // Check if date is too old (configurable, default 30 days)
  const maxDaysBack = process.env.MAX_REGULARIZATION_DAYS || 30;
  const daysDiff = dayjs().diff(dayjs(targetDate), 'day');
  
  if (daysDiff > maxDaysBack) {
    return next(new AppError(`Cannot regularize dates older than ${maxDaysBack} days`, 400));
  }
  
  // Check if date is holiday or weekly off
  const Holiday = require('../models/holiday.model');
  const holiday = await Holiday.isHoliday(req.user.organizationId, targetDate, req.user.branchId);
  
  if (holiday && !holiday.isOptional) {
    return next(new AppError('Cannot regularize mandatory holidays', 400));
  }
  
  next();
});

/**
 * Check if user has pending request for date
 */
exports.checkDuplicateRequest = catchAsync(async (req, res, next) => {
  const { targetDate } = req.body;
  const userId = req.user._id;
  
  const AttendanceRequest = require('../models/attendance/attendanceRequest.model');
  const existing = await AttendanceRequest.findOne({
    user: userId,
    targetDate,
    status: { $in: ['draft', 'pending', 'under_review'] }
  });
  
  if (existing) {
    return next(new AppError('A pending request already exists for this date', 409));
  }
  
  next();
});

/**
 * Check shift timing for attendance
 */
exports.validateShiftTiming = catchAsync(async (req, res, next) => {
  const user = req.user;
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // If user has no shift, skip validation
  if (!user.shiftId) {
    return next();
  }
  
  const Shift = require('../models/shift.model');
  const shift = await Shift.findById(user.shiftId);
  
  if (!shift) {
    return next();
  }
  
  // Parse shift timings
  const [shiftStartHour, shiftStartMinute] = shift.startTime.split(':').map(Number);
  const [shiftEndHour, shiftEndMinute] = shift.endTime.split(':').map(Number);
  
  // Convert current time to minutes since midnight
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const shiftStartTotalMinutes = shiftStartHour * 60 + shiftStartMinute;
  const shiftEndTotalMinutes = shiftEndHour * 60 + shiftEndMinute;
  
  // For night shifts, adjust end time
  const adjustedShiftEnd = shift.isNightShift && shiftEndTotalMinutes < shiftStartTotalMinutes ?
    shiftEndTotalMinutes + (24 * 60) : shiftEndTotalMinutes;
  const adjustedCurrent = shift.isNightShift && currentTotalMinutes < shiftStartTotalMinutes ?
    currentTotalMinutes + (24 * 60) : currentTotalMinutes;
  
  // Check if within shift hours +/- grace period
  const graceMinutes = shift.gracePeriodMins || 15;
  const earlyLimit = shiftStartTotalMinutes - graceMinutes;
  const lateLimit = adjustedShiftEnd + graceMinutes;
  
  if (adjustedCurrent < earlyLimit || adjustedCurrent > lateLimit) {
    return next(new AppError(`Punching allowed only between ${shift.startTime} and ${shift.endTime} (with ${graceMinutes} min grace)`, 400));
  }
  
  next();
});

/**
 * Validate machine authentication
 */
exports.authenticateMachine = catchAsync(async (req, res, next) => {
  const apiKey = req.headers['x-machine-api-key'];
  const signature = req.headers['x-machine-signature'];
  const timestamp = req.headers['x-machine-timestamp'];
  
  if (!apiKey) {
    return next(new AppError('API key required', 401));
  }
  
  const AttendanceMachine = require('../models/attendance/attendanceMachine.model');
  
  // Method 1: Simple API key authentication
  if (!signature || !timestamp) {
    const machine = await AttendanceMachine.findOne({ 
      apiKey,
      status: 'active'
    }).select('+apiKey');
    
    if (!machine) {
      return next(new AppError('Unauthorized machine', 401));
    }
    
    req.machine = machine;
    return next();
  }
  
  // Method 2: HMAC authentication
  const machine = await AttendanceMachine.authenticate(apiKey, signature, timestamp);
  
  if (!machine) {
    return next(new AppError('Invalid authentication', 401));
  }
  
  req.machine = machine;
  next();
});

/**
 * Rate limiting for attendance punches
 */
exports.rateLimitPunch = catchAsync(async (req, res, next) => {
  const user = req.user;
  const cacheKey = `punch_limit:${user._id}`;
  
  // Using in-memory store for simplicity - use Redis in production
  const punchCount = global.punchLimiter = global.punchLimiter || {};
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxPunches = 10; // Max 10 punches per 15 minutes
  
  // Clean old entries
  Object.keys(punchCount).forEach(key => {
    if (now - punchCount[key].timestamp > windowMs) {
      delete punchCount[key];
    }
  });
  
  if (!punchCount[cacheKey]) {
    punchCount[cacheKey] = {
      count: 1,
      timestamp: now
    };
  } else {
    punchCount[cacheKey].count++;
    
    if (punchCount[cacheKey].count > maxPunches) {
      const resetTime = Math.ceil((punchCount[cacheKey].timestamp + windowMs - now) / 1000);
      res.set('Retry-After', resetTime);
      return next(new AppError('Too many punch attempts. Please try again later.', 429));
    }
  }
  
  next();
});

/**
 * Validate attendance data format
 */
exports.validateAttendanceData = catchAsync(async (req, res, next) => {
  const { type, latitude, longitude } = req.body;
  
  // Validate punch type
  const validTypes = ['in', 'out', 'break_start', 'break_end'];
  if (!validTypes.includes(type)) {
    return next(new AppError(`Invalid punch type. Valid types: ${validTypes.join(', ')}`, 400));
  }
  
  // Validate coordinates if provided
  if (latitude !== undefined && longitude !== undefined) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return next(new AppError('Invalid coordinates', 400));
    }
    
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return next(new AppError('Coordinates out of range', 400));
    }
  }
  
  // Validate accuracy if provided
  if (req.body.accuracy !== undefined) {
    if (typeof req.body.accuracy !== 'number' || req.body.accuracy < 0) {
      return next(new AppError('Invalid accuracy value', 400));
    }
    
    if (req.body.accuracy > 1000) {
      return next(new AppError('Location accuracy too low', 400));
    }
  }
  
  next();
});

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distance in meters
}