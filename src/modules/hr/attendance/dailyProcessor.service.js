const moment = require('moment'); // APEX FIX: Using installed 'moment' library
const User = require('../../auth/core/user.model');
const AttendanceDaily = require('../models/attendanceDaily.model');
const LeaveRequest = require('../../leave/leaveRequest.model');
const calendarUtils = require('../../../core/utils/_legacy/calendar.utils'); 

const mongoose = require('mongoose');
const User = require('../../auth/core/user.model');
const AttendanceDaily = require('../models/attendanceDaily.model');
const LeaveRequest = require('../../leave/leaveRequest.model');
const Shift = require('../shift/shift.model'); // Ensure this path matches your structure
const calendarUtils = require('../../../core/utils/_legacy/calendar.utils'); 

/**
 * 🔴 CRITICAL: This function runs every night (e.g., 2 AM) to finalize the previous day's status.
 * It fills in the gaps for anyone who didn't punch in OR punched in but forgot to punch out.
 * * Usage: await processDailyAttendance(orgId, '2023-10-25');
 */
exports.processDailyAttendance = async (organizationId, dateStr) => {
    // 1. Get All Active Users subject to attendance
    const users = await User.find({ 
        organizationId, 
        isActive: true, 
        'attendanceConfig.isAttendanceEnabled': true 
    });

    for (const user of users) {
        // Fetch centralized day status (Handling Sunday/Holiday logic)
        const dayInfo = await calendarUtils.getDayStatus(dateStr, organizationId, user.branchId);

        // A. CHECK IF USER RECORD EXISTS (Punched at least once)
        let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });
        
        if (daily) {
            // --- SCENARIO 1: INCOMPLETE PUNCH (Missed Punch Out) ---
            // Condition: FirstIn exists, but LastOut is missing OR FirstIn == LastOut (Single Punch)
            // Note: This logic assumes the scheduler runs well after the shift has ended.
            if (daily.firstIn && (!daily.lastOut || daily.firstIn.getTime() === daily.lastOut.getTime())) {
                
                daily.status = 'absent'; // Or a specific status like 'missed_punch'
                daily.remarks = 'System Auto-Correction: Missed Punch Out';
                daily.totalWorkHours = 0;
                daily.payoutMultiplier = 0; // Penalize until regularized
                
                // Flag specific issues for the UI
                daily.isEarlyDeparture = true; 
            } 
            else {
                // --- SCENARIO 2: COMPLETE PUNCH (VALID PRESENT) ---
                let status = 'present';
                let multiplier = 1.0;

                // Logic: Did they work on a non-working day?
                if (dayInfo.status === 'holiday') {
                    status = 'holiday_work';
                    multiplier = 2.0; // Rule: Double Pay for working on a Holiday
                    daily.remarks = `Worked on Holiday: ${dayInfo.meta.name}`;
                } else if (dayInfo.status === 'week_off') {
                    status = 'week_off_work';
                    multiplier = 1.5; // Rule: 1.5x Pay for working on Weekly Off
                    daily.remarks = 'Worked on Weekly Off';
                }

                daily.status = status;
                daily.payoutMultiplier = multiplier;
                
                // Store event metadata for UI
                if (dayInfo.meta) {
                    daily.calendarEvents = [dayInfo.meta];
                }
            }
            
            await daily.save();
            continue; // Move to next user
        }

        // B. NO PUNCH FOUND (Absent / Leave / Holiday / Week Off)
        // We must create a "Ghost Record" to fill the ledger.

        let status = 'absent';
        let multiplier = 0.0; // Default: No Work = No Pay
        let remarks = '';

        // Check 1: Is user on Approved Leave?
        // Note: Ensure LeaveRequest stores impactedDates exactly matching dateStr format
        const leave = await LeaveRequest.findOne({
            user: user._id,
            status: 'approved',
            impactedDates: dateStr 
        });

        if (leave) {
            status = 'on_leave';
            // Unpaid leave = 0.0, Paid leave = 1.0
            multiplier = leave.leaveType === 'unpaid' ? 0.0 : 1.0;
            remarks = `Leave: ${leave.leaveType}`;
        } 
        // Check 2: Was it a Holiday?
        else if (dayInfo.status === 'holiday') {
            status = 'holiday';
            multiplier = 1.0; // Paid Holiday
            remarks = dayInfo.meta.name;
        }
        // Check 3: Was it a Weekend?
        else if (dayInfo.status === 'week_off') {
            status = 'week_off';
            multiplier = 1.0; // Paid Week Off
        }
        // Check 4: Regular Working Day (and no punch, no leave)
        else {
            status = 'absent';
            multiplier = 0.0; // Loss of Pay
        }

        // C. Create the Ledger Entry
        await AttendanceDaily.create({
            user: user._id,
            organizationId: user.organizationId,
            branchId: user.branchId,
            date: dateStr,
            shiftId: user.shiftId, // Link shift for reference
            
            firstIn: null,
            lastOut: null,
            totalWorkHours: 0,
            
            status: status,
            payoutMultiplier: multiplier,
            remarks: remarks,
            
            calendarEvents: dayInfo.meta ? [dayInfo.meta] : []
        });
    }
};

