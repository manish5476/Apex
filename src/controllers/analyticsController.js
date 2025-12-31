const analyticsService = require("../services/analyticsService");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { performance } = require("perf_hooks");

/**
 * Smart Date Range with Validation
 */
const getDateRange = (query) => {
    const now = new Date();

    // Helper to validate and parse date
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const parsed = new Date(dateStr);
        return isNaN(parsed.getTime()) ? null : parsed;
    };

    let start =
        parseDate(query.startDate) ||
        new Date(now.getFullYear(), now.getMonth(), 1);

    let end = parseDate(query.endDate) || new Date();
    end.setHours(23, 59, 59, 999);

    // Ensure start is before end
    if (start > end) {
        [start, end] = [end, start];
    }

    // Limit max range to 1 year for performance
    const maxDays = 365;
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
        end = new Date(start);
        end.setDate(start.getDate() + maxDays);
    }

    return { start, end };
};

/**
 * Response Formatter
 */
const formatResponse = (res, data, startTime, options = {}) => {
    const responseTime = performance.now() - startTime;

    const response = {
        status: "success",
        data: data,
        meta: {
            timestamp: new Date().toISOString(),
            responseTime: `${responseTime.toFixed(2)}ms`,
            ...options.meta,
        },
    };

    res.status(200).json(response);
};

/* ==========================================================================
   1. SMART DASHBOARD ENDPOINTS
   ========================================================================== */

exports.getDashboardOverview = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId, cache = "true" } = req.query;
    const orgId = req.user.organizationId;

    // Try cache first if enabled
    const cacheKey = `dashboard_${orgId}_${branchId || "all"}_${start.toISOString()}_${end.toISOString()}`;

    if (cache === "true") {
        const cached = await analyticsService.getCachedData(cacheKey);
        if (cached) {
            return formatResponse(res, cached, startTime, {
                meta: { cached: true, source: "redis" },
            });
        }
    }

    // Get data
    const [kpi, charts, inventory, leaders, alerts] = await Promise.all([
        analyticsService.getExecutiveStats(orgId, branchId, start, end),
        analyticsService.getChartData(orgId, branchId, start, end, "day"),
        analyticsService.getInventoryAnalytics(orgId, branchId),
        analyticsService.getLeaderboards(orgId, branchId, start, end),
        analyticsService.getCriticalAlerts(orgId, branchId),
    ]);

    const responseData = {
        period: {
            start,
            end,
            days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
        },
        kpi,
        charts,
        inventory,
        leaders,
        alerts,
    };

    // Cache the response
    if (cache === "true") {
        await analyticsService.cacheData(cacheKey, responseData, 300);
    }

    formatResponse(res, responseData, startTime, {
        meta: { branchId: branchId || "all", cached: false },
    });
});

exports.getBranchComparison = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { groupBy = "revenue", limit = 10 } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.getBranchComparisonStats(
        orgId,
        start,
        end,
        groupBy,
        parseInt(limit),
    );

    formatResponse(res, { branches: data, total: data.length }, startTime);
});

/* ==========================================================================
   2. ENHANCED FINANCIAL REPORTS
   ========================================================================== */

// Alias for getFinancialDashboard to match both routes
exports.getFinancialDashboard = exports.getFinancialReport = catchAsync(
    async (req, res, next) => {
        const startTime = performance.now();
        const { start, end } = getDateRange(req.query);
        const { branchId, interval = "auto", metrics = "all" } = req.query;
        const orgId = req.user.organizationId;

        const [kpi, charts] = await Promise.all([
            analyticsService.getExecutiveStats(orgId, branchId, start, end),
            analyticsService.getChartData(
                orgId,
                branchId,
                start,
                end,
                interval === "auto" ? null : interval,
            ),
        ]);

        formatResponse(
            res,
            {
                period: { start, end },
                summary: kpi,
                trends: charts,
            },
            startTime,
        );
    },
);

exports.getProfitabilityReport = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const profitStats = await analyticsService.getGrossProfitAnalysis(
        orgId,
        branchId,
        start,
        end,
    );
    formatResponse(res, profitStats, startTime);
});

exports.getCashFlowReport = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId, projectionDays = 30 } = req.query;
    const orgId = req.user.organizationId;

    const [currentFlow, projections, aging] = await Promise.all([
        analyticsService.getCashFlowStats(orgId, branchId, start, end),
        analyticsService.generateCashFlowProjection(
            orgId,
            branchId,
            parseInt(projectionDays),
        ),
        analyticsService.getDebtorAging(orgId, branchId),
    ]);

    formatResponse(
        res,
        {
            current: currentFlow,
            projections,
            aging,
        },
        startTime,
    );
});

exports.getDebtorAgingReport = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
    formatResponse(res, agingReport, startTime);
});

exports.getTaxReport = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.getTaxStats(
        orgId,
        branchId,
        start,
        end,
    );
    formatResponse(res, data, startTime);
});

/* ==========================================================================
   3. OPERATIONAL INTELLIGENCE
   ========================================================================== */

exports.getStaffPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId, minSales = 0, sortBy = "revenue" } = req.query;
    const orgId = req.user.organizationId;

    const staffStats = await analyticsService.getEmployeePerformance(
        orgId,
        branchId,
        start,
        end,
        parseFloat(minSales),
        sortBy,
    );

    formatResponse(
        res,
        {
            staff: staffStats,
            summary: {
                totalStaff: staffStats.length,
                topPerformer: staffStats[0]?.name || "N/A",
            },
        },
        startTime,
    );
});

exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId, includeDetails = "false" } = req.query;
    const orgId = req.user.organizationId;

    const [metrics, peakHours] = await Promise.all([
        analyticsService.getOperationalStats(orgId, branchId, start, end),
        analyticsService.getPeakHourAnalysis(orgId, branchId),
    ]);

    const response = {
        overview: {
            efficiency: metrics.orderEfficiency,
            discounts: metrics.discountMetrics,
            staffPerformance: metrics.topStaff.slice(0, 3),
        },
        peakHours: {
            hours: peakHours.slice(0, 24),
            recommendations:
                analyticsService.generateStaffingRecommendations(peakHours),
        },
    };

    if (includeDetails === "true") {
        response.detailedMetrics = metrics;
    }

    formatResponse(res, response, startTime);
});

exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
    formatResponse(res, heatmap, startTime);
});

exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.getProcurementStats(
        orgId,
        branchId,
        start,
        end,
    );
    formatResponse(res, data, startTime);
});

exports.getCustomerInsights = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
    formatResponse(res, data, startTime);
});

/* ==========================================================================
   4. INTELLIGENT INVENTORY MANAGEMENT
   ========================================================================== */

exports.getInventoryHealth = exports.getInventoryReport = catchAsync(
    async (req, res, next) => {
        const startTime = performance.now();
        const {
            branchId,
            includeValuation = "true",
            includePredictions = "true",
        } = req.query;
        const orgId = req.user.organizationId;

        const [analytics, performance, deadStock, predictions] =
            await Promise.all([
                analyticsService.getInventoryAnalytics(orgId, branchId),
                analyticsService.getProductPerformanceStats(orgId, branchId),
                analyticsService.getDeadStockAnalysis(orgId, branchId, 90),
                includePredictions === "true"
                    ? analyticsService.getInventoryRunRate(orgId, branchId)
                    : Promise.resolve([]),
            ]);

        const response = {
            alerts: {
                lowStock: analytics.lowStockAlerts.length,
                deadStock: deadStock.length,
                criticalItems: predictions.filter(
                    (p) => p.daysUntilStockout <= 7,
                ).length,
            },
            topProducts: performance.highMargin.slice(0, 10),
            deadStock: deadStock.slice(0, 20),
            predictions: predictions.filter((p) => p.daysUntilStockout <= 30),
        };

        if (includeValuation === "true") {
            response.valuation = analytics.inventoryValuation;
        }

        formatResponse(res, response, startTime);
    },
);

exports.getProductPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.getProductPerformanceStats(
        orgId,
        branchId,
    );
    formatResponse(res, data, startTime);
});

exports.getDeadStockReport = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, daysThreshold } = req.query;
    const orgId = req.user.organizationId;

    const deadStock = await analyticsService.getDeadStockAnalysis(
        orgId,
        branchId,
        daysThreshold,
    );
    formatResponse(res, deadStock, startTime);
});

exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const predictions = await analyticsService.getInventoryRunRate(
        orgId,
        branchId,
    );
    formatResponse(res, predictions, startTime);
});

/* ==========================================================================
   5. PREDICTIVE ANALYTICS
   ========================================================================== */

exports.getSalesForecast = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, periods = 3, confidence = 0.95 } = req.query;
    const orgId = req.user.organizationId;

    const forecast = await analyticsService.generateAdvancedForecast(
        orgId,
        branchId,
        parseInt(periods),
        parseFloat(confidence),
    );

    formatResponse(res, forecast, startTime);
});

exports.getCustomerIntelligence = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const {
        branchId,
        includeSegments = "true",
        includeChurn = "true",
    } = req.query;
    const orgId = req.user.organizationId;

    const [segments, churnRisk, ltv, paymentBehavior] = await Promise.all([
        includeSegments === "true"
            ? analyticsService.getCustomerRFMAnalysis(orgId)
            : Promise.resolve({}),
        includeChurn === "true"
            ? analyticsService.analyzeChurnRisk(orgId, 90)
            : Promise.resolve([]),
        analyticsService.calculateLTV(orgId, branchId),
        analyticsService.analyzePaymentHabits(orgId, branchId),
    ]);

    formatResponse(
        res,
        {
            segmentation: segments,
            riskAnalysis: {
                highRisk: churnRisk.slice(0, 10),
                totalAtRisk: churnRisk.length,
            },
            valueAnalysis: {
                topLTV: ltv.customers?.slice(0, 10) || [],
                avgLTV: ltv.summary?.avgLTV || 0,
            },
            paymentBehavior: paymentBehavior.slice(0, 15),
        },
        startTime,
    );
});

exports.getCustomerRetention = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;
    const months = req.query.months ? parseInt(req.query.months) : 6;

    const data = await analyticsService.getCohortAnalysis(orgId, months);
    formatResponse(res, data, startTime);
});

exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;

    const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
    formatResponse(res, segments, startTime);
});

exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
    formatResponse(res, alerts, startTime);
});

/* ==========================================================================
   6. CUSTOMER INTELLIGENCE
   ========================================================================== */

exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.calculateLTV(orgId, branchId);
    formatResponse(res, data, startTime);
});

exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { daysThreshold = 90 } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.analyzeChurnRisk(
        orgId,
        parseInt(daysThreshold),
    );
    formatResponse(res, data, startTime);
});

exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;
    const { minSupport = 2 } = req.query;

    const data = await analyticsService.performBasketAnalysis(
        orgId,
        parseInt(minSupport),
    );
    formatResponse(res, data, startTime);
});

exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const data = await analyticsService.analyzePaymentHabits(orgId, branchId);
    formatResponse(res, data, startTime);
});

/* ==========================================================================
   7. SECURITY & MONITORING
   ========================================================================== */

exports.getSystemAlerts = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, severity, limit = 20 } = req.query;
    const orgId = req.user.organizationId;

    const alerts = await analyticsService.getRealTimeAlerts(
        orgId,
        branchId,
        severity,
        parseInt(limit),
    );

    formatResponse(
        res,
        {
            alerts,
            summary: {
                total: alerts.length,
            },
            lastUpdated: new Date().toISOString(),
        },
        startTime,
    );
});

exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const orgId = req.user.organizationId;

    const securityStats = await analyticsService.getSecurityPulse(
        orgId,
        start,
        end,
    );
    formatResponse(res, securityStats, startTime);
});

/* ==========================================================================
   8. EXPORT SYSTEM
   ========================================================================== */

exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const {
        type,
        format = "csv",
        compression = "false",
        columns = "all",
    } = req.query;

    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);

    if (!type) {
        return next(
            new AppError(
                "Export type is required (e.g., financial, sales, inventory)",
                400,
            ),
        );
    }

    // Get export configuration
    const exportConfig = analyticsService.getExportConfig(type, columns);

    // Get data with selected columns only
    const data = await analyticsService.getExportData(
        orgId,
        type,
        start,
        end,
        exportConfig.columns,
    );

    if (!data || data.length === 0) {
        return next(new AppError("No data available to export", 404));
    }

    switch (format.toLowerCase()) {
        case "csv":
            const csvContent = analyticsService.convertToCSV(
                data,
                exportConfig,
            );
            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename=${type}-${Date.now()}.csv`,
            );
            return res.status(200).send(csvContent);

        case "excel":
            const excelBuffer = await analyticsService.convertToExcel(
                data,
                exportConfig,
            );
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename=${type}-${Date.now()}.xlsx`,
            );
            return res.status(200).send(excelBuffer);

        case "pdf":
            const pdfBuffer = await analyticsService.convertToPDF(
                data,
                exportConfig,
            );
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename=${type}-${Date.now()}.pdf`,
            );
            return res.status(200).send(pdfBuffer);

        case "json":
        default:
            formatResponse(
                res,
                {
                    export: {
                        type,
                        format: "json",
                        recordCount: data.length,
                        data,
                    },
                },
                startTime,
            );
    }
});

/* ==========================================================================
   9. CUSTOM QUERY & SYSTEM HEALTH
   ========================================================================== */

exports.customQuery = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { query, parameters = {}, limit = 1000 } = req.body;
    const orgId = req.user.organizationId;

    if (!query) {
        return next(new AppError("Query is required", 400));
    }

    // Validate query
    const safeQuery = analyticsService.validateAndParseQuery(query);

    // Execute query
    const result = await analyticsService.executeCustomQuery(
        orgId,
        safeQuery,
        parameters,
        parseInt(limit),
    );

    formatResponse(
        res,
        {
            query: safeQuery,
            parameters,
            result,
        },
        startTime,
    );
});

exports.getAnalyticsPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { hours = 24 } = req.query;
    const orgId = req.user.organizationId;

    const performanceStats = await analyticsService.getPerformanceMetrics(
        orgId,
        parseInt(hours),
    );

    formatResponse(
        res,
        {
            performance: performanceStats,
        },
        startTime,
    );
});

exports.getDataHealth = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;

    const healthCheck = await analyticsService.performDataHealthCheck(orgId);

    formatResponse(
        res,
        {
            health: healthCheck,
            score: analyticsService.calculateDataHealthScore(healthCheck),
            issues: healthCheck.filter((item) => item.status !== "healthy"),
            lastCheck: new Date().toISOString(),
        },
        startTime,
    );
});

// Export the original getFinancialReport for backward compatibility
exports.getFinancialReport = exports.getFinancialDashboard;
// const analyticsService = require("../services/analyticsService");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const { performance } = require("perf_hooks");

// /**
//  * Smart Date Range with Validation
//  */
// const getDateRange = (query) => {
//     const now = new Date();

//     // Helper to validate and parse date
//     const parseDate = (dateStr) => {
//         if (!dateStr) return null;
//         const parsed = new Date(dateStr);
//         return isNaN(parsed.getTime()) ? null : parsed;
//     };

//     let start =
//         parseDate(query.startDate) ||
//         new Date(now.getFullYear(), now.getMonth(), 1);

//     let end = parseDate(query.endDate) || new Date();
//     end.setHours(23, 59, 59, 999);

//     // Ensure start is before end
//     if (start > end) {
//         [start, end] = [end, start];
//     }

//     // Limit max range to 1 year for performance
//     const maxDays = 365;
//     const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
//     if (diffDays > maxDays) {
//         end = new Date(start);
//         end.setDate(start.getDate() + maxDays);
//     }

//     return { start, end };
// };

// /**
//  * Response Formatter with Performance Metrics
//  */
// const formatResponse = (res, data, startTime, options = {}) => {
//     const responseTime = performance.now() - startTime;

//     const response = {
//         status: "success",
//         data: data,
//         meta: {
//             timestamp: new Date().toISOString(),
//             responseTime: `${responseTime.toFixed(2)}ms`,
//             ...options.meta,
//         },
//     };

//     // Add performance warning for slow responses
//     if (responseTime > 2000) {
//         response.meta.performanceWarning = "Response time exceeded 2 seconds";
//     }

//     res.status(200).json(response);
// };

// /* ==========================================================================
//    1. SMART DASHBOARD ENDPOINTS
//    ========================================================================== */

// /**
//  * Intelligent Dashboard with Caching Support
//  */
// exports.getDashboardOverview = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, cache = true } = req.query;
//     const orgId = req.user.organizationId;

//     const cacheKey = `dashboard_${orgId}_${branchId || "all"}_${start.toISOString()}_${end.toISOString()}`;

//     // Try cache first if enabled
//     if (cache === "true") {
//         const cached = await analyticsService.getCachedData(cacheKey);
//         if (cached) {
//             return formatResponse(res, cached, startTime, {
//                 meta: { cached: true, source: "redis" },
//             });
//         }
//     }

//     // Parallel execution for critical metrics
//     const [kpi, charts, inventory, leaders, alerts] = await Promise.all([
//         analyticsService.getExecutiveStats(orgId, branchId, start, end),
//         analyticsService.getChartData(orgId, branchId, start, end, "day"),
//         analyticsService.getInventoryAnalytics(orgId, branchId),
//         analyticsService.getLeaderboards(orgId, branchId, start, end, "top_5"),
//         analyticsService.getCriticalAlerts(orgId, branchId),
//     ]);

//     // Calculate insights
//     const insights = analyticsService.generateInsights(kpi, inventory, leaders);

//     const responseData = {
//         period: {
//             start,
//             end,
//             days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
//         },
//         kpi,
//         charts,
//         inventory: {
//             ...inventory,
//             insights:
//                 inventory.lowStockAlerts.length > 0
//                     ? `${inventory.lowStockAlerts.length} items need restocking`
//                     : "Stock levels are healthy",
//         },
//         leaders,
//         alerts,
//         insights,
//     };

//     // Cache the response
//     if (cache === "true") {
//         await analyticsService.cacheData(cacheKey, responseData, 300); // 5 minutes
//     }

//     formatResponse(res, responseData, startTime, {
//         meta: { branchId: branchId || "all", cached: false },
//     });
// });

// /**
//  * Branch Comparison with Smart Grouping
//  */
// exports.getBranchComparison = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { groupBy = "revenue", limit = 10 } = req.query;
//     const orgId = req.user.organizationId;

//     const data = await analyticsService.getBranchComparisonStats(
//         orgId,
//         start,
//         end,
//         groupBy,
//         parseInt(limit),
//     );

//     // Add rankings
//     const rankedData = data.map((branch, index) => ({
//         rank: index + 1,
//         ...branch,
//     }));

//     formatResponse(
//         res,
//         { branches: rankedData, total: data.length },
//         startTime,
//     );
// });

// /* ==========================================================================
//    2. ENHANCED FINANCIAL REPORTS
//    ========================================================================== */

// /**
//  * Financial Dashboard with Granular Control
//  */
// exports.getFinancialDashboard = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, interval = "auto", metrics = "all" } = req.query;
//     const orgId = req.user.organizationId;

//     // Auto-detect interval based on date range
//     const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
//     const autoInterval =
//         daysDiff > 90 ? "month" : daysDiff > 30 ? "week" : "day";
//     const finalInterval = interval === "auto" ? autoInterval : interval;

//     const [kpi, charts, cashflow, profitability] = await Promise.all([
//         analyticsService.getExecutiveStats(orgId, branchId, start, end),
//         analyticsService.getChartData(
//             orgId,
//             branchId,
//             start,
//             end,
//             finalInterval,
//         ),
//         analyticsService.getCashFlowStats(orgId, branchId, start, end),
//         analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end),
//     ]);

//     // Filter metrics if requested
//     const requestedMetrics = metrics.split(",");
//     const filteredKpi =
//         metrics !== "all"
//             ? Object.fromEntries(
//                   Object.entries(kpi).filter(([key]) =>
//                       requestedMetrics.includes(key),
//                   ),
//               )
//             : kpi;

//     formatResponse(
//         res,
//         {
//             period: { start, end, interval: finalInterval },
//             summary: filteredKpi,
//             trends: charts,
//             cashflow,
//             profitability,
//             recommendations: analyticsService.generateFinancialRecommendations(
//                 kpi,
//                 profitability,
//             ),
//         },
//         startTime,
//     );
// });

// /**
//  * Real-time Cash Flow with Projections
//  */
// exports.getCashFlowReport = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, projectionDays = 30 } = req.query;
//     const orgId = req.user.organizationId;

//     const [currentFlow, projections, aging] = await Promise.all([
//         analyticsService.getCashFlowStats(orgId, branchId, start, end),
//         analyticsService.generateCashFlowProjection(
//             orgId,
//             branchId,
//             parseInt(projectionDays),
//         ),
//         analyticsService.getDebtorAging(orgId, branchId),
//     ]);

//     formatResponse(
//         res,
//         {
//             current: currentFlow,
//             projections,
//             aging,
//             cashHealth: analyticsService.assessCashHealth(
//                 currentFlow,
//                 projections,
//             ),
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    3. ENHANCED OPERATIONAL INTELLIGENCE
//    ========================================================================== */

// /**
//  * Staff Performance with Productivity Metrics
//  */
// exports.getStaffPerformance = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, minSales = 0, sortBy = "revenue" } = req.query;
//     const orgId = req.user.organizationId;

//     const staffStats = await analyticsService.getEmployeePerformance(
//         orgId,
//         branchId,
//         start,
//         end,
//         parseFloat(minSales),
//         sortBy,
//     );

//     // Calculate productivity scores
//     const enhancedStats = staffStats.map((staff) => ({
//         ...staff,
//         productivityScore: analyticsService.calculateProductivityScore(staff),
//         targetAchievement: analyticsService.calculateTargetAchievement(staff),
//         trend: analyticsService.getStaffTrend(staff._id, orgId, branchId),
//     }));

//     formatResponse(
//         res,
//         {
//             staff: enhancedStats,
//             summary: {
//                 totalStaff: enhancedStats.length,
//                 topPerformer: enhancedStats[0]?.name || "N/A",
//                 avgProductivity:
//                     enhancedStats.reduce(
//                         (sum, s) => sum + s.productivityScore,
//                         0,
//                     ) / enhancedStats.length,
//             },
//         },
//         startTime,
//     );
// });

// /**
//  * Operational Efficiency Dashboard
//  */
// exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, includeDetails = false } = req.query;
//     const orgId = req.user.organizationId;

//     const [metrics, peakHours, efficiency] = await Promise.all([
//         analyticsService.getOperationalStats(orgId, branchId, start, end),
//         analyticsService.getPeakHourAnalysis(orgId, branchId),
//         analyticsService.calculateEfficiencyMetrics(
//             orgId,
//             branchId,
//             start,
//             end,
//         ),
//     ]);

//     const response = {
//         overview: {
//             efficiency: metrics.orderEfficiency,
//             discounts: metrics.discountMetrics,
//             staffPerformance: metrics.topStaff.slice(0, 3),
//         },
//         peakHours: {
//             hours: peakHours.slice(0, 24),
//             recommendations:
//                 analyticsService.generateStaffingRecommendations(peakHours),
//         },
//         efficiency,
//         kpis: analyticsService.calculateOperationalKPIs(metrics),
//     };

//     if (includeDetails === "true") {
//         response.detailedMetrics = metrics;
//     }

//     formatResponse(res, response, startTime);
// });

// /* ==========================================================================
//    4. ADVANCED INVENTORY INTELLIGENCE
//    ========================================================================== */

// /**
//  * Inventory Health Dashboard
//  */
// exports.getInventoryHealth = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const {
//         branchId,
//         includeValuation = true,
//         includePredictions = true,
//     } = req.query;
//     const orgId = req.user.organizationId;

//     const [analytics, performance, deadStock, predictions] = await Promise.all([
//         analyticsService.getInventoryAnalytics(orgId, branchId),
//         analyticsService.getProductPerformanceStats(orgId, branchId),
//         analyticsService.getDeadStockAnalysis(orgId, branchId, 90),
//         includePredictions === "true"
//             ? analyticsService.getInventoryRunRate(orgId, branchId)
//             : Promise.resolve([]),
//     ]);

//     const healthScore = analyticsService.calculateInventoryHealthScore(
//         analytics,
//         performance,
//         deadStock,
//     );

//     formatResponse(
//         res,
//         {
//             health: {
//                 score: healthScore,
//                 status:
//                     healthScore >= 80
//                         ? "Healthy"
//                         : healthScore >= 60
//                           ? "Moderate"
//                           : "Needs Attention",
//             },
//             alerts: {
//                 lowStock: analytics.lowStockAlerts.length,
//                 deadStock: deadStock.length,
//                 criticalItems: predictions.filter(
//                     (p) => p.daysUntilStockout <= 7,
//                 ).length,
//             },
//             valuation:
//                 includeValuation === "true"
//                     ? analytics.inventoryValuation
//                     : undefined,
//             topProducts: performance.highMargin.slice(0, 10),
//             deadStock: deadStock.slice(0, 20),
//             predictions: predictions.filter((p) => p.daysUntilStockout <= 30),
//             recommendations: analyticsService.generateInventoryRecommendations(
//                 analytics.lowStockAlerts,
//                 deadStock,
//                 predictions,
//             ),
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    5. PREDICTIVE ANALYTICS WITH ML SUPPORT
//    ========================================================================== */

// /**
//  * Sales Forecast with Confidence Intervals
//  */
// exports.getSalesForecast = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { branchId, periods = 3, confidence = 0.95 } = req.query;
//     const orgId = req.user.organizationId;

//     const forecast = await analyticsService.generateAdvancedForecast(
//         orgId,
//         branchId,
//         parseInt(periods),
//         parseFloat(confidence),
//     );

//     formatResponse(
//         res,
//         {
//             forecast,
//             accuracy: await analyticsService.calculateForecastAccuracy(
//                 orgId,
//                 branchId,
//             ),
//             bestPerforming: await analyticsService.getBestPerformingProducts(
//                 orgId,
//                 branchId,
//                 5,
//             ),
//             recommendations:
//                 analyticsService.generateSalesRecommendations(forecast),
//         },
//         startTime,
//     );
// });

// /**
//  * Customer Intelligence Hub
//  */
// exports.getCustomerIntelligence = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { branchId, includeSegments = true, includeChurn = true } = req.query;
//     const orgId = req.user.organizationId;

//     const [segments, churnRisk, ltv, paymentBehavior] = await Promise.all([
//         includeSegments === "true"
//             ? analyticsService.getCustomerRFMAnalysis(orgId)
//             : Promise.resolve({}),
//         includeChurn === "true"
//             ? analyticsService.analyzeChurnRisk(orgId, 90)
//             : Promise.resolve([]),
//         analyticsService.calculateLTV(orgId, branchId),
//         analyticsService.analyzePaymentHabits(orgId, branchId),
//     ]);

//     formatResponse(
//         res,
//         {
//             segmentation: segments,
//             riskAnalysis: {
//                 highRisk: churnRisk.slice(0, 10),
//                 totalAtRisk: churnRisk.length,
//             },
//             valueAnalysis: {
//                 topLTV: ltv.slice(0, 10),
//                 avgLTV: ltv.reduce((sum, c) => sum + c.ltv, 0) / ltv.length,
//             },
//             paymentBehavior: paymentBehavior.slice(0, 15),
//             insights: analyticsService.generateCustomerInsights(
//                 segments,
//                 churnRisk,
//                 ltv,
//             ),
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    6. REAL-TIME ALERTS & MONITORING
//    ========================================================================== */

// /**
//  * Real-time System Alerts
//  */
// exports.getSystemAlerts = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { branchId, severity, limit = 20 } = req.query;
//     const orgId = req.user.organizationId;

//     const alerts = await analyticsService.getRealTimeAlerts(
//         orgId,
//         branchId,
//         severity,
//         parseInt(limit),
//     );

//     // Group alerts by category
//     const groupedAlerts = alerts.reduce((acc, alert) => {
//         const category = alert.category || "general";
//         if (!acc[category]) acc[category] = [];
//         acc[category].push(alert);
//         return acc;
//     }, {});

//     formatResponse(
//         res,
//         {
//             alerts: groupedAlerts,
//             summary: {
//                 total: alerts.length,
//                 critical: alerts.filter((a) => a.severity === "critical")
//                     .length,
//                 warning: alerts.filter((a) => a.severity === "warning").length,
//                 info: alerts.filter((a) => a.severity === "info").length,
//             },
//             lastUpdated: new Date().toISOString(),
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    7. ENHANCED EXPORT SYSTEM
//    ========================================================================== */

// /**
//  * Advanced Data Export with Multiple Formats
//  */
// exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const {
//         type,
//         format = "csv",
//         compression = false,
//         columns = "all",
//     } = req.query;

//     const orgId = req.user.organizationId;
//     const { start, end } = getDateRange(req.query);

//     if (!type) {
//         return next(
//             new AppError(
//                 "Export type is required (e.g., financial, sales, inventory)",
//                 400,
//             ),
//         );
//     }

//     // Get export configuration
//     const exportConfig = analyticsService.getExportConfig(type, columns);

//     // Get data with selected columns only
//     const data = await analyticsService.getExportData(
//         orgId,
//         type,
//         start,
//         end,
//         exportConfig.columns,
//     );

//     if (!data || data.length === 0) {
//         return next(new AppError("No data available to export", 404));
//     }

//     switch (format.toLowerCase()) {
//         case "csv":
//             const csvContent = analyticsService.convertToCSV(
//                 data,
//                 exportConfig,
//             );
//             res.setHeader("Content-Type", "text/csv");
//             res.setHeader(
//                 "Content-Disposition",
//                 `attachment; filename=${type}-${Date.now()}.csv`,
//             );
//             if (compression === "true") {
//                 res.setHeader("Content-Encoding", "gzip");
//                 // Add compression logic here
//             }
//             return res.status(200).send(csvContent);

//         case "excel":
//             const excelBuffer = await analyticsService.convertToExcel(
//                 data,
//                 exportConfig,
//             );
//             res.setHeader(
//                 "Content-Type",
//                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//             );
//             res.setHeader(
//                 "Content-Disposition",
//                 `attachment; filename=${type}-${Date.now()}.xlsx`,
//             );
//             return res.status(200).send(excelBuffer);

//         case "pdf":
//             const pdfBuffer = await analyticsService.convertToPDF(
//                 data,
//                 exportConfig,
//             );
//             res.setHeader("Content-Type", "application/pdf");
//             res.setHeader(
//                 "Content-Disposition",
//                 `attachment; filename=${type}-${Date.now()}.pdf`,
//             );
//             return res.status(200).send(pdfBuffer);

//         case "json":
//         default:
//             formatResponse(
//                 res,
//                 {
//                     export: {
//                         type,
//                         format: "json",
//                         recordCount: data.length,
//                         data,
//                     },
//                 },
//                 startTime,
//             );
//     }
// });

// /* ==========================================================================
//    8. CUSTOM QUERY BUILDER
//    ========================================================================== */

// /**
//  * Custom Analytics Query Endpoint
//  */
// exports.customQuery = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { query, parameters = {}, limit = 1000 } = req.body;
//     const orgId = req.user.organizationId;

//     if (!query) {
//         return next(new AppError("Query is required", 400));
//     }

//     // Validate query (basic security check)
//     const safeQuery = analyticsService.validateAndParseQuery(query);

//     // Execute query with parameters
//     const result = await analyticsService.executeCustomQuery(
//         orgId,
//         safeQuery,
//         parameters,
//         parseInt(limit),
//     );

//     formatResponse(
//         res,
//         {
//             query: safeQuery,
//             parameters,
//             result: {
//                 data: result.data,
//                 total: result.total,
//                 executionTime: result.executionTime,
//             },
//             metadata: result.metadata,
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    9. PERFORMANCE METRICS
//    ========================================================================== */

// /**
//  * Analytics Performance Monitoring
//  */
// exports.getAnalyticsPerformance = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { hours = 24 } = req.query;
//     const orgId = req.user.organizationId;

//     const performanceStats = await analyticsService.getPerformanceMetrics(
//         orgId,
//         parseInt(hours),
//     );

//     formatResponse(
//         res,
//         {
//             performance: performanceStats,
//             recommendations:
//                 analyticsService.generatePerformanceRecommendations(
//                     performanceStats,
//                 ),
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    10. DATA INTEGRITY CHECK
//    ========================================================================== */

// /**
//  * Data Health Check
//  */
// exports.getDataHealth = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const orgId = req.user.organizationId;

//     const healthCheck = await analyticsService.performDataHealthCheck(orgId);

//     formatResponse(
//         res,
//         {
//             health: healthCheck,
//             score: analyticsService.calculateDataHealthScore(healthCheck),
//             issues: healthCheck.filter((item) => item.status !== "healthy"),
//             lastCheck: new Date().toISOString(),
//         },
//         startTime,
//     );
// });

// // const analyticsService = require('../services/analyticsService');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');

// // /**
// //  * UTILITY: Get Safe Date Range
// //  * Prevents "Invalid Date" crashes
// //  */
// // const getDateRange = (query) => {
// //     const now = new Date();

// //     // Helper to validate date
// //     const parseDate = (d) => {
// //         const parsed = new Date(d);
// //         return isNaN(parsed.getTime()) ? null : parsed;
// //     };

// //     // Default: Start of current month
// //     let start = parseDate(query.startDate) || new Date(now.getFullYear(), now.getMonth(), 1);

// //     // Default: End of current day
// //     let end = parseDate(query.endDate) || new Date();
// //     end.setHours(23, 59, 59, 999);

// //     return { start, end };
// // };

// // /* ==========================================================================
// //    1. EXECUTIVE & STRATEGIC
// //    ========================================================================== */

// // exports.getDashboardOverview = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const [kpi, charts, inventory, leaders] = await Promise.all([
// //         analyticsService.getExecutiveStats(orgId, branchId, start, end),
// //         analyticsService.getChartData(orgId, branchId, start, end, 'day'),
// //         analyticsService.getInventoryAnalytics(orgId, branchId),
// //         analyticsService.getLeaderboards(orgId, branchId, start, end)
// //     ]);

// //     res.status(200).json({
// //         status: 'success',
// //         data: { period: { start, end }, kpi, charts, inventory, leaders }
// //     });
// // });

// // exports.getBranchComparison = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getBranchComparisonStats(orgId, start, end);
// //     res.status(200).json({ status: 'success', data });
// // });

// // /* ==========================================================================
// //    2. FINANCIAL INTELLIGENCE
// //    ========================================================================== */

// // exports.getFinancialReport = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId, interval } = req.query;
// //     const orgId = req.user.organizationId;

// //     const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
// //     const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

// //     res.status(200).json({ status: 'success', data: { kpi, charts } });
// // });

// // exports.getProfitabilityReport = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);
// //     res.status(200).json({ status: 'success', data: profitStats });
// // });

// // exports.getCashFlowReport = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getCashFlowStats(orgId, branchId, start, end);
// //     res.status(200).json({ status: 'success', data });
// // });

// // exports.getDebtorAgingReport = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
// //     res.status(200).json({ status: 'success', data: agingReport });
// // });

// // exports.getTaxReport = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getTaxStats(orgId, branchId, start, end);
// //     res.status(200).json({ status: 'success', data });
// // });

// // /* ==========================================================================
// //    3. OPERATIONAL & STAFF EFFICIENCY
// //    ========================================================================== */

// // exports.getStaffPerformance = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);
// //     res.status(200).json({ status: 'success', data: staffStats });
// // });

// // exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);
// //     res.status(200).json({ status: 'success', data });
// // });

// // exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
// //     res.status(200).json({ status: 'success', data: heatmap });
// // });

// // exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getProcurementStats(orgId, branchId, start, end);
// //     res.status(200).json({ status: 'success', data });
// // });

// // exports.getCustomerInsights = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
// //     res.status(200).json({ status: 'success', data });
// // });

// // /* ==========================================================================
// //    4. INVENTORY INTELLIGENCE
// //    ========================================================================== */

// // exports.getInventoryReport = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
// //     res.status(200).json({ status: 'success', data });
// // });

// // exports.getProductPerformance = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
// //     res.status(200).json({ status: 'success', data });
// // });

// // exports.getDeadStockReport = catchAsync(async (req, res, next) => {
// //     const { branchId, daysThreshold } = req.query;
// //     const orgId = req.user.organizationId;
// //     const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);
// //     res.status(200).json({ status: 'success', data: deadStock });
// // });

// // exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
// //     res.status(200).json({ status: 'success', data: predictions });
// // });

// // /* ==========================================================================
// //    5. PREDICTIVE & ADVANCED
// //    ========================================================================== */

// // exports.getSalesForecast = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const forecast = await analyticsService.generateForecast(orgId, branchId);
// //     res.status(200).json({ status: 'success', data: forecast });
// // });

// // exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
// //     const orgId = req.user.organizationId;
// //     const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
// //     res.status(200).json({ status: 'success', data: segments });
// // });

// // exports.getCustomerRetention = catchAsync(async (req, res, next) => {
// //     const orgId = req.user.organizationId;
// //     const months = req.query.months ? parseInt(req.query.months) : 6;
// //     const data = await analyticsService.getCohortAnalysis(orgId, months);
// //     res.status(200).json({ status: 'success', data });
// // });

// // exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;
// //     const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
// //     res.status(200).json({ status: 'success', data: alerts });
// // });

// // /* ==========================================================================
// //    6. SECURITY & EXPORT
// //    ========================================================================== */

// // exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
// //     const { start, end } = getDateRange(req.query);
// //     const orgId = req.user.organizationId;
// //     const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);
// //     res.status(200).json({ status: 'success', data: securityStats });
// // });

// // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// //     const { type, format = 'csv' } = req.query;
// //     const orgId = req.user.organizationId;
// //     const { start, end } = getDateRange(req.query);

// //     // Validate Export Type
// //     if (!type) return next(new AppError('Export type is required (e.g., financial, sales)', 400));

// //     // Get Data
// //     const data = await analyticsService.getExportData(orgId, type, start, end);

// //     if (format === 'csv') {
// //         if (!data || data.length === 0) {
// //             return next(new AppError('No data available to export', 404));
// //         }

// //         // Simple JSON to CSV conversion without external library to avoid dependency issues
// //         const keys = Object.keys(data[0]);
// //         const csvContent = [
// //             keys.join(','), // Header
// //             ...data.map(row => keys.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(',')) // Rows
// //         ].join('\n');

// //         res.setHeader('Content-Type', 'text/csv');
// //         res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.csv`);
// //         return res.status(200).send(csvContent);
// //     }

