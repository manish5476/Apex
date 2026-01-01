const mongoose = require('mongoose');
const AttendanceDaily = require('../models/attendanceDailyModel');
const AttendanceRequest = require('../models/attendanceRequestModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const moment = require('moment'); // APEX FIX: Switched from dayjs

// ---------------------------------------------------------
// 🟢 EMPLOYEE ACTIONS (View & Request)
// ---------------------------------------------------------

/**
 * @desc   Get My Attendance History (with Filters)
 * @route  GET /api/v1/attendance/my-history?month=2023-10
 */
exports.getMyAttendance = catchAsync(async (req, res, next) => {
    const { month, startDate, endDate } = req.query;
    const filter = { user: req.user._id };

    // Date Filtering Logic
    if (month) {
        filter.date = { $regex: `^${month}` }; // Matches "2023-10-01", "2023-10-02"...
    } else if (startDate && endDate) {
        filter.date = { $gte: startDate, $lte: endDate };
    }

    const records = await AttendanceDaily.find(filter)
        .sort({ date: -1 })
        .populate({
            path: 'logs',
            select: 'type timestamp location source' // Show proof of punch
        });

    // Summary Stats for the selected period
    const stats = {
        present: records.filter(r => r.status === 'present').length,
        absent: records.filter(r => r.status === 'absent').length,
        late: records.filter(r => r.isLate).length,
        totalHours: records.reduce((acc, curr) => acc + (curr.totalWorkHours || 0), 0).toFixed(2)
    };

    res.status(200).json({ status: 'success', results: records.length, stats, data: records });
});

/**
 * @desc   Request to Fix Attendance (Regularization)
 * @route  POST /api/v1/attendance/regularize
 */
exports.submitRegularization = catchAsync(async (req, res, next) => {
    const { targetDate, type, newFirstIn, newLastOut, reason } = req.body;

    // 1. Validation using Moment
    if (!moment(targetDate, 'YYYY-MM-DD', true).isValid()) {
        return next(new AppError('Invalid date format YYYY-MM-DD', 400));
    }
    
    // Prevent fixing future dates
    if (moment(targetDate).isAfter(moment(), 'day')) {
        return next(new AppError('Cannot regularize future dates', 400));
    }

    // 2. Check for existing pending request
    const existing = await AttendanceRequest.findOne({ 
        user: req.user._id, 
        targetDate, 
        status: 'pending' 
    });
    if (existing) return next(new AppError('A pending request already exists for this date', 409));

    // 3. Create Request
    const request = await AttendanceRequest.create({
        user: req.user._id,
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        targetDate,
        type,
        correction: {
            newFirstIn: newFirstIn ? new Date(newFirstIn) : undefined,
            newLastOut: newLastOut ? new Date(newLastOut) : undefined,
            reason
        }
    });

    res.status(201).json({ status: 'success', message: 'Request submitted to manager', data: request });
});


// ---------------------------------------------------------
// 🔴 MANAGER/ADMIN ACTIONS (Approve & Reject)
// ---------------------------------------------------------

/**
 * @desc   Approve/Reject Regularization
 * @route  PATCH /api/v1/attendance/regularize/:id
 */
exports.decideRegularization = catchAsync(async (req, res, next) => {
    const { status, rejectionReason } = req.body; // status = 'approved' or 'rejected'
    const requestId = req.params.id;

    // 1. Find Request
    const request = await AttendanceRequest.findById(requestId);
    if (!request) return next(new AppError('Request not found', 404));
    if (request.status !== 'pending') return next(new AppError('Request already processed', 400));

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // A. Update Request Status
        request.status = status;
        request.approvedBy = req.user._id;
        request.approvedAt = new Date();
        if (status === 'rejected') {
            request.rejectionReason = rejectionReason || 'No reason provided';
        }
        await request.save({ session });

        // B. If Approved, Update the Ledger (AttendanceDaily)
        if (status === 'approved') {
            let daily = await AttendanceDaily.findOne({
                user: request.user,
                date: request.targetDate
            }).session(session);

            // If no record existed (User was completely absent), create one
            if (!daily) {
                daily = new AttendanceDaily({
                    user: request.user,
                    organizationId: request.organizationId,
                    date: request.targetDate,
                    status: 'present' // Default to present on fix
                });
            }

            // Apply Corrections
            if (request.correction.newFirstIn) daily.firstIn = request.correction.newFirstIn;
            if (request.correction.newLastOut) daily.lastOut = request.correction.newLastOut;

            // 🔴 CRITICAL: Recalculate Hours
            if (daily.firstIn && daily.lastOut) {
                const diffMs = new Date(daily.lastOut) - new Date(daily.firstIn);
                daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                daily.status = 'present'; // Force status to present
            }

            await daily.save({ session });
        }

        await session.commitTransaction();
        res.status(200).json({ status: 'success', data: request });

    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});

/**
 * @desc   Get All Pending Requests (For Managers)
 * @route  GET /api/v1/attendance/requests/pending
 */
exports.getPendingRequests = catchAsync(async (req, res, next) => {
    const requests = await AttendanceRequest.find({ 
        organizationId: req.user.organizationId,
        status: 'pending'
    })
    .populate('user', 'name email avatar')
    .sort({ createdAt: 1 }); // Oldest first

    res.status(200).json({ status: 'success', results: requests.length, data: requests });
});