const analyticsService = require('../services/analyticsService');
const { Parser } = require('json2csv');
const catchAsync = require('../utils/catchAsync'); // ✅ Standardized
const AppError = require('../utils/appError');

/**
 * UTILITY: Get Safe Date Range
 * Prevents "Invalid Date" crashes
 */
const getDateRange = (query) => {
    const now = new Date();
    
    // Helper to validate date
    const parseDate = (d) => {
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
    };

    // Default: Start of current month
    let start = parseDate(query.startDate) || new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Default: End of current day
    let end = parseDate(query.endDate) || new Date();
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

/* ==========================================================================
   1. EXECUTIVE & STRATEGIC
   ========================================================================== */

exports.getDashboardOverview = catchAsync(async (req, res, next) => {
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
});

exports.getBranchComparison = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const orgId = req.user.organizationId;
    const data = await analyticsService.getBranchComparisonStats(orgId, start, end);
    res.status(200).json({ status: 'success', data });
});

/* ==========================================================================
   2. FINANCIAL INTELLIGENCE
   ========================================================================== */

exports.getFinancialReport = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const { branchId, interval } = req.query; 
    const orgId = req.user.organizationId;

    const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
    const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

    res.status(200).json({ status: 'success', data: { kpi, charts } });
});

exports.getProfitabilityReport = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);
    res.status(200).json({ status: 'success', data: profitStats });
});

exports.getCashFlowReport = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getCashFlowStats(orgId, branchId, start, end);
    res.status(200).json({ status: 'success', data });
});

exports.getDebtorAgingReport = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
    res.status(200).json({ status: 'success', data: agingReport });
});

exports.getTaxReport = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getTaxStats(orgId, branchId, start, end);
    res.status(200).json({ status: 'success', data });
});

/* ==========================================================================
   3. OPERATIONAL & STAFF EFFICIENCY
   ========================================================================== */

exports.getStaffPerformance = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);
    res.status(200).json({ status: 'success', data: staffStats });
});

exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);
    res.status(200).json({ status: 'success', data });
});

exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
    res.status(200).json({ status: 'success', data: heatmap });
});

exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getProcurementStats(orgId, branchId, start, end);
    res.status(200).json({ status: 'success', data });
});

exports.getCustomerInsights = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
    res.status(200).json({ status: 'success', data });
});

/* ==========================================================================
   4. INVENTORY INTELLIGENCE
   ========================================================================== */

exports.getInventoryReport = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
    res.status(200).json({ status: 'success', data });
});

exports.getProductPerformance = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
    res.status(200).json({ status: 'success', data });
});

exports.getDeadStockReport = catchAsync(async (req, res, next) => {
    const { branchId, daysThreshold } = req.query;
    const orgId = req.user.organizationId;
    const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);
    res.status(200).json({ status: 'success', data: deadStock });
});

exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
    res.status(200).json({ status: 'success', data: predictions });
});

/* ==========================================================================
   5. PREDICTIVE & ADVANCED
   ========================================================================== */

exports.getSalesForecast = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const forecast = await analyticsService.generateForecast(orgId, branchId);
    res.status(200).json({ status: 'success', data: forecast });
});

exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
    const orgId = req.user.organizationId;
    const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
    res.status(200).json({ status: 'success', data: segments });
});

exports.getCustomerRetention = catchAsync(async (req, res, next) => {
    const orgId = req.user.organizationId;
    const months = req.query.months ? parseInt(req.query.months) : 6;
    const data = await analyticsService.getCohortAnalysis(orgId, months); 
    res.status(200).json({ status: 'success', data });
});

exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
    res.status(200).json({ status: 'success', data: alerts });
});

/* ==========================================================================
   6. SECURITY & EXPORT
   ========================================================================== */

exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
    const { start, end } = getDateRange(req.query);
    const orgId = req.user.organizationId;
    const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);
    res.status(200).json({ status: 'success', data: securityStats });
});

exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
    const { type, format = 'csv' } = req.query; 
    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);
    
    // Validate Export Type
    if (!type) return next(new AppError('Export type is required (e.g., financial, sales)', 400));

    const data = await analyticsService.getExportData(orgId, type, start, end);

    if (format === 'csv') {
        if (!data || data.length === 0) {
            return next(new AppError('No data available to export for this range', 404));
        }

        const parser = new Parser();
        const csv = parser.parse(data);
        
        res.header('Content-Type', 'text/csv');
        res.attachment(`${type}-report-${Date.now()}.csv`);
        return res.send(csv);
    }

    res.status(200).json({ status: 'success', data });
});

