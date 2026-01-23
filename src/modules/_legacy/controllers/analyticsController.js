// const analyticsService = require("../services/analyticsService");
const analyticsService = require("../../analytics/index");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
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
   1. EXECUTIVE DASHBOARD (With existing functions)
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
                meta: { cached: true, source: "cache" },
            });
        }
    }

    // Get data from existing functions
    const [
        kpi,
        charts,
        inventory,
        leaders,
        alerts,
        customerSegments,
        operationalStats,
    ] = await Promise.all([
        // Financial KPIs
        analyticsService.getExecutiveStats(orgId, branchId, start, end),

        // Charts and trends
        analyticsService.getChartData(orgId, branchId, start, end, "auto"),

        // Inventory health
        analyticsService.getInventoryAnalytics(orgId, branchId),

        // Top performers
        analyticsService.getLeaderboards(orgId, branchId, start, end),

        // System alerts
        analyticsService.getCriticalAlerts(orgId, branchId),

        // Customer analytics
        analyticsService.getCustomerRFMAnalysis(orgId),

        // Operational efficiency
        analyticsService.getOperationalStats(orgId, branchId, start, end),
    ]);

    const responseData = {
        period: {
            start,
            end,
            days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
        },
        financial: kpi,
        trends: charts,
        inventory: {
            ...inventory,
            healthScore: analyticsService.calculateInventoryHealthScore(
                inventory,
                { highMargin: [], deadStock: [] },
                []
            ),
        },
        leaders,
        alerts: {
            ...alerts,
            total: (alerts.lowStockCount || 0) + (alerts.highRiskDebtCount || 0),
        },
        customers: {
            segmentation: customerSegments,
            atRisk: await analyticsService.analyzeChurnRisk(orgId, 90),
        },
        operations: operationalStats,
        insights: analyticsService.generateInsights(kpi, inventory, leaders),
    };

    // Cache the response
    if (cache === "true") {
        await analyticsService.cacheData(cacheKey, responseData, 300);
    }

    formatResponse(res, responseData, startTime, {
        meta: { branchId: branchId || "all", cached: false },
    });
});

/* ==========================================================================
   2. FINANCIAL DASHBOARD (Existing functions only)
   ========================================================================== */

exports.getFinancialDashboard = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    // Get comprehensive financial data using existing functions
    const [
        kpi,
        cashFlow,
        profitability,
        tax,
        debtorAging,
        paymentBehavior,
        emiAnalytics,
    ] = await Promise.all([
        // Core financial KPIs
        analyticsService.getExecutiveStats(orgId, branchId, start, end),

        // Cash flow analysis
        analyticsService.getCashFlowStats(orgId, branchId, start, end),

        // Profit margins
        analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end),

        // Tax analysis
        analyticsService.getTaxStats(orgId, branchId, start, end),

        // Debtor aging
        analyticsService.getDebtorAging(orgId, branchId),

        // Payment behavior
        analyticsService.analyzePaymentHabits(orgId, branchId),

        // EMI/credit sales
        analyticsService.getEMIAnalytics(orgId, branchId),
    ]);

    const response = {
        period: { start, end },
        summary: {
            revenue: kpi.totalRevenue,
            expenses: kpi.totalExpense,
            profit: kpi.netProfit,
        },
        cashFlow,
        profitability,
        tax,
        receivables: {
            aging: debtorAging,
        },
        credit: {
            emiAnalytics,
        },
        paymentBehavior: paymentBehavior.slice(0, 10),
        recommendations: analyticsService.generateFinancialRecommendations(
            kpi,
            profitability
        ),
    };

    formatResponse(res, response, startTime);
});

/* ==========================================================================
   3. CUSTOMER INTELLIGENCE (Existing functions only)
   ========================================================================== */

exports.getCustomerIntelligence = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const [
        segments,
        churnRisk,
        ltv,
        paymentBehavior,
        customerRisk,
    ] = await Promise.all([
        // Customer segmentation (RFM)
        analyticsService.getCustomerRFMAnalysis(orgId),

        // Churn risk analysis
        analyticsService.analyzeChurnRisk(orgId, 90),

        // Lifetime Value
        analyticsService.calculateLTV(orgId, branchId),

        // Payment behavior
        analyticsService.analyzePaymentHabits(orgId, branchId),

        // Customer risk stats
        analyticsService.getCustomerRiskStats(orgId, branchId),
    ]);

    formatResponse(
        res,
        {
            segmentation: segments,
            riskAnalysis: {
                highRisk: churnRisk.slice(0, 10),
                totalAtRisk: churnRisk.length,
                creditRisk: customerRisk.creditRisk,
            },
            valueAnalysis: {
                topLTV: ltv.customers.slice(0, 10),
                avgLTV: ltv.summary.avgLTV,
                totalLTV: ltv.summary.totalLTV,
            },
            behavior: {
                payment: paymentBehavior.slice(0, 15),
            },
            recommendations: {
                highValue: ltv.customers.filter(c => c.tier === 'Platinum').slice(0, 5),
                atRisk: churnRisk.slice(0, 5),
            }
        },
        startTime,
    );
});

/* ==========================================================================
   4. INVENTORY HEALTH DASHBOARD
   ========================================================================== */

exports.getInventoryHealth = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const [analytics, performance, deadStock, predictions, categoryAnalysis, supplierPerformance, stockTurnover,] = await Promise.all([
        analyticsService.getInventoryAnalytics(orgId, branchId),
        analyticsService.getProductPerformanceStats(orgId, branchId),
        // Dead stock analysis
        analyticsService.getDeadStockAnalysis(orgId, branchId, 90),
        // Stock-out predictions
        analyticsService.getInventoryRunRate(orgId, branchId),
        // Category analysis
        analyticsService.getCategoryAnalytics(orgId, branchId, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date()),
        // Supplier performance
        analyticsService.getSupplierPerformance(
            orgId,
            branchId,
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            new Date(),
        ),

        // Stock turnover rates
        analyticsService.calculateInventoryTurnover(orgId, branchId),
    ]);

    // Calculate health metrics
    const healthScore = analyticsService.calculateInventoryHealthScore(
        analytics,
        performance,
        deadStock
    );

    // Generate recommendations
    const recommendations = analyticsService.generateInventoryRecommendations(
        analytics.lowStockAlerts,
        deadStock,
        predictions
    );

    formatResponse(
        res,
        {
            health: {
                score: healthScore,
                status:
                    healthScore >= 80
                        ? "Excellent"
                        : healthScore >= 60
                            ? "Good"
                            : healthScore >= 40
                                ? "Fair"
                                : "Poor",
            },
            alerts: {
                lowStock: analytics.lowStockAlerts.length,
                deadStock: deadStock.length,
                criticalItems: predictions.filter(
                    (p) => p.daysUntilStockout <= 7
                ).length,
            },
            valuation: analytics.inventoryValuation,
            performance: {
                topSellers: performance.highMargin.slice(0, 10),
                slowMovers: deadStock.slice(0, 10),
                categoryBreakdown: categoryAnalysis,
            },
            predictions: predictions.filter((p) => p.daysUntilStockout <= 30),
            suppliers: supplierPerformance.slice(0, 10),
            turnover: stockTurnover,
            recommendations: recommendations,
        },
        startTime,
    );
});

/* ==========================================================================
   5. OPERATIONAL METRICS
   ========================================================================== */

exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const [
        metrics,
        peakHours,
        staffPerformance,
        procurementStats,
        returnAnalysis,
    ] = await Promise.all([
        // Basic operational metrics
        analyticsService.getOperationalStats(orgId, branchId, start, end),

        // Peak business hours
        analyticsService.getPeakHourAnalysis(orgId, branchId),

        // Staff performance
        analyticsService.getEmployeePerformance(orgId, branchId, start, end, 0, 'totalSales'),

        // Procurement efficiency
        analyticsService.getProcurementStats(orgId, branchId, start, end),

        // Return analysis
        analyticsService.getReturnAnalytics(orgId, branchId, start, end),
    ]);

    formatResponse(
        res,
        {
            operations: {
                peakHours: peakHours,
                recommendations: analyticsService.generateStaffingRecommendations(peakHours),
            },
            productivity: {
                staff: staffPerformance.slice(0, 10),
            },
            procurement: procurementStats,
            returns: {
                analysis: returnAnalysis.slice(0, 10),
            },
            metrics: metrics,
        },
        startTime,
    );
});

/* ==========================================================================
   6. BRANCH COMPARISON
   ========================================================================== */

exports.getBranchComparison = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { groupBy = "revenue" } = req.query;
    const orgId = req.user.organizationId;

    // Get comparison data for all branches
    const branchStats = await analyticsService.getBranchComparisonStats(
        orgId,
        start,
        end,
        groupBy,
        50
    );

    const response = {
        comparison: {
            branches: branchStats,
            total: branchStats.length,
            topPerformer: branchStats[0],
            lowestPerformer: branchStats[branchStats.length - 1],
        }
    };

    formatResponse(res, response, startTime);
});

/* ==========================================================================
   7. PREDICTIVE ANALYTICS & FORECASTING
   ========================================================================== */

exports.getPredictiveAnalytics = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, periods = 3, confidence = 0.95 } = req.query;
    const orgId = req.user.organizationId;

    const [
        salesForecast,
        inventoryForecast,
        cashFlowProjection,
    ] = await Promise.all([
        // Sales forecasting
        analyticsService.generateAdvancedForecast(
            orgId,
            branchId,
            parseInt(periods),
            parseFloat(confidence),
        ),

        // Inventory requirements forecasting
        analyticsService.getInventoryRunRate(orgId, branchId),

        // Cash flow projections
        analyticsService.generateCashFlowProjection(
            orgId,
            branchId,
            30,
        ),
    ]);

    formatResponse(
        res,
        {
            sales: {
                forecast: salesForecast.forecast,
                confidence: salesForecast.confidence,
                accuracy: salesForecast.accuracy,
            },
            inventory: {
                predictions: inventoryForecast,
            },
            cashFlow: cashFlowProjection,
        },
        startTime,
    );
});

/* ==========================================================================
   8. REAL-TIME MONITORING & ALERTS
   ========================================================================== */

exports.getRealTimeMonitoring = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, severity } = req.query;
    const orgId = req.user.organizationId;

    const [
        criticalAlerts,
        inventoryAlerts,
        customerAlerts,
        securityPulse,
    ] = await Promise.all([
        // Critical alerts
        analyticsService.getCriticalAlerts(orgId, branchId),

        // Inventory alerts
        analyticsService.getInventoryAnalytics(orgId, branchId),

        // Customer alerts
        analyticsService.getCustomerRiskStats(orgId, branchId),

        // Security pulse
        analyticsService.getSecurityPulse(orgId,
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            new Date().toISOString().split('T')[0]
        ),
    ]);

    const allAlerts = [
        ...criticalAlerts.itemsToReorder.map(item => ({
            type: 'inventory',
            severity: 'warning',
            message: `Low stock: ${item}`,
            timestamp: new Date().toISOString(),
        })),
        ...customerAlerts.creditRisk.map(customer => ({
            type: 'customer',
            severity: customer.outstandingBalance > customer.creditLimit ? 'critical' : 'warning',
            message: `High credit risk: ${customer.name} - ₹${customer.outstandingBalance} outstanding`,
            timestamp: new Date().toISOString(),
        })),
    ];

    formatResponse(
        res,
        {
            alerts: {
                critical: allAlerts.filter(a => a.severity === 'critical'),
                warning: allAlerts.filter(a => a.severity === 'warning'),
                info: allAlerts.filter(a => a.severity === 'info'),
                total: allAlerts.length,
            },
            security: securityPulse,
            monitoring: {
                lastUpdated: new Date().toISOString(),
            },
        },
        startTime,
    );
});

/* ==========================================================================
   9. COMPLIANCE DASHBOARD
   ========================================================================== */

exports.getComplianceDashboard = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const [
        taxStats,
        securityPulse,
    ] = await Promise.all([
        // Tax compliance
        analyticsService.getTaxStats(orgId, branchId, start, end),

        // Security audit
        analyticsService.getSecurityPulse(orgId, start, end),
    ]);

    formatResponse(
        res,
        {
            tax: {
                ...taxStats,
                compliance: taxStats.netPayable >= 0 ? 'Compliant' : 'Review Needed',
            },
            audit: {
                recentEvents: securityPulse.recentEvents || [],
                riskyActions: securityPulse.riskyActions || 0,
            },
            dataHealth: {
                score: 85, // Placeholder
                issues: await analyticsService.performDataHealthCheck(orgId),
            },
        },
        startTime,
    );
});

/* ==========================================================================
   10. CUSTOM QUERY & AD-HOC ANALYTICS
   ========================================================================== */