// //     // Default JSON Response
// //     res.status(200).json({ status: 'success', data });
// // });

// // /* ==========================================================================
// //    7. CUSTOMER 360 INTELLIGENCE (NEW)
// //    ========================================================================== */

// // // 1. Customer Lifetime Value (LTV) & Acquisition Cost
// // exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.calculateLTV(orgId, branchId);

// //     res.status(200).json({
// //         status: 'success',
// //         message: 'Customer LTV calculated successfully',
// //         data
// //     });
// // });

// // // 2. Churn Risk (At-risk customers based on Recency)
// // exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
// //     const { daysThreshold = 90 } = req.query; // Default: No purchase in 90 days = At Risk
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.analyzeChurnRisk(orgId, parseInt(daysThreshold));

// //     res.status(200).json({
// //         status: 'success',
// //         data
// //     });
// // });

// // // 3. Market Basket Analysis (Cross-Selling Patterns)
// // exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
// //     const orgId = req.user.organizationId;
// //     const { minSupport = 2 } = req.query; // Minimum times items bought together

// //     const data = await analyticsService.performBasketAnalysis(orgId, parseInt(minSupport));

// //     res.status(200).json({
// //         status: 'success',
// //         data
// //     });
// // });

// // // 4. Payment Behavior (Average Days to Pay)
// // exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.analyzePaymentHabits(orgId, branchId);

