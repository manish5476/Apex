/**
 * ============================================================
 * APEX CRM — chartService.js  (Complete Analytics Engine)
 * ============================================================
 * All 18 chart functions — wired to real models.
 * Returns Chart.js-compatible payloads for PrimeNG.
 *
 * Charts:
 *  1.  getFinancialSeries        — Income / Expense / Net Profit (Line + Bar)
 *  2.  getGrossProfitTrend       — Revenue vs Gross Profit + Margin % (NEW)
 *  3.  getDistributionData       — Sales by Category / Branch / Payment Method
 *  4.  getBranchRadarData        — Branch Performance Radar
 *  5.  getOrderFunnelData        — Invoice Status Funnel
 *  6.  getYoYGrowth              — Year-over-Year Revenue Comparison
 *  7.  getTopPerformers          — Top Products / Customers / Staff
 *  8.  getCustomerAcquisition    — New Customers per Month
 *  9.  getAOVTrend               — Average Order Value per Month
 * 10.  getHeatmap                — Orders by Day × Hour matrix
 * 11.  getPaymentMethodBreakdown — Inflow by Payment Method (NEW)
 * 12.  getEmiPortfolioStats      — EMI Status + Overdue Analysis (NEW)
 * 13.  getInventoryHealth        — Low Stock / Critical per Branch (NEW)
 * 14.  getCustomerOutstanding    — Top Debtors by Outstanding Balance (NEW)
 * 15.  getSalesReturnRate        — Return Rate over Time (NEW)
 * 16.  getPurchaseVsSales        — Purchase Spend vs Sales Revenue (NEW)
 * 17.  getAttendanceKpis         — Present / Absent / Late daily rates (NEW)
 * 18.  getLeaveUtilization       — Leave usage by type (NEW)
 * ============================================================
 */

'use strict';

const mongoose = require('mongoose');

// ── Core Models ──────────────────────────────────────────────
const Invoice = require('../../accounting/billing/invoice.model');
const Purchase = require('../../inventory/core/model/purchase.model');
const Product = require('../../inventory/core/model/product.model');
const Customer = require('../../organization/core/customer.model');
const Sales = require('../../inventory/core/model/sales.model');
const SalesReturn = require('../../inventory/core/model/salesReturn.model');

// ── Payments & EMI (Fixed Paths) ─────────────────────────────
const Payment = require('../../accounting/payments/payment.model');
const EMI = require('../../accounting/payments/emi.model');

// ── HRMS Models (Fixed Paths) ────────────────────────────────
// Note: Based on your tree, these are directly in HRMS/models/
const AttendanceDaily = require('../../HRMS/models/attendanceDaily.model');
const LeaveBalance = require('../../HRMS/models/leaveBalance.model');

// ── Helpers ───────────────────────────────────────────────────

/** Cast to ObjectId safely */
const toOid = (id) => new mongoose.Types.ObjectId(id);

/** Month labels (0-indexed) */
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Palette for multi-series charts */
const PALETTE = ['#42A5F5', '#66BB6A', '#FFA726', '#AB47BC', '#EF5350', '#26C6DA', '#FF7043', '#29B6F6', '#D4E157', '#EC407A'];

/**
 * Build a zero-filled array and map MongoDB results into it.
 * @param {Array}  data      — aggregate result where _id is 1–12 (month) or 1–4 (quarter)
 * @param {number} length    — series length (12 or 4)
 * @param {string} field     — the value field to extract (e.g. 'total')
 */
const fillSeries = (data, length = 12, field = 'total') => {
    const series = new Array(length).fill(0);
    data.forEach(d => {
        if (d._id >= 1 && d._id <= length) {
            series[d._id - 1] = d[field] || 0;
        }
    });
    return series;
};

/**
 * Standard match for Invoice aggregations.
 */
const invoiceMatch = (orgId, start, end, extraConditions = {}) => ({
    organizationId: toOid(orgId),
    invoiceDate: { $gte: start, $lte: end },
    status: { $ne: 'cancelled' },
    ...extraConditions
});

// ─────────────────────────────────────────────────────────────
// 1. FINANCIAL SERIES  (Income / Expense / Net Profit)
// ─────────────────────────────────────────────────────────────
/**
 * @param {string} orgId
 * @param {number} year
 * @param {'month'|'week'} interval  — only 'month' fully supported; 'week' throws 400
 */
