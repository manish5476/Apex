const mongoose = require('mongoose');
const Sales = require('../../inventory/core/sales.model');
const Invoice = require('../../accounting/billing/invoice.model');
const Product = require('../../inventory/core/product.model');
const SalesReturn = require('../../inventory/core/salesReturn.model');
const { toObjectId } = require('../utils/analytics.utils');

/* ==========================================================================
   📊 FULL SALES ANALYTICS SERVICE
   ========================================================================== */

/**
 * 1. LEADERBOARDS: Top 5 Customers and Top 5 Products
 */
const getLeaderboards = async (orgId, branchId, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const match = { 
        organizationId: toObjectId(orgId), 
        status: 'active',
        createdAt: { $gte: start, $lte: end }
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
                    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
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
                                        { $multiply: ['$items.qty', '$items.rate'] },
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    const match = { 
        organizationId: toObjectId(orgId), 
        status: 'active', 
        createdAt: { $gte: start, $lte: end } 
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
                totalRevenue: 1,
                totalQuantity: 1,
                grossProfit: 1,
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    const match = { organizationId: toObjectId(orgId), createdAt: { $gte: start, $lte: end } };
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
            { $group: { _id: '$items.productId', name: { $first: '$items.name' }, returnedQty: { $sum: '$items.quantity' }, refundTotal: { $sum: '$items.refundAmount' } } }
        ])
    ]);

    return returnData.map(ret => {
        const sale = salesData.find(s => s._id.toString() === ret._id.toString());
        const soldQty = sale ? sale.soldQty : 0;
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    const match = { 
        organizationId: toObjectId(orgId), 
        status: 'active',
        createdAt: { $gte: start, $lte: end }
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

// const mongoose = require('mongoose');
// const Sales = require('../../inventory/core/sales.model');
// const Invoice = require('../../accounting/billing/invoice.model');
// const Product = require('../../inventory/core/product.model');
// const { toObjectId } = require('../utils/analytics.utils');

// const getLeaderboards = async (orgId, branchId, startDate, endDate) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId) };
//         if (branchId) match.branchId = toObjectId(branchId);
//         const start = new Date(startDate);
//         const end = new Date(endDate);

//         const data = await Invoice.aggregate([
//             { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//             {
//                 $facet: {
//                     topCustomers: [
//                         { $group: { _id: '$customerId', totalSpent: { $sum: '$grandTotal' }, transactions: { $sum: 1 } } },
//                         { $sort: { totalSpent: -1 } },
//                         { $limit: 5 },
//                         { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
//                         { $unwind: '$customer' },
//                         { $project: { name: '$customer.name', phone: '$customer.phone', totalSpent: 1, transactions: 1 } }
//                     ],
//                     topProducts: [
//                         { $unwind: '$items' },
//                         {
//                             $group: {
//                                 _id: '$items.productId',
//                                 name: { $first: '$items.name' },
//                                 soldQty: { $sum: '$items.quantity' },
//                                 revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
//                             }
//                         },
//                         { $sort: { soldQty: -1 } },
//                         { $limit: 5 }
//                     ]
//                 }
//             }
//         ]);

//         return {
//             topCustomers: data[0]?.topCustomers || [],
//             topProducts: data[0]?.topProducts || []
//         };
//     } catch (error) {
//         console.error('Error in getLeaderboards:', error);
//         throw new Error(`Failed to fetch leaderboards: ${error.message}`);
//     }
// };

// const getCategoryAnalytics = async (orgId, branchId, startDate, endDate) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { 
//             organizationId: toObjectId(orgId),
//             invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
//             status: { $ne: 'cancelled' }
//         };

//         if (branchId) match.branchId = toObjectId(branchId);

//         return await Invoice.aggregate([
//             { $match: match },
//             { $unwind: '$items' },
//             {
//                 $lookup: {
//                     from: 'products',
//                     localField: 'items.productId',
//                     foreignField: '_id',
//                     as: 'product'
//                 }
//             },
//             { $unwind: '$product' },
//             {
//                 $group: {
//                     _id: '$product.category',
//                     totalRevenue: { 
//                         $sum: { $multiply: ['$items.quantity', '$items.price'] } 
//                     },
//                     totalQuantity: { $sum: '$items.quantity' },
//                     avgPrice: { $avg: '$items.price' },
//                     uniqueProducts: { $addToSet: '$items.productId' },
//                     margin: {
//                         $sum: {
//                             $subtract: [
//                                 { $multiply: ['$items.quantity', '$items.price'] },
//                                 { $multiply: ['$items.quantity', '$product.purchasePrice'] }
//                             ]
//                         }
//                     }
//                 }
//             },
//             {
//                 $project: {
//                     category: '$_id',
//                     totalRevenue: 1,
//                     totalQuantity: 1,
//                     avgPrice: { $round: ['$avgPrice', 2] },
//                     productCount: { $size: '$uniqueProducts' },
//                     margin: 1,
//                     marginPercentage: {
//                         $cond: [
//                             { $eq: ['$totalRevenue', 0] },
//                             0,
//                             { $multiply: [{ $divide: ['$margin', '$totalRevenue'] }, 100] }
//                         ]
//                     },
//                     avgMarginPerUnit: {
//                         $cond: [
//                             { $eq: ['$totalQuantity', 0] },
//                             0,
//                             { $divide: ['$margin', '$totalQuantity'] }
//                         ]
//                     }
//                 }
//             },
//             { $sort: { totalRevenue: -1 } }
//         ]);
//     } catch (error) {
//         console.error('Error in getCategoryAnalytics:', error);
//         throw new Error(`Failed to fetch category analytics: ${error.message}`);
//     }
// };

// const getTopCategories = async (orgId, branchId, startDate, endDate, limit = 5) => {
//     try {
//         const start = new Date(startDate);
//         const end = new Date(endDate);

//         const match = { 
//             organizationId: toObjectId(orgId),
//             status: 'active',
//             createdAt: { $gte: start, $lte: end }
//         };

//         if (branchId) match.branchId = toObjectId(branchId);

//         return await Sales.aggregate([
//             { $match: match },
//             { $unwind: '$items' },
//             {
//                 $lookup: {
//                     from: 'products',
//                     localField: 'items.productId',
//                     foreignField: '_id',
//                     as: 'productInfo'
//                 }
//             },
//             { $unwind: '$productInfo' },
//             // 2. Group by categoryId
//             {
//                 $group: {
//                     _id: '$productInfo.categoryId',
//                     totalQty: { $sum: '$items.qty' },
//                     revenue: { $sum: '$items.lineTotal' },
//                     // Calculate profit using our snapshot!
//                     profit: { 
//                         $sum: { 
//                             $subtract: [
//                                 { $multiply: ['$items.qty', '$items.rate'] }, 
//                                 { $multiply: ['$items.qty', '$items.purchasePriceAtSale'] }
//                             ] 
//                         } 
//                     }
//                 }
//             },
//             // 3. Join with Master to get the actual Category Name
//             {
//                 $lookup: {
//                     from: 'masters',
//                     localField: '_id',
//                     foreignField: '_id',
//                     as: 'categoryInfo'
//                 }
//             },
//             { $unwind: '$categoryInfo' },
//             {
//                 $project: {
//                     name: '$categoryInfo.name',
//                     revenue: 1,
//                     totalQty: 1,
//                     profit: 1,
//                     margin: { 
//                         $cond: [{ $eq: ['$revenue', 0] }, 0, { $multiply: [{ $divide: ['$profit', '$revenue'] }, 100] }] 
//                     },
//                     _id: 0
//                 }
//             },
//             { $sort: { revenue: -1 } },
//             { $limit: limit }
//         ]);
//     } catch (error) {
//         console.error('Error in getTopCategories:', error);
//         throw error;
//     }
// };

// const getReturnAnalytics = async (orgId, branchId, startDate, endDate) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { 
//             organizationId: toObjectId(orgId),
//             returnDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
//             status: 'approved'
//         };

//         if (branchId) match.branchId = toObjectId(branchId);

//         return await SalesReturn.aggregate([
//             { $match: match },
//             { $unwind: '$items' },
//             {
//                 $group: {
//                     _id: '$items.productId',
//                     productName: { $first: '$items.name' },
//                     totalReturnQuantity: { $sum: '$items.quantity' },
//                     totalRefundAmount: { $sum: '$items.refundAmount' },
//                     returnCount: { $sum: 1 }
//                 }
//             },
//             { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
//             { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
//             {
//                 $project: {
//                     productName: 1,
//                     totalReturnQuantity: 1,
//                     totalRefundAmount: 1,
//                     returnCount: 1,
//                     category: '$product.category',
//                     returnRate: null // Will be calculated after getting sales data
//                 }
//             },
//             { $sort: { totalRefundAmount: -1 } }
//         ]);
//     } catch (error) {
//         console.error('Error in getReturnAnalytics:', error);
//         throw new Error(`Failed to fetch return analytics: ${error.message}`);
//     }
// };

// const getTimeBasedAnalytics = async (orgId, branchId) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
//         if (branchId) match.branchId = toObjectId(branchId);

//         const sixMonthsAgo = new Date();
//         sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

//         match.invoiceDate = { $gte: sixMonthsAgo };

//         const [hourly, daily, monthly, weekly] = await Promise.all([
//             // Hourly analysis
//             Invoice.aggregate([
//                 { $match: match },
//                 {
//                     $group: {
//                         _id: { $hour: '$invoiceDate' },
//                         totalRevenue: { $sum: '$grandTotal' },
//                         transactionCount: { $sum: 1 },
//                         avgTicketSize: { $avg: '$grandTotal' }
//                     }
//                 },
//                 { $sort: { _id: 1 } }
//             ]),

//             // Daily analysis (by day of week)
//             Invoice.aggregate([
//                 { $match: match },
//                 {
//                     $group: {
//                         _id: { $dayOfWeek: '$invoiceDate' },
//                         totalRevenue: { $sum: '$grandTotal' },
//                         transactionCount: { $sum: 1 }
//                     }
//                 },
//                 { $sort: { _id: 1 } }
//             ]),

//             // Monthly analysis
//             Invoice.aggregate([
//                 { $match: match },
//                 {
//                     $group: {
//                         _id: { 
//                             year: { $year: '$invoiceDate' },
//                             month: { $month: '$invoiceDate' }
//                         },
//                         totalRevenue: { $sum: '$grandTotal' },
//                         transactionCount: { $sum: 1 }
//                     }
//                 },
//                 { $sort: { '_id.year': 1, '_id.month': 1 } }
//             ]),

//             // Weekly trends
//             Invoice.aggregate([
//                 { $match: match },
//                 {
//                     $group: {
//                         _id: { $isoWeek: '$invoiceDate' },
//                         totalRevenue: { $sum: '$grandTotal' },
//                         transactionCount: { $sum: 1 }
//                     }
//                 },
//                 { $sort: { _id: 1 } }
//             ])
//         ]);

//         return {
//             hourly: hourly.map(h => ({
//                 hour: h._id,
//                 ...h,
//                 hourLabel: `${h._id}:00 - ${h._id}:59`
//             })),
//             daily: daily.map(d => ({
//                 day: d._id,
//                 ...d,
//                 dayLabel: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d._id - 1]
//             })),
//             monthly: monthly.map(m => ({
//                 year: m._id.year,
//                 month: m._id.month,
//                 ...m,
//                 monthLabel: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`
//             })),
//             weekly: weekly.map(w => ({
//                 week: w._id,
//                 ...w
//             }))
//         };
//     } catch (error) {
//         console.error('Error in getTimeBasedAnalytics:', error);
//         throw new Error(`Failed to fetch time-based analytics: ${error.message}`);
//     }
// };

// const getPeakHourAnalysis = async (orgId, branchId) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId) };
//         if (branchId) match.branchId = toObjectId(branchId);

//         const thirtyDaysAgo = new Date();
//         thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

//         return await Invoice.aggregate([
//             { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
//             {
//                 $project: {
//                     dayOfWeek: { $dayOfWeek: '$invoiceDate' },
//                     hour: { $hour: '$invoiceDate' }
//                 }
//             },
//             {
//                 $group: {
//                     _id: { day: '$dayOfWeek', hour: '$hour' },
//                     count: { $sum: 1 }
//                 }
//             },
//             {
//                 $project: {
//                     day: '$_id.day',
//                     hour: '$_id.hour',
//                     count: 1,
//                     _id: 0
//                 }
//             },
//             { $sort: { day: 1, hour: 1 } }
//         ]);
//     } catch (error) {
//         console.error('Error in getPeakHourAnalysis:', error);
//         throw new Error(`Failed to fetch peak hour analysis: ${error.message}`);
//     }
// };

// const generateSalesRecommendations = (forecast) => {
//     try {
//         // Stub - implement sales recommendations
//         return [
//             'Increase marketing budget by 15%',
//             'Launch new product line'
//         ];
//     } catch (error) {
//         console.error('Error in generateSalesRecommendations:', error);
//         return [];
//     }
// };


// module.exports = {
//     getLeaderboards,
//     getCategoryAnalytics,getTopCategories,
//     getReturnAnalytics,
//     getTimeBasedAnalytics,
//     getPeakHourAnalysis,
//     generateSalesRecommendations
// };
