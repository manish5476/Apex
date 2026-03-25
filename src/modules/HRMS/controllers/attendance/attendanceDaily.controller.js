// controllers/attendance/attendanceDaily.controller.js
const mongoose = require('mongoose');
const AttendanceDaily  = require('../../models/attendanceDaily.model');
const AttendanceLog    = require('../../models/attendanceLog.model');
const AttendanceRequest = require('../../models/attendanceRequest.model');
const Shift            = require('../../models/shift.model');
const Holiday          = require('../../models/holiday.model');
const LeaveRequest     = require('../../models/leaveRequest.model');
const User             = require('../../../auth/core/user.model');
const catchAsync       = require('../../../../core/utils/api/catchAsync');
const AppError         = require('../../../../core/utils/api/appError');
const factory          = require('../../../../core/utils/api/handlerFactory');
const {
  startOfDay, endOfDay, dateRangeQuery, parseQueryDate, isValidDateRange
} = require('../../../../core/utils/dateHelpers.js');

// ─────────────────────────────────────────────
//  HELPERS & UTILITIES
// ─────────────────────────────────────────────

/**
 * Calculate net work hours from firstIn/lastOut, deducting breaks.
 */
const calculateWorkHours = (firstIn, lastOut, breaks = []) => {
  if (!firstIn || !lastOut) return 0;
  const totalMs = lastOut - firstIn;
  let totalHours = totalMs / (1000 * 60 * 60);
  breaks.forEach(b => {
    if (b.start && b.end) totalHours -= (b.end - b.start) / (1000 * 60 * 60);
  });
  return Math.max(0, Math.round(totalHours * 100) / 100);
};

/**
 * Determine attendance status based on priority:
 * leave > holiday > week_off > present/absent
 */
const determineStatus = (daily, shift, holiday, leave) => {
  if (leave)    return 'on_leave';
  if (holiday)  return holiday.isOptional ? 'present' : 'holiday';
  if (shift && shift.weeklyOffs?.includes(new Date(daily.date).getUTCDay())) {
    return 'week_off';
  }
  if (daily.firstIn) {
    if (daily.isHalfDay) return 'half_day';
    if (daily.isLate)    return 'late';
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

// ─────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────

exports.getAllDaily = factory.getAll(AttendanceDaily, {
  searchFields: ['status'],
  populate: [
    { path: 'user',            select: 'name employeeProfile.employeeId employeeProfile.departmentId' },
    { path: 'shiftId',         select: 'name startTime endTime' },
    { path: 'leaveRequestId',  select: 'leaveType' },
    { path: 'holidayId',       select: 'name' },
    { path: 'regularizedById', select: 'name' },
  ],
  sort: { date: -1 },
});

exports.getDaily = factory.getOne(AttendanceDaily, {
  populate: [
    { path: 'user',            select: 'name employeeProfile.employeeId employeeProfile.departmentId' },
    { path: 'shiftId',         select: 'name startTime endTime gracePeriodMins' },
    { path: 'leaveRequestId',  select: 'leaveType reason' },
    { path: 'holidayId',       select: 'name description' },
    { path: 'logs',            select: 'timestamp type source location' },
    { path: 'regularizedById', select: 'name' },
  ],
});

/**
 * GET /api/v1/attendance/daily/my-attendance
 */
exports.getMyAttendance = catchAsync(async (req, res, next) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 30);
  const skip  = (page - 1) * limit;

  const query = {
    user:           req.user._id,
    organizationId: req.user.organizationId,
  };

  // FIX CROSS-C02 — Validate date inputs before using in query
  if (req.query.fromDate || req.query.toDate) {
    const from = parseQueryDate(req.query.fromDate);
    const to   = parseQueryDate(req.query.toDate);
    if ((req.query.fromDate && !from) || (req.query.toDate && !to)) {
      return next(new AppError('Invalid date format in fromDate or toDate', 400));
    }
    query.date = {};
    if (from) query.date.$gte = startOfDay(from);
    if (to)   query.date.$lte = endOfDay(to);
  }

  if (req.query.status) query.status = req.query.status;

  const [records, total] = await Promise.all([
    AttendanceDaily.find(query)
      .populate('shiftId', 'name startTime endTime')
      .populate('leaveRequestId', 'leaveType')
      .populate('holidayId', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 }),
    AttendanceDaily.countDocuments(query),
  ]);

  // FIX BUG-AD-C07 [HIGH] — Summary is now computed via aggregation across ALL records,
  // not just the current page. Paginated records only affect page-level display.
  const [summaryAgg] = await AttendanceDaily.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        present:        { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
        absent:         { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        leave:          { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
        holiday:        { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } },
        weekOff:        { $sum: { $cond: [{ $eq: ['$status', 'week_off'] }, 1, 0] } },
        totalWorkHours: { $sum: '$totalWorkHours' },
        totalOvertime:  { $sum: '$overtimeHours' },
      },
    },
  ]);

  const summary = summaryAgg
    ? { ...summaryAgg, total, _id: undefined }
    : { total, present: 0, absent: 0, leave: 0, holiday: 0, weekOff: 0, totalWorkHours: 0, totalOvertime: 0 };

  res.status(200).json({
    status: 'success',
    results: records.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    data: { summary, records },
  });
});

