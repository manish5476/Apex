// const mongoose = require('mongoose');
// const Invoice = require('../../inventory/core/sales.model');
// const User = require('../../auth/core/user.model');
// const AttendanceDaily = require('../../hr/attendance/models/attendanceDaily.model');
// const { toObjectId } = require('../utils/analytics.utils');


// const getEmployeePerformance = async (orgId, branchId, startDate, endDate, minSales = 0, sortBy = 'totalSales') => {
//     try {
//         const match = { 
//             organizationId: toObjectId(orgId),
//             invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
//             status: { $ne: 'cancelled' }
//         };
//         if (branchId) match.branchId = toObjectId(branchId);

//         return await Invoice.aggregate([
//             { $match: match },
//             {
//                 $group: {
//                     _id: '$createdBy',
//                     totalSales: { $sum: '$grandTotal' },
//                     invoiceCount: { $sum: 1 },
//                     totalDiscountGiven: { $sum: '$totalDiscount' }
//                 }
//             },
//             // Safe filtering
//             { $match: { totalSales: { $gte: parseFloat(minSales) || 0 } } },
//             // Secure Lookup with projection
//             { 
//                 $lookup: { 
//                     from: 'users', 
//                     let: { creatorId: '$_id' },
//                     pipeline: [
//                         { $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } },
//                         { $project: { name: 1, email: 1 } }
//                     ],
//                     as: 'user' 
//                 } 
//             },
//             { $unwind: '$user' },
//             {
//                 $project: {
//                     name: '$user.name',
//                     email: '$user.email',
//                     totalSales: 1,
//                     invoiceCount: 1,
//                     totalDiscountGiven: 1,
//                     // DIVIDE-BY-ZERO GUARD
//                     avgTicketSize: { 
//                         $cond: [
//                             { $gt: ['$invoiceCount', 0] }, 
//                             { $divide: ['$totalSales', '$invoiceCount'] }, 
//                             0
//                         ] 
//                     }
//                 }
//             },
//             { $sort: { [sortBy]: -1 } }
//         ]);
//     } catch (error) {
//         throw new Error(`Analytics Engine Error: ${error.message}`);
//     }
// };
// const getStaffAttendancePerformance = async (orgId, branchId, startDate, endDate) => {
//     try {
//         const match = { organizationId: toObjectId(orgId) };
//         if (branchId) match.branchId = toObjectId(branchId);

//         const start = new Date(startDate);
//         const end = new Date(endDate);

//         // 1. Get Sales (Optimized)
//         const staffSales = await Invoice.aggregate([
//             { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//             {
//                 $group: {
//                     _id: '$createdBy',
//                     totalRevenue: { $sum: '$grandTotal' },
//                     invoiceCount: { $sum: 1 },
//                     avgTicketSize: { $avg: '$grandTotal' }
//                 }
//             },
//             { 
//                 $lookup: { 
//                     from: 'users', 
//                     localField: '_id', 
//                     foreignField: '_id', 
//                     pipeline: [{ $project: { name: 1, "attendanceConfig.machineUserId": 1 } }],
//                     as: 'user' 
//                 } 
//             },
//             { $unwind: '$user' }
//         ]);

//         const userIds = staffSales.map(s => s._id);

//         // 2. Get Attendance
//         const attendanceData = await AttendanceDaily.aggregate([
//             { 
//                 $match: { 
//                     user: { $in: userIds },
//                     // Ensure date comparison matches your String format in Model
//                     date: { $gte: startDate.split('T')[0], $lte: endDate.split('T')[0] }
//                 } 
//             },
//             {
//                 $group: {
//                     _id: '$user',
//                     totalWorkHours: { $sum: '$totalWorkHours' },
//                     presentDays: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } }
//                 }
//             }
//         ]);

//         // 3. O(N) Hash-Map Join (Senior Architect Pattern)
//         const attendanceMap = new Map(attendanceData.map(a => [a._id.toString(), a]));

//         return staffSales.map(staff => {
//             const attendance = attendanceMap.get(staff._id.toString()) || { totalWorkHours: 0, presentDays: 0 };
//             return {
//                 ...staff,
//                 attendance,
//                 productivity: attendance.totalWorkHours > 0 ? 
//                     (staff.totalRevenue / attendance.totalWorkHours) : 0
//             };
//         });
//     } catch (error) {
//         throw new Error(`Staff Performance Audit Failed: ${error.message}`);
//     }
// };

