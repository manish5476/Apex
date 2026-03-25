const mongoose = require('mongoose');
const Sales = require('../../inventory/core/sales.model');
const User = require('../../auth/core/user.model');
const AttendanceDaily = require('../../HRMS/models/attendanceDaily.model');
const { toObjectId } = require('../utils/analytics.utils');

/* ==========================================================================
   👥 STAFF ANALYTICS SERVICE — Uses Sales model (not Invoice)
   ========================================================================== */

/**
 * 1. EMPLOYEE PERFORMANCE: Sales leaderboard by staff member
 */
const getEmployeePerformance = async (orgId, branchId, startDate, endDate, minSales = 0, sortBy = 'totalSales') => {
    try {
        const match = {
            organizationId: toObjectId(orgId),
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
            status: 'active'
        };
        if (branchId) match.branchId = toObjectId(branchId);

        return await Sales.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$createdBy',
                    totalSales: { $sum: '$totalAmount' },
                    invoiceCount: { $sum: 1 },
                    totalDiscountGiven: { $sum: '$discountTotal' }
                }
            },
            { $match: { totalSales: { $gte: parseFloat(minSales) || 0 } } },
            {
                $lookup: {
                    from: 'users',
                    let: { creatorId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } },
                        { $project: { name: 1, email: 1 } }
                    ],
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    name: '$user.name',
                    email: '$user.email',
                    totalSales: 1,
                    invoiceCount: 1,
                    totalDiscountGiven: 1,
                    avgTicketSize: {
                        $cond: [
                            { $gt: ['$invoiceCount', 0] },
                            { $divide: ['$totalSales', '$invoiceCount'] },
                            0
                        ]
                    }
                }
            },
            { $sort: { [sortBy]: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getEmployeePerformance:', error);
        throw new Error(`Analytics Engine Error: ${error.message}`);
    }
};

/**
 * 2. STAFF ATTENDANCE + PERFORMANCE: Combined sales & attendance data
 */
const getStaffAttendancePerformance = async (orgId, branchId, startDate, endDate) => {
    try {
        const match = { organizationId: toObjectId(orgId) };
        if (branchId) match.branchId = toObjectId(branchId);

        const start = new Date(startDate);
        const end = new Date(endDate);

        // 1. Get Sales per staff
        const staffSales = await Sales.aggregate([
            { $match: { ...match, createdAt: { $gte: start, $lte: end }, status: 'active' } },
            {
                $group: {
                    _id: '$createdBy',
                    totalRevenue: { $sum: '$totalAmount' },
                    invoiceCount: { $sum: 1 },
                    avgTicketSize: { $avg: '$totalAmount' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    pipeline: [{ $project: { name: 1, 'attendanceConfig.machineUserId': 1 } }],
                    as: 'user'
                }
            },
            { $unwind: '$user' }
        ]);

        const userIds = staffSales.map(s => s._id);

        // 2. Get Attendance
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];

        const attendanceData = await AttendanceDaily.aggregate([
            {
                $match: {
                    user: { $in: userIds },
                    date: { $gte: startStr, $lte: endStr }
                }
            },
            {
                $group: {
                    _id: '$user',
                    totalWorkHours: { $sum: '$totalWorkHours' },
                    presentDays: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } }
                }
            }
        ]);

        // 3. Hash-map join for O(N) performance
        const attendanceMap = new Map(attendanceData.map(a => [a._id.toString(), a]));

        return staffSales.map(staff => {
            const attendance = attendanceMap.get(staff._id.toString()) || { totalWorkHours: 0, presentDays: 0 };
            return {
                ...staff,
                attendance,
                productivity: attendance.totalWorkHours > 0
                    ? (staff.totalRevenue / attendance.totalWorkHours)
                    : 0
            };
        });
    } catch (error) {
        console.error('Error in getStaffAttendancePerformance:', error);
        throw new Error(`Staff Performance Audit Failed: ${error.message}`);
    }
};

/**
 * 3. TARGET ACHIEVEMENT: Stub for target-based scoring
 */
const calculateTargetAchievement = (staff) => {
    try {
        return 85; 
    } catch (error) {
        console.error('Error in calculateTargetAchievement:', error);
        return 0;
    }
};

/**
 * 4. STAFF TREND: Direction indicator
 */
const getStaffTrend = (staffId, orgId, branchId) => {
    try {
        return 'up'; 
    } catch (error) {
        console.error('Error in getStaffTrend:', error);
        return 'unknown';
    }
};

/**
 * 5. PRODUCTIVITY SCORE: Basic scoring
 */
const calculateProductivityScore = (staff) => {
    try {
        const avgOrderValue = staff.avgTicketSize || 0;
        const orderCount = staff.invoiceCount || 0;
        return Math.min(100, (avgOrderValue * orderCount) / 1000);
    } catch (error) {
        console.error('Error in calculateProductivityScore:', error);
        return 0;
    }
};

/**
 * 6. STAFFING RECOMMENDATIONS: Based on peak hour data
 */
const generateStaffingRecommendations = (peakHours) => {
    try {
        if (!peakHours || !Array.isArray(peakHours) || peakHours.length === 0) {
            return ['Insufficient data for staffing recommendations'];
        }
        const recommendations = [];
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Find peak and low periods
        const sorted = [...peakHours].sort((a, b) => b.count - a.count);
        const peak = sorted[0];
        const low = sorted[sorted.length - 1];

        if (peak) {
            recommendations.push(
                `Increase staffing on ${dayLabels[peak.day - 1] || 'Day ' + peak.day} around ${peak.hour}:00 (${peak.count} transactions)`
            );
        }
        if (low && low.count < peak.count * 0.3) {
            recommendations.push(
                `Consider reducing staff on ${dayLabels[low.day - 1] || 'Day ' + low.day} at ${low.hour}:00 (only ${low.count} transactions)`
            );
        }
        return recommendations;
    } catch (error) {
        console.error('Error in generateStaffingRecommendations:', error);
        return [];
    }
};

module.exports = {
    getEmployeePerformance,
    getStaffAttendancePerformance,
    calculateTargetAchievement,
    getStaffTrend,
    calculateProductivityScore,
    generateStaffingRecommendations
};