exports.customAnalyticsQuery = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const {
        queryType,
        parameters = {},
        format = "json",
        limit = 1000,
    } = req.body;
    const orgId = req.user.organizationId;

    if (!queryType) {
        return next(new AppError("Query type is required", 400));
    }

    let result;

    // Execute query based on type
    switch (queryType) {
        case "product_movement":
            const { start, end } = getDateRange({
                startDate: parameters.startDate,
                endDate: parameters.endDate,
            });
            const invoices = await analyticsService.getExportData(
                orgId,
                'sales',
                start,
                end
            );
            result = { data: invoices };
            break;

        case "inventory_status":
            const inventory = await analyticsService.getExportData(
                orgId,
                'inventory'
            );
            result = { data: inventory };
            break;

        case "customer_analysis":
            const ltv = await analyticsService.calculateLTV(
                orgId,
                parameters.branchId
            );
            result = { data: ltv.customers };
            break;

        case "staff_performance":
            const { start: sStart, end: sEnd } = getDateRange({
                startDate: parameters.startDate,
                endDate: parameters.endDate,
            });
            const staff = await analyticsService.getEmployeePerformance(
                orgId,
                parameters.branchId,
                sStart,
                sEnd,
                0,
                parameters.sortBy || 'totalSales'
            );
            result = { data: staff };
            break;

        default:
            return next(new AppError(`Unknown query type: ${queryType}`, 400));
    }

    // Apply limit if specified
    if (limit && Array.isArray(result.data)) {
        result.data = result.data.slice(0, parseInt(limit));
    }

    // Format response based on requested format
    if (format === "csv") {
        const csvData = analyticsService.convertToCSV(result.data,
            analyticsService.getExportConfig('sales')
        );

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=${queryType}_${Date.now()}.csv`,
        );
        return res.status(200).send(csvData);
    }

    formatResponse(
        res,
        {
            query: {
                type: queryType,
                parameters,
            },
            results: result.data,
            metadata: {
                count: Array.isArray(result.data) ? result.data.length : 1,
            },
        },
        startTime,
    );
});

/* ==========================================================================
   EXISTING ENDPOINTS
   ========================================================================== */

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

exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;

    const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
    formatResponse(res, segments, startTime);
});

exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { threshold = 90 } = req.query;
    const orgId = req.user.organizationId;

    const churnRisk = await analyticsService.analyzeChurnRisk(orgId, parseInt(threshold));
    formatResponse(res, churnRisk, startTime);
});

exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { minSupport = 2 } = req.query;
    const orgId = req.user.organizationId;

    const basketAnalysis = await analyticsService.performBasketAnalysis(orgId, parseInt(minSupport));
    formatResponse(res, basketAnalysis, startTime);
});

exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const paymentBehavior = await analyticsService.analyzePaymentHabits(orgId, branchId);
    formatResponse(res, paymentBehavior, startTime);
});

exports.getDeadStockReport = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, days = 90 } = req.query;
    const orgId = req.user.organizationId;

    const deadStock = await analyticsService.getDeadStockAnalysis(
        orgId,
        branchId,
        parseInt(days)
    );
    formatResponse(res, deadStock, startTime);
});

exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
    formatResponse(res, predictions, startTime);
});

exports.getCategoryAnalytics = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const { start, end } = getDateRange(req.query);
    const categoryAnalytics = await analyticsService.getCategoryAnalytics(
        orgId,
        branchId,
        start,
        end
    );
    formatResponse(res, categoryAnalytics, startTime);
});

exports.getSupplierPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const { start, end } = getDateRange(req.query);
    const supplierPerformance = await analyticsService.getSupplierPerformance(
        orgId,
        branchId,
        start,
        end
    );
    formatResponse(res, supplierPerformance, startTime);
});

exports.getStaffPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, minSales = 0, sortBy = 'revenue' } = req.query;
    const orgId = req.user.organizationId;

    const { start, end } = getDateRange(req.query);
    const staffPerformance = await analyticsService.getEmployeePerformance(
        orgId,
        branchId,
        start,
        end,
        parseFloat(minSales),
        sortBy
    );
    formatResponse(res, staffPerformance, startTime);
});

exports.getStaffAttendancePerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const { start, end } = getDateRange(req.query);
    const attendancePerformance = await analyticsService.getStaffAttendancePerformance(
        orgId,
        branchId,
        start,
        end
    );
    formatResponse(res, attendancePerformance, startTime);
});

exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const peakHours = await analyticsService.getPeakHourAnalysis(orgId, branchId);
    formatResponse(res, peakHours, startTime);
});

exports.getTimeBasedAnalytics = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const timeAnalytics = await analyticsService.getTimeBasedAnalytics(orgId, branchId);
    formatResponse(res, timeAnalytics, startTime);
});

exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const { start, end } = getDateRange(req.query);
    const procurement = await analyticsService.getProcurementStats(
        orgId,
        branchId,
        start,
        end
    );
    formatResponse(res, procurement, startTime);
});

exports.getEMIAnalytics = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const emiAnalytics = await analyticsService.getEMIAnalytics(orgId, branchId);
    formatResponse(res, emiAnalytics, startTime);
});

exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const criticalAlerts = await analyticsService.getCriticalAlerts(orgId, branchId);
    formatResponse(res, criticalAlerts, startTime);
});

exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const { start, end } = getDateRange(req.query);
    const securityLog = await analyticsService.getSecurityPulse(orgId, start, end);
    formatResponse(res, securityLog, startTime);
});

// exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { type, startDate, endDate, format = 'csv' } = req.query;
//     const orgId = req.user.organizationId;

//     if (!type) {
//         return next(new AppError('Export type is required (sales, inventory, customers)', 400));
//     }

//     const data = await analyticsService.getExportData(
//         orgId,
//         type,
//         startDate,
//         endDate
//     );

//     if (format === 'csv') {
//         const csvData = analyticsService.convertToCSV(
//             data,
//             analyticsService.getExportConfig(type)
//         );

//         res.setHeader('Content-Type', 'text/csv');
//         res.setHeader(
//             'Content-Disposition',
//             `attachment; filename=${type}_${Date.now()}.csv`
//         );
//         return res.status(200).send(csvData);
//     }

//     formatResponse(res, data, startTime);
// });
exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
    const { type, startDate, endDate } = req.query;

    // 1. Validation
    if (!['sales', 'inventory', 'customers'].includes(type)) {
        return next(new AppError('Invalid export type. Allowed: sales, inventory, customers', 400));
    }

    // 2. Fetch Data
    const data = await analyticsService.getExportData(
        req.user.organizationId, 
        type, 
        startDate, 
        endDate
    );

    if (!data || data.length === 0) {
        return next(new AppError(`No ${type} records found for the selected date range`, 404));
    }

    // 3. Get Configuration for Columns
    const config = analyticsService.getExportConfig(type);

    // 4. Convert Data to CSV String
    const csvData = analyticsService.convertToCSV(data, config);

    // 5. Send Response (File Download)
    const filename = `${type}_export_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    // Explicitly send the CSV string with 200 OK
    return res.status(200).send(csvData);
});
/* ==========================================================================
   SYSTEM PERFORMANCE & HEALTH
   ========================================================================== */

exports.getAnalyticsPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;

    const performance = await analyticsService.getPerformanceMetrics(orgId, 24);
    formatResponse(res, performance, startTime);
});

exports.getDataHealth = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;

    const healthCheck = await analyticsService.performDataHealthCheck(orgId);
    const healthScore = analyticsService.calculateDataHealthScore(healthCheck);

    formatResponse(res, {
        score: healthScore,
        checks: healthCheck,
        recommendations: analyticsService.generatePerformanceRecommendations(healthCheck)
    }, startTime);
});

/* ==========================================================================
   LEGACY ENDPOINTS (Backward Compatibility)
   ========================================================================== */

// Alias for backward compatibility
exports.getFinancialReport = exports.getFinancialDashboard;
exports.getInventoryReport = exports.getInventoryHealth;
exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const ltv = await analyticsService.calculateLTV(orgId, branchId);
    formatResponse(res, ltv, startTime);
});

exports.getCustomerRetention = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;

    const cohort = await analyticsService.getCohortAnalysis(orgId, 6);
    formatResponse(res, cohort, startTime);
});

exports.getCustomerInsights = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const [segments, churnRisk, ltv] = await Promise.all([
        analyticsService.getCustomerRFMAnalysis(orgId),
        analyticsService.analyzeChurnRisk(orgId, 90),
        analyticsService.calculateLTV(orgId, branchId),
    ]);

    const insights = analyticsService.generateCustomerInsights(segments, churnRisk, ltv);
    formatResponse(res, insights, startTime);
});

// Backward compatibility - custom query
exports.customQuery = exports.customAnalyticsQuery;

exports.getRedisStatus = catchAsync(async (req, res, next) => {
    const { isRedisAvailable, REDIS_ENABLED } = require('../../../core/utils/_legacy/redis');

    res.status(200).json({
        status: 'success',
        data: {
            redisEnabled: REDIS_ENABLED,
            redisAvailable: isRedisAvailable(),
            message: REDIS_ENABLED ?
                (isRedisAvailable() ? 'Redis is connected and ready' : 'Redis is enabled but not connected') :
                'Redis is disabled via configuration'
        }
    });
});

module.exports = exports;






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
//  * Response Formatter
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

//     res.status(200).json(response);
// };

// /* ==========================================================================
//    1. EXECUTIVE DASHBOARD (Enhanced with all models)
//    ========================================================================== */

// exports.getDashboardOverview = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, cache = "true" } = req.query;
//     const orgId = req.user.organizationId;

//     // Try cache first if enabled
//     const cacheKey = `dashboard_${orgId}_${branchId || "all"}_${start.toISOString()}_${end.toISOString()}`;

//     if (cache === "true") {
//         const cached = await analyticsService.getCachedData(cacheKey);
//         if (cached) {
//             return formatResponse(res, cached, startTime, {
//                 meta: { cached: true, source: "cache" },
//             });
//         }
//     }

//     // Get data from multiple models in parallel
//     const [
//         kpi,
//         charts,
//         inventory,
//         leaders,
//         alerts,
//         customerStats,
//         operationalStats,
//         attendanceStats,
//     ] = await Promise.all([
//         // Financial KPIs
//         analyticsService.getExecutiveStats(orgId, branchId, start, end),

//         // Charts and trends
//         analyticsService.getChartData(orgId, branchId, start, end, "day"),

//         // Inventory health
//         analyticsService.getInventoryAnalytics(orgId, branchId),

//         // Top performers
//         analyticsService.getLeaderboards(orgId, branchId, start, end),

//         // System alerts
//         analyticsService.getCriticalAlerts(orgId, branchId),

//         // Customer analytics
//         analyticsService.getCustomerRFMAnalysis(orgId),

//         // Operational efficiency
//         analyticsService.getOperationalStats(orgId, branchId, start, end),

//         // Staff attendance (if attendance module is enabled)
//         branchId
//             ? analyticsService.getBranchAttendanceStats(
//                   orgId,
//                   branchId,
//                   start,
//                   end,
//               )
//             : Promise.resolve({}),
//     ]);

//     const responseData = {
//         period: {
//             start,
//             end,
//             days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
//         },
//         financial: kpi,
//         trends: charts,
//         inventory: {
//             ...inventory,
//             healthScore:
//                 analyticsService.calculateInventoryHealthScore(inventory),
//         },
//         leaders,
//         alerts: {
//             ...alerts,
//             total:
//                 (alerts.lowStockCount || 0) + (alerts.highRiskDebtCount || 0),
//         },
//         customers: {
//             segmentation: customerStats,
//             atRisk: await analyticsService.analyzeChurnRisk(orgId, 90),
//         },
//         operations: operationalStats,
//         attendance: attendanceStats,
//         recommendations: analyticsService.generateBusinessRecommendations(
//             kpi,
//             inventory,
//             customerStats,
//         ),
//     };

//     // Cache the response
//     if (cache === "true") {
//         await analyticsService.cacheData(cacheKey, responseData, 300);
//     }

//     formatResponse(res, responseData, startTime, {
//         meta: { branchId: branchId || "all", cached: false },
//     });
// });

// /* ==========================================================================
//    2. FINANCIAL INTELLIGENCE SUITE
//    ========================================================================== */

// exports.getFinancialDashboard = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, includeDetails = false } = req.query;
//     const orgId = req.user.organizationId;

//     // Get comprehensive financial data
//     const [
//         kpi,
//         cashFlow,
//         profitability,
//         tax,
//         debtorAging,
//         paymentBehavior,
//         emiAnalytics,
//         accountBalances,
//     ] = await Promise.all([
//         // Core financial KPIs
//         analyticsService.getExecutiveStats(orgId, branchId, start, end),

//         // Cash flow analysis
//         analyticsService.getCashFlowStats(orgId, branchId, start, end),

//         // Profit margins
//         analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end),

//         // Tax analysis
//         analyticsService.getTaxStats(orgId, branchId, start, end),

//         // Debtor aging
//         analyticsService.getDebtorAging(orgId, branchId),

//         // Payment behavior
//         analyticsService.analyzePaymentHabits(orgId, branchId),

//         // EMI/credit sales
//         analyticsService.getEMIAnalytics(orgId, branchId),

//         // Account balances (from AccountEntry)
//         analyticsService.getAccountBalances(orgId, branchId),
//     ]);

//     const response = {
//         period: { start, end },
//         summary: {
//             revenue: kpi.totalRevenue,
//             expenses: kpi.totalExpense,
//             profit: kpi.netProfit,
//         },
//         cashFlow: {
//             ...cashFlow,
//             projections: await analyticsService.generateCashFlowProjection(
//                 orgId,
//                 branchId,
//                 30,
//             ),
//         },
//         profitability: {
//             ...profitability,
//             trend: await analyticsService.getProfitabilityTrend(
//                 orgId,
//                 branchId,
//                 start,
//                 end,
//             ),
//         },
//         compliance: {
//             tax: tax,
//             gstLiability: await analyticsService.calculateGSTLiability(
//                 orgId,
//                 branchId,
//                 start,
//                 end,
//             ),
//         },
//         receivables: {
//             aging: debtorAging,
//             riskAssessment: analyticsService.assessReceivablesRisk(debtorAging),
//         },
//         credit: {
//             emiAnalytics,
//             customerCredit: await analyticsService.getCustomerCreditExposure(
//                 orgId,
//                 branchId,
//             ),
//         },
//         paymentBehavior: paymentBehavior.slice(0, 10),
//         accountBalances: accountBalances.slice(0, 10),
//     };

//     if (includeDetails === "true") {
//         response.detailed = {
//             kpi,
//             cashFlow,
//             profitability,
//             tax,
//         };
//     }

//     formatResponse(res, response, startTime);
// });

// /* ==========================================================================
//    3. CUSTOMER INTELLIGENCE HUB
//    ========================================================================== */

// exports.getCustomerIntelligence = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const {
//         branchId,
//         includeSegments = true,
//         includeChurn = true,
//         includeLTV = true,
//     } = req.query;
//     const orgId = req.user.organizationId;

//     const [
//         segments,
//         churnRisk,
//         ltv,
//         paymentBehavior,
//         purchaseHistory,
//         returnHistory,
//         customerCategories,
//     ] = await Promise.all([
//         // Customer segmentation (RFM)
//         includeSegments === "true"
//             ? analyticsService.getCustomerRFMAnalysis(orgId)
//             : Promise.resolve({}),

//         // Churn risk analysis
//         includeChurn === "true"
//             ? analyticsService.analyzeChurnRisk(orgId, 90)
//             : Promise.resolve([]),

//         // Lifetime Value
//         includeLTV === "true"
//             ? analyticsService.calculateLTV(orgId, branchId)
//             : Promise.resolve({ customers: [], summary: {} }),

//         // Payment behavior
//         analyticsService.analyzePaymentHabits(orgId, branchId),

//         // Purchase history patterns
//         analyticsService.getCustomerPurchasePatterns(orgId, branchId),