/**
 * GET /api/v1/attendance/daily/today
 *
 * FIX BUG-AD-C01 [CRITICAL] — Date queried as proper Date range, not string.
 */
exports.getTodayAttendance = catchAsync(async (req, res, next) => {
  // FIX BUG-AD-C01 — Use proper Date range; never query a Date field with a string.
  const todayStart = startOfDay(new Date());
  const todayEnd   = endOfDay(new Date());

  let daily = await AttendanceDaily.findOne({
    user:           req.user._id,
    organizationId: req.user.organizationId,
    date:           { $gte: todayStart, $lte: todayEnd },
  }).populate([
    { path: 'shiftId',        select: 'name startTime endTime gracePeriodMins' },
    { path: 'logs',           select: 'timestamp type source' },
    { path: 'leaveRequestId', select: 'leaveType status' },
  ]);

  if (!daily) {
    const user  = await User.findById(req.user._id).lean();
    const shift = user?.attendanceConfig?.shiftId
      ? await Shift.findById(user.attendanceConfig.shiftId).lean()
      : null;

    // FIX BUG-AD-C01 — Holiday query now uses proper Date range
    const holiday = await Holiday.findOne({
      organizationId: req.user.organizationId,
      $or: [{ branchId: req.user.branchId }, { branchId: null }],
      date: { $gte: todayStart, $lte: todayEnd },
      isActive: true,
    }).lean();

    const leave = await LeaveRequest.findOne({
      user:           req.user._id,
      organizationId: req.user.organizationId,
      status:         'approved',
      startDate:      { $lte: todayEnd },
      endDate:        { $gte: todayStart },
    }).lean();

    daily = {
      date:             todayStart,
      shiftId:          shift,
      scheduledInTime:  shift?.startTime,
      scheduledOutTime: shift?.endTime,
      status:           leave ? 'on_leave' : (holiday ? 'holiday' : 'absent'),
      logs:             [],
      firstIn:          null,
      lastOut:          null,
      totalWorkHours:   0,
    };
  }

  const todayLogs = await AttendanceLog.find({
    user:      req.user._id,
    timestamp: { $gte: todayStart, $lte: todayEnd },
  }).sort('timestamp');

  res.status(200).json({
    status: 'success',
    data: {
      ...(daily.toObject ? daily.toObject() : daily),
      todaysLogs: todayLogs,
    },
  });
});

// ─────────────────────────────────────────────
//  ADMIN OPERATIONS
// ─────────────────────────────────────────────

/**
 * GET /api/v1/attendance/daily/dashboard
 *
 * FIX BUG-AD-C02 [CRITICAL] — Dashboard now uses proper Date range queries.
 * FIX BUG-AD-C04 [CRITICAL] — startOfDay/endOfDay clones, never mutates.
 * FIX BUG-AD-C09 [HIGH]     — pendingRegularizations queries AttendanceRequest correctly.
 */
