const analyticsService = require('../services/analyticsService');

/**
 * UTILITY: Get Date Range
 * Defaults to current month if not specified
 */
const getDateRange = (query) => {
    const now = new Date();
    // Default: Start of current month
    let start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    // Default: End of current day
    let end = query.endDate ? new Date(query.endDate) : new Date(now.setHours(23, 59, 59, 999));
    return { start, end };
};

// 1. EXECUTIVE DASHBOARD
exports.getDashboardOverview = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId } = req.query;
        const orgId = req.user.organizationId;

        const [kpi, charts, inventory, leaders] = await Promise.all([
            analyticsService.getExecutiveStats(orgId, branchId, start, end),
            analyticsService.getChartData(orgId, branchId, start, end, 'day'),
            analyticsService.getInventoryAnalytics(orgId, branchId),
            analyticsService.getLeaderboards(orgId, branchId, start, end)
        ]);

        res.status(200).json({
            status: 'success',
            data: { period: { start, end }, kpi, charts, inventory, leaders }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 2. FINANCIAL REPORT (P&L)
exports.getFinancialReport = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId, interval } = req.query; 
        const orgId = req.user.organizationId;

        const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
        const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

        res.status(200).json({ status: 'success', data: { kpi, charts } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 3. CASH FLOW (Aging & Payments)
exports.getCashFlowReport = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId } = req.query;
        const orgId = req.user.organizationId;

        const data = await analyticsService.getCashFlowStats(orgId, branchId, start, end);

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 4. TAX REPORT
exports.getTaxReport = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId } = req.query;
        const orgId = req.user.organizationId;

        const data = await analyticsService.getTaxStats(orgId, branchId, start, end);

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 5. INVENTORY & PRODUCT PERFORMANCE
exports.getInventoryReport = async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getProductPerformance = async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 6. PROCUREMENT
exports.getProcurementAnalysis = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getProcurementStats(orgId, branchId, start, end);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// 7. CUSTOMER INSIGHTS
exports.getCustomerInsights = async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// const analyticsService = require('../services/analyticsService');

// /**
//  * UTILITY: Get Date Range
//  * Defaults to current month if not specified
//  */
// const getDateRange = (query) => {
//     const now = new Date();
//     // Default: Start of current month
//     let start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
//     // Default: End of current day
//     let end = query.endDate ? new Date(query.endDate) : new Date(now.setHours(23, 59, 59, 999));
//     return { start, end };
// };

// // 1. EXECUTIVE DASHBOARD
// exports.getDashboardOverview = async (req, res, next) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         const [kpi, charts, inventory, leaders] = await Promise.all([
//             analyticsService.getExecutiveStats(orgId, branchId, start, end),
//             analyticsService.getChartData(orgId, branchId, start, end, 'day'),
//             analyticsService.getInventoryAnalytics(orgId, branchId),
//             analyticsService.getLeaderboards(orgId, branchId, start, end)
//         ]);

//         res.status(200).json({
//             status: 'success',
//             data: { period: { start, end }, kpi, charts, inventory, leaders }
//         });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 2. FINANCIAL REPORT (P&L)
// exports.getFinancialReport = async (req, res, next) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId, interval } = req.query; 
//         const orgId = req.user.organizationId;

//         const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
//         const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

//         res.status(200).json({ status: 'success', data: { kpi, charts } });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 3. CASH FLOW (Aging & Payments)
// exports.getCashFlowReport = async (req, res, next) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         const data = await analyticsService.getCashFlowStats(orgId, branchId, start, end);

//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 4. TAX REPORT
// exports.getTaxReport = async (req, res, next) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         const data = await analyticsService.getTaxStats(orgId, branchId, start, end);

//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 5. INVENTORY & PRODUCT PERFORMANCE
// exports.getInventoryReport = async (req, res, next) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getProductPerformance = async (req, res, next) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 6. PROCUREMENT
// exports.getProcurementAnalysis = async (req, res, next) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getProcurementStats(orgId, branchId, start, end);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 7. CUSTOMER INSIGHTS
// exports.getCustomerInsights = async (req, res, next) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };



// // const analyticsService = require('../services/analyticsService');
// // const { catchAsync } = require('../utils/catchAsync'); // Assuming you have a wrapper, or use try/catch

// // /**
// //  * UTILITY: Get Date Range
// //  * Defaults to current month if not specified
// //  */
// // const getDateRange = (query) => {
// //     const now = new Date();
// //     // Default: Start of current month
// //     let start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
// //     // Default: End of current day
// //     let end = query.endDate ? new Date(query.endDate) : new Date(now.setHours(23, 59, 59, 999));
    
// //     return { start, end };
// // };

// // /**
// //  * 1. FULL DASHBOARD OVERVIEW
// //  * Consolidates all critical metrics for the Landing Page
// //  */
// // exports.getDashboardOverview = async (req, res, next) => {
// //     try {
// //         const { start, end } = getDateRange(req.query);
// //         const { branchId } = req.query;
// //         const orgId = req.user.organizationId;

// //         // Run these in parallel for performance
// //         const [kpi, charts, inventory, leaders] = await Promise.all([
// //             analyticsService.getExecutiveStats(orgId, branchId, start, end),
// //             analyticsService.getChartData(orgId, branchId, start, end, 'day'),
// //             analyticsService.getInventoryAnalytics(orgId, branchId),
// //             analyticsService.getLeaderboards(orgId, branchId, start, end)
// //         ]);

// //         res.status(200).json({
// //             status: 'success',
// //             message: 'Dashboard analytics retrieved successfully',
// //             data: {
// //                 period: { start, end },
// //                 kpi,
// //                 charts,
// //                 inventory,
// //                 leaders
// //             }
// //         });
// //     } catch (error) {
// //         // Pass to your global error handler
// //         res.status(500).json({ status: 'error', message: error.message });
// //     }
// // };

// // /**
// //  * 2. FINANCIAL REPORT (Deep Dive)
// //  * Focused specifically on P&L and Cashflow
// //  */
// // exports.getFinancialReport = async (req, res, next) => {
// //     try {
// //         const { start, end } = getDateRange(req.query);
// //         const { branchId, interval } = req.query; // interval = 'day' or 'month'
// //         const orgId = req.user.organizationId;

// //         const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
// //         const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

// //         res.status(200).json({
// //             status: 'success',
// //             data: { kpi, charts }
// //         });
// //     } catch (error) {
// //         res.status(500).json({ status: 'error', message: error.message });
// //     }
// // };

// // /**
// //  * 3. INVENTORY REPORT
// //  * Focused on stock levels and valuation
// //  */
// // exports.getInventoryReport = async (req, res, next) => {
// //     try {
// //         const { branchId } = req.query;
// //         const orgId = req.user.organizationId;

// //         const data = await analyticsService.getInventoryAnalytics(orgId, branchId);

// //         res.status(200).json({
// //             status: 'success',
// //             data
// //         });
// //     } catch (error) {
// //         res.status(500).json({ status: 'error', message: error.message });
// //     }
// // };
// // // const analyticsService = require('../services/analyticsService');
// // // const { catchAsync } = require('../utils/catchAsync'); // Assuming you have a wrapper, or use try/catch

// // // /**
// // //  * UTILITY: Get Date Range
// // //  * Defaults to current month if not specified
// // //  */
// // // const getDateRange = (query) => {
// // //     const now = new Date();
// // //     // Default: Start of current month
// // //     let start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
// // //     // Default: End of current day
// // //     let end = query.endDate ? new Date(query.endDate) : new Date(now.setHours(23, 59, 59, 999));
    
// // //     return { start, end };
// // // };

// // // /**
// // //  * 1. FULL DASHBOARD OVERVIEW
// // //  * Consolidates all critical metrics for the Landing Page
// // //  */
// // // exports.getDashboardOverview = async (req, res, next) => {
// // //     try {
// // //         const { start, end } = getDateRange(req.query);
// // //         const { branchId } = req.query;
// // //         const orgId = req.user.organizationId;

// // //         // Run these in parallel for performance
// // //         const [kpi, charts, inventory, leaders] = await Promise.all([
// // //             analyticsService.getExecutiveStats(orgId, branchId, start, end),
// // //             analyticsService.getChartData(orgId, branchId, start, end, 'day'),
// // //             analyticsService.getInventoryAnalytics(orgId, branchId),
// // //             analyticsService.getLeaderboards(orgId, branchId, start, end)
// // //         ]);

// // //         res.status(200).json({
// // //             status: 'success',
// // //             message: 'Dashboard analytics retrieved successfully',
// // //             data: {
// // //                 period: { start, end },
// // //                 kpi,
// // //                 charts,
// // //                 inventory,
// // //                 leaders
// // //             }
// // //         });
// // //     } catch (error) {
// // //         // Pass to your global error handler
// // //         res.status(500).json({ status: 'error', message: error.message });
// // //     }
// // // };

// // // /**
// // //  * 2. FINANCIAL REPORT (Deep Dive)
// // //  * Focused specifically on P&L and Cashflow
// // //  */
// // // exports.getFinancialReport = async (req, res, next) => {
// // //     try {
// // //         const { start, end } = getDateRange(req.query);
// // //         const { branchId, interval } = req.query; // interval = 'day' or 'month'
// // //         const orgId = req.user.organizationId;

// // //         const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
// // //         const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

// // //         res.status(200).json({
// // //             status: 'success',
// // //             data: { kpi, charts }
// // //         });
// // //     } catch (error) {
// // //         res.status(500).json({ status: 'error', message: error.message });
// // //     }
// // // };

// // // /**
// // //  * 3. INVENTORY REPORT
// // //  * Focused on stock levels and valuation
// // //  */
// // // exports.getInventoryReport = async (req, res, next) => {
// // //     try {
// // //         const { branchId } = req.query;
// // //         const orgId = req.user.organizationId;

// // //         const data = await analyticsService.getInventoryAnalytics(orgId, branchId);

// // //         res.status(200).json({
// // //             status: 'success',
// // //             data
// // //         });
// // //     } catch (error) {
// // //         res.status(500).json({ status: 'error', message: error.message });
// // //     }
// // // };