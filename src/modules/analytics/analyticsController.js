const analyticsService = require("./index");
const catchAsync = require("../../core/utils/api/catchAsync");
const AppError = require("../../core/utils/api/appError");
const { performance } = require("perf_hooks");

/* ==========================================================================
   UTILITIES
   ========================================================================== */

/**
 * Smart Date Range Parser with validation & clamping
 */
const getDateRange = (query) => {
    const now = new Date();
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        if (dateStr instanceof Date && !isNaN(dateStr.getTime())) return dateStr;
        if (typeof dateStr === 'number') {
            const ts = new Date(dateStr);
            return isNaN(ts.getTime()) ? null : ts;
        }
        const numeric = Number(dateStr);
        if (!Number.isNaN(numeric) && `${numeric}` === `${dateStr}` && `${dateStr}`.length >= 10) {
            const ts = new Date(numeric);
            return isNaN(ts.getTime()) ? null : ts;
        }
        const parsed = new Date(dateStr);
        return isNaN(parsed.getTime()) ? null : parsed;
    };

    const startInput =
        query.startDate ?? query.fromDate ?? query.dateFrom ?? query.start ?? null;
    const endInput =
        query.endDate ?? query.toDate ?? query.dateTo ?? query.end ?? null;

    let start = parseDate(startInput) || new Date(now.getFullYear(), now.getMonth(), 1);
    let end = parseDate(endInput) || new Date();
    end.setHours(23, 59, 59, 999);

    // Ensure start is before end
    if (start > end) [start, end] = [end, start];

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
 * Standardized Response Formatter with timing metadata
 */
const formatResponse = (res, data, startTime, options = {}) => {
    const responseTime = performance.now() - startTime;
    res.status(200).json({
        status: "success",
        data,
        meta: {
            timestamp: new Date().toISOString(),
            responseTime: `${responseTime.toFixed(2)}ms`,
            ...options.meta,
        },
    });
};

/**
 * Safe slice helper — prevents crash if data is not an array
 */
const safeSlice = (arr, count = 10) => (Array.isArray(arr) ? arr.slice(0, count) : []);

/* ==========================================================================
   1. EXECUTIVE DASHBOARD — Main entry point
   ========================================================================== */

exports.getDashboardOverview = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId, cache = "true" } = req.query;
    const orgId = req.user.organizationId;

    // Check cache first
    const cacheKey = `dashboard_${orgId}_${branchId || "all"}_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}`;
    if (cache === "true") {
        const cached = await analyticsService.getCachedData(cacheKey);
        if (cached) {
            return formatResponse(res, cached, startTime, {
                meta: { cached: true, source: "cache" },
            });
        }
    }

    // FIX: Destructuring now matches the exact order of promises
    const [
        kpi,
        topCategories,
        charts,
        inventory,
        leaders,
        alerts,
        customerSegments,
        operationalStats,
    ] = await Promise.all([
        analyticsService.getExecutiveStats(orgId, branchId, start, end),
        analyticsService.getTopCategories(orgId, branchId, start, end),
        analyticsService.getChartData(orgId, branchId, start, end, "auto"),
        analyticsService.getInventoryAnalytics(orgId, branchId),
        analyticsService.getLeaderboards(orgId, branchId, start, end),
        analyticsService.getCriticalAlerts(orgId, branchId),
        analyticsService.getCustomerRFMAnalysis(orgId),
        analyticsService.getOperationalStats(orgId, branchId, start, end),
    ]);

    const responseData = {
        period: {
            start, end,
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
        topCategories,
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

    // Cache the response (fire-and-forget)
    if (cache === "true") {
        analyticsService.cacheData(cacheKey, responseData, 300).catch(() => {});
    }

    formatResponse(res, responseData, startTime, {
        meta: { branchId: branchId || "all", cached: false },
    });
});

/* ==========================================================================
   2. FINANCIAL DASHBOARD
   ========================================================================== */

exports.getFinancialDashboard = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const [
        kpi,
        cashFlow,
        profitability,
        tax,
        debtorAging,
        paymentBehavior,
        emiAnalytics,
    ] = await Promise.all([
        analyticsService.getExecutiveStats(orgId, branchId, start, end),
        analyticsService.getCashFlowStats(orgId, branchId, start, end),
        analyticsService.getGrossProfitAnalysis(orgId, branchId, start, end),
        analyticsService.getTaxStats(orgId, branchId, start, end),
        analyticsService.getDebtorAging(orgId, branchId),
        analyticsService.analyzePaymentHabits(orgId, branchId),
        analyticsService.getEMIAnalytics(orgId, branchId),
    ]);

    formatResponse(res, {
        period: { start, end },
        summary: {
            revenue: kpi.totalRevenue,
            expenses: kpi.totalExpense,
            profit: kpi.netProfit,
        },
        cashFlow,
        profitability,
        tax,
        receivables: { aging: debtorAging },
        credit: { emiAnalytics },
        paymentBehavior: safeSlice(paymentBehavior, 10),
        recommendations: analyticsService.generateFinancialRecommendations(kpi, profitability),
    }, startTime);
});