// /**
//  * 🔴 CRITICAL: This function runs every night to finalize status.
//  * It fills in the gaps for anyone who didn't punch in.
//  * Use: await processDailyAttendance(orgId, '2023-10-25');
//  */
// exports.processDailyAttendance = async (organizationId, dateStr) => {
//     // 1. Get All Active Users subject to attendance
//     const users = await User.find({ 
//         organizationId, 
//         isActive: true, 
//         'attendanceConfig.isAttendanceEnabled': true 
//     });

//     for (const user of users) {
//         // Fetch centralized day status (Handling Sunday/Holiday logic)
//         // This utility now handles the "Is it Sunday?" and "Is it a Holiday?" checks
//         const dayInfo = await calendarUtils.getDayStatus(dateStr, organizationId, user.branchId);

//         // A. CHECK IF USER PUNCHED IN (Record Exists)
//         let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });
        
//         if (daily) {
//             // --- SCENARIO: PRESENT ---
//             let status = 'present';
//             let multiplier = 1.0;

//             // Logic: Did they work on a non-working day?
//             if (dayInfo.status === 'holiday') {
//                 status = 'holiday_work';
//                 multiplier = 2.0; // Rule: Double Pay for working on a Holiday
//                 daily.remarks = `Worked on Holiday: ${dayInfo.meta.name}`;
//             } else if (dayInfo.status === 'week_off') {
//                 status = 'week_off_work';
//                 multiplier = 1.5; // Rule: 1.5x Pay for working on Weekly Off
//                 daily.remarks = 'Worked on Weekly Off';
//             }

//             // Update existing record
//             daily.status = status;
//             daily.payoutMultiplier = multiplier;
            
//             // Store event metadata for UI (e.g., show "Diwali" on the calendar card)
//             if (dayInfo.meta) {
//                 daily.calendarEvents = [dayInfo.meta];
//             }
            
//             await daily.save();
//             continue; // Move to next user
//         }

//         // B. NO PUNCH FOUND (Absent / Leave / Holiday / Week Off)
//         // We must create a "Ghost Record" to fill the ledger so payroll has no gaps.

//         let status = 'absent';
//         let multiplier = 0.0; // Default: No Work = No Pay
//         let remarks = '';

//         // Check 1: Is user on Approved Leave?
//         const leave = await LeaveRequest.findOne({
//             user: user._id,
//             status: 'approved',
//             impactedDates: dateStr // Ensure LeaveRequest stores dates as "YYYY-MM-DD"
//         });

//         if (leave) {
//             status = 'on_leave';
//             // Unpaid leave = 0.0, Paid leave = 1.0
//             multiplier = leave.leaveType === 'unpaid' ? 0.0 : 1.0;
//             remarks = `Leave: ${leave.leaveType}`;
//         } 
//         // Check 2: Was it a Holiday? (Fetched from calendarUtils)
//         else if (dayInfo.status === 'holiday') {
//             status = 'holiday';
//             multiplier = 1.0; // Paid Holiday (Employee gets paid to stay home)
//             remarks = dayInfo.meta.name;
//         }
//         // Check 3: Was it a Weekend?
//         else if (dayInfo.status === 'week_off') {
//             status = 'week_off';
//             multiplier = 1.0; // Paid Week Off
//         }
//         // Check 4: Regular Working Day (and no punch, no leave)
//         else {
//             status = 'absent';
//             multiplier = 0.0; // Loss of Pay
//         }

//         // C. Create the Ledger Entry
//         await AttendanceDaily.create({
//             user: user._id,
//             organizationId: user.organizationId,
//             branchId: user.branchId,
//             date: dateStr,
            
//             firstIn: null,
//             lastOut: null,
//             totalWorkHours: 0,
            
//             status: status,
//             payoutMultiplier: multiplier,
//             remarks: remarks,
            
