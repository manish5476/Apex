const moment = require('moment');
const Holiday = require('../../modules/hr/holiday/models/holiday.model');

/**
 * 📅 CENTRALIZED CALENDAR LOGIC
 * Determines the status of a specific day (Working, Weekend, Holiday)
 * Handles the "Sunday + Holiday" collision logic here.
 */
exports.getDayStatus = async (dateStr, organizationId, branchId) => {
    // APEX FIX: Use moment instead of dayjs
    const date = moment(dateStr); 
    const dayOfWeek = date.day(); // 0=Sunday, 1=Monday, ... 6=Saturday

    // 1. CHECK WEEKENDS (Static Rule)
    // currently hardcoded for Sunday, can be made dynamic later
    let isWeekend = (dayOfWeek === 0); 

    // 2. CHECK HOLIDAYS (Database Rule)
    // Check global org holidays OR branch-specific holidays
    const holiday = await Holiday.findOne({
        organizationId,
        date: dateStr,
        $or: [
            { branchId: null },       // Applies to whole company
            { branchId: branchId }    // Applies to specific branch
        ]
    });

    // 3. DETERMINE FINAL STATUS (Collision Logic)
    
    // Priority 1: Holiday (Even if it falls on Sunday, it's a Holiday)
    if (holiday) {
        return {
            status: 'holiday',
            // If Sunday + Holiday, usually standard is Holiday.
            multiplier: 1.0, 
            meta: { name: holiday.name, type: 'festival', isCollision: isWeekend }
        };
    }

    // Priority 2: Weekend
    if (isWeekend) {
        return {
            status: 'week_off',
            multiplier: 1.0, // Paid Week Off
            meta: { name: 'Sunday', type: 'weekend' }
        };
    }

    // Priority 3: Normal Working Day
    return {
        status: 'working',
        multiplier: 1.0,
        meta: null
    };
};

/**
 * Helper to check overlap (Sandwich Rule Logic)
 */
exports.isNextDayWorking = async (currentDateStr) => {
    // APEX FIX: Use moment to add days
    const nextDay = moment(currentDateStr).add(1, 'day');
    // Simple check: is it Sunday?
    return nextDay.day() !== 0; 
};