// const calculateTargetAchievement = (staff) => {
//     try {
//         // Stub - implement target achievement calculation
//         return 85; // percentage
//     } catch (error) {
//         console.error('Error in calculateTargetAchievement:', error);
//         return 0;
//     }
// };

// const getStaffTrend = (staffId, orgId, branchId) => {
//     try {
//         // Stub - implement staff trend analysis
//         return 'up';
//     } catch (error) {
//         console.error('Error in getStaffTrend:', error);
//         return 'unknown';
//     }
// };

// const calculateProductivityScore = (staff) => {
//     try {
//         const avgOrderValue = staff.avgTicketSize || 0;
//         const orderCount = staff.invoiceCount || 0;

//         // Simple productivity calculation
//         return Math.min(100, (avgOrderValue * orderCount) / 1000);
//     } catch (error) {
//         console.error('Error in calculateProductivityScore:', error);
//         return 0;
//     }
// };

// const generateStaffingRecommendations = (peakHours) => {
//     try {
//         // Stub - implement staffing recommendations
//         return [
//             'Increase staffing on Monday mornings',
//             'Reduce staff on Thursday afternoons'
//         ];
//     } catch (error) {
//         console.error('Error in generateStaffingRecommendations:', error);
//         return [];
//     }
// };


// module.exports = {
//     getEmployeePerformance,
//     getStaffAttendancePerformance,
//     calculateTargetAchievement,
//     getStaffTrend,
//     calculateProductivityScore,
//     generateStaffingRecommendations
// };



// // const getStaffAttendancePerformance = async (orgId, branchId, startDate, endDate) => {
// //     try {
// //         if (!orgId) throw new Error('Organization ID is required');

// //         const match = { organizationId: toObjectId(orgId) };
// //         if (branchId) match.branchId = toObjectId(branchId);

// //         const start = new Date(startDate);
// //         const end = new Date(endDate);

// //         // Get staff sales performance
// //         const staffSales = await Invoice.aggregate([
// //             { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //             {
// //                 $group: {
// //                     _id: '$createdBy',
// //                     totalRevenue: { $sum: '$grandTotal' },
// //                     invoiceCount: { $sum: 1 },
// //                     avgTicketSize: { $avg: '$grandTotal' }
// //                 }
// //             },
// //             { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
// //             { $unwind: '$user' },
// //             { 
// //                 $project: { 
// //                     userId: '$_id',
// //                     name: '$user.name',
// //                     totalRevenue: 1,
// //                     invoiceCount: 1,
// //                     avgTicketSize: 1,
// //                     machineUserId: '$user.attendanceConfig.machineUserId'
// //                 } 
// //             }
// //         ]);

// //         // Get attendance data for these users
// //         const userIds = staffSales.map(s => s.userId);
// //         const attendanceData = await AttendanceDaily.aggregate([
// //             { 
// //                 $match: { 
// //                     user: { $in: userIds },
// //                     date: { 
// //                         $gte: start.toISOString().split('T')[0],
// //                         $lte: end.toISOString().split('T')[0]
// //                     }
// //                 } 
// //             },
// //             {
// //                 $group: {
// //                     _id: '$user',
// //                     totalWorkHours: { $sum: '$totalWorkHours' },
// //                     presentDays: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
// //                     totalDays: { $sum: 1 }
// //                 }
// //             }
// //         ]);

// //         // Combine data
// //         return staffSales.map(staff => {
// //             const attendance = attendanceData.find(a => a._id && a._id.toString() === staff.userId.toString());
// //             return {
// //                 ...staff,
// //                 attendance: attendance || { totalWorkHours: 0, presentDays: 0, totalDays: 0 },
// //                 productivity: attendance ? 
// //                     (staff.totalRevenue / attendance.totalWorkHours) || 0 : 0
// //             };
// //         });
// //     } catch (error) {
// //         console.error('Error in getStaffAttendancePerformance:', error);
// //         throw new Error(`Failed to fetch staff attendance performance: ${error.message}`);
// //     }
// // };
