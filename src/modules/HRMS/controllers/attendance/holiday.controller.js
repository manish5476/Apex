// controllers/attendance/holiday.controller.js
const mongoose = require('mongoose');
const Holiday = require('../../models/holiday.model');
const AttendanceDaily = require('../../models/attendanceDaily.model');
const User = require('../../../auth/core/user.model');
const catchAsync = require('../../../../core/utils/catchAsync');
const AppError = require('../../../../core/utils/appError');
const factory = require('../../../../core/utils/handlerFactory');

// ======================================================
// HELPERS & UTILITIES
// ======================================================

const validateHolidayData = async (data, organizationId, excludeId = null) => {
  const { name, date, branchId } = data;
  
  // Check for duplicate holiday on same date for same branch
  const query = {
    organizationId,
    date: new Date(date),
    $or: [
      { branchId: branchId || null },
      { branchId: null }
    ]
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const existing = await Holiday.findOne(query);
  
  if (existing) {
    throw new AppError('Holiday already exists for this date', 400);
  }
};

const applyHolidayToAttendance = async (holiday, session) => {
  // Find all users in the organization/branch
  const query = {
    organizationId: holiday.organizationId,
    isActive: true
  };
  
  if (holiday.branchId) {
    query.branchId = holiday.branchId;
  }
  
  const users = await mongoose.model('User').find(query).select('_id').session(session);
  
  // Update or create attendance records for this date
  for (const user of users) {
    await AttendanceDaily.findOneAndUpdate(
      {
        user: user._id,
        organizationId: holiday.organizationId,
        date: holiday.date
      },
      {
        $set: {
          status: 'holiday',
          holidayId: holiday._id,
          totalWorkHours: 0
        },
        $setOnInsert: {
          user: user._id,
          organizationId: holiday.organizationId,
          branchId: holiday.branchId
        }
      },
      { upsert: true, session }
    );
  }
};

// ======================================================
// CRUD OPERATIONS
// ======================================================

/**
 * @desc    Create new holiday
 * @route   POST /api/v1/attendance/holidays
 * @access  Private (Admin/HR)
 */
exports.createHoliday = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user._id;
    req.body.updatedBy = req.user._id;
    
    await validateHolidayData(req.body, req.user.organizationId);
    
    const [holiday] = await Holiday.create([req.body], { session });
    
    // Apply holiday to attendance records
    await applyHolidayToAttendance(holiday, session);
    
    await session.commitTransaction();
    
    res.status(201).json({
      status: 'success',
      data: { holiday }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Get all holidays
 * @route   GET /api/v1/attendance/holidays
 * @access  Private
 */
exports.getAllHolidays = factory.getAll(Holiday, {
  searchFields: ['name', 'description', 'holidayType'],
  populate: [
    { path: 'branchId', select: 'name' },
    { path: 'createdBy', select: 'name' }
  ],
  sort: { date: 1 }
});

/**
 * @desc    Get single holiday
 * @route   GET /api/v1/attendance/holidays/:id
 * @access  Private
 */
exports.getHoliday = factory.getOne(Holiday, {
  populate: [
    { path: 'branchId', select: 'name address' },
    { path: 'applicableTo.departments', select: 'name' },
    { path: 'createdBy', select: 'name' }
  ]
});

/**
 * @desc    Update holiday
 * @route   PATCH /api/v1/attendance/holidays/:id
 * @access  Private (Admin/HR)
 */
exports.updateHoliday = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const holiday = await Holiday.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);
    
    if (!holiday) {
      return next(new AppError('Holiday not found', 404));
    }
    
    // Validate if date changed
    if (req.body.date && req.body.date !== holiday.date) {
      await validateHolidayData(
        { ...req.body, branchId: req.body.branchId || holiday.branchId },
        req.user.organizationId,
        req.params.id
      );
    }
    
    req.body.updatedBy = req.user._id;
    
    const updatedHoliday = await Holiday.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, session }
    );
    
    // If date or branch changed, update attendance records
    if (req.body.date || req.body.branchId) {
      // Remove old holiday from attendance
      await AttendanceDaily.updateMany(
        {
          organizationId: req.user.organizationId,
          holidayId: holiday._id
        },
        {
          $unset: { holidayId: 1 },
          $set: { status: 'absent' }
        },
        { session }
      );
      
      // Apply new holiday
      await applyHolidayToAttendance(updatedHoliday, session);
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      status: 'success',
      data: { holiday: updatedHoliday }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Delete holiday
 * @route   DELETE /api/v1/attendance/holidays/:id
 * @access  Private (Admin/HR)
 */
exports.deleteHoliday = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const holiday = await Holiday.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);
    
    if (!holiday) {
      return next(new AppError('Holiday not found', 404));
    }
    
    // Remove holiday from attendance records
    await AttendanceDaily.updateMany(
      {
        organizationId: req.user.organizationId,
        holidayId: holiday._id
      },
      {
        $unset: { holidayId: 1 },
        $set: { status: 'absent' }
      },
      { session }
    );
    
    await holiday.deleteOne({ session });
    
    await session.commitTransaction();
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// ======================================================
// HOLIDAY OPERATIONS
// ======================================================