//         // Return/refund history
//         analyticsService.getCustomerReturnAnalysis(orgId, branchId),

//         // Customer category analysis
//         analyticsService.getCustomerCategoryAnalysis(orgId, branchId),
//     ]);

//     // Calculate customer health scores
//     const customerInsights = analyticsService.generateCustomerInsights(
//         segments,
//         churnRisk,
//         ltv.customers || [],
//     );

//     formatResponse(
//         res,
//         {
//             segmentation: segments,
//             riskAnalysis: {
//                 highRisk: churnRisk.slice(0, 10),
//                 totalAtRisk: churnRisk.length,
//                 riskFactors: analyticsService.identifyChurnFactors(churnRisk),
//             },
//             valueAnalysis: {
//                 topLTV: (ltv.customers || []).slice(0, 10),
//                 avgLTV: ltv.summary?.avgLTV || 0,
//                 tierDistribution: ltv.summary?.tierDistribution || {},
//             },
//             behavior: {
//                 payment: paymentBehavior.slice(0, 15),
//                 purchasePatterns: purchaseHistory,
//                 returns: returnHistory,
//             },
//             categories: customerCategories,
//             insights: customerInsights,
//             recommendations:
//                 analyticsService.generateCustomerRetentionStrategies(
//                     customerInsights,
//                 ),
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    4. INVENTORY & PRODUCT INTELLIGENCE
//    ========================================================================== */

// exports.getInventoryHealth = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const {
//         branchId,
//         includeValuation = true,
//         includePredictions = true,
//     } = req.query;
//     const orgId = req.user.organizationId;

//     const [
//         analytics,
//         performance,
//         deadStock,
//         predictions,
//         categoryAnalysis,
//         supplierPerformance,
//         stockTurnover,
//         seasonalTrends,
//     ] = await Promise.all([
//         // Basic inventory analytics
//         analyticsService.getInventoryAnalytics(orgId, branchId),

//         // Product performance
//         analyticsService.getProductPerformanceStats(orgId, branchId),

//         // Dead stock analysis
//         analyticsService.getDeadStockAnalysis(orgId, branchId, 90),

//         // Stock-out predictions
//         includePredictions === "true"
//             ? analyticsService.getInventoryRunRate(orgId, branchId)
//             : Promise.resolve([]),

//         // Category analysis
//         analyticsService.getCategoryAnalytics(
//             orgId,
//             branchId,
//             new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
//             new Date(),
//         ),

//         // Supplier performance
//         analyticsService.getSupplierPerformance(
//             orgId,
//             branchId,
//             new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
//             new Date(),
//         ),

//         // Stock turnover rates
//         analyticsService.calculateInventoryTurnover(orgId, branchId),

//         // Seasonal trends
//         analyticsService.analyzeSeasonalTrends(orgId, branchId),
//     ]);

//     // Calculate health metrics
//     const healthScore = analyticsService.calculateInventoryHealthScore(
//         analytics,
//         performance,
//         deadStock,
//         stockTurnover,
//     );

//     // Generate recommendations
//     const recommendations = analyticsService.generateInventoryRecommendations(
//         analytics.lowStockAlerts,
//         deadStock,
//         predictions,
//         stockTurnover,
//     );

//     formatResponse(
//         res,
//         {
//             health: {
//                 score: healthScore,
//                 status:
//                     healthScore >= 80
//                         ? "Excellent"
//                         : healthScore >= 60
//                           ? "Good"
//                           : healthScore >= 40
//                             ? "Fair"
//                             : "Poor",
//                 details: {
//                     stockCoverage: analyticsService.calculateStockCoverage(
//                         analytics,
//                         predictions,
//                     ),
//                     serviceLevel: analyticsService.calculateServiceLevel(
//                         orgId,
//                         branchId,
//                     ),
//                 },
//             },
//             alerts: {
//                 lowStock: analytics.lowStockAlerts.length,
//                 deadStock: deadStock.length,
//                 criticalItems: predictions.filter(
//                     (p) => p.daysUntilStockout <= 7,
//                 ).length,
//                 expiringSoon: await analyticsService.getExpiringItems(
//                     orgId,
//                     branchId,
//                 ),
//             },
//             valuation:
//                 includeValuation === "true"
//                     ? analytics.inventoryValuation
//                     : undefined,
//             performance: {
//                 topSellers: performance.highMargin.slice(0, 10),
//                 slowMovers: deadStock.slice(0, 10),
//                 categoryBreakdown: categoryAnalysis,
//             },
//             predictions: predictions.filter((p) => p.daysUntilStockout <= 30),
//             suppliers: supplierPerformance.slice(0, 10),
//             turnover: stockTurnover,
//             seasonality: seasonalTrends,
//             recommendations: recommendations.slice(0, 10), // Top 10 recommendations
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    5. OPERATIONAL EXCELLENCE DASHBOARD
//    ========================================================================== */

// exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const {
//         branchId,
//         includeAttendance = true,
//         includeProcurement = true,
//     } = req.query;
//     const orgId = req.user.organizationId;

//     const [
//         metrics,
//         peakHours,
//         staffPerformance,
//         attendanceStats,
//         procurementStats,
//         efficiencyMetrics,
//         returnAnalysis,
//         qualityMetrics,
//     ] = await Promise.all([
//         // Basic operational metrics
//         analyticsService.getOperationalStats(orgId, branchId, start, end),

//         // Peak business hours
//         analyticsService.getPeakHourAnalysis(orgId, branchId),

//         // Staff performance
//         analyticsService.getEmployeePerformance(orgId, branchId, start, end),

//         // Attendance metrics
//         includeAttendance === "true"
//             ? analyticsService.getAttendanceAnalytics(
//                   orgId,
//                   branchId,
//                   start,
//                   end,
//               )
//             : Promise.resolve({}),

//         // Procurement efficiency
//         includeProcurement === "true"
//             ? analyticsService.getProcurementStats(orgId, branchId, start, end)
//             : Promise.resolve({}),

//         // Process efficiency
//         analyticsService.calculateEfficiencyMetrics(
//             orgId,
//             branchId,
//             start,
//             end,
//         ),

//         // Return analysis
//         analyticsService.getReturnAnalytics(orgId, branchId, start, end),

//         // Quality metrics
//         analyticsService.calculateQualityMetrics(orgId, branchId, start, end),
//     ]);

//     // Calculate operational efficiency score
//     const efficiencyScore =
//         analyticsService.calculateOperationalEfficiencyScore(
//             metrics,
//             attendanceStats,
//             efficiencyMetrics,
//         );

//     formatResponse(
//         res,
//         {
//             efficiency: {
//                 score: efficiencyScore,
//                 level:
//                     efficiencyScore >= 80
//                         ? "High"
//                         : efficiencyScore >= 60
//                           ? "Medium"
//                           : "Low",
//                 metrics: efficiencyMetrics,
//             },
//             productivity: {
//                 staff: staffPerformance.slice(0, 10),
//                 attendance:
//                     includeAttendance === "true" ? attendanceStats : undefined,
//                 correlations:
//                     await analyticsService.getProductivityCorrelations(
//                         orgId,
//                         branchId,
//                         start,
//                         end,
//                     ),
//             },
//             operations: {
//                 peakHours: {
//                     analysis: peakHours.slice(0, 24),
//                     recommendations:
//                         analyticsService.generateStaffingRecommendations(
//                             peakHours,
//                         ),
//                 },
//                 processes: metrics,
//                 quality: qualityMetrics,
//             },
//             procurement:
//                 includeProcurement === "true" ? procurementStats : undefined,
//             returns: {
//                 analysis: returnAnalysis.slice(0, 10),
//                 trends: analyticsService.analyzeReturnTrends(returnAnalysis),
//             },
//             kpis: analyticsService.calculateOperationalKPIs(
//                 metrics,
//                 efficiencyMetrics,
//                 qualityMetrics,
//             ),
//             improvementAreas: analyticsService.identifyOperationalImprovements(
//                 metrics,
//                 efficiencyMetrics,
//                 qualityMetrics,
//             ),
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    6. BRANCH COMPARISON & PERFORMANCE
//    ========================================================================== */

// exports.getBranchComparison = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { groupBy = "revenue", includeDetails = false } = req.query;
//     const orgId = req.user.organizationId;

//     // Get comparison data for all branches
//     const [
//         branchStats,
//         revenueComparison,
//         inventoryComparison,
//         staffComparison,
//         customerComparison,
//         operationalComparison,
//     ] = await Promise.all([
//         // Basic branch statistics
//         analyticsService.getBranchComparisonStats(
//             orgId,
//             start,
//             end,
//             groupBy,
//             50,
//         ),

//         // Revenue comparison
//         analyticsService.compareBranchRevenue(orgId, start, end),

//         // Inventory comparison
//         analyticsService.compareInventoryPerformance(orgId, start, end),

//         // Staff performance comparison
//         analyticsService.compareStaffPerformance(orgId, start, end),

//         // Customer metrics comparison
//         analyticsService.compareCustomerMetrics(orgId, start, end),

//         // Operational efficiency comparison
//         analyticsService.compareOperationalMetrics(orgId, start, end),
//     ]);

//     // Calculate branch performance scores
//     const enhancedStats = branchStats.map((branch, index) => {
//         const revenueData = revenueComparison.find(
//             (r) => r.branchId?.toString() === branch._id?.toString(),
//         );
//         const inventoryData = inventoryComparison.find(
//             (i) => i.branchId?.toString() === branch._id?.toString(),
//         );
//         const staffData = staffComparison.find(
//             (s) => s.branchId?.toString() === branch._id?.toString(),
//         );

//         // Calculate composite performance score
//         const performanceScore =
//             analyticsService.calculateBranchPerformanceScore(
//                 branch,
//                 revenueData,
//                 inventoryData,
//                 staffData,
//             );

//         return {
//             rank: index + 1,
//             ...branch,
//             performanceScore,
//             performanceLevel:
//                 performanceScore >= 80
//                     ? "High"
//                     : performanceScore >= 60
//                       ? "Medium"
//                       : "Low",
//             strengths: analyticsService.identifyBranchStrengths(
//                 branch,
//                 revenueData,
//                 inventoryData,
//             ),
//             opportunities: analyticsService.identifyBranchOpportunities(
//                 branch,
//                 revenueData,
//                 inventoryData,
//             ),
//         };
//     });

//     const response = {
//         comparison: {
//             branches: enhancedStats,
//             total: enhancedStats.length,
//             topPerformer: enhancedStats[0],
//             lowestPerformer: enhancedStats[enhancedStats.length - 1],
//         },
//         metrics: {
//             revenue: revenueComparison,
//             inventory: inventoryComparison,
//             staff: staffComparison,
//             customers: customerComparison,
//             operations: operationalComparison,
//         },
//         insights: {
//             bestPractices:
//                 analyticsService.identifyBestPractices(enhancedStats),
//             commonIssues: analyticsService.identifyCommonIssues(enhancedStats),
//             transferableStrategies:
//                 analyticsService.generateTransferableStrategies(enhancedStats),
//         },
//     };

//     if (includeDetails === "true") {
//         response.detailedComparison = {
//             branchStats,
//             revenueComparison,
//             inventoryComparison,
//             staffComparison,
//         };
//     }

//     formatResponse(res, response, startTime);
// });

// /* ==========================================================================
//    7. PREDICTIVE ANALYTICS & FORECASTING
//    ========================================================================== */

// exports.getPredictiveAnalytics = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { branchId, forecastPeriod = 3, confidence = 0.95 } = req.query;
//     const orgId = req.user.organizationId;

//     // Run multiple predictive models in parallel
//     const [
//         salesForecast,
//         inventoryForecast,
//         cashFlowForecast,
//         customerChurnForecast,
//         demandForecast,
//         seasonalityAnalysis,
//         riskPredictions,
//         opportunityPredictions,
//     ] = await Promise.all([
//         // Sales forecasting
//         analyticsService.generateAdvancedForecast(
//             orgId,
//             branchId,
//             parseInt(forecastPeriod),
//             parseFloat(confidence),
//         ),

//         // Inventory requirements forecasting
//         analyticsService.forecastInventoryRequirements(
//             orgId,
//             branchId,
//             parseInt(forecastPeriod),
//         ),

//         // Cash flow projections
//         analyticsService.forecastCashFlow(
//             orgId,
//             branchId,
//             parseInt(forecastPeriod),
//         ),

//         // Customer churn prediction
//         analyticsService.predictCustomerChurn(orgId, branchId),

//         // Demand forecasting
//         analyticsService.forecastDemand(
//             orgId,
//             branchId,
//             parseInt(forecastPeriod),
//         ),

//         // Seasonality analysis
//         analyticsService.analyzeSeasonalPatterns(orgId, branchId),

//         // Risk predictions
//         analyticsService.predictBusinessRisks(orgId, branchId),

//         // Opportunity identification
//         analyticsService.identifyBusinessOpportunities(orgId, branchId),
//     ]);

//     // Calculate forecast accuracy for each model
//     const accuracyScores =
//         await analyticsService.calculateForecastAccuracyScores(orgId, branchId);

//     formatResponse(
//         res,
//         {
//             sales: {
//                 forecast: salesForecast.forecast,
//                 confidence: salesForecast.confidence,
//                 accuracy: accuracyScores.sales,
//                 seasonalAdjustments: seasonalityAnalysis.sales,
//                 recommendations:
//                     analyticsService.generateSalesStrategies(salesForecast),
//             },
//             inventory: {
//                 forecast: inventoryForecast,
//                 accuracy: accuracyScores.inventory,
//                 recommendations:
//                     analyticsService.generateInventoryStrategies(
//                         inventoryForecast,
//                     ),
//             },
//             finance: {
//                 cashFlow: cashFlowForecast,
//                 accuracy: accuracyScores.cashFlow,
//                 riskAssessment: riskPredictions.financial,
//                 recommendations:
//                     analyticsService.generateFinancialStrategies(
//                         cashFlowForecast,
//                     ),
//             },
//             customers: {
//                 churnRisk: customerChurnForecast,
//                 accuracy: accuracyScores.churn,
//                 retentionOpportunities: opportunityPredictions.customers,
//                 recommendations: analyticsService.generateCustomerStrategies(
//                     customerChurnForecast,
//                 ),
//             },
//             demand: {
//                 forecast: demandForecast,
//                 accuracy: accuracyScores.demand,
//                 seasonalPatterns: seasonalityAnalysis.demand,
//                 recommendations:
//                     analyticsService.generateDemandStrategies(demandForecast),
//             },
//             risks: {
//                 predictions: riskPredictions,
//                 mitigationStrategies:
//                     analyticsService.generateRiskMitigationStrategies(
//                         riskPredictions,
//                     ),
//             },
//             opportunities: {
//                 identified: opportunityPredictions,
//                 implementationPlan:
//                     analyticsService.generateOpportunityImplementationPlan(
//                         opportunityPredictions,
//                     ),
//             },
//             overall: {
//                 confidenceLevel: Math.min(
//                     salesForecast.confidence || 0,
//                     accuracyScores.sales || 0,
//                     accuracyScores.inventory || 0,
//                 ),
//                 keyTakeaways: analyticsService.generatePredictiveTakeaways(
//                     salesForecast,
//                     inventoryForecast,
//                     cashFlowForecast,
//                     customerChurnForecast,
//                 ),
//             },
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    8. REAL-TIME MONITORING & ALERTS
//    ========================================================================== */