// //     res.status(200).json({
// //         status: 'success',
// //         data
// //     });
// // });
// // // const analyticsService = require('../services/analyticsService');
// // // const { Parser } = require('json2csv');
// // // const catchAsync = require('../utils/catchAsync'); // ✅ Standardized
// // // const AppError = require('../utils/appError');

// // // /**
// // //  * UTILITY: Get Safe Date Range
// // //  * Prevents "Invalid Date" crashes
// // //  */
// // // const getDateRange = (query) => {
// // //     const now = new Date();

// // //     // Helper to validate date
// // //     const parseDate = (d) => {
// // //         const parsed = new Date(d);
// // //         return isNaN(parsed.getTime()) ? null : parsed;
// // //     };

// // //     // Default: Start of current month
// // //     let start = parseDate(query.startDate) || new Date(now.getFullYear(), now.getMonth(), 1);

// // //     // Default: End of current day
// // //     let end = parseDate(query.endDate) || new Date();
// // //     end.setHours(23, 59, 59, 999);

// // //     return { start, end };
// // // };

// // // /* ==========================================================================
// // //    1. EXECUTIVE & STRATEGIC
// // //    ========================================================================== */

// // // exports.getDashboardOverview = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const [kpi, charts, inventory, leaders] = await Promise.all([
// // //         analyticsService.getExecutiveStats(orgId, branchId, start, end),
// // //         analyticsService.getChartData(orgId, branchId, start, end, 'day'),
// // //         analyticsService.getInventoryAnalytics(orgId, branchId),
// // //         analyticsService.getLeaderboards(orgId, branchId, start, end)
// // //     ]);

