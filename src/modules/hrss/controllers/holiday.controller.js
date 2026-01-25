const catchAsync = require('../../core/utils/catchAsync');
const AppError = require('../../core/utils/appError');
const Holiday = require('../models/holiday.model');
const dayjs = require('dayjs');

class HolidayController {
  
  /**
   * Create holiday
   */
  createHoliday = catchAsync(async (req, res, next) => {
    const {
      name,
      date,
      branchId,
      description,
      type,
      isOptional,
      isRecurring,
      compensationRule,
      workingRule
    } = req.body;
    
    // Validate date
    if (!dayjs(date, 'YYYY-MM-DD', true).isValid()) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }
    
    // Check for duplicate
    const existing = await Holiday.findOne({
      organizationId: req.user.organizationId,
      branchId: branchId || null,
      date
    });
    
    if (existing) {
      throw new AppError('Holiday already exists for this date', 400);
    }
    
    const holiday = await Holiday.create({
      name,
      date,
      organizationId: req.user.organizationId,
      branchId: branchId || null,
      description,
      type: type || 'company',
      isOptional: isOptional || false,
      isRecurring: isRecurring || false,
      compensationRule: compensationRule || 'none',
      workingRule: workingRule || 'no_work',
      createdBy: req.user._id
    });
    
    res.status(201).json({
      status: 'success',
      message: 'Holiday created successfully',
      data: holiday
    });
  });
  
  /**
   * Get holidays with filters
   */
  getHolidays = catchAsync(async (req, res, next) => {
    const { 
      year, 
      month, 
      branchId, 
      type, 
      isOptional,
      page = 1, 
      limit = 100 
    } = req.query;
    
    const filter = { organizationId: req.user.organizationId };
    
    // Year filter
    if (year) {
      filter.date = { 
        $gte: `${year}-01-01`, 
        $lte: `${year}-12-31` 
      };
    }
    
    // Month filter
    if (year && month) {
      const monthStr = month.toString().padStart(2, '0');
      filter.date = { 
        $gte: `${year}-${monthStr}-01`, 
        $lte: `${year}-${monthStr}-31` 
      };
    }
    
    // Branch filter
    if (branchId) {
      filter.$or = [
        { branchId: branchId },
        { branchId: null }
      ];
    }
    
    if (type) filter.type = type;
    if (isOptional !== undefined) filter.isOptional = isOptional === 'true';
    
    const skip = (page - 1) * limit;
    
    const [holidays, total] = await Promise.all([
      Holiday.find(filter)
        .sort({ date: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('branchId', 'name city')
        .populate('createdBy', 'name email')
        .lean(),
      Holiday.countDocuments(filter)
    ]);
    
    // Group by month for easier consumption
    const groupedByMonth = {};
    holidays.forEach(holiday => {
      const month = holiday.date.substring(0, 7); // YYYY-MM
      if (!groupedByMonth[month]) {
        groupedByMonth[month] = [];
      }
      groupedByMonth[month].push(holiday);
    });
    
    // Get upcoming holidays
    const today = dayjs().format('YYYY-MM-DD');
    const upcoming = await Holiday.find({
      organizationId: req.user.organizationId,
      date: { $gte: today },
      isActive: true
    })
      .sort({ date: 1 })
      .limit(10)
      .populate('branchId', 'name')
      .lean();
    
    res.status(200).json({
      status: 'success',
      results: holidays.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      upcomingCount: upcoming.length,
      data: {
        holidays,
        groupedByMonth,
        upcoming
      }
    });
  });
  
  /**
   * Get holiday by ID
   */
  getHolidayById = catchAsync(async (req, res, next) => {
    const holiday = await Holiday.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    })
      .populate('branchId', 'name city address')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!holiday) {
      throw new AppError('Holiday not found', 404);
    }
    
    res.status(200).json({
      status: 'success',
      data: holiday
    });
  });
  
  /**
   * Update holiday
   */
  updateHoliday = catchAsync(async (req, res, next) => {
    // Prevent changing organizationId
    if (req.body.organizationId) {
      delete req.body.organizationId;
    }
    
    const holiday = await Holiday.findOneAndUpdate(
      { 
        _id: req.params.id, 
        organizationId: req.user.organizationId 
      },
      {
        ...req.body,
        updatedBy: req.user._id
      },
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!holiday) {
      throw new AppError('Holiday not found', 404);
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Holiday updated successfully',
      data: holiday
    });
  });
  
  /**
   * Delete holiday
   */
  deleteHoliday = catchAsync(async (req, res, next) => {
    const holiday = await Holiday.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });
    
    if (!holiday) {
      throw new AppError('Holiday not found', 404);
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  });
  
  /**
   * Bulk import holidays
   */
  bulkImportHolidays = catchAsync(async (req, res, next) => {
    const { holidays } = req.body;
    
    if (!Array.isArray(holidays) || holidays.length === 0) {
      throw new AppError('Please provide an array of holidays', 400);
    }
    
    // Validate and format holidays
    const formattedHolidays = holidays.map(holiday => {
      if (!holiday.name || !holiday.date) {
        throw new AppError('Each holiday must have name and date', 400);
      }
      
      if (!dayjs(holiday.date, 'YYYY-MM-DD', true).isValid()) {
        throw new AppError(`Invalid date format for ${holiday.name}. Use YYYY-MM-DD`, 400);
      }
      
      return {
        ...holiday,
        organizationId: req.user.organizationId,
        createdBy: req.user._id
      };
    });
    
    // Use bulkWrite for better performance and duplicate handling
    const operations = formattedHolidays.map(holiday => ({
      updateOne: {
        filter: {
          organizationId: holiday.organizationId,
          branchId: holiday.branchId || null,
          date: holiday.date
        },
        update: { $set: holiday },
        upsert: true
      }
    }));
    
    const result = await Holiday.bulkWrite(operations);
    
    res.status(200).json({
      status: 'success',
      message: 'Holidays imported successfully',
      data: {
        processed: formattedHolidays.length,
        inserted: result.upsertedCount,
        modified: result.modifiedCount,
        duplicates: formattedHolidays.length - (result.upsertedCount + result.modifiedCount)
      }
    });
  });
  
  /**
   * Check if date is holiday
   */
  checkDate = catchAsync(async (req, res, next) => {
    const { date, branchId } = req.query;
    
    if (!date) {
      throw new AppError('Date parameter is required', 400);
    }
    
    if (!dayjs(date, 'YYYY-MM-DD', true).isValid()) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }
    
    const holiday = await Holiday.isHoliday(
      req.user.organizationId,
      date,
      branchId || null
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        date,
        isHoliday: !!holiday,
        holiday: holiday || null
      }
    });
  });
  
  /**
   * Get holiday calendar
   */
  getHolidayCalendar = catchAsync(async (req, res, next) => {
    const { year, branchId } = req.query;
    const targetYear = year || dayjs().year();
    
    const holidays = await Holiday.find({
      organizationId: req.user.organizationId,
      date: { 
        $gte: `${targetYear}-01-01`, 
        $lte: `${targetYear}-12-31` 
      },
      isActive: true,
      $or: [
        { branchId: branchId || null },
        { branchId: null }
      ]
    })
      .sort({ date: 1 })
      .lean();
    
    // Format for calendar view
    const calendar = {};
    holidays.forEach(holiday => {
      const month = holiday.date.substring(5, 7); // MM
      if (!calendar[month]) {
        calendar[month] = [];
      }
      
      calendar[month].push({
        date: holiday.date,
        name: holiday.name,
        type: holiday.type,
        isOptional: holiday.isOptional,
        description: holiday.description
      });
    });
    
    // Calculate statistics
    const stats = {
      total: holidays.length,
      national: holidays.filter(h => h.type === 'national').length,
      state: holidays.filter(h => h.type === 'state').length,
      company: holidays.filter(h => h.type === 'company').length,
      optional: holidays.filter(h => h.isOptional).length
    };
    
    res.status(200).json({
      status: 'success',
      data: {
        year: targetYear,
        stats,
        calendar,
        holidays
      }
    });
  });
}

module.exports = new HolidayController();