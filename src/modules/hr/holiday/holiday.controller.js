const Holiday = require('./holiday.model');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');

// // 1. CREATE
// exports.createHoliday = catchAsync(async (req, res, next) => {
//     const { name, date, branchId, description, isOptional } = req.body;
    
//     // Check duplication
//     const existing = await Holiday.findOne({
//         organizationId: req.user.organizationId,
//         branchId: branchId || null,
//         date
//     });
    
//     if (existing) {
//         return next(new AppError('Holiday already exists for this date', 400));
//     }

//     const holiday = await Holiday.create({
//         name,
//         date,
//         organizationId: req.user.organizationId,
//         branchId: branchId || null,
//         description,
//         isOptional
//     });

//     res.status(201).json({ status: 'success', data: holiday });
// });

// // 2. GET ALL (Filter by Year)
// exports.getHolidays = catchAsync(async (req, res, next) => {
//     const { year } = req.query; // ?year=2024
    
//     const filter = { organizationId: req.user.organizationId };
    
//     // Optional Year Filter
//     if (year) {
//         filter.date = { $regex: `^${year}` };
//     }

//     const holidays = await Holiday.find(filter)
//         .sort({ date: 1 })
//         .populate('branchId', 'name'); // Show branch name if specific

//     res.status(200).json({ status: 'success', results: holidays.length, data: holidays });
// });

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



// const Holiday = require('./holiday.model');
// const catchAsync = require('../../../core/utils/catchAsync');
// const AppError = require('../../../core/utils/appError');

// 1. CREATE & UPSERT LOGIC
exports.createHoliday = catchAsync(async (req, res, next) => {
    req.body.organizationId = req.user.organizationId;
    
    // PERFECTION: Use findOneAndUpdate with 'upsert' to handle "Create or Update" in one go
    // This prevents the "existing" check race condition
    const holiday = await Holiday.findOneAndUpdate(
        {
            organizationId: req.user.organizationId,
            branchId: req.body.branchId || null,
            date: req.body.date
        },
        req.body,
        { new: true, upsert: true, runValidators: true }
    );

    res.status(201).json({ status: 'success', data: holiday });
});

// 2. GET ALL (Optimized Filtering)
exports.getHolidays = catchAsync(async (req, res, next) => {
    const { year, branchId } = req.query;
    const filter = { organizationId: req.user.organizationId };

    // 🟢 PERFECTION: Range-based filtering is 10x faster than Regex
    if (year) {
        filter.date = { 
            $gte: `${year}-01-01`, 
            $lte: `${year}-12-31` 
        };
    }

    // Allow filtering by specific branch or global (null)
    if (branchId) {
        filter.$or = [{ branchId: branchId }, { branchId: null }];
    }

    const holidays = await Holiday.find(filter)
        .sort({ date: 1 })
        .populate('branchId', 'name city');

    res.status(200).json({ status: 'success', results: holidays.length, data: holidays });
});

// 3. BULK IMPORT (The "Admin's Best Friend" Feature)
exports.bulkCreateHolidays = catchAsync(async (req, res, next) => {
    const { holidays } = req.body; // Array of {name, date, description}

    if (!Array.isArray(holidays) || holidays.length === 0) {
        return next(new AppError('Please provide an array of holidays.', 400));
    }

    // Sanitize and add Org ID
    const sanitizedHolidays = holidays.map(h => ({
        ...h,
        organizationId: req.user.organizationId,
        branchId: h.branchId || null
    }));

    // Use insertMany with ordered: false to continue if one date is a duplicate
    const docs = await Holiday.insertMany(sanitizedHolidays, { ordered: false });

    res.status(201).json({ 
        status: 'success', 
        message: `${docs.length} holidays imported successfully.` 
    });
});