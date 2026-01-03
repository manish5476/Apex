const Holiday = require('../models/holidayModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// 1. CREATE
exports.createHoliday = catchAsync(async (req, res, next) => {
    const { name, date, branchId, description, isOptional } = req.body;
    
    // Check duplication
    const existing = await Holiday.findOne({
        organizationId: req.user.organizationId,
        branchId: branchId || null,
        date
    });
    
    if (existing) {
        return next(new AppError('Holiday already exists for this date', 400));
    }

    const holiday = await Holiday.create({
        name,
        date,
        organizationId: req.user.organizationId,
        branchId: branchId || null,
        description,
        isOptional
    });

    res.status(201).json({ status: 'success', data: holiday });
});

// 2. GET ALL (Filter by Year)
exports.getHolidays = catchAsync(async (req, res, next) => {
    const { year } = req.query; // ?year=2024
    
    const filter = { organizationId: req.user.organizationId };
    
    // Optional Year Filter
    if (year) {
        filter.date = { $regex: `^${year}` };
    }

    const holidays = await Holiday.find(filter)
        .sort({ date: 1 })
        .populate('branchId', 'name'); // Show branch name if specific

    res.status(200).json({ status: 'success', results: holidays.length, data: holidays });
});

// 3. GET ONE
exports.getHolidayById = catchAsync(async (req, res, next) => {
    const holiday = await Holiday.findOne({
        _id: req.params.id,
        organizationId: req.user.organizationId
    });

    if (!holiday) {
        return next(new AppError('No holiday found with that ID', 404));
    }

    res.status(200).json({ status: 'success', data: holiday });
});

// 4. UPDATE
exports.updateHoliday = catchAsync(async (req, res, next) => {
    const holiday = await Holiday.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId },
        req.body,
        {
            new: true,
            runValidators: true
        }
    );

    if (!holiday) {
        return next(new AppError('No holiday found with that ID', 404));
    }

    res.status(200).json({ status: 'success', data: holiday });
});

// 5. DELETE (Hard Delete)
exports.deleteHoliday = catchAsync(async (req, res, next) => {
    const holiday = await Holiday.findOneAndDelete({
        _id: req.params.id,
        organizationId: req.user.organizationId
    });

    if (!holiday) {
        return next(new AppError('No holiday found with that ID', 404));
    }

    res.status(204).json({ status: 'success', data: null });
});
// const Holiday = require('../models/holidayModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');

// exports.createHoliday = catchAsync(async (req, res, next) => {
//     const { name, date, branchId, description } = req.body;
//     const existing = await Holiday.findOne({
//         organizationId: req.user.organizationId,
//         branchId: branchId || null,
//         date
//     });
//     if (existing) return next(new AppError('Holiday already exists for this date', 400));
//     const holiday = await Holiday.create({
//         name,
//         date,
//         organizationId: req.user.organizationId,
//         branchId: branchId || null, // Ensure null if undefined
//         description
//     });
//     res.status(201).json({ status: 'success', data: holiday });
// });

// exports.getHolidays = catchAsync(async (req, res, next) => {
//     const { year } = req.query; // ?year=2024
//     const filter = { organizationId: req.user.organizationId };
//     if (year) {
//         filter.date = { $regex: `^${year}` };
//     }
//     const holidays = await Holiday.find(filter).sort({ date: 1 });
//     res.status(200).json({ status: 'success', results: holidays.length, data: holidays });
// });