// exports.getRealTimeMonitoring = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { branchId, severity, category } = req.query;
//     const orgId = req.user.organizationId;

//     // Get real-time data from multiple sources
//     const [
//         systemAlerts,
//         inventoryAlerts,
//         financialAlerts,
//         customerAlerts,
//         operationalAlerts,
//         complianceAlerts,
//         performanceMetrics,
//         systemHealth,
//     ] = await Promise.all([
//         // System-level alerts
//         analyticsService.getSystemAlerts(orgId, branchId, severity),

//         // Inventory alerts
//         analyticsService.getInventoryAlerts(orgId, branchId),

//         // Financial alerts
//         analyticsService.getFinancialAlerts(orgId, branchId),

//         // Customer alerts
//         analyticsService.getCustomerAlerts(orgId, branchId),

//         // Operational alerts
//         analyticsService.getOperationalAlerts(orgId, branchId),

//         // Compliance alerts
//         analyticsService.getComplianceAlerts(orgId, branchId),

//         // Performance metrics
//         analyticsService.getRealTimePerformanceMetrics(orgId, branchId),

//         // System health status
//         analyticsService.getSystemHealthStatus(orgId, branchId),
//     ]);

//     // Categorize alerts by severity
//     const allAlerts = [
//         ...systemAlerts,
//         ...inventoryAlerts,
//         ...financialAlerts,
//         ...customerAlerts,
//         ...operationalAlerts,
//         ...complianceAlerts,
//     ];

//     const categorizedAlerts = {
//         critical: allAlerts.filter((a) => a.severity === "critical"),
//         warning: allAlerts.filter((a) => a.severity === "warning"),
//         info: allAlerts.filter((a) => a.severity === "info"),
//     };

//     // Calculate alert statistics
//     const alertStats = {
//         total: allAlerts.length,
//         critical: categorizedAlerts.critical.length,
//         warning: categorizedAlerts.warning.length,
//         info: categorizedAlerts.info.length,
//         resolvedToday: await analyticsService.getResolvedAlertsCount(
//             orgId,
//             branchId,
//         ),
//         averageResolutionTime: await analyticsService.getAverageResolutionTime(
//             orgId,
//             branchId,
//         ),
//     };

//     // Get alert trends
//     const alertTrends = await analyticsService.getAlertTrends(
//         orgId,
//         branchId,
//         7,
//     );

//     formatResponse(
//         res,
//         {
//             alerts: {
//                 categorized: categorizedAlerts,
//                 statistics: alertStats,
//                 trends: alertTrends,
//             },
//             monitoring: {
//                 performance: performanceMetrics,
//                 health: systemHealth,
//                 uptime: await analyticsService.getSystemUptime(orgId, branchId),
//                 lastUpdated: new Date().toISOString(),
//             },
//             dashboards: {
//                 realTimeSales: await analyticsService.getRealTimeSalesData(
//                     orgId,
//                     branchId,
//                 ),
//                 activeUsers: await analyticsService.getActiveUsers(
//                     orgId,
//                     branchId,
//                 ),
//                 currentTransactions:
//                     await analyticsService.getCurrentTransactions(
//                         orgId,
//                         branchId,
//                     ),
//             },
//             actions: {
//                 pending: await analyticsService.getPendingActions(
//                     orgId,
//                     branchId,
//                 ),
//                 overdue: await analyticsService.getOverdueActions(
//                     orgId,
//                     branchId,
//                 ),
//                 recommendations:
//                     analyticsService.generateAlertResponseRecommendations(
//                         categorizedAlerts,
//                     ),
//             },
//             notifications: {
//                 unread: await analyticsService.getUnreadNotificationsCount(
//                     orgId,
//                     req.user._id,
//                 ),
//                 recent: await analyticsService.getRecentNotifications(
//                     orgId,
//                     req.user._id,
//                     10,
//                 ),
//             },
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    9. COMPLIANCE & AUDIT DASHBOARD
//    ========================================================================== */

// exports.getComplianceDashboard = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { start, end } = getDateRange(req.query);
//     const { branchId, includeAuditLogs = true } = req.query;
//     const orgId = req.user.organizationId;

//     const [
//         taxCompliance,
//         gstCompliance,
//         auditLogs,
//         userActivity,
//         dataIntegrity,
//         securityAudit,
//         documentCompliance,
//         regulatoryUpdates,
//     ] = await Promise.all([
//         // Tax compliance
//         analyticsService.getTaxComplianceReport(orgId, branchId, start, end),

//         // GST compliance
//         analyticsService.getGSTComplianceReport(orgId, branchId, start, end),

//         // Audit logs
//         includeAuditLogs === "true"
//             ? analyticsService.getSecurityPulse(orgId, start, end)
//             : Promise.resolve({ recentEvents: [], riskyActions: 0 }),

//         // User activity monitoring
//         analyticsService.getUserActivityReport(orgId, branchId, start, end),

//         // Data integrity checks
//         analyticsService.performDataIntegrityChecks(orgId, branchId),

//         // Security audit
//         analyticsService.performSecurityAudit(orgId, branchId),

//         // Document compliance
//         analyticsService.checkDocumentCompliance(orgId, branchId),

//         // Regulatory updates
//         analyticsService.getRegulatoryUpdates(orgId, branchId),
//     ]);

//     // Calculate compliance score
//     const complianceScore = analyticsService.calculateComplianceScore(
//         taxCompliance,
//         gstCompliance,
//         dataIntegrity,
//         securityAudit,
//         documentCompliance,
//     );

//     formatResponse(
//         res,
//         {
//             compliance: {
//                 score: complianceScore,
//                 status:
//                     complianceScore >= 90
//                         ? "Compliant"
//                         : complianceScore >= 75
//                           ? "Mostly Compliant"
//                           : complianceScore >= 60
//                             ? "Needs Improvement"
//                             : "Non-Compliant",
//                 breakdown: {
//                     tax: taxCompliance.score || 0,
//                     gst: gstCompliance.score || 0,
//                     data: dataIntegrity.score || 0,
//                     security: securityAudit.score || 0,
//                     documents: documentCompliance.score || 0,
//                 },
//             },
//             tax: {
//                 ...taxCompliance,
//                 filingStatus: analyticsService.getTaxFilingStatus(
//                     orgId,
//                     branchId,
//                 ),
//                 pendingLiabilities:
//                     await analyticsService.getPendingTaxLiabilities(
//                         orgId,
//                         branchId,
//                     ),
//             },
//             gst: {
//                 ...gstCompliance,
//                 filingDueDates: await analyticsService.getGSTFilingDueDates(
//                     orgId,
//                     branchId,
//                 ),
//                 inputCredit: await analyticsService.getGSTInputCredit(
//                     orgId,
//                     branchId,
//                     start,
//                     end,
//                 ),
//             },
//             audit: {
//                 logs: auditLogs.recentEvents || [],
//                 riskyActions: auditLogs.riskyActions || 0,
//                 userActivity: userActivity,
//                 anomalies: await analyticsService.detectAuditAnomalies(
//                     auditLogs.recentEvents || [],
//                 ),
//             },
//             security: {
//                 ...securityAudit,
//                 vulnerabilities:
//                     await analyticsService.identifySecurityVulnerabilities(
//                         orgId,
//                         branchId,
//                     ),
//                 recommendations:
//                     analyticsService.generateSecurityRecommendations(
//                         securityAudit,
//                     ),
//             },
//             data: {
//                 ...dataIntegrity,
//                 backupStatus: await analyticsService.getBackupStatus(
//                     orgId,
//                     branchId,
//                 ),
//                 recoveryPoints: await analyticsService.getRecoveryPoints(
//                     orgId,
//                     branchId,
//                 ),
//             },
//             regulatory: {
//                 updates: regulatoryUpdates,
//                 upcomingChanges:
//                     await analyticsService.getUpcomingRegulatoryChanges(
//                         orgId,
//                         branchId,
//                     ),
//                 complianceCalendar:
//                     await analyticsService.getComplianceCalendar(
//                         orgId,
//                         branchId,
//                     ),
//             },
//             reports: {
//                 generated: await analyticsService.getGeneratedComplianceReports(
//                     orgId,
//                     branchId,
//                 ),
//                 pending: await analyticsService.getPendingComplianceReports(
//                     orgId,
//                     branchId,
//                 ),
//                 templates: await analyticsService.getComplianceReportTemplates(
//                     orgId,
//                     branchId,
//                 ),
//             },
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    10. CUSTOM QUERY & AD-HOC ANALYTICS
//    ========================================================================== */

// exports.customAnalyticsQuery = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const {
//         queryType,
//         parameters = {},
//         format = "json",
//         limit = 1000,
//         cache = true,
//     } = req.body;
//     const orgId = req.user.organizationId;
//     const { start, end } = getDateRange({
//         startDate: parameters.startDate,
//         endDate: parameters.endDate,
//     });

//     if (!queryType) {
//         return next(new AppError("Query type is required", 400));
//     }

//     // Check cache first
//     const cacheKey = `custom_${queryType}_${orgId}_${JSON.stringify(parameters)}`;

//     if (cache) {
//         const cached = await analyticsService.getCachedData(cacheKey);
//         if (cached) {
//             return formatResponse(res, cached, startTime, {
//                 meta: { cached: true, queryType },
//             });
//         }
//     }

//     // Execute query based on type
//     let result;
//     switch (queryType) {
//         case "customer_segments":
//             result = await analyticsService.getDetailedCustomerSegments(
//                 orgId,
//                 parameters.branchId,
//                 start,
//                 end,
//             );
//             break;

//         case "product_movement":
//             result = await analyticsService.getProductMovementAnalysis(
//                 orgId,
//                 parameters.branchId,
//                 start,
//                 end,
//             );
//             break;

//         case "supplier_performance":
//             result = await analyticsService.getDetailedSupplierPerformance(
//                 orgId,
//                 parameters.branchId,
//                 start,
//                 end,
//             );
//             break;

//         case "staff_efficiency":
//             result = await analyticsService.getDetailedStaffEfficiency(
//                 orgId,
//                 parameters.branchId,
//                 start,
//                 end,
//             );
//             break;

//         case "sales_trends":
//             result = await analyticsService.getDetailedSalesTrends(
//                 orgId,
//                 parameters.branchId,
//                 start,
//                 end,
//                 parameters.interval,
//             );
//             break;

//         case "inventory_turnover":
//             result = await analyticsService.getDetailedInventoryTurnover(
//                 orgId,
//                 parameters.branchId,
//                 start,
//                 end,
//             );
//             break;

//         case "payment_patterns":
//             result = await analyticsService.getDetailedPaymentPatterns(
//                 orgId,
//                 parameters.branchId,
//                 start,
//                 end,
//             );
//             break;

//         case "seasonal_analysis":
//             result = await analyticsService.getDetailedSeasonalAnalysis(
//                 orgId,
//                 parameters.branchId,
//                 parameters.year,
//             );
//             break;

//         case "branch_benchmarking":
//             result = await analyticsService.getBranchBenchmarkingData(
//                 orgId,
//                 start,
//                 end,
//             );
//             break;

//         case "custom_sql":
//             if (!parameters.query) {
//                 return next(
//                     new AppError(
//                         "SQL query is required for custom_sql type",
//                         400,
//                     ),
//                 );
//             }
//             result = await analyticsService.executeCustomSQLQuery(
//                 orgId,
//                 parameters.query,
//                 parameters.params || {},
//             );
//             break;

//         default:
//             return next(new AppError(`Unknown query type: ${queryType}`, 400));
//     }

//     // Apply limit if specified
//     if (limit && Array.isArray(result.data)) {
//         result.data = result.data.slice(0, parseInt(limit));
//     }

//     // Cache the result
//     if (cache) {
//         await analyticsService.cacheData(cacheKey, result, 600); // 10 minutes cache
//     }

//     // Format response based on requested format
//     if (format === "csv") {
//         const csvData = analyticsService.convertToCSV(result.data, {
//             columns: parameters.columns || Object.keys(result.data[0] || {}),
//             headers: parameters.headers || {},
//         });

//         res.setHeader("Content-Type", "text/csv");
//         res.setHeader(
//             "Content-Disposition",
//             `attachment; filename=${queryType}_${Date.now()}.csv`,
//         );
//         return res.status(200).send(csvData);
//     }

//     formatResponse(
//         res,
//         {
//             query: {
//                 type: queryType,
//                 parameters,
//                 executionTime: result.executionTime || 0,
//             },
//             results: result.data || result,
//             metadata: {
//                 count: Array.isArray(result.data) ? result.data.length : 1,
//                 total:
//                     result.total ||
//                     (Array.isArray(result.data) ? result.data.length : 1),
//                 ...result.metadata,
//             },
//         },
//         startTime,
//     );
// });

// /* ==========================================================================
//    LEGACY ENDPOINTS (Backward Compatibility)
//    ========================================================================== */

// // Original endpoints - kept for backward compatibility
// exports.getFinancialReport = exports.getFinancialDashboard;
// exports.getInventoryReport = exports.getInventoryHealth;
// exports.getProductPerformance = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const { branchId } = req.query;
//     const orgId = req.user.organizationId;

//     const data = await analyticsService.getProductPerformanceStats(
//         orgId,
//         branchId,
//     );
//     formatResponse(res, data, startTime);
// });

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
//     formatResponse(res, forecast, startTime);
// });

// exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
//     const startTime = performance.now();
//     const orgId = req.user.organizationId;

