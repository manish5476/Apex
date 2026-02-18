// controllers/attendance/attendanceDaily.controller.js
const mongoose = require('mongoose');
const AttendanceDaily = require('../../models/attendanceDaily.model');
const AttendanceLog = require('../../models/attendanceLog.model');
const Shift = require('../../models/shift.model');
const Holiday = require('../../models/holiday.model');
const LeaveRequest = require('../../models/leaveRequest.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/catchAsync');
const AppError = require('../../../../core/utils/appError');
const factory = require('../../../../core/utils/handlerFactory');

// ======================================================
// HELPERS & UTILITIES
// ======================================================

const calculateWorkHours = (firstIn, lastOut, breaks = []) => {
  if (!firstIn || !lastOut) return 0;
  
  const totalMs = lastOut - firstIn;
  let totalHours = totalMs / (1000 * 60 * 60);
  
  // Subtract breaks
  breaks.forEach(breakPeriod => {
    if (breakPeriod.start && breakPeriod.end) {
      const breakMs = breakPeriod.end - breakPeriod.start;
      totalHours -= breakMs / (1000 * 60 * 60);
    }
  });
  
  return Math.max(0, Math.round(totalHours * 100) / 100);
};

const determineStatus = async (daily, user, shift, holiday, leave) => {
  // Priority: leave > holiday > week off > present/absent
  if (leave) {
    return 'on_leave';
  }
  
  if (holiday) {
    return holiday.isOptional ? 'present' : 'holiday';
  }
  
  if (shift && shift.weeklyOffs?.includes(new Date(daily.date).getDay())) {
    return 'week_off';
  }
  
  if (daily.firstIn) {
    if (daily.isHalfDay) return 'half_day';
    if (daily.isLate) return 'late';
    return 'present';
  }
  
  return 'absent';
};

const calculateOvertime = (totalWorkHours, shift) => {
  if (!shift?.overtimeRules?.enabled) return 0;
  
  const regularHours = shift.overtimeRules.afterHours || 8;
  if (totalWorkHours <= regularHours) return 0;
  
  return Math.round((totalWorkHours - regularHours) * 100) / 100;
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Get all daily attendance
 * @route   GET /api/v1/attendance/daily
 * @access  Private
 */
exports.getAllDaily = factory.getAll(AttendanceDaily, {
  searchFields: ['status', 'date'],
  populate: [
    { path: 'user', select: 'name employeeProfile.employeeId employeeProfile.departmentId' },
    { path: 'shiftId', select: 'name startTime endTime' },
    { path: 'leaveRequestId', select: 'leaveType' },
    { path: 'holidayId', select: 'name' },
    { path: 'regularizedById', select: 'name' }
  ],
  sort: { date: -1 }
});

/**
 * @desc    Get single daily record
 * @route   GET /api/v1/attendance/daily/:id
 * @access  Private
 */
exports.getDaily = factory.getOne(AttendanceDaily, {
  populate: [
    { path: 'user', select: 'name employeeProfile.employeeId employeeProfile.departmentId' },
    { path: 'shiftId', select: 'name startTime endTime gracePeriodMins' },
    { path: 'leaveRequestId', select: 'leaveType reason' },
    { path: 'holidayId', select: 'name description' },
    { path: 'logs', select: 'timestamp type source location' },
    { path: 'regularizedById', select: 'name' }
  ]
});

/**
 * @desc    Get my daily attendance
 * @route   GET /api/v1/attendance/daily/my-attendance
 * @access  Private
 */
exports.getMyAttendance = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 30;
  const skip = (page - 1) * limit;
  
  const query = {
    user: req.user._id,
    organizationId: req.user.organizationId
  };
  
  // Date range filter
  if (req.query.fromDate || req.query.toDate) {
    query.date = {};
    if (req.query.fromDate) query.date.$gte = new Date(req.query.fromDate);
    if (req.query.toDate) query.date.$lte = new Date(req.query.toDate);
  }
  
  // Status filter
  if (req.query.status) {
    query.status = req.query.status;
  }
  
  const [records, total] = await Promise.all([
    AttendanceDaily.find(query)
      .populate('shiftId', 'name startTime endTime')
      .populate('leaveRequestId', 'leaveType')
      .populate('holidayId', 'name')
      .skip(skip)
      .limit(limit)
      .sort(req.query.sort || '-date'),
    AttendanceDaily.countDocuments(query)
  ]);
  
  // Calculate summary
  const summary = {
    total: records.length,
    present: records.filter(r => ['present', 'late', 'half_day'].includes(r.status)).length,
    absent: records.filter(r => r.status === 'absent').length,
    leave: records.filter(r => r.status === 'on_leave').length,
    holiday: records.filter(r => r.status === 'holiday').length,
    weekOff: records.filter(r => r.status === 'week_off').length,
    totalWorkHours: records.reduce((sum, r) => sum + (r.totalWorkHours || 0), 0),
    totalOvertime: records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0)
  };
  
  res.status(200).json({
    status: 'success',
    results: records.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: {
      summary,
      records
    }
  });
});