/**
 * @desc    Get holidays by year
 * @route   GET /api/v1/attendance/holidays/year/:year
 * @access  Private
 */
exports.getHolidaysByYear = catchAsync(async (req, res, next) => {
  const { year } = req.params;
  const { branchId } = req.query;
  
  const query = {
    organizationId: req.user.organizationId,
    year: parseInt(year)
  };
  
  if (branchId) {
    query.$or = [
      { branchId: mongoose.Types.ObjectId(branchId) },
      { branchId: null }
    ];
  }
  
  const holidays = await Holiday.find(query)
    .populate('branchId', 'name')
    .sort('date');
  
  // Group by month
  const byMonth = {};
  holidays.forEach(h => {
    const month = h.date.getMonth() + 1;
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(h);
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      year,
      total: holidays.length,
      byMonth,
      holidays
    }
  });
});

/**
 * @desc    Get upcoming holidays
 * @route   GET /api/v1/attendance/holidays/upcoming
 * @access  Private
 */
exports.getUpcomingHolidays = catchAsync(async (req, res, next) => {
  const { limit = 10 } = req.query;
  
  const holidays = await Holiday.find({
    organizationId: req.user.organizationId,
    $or: [
      { branchId: req.user.branchId },
      { branchId: null }
    ],
    date: { $gte: new Date() },
    isActive: true
  })
  .populate('branchId', 'name')
  .sort('date')
  .limit(parseInt(limit));
  
  res.status(200).json({
    status: 'success',
    results: holidays.length,
    data: { holidays }
  });
});

/**
 * @desc    Check if date is holiday
 * @route   POST /api/v1/attendance/holidays/check-date
 * @access  Private
 */
exports.checkDate = catchAsync(async (req, res, next) => {
  const { date, branchId } = req.body;
  
  if (!date) {
    return next(new AppError('Please provide date', 400));
  }
  
  const targetDate = new Date(date);
  
  const holiday = await Holiday.findOne({
    organizationId: req.user.organizationId,
    date: targetDate,
    $or: [
      { branchId: branchId || req.user.branchId },
      { branchId: null }
    ],
    isActive: true
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      date: targetDate,
      isHoliday: !!holiday,
      holiday: holiday || null
    }
  });
});

// ======================================================
// BULK OPERATIONS
// ======================================================

/**
 * @desc    Bulk create holidays
 * @route   POST /api/v1/attendance/holidays/bulk
 * @access  Private (Admin/HR)
 */
