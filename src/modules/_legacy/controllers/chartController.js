/**
 * ============================================================
 * APEX CRM — chartController.js  (Complete)
 * ============================================================
 * 18 chart endpoints, all using catchAsync + consistent shape.
 * Every response: { status: 'success', data: <Chart.js payload> }
 * ============================================================
 */

'use strict';

const chartService = require('../services/chartService');
const catchAsync = require('../../../core/utils/api/catchAsync');

// ─── Helper ──────────────────────────────────────────────────

/** Parse startDate/endDate from query, defaulting to current year */
const getRange = (req) => {
    const now = new Date();
    const start = req.query.startDate
        ? new Date(req.query.startDate)
        : new Date(now.getFullYear(), 0, 1);
    const end = req.query.endDate
        ? new Date(req.query.endDate)
        : new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

const getOrgId = (req) => req.user.organizationId;
const getYear = (req) => parseInt(req.query.year, 10) || new Date().getFullYear();
const send = (res, data) => res.status(200).json({ status: 'success', data });

// ─────────────────────────────────────────────────────────────
// 1. Financial Trend  — GET /charts/financial-trend
//    ?year=2024  &interval=month
// ─────────────────────────────────────────────────────────────
exports.getFinancialTrend = catchAsync(async (req, res) => {
    const { interval = 'month' } = req.query;
    const data = await chartService.getFinancialSeries(getOrgId(req), getYear(req), interval);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 2. Gross Profit Trend  — GET /charts/gross-profit
//    ?year=2024
// ─────────────────────────────────────────────────────────────
exports.getGrossProfitTrend = catchAsync(async (req, res) => {
    const data = await chartService.getGrossProfitTrend(getOrgId(req), getYear(req));
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 3. Sales Distribution  — GET /charts/sales-distribution
//    ?groupBy=category|branch|paymentMethod  &startDate=  &endDate=
// ─────────────────────────────────────────────────────────────
exports.getSalesDistribution = catchAsync(async (req, res) => {
    const { groupBy = 'category' } = req.query;
    const { start, end } = getRange(req);
    const data = await chartService.getDistributionData(getOrgId(req), groupBy, start, end);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 4. Branch Performance Radar  — GET /charts/branch-radar
//    ?startDate=  &endDate=
// ─────────────────────────────────────────────────────────────
exports.getBranchPerformanceRadar = catchAsync(async (req, res) => {
    const { start, end } = getRange(req);
    const data = await chartService.getBranchRadarData(getOrgId(req), start, end);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 5. Order Funnel  — GET /charts/order-funnel
//    ?startDate=  &endDate=
// ─────────────────────────────────────────────────────────────
exports.getOrderFunnel = catchAsync(async (req, res) => {
    const { start, end } = getRange(req);
    const data = await chartService.getOrderFunnelData(getOrgId(req), start, end);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 6. Year-over-Year Growth  — GET /charts/yoy-growth
//    ?year=2024
// ─────────────────────────────────────────────────────────────
exports.getYoYGrowth = catchAsync(async (req, res) => {
    const data = await chartService.getYoYGrowth(getOrgId(req), getYear(req));
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 7. Top Performers  — GET /charts/top-performers
//    ?type=products|customers|staff  &limit=5  &startDate=  &endDate=
// ─────────────────────────────────────────────────────────────
exports.getTopPerformers = catchAsync(async (req, res) => {
    const { type = 'products', limit = 5 } = req.query;
    const { start, end } = getRange(req);
    const data = await chartService.getTopPerformers(getOrgId(req), type, limit, start, end);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 8. Customer Acquisition  — GET /charts/customer-acquisition
//    ?year=2024
// ─────────────────────────────────────────────────────────────
exports.getCustomerAcquisition = catchAsync(async (req, res) => {
    const data = await chartService.getCustomerAcquisition(getOrgId(req), getYear(req));
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 9. AOV Trend  — GET /charts/aov-trend
//    ?year=2024
// ─────────────────────────────────────────────────────────────
exports.getAOVTrend = catchAsync(async (req, res) => {
    const data = await chartService.getAOVTrend(getOrgId(req), getYear(req));
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 10. Heatmap  — GET /charts/heatmap
//     ?branchId=  &days=30
// ─────────────────────────────────────────────────────────────
exports.getHeatmap = catchAsync(async (req, res) => {
    const { branchId, days = 30 } = req.query;
    const data = await chartService.getHeatmap(getOrgId(req), branchId, days);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 11. Payment Method Breakdown  — GET /charts/payment-methods
//     ?startDate=  &endDate=
// ─────────────────────────────────────────────────────────────
exports.getPaymentMethodBreakdown = catchAsync(async (req, res) => {
    const { start, end } = getRange(req);
    const data = await chartService.getPaymentMethodBreakdown(getOrgId(req), start, end);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 12. EMI Portfolio Stats  — GET /charts/emi-portfolio
// ─────────────────────────────────────────────────────────────
exports.getEmiPortfolioStats = catchAsync(async (req, res) => {
    const data = await chartService.getEmiPortfolioStats(getOrgId(req));
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 13. Inventory Health  — GET /charts/inventory-health
//     ?branchId=
// ─────────────────────────────────────────────────────────────
exports.getInventoryHealth = catchAsync(async (req, res) => {
    const { branchId } = req.query;
    const data = await chartService.getInventoryHealth(getOrgId(req), branchId);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 14. Customer Outstanding  — GET /charts/customer-outstanding
//     ?limit=10
// ─────────────────────────────────────────────────────────────
exports.getCustomerOutstanding = catchAsync(async (req, res) => {
    const { limit = 10 } = req.query;
    const data = await chartService.getCustomerOutstanding(getOrgId(req), limit);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 15. Sales Return Rate  — GET /charts/return-rate
//     ?year=2024
// ─────────────────────────────────────────────────────────────
exports.getSalesReturnRate = catchAsync(async (req, res) => {
    const data = await chartService.getSalesReturnRate(getOrgId(req), getYear(req));
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 16. Purchase vs Sales  — GET /charts/purchase-vs-sales
//     ?year=2024
// ─────────────────────────────────────────────────────────────
exports.getPurchaseVsSales = catchAsync(async (req, res) => {
    const data = await chartService.getPurchaseVsSales(getOrgId(req), getYear(req));
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 17. Attendance KPIs  — GET /charts/attendance-kpis
//     ?branchId=  &days=30
// ─────────────────────────────────────────────────────────────
exports.getAttendanceKpis = catchAsync(async (req, res) => {
    const { branchId, days = 30 } = req.query;
    const data = await chartService.getAttendanceKpis(getOrgId(req), branchId, days);
    send(res, data);
});

// ─────────────────────────────────────────────────────────────
// 18. Leave Utilization  — GET /charts/leave-utilization
//     ?financialYear=2024-2025
// ─────────────────────────────────────────────────────────────
exports.getLeaveUtilization = catchAsync(async (req, res) => {
    const { financialYear } = req.query;
    const data = await chartService.getLeaveUtilization(getOrgId(req), financialYear);
    send(res, data);
});
// const chartService = require('../services/chartService');
// const catchAsync = require('../../../core/utils/api/catchAsync');
// const AppError = require('../../../core/utils/api/appError');

// // Helper for dates
// const getRange = (req) => {
//     const end = req.query.endDate ? new Date(req.query.endDate) : new Date();
//     const start = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().getFullYear(), 0, 1);
//     end.setHours(23, 59, 59, 999);
//     return { start, end };
// };

// exports.getFinancialTrend = catchAsync(async (req, res, next) => {
//     const { interval = 'month', year } = req.query;
//     const orgId = req.user.organizationId;
//     const targetYear = year ? parseInt(year) : new Date().getFullYear();
//     const data = await chartService.getFinancialSeries(orgId, targetYear, interval);
//     res.status(200).json({
//         status: 'success',
//         data
//     });
// });

// exports.getSalesDistribution = catchAsync(async (req, res, next) => {
//     const { groupBy = 'category' } = req.query;
//     const { start, end } = getRange(req);
//     const orgId = req.user.organizationId;
//     const data = await chartService.getDistributionData(orgId, groupBy, start, end);
//     res.status(200).json({
//         status: 'success',
//         data
//     });
// });

// exports.getBranchPerformanceRadar = catchAsync(async (req, res, next) => {
//     const { start, end } = getRange(req);
//     const orgId = req.user.organizationId;
//     const data = await chartService.getBranchRadarData(orgId, start, end);
//     res.status(200).json({
//         status: 'success',
//         data
//     });
// });

// exports.getOrderFunnel = catchAsync(async (req, res, next) => {
//     const { start, end } = getRange(req);
//     const orgId = req.user.organizationId;
//     const data = await chartService.getOrderFunnelData(orgId, start, end);
//     res.status(200).json({
//         status: 'success',
//         data
//     });
// });

// // 5. Year-over-Year Growth (Line)
// exports.getYoYGrowth = catchAsync(async (req, res, next) => {
//     const { year } = req.query;
//     const orgId = req.user.organizationId;
//     const targetYear = year ? parseInt(year) : new Date().getFullYear();
//     const data = await chartService.getYoYGrowth(orgId, targetYear);
//     res.status(200).json({ status: 'success', data });
// });

// // 6. Top Performers (Horizontal Bar)
// exports.getTopPerformers = catchAsync(async (req, res, next) => {
//     const { type = 'products', limit = 5 } = req.query;
//     const { start, end } = getRange(req);
//     const orgId = req.user.organizationId;
//     const data = await chartService.getTopPerformers(orgId, type, limit, start, end);
//     res.status(200).json({ status: 'success', data });
// });

// // 7. Customer Acquisition (Line)
// exports.getCustomerAcquisition = catchAsync(async (req, res, next) => {
//     const { year } = req.query;
//     const orgId = req.user.organizationId;
//     const targetYear = year ? parseInt(year) : new Date().getFullYear();
//     const data = await chartService.getCustomerAcquisition(orgId, targetYear);
//     res.status(200).json({ status: 'success', data });
// });

// // 8. AOV Trend (Line)
// exports.getAOVTrend = catchAsync(async (req, res, next) => {
//     const { year } = req.query;
//     const orgId = req.user.organizationId;
//     const targetYear = year ? parseInt(year) : new Date().getFullYear();
//     const data = await chartService.getAOVTrend(orgId, targetYear);
//     res.status(200).json({ status: 'success', data });
// });

// // 9. Heatmap (Matrix)
// exports.getHeatmap = catchAsync(async (req, res, next) => {
//     const { branchId } = req.query;
//     const orgId = req.user.organizationId;
//     const data = await chartService.getHeatmap(orgId, branchId);
//     res.status(200).json({ status: 'success', data });
// });