exports.getAttendanceDashboard = catchAsync(async (req, res, next) => {
  // FIX BUG-AD-C04 — Separate clone for start/end. Original mutated targetDate in-place:
  //   `new Date(targetDate.setHours(0,0,0,0))` — setHours mutates targetDate THEN wraps it.
  const rawDate    = parseQueryDate(req.query.date) || new Date();
  const dayStart   = startOfDay(rawDate);
  const dayEnd     = endOfDay(rawDate);

  const orgId = req.user.organizationId;

  const [totalUsers, todayAttendance, todayLogCount, pendingRegularizations] =
    await Promise.all([
      User.countDocuments({ organizationId: orgId, isActive: true, status: 'approved' }),

      // FIX BUG-AD-C02 — Use date range, not string
      AttendanceDaily.find({
        organizationId: orgId,
        date: { $gte: dayStart, $lte: dayEnd },
      }).populate('user', 'name employeeProfile.employeeId employeeProfile.departmentId avatar'),

      AttendanceLog.countDocuments({
        organizationId: orgId,
        timestamp: { $gte: dayStart, $lte: dayEnd },
      }),

      // FIX BUG-AD-C09 [HIGH] — Use AttendanceRequest for pending count.
      // Original queried `isRegularized: true, regularizedAt: null` on AttendanceDaily —
      // logically contradictory (regularized but no timestamp?). Pending requests
      // live in AttendanceRequest, not AttendanceDaily.
      AttendanceRequest.countDocuments({ organizationId: orgId, status: 'pending' }),
    ]);

  const stats = {
    total:     totalUsers,
    present:   todayAttendance.filter(r => ['present','late','half_day'].includes(r.status)).length,
    absent:    todayAttendance.filter(r => r.status === 'absent').length,
    onLeave:   todayAttendance.filter(r => r.status === 'on_leave').length,
    onHoliday: todayAttendance.filter(r => r.status === 'holiday').length,
    weekOff:   todayAttendance.filter(r => r.status === 'week_off').length,
    late:      todayAttendance.filter(r => r.isLate).length,
    halfDay:   todayAttendance.filter(r => r.isHalfDay).length,
    pending:   totalUsers - todayAttendance.length,
    pendingRegularizations,
    todayLogs: todayLogCount,
  };

  stats.attendancePercentage = totalUsers > 0
    ? Math.round((stats.present / totalUsers) * 100) : 0;

  // Department-wise breakdown
  const deptWise = await AttendanceDaily.aggregate([
    { $match: { organizationId: orgId, date: { $gte: dayStart, $lte: dayEnd } } },
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
    { $unwind: '$userInfo' },
    {
      $group: {
        _id:     '$userInfo.employeeProfile.departmentId',
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late:    { $sum: { $cond: ['$isLate', 1, 0] } },
      },
    },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
    { $addFields: { departmentName: { $arrayElemAt: ['$dept.name', 0] } } },
    { $project: { dept: 0 } },
  ]);

  const recentActivity = await AttendanceLog.find({
    organizationId: orgId,
    timestamp: { $gte: dayStart },
  })
    .populate('user', 'name avatar')
    .sort('-timestamp')
    .limit(20);

  res.status(200).json({
    status: 'success',
    data: {
      date: dayStart,
      summary: stats,
      departmentWise: deptWise,
      recentActivity,
      records: todayAttendance.slice(0, 50),
    },
  });
});

/**
 * PATCH /api/v1/attendance/daily/:id/regularize
 */
exports.regularizeAttendance = catchAsync(async (req, res, next) => {
  // FIX BUG-AD-C08 [HIGH] — Whitelist allowed fields. Original spread req.body directly
  // into $set, allowing override of security-critical fields (organizationId, user, etc.)
  const ALLOWED_FIELDS = ['firstIn', 'lastOut', 'status', 'totalWorkHours'];
  const { reason }     = req.body;

  const daily = await AttendanceDaily.findOne({
    _id:            req.params.id,
    organizationId: req.user.organizationId,
  });

  if (!daily) return next(new AppError('Attendance record not found', 404));

  // Apply only whitelisted fields
  if (req.body.firstIn)  daily.firstIn  = new Date(req.body.firstIn);
  if (req.body.lastOut)  daily.lastOut  = new Date(req.body.lastOut);
  if (req.body.status)   daily.status   = req.body.status;

  if (daily.firstIn && daily.lastOut) {
    daily.totalWorkHours = calculateWorkHours(daily.firstIn, daily.lastOut);
  }

  daily.isRegularized        = true;
  daily.regularizedById      = req.user._id;
  daily.regularizedAt        = new Date();
  daily.regularizationReason = reason;

  await daily.save();

  res.status(200).json({ status: 'success', data: { daily } });
});

/**
 * POST /api/v1/attendance/daily/bulk-update
 */
