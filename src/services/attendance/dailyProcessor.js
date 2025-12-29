const User = require('../../models/userModel');
const AttendanceDaily = require('../../models/attendanceDailyModel');
const LeaveRequest = require('../../models/leaveRequestModel');
const calendarUtils = require('../../utils/calendar.utils'); 
const dayjs = require('dayjs');

/**
 * 🔴 CRITICAL: This function runs every night to finalize status.
 * It fills in the gaps for anyone who didn't punch in.
 * Use: await processDailyAttendance(orgId, '2023-10-25');
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

        // A. CHECK IF USER PUNCHED IN (Record Exists)
        let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });
        
        if (daily) {
            // --- SCENARIO: PRESENT ---
            let status = 'present';
            let multiplier = 1.0;

            // Logic: working on a non-working day?
            if (dayInfo.status === 'holiday') {
                status = 'holiday_work';
                multiplier = 2.0; // Rule: Double Pay
                daily.remarks = `Worked on Holiday: ${dayInfo.meta.name}`;
            } else if (dayInfo.status === 'week_off') {
                status = 'week_off_work';
                multiplier = 1.5; // Rule: 1.5x Pay
                daily.remarks = 'Worked on Weekly Off';
            }

            // Update record
            daily.status = status;
            daily.payoutMultiplier = multiplier;
            // Store event metadata for UI (e.g., show "Diwali" on the calendar card)
            if (dayInfo.meta) daily.calendarEvents = [dayInfo.meta];
            
            await daily.save();
            continue; // Move to next user
        }

        // B. NO PUNCH FOUND (Absent / Leave / Holiday)
        // We must create a "Ghost Record" to fill the ledger.

        let status = 'absent';
        let multiplier = 0.0; // Default: No Work = No Pay
        let remarks = '';

        // Check 1: Is user on Approved Leave?
        const leave = await LeaveRequest.findOne({
            user: user._id,
            status: 'approved',
            impactedDates: dateStr // Ensure your Leave model stores dates as strings in array
        });

        if (leave) {
            status = 'on_leave';
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
            
            firstIn: null,
            lastOut: null,
            totalWorkHours: 0,
            
            status: status,
            payoutMultiplier: multiplier,
            remarks: remarks,
            
            calendarEvents: dayInfo.meta ? [dayInfo.meta] : []
        });
    }
};// // const User = require('../../models/userModel');
// // const Holiday = require('../../models/holidayModel');
// // const LeaveRequest = require('../../models/leaveRequestModel');
// // const AttendanceDaily = require('../../models/attendanceDailyModel');
// // const dayjs = require('dayjs');

// // /**
// //  * 🔴 CRITICAL: This function runs every night to finalize status.
// //  * It fills in the gaps for anyone who didn't punch in.
// //  */
// // exports.processDailyAttendance = async (organizationId, dateStr) => {
// //     // 1. Get All Active Users
// //     const users = await User.find({ 
// //         organizationId, 
// //         isActive: true, 
// //         'attendanceConfig.isAttendanceEnabled': true 
// //     });

// //     // 2. Check Global Rules (Holiday?)
// //     // We check if a holiday exists for this Org (and null branch) OR specific branch
// //     const globalHolidays = await Holiday.find({ 
// //         organizationId, 
// //         date: dateStr 
// //     });

// //     for (const user of users) {
// //         // A. Check if Record Already Exists (User punched in)
// //         let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });
        
// //         if (daily) {
// //             // User is present. 
// //             // AUDIT CHECK: Did they work on a holiday?
// //             const isHoliday = checkHolidayMatch(globalHolidays, user.branchId);
// //             if (isHoliday) {
// //                 daily.status = 'holiday_work'; // Flags for extra pay
// //                 daily.isOvertime = true;
// //                 await daily.save();
// //             }
// //             continue; // Skip processing, they are already handled
// //         }

// //         // B. No Record Found? Determine Why.
// //         let status = 'absent';
// //         let remarks = '';

// //         // Check 1: Weekend (Based on user/org settings)
// //         // (Assuming you have a shift/config for weekends. For now, hardcoded Sun)
// //         const dayOfWeek = dayjs(dateStr).day(); // 0 = Sunday
// //         if (dayOfWeek === 0) {
// //             status = 'week_off';
// //         }

