// Utils/date.utils.js

/**
 * A centralized, powerful utility for calculating date ranges.
 * NOW supports custom start and end dates.
 * @param {string} period - A string like 'last7days', 'custom', etc.
 * @param {string} [startDateStr] - An optional start date string (e.g., '2025-09-01').
 * @param {string} [endDateStr] - An optional end date string (e.g., '2025-09-18').
 * @returns {{startDate: Date | null, endDate: Date | null}}
 */
function getPeriodDates(period, startDateStr, endDateStr) {
    // If custom dates are provided and valid, use them.
    if (period === 'custom' && startDateStr && endDateStr) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        // Basic validation
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return { startDate: null, endDate: null };
        }

        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        return { startDate, endDate };
    }

    const now = new Date();
    let startDate, endDate;

    const getStartOfDay = (date) => new Date(new Date(date).setHours(0, 0, 0, 0));
    const getEndOfDay = (date) => new Date(new Date(date).setHours(23, 59, 59, 999));

    switch (period) {
        case 'today':
            startDate = getStartOfDay(now);
            endDate = getEndOfDay(now);
            break;
        case 'last7days':
            endDate = getEndOfDay(now);
            startDate = getStartOfDay(new Date(new Date().setDate(now.getDate() - 6)));
            break;
        case 'last30days':
            endDate = getEndOfDay(now);
            startDate = getStartOfDay(new Date(new Date().setDate(now.getDate() - 29)));
            break;
        case 'thismonth':
            startDate = getStartOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
            endDate = getEndOfDay(now);
            break;
        case 'thisyear':
            startDate = getStartOfDay(new Date(now.getFullYear(), 0, 1));
            endDate = getEndOfDay(now);
            break;
        default: // Default to last 30 days if period is invalid or not 'custom'
            endDate = getEndOfDay(now);
            startDate = getStartOfDay(new Date(new Date().setDate(now.getDate() - 29)));
            break;
    }
    return { startDate, endDate };
}

module.exports = {
    getPeriodDates,
};


// // Utils/date.utils.js

// /**
//  * A centralized, powerful utility for calculating date ranges.
//  * NOW supports custom start and end dates.
//  * @param {string} period - A string like 'last7days', 'custom', etc.
//  * @param {string} [startDateStr] - An optional start date string (e.g., '2025-09-01').
//  * @param {string} [endDateStr] - An optional end date string (e.g., '2025-09-18').
//  * @returns {{startDate: Date | null, endDate: Date | null}}
//  */
// function getPeriodDates(period, startDateStr, endDateStr) {
//     // If custom dates are provided and valid, use them.
//     if (period === 'custom' && startDateStr && endDateStr) {
//         const startDate = new Date(startDateStr);
//         const endDate = new Date(endDateStr);

//         // Basic validation
//         if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
//             return { startDate: null, endDate: null };
//         }

//         startDate.setHours(0, 0, 0, 0);
//         endDate.setHours(23, 59, 59, 999);
//         return { startDate, endDate };
//     }

//     const now = new Date();
//     let startDate, endDate;

//     const getStartOfDay = (date) => new Date(new Date(date).setHours(0, 0, 0, 0));
//     const getEndOfDay = (date) => new Date(new Date(date).setHours(23, 59, 59, 999));

//     switch (period) {
//         case 'today':
//             startDate = getStartOfDay(now);
//             endDate = getEndOfDay(now);
//             break;
//         case 'last7days':
//             endDate = getEndOfDay(now);
//             startDate = getStartOfDay(new Date(new Date().setDate(now.getDate() - 6)));
//             break;
//         case 'last30days':
//             endDate = getEndOfDay(now);
//             startDate = getStartOfDay(new Date(new Date().setDate(now.getDate() - 29)));
//             break;
//         case 'thismonth':
//             startDate = getStartOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
//             endDate = getEndOfDay(now);
//             break;
//         case 'thisyear':
//             startDate = getStartOfDay(new Date(now.getFullYear(), 0, 1));
//             endDate = getEndOfDay(now);
//             break;
//         default: // Default to last 30 days if period is invalid or not 'custom'
//             endDate = getEndOfDay(now);
//             startDate = getStartOfDay(new Date(new Date().setDate(now.getDate() - 29)));
//             break;
//     }
//     return { startDate, endDate };
// }

// module.exports = {
//     getPeriodDates,
// };

// // function getPeriodDates(period, startDateStr, endDateStr) {
// //     // If custom dates are provided, use them.
// //     if (period === 'custom' && startDateStr && endDateStr) {
// //         const startDate = new Date(startDateStr);
// //         startDate.setHours(0, 0, 0, 0);
// //         const endDate = new Date(endDateStr);
// //         endDate.setHours(23, 59, 59, 999);
// //         return { startDate, endDate };
// //     }

// //     const now = new Date();
// //     let startDate, endDate;
// //     const getStartOfDay = (date) => new Date(date.setHours(0, 0, 0, 0));
// //     // Set time to the very end of the day for end dates
// //     const getEndOfDay = (date) => new Date(date.setHours(23, 59, 59, 999));

// //     switch (period) {
// //         case 'today':
// //             startDate = getStartOfDay(new Date());
// //             endDate = getEndOfDay(new Date());
// //             break;
// //         case 'last7days':
// //             endDate = getEndOfDay(new Date());
// //             startDate = getStartOfDay(new Date(now.setDate(now.getDate() - 6)));
// //             break;
// //         case 'last30days':
// //             endDate = getEndOfDay(new Date());
// //             startDate = getStartOfDay(new Date(now.setDate(now.getDate() - 29)));
// //             break;
// //         case 'last90days':
// //             endDate = getEndOfDay(new Date());
// //             startDate = getStartOfDay(new Date(now.setDate(now.getDate() - 89)));
// //             break;
// //         case 'thismonth':
// //             startDate = getStartOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
// //             endDate = getEndOfDay(new Date());
// //             break;
// //         case 'thisyear':
// //             startDate = getStartOfDay(new Date(now.getFullYear(), 0, 1));
// //             endDate = getEndOfDay(new Date());
// //             break;
// //         // --- Added for operational reports ---
// //         case 'next7days':
// //             startDate = getStartOfDay(new Date());
// //             endDate = getEndOfDay(new Date(now.setDate(now.getDate() + 7)));
// //             break;
// //         case 'next30days':
// //             startDate = getStartOfDay(new Date());
// //             endDate = getEndOfDay(new Date(now.setMonth(now.getMonth() + 1)));
// //             break;
// //         default: // Default to last 30 days if period is invalid
// //             endDate = getEndOfDay(new Date());
// //             startDate = getStartOfDay(new Date(new Date().setDate(now.getDate() - 29)));
// //             break;
// //     }
// //     return { startDate, endDate };
// // }

// // // Export the function correctly so it can be imported by our services
// // module.exports = {
// //     getPeriodDates,
// // };