// // //     res.status(200).json({
// // //         status: 'success',
// // //         data: { period: { start, end }, kpi, charts, inventory, leaders }
// // //     });
// // // });

// // // exports.getBranchComparison = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getBranchComparisonStats(orgId, start, end);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // /* ==========================================================================
// // //    2. FINANCIAL INTELLIGENCE
// // //    ========================================================================== */

// // // exports.getFinancialReport = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId, interval } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
// // //     const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

// // //     res.status(200).json({ status: 'success', data: { kpi, charts } });
// // // });

// // // exports.getProfitabilityReport = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);
// // //     res.status(200).json({ status: 'success', data: profitStats });
// // // });

// // // exports.getCashFlowReport = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getCashFlowStats(orgId, branchId, start, end);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // exports.getDebtorAgingReport = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data: agingReport });
// // // });

// // // exports.getTaxReport = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getTaxStats(orgId, branchId, start, end);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // /* ==========================================================================
// // //    3. OPERATIONAL & STAFF EFFICIENCY
// // //    ========================================================================== */

// // // exports.getStaffPerformance = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);
// // //     res.status(200).json({ status: 'success', data: staffStats });
// // // });

// // // exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data: heatmap });
// // // });

// // // exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getProcurementStats(orgId, branchId, start, end);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // exports.getCustomerInsights = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // /* ==========================================================================
// // //    4. INVENTORY INTELLIGENCE
// // //    ========================================================================== */

