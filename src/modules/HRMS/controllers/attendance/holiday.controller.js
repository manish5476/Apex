// controllers/attendance/holiday.controller.js
const mongoose       = require('mongoose');
const Holiday        = require('../../models/holiday.model');
const AttendanceDaily = require('../../models/attendanceDaily.model');
const User           = require('../../../auth/core/user.model');
const catchAsync     = require('../../../../core/utils/api/catchAsync');
const AppError       = require('../../../../core/utils/api/appError');
const factory        = require('../../../../core/utils/api/handlerFactory');
const {
  startOfDay, endOfDay, dateRangeQuery, parseQueryDate, isValidDateRange
} = require('../../../../core/utils/dateHelpers.js');

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * FIX BUG-HO-C02 [CRITICAL] — Duplicate check uses proper Date range to avoid
 * UTC vs local timezone mismatch. Original compared `new Date(date)` (UTC midnight)
 * against stored dates (which may be org-timezone midnight), causing failed duplicate
 * detection and allowing the same holiday to be created twice.
 */
const validateHolidayData = async (data, organizationId, excludeId = null) => {
  const targetDate = new Date(data.date);
  if (isNaN(targetDate.getTime())) throw new AppError('Invalid holiday date format', 400);

  const dayStart = startOfDay(targetDate);
  const dayEnd   = endOfDay(targetDate);

  const query = {
    organizationId,
    date: { $gte: dayStart, $lte: dayEnd },
    $or: [
      { branchId: data.branchId || null },
      { branchId: null },
    ],
  };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Holiday.findOne(query);
  if (existing) throw new AppError(`Holiday already exists on ${targetDate.toDateString()}`, 400);
};

/**
 * Apply (or upsert) a holiday to all relevant employees' daily attendance records.
 *
 * FIX BUG-HO-C01 [CRITICAL] — Replaced per-user loop with bulkWrite.
 * Original: `for (const user of users) { await findOneAndUpdate(...) }` — 1 DB call per user.
 * For 1000 employees → 1000 sequential DB calls inside a transaction → 60s timeout.
 * bulkWrite processes all upserts in a single round-trip.
 *
 * FIX BUG-HO-C05 [HIGH] — Optional holidays do NOT force status = 'holiday'.
 * Employees may choose to work on optional holidays.
 */
const applyHolidayToAttendance = async (holiday, session) => {
  const query = { organizationId: holiday.organizationId, isActive: true };
  if (holiday.branchId) query.branchId = holiday.branchId;

  const users = await User.find(query).select('_id').lean().session(session);
  if (users.length === 0) return;

  const dayStart = startOfDay(holiday.date);

  // FIX BUG-HO-C01 — Single bulkWrite instead of N individual findOneAndUpdate calls
  const bulkOps = users.map(user => ({
    updateOne: {
      filter: {
        user:           user._id,
        organizationId: holiday.organizationId,
        date:           { $gte: dayStart, $lte: endOfDay(holiday.date) },
      },
      update: {
        // FIX BUG-HO-C05 — Optional holidays only set holidayId, not status.
        // Non-optional: force status = 'holiday'.
        $set: holiday.isOptional
          ? { holidayId: holiday._id }
          : { status: 'holiday', holidayId: holiday._id, totalWorkHours: 0 },
        $setOnInsert: {
          user:           user._id,
          organizationId: holiday.organizationId,
          branchId:       holiday.branchId,
          date:           dayStart,
        },
      },
      upsert: true,
    },
  }));

  await AttendanceDaily.bulkWrite(bulkOps, { session });
};

// ─────────────────────────────────────────────
//  CRUD
// ─────────────────────────────────────────────

exports.createHoliday = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy      = req.user._id;
    req.body.updatedBy      = req.user._id;

    await validateHolidayData(req.body, req.user.organizationId);

    const [holiday] = await Holiday.create([req.body], { session });
    await applyHolidayToAttendance(holiday, session);

    await session.commitTransaction();
    res.status(201).json({ status: 'success', data: { holiday } });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

