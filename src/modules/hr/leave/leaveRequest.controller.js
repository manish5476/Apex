const LeaveRequest = require('./leave.model');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');

// 1. CREATE LEAVE REQUEST (For Employee)
exports.createLeaveRequest = catchAsync(async (req, res, next) => {
    const { startDate, endDate, leaveType, reason, daysCount } = req.body;
    const userId = req.user._id;
    const orgId = req.user.organizationId;

    // 🟢 PERFECTION: Overlap Check
    // Prevent user from applying if they already have a pending/approved leave for these dates
    const existingLeave = await LeaveRequest.findOne({
        user: userId,
        status: { $in: ['pending', 'approved'] },
        $or: [
            { startDate: { $lte: endDate }, endDate: { $gte: startDate } }
        ]
    });

    if (existingLeave) {
        return next(new AppError('You already have a leave request for these dates.', 400));
    }

    const leave = await LeaveRequest.create({
        user: userId,
        organizationId: orgId,
        leaveType,
        startDate,
        endDate,
        daysCount,
        reason
    });

    res.status(201).json({ status: 'success', data: leave });
});

// 2. GET MY LEAVES (For Employee Profile)
exports.getMyLeaves = catchAsync(async (req, res, next) => {
    const leaves = await LeaveRequest.find({ 
        user: req.user._id,
        organizationId: req.user.organizationId 
    }).sort('-createdAt');

    res.status(200).json({ status: 'success', results: leaves.length, data: leaves });
});

// 3. GET ALL LEAVES (For Admin - with Filtering)
exports.getAllLeaves = catchAsync(async (req, res, next) => {
    const filter = { organizationId: req.user.organizationId };
    
    // Allow filtering by status or user in the query
    if (req.query.status) filter.status = req.query.status;
    if (req.query.user) filter.user = req.query.user;

    const leaves = await LeaveRequest.find(filter)
        .populate('user', 'name email avatar')
        .sort('-createdAt');

    res.status(200).json({ status: 'success', data: leaves });
});

// 4. PROCESS LEAVE (Approve/Reject - For Admin)
exports.processLeave = catchAsync(async (req, res, next) => {
    const { status, rejectionReason } = req.body; // status: 'approved' or 'rejected'
    
    if (!['approved', 'rejected'].includes(status)) {
        return next(new AppError('Invalid status update.', 400));
    }

    const leave = await LeaveRequest.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId, status: 'pending' },
        { 
            status, 
            rejectionReason, 
            approvedBy: req.user._id 
        },
        { new: true, runValidators: true }
    );

    if (!leave) {
        return next(new AppError('Leave request not found or already processed.', 404));
    }

    // 🟢 LOGIC NOTE: Once approved, you would usually trigger a function 
    // to mark these dates as "On Leave" in your Daily Attendance table.

    res.status(200).json({ status: 'success', data: leave });
});

// 5. CANCEL LEAVE (For Employee - only if still pending)
exports.cancelLeave = catchAsync(async (req, res, next) => {
    const leave = await LeaveRequest.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id, status: 'pending' },
        { status: 'cancelled' },
        { new: true }
    );

    if (!leave) {
        return next(new AppError('Request not found or cannot be cancelled.', 404));
    }

    res.status(200).json({ status: 'success', data: leave });
});