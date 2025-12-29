// src/utils/calendar.utils.js
const dayjs = require('dayjs');
const Holiday = require('../models/holidayModel');

/**
 * 📅 CENTRALIZED CALENDAR LOGIC
 * Determines the status of a specific day (Working, Weekend, Holiday)
 * Handles the "Sunday + Holiday" collision logic here.
 */
exports.getDayStatus = async (dateStr, organizationId, branchId) => {
    const date = dayjs(dateStr);
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
};// const dayjs = require('dayjs');
// const Holiday = require('../models/holidayModel');

// /**
//  * 📅 CENTRALIZED CALENDAR LOGIC
//  * Determines the status of a specific day (Working, Weekend, Holiday)
//  */

// exports.getDayStatus = async (dateStr, organizationId, branchId) => {
//     const date = dayjs(dateStr);
//     const dayOfWeek = date.day(); // 0=Sunday, 1=Monday, ... 6=Saturday

//     // 1. CHECK WEEKENDS (Static Rule)
//     // You can make this configurable later (e.g., specific branches have Friday off)
//     let isWeekend = false;
//     if (dayOfWeek === 0) isWeekend = true; // Sunday is always off

//     // 2. CHECK HOLIDAYS (Database Rule)
//     // Check global org holidays OR branch-specific holidays
//     const holiday = await Holiday.findOne({
//         organizationId,
//         date: dateStr,
//         $or: [
//             { branchId: null },       // Applies to whole company
//             { branchId: branchId }    // Applies to specific branch
//         ]
//     });

//     // 3. DETERMINE FINAL STATUS
//     if (holiday) {
//         // Priority: Holiday overrides Weekend
//         return {
//             status: 'holiday',
//             multiplier: 1.0, // Paid Holiday
//             meta: { name: holiday.name, type: 'festival' }
//         };
//     }

//     if (isWeekend) {
//         return {
//             status: 'week_off',
//             multiplier: 1.0, // Paid Week Off
//             meta: { name: 'Sunday', type: 'weekend' }
//         };
//     }

//     return {
//         status: 'working',
//         multiplier: 1.0,
//         meta: null
//     };
// };

// /**
//  * Helper to check overlap (Sandwich Rule Logic)
//  */
// exports.isNextDayWorking = async (currentDateStr) => {
//     const nextDay = dayjs(currentDateStr).add(1, 'day');
//     // Simple check: is it Sunday?
//     return nextDay.day() !== 0; 
// };