exports.getAllHolidays = factory.getAll(Holiday, {
  searchFields: ['name', 'description', 'holidayType'],
  populate:     [{ path: 'branchId', select: 'name' }, { path: 'createdBy', select: 'name' }],
  sort:         { date: 1 },
});

exports.getHoliday = factory.getOne(Holiday, {
  populate: [
    { path: 'branchId',                   select: 'name address' },
    { path: 'applicableTo.departments',   select: 'name' },
    { path: 'createdBy',                  select: 'name' },
  ],
});

/**
 * PATCH /api/v1/attendance/holidays/:id
 *
 * FIX BUG-HO-C04 [HIGH] — Date comparison now uses getTime() for correct string→Date comparison.
 * Original: `req.body.date !== holiday.date` → string !== Date → always true.
 */
exports.updateHoliday = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const holiday = await Holiday.findOne({
      _id: req.params.id, organizationId: req.user.organizationId,
    }).session(session);

    if (!holiday) {
      await session.abortTransaction();
      return next(new AppError('Holiday not found', 404));
    }

    // FIX BUG-HO-C04 — Correct date comparison: convert both to timestamps
    const dateChanged = req.body.date &&
      new Date(req.body.date).getTime() !== holiday.date.getTime();

    if (dateChanged) {
      await validateHolidayData(
        { ...req.body, branchId: req.body.branchId ?? holiday.branchId },
        req.user.organizationId,
        req.params.id
      );
    }

    req.body.updatedBy = req.user._id;
    const updated = await Holiday.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, session });

    if (dateChanged || req.body.branchId !== undefined) {
      // Remove old holiday reference from affected attendance records
      await AttendanceDaily.updateMany(
        { organizationId: req.user.organizationId, holidayId: holiday._id },
        { $unset: { holidayId: 1 }, $set: { status: 'absent' } },
        { session }
      );
      await applyHolidayToAttendance(updated, session);
    }

    await session.commitTransaction();
    res.status(200).json({ status: 'success', data: { holiday: updated } });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

exports.deleteHoliday = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const holiday = await Holiday.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
    if (!holiday) {
      await session.abortTransaction();
      return next(new AppError('Holiday not found', 404));
    }

    await AttendanceDaily.updateMany(
      { organizationId: req.user.organizationId, holidayId: holiday._id },
      { $unset: { holidayId: 1 }, $set: { status: 'absent' } },
      { session }
    );

    await holiday.deleteOne({ session });
    await session.commitTransaction();
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────
//  HOLIDAY OPERATIONS
// ─────────────────────────────────────────────

/**
 * GET /api/v1/attendance/holidays/year/:year
 *
 * FIX BUG-HO-C06 [MEDIUM] — `new mongoose.Types.ObjectId()` with `new` keyword.
 */
exports.getHolidaysByYear = catchAsync(async (req, res, next) => {
  const year     = parseInt(req.params.year);
  const branchId = req.query.branchId;

  const query = { organizationId: req.user.organizationId, year };

  if (branchId) {
    // FIX BUG-HO-C06 — Added `new` keyword. Mongoose 6+ requires it for ObjectId casting.
    query.$or = [
      { branchId: new mongoose.Types.ObjectId(branchId) },
      { branchId: null },
    ];
  }

  const holidays = await Holiday.find(query).populate('branchId', 'name').sort('date');

  const byMonth = {};
  holidays.forEach(h => {
    const month = h.month || (h.date.getMonth() + 1);
    (byMonth[month] = byMonth[month] || []).push(h);
  });

  res.status(200).json({ status: 'success', data: { year, total: holidays.length, byMonth, holidays } });
});

