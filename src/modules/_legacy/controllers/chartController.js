const chartService = require('../services/chartService');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');

// Helper for dates
const getRange = (req) => {
    const end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const start = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().getFullYear(), 0, 1);
    // Adjust end of day
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// 1. Financial Trend (Line/Bar)
exports.getFinancialTrend = catchAsync(async (req, res, next) => {
    const { interval = 'month', year } = req.query;
    const orgId = req.user.organizationId;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const data = await chartService.getFinancialSeries(orgId, targetYear, interval);
    
    res.status(200).json({
        status: 'success',
        data // Directly assignable to [data] in <p-chart>
    });
});

// 2. Distribution (Pie/Donut)
exports.getSalesDistribution = catchAsync(async (req, res, next) => {
    const { groupBy = 'category' } = req.query; 
    const { start, end } = getRange(req);
    const orgId = req.user.organizationId;

    const data = await chartService.getDistributionData(orgId, groupBy, start, end);

    res.status(200).json({
        status: 'success',
        data
    });
});

// 3. Radar (Comparison)
exports.getBranchPerformanceRadar = catchAsync(async (req, res, next) => {
    const { start, end } = getRange(req);
    const orgId = req.user.organizationId;

    const data = await chartService.getBranchRadarData(orgId, start, end);

    res.status(200).json({
        status: 'success',
        data
    });
});

// 4. Funnel
exports.getOrderFunnel = catchAsync(async (req, res, next) => {
    const { start, end } = getRange(req);
    const orgId = req.user.organizationId;

    const data = await chartService.getOrderFunnelData(orgId, start, end);

    res.status(200).json({
        status: 'success',
        data
    });
});

// 5. Year-over-Year Growth (Line)
exports.getYoYGrowth = catchAsync(async (req, res, next) => {
    const { year } = req.query;
    const orgId = req.user.organizationId;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const data = await chartService.getYoYGrowth(orgId, targetYear);
    res.status(200).json({ status: 'success', data });
});

// 6. Top Performers (Horizontal Bar)
exports.getTopPerformers = catchAsync(async (req, res, next) => {
    const { type = 'products', limit = 5 } = req.query;
    const { start, end } = getRange(req);
    const orgId = req.user.organizationId;
    const data = await chartService.getTopPerformers(orgId, type, limit, start, end);
    res.status(200).json({ status: 'success', data });
});

// 7. Customer Acquisition (Line)
exports.getCustomerAcquisition = catchAsync(async (req, res, next) => {
    const { year } = req.query;
    const orgId = req.user.organizationId;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const data = await chartService.getCustomerAcquisition(orgId, targetYear);
    res.status(200).json({ status: 'success', data });
});

// 8. AOV Trend (Line)
exports.getAOVTrend = catchAsync(async (req, res, next) => {
    const { year } = req.query;
    const orgId = req.user.organizationId;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const data = await chartService.getAOVTrend(orgId, targetYear);
    res.status(200).json({ status: 'success', data });
});

// 9. Heatmap (Matrix)
exports.getHeatmap = catchAsync(async (req, res, next) => {
    const { branchId } = req.query;
    const orgId = req.user.organizationId;
    const data = await chartService.getHeatmap(orgId, branchId);
    res.status(200).json({ status: 'success', data });
});