/* ==========================================================================
   7. CUSTOMER 360 INTELLIGENCE (NEW)
   ========================================================================== */

// 1. Customer Lifetime Value (LTV) & Acquisition Cost
exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    
    const data = await analyticsService.calculateLTV(orgId, branchId);
    
    res.status(200).json({ 
        status: 'success', 
        message: 'Customer LTV calculated successfully',
        data 
    });
});

// 2. Churn Risk (At-risk customers based on Recency)
exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
    const { daysThreshold = 90 } = req.query; // Default: No purchase in 90 days = At Risk
    const orgId = req.user.organizationId;

    const data = await analyticsService.analyzeChurnRisk(orgId, parseInt(daysThreshold));

    res.status(200).json({ 
        status: 'success', 
        data 
    });
});

// 3. Market Basket Analysis (Cross-Selling Patterns)
exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
    const orgId = req.user.organizationId;
    const { minSupport = 2 } = req.query; // Minimum times items bought together

    const data = await analyticsService.performBasketAnalysis(orgId, parseInt(minSupport));

    res.status(200).json({ 
        status: 'success', 
        data 
    });
});

// 4. Payment Behavior (Average Days to Pay)
exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.analyzePaymentHabits(orgId, branchId);

    res.status(200).json({ 
        status: 'success', 
        data 
    });
});

// const analyticsService = require('../services/analyticsService');
// const { Parser } = require('json2csv'); // Ensure you run: npm install json2csv

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

// /* ==========================================================================
//    1. EXECUTIVE & STRATEGIC
//    ========================================================================== */

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

// exports.getBranchComparison = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getBranchComparisonStats(orgId, start, end);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    2. FINANCIAL INTELLIGENCE
//    ========================================================================== */

// exports.getFinancialReport = async (req, res) => {
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

// exports.getProfitabilityReport = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);
//         res.status(200).json({ status: 'success', data: profitStats });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getCashFlowReport = async (req, res) => {
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

// exports.getDebtorAgingReport = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
//         res.status(200).json({ status: 'success', data: agingReport });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getTaxReport = async (req, res) => {
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

// /* ==========================================================================
//    3. OPERATIONAL & STAFF EFFICIENCY
//    ========================================================================== */

// exports.getStaffPerformance = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);
//         res.status(200).json({ status: 'success', data: staffStats });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getOperationalMetrics = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getPeakBusinessHours = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
//         res.status(200).json({ status: 'success', data: heatmap });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getProcurementAnalysis = async (req, res) => {
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

// exports.getCustomerInsights = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    4. INVENTORY INTELLIGENCE
//    ========================================================================== */

// exports.getInventoryReport = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getProductPerformance = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getDeadStockReport = async (req, res) => {
//     try {
//         const { branchId, daysThreshold } = req.query;
//         const orgId = req.user.organizationId;
//         const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);
//         res.status(200).json({ status: 'success', data: deadStock });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getStockOutPredictions = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
//         res.status(200).json({ status: 'success', data: predictions });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    5. PREDICTIVE & ADVANCED
//    ========================================================================== */

// exports.getSalesForecast = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const forecast = await analyticsService.generateForecast(orgId, branchId);
//         res.status(200).json({ status: 'success', data: forecast });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getCustomerSegmentation = async (req, res) => {
//     try {
//         const orgId = req.user.organizationId;
//         const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
//         res.status(200).json({ status: 'success', data: segments });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getCustomerRetention = async (req, res) => {
//     try {
//         const orgId = req.user.organizationId;
//         const months = req.query.months ? parseInt(req.query.months) : 6;
//         const data = await analyticsService.getCohortAnalysis(orgId, months); 
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.getCriticalAlerts = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
//         res.status(200).json({ status: 'success', data: alerts });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    6. SECURITY & EXPORT
//    ========================================================================== */

// exports.getSecurityAuditLog = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const orgId = req.user.organizationId;
//         const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);
//         res.status(200).json({ status: 'success', data: securityStats });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// exports.exportAnalyticsData = async (req, res) => {
//     try {
//         const { type, format = 'csv' } = req.query; 
//         const orgId = req.user.organizationId;
//         const { start, end } = getDateRange(req.query);
//         const data = await analyticsService.getExportData(orgId, type, start, end);

//         if (format === 'csv') {
//             const parser = new Parser();
//             const csv = parser.parse(data);
//             res.header('Content-Type', 'text/csv');
//             res.attachment(`${type}-report-${Date.now()}.csv`);
//             return res.send(csv);
//         }

//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };
