'use strict';

const mongoose = require('mongoose');
const AttendanceLog = require("../models/attendanceLog.model");
const AttendanceDaily = require("../models/attendanceDaily.model");
const Shift = require("../models/shift.model");
const Branch = require("../../organization/core/branch.model");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");

// ======================================================
//  HELPERS
// ======================================================

// Haversine Formula for Distance (in Meters)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

const getTodayString = () => new Date().toISOString().split('T')[0];

// ======================================================
//  CORE PUNCHING LOGIC
// ======================================================

exports.punch = catchAsync(async (req, res, next) => {
  const { location, image } = req.body; // location: { lat, lng }
  const user = req.user;
  const today = getTodayString();

  // 1. CONFIG CHECK: Is attendance enabled?
  if (!user.attendanceConfig?.isAttendanceEnabled) {
    return next(new AppError("Attendance is disabled for your account.", 403));
  }

  // 2. GEO-FENCE CHECK (If enforced)
  let geofenceStatus = 'inside';
  if (user.attendanceConfig.enforceGeoFence && location) {
    // Need to fetch Branch to get coordinates
    const branch = await Branch.findById(user.branchId).select('location');
    if (branch?.location?.lat && branch?.location?.lng) {
      const distance = calculateDistance(
        location.lat, location.lng, 
        branch.location.lat, branch.location.lng
      );
      
      const allowedRadius = user.attendanceConfig.geoFenceRadius || 100; // Default 100m
      if (distance > allowedRadius) {
        return next(new AppError(`You are ${Math.round(distance)}m away from office. Must be within ${allowedRadius}m.`, 403));
      }
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 3. DETERMINE STATE (In or Out?)
    // Fetch today's record to see last status
    let dailyRecord = await AttendanceDaily.findOne({ 
      user: user._id, 
      date: today 
    }).session(session);

    let punchType = 'in'; // Default
    if (dailyRecord) {
      // If we have a record, toggle based on last logs
      // Logic: If (In > Out), then next is Out. If (Out >= In) or no Out, check LastOut.
      // Simpler Logic: Check if 'lastOut' is missing or if we have an open session.
      // For basic In/Out: 
      if (dailyRecord.firstIn && !dailyRecord.lastOut) punchType = 'out';
      else if (dailyRecord.firstIn && dailyRecord.lastOut) punchType = 'in'; // Re-entry? (Multiple punches)
      // *Refinement needed based on business logic (Single Punch vs Multi Punch)*
      // Let's assume Multi-Punch allowed: Toggle based on last log type
      const lastLog = await AttendanceLog.findOne({ user: user._id, date: today }).sort({ timestamp: -1 }).session(session);
      if (lastLog && lastLog.type === 'in') punchType = 'out';
    }

    // 4. CREATE LOG
    const newLog = await AttendanceLog.create([{
      user: user._id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      timestamp: new Date(),
      type: punchType,
      source: 'mobile', // or 'web' based on req
      location: {
        coordinates: [location?.lng || 0, location?.lat || 0],
        geofenceStatus
      },
      imageUrl: image
    }], { session });

    // 5. UPDATE DAILY SUMMARY
    if (!dailyRecord) {
      // --- FIRST PUNCH OF THE DAY (IN) ---
      
      // Calculate Lateness
      let isLate = false;
      if (user.attendanceConfig.shiftId) {
        const shift = await Shift.findById(user.attendanceConfig.shiftId).session(session);
        if (shift) {
          const now = new Date();
          const [h, m] = shift.startTime.split(':');
          const shiftStart = new Date(now).setHours(h, m, 0, 0);
          const graceTime = shiftStart + (shift.gracePeriodMins * 60000);
          
          if (now.getTime() > graceTime) isLate = true;
        }
      }

      dailyRecord = await AttendanceDaily.create([{
        user: user._id,
        organizationId: user.organizationId,
        branchId: user.branchId,
        date: today,
        firstIn: new Date(),
        status: 'present',
        isLate: isLate,
        shiftId: user.attendanceConfig.shiftId,
        logs: [newLog[0]._id]
      }], { session });

    } else {
      // --- SUBSEQUENT PUNCHES ---
      
      const updatePayload = {
        $push: { logs: newLog[0]._id }
      };

      if (punchType === 'out') {
        updatePayload.lastOut = new Date();
        
        // Calculate Hours (Naive approach: LastOut - FirstIn)
        // Ideally, sum up all (Out - In) pairs for multi-punch
        const durationMs = new Date() - new Date(dailyRecord.firstIn); 
        updatePayload.totalWorkHours = durationMs / (1000 * 60 * 60); // Hours
      }

      dailyRecord = await AttendanceDaily.findByIdAndUpdate(dailyRecord._id, updatePayload, { session, new: true });
    }

    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      data: {
        type: punchType,
        time: new Date(),
        isLate: dailyRecord[0]?.isLate || dailyRecord.isLate
      }
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// ======================================================
//  READ OPERATIONS
// ======================================================

exports.getMyAttendance = catchAsync(async (req, res, next) => {
  // Get logs for specific month or range
  const { month, year } = req.query; // e.g. 05, 2024
  
  const query = { user: req.user._id };
  
  if (month && year) {
    const start = new Date(`${year}-${month}-01`);
    const end = new Date(year, month, 0); // Last day of month
    // String comparison for date field "YYYY-MM-DD"
    query.date = { $gte: start.toISOString().split('T')[0], $lte: end.toISOString().split('T')[0] };
  }

  const records = await AttendanceDaily.find(query).sort({ date: -1 });

  res.status(200).json({
    status: 'success',
    results: records.length,
    data: { records }
  });
});

exports.getTodaysStatus = catchAsync(async (req, res, next) => {
  const today = getTodayString();
  const record = await AttendanceDaily.findOne({ user: req.user._id, date: today });
  
  // Calculate if currently checked in
  let isCheckedIn = false;
  if (record && record.firstIn && !record.lastOut) isCheckedIn = true;
  // If multi-punch logic used: check last log type

  res.status(200).json({
    status: 'success',
    data: { 
      isCheckedIn,
      firstIn: record?.firstIn,
      totalHours: record?.totalWorkHours || 0
    }
  });
});