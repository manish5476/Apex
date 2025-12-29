const Shift = require('../models/shiftModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.createShift = catchAsync(async (req, res, next) => {
    const { name, startTime, endTime, gracePeriodMins, weeklyOffs } = req.body;

    const shift = await Shift.create({
        name,
        organizationId: req.user.organizationId,
        startTime, // "09:00"
        endTime,   // "18:00"
        gracePeriodMins,
        weeklyOffs // [0, 6] for Sat-Sun off
    });

    res.status(201).json({ status: 'success', data: shift });
});

exports.getAllShifts = catchAsync(async (req, res, next) => {
    const shifts = await Shift.find({ organizationId: req.user.organizationId });
    res.status(200).json({ status: 'success', results: shifts.length, data: shifts });
});
