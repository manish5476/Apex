const mongoose = require('mongoose');
const Invoice = require('../../inventory/core/sales.model');
const Purchase = require('../../inventory/core/purchase.model');
const Customer = require('../../organization/core/customer.model');
const { toObjectId, calculateGrowth, calculatePercentage } = require('../utils/analytics.utils');
const Sales = require('../../inventory/core/sales.model');

//  const getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
//     try {
//         const startTime = performance.now();

//         // Input validation
//         if (!orgId) throw new Error('Organization ID is required');
//         if (!mongoose.Types.ObjectId.isValid(orgId)) throw new Error('Invalid Organization ID');

//         const start = new Date(startDate);
//         const end = new Date(endDate);
//         if (isNaN(start.getTime()) || isNaN(end.getTime())) {
//             throw new Error('Invalid date format');
//         }
//         if (start > end) throw new Error('Start date cannot be after end date');

//         const match = { 
//             organizationId: toObjectId(orgId),
//             status: { $ne: 'cancelled' }
//         };

//         if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
//             match.branchId = toObjectId(branchId);
//         }

//         const duration = end - start;
//         const prevStart = new Date(start - duration);
//         const prevEnd = new Date(start);

//         // Create today date boundaries with timezone awareness
//         const todayStart = new Date();
//         todayStart.setHours(0, 0, 0, 0);
//         const todayEnd = new Date();
//         todayEnd.setHours(23, 59, 59, 999);

//         // Parallel execution of key metrics
//         const [
//             salesStats,
//             purchaseStats,
//             customerStats,
//             productStats
//         ] = await Promise.all([
//             // Sales metrics - FIXED: Removed $totalCost reference
//             Invoice.aggregate([
//                 {
//                     $facet: {
//                         current: [
//                             { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
//                             { 
//                                 $group: { 
//                                     _id: null, 
//                                     revenue: { $sum: '$grandTotal' }, 
//                                     count: { $sum: 1 }, 
//                                     due: { $sum: '$balanceAmount' },
//                                     avgTicket: { $avg: '$grandTotal' }
//                                 } 
//                             }
//                         ],
//                         previous: [
//                             { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd } } },
//                             { $group: { _id: null, revenue: { $sum: '$grandTotal' } } }
//                         ],
//                         today: [
//                             { 
//                                 $match: { 
//                                     ...match, 
//                                     invoiceDate: { 
//                                         $gte: todayStart, 
//                                         $lte: todayEnd 
//                                     } 
//                                 } 
//                             },
//                             { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
//                         ]
//                     }
//                 }
//             ]),

//             // Purchase metrics - FIXED: Ensure consistent field names
//             Purchase.aggregate([
//                 {
//                     $facet: {
//                         current: [
//                             { $match: { ...match, purchaseDate: { $gte: start, $lte: end } } },
//                             { 
//                                 $group: { 
//                                     _id: null, 
//                                     expense: { $sum: '$grandTotal' }, 
//                                     count: { $sum: 1 }, 
//                                     due: { $sum: '$balanceAmount' }
//                                 } 
//                             }
//                         ],
//                         previous: [
//                             { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd } } },
//                             { $group: { _id: null, expense: { $sum: '$grandTotal' } } }
//                         ]
//                     }
//                 }
//             ]),

//             // Customer metrics - FIXED: Filter null customerIds
//             Invoice.aggregate([
//                 { 
//                     $match: { 
//                         ...match, 
//                         invoiceDate: { $gte: start, $lte: end },
//                         customerId: { $ne: null } // Exclude null customer IDs
//                     } 
//                 },
//                 { $group: { _id: '$customerId' } },
//                 { $count: 'uniqueCustomers' }
//             ]),

