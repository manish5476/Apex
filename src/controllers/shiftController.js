const Shift = require('../models/shiftModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// 1. CREATE
exports.createShift = catchAsync(async (req, res, next) => {
    const { 
        name, startTime, endTime, gracePeriodMins, 
        halfDayThresholdHrs, minFullDayHrs, 
        isNightShift, weeklyOffs 
    } = req.body;

    const shift = await Shift.create({
        name,
        organizationId: req.user.organizationId,
        startTime, 
        endTime,   
        gracePeriodMins,
        halfDayThresholdHrs,
        minFullDayHrs,
        isNightShift,
        weeklyOffs // e.g., [0] for Sunday
    });

    res.status(201).json({ status: 'success', data: shift });
});

// 2. GET ALL (Active Only)
exports.getAllShifts = catchAsync(async (req, res, next) => {
    const shifts = await Shift.find({ 
        organizationId: req.user.organizationId,
        isActive: true // Filter out soft-deleted shifts
    });
    res.status(200).json({ status: 'success', results: shifts.length, data: shifts });
});

// 3. GET ONE
exports.getShiftById = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOne({ 
        _id: req.params.id, 
        organizationId: req.user.organizationId 
    });

    if (!shift) {
        return next(new AppError('No shift found with that ID', 404));
    }

    res.status(200).json({ status: 'success', data: shift });
});

// 4. UPDATE
exports.updateShift = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId },
        req.body,
        {
            new: true,
            runValidators: true
        }
    );

    if (!shift) {
        return next(new AppError('No shift found with that ID', 404));
    }

    res.status(200).json({ status: 'success', data: shift });
});

// 5. DELETE (Soft Delete - Critical for Audit History)
exports.deleteShift = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId },
        { isActive: false }, // Soft delete
        { new: true }
    );

    if (!shift) {
        return next(new AppError('No shift found with that ID', 404));
    }

    res.status(204).json({ status: 'success', data: null });
});

// const Shift = require('../models/shiftModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');

// exports.createShift = catchAsync(async (req, res, next) => {
//     const { name, startTime, endTime, gracePeriodMins, weeklyOffs } = req.body;
//     const shift = await Shift.create({
//         name,
//         organizationId: req.user.organizationId,
//         startTime, // "09:00"
//         endTime,   // "18:00"
//         gracePeriodMins,
//         weeklyOffs // [0, 6] for Sat-Sun off
//     });

//     res.status(201).json({ status: 'success', data: shift });
// });

// exports.getAllShifts = catchAsync(async (req, res, next) => {
//     const shifts = await Shift.find({ organizationId: req.user.organizationId });
//     res.status(200).json({ status: 'success', results: shifts.length, data: shifts });
// });