exports.bulkCreateHolidays = catchAsync(async (req, res, next) => {
  const { holidays, year } = req.body;
  
  if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
    return next(new AppError('Please provide an array of holidays', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const results = {
      created: [],
      duplicates: [],
      errors: []
    };
    
    for (const data of holidays) {
      try {
        // Set common fields
        data.organizationId = req.user.organizationId;
        data.createdBy = req.user._id;
        data.updatedBy = req.user._id;
        data.year = year || new Date(data.date).getFullYear();
        
        // Check for duplicate
        const existing = await Holiday.findOne({
          organizationId: req.user.organizationId,
          date: new Date(data.date),
          $or: [
            { branchId: data.branchId || null },
            { branchId: null }
          ]
        }).session(session);
        
        if (existing) {
          results.duplicates.push(data);
          continue;
        }
        
        const [holiday] = await Holiday.create([data], { session });
        
        // Apply to attendance
        await applyHolidayToAttendance(holiday, session);
        
        results.created.push(holiday);
      } catch (error) {
        results.errors.push({ data, error: error.message });
      }
    }
    
    await session.commitTransaction();
    
    res.status(201).json({
      status: 'success',
      data: results
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Copy holidays from previous year
 * @route   POST /api/v1/attendance/holidays/copy-year
 * @access  Private (Admin/HR)
 */
exports.copyHolidaysFromYear = catchAsync(async (req, res, next) => {
  const { fromYear, toYear, branchId } = req.body;
  
  if (!fromYear || !toYear) {
    return next(new AppError('Please provide fromYear and toYear', 400));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Get source holidays
    const sourceHolidays = await Holiday.find({
      organizationId: req.user.organizationId,
      year: parseInt(fromYear),
      $or: [
        { branchId: branchId || null },
        { branchId: null }
      ],
      recurring: { $ne: true } // Don't copy recurring ones automatically
    }).session(session);
    
    const results = [];
    
    for (const source of sourceHolidays) {
      // Create new date with target year
      const newDate = new Date(source.date);
      newDate.setFullYear(parseInt(toYear));
      
      // Check if already exists
      const existing = await Holiday.findOne({
        organizationId: req.user.organizationId,
        date: newDate,
        $or: [
          { branchId: source.branchId },
          { branchId: null }
        ]
      }).session(session);
      
      if (!existing) {
        const holidayData = source.toObject();
        delete holidayData._id;
        delete holidayData.createdAt;
        delete holidayData.updatedAt;
        
        holidayData.date = newDate;
        holidayData.year = parseInt(toYear);
        holidayData.createdBy = req.user._id;
        holidayData.updatedBy = req.user._id;
        
        const [newHoliday] = await Holiday.create([holidayData], { session });
        
        // Apply to attendance
        await applyHolidayToAttendance(newHoliday, session);
        
        results.push(newHoliday);
      }
    }
    
    await session.commitTransaction();
    
    res.status(201).json({
      status: 'success',
      data: {
        fromYear,
        toYear,
        copied: results.length,
        holidays: results
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
 * @desc    Get holiday statistics
 * @route   GET /api/v1/attendance/holidays/stats
 * @access  Private (Admin/HR)
 */
exports.getHolidayStats = catchAsync(async (req, res, next) => {
  const { year = new Date().getFullYear() } = req.query;
  
  const stats = await Holiday.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        year: parseInt(year)
      }
    },
    {
      $facet: {
        byType: [
          {
            $group: {
              _id: '$holidayType',
              count: { $sum: 1 },
              optional: {
                $sum: { $cond: ['$isOptional', 1, 0] }
              }
            }
          }
        ],
        byMonth: [
          {
            $group: {
              _id: { $month: '$date' },
              count: { $sum: 1 },
              names: { $push: '$name' }
            }
          },
          { $sort: { '_id': 1 } }
        ],
        byBranch: [
          {
            $group: {
              _id: '$branchId',
              count: { $sum: 1 }
            }
          },
          {
            $lookup: {
              from: 'branches',
              localField: '_id',
              foreignField: '_id',
              as: 'branch'
            }
          }
        ],
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              national: {
                $sum: { $cond: [{ $eq: ['$holidayType', 'national'] }, 1, 0] }
              },
              optional: {
                $sum: { $cond: ['$isOptional', 1, 0] }
              },
              recurring: {
                $sum: { $cond: ['$recurring.isRecurring', 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: {
      year,
      stats: stats[0]
    }
  });
});

/**
 * @desc    Export holiday calendar
 * @route   GET /api/v1/attendance/holidays/export
 * @access  Private
 */
exports.exportHolidays = catchAsync(async (req, res, next) => {
  const { year = new Date().getFullYear(), branchId, format = 'json' } = req.query;
  
  const query = {
    organizationId: req.user.organizationId,
    year: parseInt(year)
  };
  
  if (branchId) {
    query.$or = [
      { branchId: mongoose.Types.ObjectId(branchId) },
      { branchId: null }
    ];
  }
  
  const holidays = await Holiday.find(query)
    .populate('branchId', 'name')
    .sort('date');
  
  if (format === 'calendar') {
    // Format as calendar grid
    const calendar = [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const dayHolidays = holidays.filter(h => 
        h.date.toISOString().split('T')[0] === dateStr
      );
      
      calendar.push({
        date: dateStr,
        dayOfWeek: current.getDay(),
        isHoliday: dayHolidays.length > 0,
        holidays: dayHolidays
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        year,
        calendar
      }
    });
  } else {
    res.status(200).json({
      status: 'success',
      data: {
        year,
        total: holidays.length,
        holidays
      }
    });
  }
});