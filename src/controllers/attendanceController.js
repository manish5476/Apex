// controllers/attendanceController.js
const mongoose = require('mongoose');
const AttendanceDaily = require('../models/attendanceDailyModel');
const AttendanceRequest = require('../models/attendanceRequestModel');
const AttendanceLog = require('../models/attendanceLogModel');
const AttendanceMachine = require('../models/attendanceMachineModel');
const Shift = require('../models/shiftModel');
const Holiday = require('../models/holidayModel');
const User = require('../models/userModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const dayjs = require('dayjs');
const { emitToUser, emitToOrg, emitToUsers } = require('../utils/socket');

// ---------------------------------------------------------
// 🟢 EMPLOYEE ACTIONS
// ---------------------------------------------------------

/**
 * @desc   Get My Attendance History with Real-time Updates
 * @route  GET /api/v1/attendance/my-history
 */
exports.getMyAttendance = catchAsync(async (req, res, next) => {
    const { month, startDate, endDate, limit = 30, page = 1 } = req.query;
    const filter = { user: req.user._id };
    
    // Date filtering
    if (month) {
        filter.date = { $regex: `^${month}` };
    } else if (startDate && endDate) {
        filter.date = { $gte: startDate, $lte: endDate };
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [records, total] = await Promise.all([
        AttendanceDaily.find(filter)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('logs', 'type timestamp location source')
            .populate('shiftId', 'name startTime endTime')
            .lean(),
        AttendanceDaily.countDocuments(filter)
    ]);
    
    // Summary stats using aggregation for performance
    const stats = await AttendanceDaily.aggregate([
        { $match: filter },
        { $group: {
            _id: null,
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            late: { $sum: { $cond: ['$isLate', 1, 0] } },
            halfDay: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
            totalHours: { $sum: '$totalWorkHours' },
            overtimeHours: { $sum: '$overtimeHours' }
        }}
    ]);
    
    // Emit real-time subscription event
    if (req.query.subscribe === 'true') {
        emitToUser(req.user._id, 'attendance:subscribed', { 
            filter: { month, startDate, endDate },
            subscribedAt: new Date()
        });
    }
    
    res.status(200).json({
        status: 'success',
        results: records.length,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        stats: stats[0] || { present: 0, absent: 0, late: 0, halfDay: 0, totalHours: 0, overtimeHours: 0 },
        data: records
    });
});


/**
 * @desc   Get my regularization requests
 * @route  GET /api/v1/attendance/my-requests
 */
exports.getMyRequests = catchAsync(async (req, res, next) => {
    const { status, startDate, endDate, limit = 20, page = 1 } = req.query;
    
    const filter = { user: req.user._id };
    
    if (status) filter.status = status;
    if (startDate && endDate) {
        filter.targetDate = { $gte: startDate, $lte: endDate };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [requests, total] = await Promise.all([
        AttendanceRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('approvedBy', 'name email')
            .lean(),
        AttendanceRequest.countDocuments(filter)
    ]);
    
    res.status(200).json({
        status: 'success',
        results: requests.length,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        data: requests
    });
});

/**
 * @desc   Submit Regularization Request with Notifications
 * @route  POST /api/v1/attendance/regularize
 */
exports.submitRegularization = catchAsync(async (req, res, next) => {
    const { targetDate, type, newFirstIn, newLastOut, reason, supportingDocs, urgency = 'medium' } = req.body;
    
    // Validation
    if (!dayjs(targetDate, 'YYYY-MM-DD', true).isValid()) {
        return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
    }
    
    if (dayjs(targetDate).isAfter(dayjs(), 'day')) {
        return next(new AppError('Cannot regularize future dates', 400));
    }
    
    // Check if target date is too old (e.g., older than 30 days)
    const daysDiff = dayjs().diff(dayjs(targetDate), 'day');
    if (daysDiff > 30) {
        return next(new AppError('Cannot regularize dates older than 30 days', 400));
    }
    
    // Check for existing pending request
    const existing = await AttendanceRequest.findOne({
        user: req.user._id,
        targetDate,
        status: { $in: ['draft', 'pending', 'under_review'] }
    });
    
    if (existing) {
        return next(new AppError('A pending request already exists for this date', 409));
    }
    
    // Get user's managers for approval chain
    const user = await User.findById(req.user._id).populate('manager', 'name email');
    const approvalRequired = user.manager ? 1 : 0; // Simple approval chain
    
    // Create request
    const request = await AttendanceRequest.create({
        user: req.user._id,
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        targetDate,
        type,
        correction: {
            newFirstIn: newFirstIn ? new Date(newFirstIn) : undefined,
            newLastOut: newLastOut ? new Date(newLastOut) : undefined,
            reason,
            supportingDocs
        },
        urgency,
        approvalRequired,
        approvers: user.manager ? [{
            user: user.manager._id,
            status: 'pending'
        }] : [],
        history: [{
            action: 'created',
            by: req.user._id,
            remarks: 'Request submitted'
        }]
    });
    
    // Real-time notifications
    emitToUser(req.user._id, 'attendance:request:created', {
        requestId: request._id,
        targetDate,
        type,
        createdAt: request.createdAt
    });
    
    // Notify manager
    if (user.manager) {
        emitToUser(user.manager._id, 'attendance:request:pending', {
            requestId: request._id,
            userId: req.user._id,
            userName: req.user.name,
            targetDate,
            type,
            urgency
        });
    }
    
    // Notify HR/admins in organization
    emitToOrg(req.user.organizationId, 'attendance:request:new', {
        requestId: request._id,
        userId: req.user._id,
        targetDate,
        type
    });
    
    res.status(201).json({
        status: 'success',
        message: 'Regularization request submitted successfully',
        data: request
    });
});

// ==================== EXPORT & REPORTS ====================

/**
 * @desc   Export attendance data to Excel/CSV
 * @route  GET /api/v1/attendance/export
 */
exports.exportAttendance = catchAsync(async (req, res, next) => {
    const { startDate, endDate, branchId, department, format = 'excel' } = req.query;
    
    const filter = {
        organizationId: req.user.organizationId,
        date: { 
            $gte: startDate || dayjs().startOf('month').format('YYYY-MM-DD'),
            $lte: endDate || dayjs().format('YYYY-MM-DD')
        }
    };
    
    if (branchId) filter.branchId = branchId;
    
    // Get users for department filter
    if (department) {
        const users = await User.find({ 
            department, 
            organizationId: req.user.organizationId 
        }).select('_id');
        filter.user = { $in: users.map(u => u._id) };
    }
    
    // Get attendance data with user details
    const attendanceData = await AttendanceDaily.find(filter)
        .populate('user', 'name email employeeId department position')
        .populate('shiftId', 'name startTime endTime')
        .sort({ date: -1, 'user.name': 1 })
        .lean();
    
    if (format === 'csv') {
        // Generate CSV
        const csvData = generateCSV(attendanceData);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${dayjs().format('YYYYMMDD')}.csv`);
        
        return res.send(csvData);
    } else {
        // Generate Excel (you'll need ExcelJS package)
        const workbook = await generateExcel(attendanceData);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${dayjs().format('YYYYMMDD')}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
    }
});

/**
 * @desc   Get monthly attendance report
 * @route  GET /api/v1/attendance/reports/monthly
 */
exports.getMonthlyReport = catchAsync(async (req, res, next) => {
    const { month = dayjs().format('YYYY-MM'), branchId, department } = req.query;
    
    const startOfMonth = dayjs(month).startOf('month').format('YYYY-MM-DD');
    const endOfMonth = dayjs(month).endOf('month').format('YYYY-MM-DD');
    
    const filter = {
        organizationId: req.user.organizationId,
        date: { $gte: startOfMonth, $lte: endOfMonth }
    };
    
    if (branchId) filter.branchId = branchId;
    
    // Get users for department filter
    if (department) {
        const users = await User.find({ 
            department, 
            organizationId: req.user.organizationId 
        }).select('_id name email employeeId department position');
        filter.user = { $in: users.map(u => u._id) };
    } else {
        // Get all active users
        var users = await User.find({ 
            organizationId: req.user.organizationId,
            status: 'active'
        }).select('_id name email employeeId department position');
    }
    
    // Get attendance data
    const attendanceData = await AttendanceDaily.find(filter)
        .populate('user', 'name email department position')
        .lean();
    
    // Create attendance map for easy lookup
    const attendanceMap = new Map();
    attendanceData.forEach(record => {
        const key = `${record.user._id}_${record.date}`;
        attendanceMap.set(key, record);
    });
    
    // Generate report by user
    const userReports = users.map(user => {
        let presentDays = 0;
        let absentDays = 0;
        let lateDays = 0;
        let halfDays = 0;
        let leaveDays = 0;
        let totalHours = 0;
        
        // Loop through all days in month
        const startDate = dayjs(startOfMonth);
        const endDate = dayjs(endOfMonth);
        const daysInMonth = endDate.diff(startDate, 'day') + 1;
        
        for (let i = 0; i < daysInMonth; i++) {
            const currentDate = startDate.add(i, 'day').format('YYYY-MM-DD');
            const key = `${user._id}_${currentDate}`;
            const record = attendanceMap.get(key);
            
            if (record) {
                switch (record.status) {
                    case 'present':
                        presentDays++;
                        if (record.isLate) lateDays++;
                        if (record.isHalfDay) halfDays++;
                        totalHours += record.totalWorkHours || 0;
                        break;
                    case 'absent':
                        absentDays++;
                        break;
                    case 'on_leave':
                        leaveDays++;
                        break;
                    case 'half_day':
                        halfDays++;
                        presentDays += 0.5;
                        totalHours += record.totalWorkHours || 0;
                        break;
                }
            } else {
                // Check if it's a weekend or holiday
                const dayOfWeek = dayjs(currentDate).day();
                // Assuming 0=Sunday, 6=Saturday are weekends
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    // Weekend - not counted
                } else {
                    absentDays++;
                }
            }
        }
        
        const attendanceRate = daysInMonth > 0 ? (presentDays / daysInMonth) * 100 : 0;
        
        return {
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                employeeId: user.employeeId,
                department: user.department,
                position: user.position
            },
            summary: {
                presentDays,
                absentDays,
                lateDays,
                halfDays,
                leaveDays,
                totalHours: totalHours.toFixed(2),
                attendanceRate: attendanceRate.toFixed(2),
                workingDays: daysInMonth
            }
        };
    });
    
    // Overall summary
    const overallSummary = {
        totalEmployees: users.length,
        totalWorkingDays: dayjs(endOfMonth).diff(dayjs(startOfMonth), 'day') + 1,
        averageAttendanceRate: userReports.reduce((acc, curr) => acc + parseFloat(curr.summary.attendanceRate), 0) / userReports.length,
        totalPresentDays: userReports.reduce((acc, curr) => acc + curr.summary.presentDays, 0),
        totalAbsentDays: userReports.reduce((acc, curr) => acc + curr.summary.absentDays, 0),
        totalLateOccurrences: userReports.reduce((acc, curr) => acc + curr.summary.lateDays, 0),
        totalLeaveDays: userReports.reduce((acc, curr) => acc + curr.summary.leaveDays, 0)
    };
    
    res.status(200).json({
        status: 'success',
        data: {
            period: { startDate: startOfMonth, endDate: endOfMonth, month },
            overallSummary,
            userReports,
            generatedAt: new Date()
        }
    });
});

/**
 * @desc   Get advanced attendance analytics
 * @route  GET /api/v1/attendance/analytics
 */
exports.getAnalytics = catchAsync(async (req, res, next) => {
    const { startDate, endDate, branchId, department } = req.query;
    
    const filter = {
        organizationId: req.user.organizationId,
        date: { 
            $gte: startDate || dayjs().subtract(30, 'days').format('YYYY-MM-DD'),
            $lte: endDate || dayjs().format('YYYY-MM-DD')
        }
    };
    
    if (branchId) filter.branchId = branchId;
    
    // Get users for department filter
    if (department) {
        const users = await User.find({ 
            department, 
            organizationId: req.user.organizationId 
        }).select('_id');
        filter.user = { $in: users.map(u => u._id) };
    }
    
    // 1. Daily trends
    const dailyTrends = await AttendanceDaily.aggregate([
        { $match: filter },
        { $group: {
            _id: '$date',
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            late: { $sum: { $cond: ['$isLate', 1, 0] } },
            halfDay: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
            total: { $sum: 1 },
            avgHours: { $avg: '$totalWorkHours' }
        }},
        { $sort: { _id: 1 } }
    ]);
    
    // 2. Department-wise analytics
    const departmentAnalytics = await AttendanceDaily.aggregate([
        { $match: filter },
        { $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo'
        }},
        { $unwind: '$userInfo' },
        { $group: {
            _id: '$userInfo.department',
            totalEmployees: { $addToSet: '$user' },
            presentDays: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            totalDays: { $sum: 1 },
            lateCount: { $sum: { $cond: ['$isLate', 1, 0] } },
            avgHours: { $avg: '$totalWorkHours' }
        }},
        { $project: {
            department: '$_id',
            employeeCount: { $size: '$totalEmployees' },
            attendanceRate: { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] },
            latePercentage: { $multiply: [{ $divide: ['$lateCount', '$totalDays'] }, 100] },
            avgHoursPerDay: { $round: ['$avgHours', 2] },
            _id: 0
        }},
        { $sort: { attendanceRate: -1 } }
    ]);
    
    // 3. Time-based patterns
    const timePatterns = await AttendanceDaily.aggregate([
        { $match: { ...filter, firstIn: { $exists: true, $ne: null } } },
        { $project: {
            hour: { $hour: '$firstIn' },
            minute: { $minute: '$firstIn' },
            dayOfWeek: { $dayOfWeek: '$firstIn' }
        }},
        { $group: {
            _id: '$hour',
            count: { $sum: 1 },
            avgMinute: { $avg: '$minute' }
        }},
        { $sort: { _id: 1 } }
    ]);
    
    // 4. Top performers and concerns
    const employeeStats = await AttendanceDaily.aggregate([
        { $match: filter },
        { $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo'
        }},
        { $unwind: '$userInfo' },
        { $group: {
            _id: '$user',
            name: { $first: '$userInfo.name' },
            department: { $first: '$userInfo.department' },
            presentDays: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            totalDays: { $sum: 1 },
            lateCount: { $sum: { $cond: ['$isLate', 1, 0] } },
            avgHours: { $avg: '$totalWorkHours' }
        }},
        { $project: {
            user: '$_id',
            name: 1,
            department: 1,
            attendanceRate: { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] },
            latePercentage: { $multiply: [{ $divide: ['$lateCount', '$totalDays'] }, 100] },
            avgHoursPerDay: { $round: ['$avgHours', 2] },
            performanceScore: {
                $add: [
                    { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 70] }, // 70% weight for attendance
                    { $multiply: [{ $subtract: [1, { $divide: ['$lateCount', { $max: ['$totalDays', 1] }] }] }, 20] }, // 20% for punctuality
                    { $multiply: [{ $divide: ['$avgHours', 8] }, 10] } // 10% for hours worked
                ]
            }
        }},
        { $sort: { performanceScore: -1 } },
        { $limit: 20 }
    ]);
    
    // 5. Late pattern analysis
    const latePatterns = await AttendanceDaily.aggregate([
        { $match: { ...filter, isLate: true } },
        { $group: {
            _id: {
                user: '$user',
                dayOfWeek: { $dayOfWeek: { $toDate: { $concat: ['$date', 'T00:00:00.000Z'] } } }
            },
            count: { $sum: 1 }
        }},
        { $lookup: {
            from: 'users',
            localField: '_id.user',
            foreignField: '_id',
            as: 'userInfo'
        }},
        { $unwind: '$userInfo' },
        { $group: {
            _id: '$_id.dayOfWeek',
            totalLate: { $sum: '$count' },
            affectedEmployees: { $addToSet: '$userInfo.name' }
        }},
        { $sort: { totalLate: -1 } }
    ]);
    
    res.status(200).json({
        status: 'success',
        data: {
            period: { startDate: filter.date.$gte, endDate: filter.date.$lte },
            dailyTrends,
            departmentAnalytics,
            timePatterns,
            employeeStats,
            latePatterns,
            summary: {
                totalDaysAnalyzed: dailyTrends.length,
                averageAttendanceRate: departmentAnalytics.reduce((acc, curr) => acc + curr.attendanceRate, 0) / departmentAnalytics.length,
                mostPunctualDepartment: departmentAnalytics[0] || null,
                leastPunctualDepartment: departmentAnalytics[departmentAnalytics.length - 1] || null,
                topPerformer: employeeStats[0] || null
            }
        }
    });
});

/**
 * @desc   Get comprehensive dashboard data
 * @route  GET /api/v1/attendance/dashboard
 */
exports.getDashboard = catchAsync(async (req, res, next) => {
    const today = dayjs().format('YYYY-MM-DD');
    const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD');
    const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
    
    // 1. Today's overview
    const todayFilter = {
        organizationId: req.user.organizationId,
        date: today
    };
    
    const todayStats = await AttendanceDaily.aggregate([
        { $match: todayFilter },
        { $group: {
            _id: null,
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            late: { $sum: { $cond: ['$isLate', 1, 0] } },
            onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
            checkedIn: { $sum: { $cond: [{ $ne: ['$firstIn', null] }, 1, 0] } }
        }}
    ]);
    
    // 2. Weekly trends
    const weekFilter = {
        organizationId: req.user.organizationId,
        date: { $gte: startOfWeek, $lte: today }
    };
    
    const weeklyTrends = await AttendanceDaily.aggregate([
        { $match: weekFilter },
        { $group: {
            _id: '$date',
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            total: { $sum: 1 },
            avgHours: { $avg: '$totalWorkHours' }
        }},
        { $sort: { _id: 1 } }
    ]);
    
    // 3. Monthly summary
    const monthFilter = {
        organizationId: req.user.organizationId,
        date: { $gte: startOfMonth, $lte: today }
    };
    
    const monthlyStats = await AttendanceDaily.aggregate([
        { $match: monthFilter },
        { $group: {
            _id: null,
            totalDays: { $sum: 1 },
            presentDays: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            lateDays: { $sum: { $cond: ['$isLate', 1, 0] } },
            totalHours: { $sum: '$totalWorkHours' },
            avgHoursPerDay: { $avg: '$totalWorkHours' }
        }}
    ]);
    
    // 4. Pending requests
    const pendingRequests = await AttendanceRequest.countDocuments({
        organizationId: req.user.organizationId,
        status: { $in: ['pending', 'under_review'] }
    });
    
    // 5. Recent activities
    const recentActivities = await AttendanceLog.find({
        organizationId: req.user.organizationId,
        timestamp: { $gte: dayjs().subtract(24, 'hours').toDate() }
    })
    .populate('user', 'name')
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();
    
    // 6. Department-wise today
    const departmentToday = await AttendanceDaily.aggregate([
        { $match: todayFilter },
        { $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo'
        }},
        { $unwind: '$userInfo' },
        { $group: {
            _id: '$userInfo.department',
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            total: { $sum: 1 }
        }},
        { $project: {
            department: '$_id',
            attendanceRate: { $multiply: [{ $divide: ['$present', '$total'] }, 100] },
            _id: 0
        }},
        { $sort: { attendanceRate: -1 } }
    ]);
    
    // 7. Upcoming holidays
    const upcomingHolidays = await Holiday.find({
        organizationId: req.user.organizationId,
        date: { $gte: today, $lte: dayjs().add(30, 'days').format('YYYY-MM-DD') }
    })
    .sort({ date: 1 })
    .limit(5)
    .lean();
    
    res.status(200).json({
        status: 'success',
        data: {
            today: {
                date: today,
                stats: todayStats[0] || { total: 0, present: 0, absent: 0, late: 0, onLeave: 0, checkedIn: 0 },
                departmentBreakdown: departmentToday
            },
            week: {
                startDate: startOfWeek,
                endDate: today,
                trends: weeklyTrends,
                summary: {
                    days: weeklyTrends.length,
                    averageAttendance: weeklyTrends.reduce((acc, curr) => acc + (curr.present/curr.total), 0) / weeklyTrends.length
                }
            },
            month: {
                startDate: startOfMonth,
                endDate: today,
                stats: monthlyStats[0] || { totalDays: 0, presentDays: 0, lateDays: 0, totalHours: 0, avgHoursPerDay: 0 }
            },
            alerts: {
                pendingRequests,
                lowAttendanceDepartments: departmentToday.filter(dept => dept.attendanceRate < 70),
                recentLateArrivals: recentActivities.filter(act => act.type === 'in' && act.isLate)
            },
            recentActivities: recentActivities.map(act => ({
                id: act._id,
                user: act.user?.name || 'Unknown',
                type: act.type,
                time: dayjs(act.timestamp).format('HH:mm'),
                source: act.source
            })),
            upcomingHolidays: upcomingHolidays.map(holiday => ({
                id: holiday._id,
                name: holiday.name,
                date: holiday.date,
                description: holiday.description
            })),
            lastUpdated: new Date()
        }
    });
});

// ==================== HELPER FUNCTIONS FOR EXPORT ====================

/**
 * Generate CSV from attendance data
 */
function generateCSV(attendanceData) {
    const headers = [
        'Date',
        'Employee ID',
        'Employee Name',
        'Department',
        'Position',
        'Shift',
        'First In',
        'Last Out',
        'Total Hours',
        'Status',
        'Late',
        'Half Day',
        'Overtime',
        'Remarks'
    ];
    
    const rows = attendanceData.map(record => [
        record.date,
        record.user?.employeeId || '',
        record.user?.name || '',
        record.user?.department || '',
        record.user?.position || '',
        record.shiftId?.name || '',
        record.firstIn ? dayjs(record.firstIn).format('HH:mm') : '',
        record.lastOut ? dayjs(record.lastOut).format('HH:mm') : '',
        record.totalWorkHours || 0,
        record.status,
        record.isLate ? 'Yes' : 'No',
        record.isHalfDay ? 'Yes' : 'No',
        record.isOvertime ? 'Yes' : 'No',
        record.remarks || ''
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csvContent;
}

/**
 * Generate Excel from attendance data (requires ExcelJS)
 */
async function generateExcel(attendanceData) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');
    
    // Add headers
    worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Employee Name', key: 'employeeName', width: 25 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Position', key: 'position', width: 20 },
        { header: 'Shift', key: 'shift', width: 15 },
        { header: 'First In', key: 'firstIn', width: 12 },
        { header: 'Last Out', key: 'lastOut', width: 12 },
        { header: 'Total Hours', key: 'totalHours', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Late', key: 'isLate', width: 8 },
        { header: 'Half Day', key: 'isHalfDay', width: 10 },
        { header: 'Overtime', key: 'isOvertime', width: 10 },
        { header: 'Remarks', key: 'remarks', width: 30 }
    ];
    
    // Add data rows
    attendanceData.forEach(record => {
        worksheet.addRow({
            date: record.date,
            employeeId: record.user?.employeeId || '',
            employeeName: record.user?.name || '',
            department: record.user?.department || '',
            position: record.user?.position || '',
            shift: record.shiftId?.name || '',
            firstIn: record.firstIn ? dayjs(record.firstIn).format('HH:mm') : '',
            lastOut: record.lastOut ? dayjs(record.lastOut).format('HH:mm') : '',
            totalHours: record.totalWorkHours || 0,
            status: record.status,
            isLate: record.isLate ? 'Yes' : 'No',
            isHalfDay: record.isHalfDay ? 'Yes' : 'No',
            isOvertime: record.isOvertime ? 'Yes' : 'No',
            remarks: record.remarks || ''
        });
    });
    
    // Apply formatting
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    
    return workbook;
}

// ---------------------------------------------------------
// 🔴 MANAGER/ADMIN ACTIONS
// ---------------------------------------------------------

/**
 * @desc   Approve/Reject Regularization with Multi-level Approval
 * @route  PATCH /api/v1/attendance/regularize/:id
 */
exports.decideRegularization = catchAsync(async (req, res, next) => {
    const { status, comments, rejectionReason } = req.body;
    const requestId = req.params.id;
    
    if (!['approved', 'rejected'].includes(status)) {
        return next(new AppError('Invalid status. Use "approved" or "rejected"', 400));
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Find request with approval chain
        const request = await AttendanceRequest.findById(requestId).session(session);
        if (!request) {
            return next(new AppError('Request not found', 404));
        }
        
        if (!['pending', 'under_review'].includes(request.status)) {
            return next(new AppError('Request already processed', 400));
        }
        
        // Check if user has permission to approve
        const canApprove = request.approvers.some(
            approver => String(approver.user) === String(req.user._id) && approver.status === 'pending'
        );
        
        // Check if user is admin/owner or has permission via role
        const isAdminOrOwner = ['admin', 'owner'].includes(req.user.role);
        const isSuperAdmin = req.user.isSuperAdmin;
        
        if (!canApprove && !isAdminOrOwner && !isSuperAdmin) {
            return next(new AppError('You are not authorized to approve this request', 403));
        }
        
        // Update approver status
        const approverIndex = request.approvers.findIndex(
            a => String(a.user) === String(req.user._id)
        );
        
        if (approverIndex !== -1) {
            request.approvers[approverIndex].status = status === 'approved' ? 'approved' : 'rejected';
            request.approvers[approverIndex].comments = comments;
            request.approvers[approverIndex].actedAt = new Date();
        } else if (isAdminOrOwner || isSuperAdmin) {
            // Admin/owner can approve even if not in approvers list
            request.approvers.push({
                user: req.user._id,
                status: status === 'approved' ? 'approved' : 'rejected',
                comments: comments,
                actedAt: new Date(),
                isAdminOverride: true
            });
        }
        
        // Check if all approvals done
        const pendingApprovers = request.approvers.filter(a => a.status === 'pending');
        const rejectedApprover = request.approvers.find(a => a.status === 'rejected');
        
        if (rejectedApprover) {
            request.status = 'rejected';
            request.rejectionReason = rejectionReason || comments || 'Rejected by approver';
        } else if (pendingApprovers.length === 0) {
            request.status = 'approved';
            request.approvedBy = req.user._id;
            request.approvedAt = new Date();
        } else {
            request.status = 'under_review';
            request.currentApproverLevel = request.currentApproverLevel + 1;
        }
        
        // Add to history
        request.history.push({
            action: status === 'approved' ? 'approved' : 'rejected',
            by: req.user._id,
            remarks: comments,
            oldStatus: request.status,
            newStatus: status
        });
        
        await request.save({ session });
        
        // If approved, update attendance record
        if (request.status === 'approved') {
            let daily = await AttendanceDaily.findOne({
                user: request.user,
                date: request.targetDate
            }).session(session);
            
            if (!daily) {
                daily = new AttendanceDaily({
                    user: request.user,
                    organizationId: request.organizationId,
                    branchId: request.branchId,
                    date: request.targetDate,
                    status: 'present',
                    verifiedBy: req.user._id,
                    verifiedAt: new Date()
                });
            }
            
            // Apply corrections
            if (request.correction.newFirstIn) {
                daily.firstIn = request.correction.newFirstIn;
                
                // Create correction log
                const correctionLog = new AttendanceLog({
                    source: 'admin_manual',
                    user: request.user,
                    organizationId: request.organizationId,
                    branchId: request.branchId,
                    timestamp: request.correction.newFirstIn,
                    type: 'in',
                    isVerified: true,
                    verificationMethod: 'manager',
                    verifiedBy: req.user._id,
                    processingStatus: 'corrected',
                    processingNotes: `Corrected via regularization request ${request._id}`,
                    rawData: { requestId: request._id }
                });
                await correctionLog.save({ session });
                daily.logs.push(correctionLog._id);
            }
            
            if (request.correction.newLastOut) {
                daily.lastOut = request.correction.newLastOut;
                
                // Create correction log
                const correctionLog = new AttendanceLog({
                    source: 'admin_manual',
                    user: request.user,
                    organizationId: request.organizationId,
                    branchId: request.branchId,
                    timestamp: request.correction.newLastOut,
                    type: 'out',
                    isVerified: true,
                    verificationMethod: 'manager',
                    verifiedBy: req.user._id,
                    processingStatus: 'corrected',
                    processingNotes: `Corrected via regularization request ${request._id}`,
                    rawData: { requestId: request._id }
                });
                await correctionLog.save({ session });
                daily.logs.push(correctionLog._id);
            }
            
            // Recalculate hours
            if (daily.firstIn && daily.lastOut) {
                const diffMs = new Date(daily.lastOut) - new Date(daily.firstIn);
                daily.totalWorkHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
            }
            
            await daily.save({ session });
        }
        
        await session.commitTransaction();
        
        // Real-time notifications
        emitToUser(request.user, 'attendance:request:updated', {
            requestId: request._id,
            status: request.status,
            actionBy: req.user._id,
            comments
        });
        
        // Notify next approvers if any
        if (request.status === 'under_review') {
            const nextApprovers = request.approvers.filter(a => a.status === 'pending');
            nextApprovers.forEach(approver => {
                emitToUser(approver.user, 'attendance:request:pending', {
                    requestId: request._id,
                    userId: request.user,
                    targetDate: request.targetDate,
                    type: request.type,
                    currentLevel: request.currentApproverLevel
                });
            });
        }
        
        res.status(200).json({
            status: 'success',
            message: `Request ${request.status}`,
            data: request
        });
        
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});

/**
 * @desc   Get Pending Requests with Real-time Updates
 * @route  GET /api/v1/attendance/requests/pending
 */
exports.getPendingRequests = catchAsync(async (req, res, next) => {
    const { branchId, department, startDate, endDate, type, limit = 50, page = 1 } = req.query;
    const filter = {
        organizationId: req.user.organizationId,
        status: { $in: ['pending', 'under_review'] }
    };
    
    if (branchId) filter.branchId = branchId;
    if (type) filter.type = type;
    if (startDate && endDate) {
        filter.targetDate = { $gte: startDate, $lte: endDate };
    }
    
    // Check if user is an approver or admin
    const isAdminOrOwner = ['admin', 'owner'].includes(req.user.role);
    const isSuperAdmin = req.user.isSuperAdmin;
    
    if (!isAdminOrOwner && !isSuperAdmin) {
        filter['approvers.user'] = req.user._id;
        filter['approvers.status'] = 'pending';
    }
    
    // Department filter
    if (department) {
        const users = await User.find({ department, organizationId: req.user.organizationId }).select('_id');
        filter.user = { $in: users.map(u => u._id) };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [requests, total] = await Promise.all([
        AttendanceRequest.find(filter)
            .populate('user', 'name email avatar department position')
            .populate('approvers.user', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        AttendanceRequest.countDocuments(filter)
    ]);
    
    // Subscribe to real-time updates for this filter
    const subscriptionId = `attendance:requests:${req.user._id}:${Date.now()}`;
    
    res.status(200).json({
        status: 'success',
        results: requests.length,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        subscriptionId,
        data: requests
    });
});

/**
 * @desc   Get Team Attendance
 * @route  GET /api/v1/attendance/team
 */
exports.getTeamAttendance = catchAsync(async (req, res, next) => {
    const { date = dayjs().format('YYYY-MM-DD'), 
            department, 
            branchId, 
            includeSubordinates = 'true' } = req.query;
    
    const filter = {
        organizationId: req.user.organizationId,
        date
    };
    
    if (branchId) filter.branchId = branchId;
    
    // Get team members based on user's role
    let userFilter = { organizationId: req.user.organizationId };
    
    // For managers, get their team members
    if (req.user.role === 'manager' || req.user.isManager) {
        userFilter.manager = req.user._id;
        
        if (includeSubordinates === 'true') {
            // Get all subordinates recursively
            const getAllSubordinates = async (managerId) => {
                const directReports = await User.find({ manager: managerId }).select('_id');
                let allReports = [...directReports];
                
                for (const report of directReports) {
                    const subReports = await getAllSubordinates(report._id);
                    allReports = [...allReports, ...subReports];
                }
                
                return allReports;
            };
            
            const subordinates = await getAllSubordinates(req.user._id);
            userFilter = { _id: { $in: subordinates.map(s => s._id) } };
        }
    }
    
    if (department) userFilter.department = department;
    
    const teamMembers = await User.find(userFilter).select('_id name email department position');
    const memberIds = teamMembers.map(m => m._id);
    
    filter.user = { $in: memberIds };
    
    const attendance = await AttendanceDaily.find(filter)
        .populate('user', 'name email department position avatar')
        .populate('logs', 'type timestamp source')
        .sort({ 'user.name': 1 })
        .lean();
    
    // Fill in missing records for team members without attendance
    const attendanceMap = new Map();
    attendance.forEach(a => attendanceMap.set(String(a.user._id), a));
    
    const completeData = teamMembers.map(member => {
        const record = attendanceMap.get(String(member._id));
        return record || {
            user: member,
            date,
            status: 'absent',
            totalWorkHours: 0,
            isLate: false,
            logs: []
        };
    });
    
    res.status(200).json({
        status: 'success',
        date,
        totalMembers: teamMembers.length,
        data: completeData
    });
});

// ---------------------------------------------------------
// 📊 REPORTS & ANALYTICS
// ---------------------------------------------------------

/**
 * @desc   Get Attendance Summary Dashboard
 * @route  GET /api/v1/attendance/summary
 */
exports.getAttendanceSummary = catchAsync(async (req, res, next) => {
    const { branchId, department, startDate, endDate } = req.query;
    
    const filter = {
        organizationId: req.user.organizationId,
        date: { 
            $gte: startDate || dayjs().startOf('month').format('YYYY-MM-DD'), 
            $lte: endDate || dayjs().format('YYYY-MM-DD') 
        }
    };
    
    if (branchId) filter.branchId = branchId;
    
    // Get users for department filter
    if (department) {
        const users = await User.find({ 
            department, 
            organizationId: req.user.organizationId 
        }).select('_id');
        filter.user = { $in: users.map(u => u._id) };
    }
    
    // Aggregate statistics
    const summary = await AttendanceDaily.aggregate([
        { $match: filter },
        { $group: {
            _id: null,
            totalEmployees: { $addToSet: '$user' },
            totalDays: { $sum: 1 },
            presentDays: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            absentDays: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            lateDays: { $sum: { $cond: ['$isLate', 1, 0] } },
            halfDays: { $sum: { $cond: ['$isHalfDay', 1, 0] } },
            totalHours: { $sum: '$totalWorkHours' },
            overtimeHours: { $sum: '$overtimeHours' },
            avgHoursPerDay: { $avg: '$totalWorkHours' }
        }},
        { $project: {
            totalEmployees: { $size: '$totalEmployees' },
            totalDays: 1,
            presentDays: 1,
            absentDays: 1,
            lateDays: 1,
            halfDays: 1,
            attendanceRate: { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] },
            totalHours: 1,
            overtimeHours: 1,
            avgHoursPerDay: 1
        }}
    ]);
    
    // Daily trends
    const dailyTrends = await AttendanceDaily.aggregate([
        { $match: filter },
        { $group: {
            _id: '$date',
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            total: { $sum: 1 }
        }},
        { $sort: { _id: 1 } },
        { $limit: 30 }
    ]);
    
    // Department-wise breakdown
    const departmentStats = await AttendanceDaily.aggregate([
        { $match: filter },
        { $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'userInfo'
        }},
        { $unwind: '$userInfo' },
        { $group: {
            _id: '$userInfo.department',
            totalEmployees: { $addToSet: '$user' },
            presentDays: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            totalDays: { $sum: 1 }
        }},
        { $project: {
            department: '$_id',
            employeeCount: { $size: '$totalEmployees' },
            attendanceRate: { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] },
            _id: 0
        }},
        { $sort: { attendanceRate: -1 } }
    ]);
    
    res.status(200).json({
        status: 'success',
        data: {
            summary: summary[0] || {},
            dailyTrends,
            departmentStats,
            period: { 
                startDate: filter.date.$gte, 
                endDate: filter.date.$lte 
            }
        }
    });
});

// ---------------------------------------------------------
// ⚡ REAL-TIME ATTENDANCE MONITORING
// ---------------------------------------------------------

/**
 * @desc   Live Attendance Feed (WebSocket compatible)
 * @route  GET /api/v1/attendance/live
 */
exports.getLiveAttendance = catchAsync(async (req, res, next) => {
    const { branchId, department, limit = 100 } = req.query;
    const today = dayjs().format('YYYY-MM-DD');
    
    const filter = {
        organizationId: req.user.organizationId,
        date: today
    };
    
    if (branchId) filter.branchId = branchId;
    
    // Get department users if specified
    if (department) {
        const users = await User.find({ 
            department, 
            organizationId: req.user.organizationId 
        }).select('_id');
        filter.user = { $in: users.map(u => u._id) };
    }
    
    const liveData = await AttendanceDaily.find(filter)
        .populate('user', 'name avatar department position')
        .populate({
            path: 'logs',
            match: { createdAt: { $gte: dayjs().subtract(2, 'hours').toDate() } },
            select: 'type timestamp source location',
            options: { sort: { timestamp: -1 }, limit: 5 }
        })
        .sort({ 'logs.timestamp': -1 })
        .limit(parseInt(limit))
        .lean();
    
    // Calculate current status
    const currentHour = dayjs().hour();
    const categorized = {
        present: liveData.filter(d => d.status === 'present'),
        absent: liveData.filter(d => d.status === 'absent'),
        late: liveData.filter(d => d.isLate),
        notCheckedIn: liveData.filter(d => !d.firstIn && currentHour > 10), // After 10 AM
        onLeave: liveData.filter(d => d.status === 'on_leave')
    };
    
    // Create WebSocket subscription for real-time updates
    const subscriptionId = `attendance:live:${req.user._id}:${Date.now()}`;
    
    res.status(200).json({
        status: 'success',
        time: new Date(),
        today,
        subscriptionId,
        summary: {
            total: liveData.length,
            present: categorized.present.length,
            absent: categorized.absent.length,
            late: categorized.late.length,
            notCheckedIn: categorized.notCheckedIn.length,
            onLeave: categorized.onLeave.length
        },
        data: categorized
    });
});

/**
 * @desc   Subscribe to Real-time Attendance Updates
 * @route  POST /api/v1/attendance/subscribe
 */
exports.subscribeToUpdates = catchAsync(async (req, res, next) => {
    const { subscriptionType, filters } = req.body;
    
    // Validate subscription type
    const validTypes = ['my_attendance', 'team_attendance', 'pending_requests', 'live_feed'];
    if (!validTypes.includes(subscriptionType)) {
        return next(new AppError('Invalid subscription type', 400));
    }
    
    const subscriptionId = `attendance:${subscriptionType}:${req.user._id}:${Date.now()}`;
    
    // Store subscription in user session/DB if needed
    req.user.socketSubscriptions = req.user.socketSubscriptions || [];
    req.user.socketSubscriptions.push({
        id: subscriptionId,
        type: subscriptionType,
        filters,
        subscribedAt: new Date()
    });
    
    await req.user.save({ validateBeforeSave: false });
    
    // Send initial data based on subscription type
    let initialData = {};
    
    switch (subscriptionType) {
        case 'my_attendance':
            initialData = await getMyAttendanceData(req.user._id, filters);
            break;
        case 'team_attendance':
            initialData = await getTeamAttendanceData(req.user, filters);
            break;
        case 'pending_requests':
            initialData = await getPendingRequestsData(req.user, filters);
            break;
        case 'live_feed':
            initialData = await getLiveAttendanceData(req.user, filters);
            break;
    }
    
    // Create WebSocket room for this subscription
    emitToUser(req.user._id, 'attendance:subscribed', {
        subscriptionId,
        type: subscriptionType,
        filters,
        initialData
    });
    
    res.status(200).json({
        status: 'success',
        subscriptionId,
        message: `Subscribed to ${subscriptionType} updates`
    });
});

/**
 * @desc   Unsubscribe from Real-time Updates
 * @route  POST /api/v1/attendance/unsubscribe
 */
exports.unsubscribeFromUpdates = catchAsync(async (req, res, next) => {
    const { subscriptionId } = req.body;
    
    if (!subscriptionId) {
        return next(new AppError('Subscription ID required', 400));
    }
    
    // Remove from user's subscriptions
    req.user.socketSubscriptions = req.user.socketSubscriptions?.filter(
        sub => sub.id !== subscriptionId
    ) || [];
    
    await req.user.save({ validateBeforeSave: false });
    
    emitToUser(req.user._id, 'attendance:unsubscribed', { subscriptionId });
    
    res.status(200).json({
        status: 'success',
        message: 'Unsubscribed successfully'
    });
});

// ==================== SHIFT MANAGEMENT ====================

/**
 * @desc   Create shift
 * @route  POST /api/v1/attendance/shifts
 */
exports.createShift = catchAsync(async (req, res, next) => {
    const { name, startTime, endTime, gracePeriodMins, halfDayThresholdHrs, 
            minFullDayHrs, isNightShift, weeklyOffs, description } = req.body;
    
    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return next(new AppError('Invalid time format. Use HH:mm', 400));
    }
    
    // Check for existing shift with same name
    const existingShift = await Shift.findOne({
        organizationId: req.user.organizationId,
        name,
        isActive: true
    });
    
    if (existingShift) {
        return next(new AppError('Shift with this name already exists', 400));
    }
    
    const shift = await Shift.create({
        name,
        organizationId: req.user.organizationId,
        startTime,
        endTime,
        gracePeriodMins: gracePeriodMins || 15,
        halfDayThresholdHrs: halfDayThresholdHrs || 4,
        minFullDayHrs: minFullDayHrs || 8,
        isNightShift: isNightShift || false,
        weeklyOffs: weeklyOffs || [0], // Sunday by default
        description,
        createdBy: req.user._id
    });
    
    // Emit socket event
    emitToOrg(req.user.organizationId, 'attendance:shift:created', {
        shiftId: shift._id,
        name: shift.name,
        createdBy: req.user.name
    });
    
    res.status(201).json({
        status: 'success',
        data: shift
    });
});

// Add this helper function (you can add it near the other helper functions)
const mapLogType = (status) => {
    // Customize this map based on your specific hardware documentation
    // Common ZKTeco/Hikvision codes:
    if (String(status) === '0' || String(status) === 'CheckIn') return 'in';
    if (String(status) === '1' || String(status) === 'CheckOut') return 'out';
    return 'unknown';
};

exports.pushMachineData = catchAsync(async (req, res, next) => {
    const apiKey = req.headers['x-machine-api-key'];
    
    // 1. Authenticate Machine
    const machine = await AttendanceMachine.findOne({ apiKey }).select('+apiKey');
    if (!machine || machine.status !== 'active') {
        return next(new AppError('Unauthorized Machine', 401));
    }

    const payload = Array.isArray(req.body) ? req.body : [req.body];
    if (payload.length === 0) return res.status(200).json({ message: 'No data' });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const processedLogs = [];

        for (const entry of payload) {
            // Adapt these fields based on your specific machine's JSON format
            const machineUserId = entry.userId || entry.user_id; 
            const scanTime = new Date(entry.timestamp); 
            const statusType = entry.status; // 0=CheckIn, 1=CheckOut usually

            // A. Find User
            const user = await User.findOne({ 
                'attendanceConfig.machineUserId': machineUserId,
                organizationId: machine.organizationId
            }).session(session);

            let processingStatus = 'processed';
            let resolvedUserId = user ? user._id : null;

            if (!user) processingStatus = 'orphan';

            // B. Create Immutable Log
            const logEntry = new AttendanceLog({
                machineId: machine._id,
                rawUserId: machineUserId,
                user: resolvedUserId,
                timestamp: scanTime,
                type: mapLogType(statusType),
                metadata: entry,
                processingStatus
            });
            await logEntry.save({ session });
            
            // C. Update Daily Record (Only if User is identified)
            if (user) {
                const dateStr = dayjs(scanTime).format('YYYY-MM-DD');
                
                let daily = await AttendanceDaily.findOne({
                    user: user._id,
                    date: dateStr
                }).session(session);

                if (!daily) {
                    daily = new AttendanceDaily({
                        user: user._id,
                        organizationId: user.organizationId,
                        branchId: user.branchId,
                        date: dateStr,
                        firstIn: scanTime,
                        logs: [logEntry._id],
                        status: 'present'
                    });
                } else {
                    // Update First In / Last Out logic
                    if (scanTime < daily.firstIn) daily.firstIn = scanTime;
                    if (!daily.lastOut || scanTime > daily.lastOut) daily.lastOut = scanTime;
                    daily.logs.push(logEntry._id);
                }

                // Simple Hours Calculation
                if (daily.firstIn && daily.lastOut) {
                    const diff = daily.lastOut - daily.firstIn;
                    daily.totalWorkHours = (diff / (1000 * 60 * 60)).toFixed(2);
                }

                await daily.save({ session });
            }
            
            processedLogs.push(logEntry._id);
        }
        
        // Update Machine Last Sync
        machine.lastSyncAt = new Date();
        await machine.save({ session });

        await session.commitTransaction();
        res.status(200).json({ status: 'success', synced: processedLogs.length });

    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
});


/**
 * @desc   Get all shifts
 * @route  GET /api/v1/attendance/shifts
 */
exports.getAllShifts = catchAsync(async (req, res, next) => {
    const shifts = await Shift.find({ 
        organizationId: req.user.organizationId,
        isActive: true
    }).sort({ name: 1 });
    
    res.status(200).json({
        status: 'success',
        results: shifts.length,
        data: shifts
    });
});

/**
 * @desc   Get shift by ID
 * @route  GET /api/v1/attendance/shifts/:id
 */
exports.getShiftById = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOne({
        _id: req.params.id,
        organizationId: req.user.organizationId
    });
    
    if (!shift) {
        return next(new AppError('No shift found with that ID', 404));
    }
    
    res.status(200).json({
        status: 'success',
        data: shift
    });
});

/**
 * @desc   Update shift
 * @route  PATCH /api/v1/attendance/shifts/:id
 */
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
    
    emitToOrg(req.user.organizationId, 'attendance:shift:updated', {
        shiftId: shift._id,
        name: shift.name,
        updatedBy: req.user.name
    });
    
    res.status(200).json({
        status: 'success',
        data: shift
    });
});

/**
 * @desc   Delete shift (soft delete)
 * @route  DELETE /api/v1/attendance/shifts/:id
 */
exports.deleteShift = catchAsync(async (req, res, next) => {
    const shift = await Shift.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId },
        { isActive: false },
        { new: true }
    );
    
    if (!shift) {
        return next(new AppError('No shift found with that ID', 404));
    }
    
    emitToOrg(req.user.organizationId, 'attendance:shift:deleted', {
        shiftId: shift._id,
        name: shift.name,
        deletedBy: req.user.name
    });
    
    res.status(200).json({
        status: 'success',
        message: 'Shift deleted successfully'
    });
});

// ==================== HOLIDAY MANAGEMENT ====================

/**
 * @desc   Create holiday
 * @route  POST /api/v1/attendance/holidays
 */
exports.createHoliday = catchAsync(async (req, res, next) => {
    const { name, date, branchId, description, isOptional } = req.body;
    
    // Validate date
    if (!dayjs(date, 'YYYY-MM-DD', true).isValid()) {
        return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
    }
    
    // Check for duplicate holiday
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
        isOptional,
        createdBy: req.user._id
    });
    
    emitToOrg(req.user.organizationId, 'attendance:holiday:created', {
        holidayId: holiday._id,
        name: holiday.name,
        date: holiday.date
    });
    
    res.status(201).json({
        status: 'success',
        data: holiday
    });
});

/**
 * @desc   Get holidays
 * @route  GET /api/v1/attendance/holidays
 */
exports.getHolidays = catchAsync(async (req, res, next) => {
    const { year, branchId } = req.query;
    
    const filter = { organizationId: req.user.organizationId };
    
    if (year) {
        filter.date = { $regex: `^${year}` };
    }
    
    if (branchId) {
        filter.$or = [
            { branchId: null }, // Organization-wide holidays
            { branchId } // Branch-specific holidays
        ];
    }
    
    const holidays = await Holiday.find(filter)
        .populate('branchId', 'name')
        .sort({ date: 1 });
    
    res.status(200).json({
        status: 'success',
        results: holidays.length,
        data: holidays
    });
});

/**
 * @desc   Get holiday by ID
 * @route  GET /api/v1/attendance/holidays/:id
 */
exports.getHolidayById = catchAsync(async (req, res, next) => {
    const holiday = await Holiday.findOne({
        _id: req.params.id,
        organizationId: req.user.organizationId
    });
    
    if (!holiday) {
        return next(new AppError('No holiday found with that ID', 404));
    }
    
    res.status(200).json({
        status: 'success',
        data: holiday
    });
});

/**
 * @desc   Update holiday
 * @route  PATCH /api/v1/attendance/holidays/:id
 */
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
    
    emitToOrg(req.user.organizationId, 'attendance:holiday:updated', {
        holidayId: holiday._id,
        name: holiday.name
    });
    
    res.status(200).json({
        status: 'success',
        data: holiday
    });
});

/**
 * @desc   Delete holiday
 * @route  DELETE /api/v1/attendance/holidays/:id
 */
exports.deleteHoliday = catchAsync(async (req, res, next) => {
    const holiday = await Holiday.findOneAndDelete({
        _id: req.params.id,
        organizationId: req.user.organizationId
    });
    
    if (!holiday) {
        return next(new AppError('No holiday found with that ID', 404));
    }
    
    emitToOrg(req.user.organizationId, 'attendance:holiday:deleted', {
        holidayId: holiday._id,
        name: holiday.name
    });
    
    res.status(200).json({
        status: 'success',
        message: 'Holiday deleted successfully'
    });
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Helper: Get my attendance data
 */
async function getMyAttendanceData(userId, filters) {
    const { month, startDate, endDate } = filters || {};
    const filter = { user: userId };
    
    if (month) {
        filter.date = { $regex: `^${month}` };
    } else if (startDate && endDate) {
        filter.date = { $gte: startDate, $lte: endDate };
    }
    
    const data = await AttendanceDaily.find(filter)
        .sort({ date: -1 })
        .limit(30)
        .populate('logs', 'type timestamp')
        .lean();
    
    return data;
}

/**
 * Helper: Get team attendance data
 */
async function getTeamAttendanceData(user, filters) {
    const { date = dayjs().format('YYYY-MM-DD'), department } = filters || {};
    
    const filter = {
        organizationId: user.organizationId,
        date
    };
    
    // Get manager's team
    const teamMembers = await User.find({ 
        manager: user._id,
        ...(department && { department })
    }).select('_id');
    
    const memberIds = teamMembers.map(m => m._id);
    filter.user = { $in: memberIds };
    
    const data = await AttendanceDaily.find(filter)
        .populate('user', 'name department')
        .populate('logs', 'type timestamp')
        .lean();
    
    return data;
}

/**
 * Helper: Get pending requests data
 */
async function getPendingRequestsData(user, filters) {
    const filter = {
        organizationId: user.organizationId,
        status: { $in: ['pending', 'under_review'] }
    };
    
    // If not admin, only show requests user can approve
    if (!['admin', 'owner'].includes(user.role) && !user.isSuperAdmin) {
        filter['approvers.user'] = user._id;
        filter['approvers.status'] = 'pending';
    }
    
    const data = await AttendanceRequest.find(filter)
        .populate('user', 'name')
        .limit(20)
        .lean();
    
    return data;
}

/**
 * Helper: Get live attendance data
 */
async function getLiveAttendanceData(user, filters) {
    const { department } = filters || {};
    const today = dayjs().format('YYYY-MM-DD');
    
    const filter = {
        organizationId: user.organizationId,
        date: today
    };
    
    if (department) {
        const users = await User.find({ department }).select('_id');
        filter.user = { $in: users.map(u => u._id) };
    }
    
    const data = await AttendanceDaily.find(filter)
        .populate('user', 'name department')
        .limit(50)
        .lean();
    
    return data;
}