/**
 * @desc    Get today's attendance
 * @route   GET /api/v1/attendance/daily/today
 * @access  Private
 */
exports.getTodayAttendance = catchAsync(async (req, res, next) => {
  const today = new Date().toISOString().split('T')[0];
  
  let daily = await AttendanceDaily.findOne({
    user: req.user._id,
    organizationId: req.user.organizationId,
    date: today
  }).populate([
    { path: 'shiftId', select: 'name startTime endTime gracePeriodMins' },
    { path: 'logs', select: 'timestamp type source' },
    { path: 'leaveRequestId', select: 'leaveType status' }
  ]);
  
  // If no record exists, create a placeholder
  if (!daily) {
    const user = await User.findById(req.user._id);
    const shift = user?.attendanceConfig?.shiftId ? 
      await Shift.findById(user.attendanceConfig.shiftId) : null;
    
    // Check if today is holiday
    const holiday = await Holiday.findOne({
      organizationId: req.user.organizationId,
      $or: [
        { branchId: req.user.branchId },
        { branchId: null }
      ],
      date: today
    });
    
    // Check if on leave
    const leave = await LeaveRequest.findOne({
      user: req.user._id,
      organizationId: req.user.organizationId,
      status: 'approved',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });
    
    daily = {
      date: today,
      shiftId: shift,
      scheduledInTime: shift?.startTime,
      scheduledOutTime: shift?.endTime,
      status: leave ? 'on_leave' : (holiday ? 'holiday' : 'absent'),
      logs: [],
      firstIn: null,
      lastOut: null,
      totalWorkHours: 0
    };
  }
  
  // Get today's logs
  const todayLogs = await AttendanceLog.find({
    user: req.user._id,
    timestamp: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      $lte: new Date(new Date().setHours(23, 59, 59, 999))
    }
  }).sort('timestamp');
  
  res.status(200).json({
    status: 'success',
    data: {
      ...daily.toObject ? daily.toObject() : daily,
      todaysLogs: todayLogs
    }
  });
});

// ======================================================
// ADMIN OPERATIONS
// ======================================================

/**
 * @desc    Get attendance dashboard
 * @route   GET /api/v1/attendance/daily/dashboard
 * @access  Private (Admin/HR)
 */
