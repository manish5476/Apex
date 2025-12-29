// const User = require('../../models/userModel');
// const Holiday = require('../../models/holidayModel');
// const LeaveRequest = require('../../models/leaveRequestModel');
// const AttendanceDaily = require('../../models/attendanceDailyModel');
// const dayjs = require('dayjs');

// /**
//  * 🔴 CRITICAL: This function runs every night to finalize status.
//  * It fills in the gaps for anyone who didn't punch in.
//  */
// exports.processDailyAttendance = async (organizationId, dateStr) => {
//     // 1. Get All Active Users
//     const users = await User.find({ 
//         organizationId, 
//         isActive: true, 
//         'attendanceConfig.isAttendanceEnabled': true 
//     });

//     // 2. Check Global Rules (Holiday?)
//     // We check if a holiday exists for this Org (and null branch) OR specific branch
//     const globalHolidays = await Holiday.find({ 
//         organizationId, 
//         date: dateStr 
//     });

//     for (const user of users) {
//         // A. Check if Record Already Exists (User punched in)
//         let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });
        
//         if (daily) {
//             // User is present. 
//             // AUDIT CHECK: Did they work on a holiday?
//             const isHoliday = checkHolidayMatch(globalHolidays, user.branchId);
//             if (isHoliday) {
//                 daily.status = 'holiday_work'; // Flags for extra pay
//                 daily.isOvertime = true;
//                 await daily.save();
//             }
//             continue; // Skip processing, they are already handled
//         }

//         // B. No Record Found? Determine Why.
//         let status = 'absent';
//         let remarks = '';

//         // Check 1: Weekend (Based on user/org settings)
//         // (Assuming you have a shift/config for weekends. For now, hardcoded Sun)
//         const dayOfWeek = dayjs(dateStr).day(); // 0 = Sunday
//         if (dayOfWeek === 0) {
//             status = 'week_off';
//         }

//         // Check 2: Holiday
//         const isHoliday = checkHolidayMatch(globalHolidays, user.branchId);
//         if (isHoliday) {
//             status = 'holiday';
//         }

//         // Check 3: Approved Leave
//         const leave = await LeaveRequest.findOne({
//             user: user._id,
//             status: 'approved',
//             impactedDates: dateStr
//         });
//         if (leave) {
//             status = 'on_leave';
//             remarks = leave.leaveType;
//         }

//         // C. Create the "Ghost" Record
//         await AttendanceDaily.create({
//             user: user._id,
//             organizationId: user.organizationId,
//             branchId: user.branchId,
//             date: dateStr,
//             status: status,
//             totalWorkHours: 0,
//             remarks: remarks
//         });
//     }
// };
const AttendanceDaily = require('../../models/attendanceDailyModel');
const Holiday = require('../../models/holidayModel');
const User = require('../../models/userModel');
const dayjs = require('dayjs');

exports.processDailyAttendance = async (organizationId, dateStr) => {
    // 1. Fetch Context
    const users = await User.find({ organizationId, isActive: true });
    const globalHolidays = await Holiday.find({ organizationId, date: dateStr });

    // 2. Determine Day Properties
    const dateObj = dayjs(dateStr);
    const isSunday = dateObj.day() === 0; // 0 = Sunday
    
    // Note: Holidays might be branch-specific, so we check inside the loop
    
    for (const user of users) {
        // A. Identify all events for this user today
        const events = [];
        if (isSunday) events.push({ type: 'week_off', priority: 5 });
        
        const userHoliday = globalHolidays.find(h => 
            !h.branchId || h.branchId.toString() === user.branchId?.toString()
        );
        if (userHoliday) events.push({ type: 'holiday', name: userHoliday.name, priority: 10 });

        // B. Check if they actually worked
        let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });

        // --- CASE 1: USER WORKED (Present) ---
        if (daily) {
            let multiplier = 1.0;
            let status = 'present';

            // If worked on Holiday (Priority 10)
            if (userHoliday) {
                status = 'holiday_work';
                multiplier = 2.0; // Rule: Double Pay for Holiday Work
            } 
            // If worked on Sunday (Priority 5) but NOT Holiday
            else if (isSunday) {
                status = 'week_off_work';
                multiplier = 1.5; // Rule: 1.5x Pay for Sunday Work
            }

            // Update the record
            daily.status = status;
            daily.payoutMultiplier = multiplier;
            daily.calendarEvents = events;
            await daily.save();
        } 
        
        // --- CASE 2: USER ABSENT (Did not punch in) ---
        else {
            // Priority Logic: Holiday > Sunday > Absent
            let status = 'absent';
            let multiplier = 0.0; // No pay for absence

            if (userHoliday) {
                status = 'holiday';
                multiplier = 1.0; // Paid Holiday (You get paid for doing nothing)
            } else if (isSunday) {
                status = 'week_off';
                multiplier = 1.0; // Paid Week Off
            }

            // Create the "Ghost" Record
            await AttendanceDaily.create({
                user: user._id,
                organizationId: user.organizationId,
                branchId: user.branchId,
                date: dateStr,
                status: status,
                payoutMultiplier: multiplier,
                totalWorkHours: 0,
                calendarEvents: events
            });
        }
    }
};

// Helper: Does this user have a holiday today?
const checkHolidayMatch = (holidays, userBranchId) => {
    return holidays.some(h => {
        // Holiday applies to ALL branches (h.branchId is null)
        if (!h.branchId) return true;
        // Holiday applies to THIS branch
        if (h.branchId.toString() === userBranchId.toString()) return true;
        return false;
    });
};