/* ==========================================================================
   3. CUSTOMER INTELLIGENCE
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
        analyticsService.getCustomerRFMAnalysis(orgId),
        analyticsService.analyzeChurnRisk(orgId, 90),
        analyticsService.calculateLTV(orgId, branchId),
        analyticsService.analyzePaymentHabits(orgId, branchId),
        analyticsService.getCustomerRiskStats(orgId, branchId),
    ]);

    formatResponse(res, {
        segmentation: segments,
        riskAnalysis: {
            highRisk: safeSlice(churnRisk, 10),
            totalAtRisk: churnRisk.length,
            creditRisk: customerRisk.creditRisk,
        },
        valueAnalysis: {
            topLTV: safeSlice(ltv.customers, 10),
            avgLTV: ltv.summary.avgLTV,
            totalLTV: ltv.summary.totalLTV,
        },
        behavior: {
            payment: safeSlice(paymentBehavior, 15),
        },
        recommendations: {
            highValue: safeSlice(ltv.customers.filter(c => c.tier === 'Platinum'), 5),
            atRisk: safeSlice(churnRisk, 5),
        },
    }, startTime);
});

/* ==========================================================================
   4. INVENTORY HEALTH DASHBOARD
   ========================================================================== */

exports.getInventoryHealth = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // FIX: Renamed `performance` → `productPerformance` to avoid shadowing perf_hooks
    const [
        analytics,
        productPerformance,
        deadStock,
        predictions,
        categoryAnalysis,
        supplierPerformance,
        stockTurnover,
    ] = await Promise.all([
        analyticsService.getInventoryAnalytics(orgId, branchId),
        analyticsService.getProductPerformanceStats(orgId, branchId),
        analyticsService.getDeadStockAnalysis(orgId, branchId, 90),
        analyticsService.getInventoryRunRate(orgId, branchId),
        analyticsService.getCategoryAnalytics(orgId, branchId, ninetyDaysAgo, new Date()),
        analyticsService.getSupplierPerformance(orgId, branchId, ninetyDaysAgo, new Date()),
        analyticsService.calculateInventoryTurnover(orgId, branchId),
    ]);

    const healthScore = analyticsService.calculateInventoryHealthScore(
        analytics, productPerformance, deadStock
    );

    const recommendations = analyticsService.generateInventoryRecommendations(
        analytics.lowStockAlerts, deadStock, predictions
    );

    formatResponse(res, {
        health: {
            score: healthScore,
            status: healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : healthScore >= 40 ? "Fair" : "Poor",
        },
        alerts: {
            lowStock: analytics.lowStockAlerts.length,
            deadStock: deadStock.length,
            criticalItems: predictions.filter(p => p.daysUntilStockout <= 7).length,
        },
        valuation: analytics.inventoryValuation,
        performance: {
            topSellers: safeSlice(productPerformance.highMargin, 10),
            slowMovers: safeSlice(deadStock, 10),
            categoryBreakdown: categoryAnalysis,
        },
        predictions: predictions.filter(p => p.daysUntilStockout <= 30),
        suppliers: safeSlice(supplierPerformance, 10),
        turnover: stockTurnover,
        recommendations,
    }, startTime);
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
        analyticsService.getOperationalStats(orgId, branchId, start, end),
        analyticsService.getPeakHourAnalysis(orgId, branchId),
        analyticsService.getEmployeePerformance(orgId, branchId, start, end, 0, 'totalSales'),
        analyticsService.getProcurementStats(orgId, branchId, start, end),
        analyticsService.getReturnAnalytics(orgId, branchId, start, end),
    ]);

    formatResponse(res, {
        operations: {
            peakHours,
            recommendations: analyticsService.generateStaffingRecommendations(peakHours),
        },
        productivity: {
            staff: safeSlice(staffPerformance, 10),
        },
        procurement: procurementStats,
        returns: {
            analysis: safeSlice(returnAnalysis, 10),
        },
        metrics,
    }, startTime);
});

/* ==========================================================================
   6. BRANCH COMPARISON
   ========================================================================== */

