const Holiday = require('../models/holidayModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.createHoliday = catchAsync(async (req, res, next) => {
    const { name, date, branchId, description } = req.body;
    
    // Check duplication
    const existing = await Holiday.findOne({ 
        organizationId: req.user.organizationId, 
        branchId: branchId || null, 
        date 
    });
    
    if (existing) return next(new AppError('Holiday already exists for this date', 400));

    const holiday = await Holiday.create({
        name,
        date,
        organizationId: req.user.organizationId,
        branchId: branchId || null, // Ensure null if undefined
        description
    });

    res.status(201).json({ status: 'success', data: holiday });
});

exports.getHolidays = catchAsync(async (req, res, next) => {
    const { year } = req.query; // ?year=2024
    
    const filter = { organizationId: req.user.organizationId };
    
    // Filter by year if provided
    if (year) {
        filter.date = { $regex: `^${year}` };
    }

    const holidays = await Holiday.find(filter).sort({ date: 1 });
    
    res.status(200).json({ status: 'success', results: holidays.length, data: holidays });
});