//             // Product metrics - FIXED: Filter null productIds
//             Invoice.aggregate([
//                 { 
//                     $match: { 
//                         ...match, 
//                         invoiceDate: { $gte: start, $lte: end } 
//                     } 
//                 },
//                 { $unwind: '$items' },
//                 { $match: { 'items.productId': { $ne: null } } }, // Exclude null product IDs
//                 { 
//                     $group: { 
//                         _id: null,
//                         totalProductsSold: { $sum: '$items.quantity' },
//                         uniqueProducts: { $addToSet: '$items.productId' }
//                     } 
//                 },
//                 { 
//                     $project: { 
//                         totalProductsSold: 1,
//                         uniqueProductCount: { 
//                             $cond: {
//                                 if: { $isArray: "$uniqueProducts" },
//                                 then: { $size: "$uniqueProducts" },
//                                 else: 0
//                             }
//                         }
//                     } 
//                 }
//             ])
//         ]);

//         // Process results
//         const curSales = salesStats[0]?.current?.[0] || { revenue: 0, count: 0, due: 0, avgTicket: 0 };
//         const prevSales = salesStats[0]?.previous?.[0] || { revenue: 0 };
//         const todaySales = salesStats[0]?.today?.[0] || { revenue: 0, count: 0 };

//         const curPurch = purchaseStats[0]?.current?.[0] || { expense: 0, count: 0, due: 0 };
//         const prevPurch = purchaseStats[0]?.previous?.[0] || { expense: 0 };

//         const uniqueCustomers = customerStats[0]?.uniqueCustomers || 0;
//         const productMetrics = productStats[0] || { totalProductsSold: 0, uniqueProductCount: 0 };

//         const netProfit = curSales.revenue - curPurch.expense;
//         const prevNetProfit = prevSales.revenue - prevPurch.expense;

//         // Get new customers count - FIXED: Call the function properly
//         const newCustomersCount = await getNewCustomersCount(orgId, branchId, start, end);

//         const executionTime = performance.now() - startTime;

//         return {
//             totalRevenue: {
//                 value: curSales.revenue,
//                 count: curSales.count,
//                 growth: calculateGrowth(curSales.revenue, prevSales.revenue),
//                 avgTicket: Number(curSales.avgTicket ? curSales.avgTicket.toFixed(2) : 0),
//                 today: todaySales.revenue
//             },
//             totalExpense: {
//                 value: curPurch.expense,
//                 count: curPurch.count,
//                 growth: calculateGrowth(curPurch.expense, prevPurch.expense)
//             },
//             netProfit: {
//                 value: netProfit,
//                 growth: calculateGrowth(netProfit, prevNetProfit),
//                 margin: calculatePercentage(netProfit, curSales.revenue || 1) // Avoid division by zero
//             },
//             customers: {
//                 active: uniqueCustomers,
//                 new: newCustomersCount
//             },
//             products: {
//                 sold: productMetrics.totalProductsSold,
//                 unique: productMetrics.uniqueProductCount
//             },
//             outstanding: {
//                 receivables: curSales.due,
//                 payables: curPurch.due
//             },
//             performance: {
//                 executionTime: `${executionTime.toFixed(2)}ms`,
//                 dataPoints: curSales.count + curPurch.count,
//                 queryCount: 4
//             },
//             period: {
//                 current: { start, end },
//                 previous: { start: prevStart, end: prevEnd },
//                 today: { start: todayStart, end: todayEnd }
//             }
//         };
//     } catch (error) {
//         console.error('Error in getExecutiveStats:', error);
//         throw new Error(`Failed to fetch executive stats: ${error.message}`);
//     }
// };

// Get new customers count - CORRECTED VERSION

const getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
    try {
        const startTime = performance.now();
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Standard Match Object
        const match = { 
            organizationId: toObjectId(orgId),
            status: 'active' // We use 'active' for Sales model analytics
        };
        if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
            match.branchId = toObjectId(branchId);
        }

        const duration = end - start;
        const prevStart = new Date(start - duration);
        const prevEnd = new Date(start);

        // Today boundaries
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        // Parallel execution
        const [
            actualSalesAndProfit,
            purchaseStats,
            customerStats,
            productStats,
            newCustomersCount
        ] = await Promise.all([
            // 🟢 UPGRADED: Sales & Realized Profit (Using Sales Model)
            Sales.aggregate([
                {
                    $facet: {
                        current: [
                            { $match: { ...match, createdAt: { $gte: start, $lte: end } } },
                            { $unwind: '$items' },
                            {
                                $group: {
                                    _id: null,
                                    revenue: { $sum: '$totalAmount' }, // Total amount including tax/disc
                                    count: { $addToSet: '$_id' }, // Unique invoice count
                                    // Realized COGS (Cost of Goods Sold)
                                    cogs: { $sum: { $multiply: ['$items.qty', '$items.purchasePriceAtSale'] } },
                                    due: { $sum: '$dueAmount' }
                                }
                            },
                            { $project: { 
                                revenue: 1, 
                                count: { $size: '$count' }, 
                                profit: { $subtract: ['$revenue', '$cogs'] },
                                due: 1 
                            }}
                        ],
                        previous: [
                            { $match: { ...match, createdAt: { $gte: prevStart, $lte: prevEnd } } },
                            { $group: { _id: null, revenue: { $sum: '$totalAmount' } } }
                        ],
                        today: [
                            { $match: { ...match, createdAt: { $gte: todayStart, $lte: todayEnd } } },
                            { $group: { _id: null, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
                        ]
                    }
                }
            ]),

            // Purchase metrics
            Purchase.aggregate([
                {
                    $facet: {
                        current: [
                            { $match: { organizationId: toObjectId(orgId), purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                            { $group: { _id: null, expense: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
                        ],
                        previous: [
                            { $match: { organizationId: toObjectId(orgId), purchaseDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
                            { $group: { _id: null, expense: { $sum: '$grandTotal' } } }
                        ]
                    }
                }
            ]),

            // Unique active customers
            Sales.distinct('customerId', { ...match, createdAt: { $gte: start, $lte: end } }),

            // Product metrics
            Sales.aggregate([
                { $match: { ...match, createdAt: { $gte: start, $lte: end } } },
                { $unwind: '$items' },
                { $group: { _id: null, sold: { $sum: '$items.qty' }, unique: { $addToSet: '$items.productId' } } }
            ]),

            getNewCustomersCount(orgId, branchId, start, end)
        ]);

        // Mapping Data
        const curSales = actualSalesAndProfit[0]?.current?.[0] || { revenue: 0, count: 0, profit: 0, due: 0 };
        const prevSales = actualSalesAndProfit[0]?.previous?.[0] || { revenue: 0 };
        const todaySales = actualSalesAndProfit[0]?.today?.[0] || { revenue: 0 };

        const curPurch = purchaseStats[0]?.current?.[0] || { expense: 0, count: 0, due: 0 };
        const prevPurch = purchaseStats[0]?.previous?.[0] || { expense: 0 };

        const pStats = productStats[0] || { sold: 0, unique: [] };

        return {
            totalRevenue: {
                value: curSales.revenue,
                count: curSales.count,
                growth: calculateGrowth(curSales.revenue, prevSales.revenue),
                today: todaySales.revenue
            },
            totalExpense: {
                value: curPurch.expense,
                count: curPurch.count,
                growth: calculateGrowth(curPurch.expense, prevPurch.expense)
            },
            // 🟢 REAL PROFIT: Now uses 'Realized Profit' instead of just subtracting purchases
            netProfit: {
                value: curSales.profit,
                margin: calculatePercentage(curSales.profit, curSales.revenue),
                status: curSales.profit >= 0 ? 'profitable' : 'loss'
            },
            customers: {
                active: customerStats.length,
                new: newCustomersCount
            },
            products: {
                sold: pStats.sold,
                unique: pStats.unique.length
            },
            outstanding: {
                receivables: curSales.due,
                payables: curPurch.due
            },
            performance: {
                executionTime: `${(performance.now() - startTime).toFixed(2)}ms`
            }
        };
    } catch (error) {
        console.error('Executive Stats Error:', error);
        throw error;
    }
};

const getNewCustomersCount = async (orgId, branchId, start, end) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { 
            organizationId: toObjectId(orgId),
            createdAt: { $gte: start, $lte: end }
        };

        if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
            // Note: Customer model doesn't have branchId field, so we need to handle this differently
            // If you need branch-specific new customers, you might need to join with invoices
            // For now, we'll return all new customers for the organization
        }

        return await Customer.countDocuments(match);
    } catch (error) {
        console.error('Error in getNewCustomersCount:', error);
        return 0;
    }
};

 const getChartData = async (orgId, branchId, startDate, endDate, interval = 'auto') => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { 
            organizationId: toObjectId(orgId),
            status: { $ne: 'cancelled' }
        };

        if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
            match.branchId = toObjectId(branchId);
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid date format');
        }

        // Auto-determine interval based on date range
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        let dateFormat;

        if (interval === 'auto') {
            if (daysDiff > 365) dateFormat = '%Y';
            else if (daysDiff > 90) dateFormat = '%Y-%m';
            else if (daysDiff > 30) dateFormat = '%Y-%W';
            else dateFormat = '%Y-%m-%d';
        } else {
            switch (interval) {
                case 'year': dateFormat = '%Y'; break;
                case 'month': dateFormat = '%Y-%m'; break;
                case 'week': dateFormat = '%Y-%W'; break;
                case 'day': default: dateFormat = '%Y-%m-%d';
            }
        }

        const timeline = await Invoice.aggregate([
            { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
            { 
                $project: { 
                    date: '$invoiceDate', 
                    amount: '$grandTotal', 
                    type: 'income',
                    profit: { 
                        $subtract: [
                            '$grandTotal', 
                            { $ifNull: ['$totalCost', 0] }
                        ] 
                    }
                } 
            },
            {
                $unionWith: {
                    coll: 'purchases',
                    pipeline: [
                        { $match: { ...match, purchaseDate: { $gte: start, $lte: end } } },
                        { $project: { date: '$purchaseDate', amount: '$grandTotal', type: 'expense' } }
                    ]
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: dateFormat, date: '$date' } },
                    income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
                    expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
                    profit: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$profit', 0] } }
                }
            },
            { $sort: { _id: 1 } },
            { 
                $project: { 
                    date: '$_id', 
                    income: 1, 
                    expense: 1, 
                    profit: 1,
                    margin: { 
                        $cond: [
                            { $eq: ['$income', 0] },
                            0,
                            { $multiply: [{ $divide: ['$profit', '$income'] }, 100] }
                        ]
                    },
                    _id: 0 
                } 
            }
        ]);

        // Calculate cumulative values
        let cumulativeIncome = 0;
        let cumulativeExpense = 0;

        const enhancedTimeline = timeline.map(item => {
            cumulativeIncome += item.income;
            cumulativeExpense += item.expense;

            return {
                ...item,
                cumulativeIncome,
                cumulativeExpense,
                netCashFlow: cumulativeIncome - cumulativeExpense
            };
        });

        return {
            timeline: enhancedTimeline,
            summary: {
                totalIncome: cumulativeIncome,
                totalExpense: cumulativeExpense,
                totalProfit: cumulativeIncome - cumulativeExpense,
                avgMargin: timeline.length > 0 ? 
                    timeline.reduce((sum, item) => sum + item.margin, 0) / timeline.length : 0
            },
            interval: dateFormat,
            period: { start, end, days: daysDiff }
        };
    } catch (error) {
        console.error('Error in getChartData:', error);
        throw new Error(`Failed to fetch chart data: ${error.message}`);
    }
};


module.exports = {
    getExecutiveStats,
    getChartData,getNewCustomersCount
};