exports.getBranchComparison = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { groupBy = "revenue" } = req.query;
    const orgId = req.user.organizationId;

    const branchStats = await analyticsService.getBranchComparisonStats(orgId, start, end, groupBy, 50);

    formatResponse(res, {
        comparison: {
            branches: branchStats,
            total: branchStats.length,
            topPerformer: branchStats[0] || null,
            lowestPerformer: branchStats[branchStats.length - 1] || null,
        },
    }, startTime);
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
        analyticsService.generateAdvancedForecast(orgId, branchId, parseInt(periods), parseFloat(confidence)),
        analyticsService.getInventoryRunRate(orgId, branchId),
        analyticsService.generateCashFlowProjection(orgId, branchId, 30),
    ]);

    formatResponse(res, {
        sales: {
            forecast: salesForecast.forecast,
            confidence: salesForecast.confidence,
            accuracy: salesForecast.accuracy,
        },
        inventory: { predictions: inventoryForecast },
        cashFlow: cashFlowProjection,
    }, startTime);
});

/* ==========================================================================
   8. REAL-TIME MONITORING & ALERTS
   ========================================================================== */

exports.getRealTimeMonitoring = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
        criticalAlerts,
        inventoryAlerts,
        customerAlerts,
        securityPulse,
    ] = await Promise.all([
        analyticsService.getCriticalAlerts(orgId, branchId),
        analyticsService.getInventoryAnalytics(orgId, branchId),
        analyticsService.getCustomerRiskStats(orgId, branchId),
        analyticsService.getSecurityPulse(orgId, sevenDaysAgo.toISOString().split('T')[0], new Date().toISOString().split('T')[0]),
    ]);

    const allAlerts = [
        ...(criticalAlerts.itemsToReorder || []).map(item => ({
            type: 'inventory', severity: 'warning',
            message: `Low stock: ${item}`,
            timestamp: new Date().toISOString(),
        })),
        ...(customerAlerts.creditRisk || []).map(customer => ({
            type: 'customer',
            severity: customer.outstandingBalance > customer.creditLimit ? 'critical' : 'warning',
            message: `High credit risk: ${customer.name} - ₹${customer.outstandingBalance} outstanding`,
            timestamp: new Date().toISOString(),
        })),
    ];

    formatResponse(res, {
        alerts: {
            critical: allAlerts.filter(a => a.severity === 'critical'),
            warning: allAlerts.filter(a => a.severity === 'warning'),
            info: allAlerts.filter(a => a.severity === 'info'),
            total: allAlerts.length,
        },
        security: securityPulse,
        monitoring: { lastUpdated: new Date().toISOString() },
    }, startTime);
});

/* ==========================================================================
   9. COMPLIANCE DASHBOARD
   ========================================================================== */

exports.getComplianceDashboard = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { start, end } = getDateRange(req.query);
    const { branchId } = req.query;
    const orgId = req.user.organizationId;

    const [taxStats, securityPulse] = await Promise.all([
        analyticsService.getTaxStats(orgId, branchId, start, end),
        analyticsService.getSecurityPulse(orgId, start, end),
    ]);

    formatResponse(res, {
        tax: {
            ...taxStats,
            compliance: taxStats.netPayable >= 0 ? 'Compliant' : 'Review Needed',
        },
        audit: {
            recentEvents: securityPulse.recentEvents || [],
            riskyActions: securityPulse.riskyActions || 0,
        },
        dataHealth: {
            score: 85,
            issues: await analyticsService.performDataHealthCheck(orgId),
        },
    }, startTime);
});

/* ==========================================================================
   10. CUSTOM QUERY & AD-HOC ANALYTICS
   ========================================================================== */