// //         // Check 2: Holiday
// //         const isHoliday = checkHolidayMatch(globalHolidays, user.branchId);
// //         if (isHoliday) {
// //             status = 'holiday';
// //         }

// //         // Check 3: Approved Leave
// //         const leave = await LeaveRequest.findOne({
// //             user: user._id,
// //             status: 'approved',
// //             impactedDates: dateStr
// //         });
// //         if (leave) {
// //             status = 'on_leave';
// //             remarks = leave.leaveType;
// //         }

// //         // C. Create the "Ghost" Record
// //         await AttendanceDaily.create({
// //             user: user._id,
// //             organizationId: user.organizationId,
// //             branchId: user.branchId,
// //             date: dateStr,
// //             status: status,
// //             totalWorkHours: 0,
// //             remarks: remarks
// //         });
// //     }
// // };
// const AttendanceDaily = require('../../models/attendanceDailyModel');
// const Holiday = require('../../models/holidayModel');
// const User = require('../../models/userModel');
// const dayjs = require('dayjs');

// exports.processDailyAttendance = async (organizationId, dateStr) => {
//     // 1. Fetch Context
//     const users = await User.find({ organizationId, isActive: true });
//     const globalHolidays = await Holiday.find({ organizationId, date: dateStr });

//     // 2. Determine Day Properties
//     const dateObj = dayjs(dateStr);
//     const isSunday = dateObj.day() === 0; // 0 = Sunday
    
//     // Note: Holidays might be branch-specific, so we check inside the loop
    
//     for (const user of users) {
//         // A. Identify all events for this user today
//         const events = [];
//         if (isSunday) events.push({ type: 'week_off', priority: 5 });
        
//         const userHoliday = globalHolidays.find(h => 
//             !h.branchId || h.branchId.toString() === user.branchId?.toString()
//         );
//         if (userHoliday) events.push({ type: 'holiday', name: userHoliday.name, priority: 10 });

//         // B. Check if they actually worked
//         let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });

//         // --- CASE 1: USER WORKED (Present) ---
//         if (daily) {
//             let multiplier = 1.0;
//             let status = 'present';

//             // If worked on Holiday (Priority 10)
//             if (userHoliday) {
//                 status = 'holiday_work';
//                 multiplier = 2.0; // Rule: Double Pay for Holiday Work
//             } 
//             // If worked on Sunday (Priority 5) but NOT Holiday
//             else if (isSunday) {
//                 status = 'week_off_work';
//                 multiplier = 1.5; // Rule: 1.5x Pay for Sunday Work
//             }

//             // Update the record
//             daily.status = status;
//             daily.payoutMultiplier = multiplier;
//             daily.calendarEvents = events;
//             await daily.save();
//         } 
        
//         // --- CASE 2: USER ABSENT (Did not punch in) ---
//         else {
//             // Priority Logic: Holiday > Sunday > Absent
//             let status = 'absent';
//             let multiplier = 0.0; // No pay for absence

//             if (userHoliday) {
//                 status = 'holiday';
//                 multiplier = 1.0; // Paid Holiday (You get paid for doing nothing)
//             } else if (isSunday) {
//                 status = 'week_off';
//                 multiplier = 1.0; // Paid Week Off
//             }

//             // Create the "Ghost" Record
//             await AttendanceDaily.create({
//                 user: user._id,
//                 organizationId: user.organizationId,
//                 branchId: user.branchId,
//                 date: dateStr,
//                 status: status,
//                 payoutMultiplier: multiplier,
//                 totalWorkHours: 0,
//                 calendarEvents: events
//             });
//         }
//     }
// };

// // Helper: Does this user have a holiday today?
// const checkHolidayMatch = (holidays, userBranchId) => {
//     return holidays.some(h => {
//         // Holiday applies to ALL branches (h.branchId is null)
//         if (!h.branchId) return true;
//         // Holiday applies to THIS branch
//         if (h.branchId.toString() === userBranchId.toString()) return true;
//         return false;
//     });
// };