// // // exports.getInventoryReport = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // exports.getProductPerformance = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // exports.getDeadStockReport = catchAsync(async (req, res, next) => {
// // //     const { branchId, daysThreshold } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);
// // //     res.status(200).json({ status: 'success', data: deadStock });
// // // });

// // // exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data: predictions });
// // // });

// // // /* ==========================================================================
// // //    5. PREDICTIVE & ADVANCED
// // //    ========================================================================== */

// // // exports.getSalesForecast = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const forecast = await analyticsService.generateForecast(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data: forecast });
// // // });

// // // exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
// // //     const orgId = req.user.organizationId;
// // //     const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
// // //     res.status(200).json({ status: 'success', data: segments });
// // // });

// // // exports.getCustomerRetention = catchAsync(async (req, res, next) => {
// // //     const orgId = req.user.organizationId;
// // //     const months = req.query.months ? parseInt(req.query.months) : 6;
// // //     const data = await analyticsService.getCohortAnalysis(orgId, months);
// // //     res.status(200).json({ status: 'success', data });
// // // });

// // // exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;
// // //     const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
// // //     res.status(200).json({ status: 'success', data: alerts });
// // // });

// // // /* ==========================================================================
// // //    6. SECURITY & EXPORT
// // //    ========================================================================== */

// // // exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
// // //     const { start, end } = getDateRange(req.query);
// // //     const orgId = req.user.organizationId;
// // //     const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);
// // //     res.status(200).json({ status: 'success', data: securityStats });
// // // });

// // // // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const orgId = req.user.organizationId;

// // // //     res.setHeader('Content-Type', 'text/csv');
// // // //     res.setHeader('Content-Disposition', `attachment; filename=export-${Date.now()}.csv`);

// // // //     // You need to add a method in Service that returns a Mongoose Cursor, not an Array
// // // //     const cursor = analyticsService.getExportCursor(orgId, req.query.type, start, end);

// // // //     // Use a library like 'fast-csv' or 'json2csv' Transform stream
// // // //     const { Transform } = require('json2csv');
// // // //     const transformOpts = { highWaterMark: 16384, encoding: 'utf-8' };
// // // //     const json2csv = new Transform({ fields: ['invoiceNumber', 'amount', 'date'] }, transformOpts);

// // // //     cursor.pipe(json2csv).pipe(res);
// // // // });

// // // // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// // // //     const { type, format = 'csv' } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const { start, end } = getDateRange(req.query);

// // // //     // Validate Export Type
// // // //     if (!type) return next(new AppError('Export type is required (e.g., financial, sales)', 400));

// // // //     const data = await analyticsService.getExportData(orgId, type, start, end);

// // // //     if (format === 'csv') {
// // // //         if (!data || data.length === 0) {
// // // //             return next(new AppError('No data available to export for this range', 404));
// // // //         }

// // // //         const parser = new Parser();
// // // //         const csv = parser.parse(data);

// // // //         res.header('Content-Type', 'text/csv');
// // // //         res.attachment(`${type}-report-${Date.now()}.csv`);
// // // //         return res.send(csv);
// // // //     }

// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // /* ==========================================================================
// // //    7. CUSTOMER 360 INTELLIGENCE (NEW)
// // //    ========================================================================== */

// // // // 1. Customer Lifetime Value (LTV) & Acquisition Cost
// // // exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const data = await analyticsService.calculateLTV(orgId, branchId);

// // //     res.status(200).json({
// // //         status: 'success',
// // //         message: 'Customer LTV calculated successfully',
// // //         data
// // //     });
// // // });

// // // // 2. Churn Risk (At-risk customers based on Recency)
// // // exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
// // //     const { daysThreshold = 90 } = req.query; // Default: No purchase in 90 days = At Risk
// // //     const orgId = req.user.organizationId;

// // //     const data = await analyticsService.analyzeChurnRisk(orgId, parseInt(daysThreshold));

// // //     res.status(200).json({
// // //         status: 'success',
// // //         data
// // //     });
// // // });

// // // // 3. Market Basket Analysis (Cross-Selling Patterns)
// // // exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
// // //     const orgId = req.user.organizationId;
// // //     const { minSupport = 2 } = req.query; // Minimum times items bought together

// // //     const data = await analyticsService.performBasketAnalysis(orgId, parseInt(minSupport));

// // //     res.status(200).json({
// // //         status: 'success',
// // //         data
// // //     });
// // // });

// // // // 4. Payment Behavior (Average Days to Pay)
// // // exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
// // //     const { branchId } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const data = await analyticsService.analyzePaymentHabits(orgId, branchId);

// // //     res.status(200).json({
// // //         status: 'success',
// // //         data
// // //     });
// // // });