exports.customAnalyticsQuery = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { queryType, parameters = {}, format = "json", limit = 1000 } = req.body;
    const orgId = req.user.organizationId;

    if (!queryType) {
        return next(new AppError("Query type is required", 400));
    }

    let result;

    switch (queryType) {
        case "product_movement": {
            const { start, end } = getDateRange({ startDate: parameters.startDate, endDate: parameters.endDate });
            const invoices = await analyticsService.getExportData(orgId, 'sales', start, end);
            result = { data: invoices };
            break;
        }
        case "inventory_status": {
            const inventory = await analyticsService.getExportData(orgId, 'inventory');
            result = { data: inventory };
            break;
        }
        case "customer_analysis": {
            const ltv = await analyticsService.calculateLTV(orgId, parameters.branchId);
            result = { data: ltv.customers };
            break;
        }
        case "staff_performance": {
            const { start: sStart, end: sEnd } = getDateRange({ startDate: parameters.startDate, endDate: parameters.endDate });
            const staff = await analyticsService.getEmployeePerformance(orgId, parameters.branchId, sStart, sEnd, 0, parameters.sortBy || 'totalSales');
            result = { data: staff };
            break;
        }
        default:
            return next(new AppError(`Unknown query type: ${queryType}`, 400));
    }

    // Apply limit
    if (limit && Array.isArray(result.data)) {
        result.data = result.data.slice(0, parseInt(limit));
    }

    // CSV format response
    if (format === "csv") {
        const csvData = analyticsService.convertToCSV(result.data, analyticsService.getExportConfig('sales'));
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=${queryType}_${Date.now()}.csv`);
        return res.status(200).send(csvData);
    }

    formatResponse(res, {
        query: { type: queryType, parameters },
        results: result.data,
        metadata: { count: Array.isArray(result.data) ? result.data.length : 1 },
    }, startTime);
});

/* ==========================================================================
   INDIVIDUAL ENDPOINTS
   ========================================================================== */

exports.getProductPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await analyticsService.getProductPerformanceStats(orgId, branchId);
    formatResponse(res, data, startTime);
});

exports.getSalesForecast = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, periods = 3, confidence = 0.95 } = req.query;
    const orgId = req.user.organizationId;
    const forecast = await analyticsService.generateAdvancedForecast(orgId, branchId, parseInt(periods), parseFloat(confidence));
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
    const deadStock = await analyticsService.getDeadStockAnalysis(orgId, branchId, parseInt(days));
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
    const categoryAnalytics = await analyticsService.getCategoryAnalytics(orgId, branchId, start, end);
    formatResponse(res, categoryAnalytics, startTime);
});

exports.getSupplierPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);
    const supplierPerformance = await analyticsService.getSupplierPerformance(orgId, branchId, start, end);
    formatResponse(res, supplierPerformance, startTime);
});

exports.getStaffPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId, minSales = 0, sortBy = 'revenue' } = req.query;
    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);
    const staffPerformance = await analyticsService.getEmployeePerformance(orgId, branchId, start, end, parseFloat(minSales), sortBy);
    formatResponse(res, staffPerformance, startTime);
});

exports.getStaffAttendancePerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);
    const attendancePerformance = await analyticsService.getStaffAttendancePerformance(orgId, branchId, start, end);
    formatResponse(res, attendancePerformance, startTime);
});

exports.getPeakBusinessHours = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const peakHours = await analyticsService.getPeakHourAnalysis(orgId, branchId);
    formatResponse(res, peakHours, startTime);
});

// FIX: Added date params — service expects (orgId, branchId, startDate, endDate)
exports.getTimeBasedAnalytics = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);
    const timeAnalytics = await analyticsService.getTimeBasedAnalytics(orgId, branchId, start, end);
    formatResponse(res, timeAnalytics, startTime);
});

exports.getProcurementAnalysis = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);
    const procurement = await analyticsService.getProcurementStats(orgId, branchId, start, end);
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
    const orgId = req.user.organizationId;
    const { start, end } = getDateRange(req.query);
    const securityLog = await analyticsService.getSecurityPulse(orgId, start, end);
    formatResponse(res, securityLog, startTime);
});

exports.exportAnalyticsData = catchAsync(async (req, res, next) => {
    const { type, startDate, endDate } = req.query;

    if (!['sales', 'inventory', 'customers'].includes(type)) {
        return next(new AppError('Invalid export type. Allowed: sales, inventory, customers', 400));
    }

    const data = await analyticsService.getExportData(req.user.organizationId, type, startDate, endDate);

    if (!data || data.length === 0) {
        return next(new AppError(`No ${type} records found for the selected date range`, 404));
    }

    const config = analyticsService.getExportConfig(type);
    const csvData = analyticsService.convertToCSV(data, config);
    const filename = `${type}_export_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    return res.status(200).send(csvData);
});

/* ==========================================================================
   SYSTEM PERFORMANCE & HEALTH
   ========================================================================== */

// FIX: Renamed `performance` → `perfMetrics` to avoid shadowing perf_hooks.performance
exports.getAnalyticsPerformance = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;
    const perfMetrics = await analyticsService.getPerformanceMetrics(orgId, 24);
    formatResponse(res, perfMetrics, startTime);
});

exports.getDataHealth = catchAsync(async (req, res, next) => {
    const startTime = performance.now();
    const orgId = req.user.organizationId;
    const healthCheck = await analyticsService.performDataHealthCheck(orgId);
    const healthScore = analyticsService.calculateDataHealthScore(healthCheck);
    formatResponse(res, {
        score: healthScore,
        checks: healthCheck,
        recommendations: analyticsService.generatePerformanceRecommendations(healthCheck),
    }, startTime);
});

/* ==========================================================================
   LEGACY ALIASES (Backward Compatibility)
   ========================================================================== */

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

exports.customQuery = exports.customAnalyticsQuery;

exports.getRedisStatus = catchAsync(async (req, res, next) => {
    const { isRedisAvailable, REDIS_ENABLED } = require('../../config/redis');
    res.status(200).json({
        status: 'success',
        data: {
            redisEnabled: REDIS_ENABLED,
            redisAvailable: isRedisAvailable(),
            message: REDIS_ENABLED
                ? (isRedisAvailable() ? 'Redis is connected and ready' : 'Redis is enabled but not connected')
                : 'Redis is disabled via configuration',
        },
    });
});

module.exports = exports;