//     const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
//     formatResponse(res, segments, startTime);
// });

// // Export for external use
// module.exports = exports;







































// /* ==========================================================================
//    NEW ROUTES TO ADD TO YOUR ANALYTICS ROUTES
//    ========================================================================== */

// // Add these to your routes file:
// /*
// router.get(
//     '/staff-attendance-performance',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
//     analyticsController.getStaffAttendancePerformance
// );

// router.get(
//     '/category-performance',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
//     analyticsController.getCategoryAnalytics
// );

// router.get(
//     '/supplier-performance',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
//     analyticsController.getSupplierPerformance
// );

// router.get(
//     '/emi-analytics',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
//     analyticsController.getEMIAnalytics
// );

// router.get(
//     '/time-analytics',
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
//     analyticsController.getTimeBasedAnalytics
// );
// */

// // const analyticsService = require("../services/analyticsService");
// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const { performance } = require("perf_hooks");

// // /**
// //  * Smart Date Range with Validation
// //  */
// // const getDateRange = (query) => {
// //     const now = new Date();

// //     // Helper to validate and parse date
// //     const parseDate = (dateStr) => {
// //         if (!dateStr) return null;
// //         const parsed = new Date(dateStr);
// //         return isNaN(parsed.getTime()) ? null : parsed;
// //     };

// //     let start =
// //         parseDate(query.startDate) ||
// //         new Date(now.getFullYear(), now.getMonth(), 1);

// //     let end = parseDate(query.endDate) || new Date();
// //     end.setHours(23, 59, 59, 999);

// //     // Ensure start is before end
// //     if (start > end) {
// //         [start, end] = [end, start];
// //     }

// //     // Limit max range to 1 year for performance
// //     const maxDays = 365;
// //     const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
// //     if (diffDays > maxDays) {
// //         end = new Date(start);
// //         end.setDate(start.getDate() + maxDays);
// //     }

// //     return { start, end };
// // };

// // /**
// //  * Response Formatter
// //  */
// // const formatResponse = (res, data, startTime, options = {}) => {
// //     const responseTime = performance.now() - startTime;

// //     const response = {
// //         status: "success",
// //         data: data,
// //         meta: {
// //             timestamp: new Date().toISOString(),
// //             responseTime: `${responseTime.toFixed(2)}ms`,
// //             ...options.meta,
// //         },
// //     };

// //     res.status(200).json(response);
// // };

// // /* ==========================================================================
// //    1. SMART DASHBOARD ENDPOINTS
// //    ========================================================================== */

// // exports.getDashboardOverview = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId, cache = "true" } = req.query;
// //     const orgId = req.user.organizationId;

// //     // Try cache first if enabled
// //     const cacheKey = `dashboard_${orgId}_${branchId || "all"}_${start.toISOString()}_${end.toISOString()}`;

// //     if (cache === "true") {
// //         const cached = await analyticsService.getCachedData(cacheKey);
// //         if (cached) {
// //             return formatResponse(res, cached, startTime, {
// //                 meta: { cached: true, source: "redis" },
// //             });
// //         }
// //     }

// //     // Get data
// //     const [kpi, charts, inventory, leaders, alerts] = await Promise.all([
// //         analyticsService.getExecutiveStats(orgId, branchId, start, end),
// //         analyticsService.getChartData(orgId, branchId, start, end, "day"),
// //         analyticsService.getInventoryAnalytics(orgId, branchId),
// //         analyticsService.getLeaderboards(orgId, branchId, start, end),
// //         analyticsService.getCriticalAlerts(orgId, branchId),
// //     ]);

// //     const responseData = {
// //         period: {
// //             start,
// //             end,
// //             days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
// //         },
// //         kpi,
// //         charts,
// //         inventory,
// //         leaders,
// //         alerts,
// //     };

// //     // Cache the response
// //     if (cache === "true") {
// //         await analyticsService.cacheData(cacheKey, responseData, 300);
// //     }

// //     formatResponse(res, responseData, startTime, {
// //         meta: { branchId: branchId || "all", cached: false },
// //     });
// // });

// // exports.getBranchComparison = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { groupBy = "revenue", limit = 10 } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.getBranchComparisonStats(
// //         orgId,
// //         start,
// //         end,
// //         groupBy,
// //         parseInt(limit),
// //     );

// //     formatResponse(res, { branches: data, total: data.length }, startTime);
// // });

// // /* ==========================================================================
// //    2. ENHANCED FINANCIAL REPORTS
// //    ========================================================================== */

// // // Alias for getFinancialDashboard to match both routes
// // exports.getFinancialDashboard = exports.getFinancialReport = catchAsync(
// //     async (req, res, next) => {
// //         const startTime = performance.now();
// //         const { start, end } = getDateRange(req.query);
// //         const { branchId, interval = "auto", metrics = "all" } = req.query;
// //         const orgId = req.user.organizationId;

// //         const [kpi, charts] = await Promise.all([
// //             analyticsService.getExecutiveStats(orgId, branchId, start, end),
// //             analyticsService.getChartData(
// //                 orgId,
// //                 branchId,
// //                 start,
// //                 end,
// //                 interval === "auto" ? null : interval,
// //             ),
// //         ]);

// //         formatResponse(
// //             res,
// //             {
// //                 period: { start, end },
// //                 summary: kpi,
// //                 trends: charts,
// //             },
// //             startTime,
// //         );
// //     },
// // );

// // exports.getProfitabilityReport = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const profitStats = await analyticsService.getGrossProfitAnalysis(
// //         orgId,
// //         branchId,
// //         start,
// //         end,
// //     );
// //     formatResponse(res, profitStats, startTime);
// // });

// // exports.getCashFlowReport = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId, projectionDays = 30 } = req.query;
// //     const orgId = req.user.organizationId;

// //     const [currentFlow, projections, aging] = await Promise.all([
// //         analyticsService.getCashFlowStats(orgId, branchId, start, end),
// //         analyticsService.generateCashFlowProjection(
// //             orgId,
// //             branchId,
// //             parseInt(projectionDays),
// //         ),
// //         analyticsService.getDebtorAging(orgId, branchId),
// //     ]);

// //     formatResponse(
// //         res,
// //         {
// //             current: currentFlow,
// //             projections,
// //             aging,
// //         },
// //         startTime,
// //     );
// // });

// // exports.getDebtorAgingReport = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
// //     formatResponse(res, agingReport, startTime);
// // });

// // exports.getTaxReport = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.getTaxStats(
// //         orgId,
// //         branchId,
// //         start,
// //         end,
// //     );
// //     formatResponse(res, data, startTime);
// // });

// // /* ==========================================================================
// //    3. OPERATIONAL INTELLIGENCE
// //    ========================================================================== */

// // exports.getStaffPerformance = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId, minSales = 0, sortBy = "revenue" } = req.query;
// //     const orgId = req.user.organizationId;

// //     const staffStats = await analyticsService.getEmployeePerformance(
// //         orgId,
// //         branchId,
// //         start,
// //         end,
// //         parseFloat(minSales),
// //         sortBy,
// //     );

// //     formatResponse(
// //         res,
// //         {
// //             staff: staffStats,
// //             summary: {
// //                 totalStaff: staffStats.length,
// //                 topPerformer: staffStats[0]?.name || "N/A",
// //             },
// //         },
// //         startTime,
// //     );
// // });

// // exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId, includeDetails = "false" } = req.query;
// //     const orgId = req.user.organizationId;

// //     const [metrics, peakHours] = await Promise.all([
// //         analyticsService.getOperationalStats(orgId, branchId, start, end),
// //         analyticsService.getPeakHourAnalysis(orgId, branchId),
// //     ]);

// //     const response = {
// //         overview: {
// //             efficiency: metrics.orderEfficiency,
// //             discounts: metrics.discountMetrics,
// //             staffPerformance: metrics.topStaff.slice(0, 3),
// //         },
// //         peakHours: {
// //             hours: peakHours.slice(0, 24),
// //             recommendations:
// //                 analyticsService.generateStaffingRecommendations(peakHours),
// //         },
// //     };

// //     if (includeDetails === "true") {
// //         response.detailedMetrics = metrics;
// //     }

// //     formatResponse(res, response, startTime);
// // });

// // exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
// //     formatResponse(res, heatmap, startTime);
// // });

// // exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.getProcurementStats(
// //         orgId,
// //         branchId,
// //         start,
// //         end,
// //     );
// //     formatResponse(res, data, startTime);
// // });

// // exports.getCustomerInsights = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
// //     formatResponse(res, data, startTime);
// // });

// // /* ==========================================================================
// //    4. INTELLIGENT INVENTORY MANAGEMENT
// //    ========================================================================== */

// // exports.getInventoryHealth = exports.getInventoryReport = catchAsync(
// //     async (req, res, next) => {
// //         const startTime = performance.now();
// //         const {
// //             branchId,
// //             includeValuation = "true",
// //             includePredictions = "true",
// //         } = req.query;
// //         const orgId = req.user.organizationId;

// //         const [analytics, performance, deadStock, predictions] =
// //             await Promise.all([
// //                 analyticsService.getInventoryAnalytics(orgId, branchId),
// //                 analyticsService.getProductPerformanceStats(orgId, branchId),
// //                 analyticsService.getDeadStockAnalysis(orgId, branchId, 90),
// //                 includePredictions === "true"
// //                     ? analyticsService.getInventoryRunRate(orgId, branchId)
// //                     : Promise.resolve([]),
// //             ]);

// //         const response = {
// //             alerts: {
// //                 lowStock: analytics.lowStockAlerts.length,
// //                 deadStock: deadStock.length,
// //                 criticalItems: predictions.filter(
// //                     (p) => p.daysUntilStockout <= 7,
// //                 ).length,
// //             },
// //             topProducts: performance.highMargin.slice(0, 10),
// //             deadStock: deadStock.slice(0, 20),
// //             predictions: predictions.filter((p) => p.daysUntilStockout <= 30),
// //         };

// //         if (includeValuation === "true") {
// //             response.valuation = analytics.inventoryValuation;
// //         }

// //         formatResponse(res, response, startTime);
// //     },
// // );

// // exports.getProductPerformance = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.getProductPerformanceStats(
// //         orgId,
// //         branchId,
// //     );
// //     formatResponse(res, data, startTime);
// // });

// // exports.getDeadStockReport = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId, daysThreshold } = req.query;
// //     const orgId = req.user.organizationId;

// //     const deadStock = await analyticsService.getDeadStockAnalysis(
// //         orgId,
// //         branchId,
// //         daysThreshold,
// //     );
// //     formatResponse(res, deadStock, startTime);
// // });

// // exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const predictions = await analyticsService.getInventoryRunRate(
// //         orgId,
// //         branchId,
// //     );
// //     formatResponse(res, predictions, startTime);
// // });

// // /* ==========================================================================
// //    5. PREDICTIVE ANALYTICS
// //    ========================================================================== */

// // exports.getSalesForecast = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId, periods = 3, confidence = 0.95 } = req.query;
// //     const orgId = req.user.organizationId;

// //     const forecast = await analyticsService.generateAdvancedForecast(
// //         orgId,
// //         branchId,
// //         parseInt(periods),
// //         parseFloat(confidence),
// //     );

// //     formatResponse(res, forecast, startTime);
// // });

// // exports.getCustomerIntelligence = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const {
// //         branchId,
// //         includeSegments = "true",
// //         includeChurn = "true",
// //     } = req.query;
// //     const orgId = req.user.organizationId;

// //     const [segments, churnRisk, ltv, paymentBehavior] = await Promise.all([
// //         includeSegments === "true"
// //             ? analyticsService.getCustomerRFMAnalysis(orgId)
// //             : Promise.resolve({}),
// //         includeChurn === "true"
// //             ? analyticsService.analyzeChurnRisk(orgId, 90)
// //             : Promise.resolve([]),
// //         analyticsService.calculateLTV(orgId, branchId),
// //         analyticsService.analyzePaymentHabits(orgId, branchId),
// //     ]);

// //     formatResponse(
// //         res,
// //         {
// //             segmentation: segments,
// //             riskAnalysis: {
// //                 highRisk: churnRisk.slice(0, 10),
// //                 totalAtRisk: churnRisk.length,
// //             },
// //             valueAnalysis: {
// //                 topLTV: ltv.customers?.slice(0, 10) || [],
// //                 avgLTV: ltv.summary?.avgLTV || 0,
// //             },
// //             paymentBehavior: paymentBehavior.slice(0, 15),
// //         },
// //         startTime,
// //     );
// // });

// // exports.getCustomerRetention = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const orgId = req.user.organizationId;
// //     const months = req.query.months ? parseInt(req.query.months) : 6;

// //     const data = await analyticsService.getCohortAnalysis(orgId, months);
// //     formatResponse(res, data, startTime);
// // });

// // exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const orgId = req.user.organizationId;

// //     const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
// //     formatResponse(res, segments, startTime);
// // });

// // exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
// //     formatResponse(res, alerts, startTime);
// // });

// // /* ==========================================================================
// //    6. CUSTOMER INTELLIGENCE
// //    ========================================================================== */

// // exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.calculateLTV(orgId, branchId);
// //     formatResponse(res, data, startTime);
// // });

// // exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { daysThreshold = 90 } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.analyzeChurnRisk(
// //         orgId,
// //         parseInt(daysThreshold),
// //     );
// //     formatResponse(res, data, startTime);
// // });

// // exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const orgId = req.user.organizationId;
// //     const { minSupport = 2 } = req.query;

// //     const data = await analyticsService.performBasketAnalysis(
// //         orgId,
// //         parseInt(minSupport),
// //     );
// //     formatResponse(res, data, startTime);
// // });

// // exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId } = req.query;
// //     const orgId = req.user.organizationId;

// //     const data = await analyticsService.analyzePaymentHabits(orgId, branchId);
// //     formatResponse(res, data, startTime);
// // });

// // /* ==========================================================================
// //    7. SECURITY & MONITORING
// //    ========================================================================== */

// // exports.getSystemAlerts = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { branchId, severity, limit = 20 } = req.query;
// //     const orgId = req.user.organizationId;

// //     const alerts = await analyticsService.getRealTimeAlerts(
// //         orgId,
// //         branchId,
// //         severity,
// //         parseInt(limit),
// //     );