exports.getAttendanceDashboard = catchAsync(async (req, res, next) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;
  
  const targetDate = new Date(date);
  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
  
  // Get all active users
  const totalUsers = await User.countDocuments({
    organizationId: req.user.organizationId,
    isActive: true,
    status: 'approved'
  });
  
  // Get today's attendance records
  const todayAttendance = await AttendanceDaily.find({
    organizationId: req.user.organizationId,
    date: date
  }).populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId avatar');
  
  // Get today's logs count
  const todayLogs = await AttendanceLog.countDocuments({
    organizationId: req.user.organizationId,
    timestamp: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Get pending regularization requests
  const pendingRegularizations = await AttendanceDaily.countDocuments({
    organizationId: req.user.organizationId,
    isRegularized: true,
    regularizedAt: null
  });
  
  // Calculate stats
  const stats = {
    total: totalUsers,
    present: todayAttendance.filter(r => ['present', 'late', 'half_day'].includes(r.status)).length,
    absent: todayAttendance.filter(r => r.status === 'absent').length,
    onLeave: todayAttendance.filter(r => r.status === 'on_leave').length,
    onHoliday: todayAttendance.filter(r => r.status === 'holiday').length,
    weekOff: todayAttendance.filter(r => r.status === 'week_off').length,
    late: todayAttendance.filter(r => r.isLate).length,
    halfDay: todayAttendance.filter(r => r.isHalfDay).length,
    pending: totalUsers - todayAttendance.length
  };
  
  stats.attendancePercentage = totalUsers > 0 ? 
    Math.round((stats.present / totalUsers) * 100) : 0;
  
  // Department wise breakdown
  const deptWise = await AttendanceDaily.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        date: date
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $unwind: '$userInfo' },
    {
      $group: {
        _id: '$userInfo.employeeProfile.departmentId',
        total: { $sum: 1 },
        present: {
          $sum: {
            $cond: [
              { $in: ['$status', ['present', 'late', 'half_day']] },
              1,
              0
            ]
          }
        },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late: { $sum: { $cond: ['$isLate', 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'departments',
        localField: '_id',
        foreignField: '_id',
        as: 'dept'
      }
    }
  ]);
  
  // Recent activity
  const recentActivity = await AttendanceLog.find({
    organizationId: req.user.organizationId,
    timestamp: { $gte: startOfDay }
  })
  .populate('user', 'name avatar')
  .sort('-timestamp')
  .limit(20);
  
  res.status(200).json({
    status: 'success',
    data: {
      date,
      summary: stats,
      departmentWise: deptWise,
      recentActivity,
      records: todayAttendance.slice(0, 50) // Latest 50
    }
  });
});

/**
 * @desc    Regularize attendance
 * @route   PATCH /api/v1/attendance/daily/:id/regularize
 * @access  Private (Admin/HR)
 */
exports.regularizeAttendance = catchAsync(async (req, res, next) => {
  const { firstIn, lastOut, status, reason } = req.body;
  
  const daily = await AttendanceDaily.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });
  
  if (!daily) {
    return next(new AppError('Attendance record not found', 404));
  }
  
  // Update fields
  if (firstIn) daily.firstIn = new Date(firstIn);
  if (lastOut) daily.lastOut = new Date(lastOut);
  if (status) daily.status = status;
  
  // Recalculate hours
  if (daily.firstIn && daily.lastOut) {
    daily.totalWorkHours = calculateWorkHours(daily.firstIn, daily.lastOut);
  }
  
  // Mark as regularized
  daily.isRegularized = true;
  daily.regularizedById = req.user._id;
  daily.regularizedAt = new Date();
  daily.regularizationReason = reason;
  
  await daily.save();
  
  res.status(200).json({
    status: 'success',
    data: { daily }
  });
});

/**
 * @desc    Bulk update attendance
 * @route   POST /api/v1/attendance/daily/bulk-update
 * @access  Private (Admin/HR)
 */