exports.getFinancialSeries = async (orgId, year, interval = 'month') => {
    const supportedIntervals = ['month', 'quarter'];
    if (!supportedIntervals.includes(interval)) {
        const err = new Error(`${interval.charAt(0).toUpperCase() + interval.slice(1)} interval is not yet supported. Use interval=month or interval=quarter.`);
        err.statusCode = 400;
        throw err;
    }

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);

    let groupExpr, purchGroupExpr, labels, seriesLength;

    if (interval === 'quarter') {
        groupExpr = { $ceil: { $divide: [{ $month: '$invoiceDate' }, 3] } };
        purchGroupExpr = { $ceil: { $divide: [{ $month: '$purchaseDate' }, 3] } };
        labels = ['Q1', 'Q2', 'Q3', 'Q4'];
        seriesLength = 4;
    } else {
        groupExpr = { $month: '$invoiceDate' };
        purchGroupExpr = { $month: '$purchaseDate' };
        labels = MONTH_LABELS;
        seriesLength = 12;
    }

    const [incomeData, expenseData] = await Promise.all([
        Invoice.aggregate([
            { $match: { organizationId: toOid(orgId), invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: groupExpr, total: { $sum: '$grandTotal' } } },
            { $sort: { _id: 1 } }
        ]),
        Purchase.aggregate([
            { $match: { organizationId: toOid(orgId), purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: purchGroupExpr, total: { $sum: '$grandTotal' } } },
            { $sort: { _id: 1 } }
        ])
    ]);

    const incomeResult = fillSeries(incomeData, seriesLength);
    const expenseResult = fillSeries(expenseData, seriesLength);
    const profitResult = incomeResult.map((inc, i) => inc - expenseResult[i]);

    return {
        labels: labels,
        datasets: [
            {
                label: 'Income',
                data: incomeResult,
                type: 'line',
                borderColor: '#4caf50',
                backgroundColor: 'rgba(76,175,80,0.15)',
                fill: true,
                tension: 0.4,
                order: 2
            },
            {
                label: 'Expense',
                data: expenseResult,
                type: 'line',
                borderColor: '#f44336',
                backgroundColor: 'rgba(244,67,54,0.15)',
                fill: true,
                tension: 0.4,
                order: 2
            },
            {
                label: 'Net Profit',
                data: profitResult,
                type: 'bar',
                backgroundColor: profitResult.map(v => v >= 0 ? 'rgba(33,150,243,0.75)' : 'rgba(255,87,34,0.75)'),
                borderColor: profitResult.map(v => v >= 0 ? '#2196f3' : '#FF5722'),
                order: 1
            }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 2. GROSS PROFIT TREND  (Revenue vs Gross Profit + Margin %)
//    Uses Sales.aggregateMonthlyProfit static
// ─────────────────────────────────────────────────────────────
exports.getGrossProfitTrend = async (orgId, year) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);

    const raw = await Sales.aggregateMonthlyProfit(orgId, start, end);

    // raw: [{ month: '2024-01', revenue, grossProfit, orderCount, margin }]
    const revenueArr = new Array(12).fill(0);
    const profitArr = new Array(12).fill(0);
    const marginArr = new Array(12).fill(0);

    raw.forEach(d => {
        const monthIdx = parseInt(d.month.split('-')[1], 10) - 1; // 0-based
        revenueArr[monthIdx] = Math.round(d.revenue || 0);
        profitArr[monthIdx] = Math.round(d.grossProfit || 0);
        marginArr[monthIdx] = parseFloat((d.margin || 0).toFixed(1));
    });

    return {
        labels: MONTH_LABELS,
        datasets: [
            {
                label: 'Revenue',
                data: revenueArr,
                type: 'bar',
                backgroundColor: 'rgba(66,165,245,0.65)',
                borderColor: '#42A5F5',
                order: 2
            },
            {
                label: 'Gross Profit',
                data: profitArr,
                type: 'bar',
                backgroundColor: 'rgba(102,187,106,0.65)',
                borderColor: '#66BB6A',
                order: 2
            },
            {
                label: 'Margin %',
                data: marginArr,
                type: 'line',
                yAxisID: 'y1',           // consumer should configure dual-axis
                borderColor: '#FFA726',
                pointRadius: 4,
                fill: false,
                tension: 0.4,
                order: 1
            }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 3. SALES DISTRIBUTION  (Category / Branch / Payment Method)
// ─────────────────────────────────────────────────────────────
/**
 * groupBy: 'category' | 'branch' | 'paymentMethod'
 * For paymentMethod we query Payment model (inflow) — not the Invoice snapshot.
 */
exports.getDistributionData = async (orgId, groupBy, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let rawData = [];

    if (groupBy === 'paymentMethod') {
        // Pull from Payment model (inflow type = received from customer)
        rawData = await Payment.aggregate([
            {
                $match: {
                    organizationId: toOid(orgId),
                    type: 'inflow',
                    status: 'completed',
                    paymentDate: { $gte: start, $lte: end }
                }
            },
            { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
            { $project: { label: { $ifNull: ['$_id', 'Other'] }, value: 1 } },
            { $sort: { value: -1 } }
        ]);

    } else if (groupBy === 'branch') {
        rawData = await Invoice.aggregate([
            { $match: invoiceMatch(orgId, start, end) },
            { $group: { _id: '$branchId', value: { $sum: '$grandTotal' } } },
            { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'meta' } },
            { $unwind: { path: '$meta', preserveNullAndEmptyArrays: true } },
            { $project: { label: { $ifNull: ['$meta.name', 'Unknown Branch'] }, value: 1 } },
            { $sort: { value: -1 } }
        ]);

    } else {
        // Default: category — unwind items → lookup product → group by category
        rawData = await Invoice.aggregate([
            { $match: invoiceMatch(orgId, start, end) },
            { $unwind: '$items' },
            { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$product.categoryId',   // ObjectId ref to Master
                    name: { $first: '$product.name' }, // fallback if no category lookup
                    value: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
                }
            },
            { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'cat' } },
            { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
            { $project: { label: { $ifNull: ['$cat.name', 'Uncategorized'] }, value: 1 } },
            { $sort: { value: -1 } }
        ]);
    }

    const colors = PALETTE.slice(0, rawData.length);

    return {
        labels: rawData.map(d => d.label || 'Unknown'),
        datasets: [{
            data: rawData.map(d => Math.round(d.value)),
            backgroundColor: colors,
            hoverBackgroundColor: colors
        }]
    };
};

// ─────────────────────────────────────────────────────────────
// 4. BRANCH PERFORMANCE RADAR
// ─────────────────────────────────────────────────────────────
exports.getBranchRadarData = async (orgId, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const stats = await Invoice.aggregate([
        { $match: { organizationId: toOid(orgId), invoiceDate: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: '$branchId',
                revenue: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$grandTotal', 0] } },
                orders: { $sum: 1 },
                discounts: { $sum: '$totalDiscount' },
                cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } }
            }
        },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { branch: { $ifNull: ['$branch.name', 'Unknown'] }, revenue: 1, orders: 1, discounts: 1, cancelled: 1, paid: 1 } }
    ]);

    if (!stats.length) return { labels: [], datasets: [] };

    const maxRev = Math.max(...stats.map(s => s.revenue)) || 1;
    const maxOrd = Math.max(...stats.map(s => s.orders)) || 1;
    const maxDisc = Math.max(...stats.map(s => s.discounts)) || 1;
    const maxCanc = Math.max(...stats.map(s => s.cancelled)) || 1;

    const labels = ['Revenue Score', 'Order Volume', 'Discount Usage', 'Cancellation Rate', 'Payment Completion'];

    const datasets = stats.map((s, i) => {
        const paymentRate = s.orders > 0 ? (s.paid / s.orders) * 100 : 0;
        const scores = [
            Math.round((s.revenue / maxRev) * 100),
            Math.round((s.orders / maxOrd) * 100),
            Math.round((s.discounts / maxDisc) * 100),
            Math.round((s.cancelled / maxCanc) * 100),
            Math.round(paymentRate)
        ];
        const color = PALETTE[i % PALETTE.length];
        return {
            label: s.branch,
            data: scores,
            fill: true,
            borderColor: color,
            backgroundColor: color + '30',
            pointBackgroundColor: color,
            pointBorderColor: '#fff'
        };
    });

    return { labels, datasets };
};