// //     formatResponse(
// //         res,
// //         {
// //             alerts,
// //             summary: {
// //                 total: alerts.length,
// //             },
// //             lastUpdated: new Date().toISOString(),
// //         },
// //         startTime,
// //     );
// // });

// // exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { start, end } = getDateRange(req.query);
// //     const orgId = req.user.organizationId;

// //     const securityStats = await analyticsService.getSecurityPulse(
// //         orgId,
// //         start,
// //         end,
// //     );
// //     formatResponse(res, securityStats, startTime);
// // });

// // /* ==========================================================================
// //    8. EXPORT SYSTEM
// //    ========================================================================== */

// // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const {
// //         type,
// //         format = "csv",
// //         compression = "false",
// //         columns = "all",
// //     } = req.query;

// //     const orgId = req.user.organizationId;
// //     const { start, end } = getDateRange(req.query);

// //     if (!type) {
// //         return next(
// //             new AppError(
// //                 "Export type is required (e.g., financial, sales, inventory)",
// //                 400,
// //             ),
// //         );
// //     }

// //     // Get export configuration
// //     const exportConfig = analyticsService.getExportConfig(type, columns);

// //     // Get data with selected columns only
// //     const data = await analyticsService.getExportData(
// //         orgId,
// //         type,
// //         start,
// //         end,
// //         exportConfig.columns,
// //     );

// //     if (!data || data.length === 0) {
// //         return next(new AppError("No data available to export", 404));
// //     }

// //     switch (format.toLowerCase()) {
// //         case "csv":
// //             const csvContent = analyticsService.convertToCSV(
// //                 data,
// //                 exportConfig,
// //             );
// //             res.setHeader("Content-Type", "text/csv");
// //             res.setHeader(
// //                 "Content-Disposition",
// //                 `attachment; filename=${type}-${Date.now()}.csv`,
// //             );
// //             return res.status(200).send(csvContent);

// //         case "excel":
// //             const excelBuffer = await analyticsService.convertToExcel(
// //                 data,
// //                 exportConfig,
// //             );
// //             res.setHeader(
// //                 "Content-Type",
// //                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
// //             );
// //             res.setHeader(
// //                 "Content-Disposition",
// //                 `attachment; filename=${type}-${Date.now()}.xlsx`,
// //             );
// //             return res.status(200).send(excelBuffer);

// //         case "pdf":
// //             const pdfBuffer = await analyticsService.convertToPDF(
// //                 data,
// //                 exportConfig,
// //             );
// //             res.setHeader("Content-Type", "application/pdf");
// //             res.setHeader(
// //                 "Content-Disposition",
// //                 `attachment; filename=${type}-${Date.now()}.pdf`,
// //             );
// //             return res.status(200).send(pdfBuffer);

// //         case "json":
// //         default:
// //             formatResponse(
// //                 res,
// //                 {
// //                     export: {
// //                         type,
// //                         format: "json",
// //                         recordCount: data.length,
// //                         data,
// //                     },
// //                 },
// //                 startTime,
// //             );
// //     }
// // });

// // /* ==========================================================================
// //    9. CUSTOM QUERY & SYSTEM HEALTH
// //    ========================================================================== */

// // exports.customQuery = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { query, parameters = {}, limit = 1000 } = req.body;
// //     const orgId = req.user.organizationId;

// //     if (!query) {
// //         return next(new AppError("Query is required", 400));
// //     }

// //     // Validate query
// //     const safeQuery = analyticsService.validateAndParseQuery(query);

// //     // Execute query
// //     const result = await analyticsService.executeCustomQuery(
// //         orgId,
// //         safeQuery,
// //         parameters,
// //         parseInt(limit),
// //     );

// //     formatResponse(
// //         res,
// //         {
// //             query: safeQuery,
// //             parameters,
// //             result,
// //         },
// //         startTime,
// //     );
// // });

// // exports.getAnalyticsPerformance = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const { hours = 24 } = req.query;
// //     const orgId = req.user.organizationId;

// //     const performanceStats = await analyticsService.getPerformanceMetrics(
// //         orgId,
// //         parseInt(hours),
// //     );

// //     formatResponse(
// //         res,
// //         {
// //             performance: performanceStats,
// //         },
// //         startTime,
// //     );
// // });

// // exports.getDataHealth = catchAsync(async (req, res, next) => {
// //     const startTime = performance.now();
// //     const orgId = req.user.organizationId;

// //     const healthCheck = await analyticsService.performDataHealthCheck(orgId);

// //     formatResponse(
// //         res,
// //         {
// //             health: healthCheck,
// //             score: analyticsService.calculateDataHealthScore(healthCheck),
// //             issues: healthCheck.filter((item) => item.status !== "healthy"),
// //             lastCheck: new Date().toISOString(),
// //         },
// //         startTime,
// //     );
// // });

// // // Export the original getFinancialReport for backward compatibility
// // exports.getFinancialReport = exports.getFinancialDashboard;
// // // const analyticsService = require("../services/analyticsService");
// // // const catchAsync = require("../utils/catchAsync");
// // // const AppError = require("../utils/appError");
// // // const { performance } = require("perf_hooks");

// // // /**
// // //  * Smart Date Range with Validation
// // //  */
// // // const getDateRange = (query) => {
// // //     const now = new Date();

// // //     // Helper to validate and parse date
// // //     const parseDate = (dateStr) => {
// // //         if (!dateStr) return null;
// // //         const parsed = new Date(dateStr);
// // //         return isNaN(parsed.getTime()) ? null : parsed;
// // //     };

// // //     let start =
// // //         parseDate(query.startDate) ||
// // //         new Date(now.getFullYear(), now.getMonth(), 1);

// // //     let end = parseDate(query.endDate) || new Date();
// // //     end.setHours(23, 59, 59, 999);

// // //     // Ensure start is before end
// // //     if (start > end) {
// // //         [start, end] = [end, start];
// // //     }

// // //     // Limit max range to 1 year for performance
// // //     const maxDays = 365;
// // //     const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
// // //     if (diffDays > maxDays) {
// // //         end = new Date(start);
// // //         end.setDate(start.getDate() + maxDays);
// // //     }

// // //     return { start, end };
// // // };

// // // /**
// // //  * Response Formatter with Performance Metrics
// // //  */
// // // const formatResponse = (res, data, startTime, options = {}) => {
// // //     const responseTime = performance.now() - startTime;

// // //     const response = {
// // //         status: "success",
// // //         data: data,
// // //         meta: {
// // //             timestamp: new Date().toISOString(),
// // //             responseTime: `${responseTime.toFixed(2)}ms`,
// // //             ...options.meta,
// // //         },
// // //     };

// // //     // Add performance warning for slow responses
// // //     if (responseTime > 2000) {
// // //         response.meta.performanceWarning = "Response time exceeded 2 seconds";
// // //     }

// // //     res.status(200).json(response);
// // // };

// // // /* ==========================================================================
// // //    1. SMART DASHBOARD ENDPOINTS
// // //    ========================================================================== */

// // // /**
// // //  * Intelligent Dashboard with Caching Support
// // //  */
// // // exports.getDashboardOverview = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId, cache = true } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const cacheKey = `dashboard_${orgId}_${branchId || "all"}_${start.toISOString()}_${end.toISOString()}`;

// // //     // Try cache first if enabled
// // //     if (cache === "true") {
// // //         const cached = await analyticsService.getCachedData(cacheKey);
// // //         if (cached) {
// // //             return formatResponse(res, cached, startTime, {
// // //                 meta: { cached: true, source: "redis" },
// // //             });
// // //         }
// // //     }

// // //     // Parallel execution for critical metrics
// // //     const [kpi, charts, inventory, leaders, alerts] = await Promise.all([
// // //         analyticsService.getExecutiveStats(orgId, branchId, start, end),
// // //         analyticsService.getChartData(orgId, branchId, start, end, "day"),
// // //         analyticsService.getInventoryAnalytics(orgId, branchId),
// // //         analyticsService.getLeaderboards(orgId, branchId, start, end, "top_5"),
// // //         analyticsService.getCriticalAlerts(orgId, branchId),
// // //     ]);

// // //     // Calculate insights
// // //     const insights = analyticsService.generateInsights(kpi, inventory, leaders);

// // //     const responseData = {
// // //         period: {
// // //             start,
// // //             end,
// // //             days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
// // //         },
// // //         kpi,
// // //         charts,
// // //         inventory: {
// // //             ...inventory,
// // //             insights:
// // //                 inventory.lowStockAlerts.length > 0
// // //                     ? `${inventory.lowStockAlerts.length} items need restocking`
// // //                     : "Stock levels are healthy",
// // //         },
// // //         leaders,
// // //         alerts,
// // //         insights,
// // //     };

// // //     // Cache the response
// // //     if (cache === "true") {
// // //         await analyticsService.cacheData(cacheKey, responseData, 300); // 5 minutes
// // //     }

// // //     formatResponse(res, responseData, startTime, {
// // //         meta: { branchId: branchId || "all", cached: false },
// // //     });
// // // });

// // // /**
// // //  * Branch Comparison with Smart Grouping
// // //  */
// // // exports.getBranchComparison = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { start, end } = getDateRange(req.query);
// // //     const { groupBy = "revenue", limit = 10 } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const data = await analyticsService.getBranchComparisonStats(
// // //         orgId,
// // //         start,
// // //         end,
// // //         groupBy,
// // //         parseInt(limit),
// // //     );

// // //     // Add rankings
// // //     const rankedData = data.map((branch, index) => ({
// // //         rank: index + 1,
// // //         ...branch,
// // //     }));

// // //     formatResponse(
// // //         res,
// // //         { branches: rankedData, total: data.length },
// // //         startTime,
// // //     );
// // // });

// // // /* ==========================================================================
// // //    2. ENHANCED FINANCIAL REPORTS
// // //    ========================================================================== */

// // // /**
// // //  * Financial Dashboard with Granular Control
// // //  */
// // // exports.getFinancialDashboard = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId, interval = "auto", metrics = "all" } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     // Auto-detect interval based on date range
// // //     const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
// // //     const autoInterval =
// // //         daysDiff > 90 ? "month" : daysDiff > 30 ? "week" : "day";
// // //     const finalInterval = interval === "auto" ? autoInterval : interval;

// // //     const [kpi, charts, cashflow, profitability] = await Promise.all([
// // //         analyticsService.getExecutiveStats(orgId, branchId, start, end),
// // //         analyticsService.getChartData(
// // //             orgId,
// // //             branchId,
// // //             start,
// // //             end,
// // //             finalInterval,
// // //         ),
// // //         analyticsService.getCashFlowStats(orgId, branchId, start, end),
// // //         analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end),
// // //     ]);

// // //     // Filter metrics if requested
// // //     const requestedMetrics = metrics.split(",");
// // //     const filteredKpi =
// // //         metrics !== "all"
// // //             ? Object.fromEntries(
// // //                   Object.entries(kpi).filter(([key]) =>
// // //                       requestedMetrics.includes(key),
// // //                   ),
// // //               )
// // //             : kpi;

// // //     formatResponse(
// // //         res,
// // //         {
// // //             period: { start, end, interval: finalInterval },
// // //             summary: filteredKpi,
// // //             trends: charts,
// // //             cashflow,
// // //             profitability,
// // //             recommendations: analyticsService.generateFinancialRecommendations(
// // //                 kpi,
// // //                 profitability,
// // //             ),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /**
// // //  * Real-time Cash Flow with Projections
// // //  */
// // // exports.getCashFlowReport = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId, projectionDays = 30 } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const [currentFlow, projections, aging] = await Promise.all([
// // //         analyticsService.getCashFlowStats(orgId, branchId, start, end),
// // //         analyticsService.generateCashFlowProjection(
// // //             orgId,
// // //             branchId,
// // //             parseInt(projectionDays),
// // //         ),
// // //         analyticsService.getDebtorAging(orgId, branchId),
// // //     ]);

// // //     formatResponse(
// // //         res,
// // //         {
// // //             current: currentFlow,
// // //             projections,
// // //             aging,
// // //             cashHealth: analyticsService.assessCashHealth(
// // //                 currentFlow,
// // //                 projections,
// // //             ),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /* ==========================================================================
// // //    3. ENHANCED OPERATIONAL INTELLIGENCE
// // //    ========================================================================== */

// // // /**
// // //  * Staff Performance with Productivity Metrics
// // //  */
// // // exports.getStaffPerformance = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId, minSales = 0, sortBy = "revenue" } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const staffStats = await analyticsService.getEmployeePerformance(
// // //         orgId,
// // //         branchId,
// // //         start,
// // //         end,
// // //         parseFloat(minSales),
// // //         sortBy,
// // //     );

// // //     // Calculate productivity scores
// // //     const enhancedStats = staffStats.map((staff) => ({
// // //         ...staff,
// // //         productivityScore: analyticsService.calculateProductivityScore(staff),
// // //         targetAchievement: analyticsService.calculateTargetAchievement(staff),
// // //         trend: analyticsService.getStaffTrend(staff._id, orgId, branchId),
// // //     }));

// // //     formatResponse(
// // //         res,
// // //         {
// // //             staff: enhancedStats,
// // //             summary: {
// // //                 totalStaff: enhancedStats.length,
// // //                 topPerformer: enhancedStats[0]?.name || "N/A",
// // //                 avgProductivity:
// // //                     enhancedStats.reduce(
// // //                         (sum, s) => sum + s.productivityScore,
// // //                         0,
// // //                     ) / enhancedStats.length,
// // //             },
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /**
// // //  * Operational Efficiency Dashboard
// // //  */
// // // exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { start, end } = getDateRange(req.query);
// // //     const { branchId, includeDetails = false } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const [metrics, peakHours, efficiency] = await Promise.all([
// // //         analyticsService.getOperationalStats(orgId, branchId, start, end),
// // //         analyticsService.getPeakHourAnalysis(orgId, branchId),
// // //         analyticsService.calculateEfficiencyMetrics(
// // //             orgId,
// // //             branchId,
// // //             start,
// // //             end,
// // //         ),
// // //     ]);

// // //     const response = {
// // //         overview: {
// // //             efficiency: metrics.orderEfficiency,
// // //             discounts: metrics.discountMetrics,
// // //             staffPerformance: metrics.topStaff.slice(0, 3),
// // //         },
// // //         peakHours: {
// // //             hours: peakHours.slice(0, 24),
// // //             recommendations:
// // //                 analyticsService.generateStaffingRecommendations(peakHours),
// // //         },
// // //         efficiency,
// // //         kpis: analyticsService.calculateOperationalKPIs(metrics),
// // //     };

