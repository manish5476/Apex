const catchAsync = require('../utils/catchAsync');
const chartService = require('../services/chartService'); // We will create this next

/* ==========================================================================
   VISUALIZATION DATA ENDPOINTS
   ========================================================================== */

// 1. Multi-Series Line Chart: Revenue vs Expenses vs Profit
exports.getFinancialTrend = catchAsync(async (req, res) => {
    const { interval = 'month', year } = req.query; // e.g., year=2024
    const orgId = req.user.organizationId;
    
    const data = await chartService.getFinancialSeries(orgId, parseInt(year), interval);
    res.status(200).json({ status: 'success', data });
});

// 2. Pie/Donut Chart: Sales by Category or Branch
exports.getSalesDistribution = catchAsync(async (req, res) => {
    const { groupBy = 'category', startDate, endDate } = req.query; // groupBy: 'category', 'branch', 'paymentMethod'
    const orgId = req.user.organizationId;

    const data = await chartService.getDistributionData(orgId, groupBy, startDate, endDate);
    res.status(200).json({ status: 'success', data });
});

// 3. Radar Chart: Branch Performance Comparison
// Compares branches across multiple axes: Revenue, Order Count, discount %, AOV
exports.getBranchPerformanceRadar = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const orgId = req.user.organizationId;

    const data = await chartService.getBranchRadarData(orgId, startDate, endDate);
    res.status(200).json({ status: 'success', data });
});

// 4. Funnel Chart: Order Lifecycle
// Created -> Issued -> Partially Paid -> Paid
exports.getOrderFunnel = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const orgId = req.user.organizationId;

    const data = await chartService.getOrderFunnelData(orgId, startDate, endDate);
    res.status(200).json({ status: 'success', data });
});