exports.bulkUpdateAttendance = catchAsync(async (req, res, next) => {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return next(new AppError('Please provide an array of updates', 400));
  }

  // FIX BUG-AD-C08 — Whitelist fields that bulk update is allowed to set
  const ALLOWED_FIELDS = ['status', 'firstIn', 'lastOut', 'totalWorkHours', 'overtimeHours', 'notes'];

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];

    for (const update of updates) {
      const { userId, date, ...rawFields } = update;

      // FIX BUG-AD-C01 — Use proper date range not string
      const dayStart = startOfDay(new Date(date));
      const dayEnd   = endOfDay(new Date(date));

      // Filter to whitelisted fields only
      const safeFields = {};
      ALLOWED_FIELDS.forEach(f => { if (rawFields[f] !== undefined) safeFields[f] = rawFields[f]; });

      const daily = await AttendanceDaily.findOneAndUpdate(
        { user: userId, organizationId: req.user.organizationId, date: { $gte: dayStart, $lte: dayEnd } },
        {
          $set: {
            ...safeFields,
            isRegularized:   true,
            regularizedById: req.user._id,
            regularizedAt:   new Date(),
          },
        },
        { new: true, session }
      );

      if (daily) results.push(daily);
    }

    await session.commitTransaction();
    res.status(200).json({ status: 'success', data: { updated: results.length, results } });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────
//  REPORTS & ANALYTICS
// ─────────────────────────────────────────────

/**
 * GET /api/v1/attendance/daily/report
 *
 * FIX BUG-AD-C03 [CRITICAL] — All ObjectId casts use `new mongoose.Types.ObjectId()`.
 */
