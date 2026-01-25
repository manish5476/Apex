const Shift = require('./shift.model');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');

// 1. CREATE - With Conflict Check
exports.createShift = catchAsync(async (req, res, next) => {
    // Check for duplicate name within the same organization
    const existing = await Shift.findOne({
        organizationId: req.user.organizationId,
        name: req.body.name,
        isActive: true
    });
    
    if (existing) {
        return next(new AppError('A shift with this name already exists.', 400));
    }

    req.body.organizationId = req.user.organizationId;
    const shift = await Shift.create(req.body);

    res.status(201).json({ status: 'success', data: shift });
});

// 2. GET ALL - Sorted for UI consistency
exports.getAllShifts = catchAsync(async (req, res, next) => {
    const shifts = await Shift.find({ 
        organizationId: req.user.organizationId,
        isActive: true 
    }).sort('startTime'); // Sort by time so morning shifts appear first
    
    res.status(200).json({ status: 'success', results: shifts.length, data: shifts });
});

// 3. GET ONE - Restored with Tenant Security
exports.getShiftById = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOne({ 
        _id: req.params.id, 
        organizationId: req.user.organizationId 
    });

    if (!shift) {
        return next(new AppError('No shift found or you do not have permission.', 404));
    }

    res.status(200).json({ status: 'success', data: shift });
});

// 4. UPDATE - Protected against ID/Org tampering
exports.updateShift = catchAsync(async (req, res, next) => {
    // Prevent overriding organizationId or ID
    delete req.body.organizationId;
    delete req.body._id;

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

// 5. DELETE - Soft Delete with Security Check
exports.deleteShift = catchAsync(async (req, res, next) => {
    // PERFECTION: Check if this is the only shift before deleting
    // (Optional: You might want to prevent deleting the 'Default' shift)
    
    const shift = await Shift.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId },
        { isActive: false }, 
        { new: true }
    );

    if (!shift) {
        return next(new AppError('No shift found or permission denied.', 404));
    }

    // 204 status means "No Content" - the best way to say "deleted"
    res.status(204).json({ status: 'success', data: null });
});



// const Shift = require('./shift.model');
// const catchAsync = require('../../../core/utils/catchAsync');
// const AppError = require('../../../core/utils/appError');

// // 1. CREATE
// exports.createShift = catchAsync(async (req, res, next) => {
//     const { 
//         name, startTime, endTime, gracePeriodMins, 
//         halfDayThresholdHrs, minFullDayHrs, 
//         isNightShift, weeklyOffs 
//     } = req.body;

//     const shift = await Shift.create({
//         name,
//         organizationId: req.user.organizationId,
//         startTime, 
//         endTime,   
//         gracePeriodMins,
//         halfDayThresholdHrs,
//         minFullDayHrs,
//         isNightShift,
//         weeklyOffs // e.g., [0] for Sunday
//     });

//     res.status(201).json({ status: 'success', data: shift });
// });

// // 2. GET ALL (Active Only)
// exports.getAllShifts = catchAsync(async (req, res, next) => {
//     const shifts = await Shift.find({ 
//         organizationId: req.user.organizationId,
//         isActive: true // Filter out soft-deleted shifts
//     });
//     res.status(200).json({ status: 'success', results: shifts.length, data: shifts });
// });

// // 3. GET ONE
// exports.getShiftById = catchAsync(async (req, res, next) => {
//     const shift = await Shift.findOne({ 
//         _id: req.params.id, 
//         organizationId: req.user.organizationId 
//     });

//     if (!shift) {
//         return next(new AppError('No shift found with that ID', 404));
//     }

//     res.status(200).json({ status: 'success', data: shift });
// });

// // 4. UPDATE
// exports.updateShift = catchAsync(async (req, res, next) => {
//     const shift = await Shift.findOneAndUpdate(
//         { _id: req.params.id, organizationId: req.user.organizationId },
//         req.body,
//         {
//             new: true,
//             runValidators: true
//         }
//     );

//     if (!shift) {
//         return next(new AppError('No shift found with that ID', 404));
//     }

//     res.status(200).json({ status: 'success', data: shift });
// });

// // 5. DELETE (Soft Delete - Critical for Audit History)
// exports.deleteShift = catchAsync(async (req, res, next) => {
//     const shift = await Shift.findOneAndUpdate(
//         { _id: req.params.id, organizationId: req.user.organizationId },
//         { isActive: false }, // Soft delete
//         { new: true }
//     );

//     if (!shift) {
//         return next(new AppError('No shift found with that ID', 404));
//     }

//     res.status(204).json({ status: 'success', data: null });
// });