// // //     if (includeDetails === "true") {
// // //         response.detailedMetrics = metrics;
// // //     }

// // //     formatResponse(res, response, startTime);
// // // });

// // // /* ==========================================================================
// // //    4. ADVANCED INVENTORY INTELLIGENCE
// // //    ========================================================================== */

// // // /**
// // //  * Inventory Health Dashboard
// // //  */
// // // exports.getInventoryHealth = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const {
// // //         branchId,
// // //         includeValuation = true,
// // //         includePredictions = true,
// // //     } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const [analytics, performance, deadStock, predictions] = await Promise.all([
// // //         analyticsService.getInventoryAnalytics(orgId, branchId),
// // //         analyticsService.getProductPerformanceStats(orgId, branchId),
// // //         analyticsService.getDeadStockAnalysis(orgId, branchId, 90),
// // //         includePredictions === "true"
// // //             ? analyticsService.getInventoryRunRate(orgId, branchId)
// // //             : Promise.resolve([]),
// // //     ]);

// // //     const healthScore = analyticsService.calculateInventoryHealthScore(
// // //         analytics,
// // //         performance,
// // //         deadStock,
// // //     );

// // //     formatResponse(
// // //         res,
// // //         {
// // //             health: {
// // //                 score: healthScore,
// // //                 status:
// // //                     healthScore >= 80
// // //                         ? "Healthy"
// // //                         : healthScore >= 60
// // //                           ? "Moderate"
// // //                           : "Needs Attention",
// // //             },
// // //             alerts: {
// // //                 lowStock: analytics.lowStockAlerts.length,
// // //                 deadStock: deadStock.length,
// // //                 criticalItems: predictions.filter(
// // //                     (p) => p.daysUntilStockout <= 7,
// // //                 ).length,
// // //             },
// // //             valuation:
// // //                 includeValuation === "true"
// // //                     ? analytics.inventoryValuation
// // //                     : undefined,
// // //             topProducts: performance.highMargin.slice(0, 10),
// // //             deadStock: deadStock.slice(0, 20),
// // //             predictions: predictions.filter((p) => p.daysUntilStockout <= 30),
// // //             recommendations: analyticsService.generateInventoryRecommendations(
// // //                 analytics.lowStockAlerts,
// // //                 deadStock,
// // //                 predictions,
// // //             ),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /* ==========================================================================
// // //    5. PREDICTIVE ANALYTICS WITH ML SUPPORT
// // //    ========================================================================== */

// // // /**
// // //  * Sales Forecast with Confidence Intervals
// // //  */
// // // exports.getSalesForecast = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { branchId, periods = 3, confidence = 0.95 } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const forecast = await analyticsService.generateAdvancedForecast(
// // //         orgId,
// // //         branchId,
// // //         parseInt(periods),
// // //         parseFloat(confidence),
// // //     );

// // //     formatResponse(
// // //         res,
// // //         {
// // //             forecast,
// // //             accuracy: await analyticsService.calculateForecastAccuracy(
// // //                 orgId,
// // //                 branchId,
// // //             ),
// // //             bestPerforming: await analyticsService.getBestPerformingProducts(
// // //                 orgId,
// // //                 branchId,
// // //                 5,
// // //             ),
// // //             recommendations:
// // //                 analyticsService.generateSalesRecommendations(forecast),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /**
// // //  * Customer Intelligence Hub
// // //  */
// // // exports.getCustomerIntelligence = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { branchId, includeSegments = true, includeChurn = true } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const [segments, churnRisk, ltv, paymentBehavior] = await Promise.all([
// // //         includeSegments === "true"
// // //             ? analyticsService.getCustomerRFMAnalysis(orgId)
// // //             : Promise.resolve({}),
// // //         includeChurn === "true"
// // //             ? analyticsService.analyzeChurnRisk(orgId, 90)
// // //             : Promise.resolve([]),
// // //         analyticsService.calculateLTV(orgId, branchId),
// // //         analyticsService.analyzePaymentHabits(orgId, branchId),
// // //     ]);

// // //     formatResponse(
// // //         res,
// // //         {
// // //             segmentation: segments,
// // //             riskAnalysis: {
// // //                 highRisk: churnRisk.slice(0, 10),
// // //                 totalAtRisk: churnRisk.length,
// // //             },
// // //             valueAnalysis: {
// // //                 topLTV: ltv.slice(0, 10),
// // //                 avgLTV: ltv.reduce((sum, c) => sum + c.ltv, 0) / ltv.length,
// // //             },
// // //             paymentBehavior: paymentBehavior.slice(0, 15),
// // //             insights: analyticsService.generateCustomerInsights(
// // //                 segments,
// // //                 churnRisk,
// // //                 ltv,
// // //             ),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /* ==========================================================================
// // //    6. REAL-TIME ALERTS & MONITORING
// // //    ========================================================================== */

// // // /**
// // //  * Real-time System Alerts
// // //  */
// // // exports.getSystemAlerts = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { branchId, severity, limit = 20 } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const alerts = await analyticsService.getRealTimeAlerts(
// // //         orgId,
// // //         branchId,
// // //         severity,
// // //         parseInt(limit),
// // //     );

// // //     // Group alerts by category
// // //     const groupedAlerts = alerts.reduce((acc, alert) => {
// // //         const category = alert.category || "general";
// // //         if (!acc[category]) acc[category] = [];
// // //         acc[category].push(alert);
// // //         return acc;
// // //     }, {});

// // //     formatResponse(
// // //         res,
// // //         {
// // //             alerts: groupedAlerts,
// // //             summary: {
// // //                 total: alerts.length,
// // //                 critical: alerts.filter((a) => a.severity === "critical")
// // //                     .length,
// // //                 warning: alerts.filter((a) => a.severity === "warning").length,
// // //                 info: alerts.filter((a) => a.severity === "info").length,
// // //             },
// // //             lastUpdated: new Date().toISOString(),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /* ==========================================================================
// // //    7. ENHANCED EXPORT SYSTEM
// // //    ========================================================================== */

// // // /**
// // //  * Advanced Data Export with Multiple Formats
// // //  */
// // // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const {
// // //         type,
// // //         format = "csv",
// // //         compression = false,
// // //         columns = "all",
// // //     } = req.query;

// // //     const orgId = req.user.organizationId;
// // //     const { start, end } = getDateRange(req.query);

// // //     if (!type) {
// // //         return next(
// // //             new AppError(
// // //                 "Export type is required (e.g., financial, sales, inventory)",
// // //                 400,
// // //             ),
// // //         );
// // //     }

// // //     // Get export configuration
// // //     const exportConfig = analyticsService.getExportConfig(type, columns);

// // //     // Get data with selected columns only
// // //     const data = await analyticsService.getExportData(
// // //         orgId,
// // //         type,
// // //         start,
// // //         end,
// // //         exportConfig.columns,
// // //     );

// // //     if (!data || data.length === 0) {
// // //         return next(new AppError("No data available to export", 404));
// // //     }

// // //     switch (format.toLowerCase()) {
// // //         case "csv":
// // //             const csvContent = analyticsService.convertToCSV(
// // //                 data,
// // //                 exportConfig,
// // //             );
// // //             res.setHeader("Content-Type", "text/csv");
// // //             res.setHeader(
// // //                 "Content-Disposition",
// // //                 `attachment; filename=${type}-${Date.now()}.csv`,
// // //             );
// // //             if (compression === "true") {
// // //                 res.setHeader("Content-Encoding", "gzip");
// // //                 // Add compression logic here
// // //             }
// // //             return res.status(200).send(csvContent);

// // //         case "excel":
// // //             const excelBuffer = await analyticsService.convertToExcel(
// // //                 data,
// // //                 exportConfig,
// // //             );
// // //             res.setHeader(
// // //                 "Content-Type",
// // //                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
// // //             );
// // //             res.setHeader(
// // //                 "Content-Disposition",
// // //                 `attachment; filename=${type}-${Date.now()}.xlsx`,
// // //             );
// // //             return res.status(200).send(excelBuffer);

// // //         case "pdf":
// // //             const pdfBuffer = await analyticsService.convertToPDF(
// // //                 data,
// // //                 exportConfig,
// // //             );
// // //             res.setHeader("Content-Type", "application/pdf");
// // //             res.setHeader(
// // //                 "Content-Disposition",
// // //                 `attachment; filename=${type}-${Date.now()}.pdf`,
// // //             );
// // //             return res.status(200).send(pdfBuffer);

// // //         case "json":
// // //         default:
// // //             formatResponse(
// // //                 res,
// // //                 {
// // //                     export: {
// // //                         type,
// // //                         format: "json",
// // //                         recordCount: data.length,
// // //                         data,
// // //                     },
// // //                 },
// // //                 startTime,
// // //             );
// // //     }
// // // });

// // // /* ==========================================================================
// // //    8. CUSTOM QUERY BUILDER
// // //    ========================================================================== */

// // // /**
// // //  * Custom Analytics Query Endpoint
// // //  */
// // // exports.customQuery = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { query, parameters = {}, limit = 1000 } = req.body;
// // //     const orgId = req.user.organizationId;

// // //     if (!query) {
// // //         return next(new AppError("Query is required", 400));
// // //     }

// // //     // Validate query (basic security check)
// // //     const safeQuery = analyticsService.validateAndParseQuery(query);

// // //     // Execute query with parameters
// // //     const result = await analyticsService.executeCustomQuery(
// // //         orgId,
// // //         safeQuery,
// // //         parameters,
// // //         parseInt(limit),
// // //     );

// // //     formatResponse(
// // //         res,
// // //         {
// // //             query: safeQuery,
// // //             parameters,
// // //             result: {
// // //                 data: result.data,
// // //                 total: result.total,
// // //                 executionTime: result.executionTime,
// // //             },
// // //             metadata: result.metadata,
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /* ==========================================================================
// // //    9. PERFORMANCE METRICS
// // //    ========================================================================== */

// // // /**
// // //  * Analytics Performance Monitoring
// // //  */
// // // exports.getAnalyticsPerformance = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const { hours = 24 } = req.query;
// // //     const orgId = req.user.organizationId;

// // //     const performanceStats = await analyticsService.getPerformanceMetrics(
// // //         orgId,
// // //         parseInt(hours),
// // //     );

// // //     formatResponse(
// // //         res,
// // //         {
// // //             performance: performanceStats,
// // //             recommendations:
// // //                 analyticsService.generatePerformanceRecommendations(
// // //                     performanceStats,
// // //                 ),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // /* ==========================================================================
// // //    10. DATA INTEGRITY CHECK
// // //    ========================================================================== */

// // // /**
// // //  * Data Health Check
// // //  */
// // // exports.getDataHealth = catchAsync(async (req, res, next) => {
// // //     const startTime = performance.now();
// // //     const orgId = req.user.organizationId;

// // //     const healthCheck = await analyticsService.performDataHealthCheck(orgId);

// // //     formatResponse(
// // //         res,
// // //         {
// // //             health: healthCheck,
// // //             score: analyticsService.calculateDataHealthScore(healthCheck),
// // //             issues: healthCheck.filter((item) => item.status !== "healthy"),
// // //             lastCheck: new Date().toISOString(),
// // //         },
// // //         startTime,
// // //     );
// // // });

// // // // const analyticsService = require('../services/analyticsService');
// // // // const catchAsync = require('../utils/catchAsync');
// // // // const AppError = require('../utils/appError');

// // // // /**
// // // //  * UTILITY: Get Safe Date Range
// // // //  * Prevents "Invalid Date" crashes
// // // //  */
// // // // const getDateRange = (query) => {
// // // //     const now = new Date();

// // // //     // Helper to validate date
// // // //     const parseDate = (d) => {
// // // //         const parsed = new Date(d);
// // // //         return isNaN(parsed.getTime()) ? null : parsed;
// // // //     };

// // // //     // Default: Start of current month
// // // //     let start = parseDate(query.startDate) || new Date(now.getFullYear(), now.getMonth(), 1);

// // // //     // Default: End of current day
// // // //     let end = parseDate(query.endDate) || new Date();
// // // //     end.setHours(23, 59, 59, 999);

// // // //     return { start, end };
// // // // };

// // // // /* ==========================================================================
// // // //    1. EXECUTIVE & STRATEGIC
// // // //    ========================================================================== */

// // // // exports.getDashboardOverview = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;

// // // //     const [kpi, charts, inventory, leaders] = await Promise.all([
// // // //         analyticsService.getExecutiveStats(orgId, branchId, start, end),
// // // //         analyticsService.getChartData(orgId, branchId, start, end, 'day'),
// // // //         analyticsService.getInventoryAnalytics(orgId, branchId),
// // // //         analyticsService.getLeaderboards(orgId, branchId, start, end)
// // // //     ]);

// // // //     res.status(200).json({
// // // //         status: 'success',
// // // //         data: { period: { start, end }, kpi, charts, inventory, leaders }
// // // //     });
// // // // });

// // // // exports.getBranchComparison = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getBranchComparisonStats(orgId, start, end);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // /* ==========================================================================
// // // //    2. FINANCIAL INTELLIGENCE
// // // //    ========================================================================== */

// // // // exports.getFinancialReport = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId, interval } = req.query;
// // // //     const orgId = req.user.organizationId;

// // // //     const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
// // // //     const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

// // // //     res.status(200).json({ status: 'success', data: { kpi, charts } });
// // // // });

// // // // exports.getProfitabilityReport = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);
// // // //     res.status(200).json({ status: 'success', data: profitStats });
// // // // });

// // // // exports.getCashFlowReport = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getCashFlowStats(orgId, branchId, start, end);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // exports.getDebtorAgingReport = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data: agingReport });
// // // // });

// // // // exports.getTaxReport = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getTaxStats(orgId, branchId, start, end);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // /* ==========================================================================
// // // //    3. OPERATIONAL & STAFF EFFICIENCY
// // // //    ========================================================================== */

// // // // exports.getStaffPerformance = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);
// // // //     res.status(200).json({ status: 'success', data: staffStats });
// // // // });

// // // // exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data: heatmap });
// // // // });

// // // // exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getProcurementStats(orgId, branchId, start, end);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // exports.getCustomerInsights = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // /* ==========================================================================
// // // //    4. INVENTORY INTELLIGENCE
// // // //    ========================================================================== */

