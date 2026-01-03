const mongoose = require('mongoose');
const Invoice = require('../../../accounting/billing/invoice.model');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);
// -------------------- Sales Timeline --------------------
exports.getSalesTimeline = async ({ orgId, branchId, startDate, endDate, interval = 'day' }) => {

    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);

    const format = interval === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const timeline = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: { $dateToString: { format, date: '$invoiceDate' } },
                revenue: { $sum: '$grandTotal' },
                invoices: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return {
        period: { startDate, endDate },
        summary: {
            totalRevenue: timeline.reduce((acc, x) => acc + x.revenue, 0),
            invoices: timeline.reduce((acc, x) => acc + x.invoices, 0)
        },
        alerts: {},
        charts: [
            { label: 'Revenue Over Time', dataset: timeline }
        ],
        reportTables: { timeline }
    };
};



// -------------------- Branch Comparison --------------------
exports.getBranchComparison = async ({ orgId, startDate, endDate }) => {

    const match = {
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    };

    const report = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$branchId',
                revenue: { $sum: '$grandTotal' },
                invoiceCount: { $sum: 1 },
                avgBasket: { $avg: '$grandTotal' }
            }
        },
        {
            $lookup: {
                from: 'branches',
                localField: '_id',
                foreignField: '_id',
                as: 'branch'
            }
        },
        { $unwind: '$branch' },
        {
            $project: {
                branchName: '$branch.name',
                revenue: 1,
                invoiceCount: 1,
                avgBasket: { $round: ['$avgBasket', 0] }
            }
        },
        { $sort: { revenue: -1 } }
    ]);

    return {
        period: { startDate, endDate },
        summary: { branches: report.length },
        alerts: report.length === 0 ? { warning: 'No sales recorded' } : {},
        charts: [
            { label: 'Branch Revenue Distribution', dataset: report }
        ],
        reportTables: { branchComparison: report }
    };
};



// -------------------- Product Performance --------------------
exports.getProductPerformance = async ({ orgId, branchId, startDate, endDate }) => {

    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    const result = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.productId',
                name: { $first: '$items.name' },
                qtySold: { $sum: '$items.quantity' },
                revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
            }
        },
        { $sort: { qtySold: -1 } },
        { $limit: 20 }
    ]);

    return {
        period: { startDate, endDate },
        summary: {
            productCount: result.length,
            totalRevenue: result.reduce((a, x) => a + x.revenue, 0)
        },
        alerts: {},
        charts: [
            { label: 'Top Selling Products', dataset: result.slice(0, 10) }
        ],
        reportTables: { productPerformance: result }
    };
};



// -------------------- Customer Purchase Leaderboard --------------------
exports.getTopCustomers = async ({ orgId, branchId, startDate, endDate }) => {

    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    const data = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
        {
            $group: {
                _id: '$customerId',
                spent: { $sum: '$grandTotal' },
                invoices: { $sum: 1 }
            }
        },
        { $sort: { spent: -1 } },
        { $limit: 20 },
        {
            $lookup: {
                from: 'customers',
                localField: '_id',
                foreignField: '_id',
                as: 'customer'
            }
        },
        { $unwind: '$customer' },
        {
            $project: {
                name: '$customer.name',
                phone: '$customer.phone',
                spent: 1,
                invoices: 1
            }
        }
    ]);

    return {
        period: { startDate, endDate },
        summary: {
            highValueCustomers: data.length
        },
        alerts: {},
        charts: [
            { label: 'Top Customers by Revenue', dataset: data.slice(0, 10) }
        ],
        reportTables: { topCustomers: data }
    };
};



// -------------------- Gross Profit --------------------
exports.getGrossProfit = async ({ orgId, branchId, startDate, endDate }) => {

    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    const data = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
        { $unwind: '$items' },
        {
            $lookup: {
                from: 'products',
                localField: 'items.productId',
                foreignField: '_id',
                as: 'prod'
            }
        },
        { $unwind: '$prod' },
        {
            $group: {
                _id: null,
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                cost: { $sum: { $multiply: ['$prod.purchasePrice', '$items.quantity'] } }
            }
        }
    ]);

    const stats = data[0] || { revenue: 0, cost: 0 };
    const profit = stats.revenue - stats.cost;

    return {
        period: { startDate, endDate },
        summary: {
            revenue: stats.revenue,
            cost: stats.cost,
            grossProfit: profit,
            marginPercent: stats.revenue > 0 ? Math.round((profit / stats.revenue) * 100) : 0
        },
        alerts: profit < 0 ? { critical: 'Negative gross margin detected' } : {},
        charts: [],
        reportTables: {}
    };
};
