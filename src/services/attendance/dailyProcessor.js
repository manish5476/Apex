const User = require('../../models/userModel');
const Holiday = require('../../models/holidayModel');
const LeaveRequest = require('../../models/leaveRequestModel');
const AttendanceDaily = require('../../models/attendanceDailyModel');
const dayjs = require('dayjs');

/**
 * 🔴 CRITICAL: This function runs every night to finalize status.
 * It fills in the gaps for anyone who didn't punch in.
 */
exports.processDailyAttendance = async (organizationId, dateStr) => {
    // 1. Get All Active Users
    const users = await User.find({ 
        organizationId, 
        isActive: true, 
        'attendanceConfig.isAttendanceEnabled': true 
    });

    // 2. Check Global Rules (Holiday?)
    // We check if a holiday exists for this Org (and null branch) OR specific branch
    const globalHolidays = await Holiday.find({ 
        organizationId, 
        date: dateStr 
    });

    for (const user of users) {
        // A. Check if Record Already Exists (User punched in)
        let daily = await AttendanceDaily.findOne({ user: user._id, date: dateStr });
        
        if (daily) {
            // User is present. 
            // AUDIT CHECK: Did they work on a holiday?
            const isHoliday = checkHolidayMatch(globalHolidays, user.branchId);
            if (isHoliday) {
                daily.status = 'holiday_work'; // Flags for extra pay
                daily.isOvertime = true;
                await daily.save();
            }
            continue; // Skip processing, they are already handled
        }

        // B. No Record Found? Determine Why.
        let status = 'absent';
        let remarks = '';

        // Check 1: Weekend (Based on user/org settings)
        // (Assuming you have a shift/config for weekends. For now, hardcoded Sun)
        const dayOfWeek = dayjs(dateStr).day(); // 0 = Sunday
        if (dayOfWeek === 0) {
            status = 'week_off';
        }

        // Check 2: Holiday
        const isHoliday = checkHolidayMatch(globalHolidays, user.branchId);
        if (isHoliday) {
            status = 'holiday';
        }

        // Check 3: Approved Leave
        const leave = await LeaveRequest.findOne({
            user: user._id,
            status: 'approved',
            impactedDates: dateStr
        });
        if (leave) {
            status = 'on_leave';
            remarks = leave.leaveType;
        }

        // C. Create the "Ghost" Record
        await AttendanceDaily.create({
            user: user._id,
            organizationId: user.organizationId,
            branchId: user.branchId,
            date: dateStr,
            status: status,
            totalWorkHours: 0,
            remarks: remarks
        });
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