// // // // exports.getInventoryReport = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // exports.getProductPerformance = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // exports.getDeadStockReport = catchAsync(async (req, res, next) => {
// // // //     const { branchId, daysThreshold } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);
// // // //     res.status(200).json({ status: 'success', data: deadStock });
// // // // });

// // // // exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data: predictions });
// // // // });

// // // // /* ==========================================================================
// // // //    5. PREDICTIVE & ADVANCED
// // // //    ========================================================================== */

// // // // exports.getSalesForecast = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const forecast = await analyticsService.generateForecast(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data: forecast });
// // // // });

// // // // exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
// // // //     const orgId = req.user.organizationId;
// // // //     const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
// // // //     res.status(200).json({ status: 'success', data: segments });
// // // // });

// // // // exports.getCustomerRetention = catchAsync(async (req, res, next) => {
// // // //     const orgId = req.user.organizationId;
// // // //     const months = req.query.months ? parseInt(req.query.months) : 6;
// // // //     const data = await analyticsService.getCohortAnalysis(orgId, months);
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
// // // //     res.status(200).json({ status: 'success', data: alerts });
// // // // });

// // // // /* ==========================================================================
// // // //    6. SECURITY & EXPORT
// // // //    ========================================================================== */

// // // // exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
// // // //     const { start, end } = getDateRange(req.query);
// // // //     const orgId = req.user.organizationId;
// // // //     const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);
// // // //     res.status(200).json({ status: 'success', data: securityStats });
// // // // });

// // // // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// // // //     const { type, format = 'csv' } = req.query;
// // // //     const orgId = req.user.organizationId;
// // // //     const { start, end } = getDateRange(req.query);

// // // //     // Validate Export Type
// // // //     if (!type) return next(new AppError('Export type is required (e.g., financial, sales)', 400));

// // // //     // Get Data
// // // //     const data = await analyticsService.getExportData(orgId, type, start, end);

// // // //     if (format === 'csv') {
// // // //         if (!data || data.length === 0) {
// // // //             return next(new AppError('No data available to export', 404));
// // // //         }

// // // //         // Simple JSON to CSV conversion without external library to avoid dependency issues
// // // //         const keys = Object.keys(data[0]);
// // // //         const csvContent = [
// // // //             keys.join(','), // Header
// // // //             ...data.map(row => keys.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(',')) // Rows
// // // //         ].join('\n');

// // // //         res.setHeader('Content-Type', 'text/csv');
// // // //         res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.csv`);
// // // //         return res.status(200).send(csvContent);
// // // //     }

// // // //     // Default JSON Response
// // // //     res.status(200).json({ status: 'success', data });
// // // // });

// // // // /* ==========================================================================
// // // //    7. CUSTOMER 360 INTELLIGENCE (NEW)
// // // //    ========================================================================== */

// // // // // 1. Customer Lifetime Value (LTV) & Acquisition Cost
// // // // exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;

// // // //     const data = await analyticsService.calculateLTV(orgId, branchId);

// // // //     res.status(200).json({
// // // //         status: 'success',
// // // //         message: 'Customer LTV calculated successfully',
// // // //         data
// // // //     });
// // // // });

// // // // // 2. Churn Risk (At-risk customers based on Recency)
// // // // exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
// // // //     const { daysThreshold = 90 } = req.query; // Default: No purchase in 90 days = At Risk
// // // //     const orgId = req.user.organizationId;

// // // //     const data = await analyticsService.analyzeChurnRisk(orgId, parseInt(daysThreshold));

// // // //     res.status(200).json({
// // // //         status: 'success',
// // // //         data
// // // //     });
// // // // });

// // // // // 3. Market Basket Analysis (Cross-Selling Patterns)
// // // // exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
// // // //     const orgId = req.user.organizationId;
// // // //     const { minSupport = 2 } = req.query; // Minimum times items bought together

// // // //     const data = await analyticsService.performBasketAnalysis(orgId, parseInt(minSupport));

// // // //     res.status(200).json({
// // // //         status: 'success',
// // // //         data
// // // //     });
// // // // });

// // // // // 4. Payment Behavior (Average Days to Pay)
// // // // exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
// // // //     const { branchId } = req.query;
// // // //     const orgId = req.user.organizationId;

// // // //     const data = await analyticsService.analyzePaymentHabits(orgId, branchId);

// // // //     res.status(200).json({
// // // //         status: 'success',
// // // //         data
// // // //     });
// // // // });
// // // // // const analyticsService = require('../services/analyticsService');
// // // // // const { Parser } = require('json2csv');
// // // // // const catchAsync = require('../utils/catchAsync'); // ✅ Standardized
// // // // // const AppError = require('../utils/appError');

// // // // // /**
// // // // //  * UTILITY: Get Safe Date Range
// // // // //  * Prevents "Invalid Date" crashes
// // // // //  */
// // // // // const getDateRange = (query) => {
// // // // //     const now = new Date();

// // // // //     // Helper to validate date
// // // // //     const parseDate = (d) => {
// // // // //         const parsed = new Date(d);
// // // // //         return isNaN(parsed.getTime()) ? null : parsed;
// // // // //     };

// // // // //     // Default: Start of current month
// // // // //     let start = parseDate(query.startDate) || new Date(now.getFullYear(), now.getMonth(), 1);

// // // // //     // Default: End of current day
// // // // //     let end = parseDate(query.endDate) || new Date();
// // // // //     end.setHours(23, 59, 59, 999);

// // // // //     return { start, end };
// // // // // };

// // // // // /* ==========================================================================
// // // // //    1. EXECUTIVE & STRATEGIC
// // // // //    ========================================================================== */

// // // // // exports.getDashboardOverview = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;

// // // // //     const [kpi, charts, inventory, leaders] = await Promise.all([
// // // // //         analyticsService.getExecutiveStats(orgId, branchId, start, end),
// // // // //         analyticsService.getChartData(orgId, branchId, start, end, 'day'),
// // // // //         analyticsService.getInventoryAnalytics(orgId, branchId),
// // // // //         analyticsService.getLeaderboards(orgId, branchId, start, end)
// // // // //     ]);

// // // // //     res.status(200).json({
// // // // //         status: 'success',
// // // // //         data: { period: { start, end }, kpi, charts, inventory, leaders }
// // // // //     });
// // // // // });

// // // // // exports.getBranchComparison = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getBranchComparisonStats(orgId, start, end);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // /* ==========================================================================
// // // // //    2. FINANCIAL INTELLIGENCE
// // // // //    ========================================================================== */

// // // // // exports.getFinancialReport = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId, interval } = req.query;
// // // // //     const orgId = req.user.organizationId;

// // // // //     const charts = await analyticsService.getChartData(orgId, branchId, start, end, interval || 'day');
// // // // //     const kpi = await analyticsService.getExecutiveStats(orgId, branchId, start, end);

// // // // //     res.status(200).json({ status: 'success', data: { kpi, charts } });
// // // // // });

// // // // // exports.getProfitabilityReport = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const profitStats = await analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end);
// // // // //     res.status(200).json({ status: 'success', data: profitStats });
// // // // // });

// // // // // exports.getCashFlowReport = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getCashFlowStats(orgId, branchId, start, end);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // exports.getDebtorAgingReport = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const agingReport = await analyticsService.getDebtorAging(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data: agingReport });
// // // // // });

// // // // // exports.getTaxReport = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getTaxStats(orgId, branchId, start, end);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // /* ==========================================================================
// // // // //    3. OPERATIONAL & STAFF EFFICIENCY
// // // // //    ========================================================================== */

// // // // // exports.getStaffPerformance = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const staffStats = await analyticsService.getEmployeePerformance(orgId, branchId, start, end);
// // // // //     res.status(200).json({ status: 'success', data: staffStats });
// // // // // });

// // // // // exports.getOperationalMetrics = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getOperationalStats(orgId, branchId, start, end);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const heatmap = await analyticsService.getPeakHourAnalysis(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data: heatmap });
// // // // // });

// // // // // exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getProcurementStats(orgId, branchId, start, end);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // exports.getCustomerInsights = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getCustomerRiskStats(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // /* ==========================================================================
// // // // //    4. INVENTORY INTELLIGENCE
// // // // //    ========================================================================== */

// // // // // exports.getInventoryReport = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getInventoryAnalytics(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // exports.getProductPerformance = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // exports.getDeadStockReport = catchAsync(async (req, res, next) => {
// // // // //     const { branchId, daysThreshold } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, daysThreshold);
// // // // //     res.status(200).json({ status: 'success', data: deadStock });
// // // // // });

// // // // // exports.getStockOutPredictions = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const predictions = await analyticsService.getInventoryRunRate(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data: predictions });
// // // // // });

// // // // // /* ==========================================================================
// // // // //    5. PREDICTIVE & ADVANCED
// // // // //    ========================================================================== */

// // // // // exports.getSalesForecast = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const forecast = await analyticsService.generateForecast(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data: forecast });
// // // // // });

// // // // // exports.getCustomerSegmentation = catchAsync(async (req, res, next) => {
// // // // //     const orgId = req.user.organizationId;
// // // // //     const segments = await analyticsService.getCustomerRFMAnalysis(orgId);
// // // // //     res.status(200).json({ status: 'success', data: segments });
// // // // // });

// // // // // exports.getCustomerRetention = catchAsync(async (req, res, next) => {
// // // // //     const orgId = req.user.organizationId;
// // // // //     const months = req.query.months ? parseInt(req.query.months) : 6;
// // // // //     const data = await analyticsService.getCohortAnalysis(orgId, months);
// // // // //     res.status(200).json({ status: 'success', data });
// // // // // });

// // // // // exports.getCriticalAlerts = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;
// // // // //     const alerts = await analyticsService.getCriticalAlerts(orgId, branchId);
// // // // //     res.status(200).json({ status: 'success', data: alerts });
// // // // // });

// // // // // /* ==========================================================================
// // // // //    6. SECURITY & EXPORT
// // // // //    ========================================================================== */

// // // // // exports.getSecurityAuditLog = catchAsync(async (req, res, next) => {
// // // // //     const { start, end } = getDateRange(req.query);
// // // // //     const orgId = req.user.organizationId;
// // // // //     const securityStats = await analyticsService.getSecurityPulse(orgId, start, end);
// // // // //     res.status(200).json({ status: 'success', data: securityStats });
// // // // // });

// // // // // // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// // // // // //     const { start, end } = getDateRange(req.query);
// // // // // //     const orgId = req.user.organizationId;

// // // // // //     res.setHeader('Content-Type', 'text/csv');
// // // // // //     res.setHeader('Content-Disposition', `attachment; filename=export-${Date.now()}.csv`);

// // // // // //     // You need to add a method in Service that returns a Mongoose Cursor, not an Array
// // // // // //     const cursor = analyticsService.getExportCursor(orgId, req.query.type, start, end);

// // // // // //     // Use a library like 'fast-csv' or 'json2csv' Transform stream
// // // // // //     const { Transform } = require('json2csv');
// // // // // //     const transformOpts = { highWaterMark: 16384, encoding: 'utf-8' };
// // // // // //     const json2csv = new Transform({ fields: ['invoiceNumber', 'amount', 'date'] }, transformOpts);

// // // // // //     cursor.pipe(json2csv).pipe(res);
// // // // // // });

// // // // // // exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
// // // // // //     const { type, format = 'csv' } = req.query;
// // // // // //     const orgId = req.user.organizationId;
// // // // // //     const { start, end } = getDateRange(req.query);

// // // // // //     // Validate Export Type
// // // // // //     if (!type) return next(new AppError('Export type is required (e.g., financial, sales)', 400));

// // // // // //     const data = await analyticsService.getExportData(orgId, type, start, end);

// // // // // //     if (format === 'csv') {
// // // // // //         if (!data || data.length === 0) {
// // // // // //             return next(new AppError('No data available to export for this range', 404));
// // // // // //         }

// // // // // //         const parser = new Parser();
// // // // // //         const csv = parser.parse(data);

// // // // // //         res.header('Content-Type', 'text/csv');
// // // // // //         res.attachment(`${type}-report-${Date.now()}.csv`);
// // // // // //         return res.send(csv);
// // // // // //     }

// // // // // //     res.status(200).json({ status: 'success', data });
// // // // // // });

// // // // // /* ==========================================================================
// // // // //    7. CUSTOMER 360 INTELLIGENCE (NEW)
// // // // //    ========================================================================== */

// // // // // // 1. Customer Lifetime Value (LTV) & Acquisition Cost
// // // // // exports.getCustomerLifetimeValue = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;

// // // // //     const data = await analyticsService.calculateLTV(orgId, branchId);

// // // // //     res.status(200).json({
// // // // //         status: 'success',
// // // // //         message: 'Customer LTV calculated successfully',
// // // // //         data
// // // // //     });
// // // // // });

// // // // // // 2. Churn Risk (At-risk customers based on Recency)
// // // // // exports.getChurnRiskAnalysis = catchAsync(async (req, res, next) => {
// // // // //     const { daysThreshold = 90 } = req.query; // Default: No purchase in 90 days = At Risk
// // // // //     const orgId = req.user.organizationId;

// // // // //     const data = await analyticsService.analyzeChurnRisk(orgId, parseInt(daysThreshold));

// // // // //     res.status(200).json({
// // // // //         status: 'success',
// // // // //         data
// // // // //     });
// // // // // });

// // // // // // 3. Market Basket Analysis (Cross-Selling Patterns)
// // // // // exports.getMarketBasketAnalysis = catchAsync(async (req, res, next) => {
// // // // //     const orgId = req.user.organizationId;
// // // // //     const { minSupport = 2 } = req.query; // Minimum times items bought together

// // // // //     const data = await analyticsService.performBasketAnalysis(orgId, parseInt(minSupport));

// // // // //     res.status(200).json({
// // // // //         status: 'success',
// // // // //         data
// // // // //     });
// // // // // });

// // // // // // 4. Payment Behavior (Average Days to Pay)
// // // // // exports.getPaymentBehaviorStats = catchAsync(async (req, res, next) => {
// // // // //     const { branchId } = req.query;
// // // // //     const orgId = req.user.organizationId;

// // // // //     const data = await analyticsService.analyzePaymentHabits(orgId, branchId);

// // // // //     res.status(200).json({
// // // // //         status: 'success',
// // // // //         data
// // // // //     });
// // // // // });