exports.getUpcomingHolidays = catchAsync(async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const holidays = await Holiday.find({
    organizationId: req.user.organizationId,
    $or: [{ branchId: req.user.branchId }, { branchId: null }],
    date:     { $gte: new Date() },
    isActive: true,
  }).populate('branchId', 'name').sort('date').limit(limit);

  res.status(200).json({ status: 'success', results: holidays.length, data: { holidays } });
});

exports.checkDate = catchAsync(async (req, res, next) => {
  const { date, branchId } = req.body;
  if (!date) return next(new AppError('Please provide date', 400));

  const targetDate = parseQueryDate(date);
  if (!targetDate) return next(new AppError('Invalid date format', 400));

  const dayStart = startOfDay(targetDate);
  const dayEnd   = endOfDay(targetDate);

  const holiday = await Holiday.findOne({
    organizationId: req.user.organizationId,
    date: { $gte: dayStart, $lte: dayEnd },
    $or: [{ branchId: branchId || req.user.branchId }, { branchId: null }],
    isActive: true,
  });

  res.status(200).json({ status: 'success', data: { date: targetDate, isHoliday: !!holiday, holiday: holiday || null } });
});

// ─────────────────────────────────────────────
//  BULK OPERATIONS
// ─────────────────────────────────────────────

exports.bulkCreateHolidays = catchAsync(async (req, res, next) => {
  const { holidays, year } = req.body;
  if (!Array.isArray(holidays) || holidays.length === 0) {
    return next(new AppError('Please provide an array of holidays', 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = { created: [], duplicates: [], errors: [] };

    for (const data of holidays) {
      try {
        data.organizationId = req.user.organizationId;
        data.createdBy      = req.user._id;
        data.updatedBy      = req.user._id;
        data.year           = year || new Date(data.date).getFullYear();

        const dayStart = startOfDay(new Date(data.date));
        const dayEnd   = endOfDay(new Date(data.date));

        const existing = await Holiday.findOne({
          organizationId: req.user.organizationId,
          date: { $gte: dayStart, $lte: dayEnd },
          $or: [{ branchId: data.branchId || null }, { branchId: null }],
        }).session(session);

        if (existing) { results.duplicates.push(data); continue; }

        const [holiday] = await Holiday.create([data], { session });
        await applyHolidayToAttendance(holiday, session);
        results.created.push(holiday);
      } catch (error) {
        results.errors.push({ data, error: error.message });
      }
    }

    await session.commitTransaction();
    res.status(201).json({ status: 'success', data: results });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * POST /api/v1/attendance/holidays/copy-year
 *
 * FIX BUG-HO-C03 [HIGH] — Recurring check uses correct nested field path.
 * Original: `{ recurring: { $ne: true } }` — `recurring` is an object, never === true.
 * Fix: `{ 'recurring.isRecurring': { $ne: true } }`.
 */
exports.copyHolidaysFromYear = catchAsync(async (req, res, next) => {
  const { fromYear, toYear, branchId } = req.body;
  if (!fromYear || !toYear) return next(new AppError('Please provide fromYear and toYear', 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const query = {
      organizationId:          req.user.organizationId,
      year:                    parseInt(fromYear),
      // FIX BUG-HO-C03 — correct nested field path
      'recurring.isRecurring': { $ne: true },
    };
    if (branchId) {
      query.$or = [{ branchId: new mongoose.Types.ObjectId(branchId) }, { branchId: null }];
    }

    const sourceHolidays = await Holiday.find(query).session(session);
    const results        = [];

    for (const source of sourceHolidays) {
      const newDate = new Date(source.date);
      newDate.setFullYear(parseInt(toYear));

      const dayStart = startOfDay(newDate);
      const dayEnd   = endOfDay(newDate);

      const existing = await Holiday.findOne({
        organizationId: req.user.organizationId,
        date: { $gte: dayStart, $lte: dayEnd },
        $or: [{ branchId: source.branchId }, { branchId: null }],
      }).session(session);

      if (!existing) {
        const holidayData      = source.toObject();
        delete holidayData._id;
        delete holidayData.createdAt;
        delete holidayData.updatedAt;
        holidayData.date       = newDate;
        holidayData.year       = parseInt(toYear);
        holidayData.createdBy  = req.user._id;
        holidayData.updatedBy  = req.user._id;

        const [newHoliday] = await Holiday.create([holidayData], { session });
        await applyHolidayToAttendance(newHoliday, session);
        results.push(newHoliday);
      }
    }

    await session.commitTransaction();
    res.status(201).json({ status: 'success', data: { fromYear, toYear, copied: results.length, holidays: results } });
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

exports.getHolidayStats = catchAsync(async (req, res, next) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const stats = await Holiday.aggregate([
    { $match: { organizationId: req.user.organizationId, year } },
    {
      $facet: {
        byType:  [{ $group:{ _id:'$holidayType', count:{ $sum:1 }, optional:{ $sum:{ $cond:['$isOptional',1,0] } } } }],
        byMonth: [{ $group:{ _id:{ $month:'$date' }, count:{ $sum:1 }, names:{ $push:'$name' } } }, { $sort:{'_id':1} }],
        byBranch:[
          { $group:{ _id:'$branchId', count:{ $sum:1 } } },
          { $lookup:{ from:'branches', localField:'_id', foreignField:'_id', as:'branch' } },
          { $addFields:{ branchName:{ $arrayElemAt:['$branch.name',0] } } },
          { $project:{ branch:0 } },
        ],
        summary: [
          { $group:{ _id:null, total:{ $sum:1 }, national:{ $sum:{ $cond:[{ $eq:['$holidayType','national']},1,0] } }, optional:{ $sum:{ $cond:['$isOptional',1,0] } }, recurring:{ $sum:{ $cond:['$recurring.isRecurring',1,0] } } } },
        ],
      },
    },
  ]);

  res.status(200).json({ status: 'success', data: { year, stats: stats[0] } });
});

/**
 * GET /api/v1/attendance/holidays/export
 *
 * FIX BUG-HO-C07 [MEDIUM] — Calendar date matching uses stored year/month/day fields
 * instead of timezone-sensitive toISOString().split('T')[0] comparison.
 */
exports.exportHolidays = catchAsync(async (req, res, next) => {
  const year     = parseInt(req.query.year) || new Date().getFullYear();
  const branchId = req.query.branchId;
  const format   = req.query.format || 'json';

  const query = { organizationId: req.user.organizationId, year };

  if (branchId) {
    query.$or = [{ branchId: new mongoose.Types.ObjectId(branchId) }, { branchId: null }];
  }

  const holidays = await Holiday.find(query).populate('branchId', 'name').sort('date');

  if (format === 'calendar') {
    const calendar = [];
    const startDate = new Date(year, 0, 1);
    const endDate   = new Date(year, 11, 31);
    const current   = new Date(startDate);

    while (current <= endDate) {
      const curYear  = current.getFullYear();
      const curMonth = current.getMonth() + 1;
      const curDay   = current.getDate();

      // FIX BUG-HO-C07 — Use pre-stored year/month/day fields for matching.
      // Original used toISOString().split('T')[0] — timezone-sensitive and error-prone.
      const dayHolidays = holidays.filter(h =>
        h.year  === curYear  &&
        h.month === curMonth &&
        h.day   === curDay
      );

      calendar.push({
        date:      `${curYear}-${String(curMonth).padStart(2,'0')}-${String(curDay).padStart(2,'0')}`,
        dayOfWeek: current.getDay(),
        isHoliday: dayHolidays.length > 0,
        holidays:  dayHolidays,
      });

      current.setDate(current.getDate() + 1);
    }

    return res.status(200).json({ status: 'success', data: { year, calendar } });
  }

  res.status(200).json({ status: 'success', data: { year, total: holidays.length, holidays } });
});

// // controllers/attendance/holiday.controller.js
// const mongoose = require('mongoose');
// const Holiday = require('../../models/holiday.model');
// const AttendanceDaily = require('../../models/attendanceDaily.model');
// const User = require('../../../auth/core/user.model');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError = require('../../../../core/utils/api/appError');
// const factory = require('../../../../core/utils/api/handlerFactory');

// // ======================================================
// // HELPERS & UTILITIES
// // ======================================================

// const validateHolidayData = async (data, organizationId, excludeId = null) => {
//   const { name, date, branchId } = data;
  
//   // Check for duplicate holiday on same date for same branch
//   const query = {
//     organizationId,
//     date: new Date(date),
//     $or: [
//       { branchId: branchId || null },
//       { branchId: null }
//     ]
//   };
  
//   if (excludeId) {
//     query._id = { $ne: excludeId };
//   }
  
//   const existing = await Holiday.findOne(query);
  
//   if (existing) {
//     throw new AppError('Holiday already exists for this date', 400);
//   }
// };

// const applyHolidayToAttendance = async (holiday, session) => {
//   // Find all users in the organization/branch
//   const query = {
//     organizationId: holiday.organizationId,
//     isActive: true
//   };
  
//   if (holiday.branchId) {
//     query.branchId = holiday.branchId;
//   }
  
//   const users = await mongoose.model('User').find(query).select('_id').session(session);
  
//   // Update or create attendance records for this date
//   for (const user of users) {
//     await AttendanceDaily.findOneAndUpdate(
//       {
//         user: user._id,
//         organizationId: holiday.organizationId,
//         date: holiday.date
//       },
//       {
//         $set: {
//           status: 'holiday',
//           holidayId: holiday._id,
//           totalWorkHours: 0
//         },
//         $setOnInsert: {
//           user: user._id,
//           organizationId: holiday.organizationId,
//           branchId: holiday.branchId
//         }
//       },
//       { upsert: true, session }
//     );
//   }
// };

// // ======================================================
// // CRUD OPERATIONS
// // ======================================================

// /**
//  * @desc    Create new holiday
//  * @route   POST /api/v1/attendance/holidays
//  * @access  Private (Admin/HR)
//  */
// exports.createHoliday = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     req.body.organizationId = req.user.organizationId;
//     req.body.createdBy = req.user._id;
//     req.body.updatedBy = req.user._id;
    
//     await validateHolidayData(req.body, req.user.organizationId);
    
//     const [holiday] = await Holiday.create([req.body], { session });
    
//     // Apply holiday to attendance records
//     await applyHolidayToAttendance(holiday, session);
    
//     await session.commitTransaction();
    
//     res.status(201).json({
//       status: 'success',
//       data: { holiday }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// /**
//  * @desc    Get all holidays
//  * @route   GET /api/v1/attendance/holidays
//  * @access  Private
//  */
// exports.getAllHolidays = factory.getAll(Holiday, {
//   searchFields: ['name', 'description', 'holidayType'],
//   populate: [
//     { path: 'branchId', select: 'name' },
//     { path: 'createdBy', select: 'name' }
//   ],
//   sort: { date: 1 }
// });

// /**
//  * @desc    Get single holiday
//  * @route   GET /api/v1/attendance/holidays/:id
//  * @access  Private
//  */
// exports.getHoliday = factory.getOne(Holiday, {
//   populate: [
//     { path: 'branchId', select: 'name address' },
//     { path: 'applicableTo.departments', select: 'name' },
//     { path: 'createdBy', select: 'name' }
//   ]
// });

// /**
//  * @desc    Update holiday
//  * @route   PATCH /api/v1/attendance/holidays/:id
//  * @access  Private (Admin/HR)
//  */
// exports.updateHoliday = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const holiday = await Holiday.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     }).session(session);
    
//     if (!holiday) {
//       return next(new AppError('Holiday not found', 404));
//     }
    
//     // Validate if date changed
//     if (req.body.date && req.body.date !== holiday.date) {
//       await validateHolidayData(
//         { ...req.body, branchId: req.body.branchId || holiday.branchId },
//         req.user.organizationId,
//         req.params.id
//       );
//     }
    
//     req.body.updatedBy = req.user._id;
    
//     const updatedHoliday = await Holiday.findByIdAndUpdate(
//       req.params.id,
//       { $set: req.body },
//       { new: true, session }
//     );
    
//     // If date or branch changed, update attendance records
//     if (req.body.date || req.body.branchId) {
//       // Remove old holiday from attendance
//       await AttendanceDaily.updateMany(
//         {
//           organizationId: req.user.organizationId,
//           holidayId: holiday._id
//         },
//         {
//           $unset: { holidayId: 1 },
//           $set: { status: 'absent' }
//         },
//         { session }
//       );
      
//       // Apply new holiday
//       await applyHolidayToAttendance(updatedHoliday, session);
//     }
    
//     await session.commitTransaction();
    
//     res.status(200).json({
//       status: 'success',
//       data: { holiday: updatedHoliday }
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// /**
//  * @desc    Delete holiday
//  * @route   DELETE /api/v1/attendance/holidays/:id
//  * @access  Private (Admin/HR)
//  */
// exports.deleteHoliday = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const holiday = await Holiday.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     }).session(session);
    
//     if (!holiday) {
//       return next(new AppError('Holiday not found', 404));
//     }
    
//     // Remove holiday from attendance records
//     await AttendanceDaily.updateMany(
//       {
//         organizationId: req.user.organizationId,
//         holidayId: holiday._id
//       },
//       {
//         $unset: { holidayId: 1 },
//         $set: { status: 'absent' }
//       },
//       { session }
//     );
    
//     await holiday.deleteOne({ session });
    
//     await session.commitTransaction();
    
//     res.status(204).json({
//       status: 'success',
//       data: null
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// });

// // ======================================================
// // HOLIDAY OPERATIONS
// // ======================================================

// /**
//  * @desc    Get holidays by year
//  * @route   GET /api/v1/attendance/holidays/year/:year
//  * @access  Private
//  */
// exports.getHolidaysByYear = catchAsync(async (req, res, next) => {
//   const { year } = req.params;
//   const { branchId } = req.query;
  
//   const query = {
//     organizationId: req.user.organizationId,
//     year: parseInt(year)
//   };
  
//   if (branchId) {
//     query.$or = [
//       { branchId: mongoose.Types.ObjectId(branchId) },
//       { branchId: null }
//     ];
//   }
  
//   const holidays = await Holiday.find(query)
//     .populate('branchId', 'name')
//     .sort('date');
  
//   // Group by month
//   const byMonth = {};
//   holidays.forEach(h => {
//     const month = h.date.getMonth() + 1;
//     if (!byMonth[month]) byMonth[month] = [];
//     byMonth[month].push(h);
//   });
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       year,
//       total: holidays.length,
//       byMonth,
//       holidays
//     }
//   });
// });

// /**
//  * @desc    Get upcoming holidays
//  * @route   GET /api/v1/attendance/holidays/upcoming
//  * @access  Private
//  */
// exports.getUpcomingHolidays = catchAsync(async (req, res, next) => {
//   const { limit = 10 } = req.query;
  
//   const holidays = await Holiday.find({
//     organizationId: req.user.organizationId,
//     $or: [
//       { branchId: req.user.branchId },
//       { branchId: null }
//     ],
//     date: { $gte: new Date() },
//     isActive: true
//   })
//   .populate('branchId', 'name')
//   .sort('date')
//   .limit(parseInt(limit));
  
//   res.status(200).json({
//     status: 'success',
//     results: holidays.length,
//     data: { holidays }
//   });
// });

// /**
//  * @desc    Check if date is holiday
//  * @route   POST /api/v1/attendance/holidays/check-date
//  * @access  Private
//  */
// exports.checkDate = catchAsync(async (req, res, next) => {
//   const { date, branchId } = req.body;
  
//   if (!date) {
//     return next(new AppError('Please provide date', 400));
//   }
  
//   const targetDate = new Date(date);
  
//   const holiday = await Holiday.findOne({
//     organizationId: req.user.organizationId,
//     date: targetDate,
//     $or: [
//       { branchId: branchId || req.user.branchId },
//       { branchId: null }
//     ],
//     isActive: true
//   });
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       date: targetDate,
//       isHoliday: !!holiday,
//       holiday: holiday || null
//     }
//   });
// });

// // ======================================================
// // BULK OPERATIONS
// // ======================================================

// /**
//  * @desc    Bulk create holidays
//  * @route   POST /api/v1/attendance/holidays/bulk
//  * @access  Private (Admin/HR)
//  */
// exports.bulkCreateHolidays = catchAsync(async (req, res, next) => {
//   const { holidays, year } = req.body;
  
//   if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
//     return next(new AppError('Please provide an array of holidays', 400));
//   }
  
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     const results = {
//       created: [],
//       duplicates: [],
//       errors: []
//     };
    
//     for (const data of holidays) {
//       try {
//         // Set common fields
//         data.organizationId = req.user.organizationId;
//         data.createdBy = req.user._id;
//         data.updatedBy = req.user._id;
//         data.year = year || new Date(data.date).getFullYear();
        
//         // Check for duplicate
//         const existing = await Holiday.findOne({
//           organizationId: req.user.organizationId,
//           date: new Date(data.date),
//           $or: [
//             { branchId: data.branchId || null },
//             { branchId: null }
//           ]
//         }).session(session);
        
//         if (existing) {
//           results.duplicates.push(data);
//           continue;
//         }
        
//         const [holiday] = await Holiday.create([data], { session });
        
//         // Apply to attendance
//         await applyHolidayToAttendance(holiday, session);
        
//         results.created.push(holiday);
//       } catch (error) {
//         results.errors.push({ data, error: error.message });
//       }
//     }
    
//     await session.commitTransaction();
    
//     res.status(201).json({
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

// /**
//  * @desc    Copy holidays from previous year
//  * @route   POST /api/v1/attendance/holidays/copy-year
//  * @access  Private (Admin/HR)
//  */
// exports.copyHolidaysFromYear = catchAsync(async (req, res, next) => {
//   const { fromYear, toYear, branchId } = req.body;
  
//   if (!fromYear || !toYear) {
//     return next(new AppError('Please provide fromYear and toYear', 400));
//   }
  
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     // Get source holidays
//     const sourceHolidays = await Holiday.find({
//       organizationId: req.user.organizationId,
//       year: parseInt(fromYear),
//       $or: [
//         { branchId: branchId || null },
//         { branchId: null }
//       ],
//       recurring: { $ne: true } // Don't copy recurring ones automatically
//     }).session(session);
    
//     const results = [];
    
//     for (const source of sourceHolidays) {
//       // Create new date with target year
//       const newDate = new Date(source.date);
//       newDate.setFullYear(parseInt(toYear));
      
//       // Check if already exists
//       const existing = await Holiday.findOne({
//         organizationId: req.user.organizationId,
//         date: newDate,
//         $or: [
//           { branchId: source.branchId },
//           { branchId: null }
//         ]
//       }).session(session);
      
//       if (!existing) {
//         const holidayData = source.toObject();
//         delete holidayData._id;
//         delete holidayData.createdAt;
//         delete holidayData.updatedAt;
        
//         holidayData.date = newDate;
//         holidayData.year = parseInt(toYear);
//         holidayData.createdBy = req.user._id;
//         holidayData.updatedBy = req.user._id;
        
//         const [newHoliday] = await Holiday.create([holidayData], { session });
        
//         // Apply to attendance
//         await applyHolidayToAttendance(newHoliday, session);
        
//         results.push(newHoliday);
//       }
//     }
    
//     await session.commitTransaction();
    
//     res.status(201).json({
//       status: 'success',
//       data: {
//         fromYear,
//         toYear,
//         copied: results.length,
//         holidays: results
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
// // REPORTS & ANALYTICS
// // ======================================================

// /**
//  * @desc    Get holiday statistics
//  * @route   GET /api/v1/attendance/holidays/stats
//  * @access  Private (Admin/HR)
//  */
// exports.getHolidayStats = catchAsync(async (req, res, next) => {
//   const { year = new Date().getFullYear() } = req.query;
  
//   const stats = await Holiday.aggregate([
//     {
//       $match: {
//         organizationId: req.user.organizationId,
//         year: parseInt(year)
//       }
//     },
//     {
//       $facet: {
//         byType: [
//           {
//             $group: {
//               _id: '$holidayType',
//               count: { $sum: 1 },
//               optional: {
//                 $sum: { $cond: ['$isOptional', 1, 0] }
//               }
//             }
//           }
//         ],
//         byMonth: [
//           {
//             $group: {
//               _id: { $month: '$date' },
//               count: { $sum: 1 },
//               names: { $push: '$name' }
//             }
//           },
//           { $sort: { '_id': 1 } }
//         ],
//         byBranch: [
//           {
//             $group: {
//               _id: '$branchId',
//               count: { $sum: 1 }
//             }
//           },
//           {
//             $lookup: {
//               from: 'branches',
//               localField: '_id',
//               foreignField: '_id',
//               as: 'branch'
//             }
//           }
//         ],
//         summary: [
//           {
//             $group: {
//               _id: null,
//               total: { $sum: 1 },
//               national: {
//                 $sum: { $cond: [{ $eq: ['$holidayType', 'national'] }, 1, 0] }
//               },
//               optional: {
//                 $sum: { $cond: ['$isOptional', 1, 0] }
//               },
//               recurring: {
//                 $sum: { $cond: ['$recurring.isRecurring', 1, 0] }
//               }
//             }
//           }
//         ]
//       }
//     }
//   ]);
  
//   res.status(200).json({
//     status: 'success',
//     data: {
//       year,
//       stats: stats[0]
//     }
//   });
// });

// /**
//  * @desc    Export holiday calendar
//  * @route   GET /api/v1/attendance/holidays/export
//  * @access  Private
//  */
// exports.exportHolidays = catchAsync(async (req, res, next) => {
//   const { year = new Date().getFullYear(), branchId, format = 'json' } = req.query;
  
//   const query = {
//     organizationId: req.user.organizationId,
//     year: parseInt(year)
//   };
  
//   if (branchId) {
//     query.$or = [
//       { branchId: mongoose.Types.ObjectId(branchId) },
//       { branchId: null }
//     ];
//   }
  
//   const holidays = await Holiday.find(query)
//     .populate('branchId', 'name')
//     .sort('date');
  
//   if (format === 'calendar') {
//     // Format as calendar grid
//     const calendar = [];
//     const startDate = new Date(year, 0, 1);
//     const endDate = new Date(year, 11, 31);
    
//     const current = new Date(startDate);
//     while (current <= endDate) {
//       const dateStr = current.toISOString().split('T')[0];
//       const dayHolidays = holidays.filter(h => 
//         h.date.toISOString().split('T')[0] === dateStr
//       );
      
//       calendar.push({
//         date: dateStr,
//         dayOfWeek: current.getDay(),
//         isHoliday: dayHolidays.length > 0,
//         holidays: dayHolidays
//       });
      
//       current.setDate(current.getDate() + 1);
//     }
    
//     res.status(200).json({
//       status: 'success',
//       data: {
//         year,
//         calendar
//       }
//     });
//   } else {
//     res.status(200).json({
//       status: 'success',
//       data: {
//         year,
//         total: holidays.length,
//         holidays
//       }
//     });
//   }
// });