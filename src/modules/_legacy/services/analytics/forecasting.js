const mongoose = require('mongoose');
const Invoice = require('../../../accounting/billing/invoice.model');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// ------------ Helpers ------------

const calcLinearRegression = (points) => {
    // points: [{ x: 1, y: number }, ...] with x = 1..n (month index)
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

    let xSum = 0, ySum = 0, xySum = 0, x2Sum = 0;
    points.forEach(p => {
        xSum += p.x;
        ySum += p.y;
        xySum += p.x * p.y;
        x2Sum += p.x * p.x;
    });

    const numerator = n * xySum - xSum * ySum;
    const denominator = n * x2Sum - xSum * xSum;
    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = (ySum - slope * xSum) / n;

    // R² (coefficient of determination) for rough confidence
    const yMean = ySum / n;
    let ssTot = 0;
    let ssRes = 0;

    points.forEach(p => {
        const yPred = slope * p.x + intercept;
        ssTot += Math.pow(p.y - yMean, 2);
        ssRes += Math.pow(p.y - yPred, 2);
    });

    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
};

const classifyTrend = (slope) => {
    if (slope > 0) return 'up';
    if (slope < 0) return 'down';
    return 'stable';
};

const classifyConfidence = (r2, n) => {
    if (n < 3) return { label: 'low', score: 0.3 };
    if (r2 >= 0.75) return { label: 'high', score: r2 };
    if (r2 >= 0.4) return { label: 'medium', score: r2 };
    return { label: 'low', score: r2 };
};

const getCurrentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
};

// ------------ Main Forecast API ------------

/**
 * Revenue Forecast
 * - Uses last N months (default 6) to build linear regression
 * - Predicts next month's revenue
 * - Adds current month projection based on run-rate
 */
exports.getRevenueForecast = async ({ orgId, branchId, monthsBack = 6 }) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    const today = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - monthsBack);
    start.setDate(1);

    // 1. Historical monthly revenue (last N months)
    const monthlySales = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: today } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } },
                total: { $sum: '$grandTotal' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    if (monthlySales.length === 0) {
        return {
            period: { from: start, to: today },
            summary: {
                nextMonthRevenue: 0,
                trend: 'stable',
                avgMonthlyRevenue: 0,
                growthRatePercent: 0,
                currentMonthProjection: 0
            },
            confidence: {
                label: 'low',
                score: 0
            },
            alerts: { warning: 'No sales data available for forecast window.' },
            charts: [],
            reportTables: { monthlySales: [] },
            advisory: [
                'Record more months of sales before relying on forecasts.'
            ]
        };
    }

    // Prepare data for regression
    const points = monthlySales.map((m, idx) => ({
        x: idx + 1,
        y: m.total
    }));

    const { slope, intercept, r2 } = calcLinearRegression(points);
    const n = points.length;

    const nextMonthIndex = n + 1;
    const predictedNextMonth = Math.max(0, Math.round(slope * nextMonthIndex + intercept));

    const avgMonthlyRevenue = points.reduce((acc, p) => acc + p.y, 0) / n;
    const growthRatePercent = avgMonthlyRevenue === 0
        ? 0
        : Math.round((slope / avgMonthlyRevenue) * 100);

    const trend = classifyTrend(slope);
    const confidence = classifyConfidence(r2, n);

    // 2. Current month projection (short-term)
    const { start: currentMonthStart, end: currentMonthEnd } = getCurrentMonthRange();

    const currentMonthAgg = await Invoice.aggregate([
        { $match: { 
            ...match, 
            invoiceDate: { $gte: currentMonthStart, $lte: currentMonthEnd } 
        } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]);

    const revenueSoFar = currentMonthAgg[0]?.total || 0;
    const todayDate = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dailyAverage = todayDate > 0 ? revenueSoFar / todayDate : 0;
    const projectedMonthRevenue = Math.round(dailyAverage * daysInMonth);

    // 3. Advisory messages
    const advisory = [];

    if (trend === 'up') {
        advisory.push('Revenue trend is upward. Plan inventory and staffing to support growth.');
        if (growthRatePercent > 15) {
            advisory.push('High growth rate detected. Consider securing supplier terms and expanding high-margin SKUs.');
        }
    } else if (trend === 'down') {
        advisory.push('Revenue trend is downward. Investigate product mix, pricing, and customer churn.');
        advisory.push('Prioritize retention campaigns and review discount strategies.');
    } else {
        advisory.push('Revenue is relatively stable. Focus on efficiency and margin optimization.');
    }

    if (confidence.label === 'low') {
        advisory.push('Forecast confidence is low. Treat projections as directional, not exact.');
    }

    if (projectedMonthRevenue > predictedNextMonth * 1.2) {
        advisory.push('Current month projection is significantly above trend. Check for one-off large orders or seasonality.');
    } else if (projectedMonthRevenue < predictedNextMonth * 0.8) {
        advisory.push('Current month is underperforming relative to trend. Monitor daily sales closely and react quickly.');
    }

    return {
        period: {
            from: start,
            to: today,
            monthsUsed: n
        },
        summary: {
            nextMonthRevenue: predictedNextMonth,
            trend,
            avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
            growthRatePercent,
            currentMonthProjection: projectedMonthRevenue,
            currentMonthSoFar: revenueSoFar
        },
        confidence,
        alerts: trend === 'down'
            ? { risk: 'Downward revenue trend detected.' }
            : {},
        charts: [
            {
                label: 'Monthly Revenue History',
                dataset: monthlySales.map((m, idx) => ({
                    month: m._id,
                    revenue: m.total,
                    index: idx + 1
                }))
            }
        ],
        reportTables: {
            monthlySales
        },
        advisory
    };
};