//             calendarEvents: dayInfo.meta ? [dayInfo.meta] : []
//         });
//     }
// };
// // const User = require('../../models/userModel');
// // const AttendanceDaily = require('../../models/attendanceDailyModel');
// // const LeaveRequest = require('../../models/leaveRequestModel');
// // const calendarUtils = require('../../utils/calendar.utils'); 
// // const moment = require('moment'); // APEX FIX: Switched from dayjs

// // /**
// //  * 🔴 CRITICAL: This function runs every night to finalize status.
// //  * It fills in the gaps for anyone who didn't punch in.
// //  * Use: await processDailyAttendance(orgId, '2023-10-25');
// //  */
// // exports.processDailyAttendance = async (organizationId, dateStr) => {
// //     // 1. Get All Active Users subject to attendance
// //     const users = await User.find({ 
// //         organizationId, 
// //         isActive: true, 
// //         'attendanceConfig.isAttendanceEnabled': true 
// //     });

// //     for (const user of users) {
// //         // Fetch centralized day status (Handling Sunday/Holiday logic)
// //         const dayInfo = await calendarUtils.getDayStatus(dateStr, organizationId, user.branchId);

// //         // A. CHECK IF USER PUNCHED IN (Record Exists)
// //         let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });
        
// //         if (daily) {
// //             // --- SCENARIO: PRESENT ---
// //             let status = 'present';
// //             let multiplier = 1.0;

// //             // Logic: working on a non-working day?
// //             if (dayInfo.status === 'holiday') {
// //                 status = 'holiday_work';
// //                 multiplier = 2.0; // Rule: Double Pay
// //                 daily.remarks = `Worked on Holiday: ${dayInfo.meta.name}`;
// //             } else if (dayInfo.status === 'week_off') {
// //                 status = 'week_off_work';
// //                 multiplier = 1.5; // Rule: 1.5x Pay
// //                 daily.remarks = 'Worked on Weekly Off';
// //             }

// //             // Update record
// //             daily.status = status;
// //             daily.payoutMultiplier = multiplier;
// //             // Store event metadata for UI (e.g., show "Diwali" on the calendar card)
// //             if (dayInfo.meta) daily.calendarEvents = [dayInfo.meta];
            
// //             await daily.save();
// //             continue; // Move to next user
// //         }

// //         // B. NO PUNCH FOUND (Absent / Leave / Holiday)
// //         // We must create a "Ghost Record" to fill the ledger.

// //         let status = 'absent';
// //         let multiplier = 0.0; // Default: No Work = No Pay
// //         let remarks = '';

// //         // Check 1: Is user on Approved Leave?
// //         const leave = await LeaveRequest.findOne({
// //             user: user._id,
// //             status: 'approved',
// //             impactedDates: dateStr // Ensure your Leave model stores dates as strings in array
// //         });

// //         if (leave) {
// //             status = 'on_leave';
// //             multiplier = leave.leaveType === 'unpaid' ? 0.0 : 1.0;
// //             remarks = `Leave: ${leave.leaveType}`;
// //         } 
// //         // Check 2: Was it a Holiday?
// //         else if (dayInfo.status === 'holiday') {
// //             status = 'holiday';
// //             multiplier = 1.0; // Paid Holiday
// //             remarks = dayInfo.meta.name;
// //         }
// //         // Check 3: Was it a Weekend?
// //         else if (dayInfo.status === 'week_off') {
// //             status = 'week_off';
// //             multiplier = 1.0; // Paid Week Off
// //         }
// //         // Check 4: Regular Working Day (and no punch, no leave)
// //         else {
// //             status = 'absent';
// //             multiplier = 0.0; // Loss of Pay
// //         }

// //         // C. Create the Ledger Entry
// //         await AttendanceDaily.create({
// //             user: user._id,
// //             organizationId: user.organizationId,
// //             branchId: user.branchId,
// //             date: dateStr,
            
// //             firstIn: null,
// //             lastOut: null,
// //             totalWorkHours: 0,
            
// //             status: status,
// //             payoutMultiplier: multiplier,
// //             remarks: remarks,
            
// //             calendarEvents: dayInfo.meta ? [dayInfo.meta] : []
// //         });
// //     }
// // };
// // const checkHolidayMatch = (holidays, userBranchId) => {
// //     return holidays.some(h => {
// //         // Holiday applies to ALL branches (h.branchId is null)
// //         if (!h.branchId) return true;
// //         // Holiday applies to THIS branch
// //         if (h.branchId.toString() === userBranchId.toString()) return true;
// //         return false;
// //     });
// // };