// ─────────────────────────────────────────────────────────────
// 5. ORDER FUNNEL
// ─────────────────────────────────────────────────────────────
exports.getOrderFunnelData = async (orgId, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const data = await Invoice.aggregate([
        { $match: { organizationId: toOid(orgId), invoiceDate: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: null,
                totalCreated: { $sum: 1 },
                cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                fullyPaid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
                partial: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'partial'] }, 1, 0] } },
                unpaid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, 1, 0] } }
            }
        }
    ]);

    const r = data[0] || { totalCreated: 0, cancelled: 0, fullyPaid: 0, partial: 0, unpaid: 0 };
    const active = r.totalCreated - r.cancelled;

    return {
        labels: ['Total Created', 'Active (Non-Cancelled)', 'Partially Paid', 'Fully Paid'],
        datasets: [{
            label: 'Order Funnel',
            data: [r.totalCreated, active, r.partial, r.fullyPaid],
            backgroundColor: ['#78909C', '#42A5F5', '#FFA726', '#4CAF50']
        }]
    };
};

// ─────────────────────────────────────────────────────────────
// 6. YEAR-OVER-YEAR GROWTH
// ─────────────────────────────────────────────────────────────
exports.getYoYGrowth = async (orgId, year) => {
    const curr = parseInt(year, 10);
    const prev = curr - 1;

    const pipeline = (yr) => [
        {
            $match: {
                organizationId: toOid(orgId),
                invoiceDate: { $gte: new Date(yr, 0, 1), $lte: new Date(yr, 11, 31, 23, 59, 59) },
                status: { $ne: 'cancelled' }
            }
        },
        { $group: { _id: { $month: '$invoiceDate' }, total: { $sum: '$grandTotal' } } },
        { $sort: { _id: 1 } }
    ];

    const [currData, prevData] = await Promise.all([
        Invoice.aggregate(pipeline(curr)),
        Invoice.aggregate(pipeline(prev))
    ]);

    const currSeries = fillSeries(currData);
    const prevSeries = fillSeries(prevData);

    // Growth % per month (null if prev=0 to avoid Infinity)
    const growthPct = currSeries.map((c, i) =>
        prevSeries[i] > 0 ? parseFloat(((c - prevSeries[i]) / prevSeries[i] * 100).toFixed(1)) : null
    );

    return {
        labels: MONTH_LABELS,
        datasets: [
            { label: `${curr}`, data: currSeries, borderColor: '#42A5F5', fill: false, tension: 0.4 },
            { label: `${prev}`, data: prevSeries, borderColor: '#BDBDBD', borderDash: [5, 5], fill: false, tension: 0.4 },
            { label: 'Growth %', data: growthPct, borderColor: '#66BB6A', yAxisID: 'y1', type: 'line', pointRadius: 3, fill: false, tension: 0.4 }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 7. TOP PERFORMERS  (products / customers / staff)
// ─────────────────────────────────────────────────────────────
exports.getTopPerformers = async (orgId, type, limit = 5, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const lim = parseInt(limit, 10);
    const match = invoiceMatch(orgId, start, end);

    if (type === 'products') {
        const data = await Invoice.aggregate([
            { $match: match },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.productId',
                    value: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
                }
            },
            { $sort: { value: -1 } },
            { $limit: lim },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'meta' } },
            { $unwind: { path: '$meta', preserveNullAndEmptyArrays: true } },
            { $project: { label: { $ifNull: ['$meta.name', 'Unknown Product'] }, value: 1, revenue: 1 } }
        ]);
        return formatBarChart(data, 'Units Sold', true);
    }

    if (type === 'customers') {
        const data = await Invoice.aggregate([
            { $match: match },
            { $group: { _id: '$customerId', value: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
            { $sort: { value: -1 } },
            { $limit: lim },
            { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'meta' } },
            { $unwind: { path: '$meta', preserveNullAndEmptyArrays: true } },
            { $project: { label: { $ifNull: ['$meta.name', 'Unknown Customer'] }, value: 1, orders: 1 } }
        ]);
        return formatBarChart(data, 'Revenue');
    }

    if (type === 'staff') {
        const data = await Invoice.aggregate([
            { $match: match },
            { $group: { _id: '$createdBy', value: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
            { $sort: { value: -1 } },
            { $limit: lim },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'meta' } },
            { $unwind: { path: '$meta', preserveNullAndEmptyArrays: true } },
            { $project: { label: { $ifNull: ['$meta.name', 'Unknown Staff'] }, value: 1, orders: 1 } }
        ]);
        return formatBarChart(data, 'Revenue Generated');
    }

    return { labels: [], datasets: [] };
};

const formatBarChart = (data, labelText, includeRevenue = false) => ({
    labels: data.map(d => d.label),
    datasets: [
        {
            label: labelText,
            data: data.map(d => d.value),
            backgroundColor: '#66BB6A'
        },
        ...(includeRevenue && data[0]?.revenue !== undefined
            ? [{ label: 'Revenue', data: data.map(d => Math.round(d.revenue || 0)), backgroundColor: '#42A5F5' }]
            : [])
    ],
    // Bonus: attach raw rows for table rendering in Angular
    _meta: data.map(d => ({ label: d.label, value: d.value, revenue: d.revenue, orders: d.orders }))
});

