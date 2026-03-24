const mongoose = require('mongoose');
const Sales = require('../../inventory/core/sales.model');
const Invoice = require('../../accounting/billing/invoice.model');
const Product = require('../../inventory/core/product.model');
const SalesReturn = require('../../inventory/core/salesReturn.model');
const { toObjectId } = require('../utils/analytics.utils');

/* ==========================================================================
   📊 SALES ANALYTICS SERVICE
   ========================================================================== */

/**
 * 1. LEADERBOARDS: Top 5 Customers and Top 5 Products
 */
const getLeaderboards = async (orgId, branchId, startDate, endDate) => {
    const match = {
        organizationId: toObjectId(orgId),
        status: 'active',
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };
    if (branchId) match.branchId = toObjectId(branchId);

    const data = await Sales.aggregate([
        {
            $facet: {
                topCustomers: [
                    { $match: match },
                    { $group: { _id: '$customerId', totalSpent: { $sum: '$totalAmount' }, transactions: { $sum: 1 } } },
                    { $sort: { totalSpent: -1 } },
                    { $limit: 5 },
                    {
                        $lookup: {
                            from: 'customers', localField: '_id', foreignField: '_id',
                            pipeline: [{ $project: { name: 1, phone: 1 } }],
                            as: 'customer'
                        }
                    },
                    { $unwind: '$customer' },
                    { $project: { name: '$customer.name', phone: '$customer.phone', totalSpent: 1, transactions: 1 } }
                ],
                topProducts: [
                    { $match: match },
                    { $unwind: '$items' },
                    {
                        $group: {
                            _id: '$items.productId',
                            name: { $first: '$items.name' },
                            soldQty: { $sum: '$items.qty' },
                            revenue: { $sum: '$items.lineTotal' },
                            profit: {
                                $sum: {
                                    $subtract: [
                                        '$items.lineTotal',
                                        { $multiply: ['$items.qty', '$items.purchasePriceAtSale'] }
                                    ]
                                }
                            }
                        }
                    },
                    { $sort: { revenue: -1 } },
                    { $limit: 5 }
                ]
            }
        }
    ]);

    return {
        topCustomers: data[0]?.topCustomers || [],
        topProducts: data[0]?.topProducts || []
    };
};

/**
 * 2. CATEGORY ANALYTICS: Performance and Margins per Category
 */
const getCategoryAnalytics = async (orgId, branchId, startDate, endDate) => {
    const match = {
        organizationId: toObjectId(orgId),
        status: 'active',
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };
    if (branchId) match.branchId = toObjectId(branchId);

    return await Sales.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        {
            $group: {
                _id: '$product.categoryId',
                totalRevenue: { $sum: '$items.lineTotal' },
                totalQuantity: { $sum: '$items.qty' },
                grossProfit: {
                    $sum: {
                        $subtract: [
                            { $multiply: ['$items.qty', '$items.rate'] },
                            { $multiply: ['$items.qty', '$items.purchasePriceAtSale'] }
                        ]
                    }
                },
                uniqueProducts: { $addToSet: '$items.productId' }
            }
        },
        { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'cat' } },
        { $unwind: '$cat' },
        {
            $project: {
                category: '$cat.name',
                totalRevenue: 1, totalQuantity: 1, grossProfit: 1,
                productCount: { $size: '$uniqueProducts' },
                marginPercentage: {
                    $cond: [{ $eq: ['$totalRevenue', 0] }, 0, { $multiply: [{ $divide: ['$grossProfit', '$totalRevenue'] }, 100] }]
                }
            }
        },
        { $sort: { totalRevenue: -1 } }
    ]);
};

/**
 * 3. TOP CATEGORIES: Short-form for Dashboard Widgets
 */
const getTopCategories = async (orgId, branchId, startDate, endDate, limit = 5) => {
    const data = await getCategoryAnalytics(orgId, branchId, startDate, endDate);
    return data.slice(0, limit).map(item => ({
        name: item.category,
        revenue: item.totalRevenue,
        profit: item.grossProfit,
        margin: item.marginPercentage
    }));
};

/**
 * 4. RETURN ANALYTICS: Return rates vs actual Sales
 */
const getReturnAnalytics = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId), createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    if (branchId) match.branchId = toObjectId(branchId);

    const [salesData, returnData] = await Promise.all([
        Sales.aggregate([
            { $match: { ...match, status: 'active' } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', soldQty: { $sum: '$items.qty' } } }
        ]),
        SalesReturn.aggregate([
            { $match: { ...match, status: 'approved' } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', name: { $first: '$items.name' }, returnedQty: { $sum: '$items.quantity' } } }
        ])
    ]);

    // O(N) Hash-Map join
    const salesMap = new Map(salesData.map(s => [s._id.toString(), s.soldQty]));

    return returnData.map(ret => {
        const soldQty = salesMap.get(ret._id.toString()) || 0;
        return {
            ...ret,
            soldQty,
            returnRate: soldQty > 0 ? (ret.returnedQty / soldQty) * 100 : 0
        };
    }).sort((a, b) => b.returnRate - a.returnRate);
};

/**
 * 5. TIME-BASED TRENDS: Hourly, Daily, Monthly, and Weekly
 */
const getTimeBasedAnalytics = async (orgId, branchId, startDate, endDate) => {
    const match = {
        organizationId: toObjectId(orgId),
        status: 'active',
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };
    if (branchId) match.branchId = toObjectId(branchId);

    const [hourly, daily, monthly, weekly] = await Promise.all([
        Sales.aggregate([
            { $match: match },
            { $group: { _id: { $hour: '$createdAt' }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]),
        Sales.aggregate([
            { $match: match },
            { $group: { _id: { $dayOfWeek: '$createdAt' }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]),
        Sales.aggregate([
            { $match: match },
            { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]),
        Sales.aggregate([
            { $match: match },
            { $group: { _id: { $isoWeek: '$createdAt' }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ])
    ]);

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
        hourly: hourly.map(h => ({ label: `${h._id}:00`, revenue: h.revenue, count: h.count })),
        daily: daily.map(d => ({ label: dayLabels[d._id - 1], revenue: d.revenue, count: d.count })),
        monthly: monthly.map(m => ({ label: `${m._id.year}-${m._id.month}`, revenue: m.revenue, count: m.count })),
        weekly: weekly.map(w => ({ label: `Week ${w._id}`, revenue: w.revenue, count: w.count }))
    };
};

/**
 * 6. PEAK HOUR ANALYSIS: Heatmap Data
 */
const getPeakHourAnalysis = async (orgId, branchId) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const match = { organizationId: toObjectId(orgId), status: 'active', createdAt: { $gte: thirtyDaysAgo } };
    if (branchId) match.branchId = toObjectId(branchId);

    return await Sales.aggregate([
        { $match: match },
        { $project: { day: { $dayOfWeek: '$createdAt' }, hour: { $hour: '$createdAt' } } },
        { $group: { _id: { day: '$day', hour: '$hour' }, count: { $sum: 1 } } },
        { $project: { day: '$_id.day', hour: '$_id.hour', count: 1, _id: 0 } },
        { $sort: { day: 1, hour: 1 } }
    ]);
};

module.exports = {
    getLeaderboards,
    getCategoryAnalytics,
    getTopCategories,
    getReturnAnalytics,
    getTimeBasedAnalytics,
    getPeakHourAnalysis
};