exports.bulkUpdateAttendance = catchAsync(async (req, res, next) => {
  const { updates } = req.body;
  
  if (!Array.isArray(updates) || updates.length === 0) {
    return next(new AppError('Please provide an array of updates', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = [];
    
    for (const update of updates) {
      const { userId, date, ...fields } = update;
      
      const daily = await AttendanceDaily.findOneAndUpdate(
        {
          user: userId,
          organizationId: req.user.organizationId,
          date: new Date(date)
        },
        {
          $set: {
            ...fields,
            isRegularized: true,
            regularizedById: req.user._id,
            regularizedAt: new Date()
          }
        },
        { new: true, session }
      );
      
      if (daily) results.push(daily);
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: {
        updated: results.length,
        results
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
// REPORTS & ANALYTICS
// ======================================================

/**
 * @desc    Get attendance report
 * @route   GET /api/v1/attendance/daily/report
 * @access  Private (Admin/HR)
 */
exports.getAttendanceReport = catchAsync(async (req, res, next) => {
  const { fromDate, toDate, departmentId, userId } = req.query;
  
  if (!fromDate || !toDate) {
    return next(new AppError('Please provide fromDate and toDate', 400));
  }
  
  const matchStage = {
    organizationId: req.user.organizationId,
    date: {
      $gte: new Date(fromDate),
      $lte: new Date(toDate)
    }
  };
  
  // Build pipeline
  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $unwind: '$userInfo' }
  ];
  
  // Filter by department
  if (departmentId) {
    pipeline.push({
      $match: {
        'userInfo.employeeProfile.departmentId': mongoose.Types.ObjectId(departmentId)
      }
    });
  }
  
  // Filter by specific user
  if (userId) {
    pipeline.push({
      $match: {
        'userInfo._id': mongoose.Types.ObjectId(userId)
      }
    });
  }
  
  // Group by user
  pipeline.push({
    $group: {
      _id: '$userInfo._id',
      employeeName: { $first: '$userInfo.name' },
      employeeId: { $first: '$userInfo.employeeProfile.employeeId' },
      departmentId: { $first: '$userInfo.employeeProfile.departmentId' },
      totalDays: { $sum: 1 },
      present: {
        $sum: {
          $cond: [
            { $in: ['$status', ['present', 'late', 'half_day']] },
            1,
            0
          ]
        }
      },
      absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
      late: { $sum: { $cond: ['$isLate', 1, 0] } },
      halfDay: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
      onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
      totalWorkHours: { $sum: '$totalWorkHours' },
      totalOvertime: { $sum: '$overtimeHours' }
    }
  });
  
  // Add department name
  pipeline.push({
    $lookup: {
      from: 'departments',
      localField: 'departmentId',
      foreignField: '_id',
      as: 'department'
    }
  });
  
  pipeline.push({
    $addFields: {
      departmentName: { $arrayElemAt: ['$department.name', 0] },
      attendancePercentage: {
        $multiply: [
          { $divide: ['$present', '$totalDays'] },
          100
        ]
      }
    }
  });
  
  // Sort
  pipeline.push({ $sort: { departmentName: 1, employeeName: 1 } });
  
  const report = await AttendanceDaily.aggregate(pipeline);
  
  // Calculate summary
  const summary = {
    totalEmployees: report.length,
    totalDays: report.reduce((sum, r) => sum + r.totalDays, 0),
    totalPresent: report.reduce((sum, r) => sum + r.present, 0),
    totalAbsent: report.reduce((sum, r) => sum + r.absent, 0),
    totalLate: report.reduce((sum, r) => sum + r.late, 0),
    totalHalfDay: report.reduce((sum, r) => sum + r.halfDay, 0),
    totalLeave: report.reduce((sum, r) => sum + r.onLeave, 0),
    totalWorkHours: report.reduce((sum, r) => sum + r.totalWorkHours, 0),
    totalOvertime: report.reduce((sum, r) => sum + r.totalOvertime, 0),
    avgAttendancePercentage: report.length > 0 ?
      report.reduce((sum, r) => sum + r.attendancePercentage, 0) / report.length : 0
  };
  
  res.status(200).json({
    status: 'success',
    data: {
      period: {
        from: fromDate,
        to: toDate
      },
      summary,
      report
    }
  });
});

/**
 * @desc    Get attendance trend
 * @route   GET /api/v1/attendance/daily/trends
 * @access  Private (Admin/HR)
 */
exports.getAttendanceTrends = catchAsync(async (req, res, next) => {
  const { months = 3 } = req.query;
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const trends = await AttendanceDaily.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
          day: { $dayOfMonth: '$date' }
        },
        date: { $first: '$date' },
        present: {
          $sum: {
            $cond: [
              { $in: ['$status', ['present', 'late', 'half_day']] },
              1,
              0
            ]
          }
        },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late: { $sum: { $cond: ['$isLate', 1, 0] } },
        total: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);
  
  // Calculate moving averages
  const withMA = trends.map((item, index) => {
    const window = trends.slice(Math.max(0, index - 6), index + 1);
    const avgPresent = window.reduce((sum, w) => sum + w.present, 0) / window.length;
    
    return {
      ...item,
      movingAveragePresent: Math.round(avgPresent * 100) / 100,
      attendanceRate: Math.round((item.present / item.total) * 100)
    };
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      period: `${months} months`,
      trends: withMA
    }
  });
});

/**
 * @desc    Export attendance data
 * @route   GET /api/v1/attendance/daily/export
 * @access  Private (Admin/HR)
 */
exports.exportAttendance = catchAsync(async (req, res, next) => {
  const { fromDate, toDate, format = 'json' } = req.query;
  
  if (!fromDate || !toDate) {
    return next(new AppError('Please provide fromDate and toDate', 400));
  }
  
  const data = await AttendanceDaily.find({
    organizationId: req.user.organizationId,
    date: {
      $gte: new Date(fromDate),
      $lte: new Date(toDate)
    }
  })
  .populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId')
  .populate('shiftId', 'name')
  .populate('leaveRequestId', 'leaveType')
  .sort('date user.name');
  
  if (format === 'csv') {
    // Format for CSV
    const csvData = data.map(record => ({
      Date: record.date,
      EmployeeID: record.user?.employeeProfile?.employeeId,
      EmployeeName: record.user?.name,
      Status: record.status,
      FirstIn: record.firstIn,
      LastOut: record.lastOut,
      WorkHours: record.totalWorkHours,
      Overtime: record.overtimeHours,
      IsLate: record.isLate,
      IsHalfDay: record.isHalfDay,
      Shift: record.shiftId?.name,
      LeaveType: record.leaveRequestId?.leaveType
    }));
    
    res.status(200).json({
      status: 'success',
      data: csvData
    });
  } else {
    res.status(200).json({
      status: 'success',
      data: {
        count: data.length,
        records: data
      }
    });
  }
});

/**
 * @desc    Recalculate daily attendance
 * @route   POST /api/v1/attendance/daily/recalculate
 * @access  Private (Admin/System)
 */
exports.recalculateDaily = catchAsync(async (req, res, next) => {
  const { date } = req.body;
  
  if (!date) {
    return next(new AppError('Please provide date', 400));
  }
  
  const targetDate = new Date(date);
  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Get all users
    const users = await User.find({
      organizationId: req.user.organizationId,
      isActive: true
    }).select('_id attendanceConfig employeeProfile.departmentId');
    
    const results = [];
    
    for (const user of users) {
      // Get logs for this user on this date
      const logs = await AttendanceLog.find({
        user: user._id,
        timestamp: { $gte: startOfDay, $lte: endOfDay }
      }).sort('timestamp').session(session);
      
      if (logs.length === 0) continue;
      
      // Get user's shift
      const shift = user.attendanceConfig?.shiftId ?
        await Shift.findById(user.attendanceConfig.shiftId).session(session) : null;
      
      // Check for holiday
      const holiday = await Holiday.findOne({
        organizationId: req.user.organizationId,
        $or: [
          { branchId: user.branchId },
          { branchId: null }
        ],
        date: targetDate
      }).session(session);
      
      // Check for leave
      const leave = await LeaveRequest.findOne({
        user: user._id,
        organizationId: req.user.organizationId,
        status: 'approved',
        startDate: { $lte: targetDate },
        endDate: { $gte: targetDate }
      }).session(session);
      
      // Find first in and last out
      const firstIn = logs.find(l => l.type.includes('in'))?.timestamp;
      const lastOut = logs.filter(l => l.type.includes('out')).pop()?.timestamp;
      
      // Calculate work hours
      const totalWorkHours = calculateWorkHours(firstIn, lastOut);
      
      // Determine status
      let status = await determineStatus(
        { firstIn, lastOut, totalWorkHours },
        user,
        shift,
        holiday,
        leave
      );
      
      // Calculate overtime
      const overtimeHours = calculateOvertime(totalWorkHours, shift);
      
      // Check if late
      let isLate = false;
      if (firstIn && shift && status !== 'on_leave' && status !== 'holiday') {
        const [hours, minutes] = shift.startTime.split(':').map(Number);
        const scheduledTime = new Date(firstIn);
        scheduledTime.setHours(hours, minutes, 0, 0);
        const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
        isLate = firstIn > new Date(scheduledTime.getTime() + graceMs);
      }
      
      // Check if half day
      const isHalfDay = totalWorkHours < (shift?.halfDayThresholdHrs || 4);
      
      // Update or create daily record
      const daily = await AttendanceDaily.findOneAndUpdate(
        {
          user: user._id,
          organizationId: req.user.organizationId,
          date: targetDate
        },
        {
          $set: {
            firstIn,
            lastOut,
            totalWorkHours,
            overtimeHours,
            status,
            isLate,
            isHalfDay,
            shiftId: shift?._id,
            scheduledInTime: shift?.startTime,
            scheduledOutTime: shift?.endTime,
            leaveRequestId: leave?._id,
            holidayId: holiday?._id,
            logs: logs.map(l => l._id)
          }
        },
        { upsert: true, new: true, session }
      );
      
      results.push(daily);
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: {
        date,
        processed: results.length,
        results
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});