// ─────────────────────────────────────────────────────────────
// 8. CUSTOMER ACQUISITION
// ─────────────────────────────────────────────────────────────
exports.getCustomerAcquisition = async (orgId, year) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    const data = await Customer.aggregate([
        { $match: { organizationId: toOid(orgId), isDeleted: { $ne: true }, createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    const series = new Array(12).fill(0);
    data.forEach(d => { series[d._id - 1] = d.count; });

    // Cumulative line
    const cumulative = series.reduce((acc, v, i) => {
        acc.push((acc[i - 1] || 0) + v);
        return acc;
    }, []);

    return {
        labels: MONTH_LABELS,
        datasets: [
            { label: 'New Customers', data: series, type: 'bar', backgroundColor: 'rgba(255,167,38,0.65)', borderColor: '#FFA726' },
            { label: 'Cumulative Customers', data: cumulative, type: 'line', borderColor: '#42A5F5', fill: false, tension: 0.4, yAxisID: 'y1' }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 9. AOV TREND
// ─────────────────────────────────────────────────────────────
exports.getAOVTrend = async (orgId, year) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    const data = await Invoice.aggregate([
        { $match: { organizationId: toOid(orgId), invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $month: '$invoiceDate' }, avg: { $avg: '$grandTotal' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    const avgSeries = new Array(12).fill(0);
    const countSeries = new Array(12).fill(0);
    data.forEach(d => {
        avgSeries[d._id - 1] = Math.round(d.avg || 0);
        countSeries[d._id - 1] = d.count;
    });

    return {
        labels: MONTH_LABELS,
        datasets: [
            { label: 'Average Order Value (₹)', data: avgSeries, type: 'line', borderColor: '#AB47BC', fill: false, tension: 0.4 },
            { label: 'Order Count', data: countSeries, type: 'bar', backgroundColor: 'rgba(171,71,188,0.25)', yAxisID: 'y1' }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 10. HEATMAP  (Day × Hour order matrix)
// ─────────────────────────────────────────────────────────────
exports.getHeatmap = async (orgId, branchId, days = 30) => {
    const start = new Date();
    start.setDate(start.getDate() - Math.abs(parseInt(days, 10) || 30));

    const match = { organizationId: toOid(orgId), invoiceDate: { $gte: start } };
    if (branchId) match.branchId = toOid(branchId);

    const data = await Invoice.aggregate([
        { $match: match },
        { $project: { day: { $dayOfWeek: '$invoiceDate' }, hour: { $hour: '$invoiceDate' } } },
        { $group: { _id: { day: '$day', hour: '$hour' }, count: { $sum: 1 } } }
    ]);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const series = dayNames.map(d => ({ name: d, data: new Array(24).fill(0) }));

    data.forEach(d => {
        const dayIdx = d._id.day - 1; // MongoDB 1=Sun
        if (series[dayIdx]) series[dayIdx].data[d._id.hour] = d.count;
    });

    return {
        series,
        xLabels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        yLabels: dayNames
    };
};

// ─────────────────────────────────────────────────────────────
// 11. PAYMENT METHOD BREAKDOWN  [NEW]
//     Source: Payment model (inflow) — accurate method data
// ─────────────────────────────────────────────────────────────
exports.getPaymentMethodBreakdown = async (orgId, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const [methodData, trendData] = await Promise.all([
        // Pie: total by method
        Payment.aggregate([
            {
                $match: {
                    organizationId: toOid(orgId),
                    type: 'inflow',
                    status: 'completed',
                    paymentDate: { $gte: start, $lte: end }
                }
            },
            { $group: { _id: '$paymentMethod', value: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $project: { label: { $ifNull: ['$_id', 'Other'] }, value: 1, count: 1 } },
            { $sort: { value: -1 } }
        ]),
        // Monthly trend stacked by method
        Payment.aggregate([
            {
                $match: {
                    organizationId: toOid(orgId),
                    type: 'inflow',
                    status: 'completed',
                    paymentDate: { $gte: start, $lte: end }
                }
            },
            { $group: { _id: { month: { $month: '$paymentDate' }, method: '$paymentMethod' }, value: { $sum: '$amount' } } },
            { $sort: { '_id.month': 1 } }
        ])
    ]);

    // Build stacked bar per method
    const methods = [...new Set(trendData.map(d => d._id.method))];
    const stackedMap = {};
    methods.forEach(m => { stackedMap[m] = new Array(12).fill(0); });
    trendData.forEach(d => { stackedMap[d._id.method][d._id.month - 1] += Math.round(d.value); });

    const colors = PALETTE.slice(0, methodData.length);
    const colorsM = PALETTE.slice(0, methods.length);

    return {
        pie: {
            labels: methodData.map(d => d.label),
            datasets: [{ data: methodData.map(d => Math.round(d.value)), backgroundColor: colors, hoverBackgroundColor: colors }],
            _meta: methodData
        },
        trend: {
            labels: MONTH_LABELS,
            datasets: methods.map((m, i) => ({
                label: m,
                data: stackedMap[m],
                backgroundColor: colorsM[i],
                stack: 'payment'
            }))
        }
    };
};

// ─────────────────────────────────────────────────────────────
// 12. EMI PORTFOLIO STATS  [NEW]
//     EMI status breakdown + upcoming overdue installments
// ─────────────────────────────────────────────────────────────
exports.getEmiPortfolioStats = async (orgId) => {
    const now = new Date();

    const [statusData, overdueData, overdueAmount] = await Promise.all([
        // EMI status breakdown
        EMI.aggregate([
            { $match: { organizationId: toOid(orgId) } },
            { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$totalAmount' } } }
        ]),
        // Overdue installments count
        EMI.aggregate([
            { $match: { organizationId: toOid(orgId), status: 'active' } },
            { $unwind: '$installments' },
            {
                $match: {
                    'installments.paymentStatus': { $in: ['pending', 'partial'] },
                    'installments.dueDate': { $lt: now }
                }
            },
            { $count: 'count' }
        ]),
        // Overdue outstanding total
        EMI.aggregate([
            { $match: { organizationId: toOid(orgId), status: 'active' } },
            { $unwind: '$installments' },
            {
                $match: {
                    'installments.paymentStatus': { $in: ['pending', 'partial'] },
                    'installments.dueDate': { $lt: now }
                }
            },
            {
                $group: {
                    _id: null,
                    totalOverdue: { $sum: { $subtract: ['$installments.totalAmount', '$installments.paidAmount'] } }
                }
            }
        ])
    ]);

    const STATUS_COLORS = { active: '#42A5F5', completed: '#66BB6A', defaulted: '#EF5350' };

    return {
        statusBreakdown: {
            labels: statusData.map(d => d._id),
            datasets: [{
                data: statusData.map(d => d.count),
                backgroundColor: statusData.map(d => STATUS_COLORS[d._id] || '#BDBDBD')
            }],
            _meta: statusData
        },
        summary: {
            overdueInstallments: overdueData[0]?.count || 0,
            overdueAmount: Math.round(overdueAmount[0]?.totalOverdue || 0),
            totalPortfolioValue: statusData.reduce((a, d) => a + (d.totalAmount || 0), 0)
        }
    };
};

// ─────────────────────────────────────────────────────────────
// 13. INVENTORY HEALTH  [NEW]
//     Low stock & critical items per branch
// ─────────────────────────────────────────────────────────────
exports.getInventoryHealth = async (orgId, branchId) => {
    const match = { organizationId: toOid(orgId), isDeleted: { $ne: true }, isActive: true };

    // Unwind inventory per branch, compare quantity vs reorderLevel
    const pipeline = [
        { $match: match },
        { $unwind: '$inventory' },
        ...(branchId ? [{ $match: { 'inventory.branchId': toOid(branchId) } }] : []),
        {
            $project: {
                name: 1,
                sku: 1,
                branchId: '$inventory.branchId',
                quantity: '$inventory.quantity',
                reorderLevel: '$inventory.reorderLevel',
                isCritical: { $lte: ['$inventory.quantity', 0] },
                isLow: { $and: [{ $gt: ['$inventory.quantity', 0] }, { $lte: ['$inventory.quantity', '$inventory.reorderLevel'] }] }
            }
        }
    ];

    const [items, summary] = await Promise.all([
        Product.aggregate([...pipeline, { $sort: { quantity: 1 } }, { $limit: 50 }]),
        Product.aggregate([
            ...pipeline,
            {
                $group: {
                    _id: '$branchId',
                    critical: { $sum: { $cond: ['$isCritical', 1, 0] } },
                    low: { $sum: { $cond: ['$isLow', 1, 0] } },
                    healthy: { $sum: { $cond: [{ $and: [{ $not: '$isCritical' }, { $not: '$isLow' }] }, 1, 0] } }
                }
            },
            { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
            { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
            { $project: { branchName: { $ifNull: ['$branch.name', 'Unknown'] }, critical: 1, low: 1, healthy: 1 } }
        ])
    ]);

    // Stacked bar: healthy / low / critical per branch
    const labels = summary.map(s => s.branchName);
    return {
        chart: {
            labels,
            datasets: [
                { label: 'Healthy', data: summary.map(s => s.healthy), backgroundColor: '#66BB6A', stack: 'stock' },
                { label: 'Low', data: summary.map(s => s.low), backgroundColor: '#FFA726', stack: 'stock' },
                { label: 'Critical', data: summary.map(s => s.critical), backgroundColor: '#EF5350', stack: 'stock' }
            ]
        },
        items   // Raw rows for table rendering
    };
};

// ─────────────────────────────────────────────────────────────
// 14. CUSTOMER OUTSTANDING (Top Debtors)  [NEW]
// ─────────────────────────────────────────────────────────────
exports.getCustomerOutstanding = async (orgId, limit = 10) => {
    const lim = parseInt(limit, 10);

    const data = await Customer.aggregate([
        { $match: { organizationId: toOid(orgId), isDeleted: { $ne: true }, outstandingBalance: { $gt: 0 } } },
        { $sort: { outstandingBalance: -1 } },
        { $limit: lim },
        { $project: { name: 1, outstandingBalance: 1, creditLimit: 1, phone: 1, lastPurchaseDate: 1 } }
    ]);

    // Credit utilisation % — guard against unlimited (creditLimit=0 means unlimited)
    const rows = data.map(c => ({
        ...c,
        utilizationPct: c.creditLimit > 0
            ? parseFloat(((c.outstandingBalance / c.creditLimit) * 100).toFixed(1))
            : null
    }));

    return {
        labels: rows.map(r => r.name),
        datasets: [
            {
                label: 'Outstanding Balance (₹)',
                data: rows.map(r => Math.round(r.outstandingBalance)),
                backgroundColor: rows.map(r =>
                    r.creditLimit > 0 && r.outstandingBalance >= r.creditLimit
                        ? '#EF5350'   // Over limit — red
                        : '#FFA726'   // Under limit — orange
                )
            }
        ],
        _meta: rows
    };
};

// ─────────────────────────────────────────────────────────────
// 15. SALES RETURN RATE  [NEW]
//     Monthly return amount vs gross sales
// ─────────────────────────────────────────────────────────────
exports.getSalesReturnRate = async (orgId, year) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);

    const [salesData, returnData] = await Promise.all([
        Invoice.aggregate([
            { $match: { organizationId: toOid(orgId), invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: { $month: '$invoiceDate' }, total: { $sum: '$grandTotal' } } },
            { $sort: { _id: 1 } }
        ]),
        SalesReturn.aggregate([
            { $match: { organizationId: toOid(orgId), returnDate: { $gte: start, $lte: end }, status: 'approved' } },
            { $group: { _id: { $month: '$returnDate' }, total: { $sum: '$totalRefundAmount' } } },
            { $sort: { _id: 1 } }
        ])
    ]);

    const salesSeries = fillSeries(salesData);
    const returnSeries = fillSeries(returnData);
    const rateSeries = salesSeries.map((s, i) =>
        s > 0 ? parseFloat(((returnSeries[i] / s) * 100).toFixed(2)) : 0
    );

    return {
        labels: MONTH_LABELS,
        datasets: [
            { label: 'Gross Sales', data: salesSeries, type: 'bar', backgroundColor: 'rgba(66,165,245,0.6)' },
            { label: 'Returns', data: returnSeries, type: 'bar', backgroundColor: 'rgba(239,83,80,0.6)' },
            { label: 'Return Rate %', data: rateSeries, type: 'line', borderColor: '#FFA726', yAxisID: 'y1', fill: false, tension: 0.4 }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 16. PURCHASE vs SALES  [NEW]
//     Monthly spend vs revenue — net cash impact
// ─────────────────────────────────────────────────────────────
exports.getPurchaseVsSales = async (orgId, year) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);

    const [salesData, purchaseData] = await Promise.all([
        Invoice.aggregate([
            { $match: { organizationId: toOid(orgId), invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: { $month: '$invoiceDate' }, total: { $sum: '$grandTotal' } } },
            { $sort: { _id: 1 } }
        ]),
        Purchase.aggregate([
            { $match: { organizationId: toOid(orgId), purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: { $month: '$purchaseDate' }, total: { $sum: '$grandTotal' } } },
            { $sort: { _id: 1 } }
        ])
    ]);

    const salesArr = fillSeries(salesData);
    const purchaseArr = fillSeries(purchaseData);
    const netArr = salesArr.map((s, i) => s - purchaseArr[i]);

    return {
        labels: MONTH_LABELS,
        datasets: [
            { label: 'Sales Revenue', data: salesArr, backgroundColor: 'rgba(102,187,106,0.65)', borderColor: '#66BB6A', type: 'bar' },
            { label: 'Purchase Spend', data: purchaseArr, backgroundColor: 'rgba(239,83,80,0.65)', borderColor: '#EF5350', type: 'bar' },
            { label: 'Net Cash Impact', data: netArr, borderColor: '#42A5F5', type: 'line', fill: false, tension: 0.4, pointRadius: 4 }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 17. ATTENDANCE KPIs  [NEW]
//     Daily present / absent / late rates for last N days
// ─────────────────────────────────────────────────────────────
exports.getAttendanceKpis = async (orgId, branchId, days = 30) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - Math.abs(parseInt(days, 10) || 30));

    const match = { organizationId: toOid(orgId), date: { $gte: start, $lte: end } };
    if (branchId) match.branchId = toOid(branchId);

    const data = await AttendanceDaily.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late', 'half_day', 'work_from_home', 'on_duty']] }, 1, 0] } },
                absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
                late: { $sum: { $cond: [{ $eq: ['$isLate', true] }, 1, 0] } },
                total: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return {
        labels: data.map(d => d._id),
        datasets: [
            { label: 'Present', data: data.map(d => d.present), borderColor: '#66BB6A', backgroundColor: 'rgba(102,187,106,0.2)', fill: true, tension: 0.3 },
            { label: 'Absent', data: data.map(d => d.absent), borderColor: '#EF5350', backgroundColor: 'rgba(239,83,80,0.2)', fill: true, tension: 0.3 },
            { label: 'Late', data: data.map(d => d.late), borderColor: '#FFA726', borderDash: [4, 4], fill: false, tension: 0.3 }
        ]
    };
};

// ─────────────────────────────────────────────────────────────
// 18. LEAVE UTILIZATION  [NEW]
//     Used vs Total leave days by type, for a financial year
// ─────────────────────────────────────────────────────────────
exports.getLeaveUtilization = async (orgId, financialYear) => {
    const fy = financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    const data = await LeaveBalance.aggregate([
        { $match: { organizationId: toOid(orgId), financialYear: fy } },
        {
            $group: {
                _id: null,
                casualTotal: { $sum: '$casualLeave.total' },
                casualUsed: { $sum: '$casualLeave.used' },
                sickTotal: { $sum: '$sickLeave.total' },
                sickUsed: { $sum: '$sickLeave.used' },
                earnedTotal: { $sum: '$earnedLeave.total' },
                earnedUsed: { $sum: '$earnedLeave.used' },
                compensatoryTotal: { $sum: '$compensatoryOff.total' },
                compensatoryUsed: { $sum: '$compensatoryOff.used' },
                paidTotal: { $sum: '$paidLeave.total' },
                paidUsed: { $sum: '$paidLeave.used' },
                unpaidUsed: { $sum: '$unpaidLeave.used' },
                maternityTotal: { $sum: '$maternityLeave.total' },
                maternityUsed: { $sum: '$maternityLeave.used' }
            }
        }
    ]);

    if (!data.length) return { labels: [], datasets: [] };

    const r = data[0];
    const LEAVE_TYPES = [
        { label: 'Casual', used: r.casualUsed, total: r.casualTotal },
        { label: 'Sick', used: r.sickUsed, total: r.sickTotal },
        { label: 'Earned', used: r.earnedUsed, total: r.earnedTotal },
        { label: 'Compensatory', used: r.compensatoryUsed, total: r.compensatoryTotal },
        { label: 'Paid', used: r.paidUsed, total: r.paidTotal },
        { label: 'Unpaid', used: r.unpaidUsed, total: 0 },
        { label: 'Maternity', used: r.maternityUsed, total: r.maternityTotal }
    ].filter(t => t.total > 0 || t.used > 0); // Only show relevant types

    return {
        labels: LEAVE_TYPES.map(t => t.label),
        datasets: [
            { label: 'Used Days', data: LEAVE_TYPES.map(t => t.used), backgroundColor: '#EF5350' },
            { label: 'Remaining Days', data: LEAVE_TYPES.map(t => Math.max(0, t.total - t.used)), backgroundColor: '#66BB6A' }
        ],
        _meta: LEAVE_TYPES
    };
};


// const mongoose = require('mongoose');
// const Invoice = require('../../accounting/billing/invoice.model');
// const Purchase = require('../../inventory/core/model/purchase.model');
// const Product = require('../../inventory/core/model/product.model');
// const Customer = require('../../organization/core/customer.model');

// const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// /**
//  * 1. Financial Trend (Line/Bar Chart)
//  * Returns data compatible with PrimeNG (Chart.js)
//  * { labels: ['Jan', 'Feb'...], datasets: [ { label: 'Income', data: [...] }, ... ] }
//  */
// exports.getFinancialSeries = async (orgId, year, interval = 'month') => {
//     const start = new Date(year, 0, 1);
//     const end = new Date(year, 11, 31, 23, 59, 59);

//     // Format: %Y-%m for monthly, %Y-%U for weekly
//     const format = interval === 'month' ? '%Y-%m' : '%Y-%U';

//     const pipeline = (model, dateField, typeLabel) => [
//         {
//             $match: {
//                 organizationId: toObjectId(orgId),
//                 [dateField]: { $gte: start, $lte: end },
//                 status: { $ne: 'cancelled' }
//             }
//         },
//         {
//             $group: {
//                 _id: { $dateToString: { format, date: `$${dateField}` } },
//                 total: { $sum: '$grandTotal' }
//             }
//         },
//         { $sort: { _id: 1 } }
//     ];

//     const [incomeData, expenseData] = await Promise.all([
//         Invoice.aggregate(pipeline(Invoice, 'invoiceDate', 'Income')),
//         Purchase.aggregate(pipeline(Purchase, 'purchaseDate', 'Expense'))
//     ]);

//     // --- Data Normalization (Fill missing months/weeks with 0) ---
//     const labels = [];
//     const incomeMap = new Map(incomeData.map(i => [i._id, i.total]));
//     const expenseMap = new Map(expenseData.map(e => [e._id, e.total]));
//     const incomeResult = [];
//     const expenseResult = [];
//     const profitResult = [];

//     if (interval === 'month') {
//         for (let i = 0; i < 12; i++) {
//             // Month is 0-indexed in JS dates, but usually 01-12 in MongoDB $dateToString
//             const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`;
//             const monthLabel = new Date(year, i, 1).toLocaleString('default', { month: 'short' });

//             labels.push(monthLabel);

//             const inc = incomeMap.get(monthStr) || 0;
//             const exp = expenseMap.get(monthStr) || 0;

//             incomeResult.push(inc);
//             expenseResult.push(exp);
//             profitResult.push(inc - exp);
//         }
//     } else {
//         // Simple logic for weeks (just pushing raw data for now, ideally needs week generation)
//         // For robustness in this snippet, we'll stick to returning what DB found if not 'month'
//         // or strictly implementing standard 52 weeks is too verbose for this snippet.
//         // Let's fallback to just mapping existing data if not month.
//         incomeData.forEach(d => labels.push(d._id));
//         // Note: Aligning weeks perfectly requires a loop similar to months but for 52 weeks.
//     }

//     return {
//         labels,
//         datasets: [
//             {
//                 label: 'Income',
//                 data: incomeResult,
//                 borderColor: '#4caf50',
//                 backgroundColor: 'rgba(76, 175, 80, 0.2)',
//                 fill: true,
//                 tension: 0.4
//             },
//             {
//                 label: 'Expense',
//                 data: expenseResult,
//                 borderColor: '#f44336',
//                 backgroundColor: 'rgba(244, 67, 54, 0.2)',
//                 fill: true,
//                 tension: 0.4
//             },
//             {
//                 label: 'Net Profit',
//                 data: profitResult,
//                 type: 'bar', // Mixed chart support
//                 backgroundColor: '#2196f3',
//                 borderColor: '#2196f3'
//             }
//         ]
//     };
// };

// /**
//  * 2. Sales Distribution (Pie/Donut)
//  * Group by Category, Branch, or Payment Method
//  */
// exports.getDistributionData = async (orgId, groupBy, startDate, endDate) => {
//     const match = {
//         organizationId: toObjectId(orgId),
//         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
//         status: { $ne: 'cancelled' }
//     };

//     let groupStage = {};
//     let lookupStages = [];
//     let projectStage = {};

//     if (groupBy === 'branch') {
//         groupStage = { _id: '$branchId', value: { $sum: '$grandTotal' } };
//         lookupStages = [
//             { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'meta' } },
//             { $unwind: '$meta' }
//         ];
//         projectStage = { label: '$meta.name', value: 1 };
//     }
//     else if (groupBy === 'paymentMethod') {
//         // Need to join with payments collection ideally, or use invoice.paymentStatus?
//         // Assuming invoices have a payment method snapshot or we look at `payments` collection.
//         // Let's rely on Invoice `paymentStatus` or assume we want Sales vs Returns?
//         // Actually, Payment Method is usually in the Payment collection.
//         // Let's allow grouping by Status for Invoices as a fallback if 'paymentMethod' isn't on Invoice.
//         groupStage = { _id: '$paymentStatus', value: { $sum: '$grandTotal' } };
//         projectStage = { label: '$_id', value: 1 };
//     }
//     else {
//         // Default to 'category' (Product Category)
//         // Requires unwinding items -> lookup product -> group by category
//         lookupStages = [
//             { $unwind: '$items' },
//             { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
//             { $unwind: '$product' },
//             { $group: { _id: '$product.category', value: { $sum: { $multiply: ['$items.quantity', '$items.price'] } } } }
//         ];
//         // We override the initial groupStage because we grouped later
//         groupStage = null;
//         projectStage = { label: '$_id', value: 1 };
//     }

//     const pipeline = [{ $match: match }];

//     if (groupStage) pipeline.push({ $group: groupStage });
//     if (lookupStages.length) pipeline.push(...lookupStages);

//     pipeline.push({ $project: projectStage });
//     pipeline.push({ $sort: { value: -1 } });

//     const rawData = await Invoice.aggregate(pipeline);

//     // Format for PrimeNG Pie Chart
//     return {
//         labels: rawData.map(d => d.label || 'Unknown'),
//         datasets: [
//             {
//                 data: rawData.map(d => d.value),
//                 backgroundColor: [
//                     '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
//                 ],
//                 hoverBackgroundColor: [
//                     '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
//                 ]
//             }
//         ]
//     };
// };

// /**
//  * 3. Branch Performance Radar
//  * Compares branches on scaled metrics (0-100 relative score)
//  */
// exports.getBranchRadarData = async (orgId, startDate, endDate) => {
//     const match = {
//         organizationId: toObjectId(orgId),
//         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
//     };

//     const stats = await Invoice.aggregate([
//         { $match: match },
//         {
//             $group: {
//                 _id: '$branchId',
//                 revenue: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$grandTotal', 0] } },
//                 orders: { $sum: 1 },
//                 discounts: { $sum: '$totalDiscount' },
//                 cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
//             }
//         },
//         { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
//         { $unwind: '$branch' },
//         {
//             $project: {
//                 branch: '$branch.name',
//                 revenue: 1,
//                 orders: 1,
//                 discounts: 1,
//                 cancelled: 1
//             }
//         }
//     ]);

//     if (!stats.length) return { labels: [], datasets: [] };

//     // Find max values for normalization
//     const maxRev = Math.max(...stats.map(s => s.revenue)) || 1;
//     const maxOrd = Math.max(...stats.map(s => s.orders)) || 1;
//     const maxDisc = Math.max(...stats.map(s => s.discounts)) || 1;
//     const maxCanc = Math.max(...stats.map(s => s.cancelled)) || 1;

//     // Metrics Labels
//     const labels = ['Revenue Score', 'Volume Score', 'Discount Usage', 'Cancellation Rate'];

//     // Create a dataset for each branch
//     const datasets = stats.map((s, i) => {
//         // Normalize to 0-100 scale
//         const scores = [
//             (s.revenue / maxRev) * 100,
//             (s.orders / maxOrd) * 100,
//             (s.discounts / maxDisc) * 100,
//             (s.cancelled / maxCanc) * 100
//         ];

//         // Generate a random-ish color based on index or hash
//         const color = i === 0 ? '#42A5F5' : (i === 1 ? '#66BB6A' : '#FFA726');

//         return {
//             label: s.branch,
//             data: scores.map(v => Math.round(v)), // Integer scores
//             fill: true,
//             borderColor: color,
//             pointBackgroundColor: color,
//             pointBorderColor: '#fff'
//         };
//     });

//     return { labels, datasets };
// };

// /**
//  * 4. Order Funnel (Horizontal Bar / Funnel)
//  * Stages: Total Orders -> Payment Pending -> Partial -> Paid
//  */
// exports.getOrderFunnelData = async (orgId, startDate, endDate) => {
//     const match = {
//         organizationId: toObjectId(orgId),
//         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
//         status: { $ne: 'cancelled' } // Don't count cancelled in funnel usually
//     };

//     const data = await Invoice.aggregate([
//         { $match: match },
//         {
//             $group: {
//                 _id: null,
//                 totalCreated: { $sum: 1 },
//                 fullyPaid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
//                 partial: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'partial'] }, 1, 0] } },
//                 unpaid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'unpaid'] }, 1, 0] } }
//             }
//         }
//     ]);

//     const result = data[0] || { totalCreated: 0, fullyPaid: 0, partial: 0, unpaid: 0 };

//     // Funnel Logic:
//     // Stage 1: All Orders (Created)
//     // Stage 2: Attempted Payment (Paid + Partial)
//     // Stage 3: Completed (Paid)

//     // Or strictly by status:
//     return {
//         labels: ['Total Orders', 'Unpaid', 'Partial', 'Completed'],
//         datasets: [
//             {
//                 label: 'Conversion',
//                 data: [
//                     result.totalCreated,
//                     result.unpaid,
//                     result.partial,
//                     result.fullyPaid
//                 ],
//                 backgroundColor: [
//                     '#FF6384',
//                     '#FF9F40',
//                     '#FFCD56',
//                     '#4BC0C0'
//                 ]
//             }
//         ]
//     };
// };
// /**
//  * 5. Year-Over-Year Growth (Line Chart)
//  */
// exports.getYoYGrowth = async (orgId, year) => {
//     const currentYear = parseInt(year);
//     const prevYear = currentYear - 1;

//     const pipeline = (targetYear) => [
//         {
//             $match: {
//                 organizationId: toObjectId(orgId),
//                 invoiceDate: {
//                     $gte: new Date(targetYear, 0, 1),
//                     $lte: new Date(targetYear, 11, 31, 23, 59, 59)
//                 },
//                 status: { $ne: 'cancelled' }
//             }
//         },
//         {
//             $group: {
//                 _id: { $month: '$invoiceDate' }, // 1-12
//                 total: { $sum: '$grandTotal' }
//             }
//         },
//         { $sort: { _id: 1 } }
//     ];

//     const [currentData, prevData] = await Promise.all([
//         Invoice.aggregate(pipeline(currentYear)),
//         Invoice.aggregate(pipeline(prevYear))
//     ]);

//     const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
//     const currentSeries = new Array(12).fill(0);
//     const prevSeries = new Array(12).fill(0);

//     currentData.forEach(d => currentSeries[d._id - 1] = d.total);
//     prevData.forEach(d => prevSeries[d._id - 1] = d.total);

//     return {
//         labels,
//         datasets: [
//             { label: `${currentYear}`, data: currentSeries, borderColor: '#42A5F5', fill: false, tension: 0.4 },
//             { label: `${prevYear}`, data: prevSeries, borderColor: '#BDBDBD', borderDash: [5, 5], fill: false, tension: 0.4 }
//         ]
//     };
// };

// /**
//  * 6. Top Performers (Horizontal Bar)
//  */
// exports.getTopPerformers = async (orgId, type, limit = 5, startDate, endDate) => {
//     const match = {
//         organizationId: toObjectId(orgId),
//         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
//         status: { $ne: 'cancelled' }
//     };

//     let groupBy, lookup, project, labelPrefix;

//     if (type === 'products') {
//         const productStats = await Invoice.aggregate([
//             { $match: match },
//             { $unwind: '$items' },
//             { $group: { _id: '$items.productId', value: { $sum: '$items.quantity' } } },
//             { $sort: { value: -1 } },
//             { $limit: parseInt(limit) },
//             { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'meta' } },
//             { $unwind: '$meta' },
//             { $project: { label: '$meta.name', value: 1 } }
//         ]);
//         return formatBarChart(productStats, 'Units Sold');
//     }
//     else if (type === 'customers') {
//         groupBy = '$customerId';
//         lookup = { from: 'customers', localField: '_id', foreignField: '_id', as: 'meta' };
//         project = { label: '$meta.name', value: 1 };
//         labelPrefix = 'Revenue';
//     }
//     else if (type === 'staff') {
//         groupBy = '$createdBy';
//         lookup = { from: 'users', localField: '_id', foreignField: '_id', as: 'meta' };
//         project = { label: '$meta.name', value: 1 };
//         labelPrefix = 'Revenue';
//     }

//     if (groupBy) {
//         const data = await Invoice.aggregate([
//             { $match: match },
//             { $group: { _id: groupBy, value: { $sum: '$grandTotal' } } },
//             { $sort: { value: -1 } },
//             { $limit: parseInt(limit) },
//             { $lookup: lookup },
//             { $unwind: '$meta' },
//             { $project: project }
//         ]);
//         return formatBarChart(data, labelPrefix);
//     }
//     return { labels: [], datasets: [] };
// };

// const formatBarChart = (data, label) => ({
//     labels: data.map(d => d.label),
//     datasets: [{
//         label,
//         data: data.map(d => d.value),
//         backgroundColor: '#66BB6A'
//     }]
// });

// /**
//  * 7. Customer Acquisition (Line)
//  */
// exports.getCustomerAcquisition = async (orgId, year) => {
//     const start = new Date(year, 0, 1);
//     const end = new Date(year, 11, 31);

//     const data = await Customer.aggregate([
//         { $match: { organizationId: toObjectId(orgId), createdAt: { $gte: start, $lte: end } } },
//         { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } },
//         { $sort: { _id: 1 } }
//     ]);

//     const series = new Array(12).fill(0);
//     data.forEach(d => series[d._id - 1] = d.count);

//     return {
//         labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
//         datasets: [{
//             label: 'New Customers',
//             data: series,
//             borderColor: '#FFA726',
//             fill: true,
//             tension: 0.4
//         }]
//     };
// };

// /**
//  * 8. AOV Trend (Line)
//  */
// exports.getAOVTrend = async (orgId, year) => {
//     const start = new Date(year, 0, 1);
//     const end = new Date(year, 11, 31);

//     const data = await Invoice.aggregate([
//         { $match: { organizationId: toObjectId(orgId), invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//         { $group: { _id: { $month: '$invoiceDate' }, avg: { $avg: '$grandTotal' } } }
//     ]);

//     const series = new Array(12).fill(0);
//     data.forEach(d => series[d._id - 1] = Math.round(d.avg));

//     return {
//         labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
//         datasets: [{
//             label: 'Average Order Value',
//             data: series,
//             borderColor: '#AB47BC',
//             fill: false,
//             tension: 0.4
//         }]
//     };
// };

// /**
//  * 9. Heatmap
//  */
// exports.getHeatmap = async (orgId, branchId) => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);

//     // Last 30 days
//     const start = new Date();
//     start.setDate(start.getDate() - 30);

//     const data = await Invoice.aggregate([
//         { $match: { ...match, invoiceDate: { $gte: start } } },
//         { $project: { day: { $dayOfWeek: '$invoiceDate' }, hour: { $hour: '$invoiceDate' } } },
//         { $group: { _id: { day: '$day', hour: '$hour' }, count: { $sum: 1 } } }
//     ]);

//     const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
//     const series = days.map(d => ({ name: d, data: new Array(24).fill(0) }));

//     data.forEach(d => {
//         // MongoDB day 1=Sun, Array 0=Sun
//         const dayIdx = d._id.day - 1;
//         if (series[dayIdx]) series[dayIdx].data[d._id.hour] = d.count;
//     });

//     return { series };
// };