exports.getAttendanceReport = catchAsync(async (req, res, next) => {
  const { fromDate, toDate, departmentId, userId } = req.query;

  if (!fromDate || !toDate) {
    return next(new AppError('Please provide fromDate and toDate', 400));
  }

  // FIX CROSS-C02 — Validate dates
  const from = parseQueryDate(fromDate);
  const to   = parseQueryDate(toDate);
  if (!from || !to) return next(new AppError('Invalid date format', 400));
  if (!isValidDateRange(from, to)) return next(new AppError('fromDate must be before toDate', 400));

  const matchStage = {
    organizationId: req.user.organizationId,
    date: dateRangeQuery(from, to),
  };

  const pipeline = [
    { $match: matchStage },
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
    { $unwind: '$userInfo' },
  ];

  if (departmentId) {
    // FIX BUG-AD-C03 [CRITICAL] — Added `new` keyword. Mongoose 6+ requires it.
    pipeline.push({
      $match: { 'userInfo.employeeProfile.departmentId': new mongoose.Types.ObjectId(departmentId) },
    });
  }

  if (userId) {
    pipeline.push({
      $match: { 'userInfo._id': new mongoose.Types.ObjectId(userId) },
    });
  }

  pipeline.push(
    {
      $group: {
        _id:            '$userInfo._id',
        employeeName:   { $first: '$userInfo.name' },
        employeeId:     { $first: '$userInfo.employeeProfile.employeeId' },
        departmentId:   { $first: '$userInfo.employeeProfile.departmentId' },
        totalDays:      { $sum: 1 },
        present:        { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
        absent:         { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late:           { $sum: { $cond: ['$isLate', 1, 0] } },
        halfDay:        { $sum: { $cond: ['$isHalfDay', 1, 0] } },
        onLeave:        { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
        totalWorkHours: { $sum: '$totalWorkHours' },
        totalOvertime:  { $sum: '$overtimeHours' },
      },
    },
    { $lookup: { from: 'departments', localField: 'departmentId', foreignField: '_id', as: 'department' } },
    {
      $addFields: {
        departmentName: { $arrayElemAt: ['$department.name', 0] },
        attendancePercentage: {
          $cond: [
            { $eq: ['$totalDays', 0] }, 0,
            { $multiply: [{ $divide: ['$present', '$totalDays'] }, 100] },
          ],
        },
      },
    },
    { $project: { department: 0 } },
    { $sort: { departmentName: 1, employeeName: 1 } }
  );

  const report = await AttendanceDaily.aggregate(pipeline);

  const summary = {
    totalEmployees:         report.length,
    totalDays:              report.reduce((s, r) => s + r.totalDays, 0),
    totalPresent:           report.reduce((s, r) => s + r.present, 0),
    totalAbsent:            report.reduce((s, r) => s + r.absent, 0),
    totalLate:              report.reduce((s, r) => s + r.late, 0),
    totalHalfDay:           report.reduce((s, r) => s + r.halfDay, 0),
    totalLeave:             report.reduce((s, r) => s + r.onLeave, 0),
    totalWorkHours:         report.reduce((s, r) => s + r.totalWorkHours, 0),
    totalOvertime:          report.reduce((s, r) => s + r.totalOvertime, 0),
    avgAttendancePercentage: report.length > 0
      ? report.reduce((s, r) => s + r.attendancePercentage, 0) / report.length : 0,
  };

  res.status(200).json({
    status: 'success',
    data: { period: { from: fromDate, to: toDate }, summary, report },
  });
});

/**
 * GET /api/v1/attendance/daily/trends
 *
 * FIX BUG-AD-C11 [MEDIUM] — `months` param capped and validated.
 */
exports.getAttendanceTrends = catchAsync(async (req, res, next) => {
  // FIX BUG-AD-C11 — Cap months to prevent full-collection scans
  const months    = Math.min(Math.max(parseInt(req.query.months) || 3, 1), 24);
  const endDate   = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const trends = await AttendanceDaily.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          year:  { $year:        '$date' },
          month: { $month:       '$date' },
          day:   { $dayOfMonth:  '$date' },
        },
        date:    { $first: '$date' },
        present: { $sum: { $cond: [{ $in: ['$status', ['present','late','half_day']] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late:    { $sum: { $cond: ['$isLate', 1, 0] } },
        total:   { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ]);

  // 7-day moving average
  const withMA = trends.map((item, index) => {
    const window     = trends.slice(Math.max(0, index - 6), index + 1);
    const avgPresent = window.reduce((s, w) => s + w.present, 0) / window.length;
    return {
      ...item,
      movingAveragePresent: Math.round(avgPresent * 100) / 100,
      attendanceRate:       item.total > 0 ? Math.round((item.present / item.total) * 100) : 0,
    };
  });

  res.status(200).json({ status: 'success', data: { period: `${months} months`, trends: withMA } });
});

/**
 * GET /api/v1/attendance/daily/export
 *
 * FIX BUG-AD-C10 [MEDIUM] — Removed `.sort('date user.name')` (invalid Mongoose syntax).
 */
exports.exportAttendance = catchAsync(async (req, res, next) => {
  const { fromDate, toDate, format = 'json' } = req.query;

  if (!fromDate || !toDate) return next(new AppError('Please provide fromDate and toDate', 400));

  const from = parseQueryDate(fromDate);
  const to   = parseQueryDate(toDate);
  if (!from || !to) return next(new AppError('Invalid date format', 400));

  const data = await AttendanceDaily.find({
    organizationId: req.user.organizationId,
    date: dateRangeQuery(from, to),
  })
    .populate('user',           'name employeeProfile.employeeId employeeProfile.departmentId')
    .populate('shiftId',        'name')
    .populate('leaveRequestId', 'leaveType')
    // FIX BUG-AD-C10 — `.sort('date user.name')` is invalid — can't sort on populated field.
    .sort({ date: 1, _id: 1 });

  if (format === 'csv') {
    const csvData = data.map(r => ({
      Date:        r.date.toISOString().split('T')[0],
      EmployeeID:  r.user?.employeeProfile?.employeeId,
      EmployeeName:r.user?.name,
      Status:      r.status,
      FirstIn:     r.firstIn,
      LastOut:     r.lastOut,
      WorkHours:   r.totalWorkHours,
      Overtime:    r.overtimeHours,
      IsLate:      r.isLate,
      IsHalfDay:   r.isHalfDay,
      Shift:       r.shiftId?.name,
      LeaveType:   r.leaveRequestId?.leaveType,
    }));
    return res.status(200).json({ status: 'success', data: csvData });
  }

  res.status(200).json({ status: 'success', data: { count: data.length, records: data } });
});

/**
 * POST /api/v1/attendance/daily/recalculate
 *
 * FIX BUG-AD-C04 [CRITICAL] — Date mutation fixed via startOfDay/endOfDay helpers.
 * FIX BUG-AD-C05 [CRITICAL] — N+1 loop eliminated: shifts/holidays/leaves prefetched in bulk.
 * FIX BUG-AD-C06 [HIGH]     — isHalfDay only set when totalWorkHours > 0.
 * FIX BUG-AD-C12 [MEDIUM]   — determineStatus receives the correct `date` field.
 */
exports.recalculateDaily = catchAsync(async (req, res, next) => {
  if (!req.body.date) return next(new AppError('Please provide date', 400));

  const from = parseQueryDate(req.body.date);
  if (!from) return next(new AppError('Invalid date format', 400));

  // FIX BUG-AD-C04 — startOfDay/endOfDay never mutate the input
  const dayStart = startOfDay(from);
  const dayEnd   = endOfDay(from);
  const orgId    = req.user.organizationId;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // FIX BUG-AD-C05 [CRITICAL] — Pre-fetch all data BEFORE the loop.
    // Original made 5 DB calls per user inside the loop → timeout for large orgs.
    const [users, allLogs, holidays, approvedLeaves] = await Promise.all([
      User.find({ organizationId: orgId, isActive: true })
        .select('_id attendanceConfig branchId')
        .lean(),

      AttendanceLog.find({
        organizationId: orgId,
        timestamp: { $gte: dayStart, $lte: dayEnd },
      }).sort('timestamp').lean(),

      Holiday.find({
        organizationId: orgId,
        date: { $gte: dayStart, $lte: dayEnd },
        isActive: true,
      }).lean(),

      LeaveRequest.find({
        organizationId: orgId,
        status: 'approved',
        startDate: { $lte: dayEnd },
        endDate:   { $gte: dayStart },
      }).lean(),
    ]);

    // Pre-fetch all unique shifts
    const shiftIds   = [...new Set(users.map(u => u.attendanceConfig?.shiftId).filter(Boolean).map(String))];
    const shiftsArr  = await Shift.find({ _id: { $in: shiftIds } }).lean();
    const shiftMap   = Object.fromEntries(shiftsArr.map(s => [s._id.toString(), s]));

    // Index logs by userId
    const logsByUser = {};
    allLogs.forEach(l => {
      const uid = l.user.toString();
      (logsByUser[uid] = logsByUser[uid] || []).push(l);
    });

    // Index leaves by userId
    const leaveByUser = {};
    approvedLeaves.forEach(l => {
      const uid = l.user.toString();
      leaveByUser[uid] = l;
    });

    // Index holidays by branchId (null = org-wide)
    const orgWideHoliday    = holidays.find(h => !h.branchId) || null;
    const branchHolidayMap  = {};
    holidays.forEach(h => { if (h.branchId) branchHolidayMap[h.branchId.toString()] = h; });

    const results = [];

    for (const user of users) {
      const uid    = user._id.toString();
      const logs   = logsByUser[uid] || [];
      if (logs.length === 0) continue;

      const shift   = user.attendanceConfig?.shiftId ? shiftMap[user.attendanceConfig.shiftId.toString()] : null;
      const leave   = leaveByUser[uid] || null;
      const holiday = (user.branchId && branchHolidayMap[user.branchId.toString()])
        || orgWideHoliday || null;

      const firstIn  = logs.find(l => l.type.includes('in'))?.timestamp  || null;
      const lastOut  = logs.filter(l => l.type.includes('out')).pop()?.timestamp || null;

      const totalWorkHours = calculateWorkHours(firstIn, lastOut);

      // FIX BUG-AD-C06 [HIGH] — Only set isHalfDay when employee actually punched in.
      // Original: `totalWorkHours < threshold` evaluates true when totalWorkHours = 0,
      // marking absent employees as isHalfDay: true — contradictory.
      const isHalfDay = firstIn !== null && totalWorkHours > 0
        && totalWorkHours < (shift?.halfDayThresholdHrs || 4);

      let isLate = false;
      if (firstIn && shift && !leave && !holiday) {
        const [h, m] = shift.startTime.split(':').map(Number);
        const scheduledIn = new Date(firstIn);
        scheduledIn.setHours(h, m, 0, 0);
        const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
        isLate = firstIn > new Date(scheduledIn.getTime() + graceMs);
      }

      const overtimeHours = calculateOvertime(totalWorkHours, shift);

      // FIX BUG-AD-C12 [MEDIUM] — Pass `date` field so determineStatus week-off check works
      const status = determineStatus(
        { firstIn, lastOut, totalWorkHours, isHalfDay, isLate, date: dayStart },
        shift,
        holiday,
        leave
      );

      const daily = await AttendanceDaily.findOneAndUpdate(
        { user: user._id, organizationId: orgId, date: { $gte: dayStart, $lte: dayEnd } },
        {
          $set: {
            firstIn,
            lastOut,
            totalWorkHours,
            overtimeHours,
            status,
            isLate,
            isHalfDay,
            isOvertime:       overtimeHours > 0,
            shiftId:          shift?._id,
            scheduledInTime:  shift?.startTime,
            scheduledOutTime: shift?.endTime,
            leaveRequestId:   leave?._id,
            holidayId:        holiday?._id,
            logs:             logs.map(l => l._id),
          },
        },
        { upsert: true, new: true, session }
      );

      results.push(daily);
    }

    await session.commitTransaction();
    res.status(200).json({
      status: 'success',
      data: { date: dayStart, processed: results.length },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});
