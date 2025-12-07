const analyticsService = require('../services/analyticsService');
const { Parser } = require('json2csv'); // Ensure you run: npm install json2csv

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

/* ==========================================================================
   1. EXECUTIVE & STRATEGIC
   ========================================================================== */

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

exports.getBranchComparison = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query);
        const orgId = req.user.organizationId;
        const data = await analyticsService.getBranchComparisonStats(orgId, start, end);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ==========================================================================
   2. FINANCIAL INTELLIGENCE
   ========================================================================== */

exports.getFinancialReport = async (req, res) => {
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

exports.getProfitabilityReport = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);
        res.status(200).json({ status: 'success', data: profitStats });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getCashFlowReport = async (req, res) => {
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

exports.getDebtorAgingReport = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
        res.status(200).json({ status: 'success', data: agingReport });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getTaxReport = async (req, res) => {
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

/* ==========================================================================
   3. OPERATIONAL & STAFF EFFICIENCY
   ========================================================================== */

exports.getStaffPerformance = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);
        res.status(200).json({ status: 'success', data: staffStats });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getOperationalMetrics = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query);
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getPeakBusinessHours = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
        res.status(200).json({ status: 'success', data: heatmap });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getProcurementAnalysis = async (req, res) => {
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

exports.getCustomerInsights = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ==========================================================================
   4. INVENTORY INTELLIGENCE
   ========================================================================== */

exports.getInventoryReport = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getProductPerformance = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getDeadStockReport = async (req, res) => {
    try {
        const { branchId, daysThreshold } = req.query;
        const orgId = req.user.organizationId;
        const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);
        res.status(200).json({ status: 'success', data: deadStock });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getStockOutPredictions = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
        res.status(200).json({ status: 'success', data: predictions });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ==========================================================================
   5. PREDICTIVE & ADVANCED
   ========================================================================== */

exports.getSalesForecast = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const forecast = await analyticsService.generateForecast(orgId, branchId);
        res.status(200).json({ status: 'success', data: forecast });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getCustomerSegmentation = async (req, res) => {
    try {
        const orgId = req.user.organizationId;
        const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
        res.status(200).json({ status: 'success', data: segments });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getCustomerRetention = async (req, res) => {
    try {
        const orgId = req.user.organizationId;
        const months = req.query.months ? parseInt(req.query.months) : 6;
        const data = await analyticsService.getCohortAnalysis(orgId, months); 
        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.getCriticalAlerts = async (req, res) => {
    try {
        const { branchId } = req.query;
        const orgId = req.user.organizationId;
        const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
        res.status(200).json({ status: 'success', data: alerts });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

/* ==========================================================================
   6. SECURITY & EXPORT
   ========================================================================== */

exports.getSecurityAuditLog = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query);
        const orgId = req.user.organizationId;
        const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);
        res.status(200).json({ status: 'success', data: securityStats });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

exports.exportAnalyticsData = async (req, res) => {
    try {
        const { type, format = 'csv' } = req.query; 
        const orgId = req.user.organizationId;
        const { start, end } = getDateRange(req.query);
        const data = await analyticsService.getExportData(orgId, type, start, end);

        if (format === 'csv') {
            const parser = new Parser();
            const csv = parser.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment(`${type}-report-${Date.now()}.csv`);
            return res.send(csv);
        }

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
//     let start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
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

// // ------------------------------------------------------
// // Compare performance across different branches (Revenue, Footfall, Avg Basket Size)
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

// // Profitability Analysis: Revenue vs. COGS (Cost of Goods Sold)
// exports.getProfitabilityReport = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         // Calculates Gross Profit = Sales - (Purchase Price * Qty)
//         const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);

//         res.status(200).json({ status: 'success', data: profitStats });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    2. OPERATIONAL EFFICIENCY
//    ========================================================================== */

// // Employee Leaderboard & Efficiency
// exports.getStaffPerformance = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         // Metrics: Total Sales, # of Invoices, Avg Deal Size, Discount Given %
//         const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);

//         res.status(200).json({ status: 'success', data: staffStats });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // Peak Hours Heatmap (Day of Week vs. Hour of Day)
// exports.getPeakBusinessHours = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;
//         // Usually looks at last 30-90 days to determine trends
//         const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);

//         res.status(200).json({ status: 'success', data: heatmap });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    3. INVENTORY INTELLIGENCE
//    ========================================================================== */

// // Dead Stock & Slow Movers (Products not sold in X days)
// exports.getDeadStockReport = async (req, res) => {
//     try {
//         const { branchId, daysThreshold = 90 } = req.query;
//         const orgId = req.user.organizationId;

//         const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);

//         res.status(200).json({ status: 'success', data: deadStock });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // Low Stock Predictions (Based on average daily sales)
// exports.getStockOutPredictions = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         // Returns products likely to run out in 7/14/30 days based on run-rate
//         const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);

//         res.status(200).json({ status: 'success', data: predictions });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    4. FINANCIAL HEALTH (DEBT & CASH)
//    ========================================================================== */

// // Accounts Receivable Aging (Who owes us money?)
// exports.getDebtorAgingReport = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         // Buckets: 0-30 days, 31-60 days, 61-90 days, 90+ days
//         const agingReport = await analyticsService.getDebtorAging(orgId, branchId);

//         res.status(200).json({ status: 'success', data: agingReport });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// /* ==========================================================================
//    5. AUDIT & EXPORTS
//    ========================================================================== */

// // Security Audit Visualization
// exports.getSecurityAuditLog = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const orgId = req.user.organizationId;

//         // Returns: Failed logins, bulk exports, deletions, high-value manual adjustments
//         const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);

//         res.status(200).json({ status: 'success', data: securityStats });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // Universal Export (CSV/Excel)
// exports.exportAnalyticsData = async (req, res) => {
//     try {
//         const { type, format = 'csv' } = req.query; // type = 'sales', 'inventory', 'tax'
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


// // 8. PREDICTIVE FORECAST
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

// // 9. CUSTOMER SEGMENTATION (RFM)
// exports.getCustomerSegmentation = async (req, res) => {
//     try {
//         const orgId = req.user.organizationId;
//         const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
//         res.status(200).json({ status: 'success', data: segments });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 10. CUSTOMER RETENTION (Cohort)
// exports.getCustomerRetention = async (req, res) => {
//     try {
//         const orgId = req.user.organizationId;
//         // Default to last 6 months
//         const data = await analyticsService.getCohortAnalysis(orgId, 6); 
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };
// // ... existing controller code ...

// // ==============================================================================
// // 🆕 MISSING CONTROLLERS (Connects to existing Service logic)
// // ==============================================================================

// // 8. SALES FORECASTING (Linear Regression)
// exports.getSalesForecast = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         // Service: generateForecast
//         const forecast = await analyticsService.generateForecast(orgId, branchId);

//         res.status(200).json({ status: 'success', data: forecast });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 9. CUSTOMER SEGMENTATION (RFM Analysis)
// exports.getCustomerSegmentation = async (req, res) => {
//     try {
//         const orgId = req.user.organizationId;
        
//         // Service: getCustomerRFMAnalysis
//         const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
        
//         res.status(200).json({ status: 'success', data: segments });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 10. CUSTOMER RETENTION (Cohort Analysis)
// exports.getCustomerRetention = async (req, res) => {
//     try {
//         const orgId = req.user.organizationId;
//         // Default to looking back 6 months
//         const months = req.query.months ? parseInt(req.query.months) : 6;

//         // Service: getCohortAnalysis
//         const data = await analyticsService.getCohortAnalysis(orgId, months); 
        
//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 11. CRITICAL ALERTS (Low Stock + High Risk Debt)
// exports.getCriticalAlerts = async (req, res) => {
//     try {
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         // Service: getCriticalAlerts
//         const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);

//         res.status(200).json({ status: 'success', data: alerts });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };

// // 12. OPERATIONAL METRICS (Discounts & Cancellation Rates)
// // You had getStaffPerformance, but you missed the "Efficiency" part of getOperationalStats
// exports.getOperationalMetrics = async (req, res) => {
//     try {
//         const { start, end } = getDateRange(req.query);
//         const { branchId } = req.query;
//         const orgId = req.user.organizationId;

//         // Service: getOperationalStats
//         const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);

//         res.status(200).json({ status: 'success', data });
//     } catch (error) {
//         res.status(500).json({ status: 'error', message: error.message });
//     }
// };