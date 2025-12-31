const mongoose = require('mongoose');
const Redis = require('ioredis');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Product = require('../models/productModel');
const Customer = require('../models/customerModel');
const User = require('../models/userModel');
const Branch = require('../models/branchModel');
const AuditLog = require('../models/auditLogModel');
const Sales = require('../models/salesModel');
const AccountEntry = require('../models/accountEntryModel');
const { performance } = require('perf_hooks');

// Redis Cache Setup (Optional - fallback if not configured)
let redis;
try {
    redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
    });

    redis.on('error', (error) => {
        console.warn('Redis connection error, continuing without cache:', error.message);
        redis = null;
    });
} catch (error) {
    console.warn('Redis not available, continuing without cache:', error.message);
    redis = null;
}

// Helper Functions
const toObjectId = (id) => id ? new mongoose.Types.ObjectId(id) : null;

const calculateGrowth = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Number(((current - previous) / previous * 100).toFixed(1));
};

const calculatePercentage = (part, total) => {
    if (total === 0) return 0;
    return Number((part / total * 100).toFixed(1));
};

/* ==========================================================================
   1. CACHE MANAGEMENT
   ========================================================================== */

exports.cacheData = async (key, data, ttl = 300) => {
    if (!redis) return false;

    try {
        await redis.setex(
            key, 
            ttl, 
            JSON.stringify({ data, cachedAt: Date.now() })
        );
        return true;
    } catch (error) {
        console.warn('Cache set error:', error.message);
        return false;
    }
};

exports.getCachedData = async (key) => {
    if (!redis) return null;

    try {
        const cached = await redis.get(key);
        if (cached) {
            const parsed = JSON.parse(cached);
            // Check if cache is still valid
            const age = Date.now() - parsed.cachedAt;
            if (age < 300000) { // 5 minutes
                return parsed.data;
            }
        }
        return null;
    } catch (error) {
        console.warn('Cache get error:', error.message);
        return null;
    }
};

exports.clearCache = async (pattern) => {
    if (!redis) return 0;

    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
        return keys.length;
    } catch (error) {
        console.warn('Cache clear error:', error.message);
        return 0;
    }
};

/* ==========================================================================
   2. SMART EXECUTIVE DASHBOARD
   ========================================================================== */

exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
    const startTime = performance.now();
    const match = { 
        organizationId: toObjectId(orgId),
        status: { $ne: 'cancelled' }
    };

    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end - start;
    const prevStart = new Date(start - duration);
    const prevEnd = new Date(start);

    // Parallel execution of key metrics
    const [
        salesStats,
        purchaseStats,
        customerStats,
        productStats
    ] = await Promise.all([
        // Sales metrics
        Invoice.aggregate([
            {
                $facet: {
                    current: [
                        { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
                        { 
                            $group: { 
                                _id: null, 
                                revenue: { $sum: '$grandTotal' }, 
                                count: { $sum: 1 }, 
                                due: { $sum: '$balanceAmount' },
                                avgTicket: { $avg: '$grandTotal' }
                            } 
                        }
                    ],
                    previous: [
                        { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd } } },
                        { $group: { _id: null, revenue: { $sum: '$grandTotal' } } }
                    ],
                    today: [
                        { 
                            $match: { 
                                ...match, 
                                invoiceDate: { 
                                    $gte: new Date().setHours(0,0,0,0), 
                                    $lte: new Date().setHours(23,59,59,999) 
                                } 
                            } 
                        },
                        { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
                    ]
                }
            }
        ]),

        // Purchase metrics
        Purchase.aggregate([
            {
                $facet: {
                    current: [
                        { $match: { ...match, purchaseDate: { $gte: start, $lte: end } } },
                        { 
                            $group: { 
                                _id: null, 
                                expense: { $sum: '$grandTotal' }, 
                                count: { $sum: 1 }, 
                                due: { $sum: '$balanceAmount' }
                            } 
                        }
                    ],
                    previous: [
                        { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd } } },
                        { $group: { _id: null, expense: { $sum: '$grandTotal' } } }
                    ]
                }
            }
        ]),

        // Customer metrics
        Invoice.aggregate([
            { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
            { $group: { _id: '$customerId' } },
            { $count: 'uniqueCustomers' }
        ]),

        // Product metrics
        Invoice.aggregate([
            { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
            { $unwind: '$items' },
            { 
                $group: { 
                    _id: null,
                    totalProductsSold: { $sum: '$items.quantity' },
                    uniqueProducts: { $addToSet: '$items.productId' }
                } 
            },
            { $project: { 
                totalProductsSold: 1,
                uniqueProductCount: { $size: '$uniqueProducts' }
            } }
        ])
    ]);

    // Process results
    const curSales = salesStats[0]?.current?.[0] || { revenue: 0, count: 0, due: 0, avgTicket: 0 };
    const prevSales = salesStats[0]?.previous?.[0] || { revenue: 0 };
    const todaySales = salesStats[0]?.today?.[0] || { revenue: 0, count: 0 };

    const curPurch = purchaseStats[0]?.current?.[0] || { expense: 0, count: 0, due: 0 };
    const prevPurch = purchaseStats[0]?.previous?.[0] || { expense: 0 };

    const uniqueCustomers = customerStats[0]?.uniqueCustomers || 0;
    const productMetrics = productStats[0] || { totalProductsSold: 0, uniqueProductCount: 0 };

    const netProfit = curSales.revenue - curPurch.expense;
    const prevNetProfit = prevSales.revenue - prevPurch.expense;

    const executionTime = performance.now() - startTime;

    return {
        totalRevenue: {
            value: curSales.revenue,
            count: curSales.count,
            growth: calculateGrowth(curSales.revenue, prevSales.revenue),
            avgTicket: Number(curSales.avgTicket.toFixed(2)),
            today: todaySales.revenue
        },
        totalExpense: {
            value: curPurch.expense,
            count: curPurch.count,
            growth: calculateGrowth(curPurch.expense, prevPurch.expense)
        },
        netProfit: {
            value: netProfit,
            growth: calculateGrowth(netProfit, prevNetProfit),
            margin: calculatePercentage(netProfit, curSales.revenue)
        },
        customers: {
            active: uniqueCustomers,
            new: await this.getNewCustomersCount(orgId, branchId, start, end)
        },
        products: {
            sold: productMetrics.totalProductsSold,
            unique: productMetrics.uniqueProductCount
        },
        outstanding: {
            receivables: curSales.due,
            payables: curPurch.due
        },
        performance: {
            executionTime: `${executionTime.toFixed(2)}ms`,
            dataPoints: curSales.count + curPurch.count
        }
    };
};

exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'auto') => {
    const match = { 
        organizationId: toObjectId(orgId),
        status: { $ne: 'cancelled' }
    };

    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);

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
};

/* ==========================================================================
   3. ENHANCED FUNCTIONS FROM ORIGINAL SERVICE (Modified)
   ========================================================================== */

exports.getInventoryAnalytics = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), isActive: true };

    const [lowStock, valuation] = await Promise.all([
        // Low stock alerts
        Product.aggregate([
            { $match: match },
            { $unwind: '$inventory' },
            ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
            {
                $project: {
                    name: 1,
                    sku: 1,
                    currentStock: '$inventory.quantity',
                    reorderLevel: '$inventory.reorderLevel',
                    branchId: '$inventory.branchId',
                    urgency: {
                        $cond: [
                            { $lte: ['$inventory.quantity', { $multiply: ['$inventory.reorderLevel', 0.5] }] },
                            'critical',
                            { $cond: [
                                { $lte: ['$inventory.quantity', '$inventory.reorderLevel'] },
                                'warning',
                                'normal'
                            ]}
                        ]
                    }
                }
            },
            { $match: { urgency: { $in: ['critical', 'warning'] } } },
            { $sort: { urgency: 1, currentStock: 1 } },
            { $limit: 20 },
            { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
            { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
            { 
                $project: { 
                    name: 1, 
                    sku: 1, 
                    currentStock: 1, 
                    reorderLevel: 1, 
                    branchName: '$branch.name',
                    urgency: 1
                } 
            }
        ]),

        // Inventory valuation
        Product.aggregate([
            { $match: match },
            { $unwind: '$inventory' },
            ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
            {
                $group: {
                    _id: null,
                    totalValue: { $sum: { $multiply: ['$inventory.quantity', '$purchasePrice'] } },
                    totalItems: { $sum: '$inventory.quantity' },
                    productCount: { $sum: 1 }
                }
            }
        ])
    ]);

    const valuationResult = valuation[0] || { totalValue: 0, totalItems: 0, productCount: 0 };

    return {
        lowStockAlerts: lowStock,
        inventoryValuation: valuationResult,
        summary: {
            totalAlerts: lowStock.length,
            criticalAlerts: lowStock.filter(item => item.urgency === 'critical').length,
            valuation: valuationResult.totalValue
        }
    };
};

exports.getProductPerformanceStats = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };

    // 1. High Margin Products
    const highMargin = await Product.aggregate([
        { $match: { ...match, isActive: true } },
        { 
            $project: { 
                name: 1, 
                sku: 1,
                margin: { $subtract: ['$sellingPrice', '$purchasePrice'] },
                marginPercent: {
                     $cond: [
                        { $eq: ['$purchasePrice', 0] }, 
                        100, 
                        { $multiply: [{ $divide: [{ $subtract: ['$sellingPrice', '$purchasePrice'] }, '$purchasePrice'] }, 100] }
                     ]
                }
            } 
        },
        { $sort: { margin: -1 } },
        { $limit: 10 }
    ]);

    // 2. Dead Stock (Items with Inventory > 0 but NO Sales in last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const soldProducts = await Invoice.distinct('items.productId', { 
        ...match, 
        invoiceDate: { $gte: ninetyDaysAgo } 
    });

    const deadStock = await Product.aggregate([
        { 
            $match: { 
                ...match, 
                _id: { $nin: soldProducts }, 
                isActive: true
            } 
        },
        { $unwind: "$inventory" }, 
        ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
        { $match: { "inventory.quantity": { $gt: 0 } } },
        {
            $project: {
                name: 1,
                sku: 1,
                stockQuantity: "$inventory.quantity",
                value: { $multiply: ["$inventory.quantity", "$purchasePrice"] }
            }
        },
        { $limit: 20 }
    ]);

    return { highMargin, deadStock };
};

exports.getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    // 1. Payment Mode Breakdown
    const modes = await Payment.aggregate([
        { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
        { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
        { $project: { name: '$_id', value: 1, _id: 0 } }
    ]);

    // 2. Aging Analysis (Receivables)
    const now = new Date();
    const aging = await Invoice.aggregate([
        { $match: { ...match, paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' } } },
        {
            $project: {
                balanceAmount: 1,
                daysOverdue: { 
                    $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24] 
                }
            }
        },
        {
            $bucket: {
                groupBy: "$daysOverdue",
                boundaries: [0, 30, 60, 90, 365],
                default: "90+",
                output: {
                    totalAmount: { $sum: "$balanceAmount" },
                    count: { $sum: 1 }
                }
            }
        }
    ]);

    return { paymentModes: modes, agingReport: aging };
};

exports.getTaxStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const stats = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, outputTax: { $sum: '$totalTax' }, taxableSales: { $sum: '$subTotal' } } },
        {
            $unionWith: {
                coll: 'purchases',
                pipeline: [
                    { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, inputTax: { $sum: '$totalTax' }, taxablePurchase: { $sum: '$subTotal' } } }
                ]
            }
        },
        {
            $group: {
                _id: null,
                totalOutputTax: { $sum: '$outputTax' },
                totalInputTax: { $sum: '$inputTax' },
                totalTaxableSales: { $sum: '$taxableSales' },
                totalTaxablePurchase: { $sum: '$taxablePurchase' }
            }
        },
        {
            $project: {
                _id: 0,
                inputTax: '$totalInputTax',
                outputTax: '$totalOutputTax',
                netPayable: { $subtract: ['$totalOutputTax', '$totalInputTax'] }
            }
        }
    ]);

    return stats[0] || { inputTax: 0, outputTax: 0, netPayable: 0 };
};

exports.getProcurementStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const topSuppliers = await Purchase.aggregate([
        { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$supplierId', totalSpend: { $sum: '$grandTotal' }, bills: { $sum: 1 } } },
        { $sort: { totalSpend: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
        { $unwind: '$supplier' },
        { $project: { name: '$supplier.companyName', totalSpend: 1, bills: 1 } }
    ]);

    return { topSuppliers };
};

exports.getCustomerRiskStats = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };

    const creditRisk = await Customer.find({ 
        ...match, 
        outstandingBalance: { $gt: 0 } 
    })
    .sort({ outstandingBalance: -1 })
    .limit(10)
    .select('name phone outstandingBalance creditLimit');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const activeIds = await Invoice.distinct('customerId', { 
        ...match, 
        invoiceDate: { $gte: sixMonthsAgo } 
    });

    const atRiskCustomers = await Customer.countDocuments({
        ...match,
        _id: { $nin: activeIds },
        type: 'business'
    });

    return { creditRisk, churnCount: atRiskCustomers };
};

exports.getLeaderboards = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const data = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        {
            $facet: {
                topCustomers: [
                    { $group: { _id: '$customerId', totalSpent: { $sum: '$grandTotal' }, transactions: { $sum: 1 } } },
                    { $sort: { totalSpent: -1 } },
                    { $limit: 5 },
                    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
                    { $unwind: '$customer' },
                    { $project: { name: '$customer.name', phone: '$customer.phone', totalSpent: 1, transactions: 1 } }
                ],
                topProducts: [
                    { $unwind: '$items' },
                    {
                        $group: {
                            _id: '$items.productId',
                            name: { $first: '$items.name' },
                            soldQty: { $sum: '$items.quantity' },
                            revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
                        }
                    },
                    { $sort: { soldQty: -1 } },
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

exports.getOperationalStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const data = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
        {
            $facet: {
                discounts: [
                    { $match: { status: { $ne: 'cancelled' } } },
                    { $group: { 
                        _id: null, 
                        totalDiscount: { $sum: '$totalDiscount' }, 
                        totalSales: { $sum: '$subTotal' } 
                      }
                    },
                    { $project: { 
                        discountRate: { 
                            $cond: [{ $eq: ['$totalSales', 0] }, 0, { $multiply: [{ $divide: ['$totalDiscount', '$totalSales'] }, 100] }]
                        },
                        totalDiscount: 1
                      }
                    }
                ],
                efficiency: [
                    {
                        $group: {
                            _id: null,
                            totalOrders: { $sum: 1 },
                            cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                            successfulRevenue: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$grandTotal', 0] } },
                            successfulCount: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } }
                        }
                    },
                    {
                        $project: {
                            cancellationRate: { $multiply: [{ $divide: ['$cancelledOrders', '$totalOrders'] }, 100] },
                            averageOrderValue: { 
                                $cond: [{ $eq: ['$successfulCount', 0] }, 0, { $divide: ['$successfulRevenue', '$successfulCount'] }]
                            }
                        }
                    }
                ],
                staffPerformance: [
                    { $match: { status: { $ne: 'cancelled' } } },
                    { $group: { _id: '$createdBy', revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
                    { $sort: { revenue: -1 } },
                    { $limit: 5 },
                    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
                    { $unwind: '$user' },
                    { $project: { name: '$user.name', revenue: 1, count: 1 } }
                ]
            }
        }
    ]);

    return {
        discountMetrics: data[0]?.discounts[0] || { totalDiscount: 0, discountRate: 0 },
        orderEfficiency: data[0]?.efficiency[0] || { cancellationRate: 0, averageOrderValue: 0 },
        topStaff: data[0]?.staffPerformance || []
    };
};

exports.getBranchComparisonStats = async (orgId, startDate, endDate, groupBy = 'revenue', limit = 10) => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    };

    const stats = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$branchId',
                revenue: { $sum: '$grandTotal' },
                invoiceCount: { $sum: 1 },
                avgBasketValue: { $avg: '$grandTotal' }
            }
        },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: '$branch' },
        {
            $project: {
                branchName: '$branch.name',
                revenue: 1,
                invoiceCount: 1,
                avgBasketValue: { $round: ['$avgBasketValue', 0] }
            }
        },
        { $sort: { [groupBy]: -1 } },
        { $limit: parseInt(limit) }
    ]);

    return stats;
};

exports.getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const data = await Invoice.aggregate([
        { 
            $match: { 
                ...match, 
                invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
                status: { $ne: 'cancelled' }
            } 
        },
        { $unwind: '$items' },
        {
            $lookup: {
                from: 'products',
                localField: 'items.productId',
                foreignField: '_id',
                as: 'product'
            }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                totalCOGS: { $sum: { $multiply: [{ $ifNull: ['$product.purchasePrice', 0] }, '$items.quantity'] } }
            }
        },
        {
            $project: {
                _id: 0,
                totalRevenue: 1,
                totalCOGS: 1,
                grossProfit: { $subtract: ['$totalRevenue', '$totalCOGS'] },
                marginPercent: {
                    $cond: [
                        { $eq: ['$totalRevenue', 0] },
                        0,
                        { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCOGS'] }, '$totalRevenue'] }, 100] }
                    ]
                }
            }
        }
    ]);

    return data[0] || { totalRevenue: 0, totalCOGS: 0, grossProfit: 0, marginPercent: 0 };
};

exports.getEmployeePerformance = async (orgId, branchId, startDate, endDate, minSales = 0, sortBy = 'revenue') => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    };
    if (branchId) match.branchId = toObjectId(branchId);

    return await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$createdBy',
                totalSales: { $sum: '$grandTotal' },
                invoiceCount: { $sum: 1 },
                totalDiscountGiven: { $sum: '$totalDiscount' }
            }
        },
        { $match: { totalSales: { $gte: parseFloat(minSales) } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        {
            $project: {
                name: '$user.name',
                email: '$user.email',
                totalSales: 1,
                invoiceCount: 1,
                totalDiscountGiven: 1,
                avgTicketSize: { $divide: ['$totalSales', '$invoiceCount'] }
            }
        },
        { $sort: { [sortBy]: -1 } }
    ]);
};

exports.getPeakHourAnalysis = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
        {
            $project: {
                dayOfWeek: { $dayOfWeek: '$invoiceDate' },
                hour: { $hour: '$invoiceDate' }
            }
        },
        {
            $group: {
                _id: { day: '$dayOfWeek', hour: '$hour' },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                day: '$_id.day',
                hour: '$_id.hour',
                count: 1,
                _id: 0
            }
        },
        { $sort: { day: 1, hour: 1 } }
    ]);
};

exports.getDeadStockAnalysis = async (orgId, branchId, daysThreshold = 90) => {
    const match = { organizationId: toObjectId(orgId) };
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysThreshold));

    const soldProductIds = await Invoice.distinct('items.productId', {
        ...match,
        invoiceDate: { $gte: cutoffDate }
    });

    return await Product.aggregate([
        { $match: { ...match, _id: { $nin: soldProductIds }, isActive: true } },
        { $unwind: '$inventory' },
        ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
        { $match: { 'inventory.quantity': { $gt: 0 } } },
        {
            $project: {
                name: 1,
                sku: 1,
                category: 1,
                quantity: '$inventory.quantity',
                value: { $multiply: ['$inventory.quantity', '$purchasePrice'] },
                daysInactive: { $literal: daysThreshold }
            }
        },
        { $sort: { value: -1 } }
    ]);
};

exports.getInventoryRunRate = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Get Sales Velocity
    const salesVelocity = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.productId',
                totalSold: { $sum: '$items.quantity' }
            }
        }
    ]);

    // Create Map: ProductID -> Daily Velocity
    const velocityMap = new Map();
    salesVelocity.forEach(item => {
        velocityMap.set(String(item._id), item.totalSold / 30);
    });

    // 2. Fetch Products with Inventory
    const productQuery = { organizationId: toObjectId(orgId), isActive: true };
    const products = await Product.find(productQuery).lean();

    const predictions = [];

    products.forEach(p => {
        let stock = 0;
        if (p.inventory) {
            if (branchId) {
                const bInv = p.inventory.find(inv => inv.branchId && String(inv.branchId) === String(branchId));
                stock = bInv ? bInv.quantity : 0;
            } else {
                stock = p.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
            }
        }

        const velocity = velocityMap.get(String(p._id)) || 0;

        if (velocity > 0 && stock > 0) {
            const daysLeft = stock / velocity;
            if (daysLeft <= 14) {
                predictions.push({
                    name: p.name,
                    currentStock: stock,
                    dailyVelocity: parseFloat(velocity.toFixed(2)),
                    daysUntilStockout: Math.round(daysLeft)
                });
            }
        }
    });

    return predictions.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
};

exports.getDebtorAging = async (orgId, branchId) => {
    const match = { 
        organizationId: toObjectId(orgId),
        paymentStatus: { $ne: 'paid' },
        status: { $ne: 'cancelled' },
        balanceAmount: { $gt: 0 }
    };
    if (branchId) match.branchId = toObjectId(branchId);

    const now = new Date();

    const aging = await Invoice.aggregate([
        { $match: match },
        {
            $project: {
                customerId: 1,
                invoiceNumber: 1,
                balanceAmount: 1,
                dueDate: { $ifNull: ['$dueDate', '$invoiceDate'] },
                daysOverdue: { 
                    $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24] 
                }
            }
        },
        {
            $bucket: {
                groupBy: "$daysOverdue",
                boundaries: [0, 31, 61, 91],
                default: "91+",
                output: {
                    totalAmount: { $sum: "$balanceAmount" },
                    invoices: { $push: { number: "$invoiceNumber", amount: "$balanceAmount", cust: "$customerId" } }
                }
            }
        }
    ]);

    const labels = { 0: '0-30 Days', 31: '31-60 Days', 61: '61-90 Days', '91+': '90+ Days' };
    return aging.map(a => ({
        range: labels[a._id] || a._id,
        amount: a.totalAmount,
        count: a.invoices.length
    }));
};

exports.getSecurityPulse = async (orgId, startDate, endDate) => {
    if (!AuditLog) return { recentEvents: [], riskyActions: 0 };

    const match = { 
        organizationId: toObjectId(orgId),
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };

    const logs = await AuditLog.find(match)
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('userId', 'name email');

    const riskCount = await AuditLog.countDocuments({
        ...match,
        action: { $in: ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE'] }
    });

    return { recentEvents: logs, riskyActions: riskCount };
};

exports.calculateLTV = async (orgId, branchId) => {
    const match = { 
        organizationId: toObjectId(orgId),
        status: { $ne: 'cancelled' }
    };

    if (branchId) match.branchId = toObjectId(branchId);

    const customerStats = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$customerId',
                totalSpent: { $sum: '$grandTotal' },
                transactionCount: { $sum: 1 },
                firstPurchase: { $min: '$invoiceDate' },
                lastPurchase: { $max: '$invoiceDate' },
                avgOrderValue: { $avg: '$grandTotal' }
            }
        },
        {
            $project: {
                totalSpent: 1,
                transactionCount: 1,
                avgOrderValue: { $round: ['$avgOrderValue', 2] },
                lifespanDays: {
                    $cond: [
                        { $eq: ['$firstPurchase', '$lastPurchase'] },
                        1,
                        {
                            $divide: [
                                { $subtract: ['$lastPurchase', '$firstPurchase'] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    ]
                }
            }
        },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
        { $unwind: '$customer' },
        {
            $project: {
                customerId: '$_id',
                name: '$customer.name',
                email: '$customer.email',
                totalSpent: 1,
                transactionCount: 1,
                avgOrderValue: 1,
                lifespanDays: { $round: ['$lifespanDays', 1] },
                ltv: '$totalSpent'
            }
        },
        { $sort: { ltv: -1 } },
        { $limit: 100 }
    ]);

    // Calculate LTV tiers
    const tieredCustomers = customerStats.map(customer => {
        let tier = 'Bronze';
        if (customer.ltv > 50000) tier = 'Platinum';
        else if (customer.ltv > 20000) tier = 'Gold';
        else if (customer.ltv > 5000) tier = 'Silver';

        return {
            ...customer,
            tier,
            valueScore: customer.ltv > 0 ? Math.min(100, (customer.ltv / 100000) * 100) : 0
        };
    });

    return {
        customers: tieredCustomers,
        summary: {
            totalLTV: tieredCustomers.reduce((sum, c) => sum + c.ltv, 0),
            avgLTV: tieredCustomers.reduce((sum, c) => sum + c.ltv, 0) / tieredCustomers.length,
            topCustomer: tieredCustomers[0]
        }
    };
};

exports.analyzeChurnRisk = async (orgId, thresholdDays = 90) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

    return await Customer.aggregate([
        { $match: { organizationId: toObjectId(orgId) } },
        {
            $lookup: {
                from: 'invoices',
                let: { custId: '$_id' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$customerId', '$$custId'] } } },
                    { $sort: { invoiceDate: -1 } },
                    { $limit: 1 }
                ],
                as: 'lastInvoice'
            }
        },
        { $unwind: { path: '$lastInvoice', preserveNullAndEmptyArrays: false } }, 
        {
            $project: {
                name: 1,
                phone: 1,
                lastPurchaseDate: '$lastInvoice.invoiceDate',
                daysSinceLastPurchase: {
                    $divide: [{ $subtract: [new Date(), '$lastInvoice.invoiceDate'] }, 1000 * 60 * 60 * 24]
                }
            }
        },
        { $match: { daysSinceLastPurchase: { $gte: thresholdDays } } }, 
        { $sort: { daysSinceLastPurchase: -1 } }
    ]);
};

exports.performBasketAnalysis = async (orgId, minSupport = 2) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const data = await Invoice.aggregate([
        { $match: { 
            organizationId: toObjectId(orgId), 
            invoiceDate: { $gte: sixMonthsAgo },
            status: { $nin: ['cancelled', 'draft'] } 
        }},
        { $project: { items: "$items.productId" } }
    ]);

    const pairs = new Map();

    data.forEach(inv => {
        const uniqueItems = [...new Set(inv.items.map(String))].sort(); 
        for (let i = 0; i < uniqueItems.length; i++) {
            for (let j = i + 1; j < uniqueItems.length; j++) {
                const pair = `${uniqueItems[i]}|${uniqueItems[j]}`;
                pairs.set(pair, (pairs.get(pair) || 0) + 1);
            }
        }
    });

    const results = [];
    for (const [pair, count] of pairs) {
        if (count >= minSupport) {
            const [p1, p2] = pair.split('|');
            results.push({ p1, p2, count });
        }
    }

    const topPairs = results.sort((a, b) => b.count - a.count).slice(0, 10);

    // Enrich with names
    const productIds = [...new Set(topPairs.flatMap(p => [p.p1, p.p2]))];
    const products = await Product.find({ _id: { $in: productIds } }).select('name').lean();
    const productMap = products.reduce((acc, p) => ({ ...acc, [String(p._id)]: p.name }), {});

    return topPairs.map(p => ({
        productA: productMap[p.p1] || 'Unknown',
        productB: productMap[p.p2] || 'Unknown',
        timesBoughtTogether: p.count
    }));
};

exports.analyzePaymentHabits = async (orgId, branchId) => {
    const match = { 
        organizationId: toObjectId(orgId), 
        referenceType: 'payment',
        paymentId: { $ne: null } 
    };
    if (branchId) match.branchId = toObjectId(branchId);

    return await AccountEntry.aggregate([
        { $match: match },
        {
            $lookup: {
                from: 'invoices',
                localField: 'invoiceId',
                foreignField: '_id',
                as: 'invoice'
            }
        },
        { $unwind: "$invoice" },
        {
            $project: {
                customerId: 1,
                paymentDate: "$date",
                invoiceDate: "$invoice.invoiceDate",
                amount: "$credit",
                daysToPay: {
                    $divide: [{ $subtract: ["$date", "$invoice.invoiceDate"] }, 1000 * 60 * 60 * 24]
                }
            }
        },
        {
            $group: {
                _id: "$customerId",
                avgDaysToPay: { $avg: "$daysToPay" },
                totalPaid: { $sum: "$amount" },
                paymentsCount: { $sum: 1 }
            }
        },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
        { $unwind: "$customer" },
        {
            $project: {
                customer: "$customer.name",
                avgDaysToPay: { $round: ["$avgDaysToPay", 1] },
                rating: {
                    $switch: {
                        branches: [
                            { case: { $lte: ["$avgDaysToPay", 7] }, then: "Excellent" },
                            { case: { $lte: ["$avgDaysToPay", 30] }, then: "Good" },
                            { case: { $lte: ["$avgDaysToPay", 60] }, then: "Fair" }
                        ],
                        default: "Poor"
                    }
                }
            }
        },
        { $sort: { avgDaysToPay: 1 } }
    ]);
};

exports.getExportData = async (orgId, type, startDate, endDate, columns = null) => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };

    if (type === 'sales') {
        const invoices = await Invoice.find(match)
            .select('invoiceNumber invoiceDate grandTotal paymentStatus customerId branchId')
            .populate('customerId', 'name')
            .populate('branchId', 'name')
            .lean();

        return invoices.map(inv => ({
            invoiceNumber: inv.invoiceNumber,
            date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
            customerName: inv.customerId?.name || 'Walk-in',
            branch: inv.branchId?.name || 'Main',
            amount: inv.grandTotal,
            status: inv.paymentStatus
        }));
    }

    if (type === 'inventory') {
        const products = await Product.find({ organizationId: toObjectId(orgId) }).lean();
        let rows = [];
        products.forEach(p => {
            if (p.inventory?.length > 0) {
                p.inventory.forEach(inv => {
                    rows.push({
                        name: p.name,
                        sku: p.sku,
                        stock: inv.quantity,
                        value: inv.quantity * p.purchasePrice,
                        reorderLevel: inv.reorderLevel
                    });
                });
            } else {
                rows.push({ name: p.name, sku: p.sku, stock: 0, value: 0, reorderLevel: 0 });
            }
        });
        return rows;
    }
    return [];
};

exports.generateForecast = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlySales = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: sixMonthsAgo } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
                total: { $sum: "$grandTotal" }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    if (monthlySales.length < 2) return { revenue: 0, trend: 'stable' };

    let xSum = 0, ySum = 0, xySum = 0, x2Sum = 0;
    const n = monthlySales.length;

    monthlySales.forEach((month, index) => {
        const x = index + 1;
        const y = month.total;
        xSum += x;
        ySum += y;
        xySum += x * y;
        x2Sum += x * x;
    });

    const denominator = n * x2Sum - xSum * xSum;
    if (denominator === 0) return { revenue: monthlySales[n-1].total, trend: 'stable' };

    const slope = (n * xySum - xSum * ySum) / denominator;
    const intercept = (ySum - slope * xSum) / n;

    const nextMonthRevenue = Math.round(slope * (n + 1) + intercept);
    const trend = slope > 0 ? 'up' : (slope < 0 ? 'down' : 'stable');

    return { revenue: Math.max(0, nextMonthRevenue), trend, historical: monthlySales };
};

exports.getCriticalAlerts = async (orgId, branchId) => {
    const [inv, risk] = await Promise.all([
        this.getInventoryAnalytics(orgId, branchId),
        this.getCustomerRiskStats(orgId, branchId)
    ]);

    return {
        lowStockCount: inv.lowStockAlerts.length,
        highRiskDebtCount: risk.creditRisk.length,
        itemsToReorder: inv.lowStockAlerts.map(i => i.name)
    };
};

exports.getCohortAnalysis = async (orgId, monthsBack = 6) => {
    const match = { 
        organizationId: toObjectId(orgId),
        status: { $ne: 'cancelled' }
    };

    const start = new Date();
    start.setMonth(start.getMonth() - monthsBack);
    start.setDate(1); 

    return await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start } } },
        {
            $group: {
                _id: "$customerId",
                firstPurchase: { $min: "$invoiceDate" },
                allPurchases: { $push: "$invoiceDate" }
            }
        },
        {
            $project: {
                cohortMonth: { $dateToString: { format: "%Y-%m", date: "$firstPurchase" } },
                activityMonths: {
                    $map: {
                        input: "$allPurchases",
                        as: "date",
                        in: { $dateToString: { format: "%Y-%m", date: "$$date" } }
                    }
                }
            }
        },
        { $unwind: "$activityMonths" },
        { $group: { _id: { cohort: "$cohortMonth", activity: "$activityMonths" }, count: { $addToSet: "$_id" } } },
        { $project: { cohort: "$_id.cohort", activity: "$_id.activity", count: { $size: "$count" } } },
        { $sort: { cohort: 1, activity: 1 } }
    ]);
};

exports.getCustomerRFMAnalysis = async (orgId) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };

    const rfmRaw = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: "$customerId",
                lastPurchaseDate: { $max: "$invoiceDate" },
                frequency: { $sum: 1 },
                monetary: { $sum: "$grandTotal" }
            }
        }
    ]);

    const now = new Date();
    const scored = rfmRaw.map(c => {
        const daysSinceLast = Math.floor((now - c.lastPurchaseDate) / (1000 * 60 * 60 * 24));

        let rScore = daysSinceLast < 30 ? 3 : (daysSinceLast < 90 ? 2 : 1);
        let fScore = c.frequency > 10 ? 3 : (c.frequency > 3 ? 2 : 1);
        let mScore = c.monetary > 50000 ? 3 : (c.monetary > 10000 ? 2 : 1);

        let segment = 'Standard';
        if (rScore === 3 && fScore === 3 && mScore === 3) segment = 'Champion';
        else if (rScore === 1 && mScore === 3) segment = 'At Risk';
        else if (rScore === 3 && fScore === 1) segment = 'New Customer';
        else if (fScore === 3) segment = 'Loyal';

        return { ...c, segment };
    });

    const segments = { Champion: 0, 'At Risk': 0, Loyal: 0, 'New Customer': 0, Standard: 0 };
    scored.forEach(s => {
        if (segments[s.segment] !== undefined) segments[s.segment]++;
        else segments.Standard++;
    });

    return segments;
};

/* ==========================================================================
   4. NEW ENHANCEMENTS
   ========================================================================== */

// Get new customers count
exports.getNewCustomersCount = async (orgId, branchId, start, end) => {
    const match = { 
        organizationId: toObjectId(orgId),
        createdAt: { $gte: start, $lte: end }
    };

    return Customer.countDocuments(match);
};

// Calculate inventory health score
exports.calculateInventoryHealthScore = (analytics, performance, deadStock) => {
    let score = 100;

    // Deduct for low stock items
    const lowStockPenalty = Math.min(analytics.lowStockAlerts.length * 2, 30);
    score -= lowStockPenalty;

    // Deduct for dead stock
    const deadStockPenalty = Math.min(deadStock.length, 20);
    score -= deadStockPenalty;

    // Bonus for good turnover
    if (analytics.turnover?.turnover > 4) score += 10;

    // Bonus for high-margin products
    const highMarginCount = performance.highMargin?.filter(p => p.marginPercent > 40).length || 0;
    if (highMarginCount > 5) score += 10;

    return Math.max(0, Math.min(100, score));
};

// Staff productivity score
exports.calculateProductivityScore = (staff) => {
    const avgOrderValue = staff.avgTicketSize || 0;
    const orderCount = staff.invoiceCount || 0;

    // Simple productivity calculation
    return Math.min(100, (avgOrderValue * orderCount) / 1000);
};

// Generate insights
exports.generateInsights = (kpi, inventory, leaders) => {
    const insights = [];

    // Revenue insights
    if (kpi.totalRevenue.growth > 20) {
        insights.push({
            type: 'positive',
            category: 'revenue',
            title: 'Strong Revenue Growth',
            message: `Revenue growing at ${kpi.totalRevenue.growth}% - consider expanding successful products`,
            priority: 'medium'
        });
    } else if (kpi.totalRevenue.growth < -10) {
        insights.push({
            type: 'warning',
            category: 'revenue',
            title: 'Revenue Decline Detected',
            message: `Revenue down by ${Math.abs(kpi.totalRevenue.growth)}% - investigate market changes`,
            priority: 'high'
        });
    }

    // Inventory insights
    if (inventory.lowStockAlerts?.length > 5) {
        insights.push({
            type: 'warning',
            category: 'inventory',
            title: 'Multiple Stock Shortages',
            message: `${inventory.lowStockAlerts.length} items need immediate restocking`,
            priority: 'high'
        });
    }

    // Customer insights from leaders
    if (leaders.topCustomers && leaders.topCustomers.length > 0) {
        const topCustomer = leaders.topCustomers[0];
        insights.push({
            type: 'info',
            category: 'customer',
            title: 'Top Performing Customer',
            message: `${topCustomer.name} spent ${topCustomer.totalSpent} - consider loyalty program`,
            priority: 'low'
        });
    }

    // Profit margin insights
    if (kpi.netProfit.margin < 10) {
        insights.push({
            type: 'warning',
            category: 'profit',
            title: 'Low Profit Margin',
            message: `Profit margin at ${kpi.netProfit.margin}% - review pricing and costs`,
            priority: 'high'
        });
    }

    return {
        insights,
        generatedAt: new Date().toISOString(),
        count: insights.length
    };
};

// Generate financial recommendations
exports.generateFinancialRecommendations = (kpi, profitability) => {
    const recommendations = [];

    // Cash flow recommendations
    if (kpi.outstanding.receivables > kpi.totalRevenue.value * 0.3) {
        recommendations.push({
            action: 'Improve Receivables Collection',
            reason: 'High outstanding receivables affecting cash flow',
            impact: 'high',
            timeframe: 'short'
        });
    }

    // Profitability recommendations
    if (profitability.marginPercent < 15) {
        recommendations.push({
            action: 'Increase Profit Margins',
            reason: `Current margin of ${profitability.marginPercent}% is below target`,
            impact: 'high',
            timeframe: 'medium'
        });
    }

    return {
        recommendations,
        generatedAt: new Date().toISOString()
    };
};

// Calculate inventory turnover
exports.calculateInventoryTurnover = async (orgId, branchId) => {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: ninetyDaysAgo },
        status: { $ne: 'cancelled' }
    };
    if (branchId) match.branchId = toObjectId(branchId);

    const salesData = await Invoice.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.productId',
                totalSold: { $sum: '$items.quantity' }
            }
        }
    ]);

    const productIds = salesData.map(item => item._id);
    const products = await Product.find({ 
        _id: { $in: productIds },
        organizationId: toObjectId(orgId)
    }).select('purchasePrice inventory');

    let totalCOGS = 0;
    let totalInventoryValue = 0;

    salesData.forEach(sale => {
        const product = products.find(p => p._id.toString() === sale._id.toString());
        if (product) {
            totalCOGS += sale.totalSold * product.purchasePrice;

            // Calculate inventory value for this product
            let productStock = 0;
            if (product.inventory) {
                if (branchId) {
                    const branchInv = product.inventory.find(
                        inv => inv.branchId && inv.branchId.toString() === branchId
                    );
                    productStock = branchInv ? branchInv.quantity : 0;
                } else {
                    productStock = product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
                }
            }
            totalInventoryValue += productStock * product.purchasePrice;
        }
    });

    const turnover = totalInventoryValue > 0 ? (totalCOGS / totalInventoryValue) * 4 : 0;

    return {
        turnover: Number(turnover.toFixed(2)),
        cogs: totalCOGS,
        avgInventoryValue: totalInventoryValue,
        interpretation: turnover >= 4 ? 'Fast' : turnover >= 2 ? 'Moderate' : 'Slow'
    };
};

// Get export configuration
exports.getExportConfig = (type, requestedColumns = 'all') => {
    const configs = {
        sales: {
            defaultColumns: ['invoiceNumber', 'date', 'customerName', 'amount', 'status', 'branch'],
            columnLabels: {
                invoiceNumber: 'Invoice #',
                date: 'Date',
                customerName: 'Customer',
                amount: 'Amount',
                status: 'Status',
                branch: 'Branch'
            }
        },
        inventory: {
            defaultColumns: ['name', 'sku', 'stock', 'value', 'reorderLevel', 'category'],
            columnLabels: {
                name: 'Product Name',
                sku: 'SKU',
                stock: 'Current Stock',
                value: 'Inventory Value',
                reorderLevel: 'Reorder Level',
                category: 'Category'
            }
        },
        customers: {
            defaultColumns: ['name', 'email', 'totalSpent', 'lastPurchase', 'segment', 'ltv'],
            columnLabels: {
                name: 'Customer Name',
                email: 'Email',
                totalSpent: 'Total Spent',
                lastPurchase: 'Last Purchase',
                segment: 'Segment',
                ltv: 'Lifetime Value'
            }
        }
    };

    const config = configs[type] || configs.sales;

    // Filter columns if requested
    if (requestedColumns !== 'all') {
        const columns = requestedColumns.split(',');
        config.defaultColumns = config.defaultColumns.filter(col => 
            columns.includes(col)
        );
    }

    return config;
};

// Convert data to CSV
exports.convertToCSV = (data, config) => {
    if (!data || data.length === 0) return '';

    const headers = config.defaultColumns.map(col => 
        config.columnLabels[col] || col
    );

    const rows = data.map(item => {
        return config.defaultColumns.map(col => {
            let value = item[col] || '';
            return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
};

// Generate advanced forecast
exports.generateAdvancedForecast = async (orgId, branchId, periods = 3, confidence = 0.95) => {
    const forecast = await this.generateForecast(orgId, branchId);

    return {
        forecast: [{
            period: 'Next Month',
            predictedRevenue: forecast.revenue,
            lowerBound: Math.max(0, Math.round(forecast.revenue * 0.8)),
            upperBound: Math.round(forecast.revenue * 1.2),
            confidence: Math.round(confidence * 100),
            growth: forecast.trend === 'up' ? 10 : forecast.trend === 'down' ? -10 : 0
        }],
        accuracy: 'medium',
        historicalDataPoints: forecast.historical?.length || 0,
        model: 'linear_regression'
    };
};

/* ==========================================================================
   5. STUB FUNCTIONS FOR NEW ENDPOINTS
   ========================================================================== */

// Stub functions that can be implemented later
exports.generateCashFlowProjection = async (orgId, branchId, days) => {
    // Stub - implement cash flow projection logic
    return {
        projectedCash: 100000,
        dailyProjections: Array.from({ length: days }, (_, i) => ({
            date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            projectedInflow: 5000,
            projectedOutflow: 3000,
            netCash: 2000
        }))
    };
};

exports.assessCashHealth = (currentFlow, projections) => {
    // Stub - implement cash health assessment
    return {
        score: 75,
        status: 'Healthy',
        risk: 'Low'
    };
};

exports.calculateTargetAchievement = (staff) => {
    // Stub - implement target achievement calculation
    return 85; // percentage
};

exports.getStaffTrend = (staffId, orgId, branchId) => {
    // Stub - implement staff trend analysis
    return 'up';
};

exports.calculateEfficiencyMetrics = async (orgId, branchId, startDate, endDate) => {
    // Stub - implement efficiency metrics
    return {
        laborEfficiency: 0.85,
        resourceUtilization: 0.72,
        operationalCostRatio: 0.15
    };
};

exports.generateStaffingRecommendations = (peakHours) => {
    // Stub - implement staffing recommendations
    return [
        'Increase staffing on Monday mornings',
        'Reduce staff on Thursday afternoons'
    ];
};

exports.calculateOperationalKPIs = (metrics) => {
    // Stub - implement operational KPIs
    return {
        orderFulfillmentRate: 0.95,
        customerSatisfaction: 4.2,
        returnRate: 0.02
    };
};

exports.generateInventoryRecommendations = (lowStock, deadStock, predictions) => {
    // Stub - implement inventory recommendations
    return [
        'Reorder 50 units of Product A',
        'Create promotion for slow-moving items'
    ];
};

exports.calculateForecastAccuracy = async (orgId, branchId) => {
    // Stub - implement forecast accuracy calculation
    return {
        mape: 12.5, // Mean Absolute Percentage Error
        accuracy: 'Good'
    };
};

exports.getBestPerformingProducts = async (orgId, branchId, limit) => {
    // Stub - implement best performing products
    return this.getProductPerformanceStats(orgId, branchId)
        .then(data => data.highMargin.slice(0, limit));
};

exports.generateSalesRecommendations = (forecast) => {
    // Stub - implement sales recommendations
    return [
        'Increase marketing budget by 15%',
        'Launch new product line'
    ];
};

exports.generateCustomerInsights = (segments, churnRisk, ltv) => {
    // Stub - implement customer insights
    return {
        acquisitionCost: 150,
        retentionRate: 0.65,
        referralRate: 0.12
    };
};

exports.getRealTimeAlerts = async (orgId, branchId, severity, limit) => {
    // Stub - implement real-time alerts
    const criticalAlerts = await this.getCriticalAlerts(orgId, branchId);

    return [{
        id: 'alert-1',
        title: 'Low Stock Alert',
        message: `${criticalAlerts.lowStockCount} items need restocking`,
        severity: 'warning',
        category: 'inventory',
        timestamp: new Date().toISOString(),
        actionable: true
    }];
};

exports.convertToExcel = async (data, config) => {
    // Stub - implement Excel conversion
    // For now, return CSV as buffer
    const csv = this.convertToCSV(data, config);
    return Buffer.from(csv, 'utf-8');
};

exports.convertToPDF = async (data, config) => {
    // Stub - implement PDF conversion
    const csv = this.convertToCSV(data, config);
    return Buffer.from(csv, 'utf-8');
};

exports.validateAndParseQuery = (query) => {
    // Stub - implement query validation
    return query;
};

exports.executeCustomQuery = async (orgId, query, parameters, limit) => {
    // Stub - implement custom query execution
    return {
        data: [],
        total: 0,
        executionTime: 0,
        metadata: { query, parameters }
    };
};

exports.getPerformanceMetrics = async (orgId, hours) => {
    // Stub - implement performance metrics
    return {
        avgResponseTime: 250,
        errorRate: 0.02,
        requestCount: 1500,
        cacheHitRate: 0.65
    };
};

exports.generatePerformanceRecommendations = (performanceStats) => {
    // Stub - implement performance recommendations
    return [
        'Consider adding indexes to frequently queried collections',
        'Increase cache TTL for slow-changing data'
    ];
};

exports.performDataHealthCheck = async (orgId) => {
    // Stub - implement data health check
    return [
        {
            check: 'Invoice data consistency',
            status: 'healthy',
            details: 'All invoices have valid customer references'
        },
        {
            check: 'Product inventory sync',
            status: 'warning',
            details: '5 products have negative inventory'
        }
    ];
};

exports.calculateDataHealthScore = (healthCheck) => {
    // Stub - implement data health score calculation
    const healthyChecks = healthCheck.filter(item => item.status === 'healthy').length;
    return Math.round((healthyChecks / healthCheck.length) * 100);
};

module.exports = exports;
// const mongoose = require('mongoose');
// const Redis = require('ioredis');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Product = require('../models/productModel');
// const Customer = require('../models/customerModel');
// const User = require('../models/userModel');
// const Branch = require('../models/branchModel');
// const { performance } = require('perf_hooks');

// // Redis Cache Setup
// const redis = new Redis({
//     host: process.env.REDIS_HOST || 'localhost',
//     port: process.env.REDIS_PORT || 6379,
//     retryStrategy: (times) => Math.min(times * 50, 2000)
// });

// // Helper Functions
// const toObjectId = (id) => id ? new mongoose.Types.ObjectId(id) : null;

// const calculateGrowth = (current, previous) => {
//     if (previous === 0) return current === 0 ? 0 : 100;
//     return Number(((current - previous) / previous * 100).toFixed(1));
// };

// const calculatePercentage = (part, total) => {
//     if (total === 0) return 0;
//     return Number((part / total * 100).toFixed(1));
// };

// /* ==========================================================================
//    1. CACHE MANAGEMENT
//    ========================================================================== */

// exports.cacheData = async (key, data, ttl = 300) => {
//     try {
//         await redis.setex(
//             key, 
//             ttl, 
//             JSON.stringify({ data, cachedAt: Date.now() })
//         );
//         return true;
//     } catch (error) {
//         console.error('Cache set error:', error);
//         return false;
//     }
// };

// exports.getCachedData = async (key) => {
//     try {
//         const cached = await redis.get(key);
//         if (cached) {
//             const parsed = JSON.parse(cached);
//             // Check if cache is still valid
//             const age = Date.now() - parsed.cachedAt;
//             if (age < 300000) { // 5 minutes
//                 return parsed.data;
//             }
//         }
//         return null;
//     } catch (error) {
//         console.error('Cache get error:', error);
//         return null;
//     }
// };

// exports.clearCache = async (pattern) => {
//     try {
//         const keys = await redis.keys(pattern);
//         if (keys.length > 0) {
//             await redis.del(...keys);
//         }
//         return keys.length;
//     } catch (error) {
//         console.error('Cache clear error:', error);
//         return 0;
//     }
// };

// /* ==========================================================================
//    2. SMART EXECUTIVE DASHBOARD
//    ========================================================================== */

// exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
//     const startTime = performance.now();
//     const match = { 
//         organizationId: toObjectId(orgId),
//         status: { $ne: 'cancelled' }
//     };

//     if (branchId) match.branchId = toObjectId(branchId);

//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     const duration = end - start;
//     const prevStart = new Date(start - duration);
//     const prevEnd = new Date(start);

//     // Parallel execution of key metrics
//     const [
//         salesStats,
//         purchaseStats,
//         customerStats,
//         productStats
//     ] = await Promise.all([
//         // Sales metrics
//         Invoice.aggregate([
//             {
//                 $facet: {
//                     current: [
//                         { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
//                         { 
//                             $group: { 
//                                 _id: null, 
//                                 revenue: { $sum: '$grandTotal' }, 
//                                 count: { $sum: 1 }, 
//                                 due: { $sum: '$balanceAmount' },
//                                 avgTicket: { $avg: '$grandTotal' }
//                             } 
//                         }
//                     ],
//                     previous: [
//                         { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd } } },
//                         { $group: { _id: null, revenue: { $sum: '$grandTotal' } } }
//                     ],
//                     today: [
//                         { 
//                             $match: { 
//                                 ...match, 
//                                 invoiceDate: { 
//                                     $gte: new Date().setHours(0,0,0,0), 
//                                     $lte: new Date().setHours(23,59,59,999) 
//                                 } 
//                             } 
//                         },
//                         { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
//                     ]
//                 }
//             }
//         ]),

//         // Purchase metrics
//         Purchase.aggregate([
//             {
//                 $facet: {
//                     current: [
//                         { $match: { ...match, purchaseDate: { $gte: start, $lte: end } } },
//                         { 
//                             $group: { 
//                                 _id: null, 
//                                 expense: { $sum: '$grandTotal' }, 
//                                 count: { $sum: 1 }, 
//                                 due: { $sum: '$balanceAmount' }
//                             } 
//                         }
//                     ],
//                     previous: [
//                         { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd } } },
//                         { $group: { _id: null, expense: { $sum: '$grandTotal' } } }
//                     ]
//                 }
//             }
//         ]),

//         // Customer metrics
//         Invoice.aggregate([
//             { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
//             { $group: { _id: '$customerId' } },
//             { $count: 'uniqueCustomers' }
//         ]),

//         // Product metrics
//         Invoice.aggregate([
//             { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
//             { $unwind: '$items' },
//             { 
//                 $group: { 
//                     _id: null,
//                     totalProductsSold: { $sum: '$items.quantity' },
//                     uniqueProducts: { $addToSet: '$items.productId' }
//                 } 
//             },
//             { $project: { 
//                 totalProductsSold: 1,
//                 uniqueProductCount: { $size: '$uniqueProducts' }
//             } }
//         ])
//     ]);

//     // Process results
//     const curSales = salesStats[0]?.current?.[0] || { revenue: 0, count: 0, due: 0, avgTicket: 0 };
//     const prevSales = salesStats[0]?.previous?.[0] || { revenue: 0 };
//     const todaySales = salesStats[0]?.today?.[0] || { revenue: 0, count: 0 };

//     const curPurch = purchaseStats[0]?.current?.[0] || { expense: 0, count: 0, due: 0 };
//     const prevPurch = purchaseStats[0]?.previous?.[0] || { expense: 0 };

//     const uniqueCustomers = customerStats[0]?.uniqueCustomers || 0;
//     const productMetrics = productStats[0] || { totalProductsSold: 0, uniqueProductCount: 0 };

//     const netProfit = curSales.revenue - curPurch.expense;
//     const prevNetProfit = prevSales.revenue - prevPurch.expense;

//     const executionTime = performance.now() - startTime;

//     return {
//         revenue: {
//             value: curSales.revenue,
//             count: curSales.count,
//             growth: calculateGrowth(curSales.revenue, prevSales.revenue),
//             avgTicket: Number(curSales.avgTicket.toFixed(2)),
//             today: todaySales.revenue
//         },
//         expenses: {
//             value: curPurch.expense,
//             count: curPurch.count,
//             growth: calculateGrowth(curPurch.expense, prevPurch.expense)
//         },
//         profit: {
//             value: netProfit,
//             growth: calculateGrowth(netProfit, prevNetProfit),
//             margin: calculatePercentage(netProfit, curSales.revenue)
//         },
//         customers: {
//             active: uniqueCustomers,
//             new: await this.getNewCustomersCount(orgId, branchId, start, end)
//         },
//         products: {
//             sold: productMetrics.totalProductsSold,
//             unique: productMetrics.uniqueProductCount
//         },
//         outstanding: {
//             receivables: curSales.due,
//             payables: curPurch.due
//         },
//         performance: {
//             executionTime: `${executionTime.toFixed(2)}ms`,
//             dataPoints: curSales.count + curPurch.count
//         }
//     };
// };

// exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'auto') => {
//     const match = { 
//         organizationId: toObjectId(orgId),
//         status: { $ne: 'cancelled' }
//     };

//     if (branchId) match.branchId = toObjectId(branchId);

//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     // Auto-determine interval based on date range
//     const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
//     let dateFormat;

//     if (interval === 'auto') {
//         if (daysDiff > 365) dateFormat = '%Y';
//         else if (daysDiff > 90) dateFormat = '%Y-%m';
//         else if (daysDiff > 30) dateFormat = '%Y-%W';
//         else dateFormat = '%Y-%m-%d';
//     } else {
//         switch (interval) {
//             case 'year': dateFormat = '%Y'; break;
//             case 'month': dateFormat = '%Y-%m'; break;
//             case 'week': dateFormat = '%Y-%W'; break;
//             case 'day': default: dateFormat = '%Y-%m-%d';
//         }
//     }

//     const timeline = await Invoice.aggregate([
//         { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
//         { 
//             $project: { 
//                 date: '$invoiceDate', 
//                 amount: '$grandTotal', 
//                 type: 'income',
//                 profit: { 
//                     $subtract: [
//                         '$grandTotal', 
//                         { $ifNull: ['$totalCost', 0] }
//                     ] 
//                 }
//             } 
//         },
//         {
//             $unionWith: {
//                 coll: 'purchases',
//                 pipeline: [
//                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end } } },
//                     { $project: { date: '$purchaseDate', amount: '$grandTotal', type: 'expense' } }
//                 ]
//             }
//         },
//         {
//             $group: {
//                 _id: { $dateToString: { format: dateFormat, date: '$date' } },
//                 income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
//                 expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
//                 profit: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$profit', 0] } }
//             }
//         },
//         { $sort: { _id: 1 } },
//         { 
//             $project: { 
//                 date: '$_id', 
//                 income: 1, 
//                 expense: 1, 
//                 profit: 1,
//                 margin: { 
//                     $cond: [
//                         { $eq: ['$income', 0] },
//                         0,
//                         { $multiply: [{ $divide: ['$profit', '$income'] }, 100] }
//                     ]
//                 },
//                 _id: 0 
//             } 
//         }
//     ]);

//     // Calculate cumulative values
//     let cumulativeIncome = 0;
//     let cumulativeExpense = 0;

//     const enhancedTimeline = timeline.map(item => {
//         cumulativeIncome += item.income;
//         cumulativeExpense += item.expense;

//         return {
//             ...item,
//             cumulativeIncome,
//             cumulativeExpense,
//             netCashFlow: cumulativeIncome - cumulativeExpense
//         };
//     });

//     return {
//         timeline: enhancedTimeline,
//         summary: {
//             totalIncome: cumulativeIncome,
//             totalExpense: cumulativeExpense,
//             totalProfit: cumulativeIncome - cumulativeExpense,
//             avgMargin: timeline.length > 0 ? 
//                 timeline.reduce((sum, item) => sum + item.margin, 0) / timeline.length : 0
//         },
//         interval: dateFormat,
//         period: { start, end, days: daysDiff }
//     };
// };

// /* ==========================================================================
//    3. ADVANCED INVENTORY ANALYTICS
//    ========================================================================== */

// exports.getInventoryAnalytics = async (orgId, branchId) => {
//     const match = { organizationId: toObjectId(orgId), isActive: true };

//     // Execute parallel queries for different inventory metrics
//     const [
//         lowStock,
//         valuation,
//         turnover,
//         categoryStats
//     ] = await Promise.all([
//         // Low stock alerts
//         Product.aggregate([
//             { $match: match },
//             { $unwind: '$inventory' },
//             ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
//             {
//                 $project: {
//                     name: 1,
//                     sku: 1,
//                     currentStock: '$inventory.quantity',
//                     reorderLevel: '$inventory.reorderLevel',
//                     branchId: '$inventory.branchId',
//                     category: 1,
//                     urgency: {
//                         $cond: [
//                             { $lte: ['$inventory.quantity', { $multiply: ['$inventory.reorderLevel', 0.5] }] },
//                             'critical',
//                             { $cond: [
//                                 { $lte: ['$inventory.quantity', '$inventory.reorderLevel'] },
//                                 'warning',
//                                 'normal'
//                             ]}
//                         ]
//                     }
//                 }
//             },
//             { $match: { urgency: { $in: ['critical', 'warning'] } } },
//             { $sort: { urgency: 1, currentStock: 1 } },
//             { $limit: 20 },
//             { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
//             { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
//             { 
//                 $project: { 
//                     name: 1, 
//                     sku: 1, 
//                     currentStock: 1, 
//                     reorderLevel: 1, 
//                     branchName: '$branch.name',
//                     urgency: 1,
//                     daysCover: {
//                         $cond: [
//                             { $gt: ['$currentStock', 0] },
//                             { $divide: ['$currentStock', 10] }, // Simplified - replace with actual daily sales
//                             0
//                         ]
//                     }
//                 } 
//             }
//         ]),

//         // Inventory valuation
//         Product.aggregate([
//             { $match: match },
//             { $unwind: '$inventory' },
//             ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
//             {
//                 $group: {
//                     _id: null,
//                     totalValue: { $sum: { $multiply: ['$inventory.quantity', '$purchasePrice'] } },
//                     totalItems: { $sum: '$inventory.quantity' },
//                     productCount: { $sum: 1 },
//                     avgValuePerItem: { $avg: '$purchasePrice' }
//                 }
//             }
//         ]),

//         // Stock turnover (simplified)
//         this.calculateInventoryTurnover(orgId, branchId),

//         // Category statistics
//         Product.aggregate([
//             { $match: match },
//             { $unwind: '$inventory' },
//             ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
//             {
//                 $group: {
//                     _id: '$category',
//                     totalValue: { $sum: { $multiply: ['$inventory.quantity', '$purchasePrice'] } },
//                     totalItems: { $sum: '$inventory.quantity' },
//                     productCount: { $sum: 1 }
//                 }
//             },
//             { $sort: { totalValue: -1 } },
//             { $limit: 10 }
//         ])
//     ]);

//     const valuationResult = valuation[0] || { 
//         totalValue: 0, 
//         totalItems: 0, 
//         productCount: 0, 
//         avgValuePerItem: 0 
//     };

//     return {
//         lowStockAlerts: lowStock,
//         inventoryValuation: valuationResult,
//         turnover: turnover,
//         categoryBreakdown: categoryStats,
//         summary: {
//             totalAlerts: lowStock.length,
//             criticalAlerts: lowStock.filter(item => item.urgency === 'critical').length,
//             valuation: valuationResult.totalValue,
//             avgStockValue: valuationResult.avgValuePerItem
//         }
//     };
// };

// exports.calculateInventoryTurnover = async (orgId, branchId) => {
//     const ninetyDaysAgo = new Date();
//     ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

//     const match = { 
//         organizationId: toObjectId(orgId),
//         invoiceDate: { $gte: ninetyDaysAgo },
//         status: { $ne: 'cancelled' }
//     };
//     if (branchId) match.branchId = toObjectId(branchId);

//     const salesData = await Invoice.aggregate([
//         { $match: match },
//         { $unwind: '$items' },
//         {
//             $group: {
//                 _id: '$items.productId',
//                 totalSold: { $sum: '$items.quantity' },
//                 revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
//             }
//         }
//     ]);

//     const productIds = salesData.map(item => item._id);
//     const products = await Product.find({ 
//         _id: { $in: productIds },
//         organizationId: toObjectId(orgId)
//     }).select('purchasePrice inventory');

//     let totalCOGS = 0;
//     let totalInventoryValue = 0;

//     salesData.forEach(sale => {
//         const product = products.find(p => p._id.toString() === sale._id.toString());
//         if (product) {
//             totalCOGS += sale.totalSold * product.purchasePrice;

//             // Calculate inventory value for this product
//             let productStock = 0;
//             if (product.inventory) {
//                 if (branchId) {
//                     const branchInv = product.inventory.find(
//                         inv => inv.branchId.toString() === branchId
//                     );
//                     productStock = branchInv ? branchInv.quantity : 0;
//                 } else {
//                     productStock = product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
//                 }
//             }
//             totalInventoryValue += productStock * product.purchasePrice;
//         }
//     });

//     const turnover = totalInventoryValue > 0 ? (totalCOGS / totalInventoryValue) * 4 : 0; // Quarterly to annual

//     return {
//         turnover: Number(turnover.toFixed(2)),
//         cogs: totalCOGS,
//         avgInventoryValue: totalInventoryValue,
//         interpretation: turnover >= 4 ? 'Fast' : turnover >= 2 ? 'Moderate' : 'Slow'
//     };
// };

// /* ==========================================================================
//    4. ADVANCED PRODUCT PERFORMANCE
//    ========================================================================== */

// exports.getProductPerformanceStats = async (orgId, branchId, period = '30d') => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);

//     let daysBack;
//     switch (period) {
//         case '7d': daysBack = 7; break;
//         case '30d': daysBack = 30; break;
//         case '90d': daysBack = 90; break;
//         case '365d': daysBack = 365; break;
//         default: daysBack = 30;
//     }

//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - daysBack);

//     const salesMatch = { 
//         ...match, 
//         invoiceDate: { $gte: startDate },
//         status: { $ne: 'cancelled' } 
//     };

//     const productPerformance = await Invoice.aggregate([
//         { $match: salesMatch },
//         { $unwind: '$items' },
//         {
//             $group: {
//                 _id: '$items.productId',
//                 name: { $first: '$items.name' },
//                 totalSold: { $sum: '$items.quantity' },
//                 totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
//                 invoiceCount: { $addToSet: '$invoiceNumber' }
//             }
//         },
//         { $project: {
//             name: 1,
//             totalSold: 1,
//             totalRevenue: 1,
//             frequency: { $size: '$invoiceCount' }
//         }},
//         { $sort: { totalRevenue: -1 } },
//         { $limit: 50 }
//     ]);

//     // Enrich with product details and calculate margins
//     const enrichedProducts = await Promise.all(
//         productPerformance.map(async (product) => {
//             const productDetails = await Product.findById(product._id)
//                 .select('purchasePrice category sku inventory');

//             if (!productDetails) return null;

//             const cost = product.totalSold * productDetails.purchasePrice;
//             const profit = product.totalRevenue - cost;
//             const margin = product.totalRevenue > 0 ? (profit / product.totalRevenue) * 100 : 0;

//             // Calculate stock availability
//             let currentStock = 0;
//             if (productDetails.inventory) {
//                 if (branchId) {
//                     const branchInv = productDetails.inventory.find(
//                         inv => inv.branchId.toString() === branchId
//                     );
//                     currentStock = branchInv ? branchInv.quantity : 0;
//                 } else {
//                     currentStock = productDetails.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
//                 }
//             }

//             return {
//                 ...product,
//                 sku: productDetails.sku,
//                 category: productDetails.category,
//                 purchasePrice: productDetails.purchasePrice,
//                 profit,
//                 margin: Number(margin.toFixed(1)),
//                 currentStock,
//                 daysOfSupply: currentStock > 0 ? 
//                     Math.round((currentStock / product.totalSold) * daysBack) : 
//                     0
//             };
//         })
//     );

//     const validProducts = enrichedProducts.filter(p => p !== null);

//     // Calculate rankings
//     const rankedProducts = validProducts.map((product, index) => ({
//         rank: index + 1,
//         ...product
//     }));

//     // Find top performers by different metrics
//     const topByRevenue = rankedProducts.slice(0, 10);
//     const topByMargin = [...rankedProducts]
//         .filter(p => p.totalSold > 10) // Minimum sales threshold
//         .sort((a, b) => b.margin - a.margin)
//         .slice(0, 10);

//     const topByVolume = [...rankedProducts]
//         .sort((a, b) => b.totalSold - a.totalSold)
//         .slice(0, 10);

//     return {
//         topByRevenue,
//         topByMargin,
//         topByVolume,
//         summary: {
//             totalProducts: validProducts.length,
//             avgMargin: validProducts.reduce((sum, p) => sum + p.margin, 0) / validProducts.length,
//             totalRevenue: validProducts.reduce((sum, p) => sum + p.totalRevenue, 0),
//             totalUnitsSold: validProducts.reduce((sum, p) => sum + p.totalSold, 0)
//         },
//         period: {
//             days: daysBack,
//             start: startDate,
//             end: new Date()
//         }
//     };
// };

// /* ==========================================================================
//    5. ENHANCED CUSTOMER ANALYTICS
//    ========================================================================== */

// exports.getCustomerRFMAnalysis = async (orgId, branchId) => {
//     const match = { 
//         organizationId: toObjectId(orgId),
//         status: { $ne: 'cancelled' }
//     };

//     if (branchId) match.branchId = toObjectId(branchId);

//     const ninetyDaysAgo = new Date();
//     ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

//     const rfmData = await Invoice.aggregate([
//         { $match: match },
//         {
//             $group: {
//                 _id: '$customerId',
//                 lastPurchaseDate: { $max: '$invoiceDate' },
//                 frequency: { $sum: 1 },
//                 monetary: { $sum: '$grandTotal' },
//                 avgOrderValue: { $avg: '$grandTotal' }
//             }
//         },
//         { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
//         { $unwind: '$customer' },
//         {
//             $project: {
//                 customerId: '$_id',
//                 name: '$customer.name',
//                 email: '$customer.email',
//                 phone: '$customer.phone',
//                 lastPurchaseDate: 1,
//                 frequency: 1,
//                 monetary: 1,
//                 avgOrderValue: 1,
//                 daysSinceLastPurchase: {
//                     $divide: [
//                         { $subtract: [new Date(), '$lastPurchaseDate'] },
//                         1000 * 60 * 60 * 24
//                     ]
//                 }
//             }
//         }
//     ]);

//     // Calculate RFM scores
//     const scoredData = rfmData.map(customer => {
//         // Recency Score (1-5)
//         let rScore;
//         const days = customer.daysSinceLastPurchase;
//         if (days <= 7) rScore = 5;
//         else if (days <= 30) rScore = 4;
//         else if (days <= 60) rScore = 3;
//         else if (days <= 90) rScore = 2;
//         else rScore = 1;

//         // Frequency Score (1-5)
//         let fScore;
//         if (customer.frequency > 20) fScore = 5;
//         else if (customer.frequency > 10) fScore = 4;
//         else if (customer.frequency > 5) fScore = 3;
//         else if (customer.frequency > 2) fScore = 2;
//         else fScore = 1;

//         // Monetary Score (1-5)
//         let mScore;
//         if (customer.monetary > 50000) mScore = 5;
//         else if (customer.monetary > 20000) mScore = 4;
//         else if (customer.monetary > 5000) mScore = 3;
//         else if (customer.monetary > 1000) mScore = 2;
//         else mScore = 1;

//         // RFM Segment
//         const rfmScore = rScore * 100 + fScore * 10 + mScore;
//         let segment = 'Standard';

//         if (rfmScore >= 555) segment = 'Champions';
//         else if (rfmScore >= 544) segment = 'Loyal Customers';
//         else if (rfmScore >= 533) segment = 'Potential Loyalists';
//         else if (rfmScore >= 522) segment = 'Recent Customers';
//         else if (rfmScore >= 511) segment = 'Promising';
//         else if (rfmScore >= 455) segment = 'Need Attention';
//         else if (rfmScore >= 355) segment = 'About to Sleep';
//         else if (rfmScore >= 255) segment = 'At Risk';
//         else if (rfmScore >= 155) segment = 'Can\'t Lose Them';
//         else if (rfmScore >= 111) segment = 'Lost';

//         return {
//             ...customer,
//             rScore,
//             fScore,
//             mScore,
//             rfmScore,
//             segment,
//             value: rScore + fScore + mScore
//         };
//     });

//     // Calculate segment distribution
//     const segmentDistribution = scoredData.reduce((acc, customer) => {
//         acc[customer.segment] = (acc[customer.segment] || 0) + 1;
//         return acc;
//     }, {});

//     // Calculate segment metrics
//     const segmentMetrics = {};
//     Object.keys(segmentDistribution).forEach(segment => {
//         const segmentCustomers = scoredData.filter(c => c.segment === segment);
//         segmentMetrics[segment] = {
//             count: segmentCustomers.length,
//             avgMonetary: segmentCustomers.reduce((sum, c) => sum + c.monetary, 0) / segmentCustomers.length,
//             avgFrequency: segmentCustomers.reduce((sum, c) => sum + c.frequency, 0) / segmentCustomers.length,
//             avgRecency: segmentCustomers.reduce((sum, c) => sum + c.daysSinceLastPurchase, 0) / segmentCustomers.length
//         };
//     });

//     return {
//         customers: scoredData,
//         segments: segmentDistribution,
//         segmentMetrics,
//         summary: {
//             totalCustomers: scoredData.length,
//             avgRFMScore: scoredData.reduce((sum, c) => sum + c.rfmScore, 0) / scoredData.length,
//             topSegment: Object.keys(segmentDistribution).reduce((a, b) => 
//                 segmentDistribution[a] > segmentDistribution[b] ? a : b
//             )
//         }
//     };
// };

// exports.calculateLTV = async (orgId, branchId) => {
//     const match = { 
//         organizationId: toObjectId(orgId),
//         status: { $ne: 'cancelled' }
//     };

//     if (branchId) match.branchId = toObjectId(branchId);

//     const customerStats = await Invoice.aggregate([
//         { $match: match },
//         {
//             $group: {
//                 _id: '$customerId',
//                 totalSpent: { $sum: '$grandTotal' },
//                 transactionCount: { $sum: 1 },
//                 firstPurchase: { $min: '$invoiceDate' },
//                 lastPurchase: { $max: '$invoiceDate' },
//                 avgOrderValue: { $avg: '$grandTotal' }
//             }
//         },
//         {
//             $project: {
//                 totalSpent: 1,
//                 transactionCount: 1,
//                 avgOrderValue: { $round: ['$avgOrderValue', 2] },
//                 lifespanDays: {
//                     $cond: [
//                         { $eq: ['$firstPurchase', '$lastPurchase'] },
//                         1,
//                         {
//                             $divide: [
//                                 { $subtract: ['$lastPurchase', '$firstPurchase'] },
//                                 1000 * 60 * 60 * 24
//                             ]
//                         }
//                     ]
//                 },
//                 purchaseFrequency: {
//                     $cond: [
//                         { $eq: ['$firstPurchase', '$lastPurchase'] },
//                         1,
//                         {
//                             $divide: [
//                                 '$transactionCount',
//                                 {
//                                     $divide: [
//                                         { $subtract: ['$lastPurchase', '$firstPurchase'] },
//                                         1000 * 60 * 60 * 24
//                                     ]
//                                 }
//                             ]
//                         }
//                     ]
//                 }
//             }
//         },
//         { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
//         { $unwind: '$customer' },
//         {
//             $project: {
//                 customerId: '$_id',
//                 name: '$customer.name',
//                 email: '$customer.email',
//                 totalSpent: 1,
//                 transactionCount: 1,
//                 avgOrderValue: 1,
//                 lifespanDays: { $round: ['$lifespanDays', 1] },
//                 purchaseFrequency: { $round: ['$purchaseFrequency', 2] },
//                 ltv: '$totalSpent',
//                 predictedLTV: {
//                     $multiply: [
//                         '$avgOrderValue',
//                         '$purchaseFrequency',
//                         365 * 3 // Project 3 years
//                     ]
//                 }
//             }
//         },
//         { $sort: { ltv: -1 } },
//         { $limit: 100 }
//     ]);

//     // Calculate LTV tiers
//     const tieredCustomers = customerStats.map(customer => {
//         let tier = 'Bronze';
//         if (customer.ltv > 50000) tier = 'Platinum';
//         else if (customer.ltv > 20000) tier = 'Gold';
//         else if (customer.ltv > 5000) tier = 'Silver';

//         return {
//             ...customer,
//             tier,
//             valueScore: customer.ltv > 0 ? Math.min(100, (customer.ltv / 100000) * 100) : 0
//         };
//     });

//     // Calculate overall LTV metrics
//     const totalLTV = tieredCustomers.reduce((sum, c) => sum + c.ltv, 0);
//     const avgLTV = totalLTV / tieredCustomers.length;

//     const tierDistribution = tieredCustomers.reduce((acc, customer) => {
//         acc[customer.tier] = (acc[customer.tier] || 0) + 1;
//         return acc;
//     }, {});

//     return {
//         customers: tieredCustomers,
//         summary: {
//             totalLTV,
//             avgLTV: Number(avgLTV.toFixed(2)),
//             avgPredictedLTV: tieredCustomers.reduce((sum, c) => sum + c.predictedLTV, 0) / tieredCustomers.length,
//             tierDistribution,
//             topCustomer: tieredCustomers[0]
//         }
//     };
// };

// /* ==========================================================================
//    6. ADVANCED FORECASTING
//    ========================================================================== */

// exports.generateAdvancedForecast = async (orgId, branchId, periods = 3, confidence = 0.95) => {
//     const match = { 
//         organizationId: toObjectId(orgId),
//         status: { $ne: 'cancelled' }
//     };

//     if (branchId) match.branchId = toObjectId(branchId);

//     // Get historical data (last 24 months)
//     const twoYearsAgo = new Date();
//     twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 24);

//     const historicalData = await Invoice.aggregate([
//         { $match: { ...match, invoiceDate: { $gte: twoYearsAgo } } },
//         {
//             $group: {
//                 _id: {
//                     year: { $year: '$invoiceDate' },
//                     month: { $month: '$invoiceDate' }
//                 },
//                 revenue: { $sum: '$grandTotal' },
//                 transactions: { $sum: 1 },
//                 avgTicket: { $avg: '$grandTotal' }
//             }
//         },
//         { $sort: { '_id.year': 1, '_id.month': 1 } }
//     ]);

//     if (historicalData.length < 6) {
//         return {
//             forecast: [],
//             accuracy: 'insufficient_data',
//             confidence: 0,
//             message: 'Insufficient historical data for accurate forecasting'
//         };
//     }

//     // Simple linear regression for forecasting
//     const n = historicalData.length;
//     let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

//     historicalData.forEach((data, index) => {
//         const x = index + 1;
//         const y = data.revenue;
//         sumX += x;
//         sumY += y;
//         sumXY += x * y;
//         sumX2 += x * x;
//     });

//     const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
//     const intercept = (sumY - slope * sumX) / n;

//     // Generate forecast
//     const forecast = [];
//     const currentDate = new Date();

//     for (let i = 1; i <= periods; i++) {
//         const futurePeriod = n + i;
//         const predictedRevenue = slope * futurePeriod + intercept;

//         // Calculate confidence interval
//         const yMean = sumY / n;
//         const ssRes = historicalData.reduce((sum, data, index) => {
//             const x = index + 1;
//             const yPred = slope * x + intercept;
//             return sum + Math.pow(data.revenue - yPred, 2);
//         }, 0);

//         const se = Math.sqrt(ssRes / (n - 2));
//         const tValue = 1.96; // Approx for 95% confidence
//         const margin = tValue * se * Math.sqrt(1 + 1/n + Math.pow(futurePeriod - (sumX/n), 2) / 
//             (historicalData.reduce((sum, data, index) => {
//                 const x = index + 1;
//                 return sum + Math.pow(x - (sumX/n), 2);
//             }, 0)));

//         // Create forecast period date
//         const forecastDate = new Date(currentDate);
//         forecastDate.setMonth(currentDate.getMonth() + i);

//         forecast.push({
//             period: forecastDate.toISOString().slice(0, 7), // YYYY-MM format
//             predictedRevenue: Math.max(0, Math.round(predictedRevenue)),
//             lowerBound: Math.max(0, Math.round(predictedRevenue - margin)),
//             upperBound: Math.round(predictedRevenue + margin),
//             confidence: Math.round((1 - (margin / predictedRevenue)) * 100),
//             growth: i === 1 ? slope : null
//         });
//     }

//     // Calculate forecast accuracy based on recent data
//     const recentMonths = historicalData.slice(-6);
//     const accuracy = this.calculateForecastAccuracyFromHistory(recentMonths);

//     return {
//         forecast,
//         accuracy,
//         historicalDataPoints: n,
//         model: 'linear_regression',
//         assumptions: [
//             'Linear trend continues',
//             'No major market disruptions',
//             'Seasonal patterns consistent with history'
//         ],
//         recommendations: this.generateForecastRecommendations(forecast, historicalData)
//     };
// };

// exports.calculateForecastAccuracyFromHistory = (historicalData) => {
//     if (historicalData.length < 6) return 'insufficient_data';

//     // Simple accuracy calculation (placeholder for more sophisticated method)
//     const values = historicalData.map(d => d.revenue);
//     const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
//     const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
//     const cv = Math.sqrt(variance) / mean;

//     if (cv < 0.1) return 'high';
//     if (cv < 0.2) return 'medium';
//     return 'low';
// };

// /* ==========================================================================
//    7. BUSINESS INTELLIGENCE & INSIGHTS GENERATION
//    ========================================================================== */

// exports.generateInsights = (kpi, inventory, leaders) => {
//     const insights = [];

//     // Revenue insights
//     if (kpi.revenue.growth > 20) {
//         insights.push({
//             type: 'positive',
//             category: 'revenue',
//             title: 'Strong Revenue Growth',
//             message: `Revenue growing at ${kpi.revenue.growth}% - consider expanding successful products`,
//             priority: 'medium'
//         });
//     } else if (kpi.revenue.growth < -10) {
//         insights.push({
//             type: 'warning',
//             category: 'revenue',
//             title: 'Revenue Decline Detected',
//             message: `Revenue down by ${Math.abs(kpi.revenue.growth)}% - investigate market changes`,
//             priority: 'high'
//         });
//     }

//     // Inventory insights
//     if (inventory.lowStockAlerts.length > 5) {
//         insights.push({
//             type: 'warning',
//             category: 'inventory',
//             title: 'Multiple Stock Shortages',
//             message: `${inventory.lowStockAlerts.length} items need immediate restocking`,
//             priority: 'high'
//         });
//     }

//     // Customer insights from leaders
//     if (leaders.topCustomers && leaders.topCustomers.length > 0) {
//         const topCustomer = leaders.topCustomers[0];
//         insights.push({
//             type: 'info',
//             category: 'customer',
//             title: 'Top Performing Customer',
//             message: `${topCustomer.name} spent ${topCustomer.totalSpent} - consider loyalty program`,
//             priority: 'low'
//         });
//     }

//     // Profit margin insights
//     if (kpi.profit.margin < 10) {
//         insights.push({
//             type: 'warning',
//             category: 'profit',
//             title: 'Low Profit Margin',
//             message: `Profit margin at ${kpi.profit.margin}% - review pricing and costs`,
//             priority: 'high'
//         });
//     }

//     // Add timestamp and recommendation count
//     return {
//         insights,
//         generatedAt: new Date().toISOString(),
//         count: insights.length,
//         priorityCount: {
//             high: insights.filter(i => i.priority === 'high').length,
//             medium: insights.filter(i => i.priority === 'medium').length,
//             low: insights.filter(i => i.priority === 'low').length
//         }
//     };
// };

// exports.generateFinancialRecommendations = (kpi, profitability) => {
//     const recommendations = [];

//     // Cash flow recommendations
//     if (kpi.outstanding.receivables > kpi.revenue.value * 0.3) {
//         recommendations.push({
//             action: 'Improve Receivables Collection',
//             reason: 'High outstanding receivables affecting cash flow',
//             impact: 'high',
//             timeframe: 'short',
//             steps: [
//                 'Implement stricter payment terms',
//                 'Offer early payment discounts',
//                 'Follow up on overdue invoices'
//             ]
//         });
//     }

//     // Profitability recommendations
//     if (profitability.marginPercent < 15) {
//         recommendations.push({
//             action: 'Increase Profit Margins',
//             reason: `Current margin of ${profitability.marginPercent}% is below target`,
//             impact: 'high',
//             timeframe: 'medium',
//             steps: [
//                 'Review product pricing',
//                 'Negotiate better supplier terms',
//                 'Reduce operational waste'
//             ]
//         });
//     }

//     // Growth recommendations
//     if (kpi.revenue.growth > 0 && kpi.revenue.growth < 10) {
//         recommendations.push({
//             action: 'Accelerate Growth',
//             reason: 'Steady growth detected - opportunity to accelerate',
//             impact: 'medium',
//             timeframe: 'long',
//             steps: [
//                 'Expand marketing efforts',
//                 'Introduce new products',
//                 'Explore new markets'
//             ]
//         });
//     }

//     return {
//         recommendations,
//         generatedAt: new Date().toISOString(),
//         priority: recommendations.filter(r => r.impact === 'high').length > 0 ? 'high' : 'medium'
//     };
// };

// /* ==========================================================================
//    8. PERFORMANCE OPTIMIZATIONS
//    ========================================================================== */

// // Batch processing for large datasets
// exports.processInBatches = async (collection, pipeline, batchSize = 1000) => {
//     const results = [];
//     let skip = 0;
//     let hasMore = true;

//     while (hasMore) {
//         const batchPipeline = [
//             ...pipeline,
//             { $skip: skip },
//             { $limit: batchSize }
//         ];

//         const batch = await collection.aggregate(batchPipeline).toArray();

//         if (batch.length === 0) {
//             hasMore = false;
//         } else {
//             results.push(...batch);
//             skip += batchSize;
//         }
//     }

//     return results;
// };

// // Index optimization suggestions
// exports.getIndexRecommendations = async (orgId) => {
//     const slowQueries = await mongoose.connection.db.collection('system.profile')
//         .find({ ns: /analytics/, millis: { $gt: 100 } })
//         .sort({ ts: -1 })
//         .limit(10)
//         .toArray();

//     const recommendations = slowQueries.map(query => ({
//         query: query.query,
//         executionTime: query.millis,
//         recommendedIndex: this.suggestIndex(query.query),
//         potentialImprovement: Math.round(query.millis * 0.7) // Estimate 30% improvement
//     }));

//     return {
//         recommendations,
//         totalSlowQueries: slowQueries.length,
//         avgQueryTime: slowQueries.reduce((sum, q) => sum + q.millis, 0) / slowQueries.length
//     };
// };

// /* ==========================================================================
//    9. EXPORT & DATA MANAGEMENT
//    ========================================================================== */

// exports.getExportConfig = (type, requestedColumns = 'all') => {
//     const configs = {
//         sales: {
//             defaultColumns: ['invoiceNumber', 'date', 'customerName', 'amount', 'status', 'branch'],
//             columnLabels: {
//                 invoiceNumber: 'Invoice #',
//                 date: 'Date',
//                 customerName: 'Customer',
//                 amount: 'Amount',
//                 status: 'Status',
//                 branch: 'Branch'
//             },
//             format: {
//                 amount: 'currency',
//                 date: 'date'
//             }
//         },
//         inventory: {
//             defaultColumns: ['name', 'sku', 'stock', 'value', 'reorderLevel', 'category'],
//             columnLabels: {
//                 name: 'Product Name',
//                 sku: 'SKU',
//                 stock: 'Current Stock',
//                 value: 'Inventory Value',
//                 reorderLevel: 'Reorder Level',
//                 category: 'Category'
//             },
//             format: {
//                 value: 'currency',
//                 stock: 'number'
//             }
//         },
//         customers: {
//             defaultColumns: ['name', 'email', 'totalSpent', 'lastPurchase', 'segment', 'ltv'],
//             columnLabels: {
//                 name: 'Customer Name',
//                 email: 'Email',
//                 totalSpent: 'Total Spent',
//                 lastPurchase: 'Last Purchase',
//                 segment: 'Segment',
//                 ltv: 'Lifetime Value'
//             },
//             format: {
//                 totalSpent: 'currency',
//                 ltv: 'currency',
//                 lastPurchase: 'date'
//             }
//         }
//     };

//     const config = configs[type] || configs.sales;

//     // Filter columns if requested
//     if (requestedColumns !== 'all') {
//         const columns = requestedColumns.split(',');
//         config.defaultColumns = config.defaultColumns.filter(col => 
//             columns.includes(col)
//         );
//     }

//     return config;
// };

// exports.convertToCSV = (data, config) => {
//     if (!data || data.length === 0) return '';

//     const headers = config.defaultColumns.map(col => 
//         config.columnLabels[col] || col
//     );

//     const rows = data.map(item => {
//         return config.defaultColumns.map(col => {
//             let value = item[col] || '';

//             // Format based on config
//             if (config.format && config.format[col]) {
//                 switch (config.format[col]) {
//                     case 'currency':
//                         value = `"$${Number(value).toFixed(2)}"`;
//                         break;
//                     case 'date':
//                         value = new Date(value).toLocaleDateString();
//                         break;
//                     default:
//                         value = `"${String(value).replace(/"/g, '""')}"`;
//                 }
//             } else {
//                 value = `"${String(value).replace(/"/g, '""')}"`;
//             }

//             return value;
//         }).join(',');
//     });

//     return [headers.join(','), ...rows].join('\n');
// };

// /* ==========================================================================
//    10. UTILITY FUNCTIONS
//    ========================================================================== */

// // Get new customers count
// exports.getNewCustomersCount = async (orgId, branchId, start, end) => {
//     const match = { 
//         organizationId: toObjectId(orgId),
//         createdAt: { $gte: start, $lte: end }
//     };

//     return Customer.countDocuments(match);
// };

// // Calculate inventory health score
// exports.calculateInventoryHealthScore = (analytics, performance, deadStock) => {
//     let score = 100;

//     // Deduct for low stock items
//     const lowStockPenalty = Math.min(analytics.lowStockAlerts.length * 2, 30);
//     score -= lowStockPenalty;

//     // Deduct for dead stock
//     const deadStockPenalty = Math.min(deadStock.length, 20);
//     score -= deadStockPenalty;

//     // Bonus for good turnover
//     if (analytics.turnover.turnover > 4) score += 10;

//     // Bonus for high-margin products
//     const highMarginCount = performance.highMargin.filter(p => p.marginPercent > 40).length;
//     if (highMarginCount > 5) score += 10;

//     return Math.max(0, Math.min(100, score));
// };

// // Staff productivity score
// exports.calculateProductivityScore = (staff) => {
//     const avgOrderValue = staff.avgTicketSize || 0;
//     const orderCount = staff.invoiceCount || 0;

//     // Simple productivity calculation
//     return Math.min(100, (avgOrderValue * orderCount) / 1000);
// };

// // Export remaining functions from original service
// exports.getLeaderboards = require('./originalAnalyticsService').getLeaderboards;
// exports.getOperationalStats = require('./originalAnalyticsService').getOperationalStats;
// exports.getBranchComparisonStats = require('./originalAnalyticsService').getBranchComparisonStats;
// exports.getGrossProfitAnalysis = require('./originalAnalyticsService').getGrossProfitAnalysis;
// exports.getEmployeePerformance = require('./originalAnalyticsService').getEmployeePerformance;
// exports.getPeakHourAnalysis = require('./originalAnalyticsService').getPeakHourAnalysis;
// exports.getDeadStockAnalysis = require('./originalAnalyticsService').getDeadStockAnalysis;
// exports.getInventoryRunRate = require('./originalAnalyticsService').getInventoryRunRate;
// exports.getDebtorAging = require('./originalAnalyticsService').getDebtorAging;
// exports.getSecurityPulse = require('./originalAnalyticsService').getSecurityPulse;
// exports.analyzeChurnRisk = require('./originalAnalyticsService').analyzeChurnRisk;
// exports.performBasketAnalysis = require('./originalAnalyticsService').performBasketAnalysis;
// exports.analyzePaymentHabits = require('./originalAnalyticsService').analyzePaymentHabits;
// exports.getCohortAnalysis = require('./originalAnalyticsService').getCohortAnalysis;
// exports.getCriticalAlerts = require('./originalAnalyticsService').getCriticalAlerts;
// exports.getExportData = require('./originalAnalyticsService').getExportData;
// // const mongoose = require('mongoose');
// // const Invoice = require('../models/invoiceModel');
// // const Purchase = require('../models/purchaseModel');
// // const Product = require('../models/productModel');
// // const Sales = require('../models/salesModel');
// // const Payment = require('../models/paymentModel');
// // const AccountEntry = require('../models/accountEntryModel');
// // const AuditLog = require('../models/auditLogModel');
// // const Customer = require('../models/customerModel');
// // const User = require('../models/userModel');

// // // Helper to cast ID safely
// // const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// // // Helper for Growth Calculation
// // const calculateGrowth = (current, previous) => {
// //     if (previous === 0) return current === 0 ? 0 : 100;
// //     return Math.round(((current - previous) / previous) * 100);
// // };

// // /* ==========================================================================
// //    1. EXECUTIVE DASHBOARD
// //    ========================================================================== */
// // exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     const start = new Date(startDate);
// //     const end = new Date(endDate);
// //     const duration = end - start;
// //     const prevStart = new Date(start - duration);
// //     const prevEnd = new Date(start);

// //     // 1. SALES STATS (Current vs Previous)
// //     const salesStats = await Invoice.aggregate([
// //         {
// //             $facet: {
// //                 current: [
// //                     { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //                     { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
// //                 ],
// //                 previous: [
// //                     { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
// //                     { $group: { _id: null, total: { $sum: '$grandTotal' } } }
// //                 ]
// //             }
// //         }
// //     ]);

// //     // 2. PURCHASE STATS (Current vs Previous)
// //     const purchaseStats = await Purchase.aggregate([
// //         {
// //             $facet: {
// //                 current: [
// //                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //                     { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
// //                 ],
// //                 previous: [
// //                     { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
// //                     { $group: { _id: null, total: { $sum: '$grandTotal' } } }
// //                 ]
// //             }
// //         }
// //     ]);

// //     // Defensive checks for empty results
// //     const curSales = salesStats[0]?.current?.[0] || { total: 0, count: 0, due: 0 };
// //     const prevSales = salesStats[0]?.previous?.[0] || { total: 0 };
// //     const curPurch = purchaseStats[0]?.current?.[0] || { total: 0, count: 0, due: 0 };
// //     const prevPurch = purchaseStats[0]?.previous?.[0] || { total: 0 };

// //     return {
// //         totalRevenue: { value: curSales.total, count: curSales.count, growth: calculateGrowth(curSales.total, prevSales.total) },
// //         totalExpense: { value: curPurch.total, count: curPurch.count, growth: calculateGrowth(curPurch.total, prevPurch.total) },
// //         netProfit: { 
// //             value: curSales.total - curPurch.total, 
// //             growth: calculateGrowth((curSales.total - curPurch.total), (prevSales.total - prevPurch.total)) 
// //         },
// //         outstanding: { receivables: curSales.due, payables: curPurch.due }
// //     };
// // };

// // exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'day') => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
    
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);
// //     const dateFormat = interval === 'month' ? '%Y-%m' : '%Y-%m-%d';

// //     const timeline = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //         { $project: { date: '$invoiceDate', amount: '$grandTotal', type: 'Income' } },
// //         {
// //             $unionWith: {
// //                 coll: 'purchases',
// //                 pipeline: [
// //                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //                     { $project: { date: '$purchaseDate', amount: '$grandTotal', type: 'Expense' } }
// //                 ]
// //             }
// //         },
// //         {
// //             $group: {
// //                 _id: { $dateToString: { format: dateFormat, date: '$date' } },
// //                 income: { $sum: { $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0] } },
// //                 expense: { $sum: { $cond: [{ $eq: ['$type', 'Expense'] }, '$amount', 0] } }
// //             }
// //         },
// //         { $sort: { _id: 1 } },
// //         { $project: { date: '$_id', income: 1, expense: 1, profit: { $subtract: ['$income', '$expense'] }, _id: 0 } }
// //     ]);

// //     return { timeline };
// // };

// // /* ==========================================================================
// //    2. FINANCIAL INTELLIGENCE (Cash Flow & Tax)
// //    ========================================================================== */
// // exports.getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);

// //     // 1. Payment Mode Breakdown
// //     const modes = await Payment.aggregate([
// //         { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
// //         { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
// //         { $project: { name: '$_id', value: 1, _id: 0 } }
// //     ]);

// //     // 2. Aging Analysis (Receivables)
// //     const now = new Date();
// //     const aging = await Invoice.aggregate([
// //         { $match: { ...match, paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' } } },
// //         {
// //             $project: {
// //                 balanceAmount: 1,
// //                 daysOverdue: { 
// //                     $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24] 
// //                 }
// //             }
// //         },
// //         {
// //             $bucket: {
// //                 groupBy: "$daysOverdue",
// //                 boundaries: [0, 30, 60, 90, 365],
// //                 default: "90+",
// //                 output: {
// //                     totalAmount: { $sum: "$balanceAmount" },
// //                     count: { $sum: 1 }
// //                 }
// //             }
// //         }
// //     ]);

// //     return { paymentModes: modes, agingReport: aging };
// // };

// // exports.getTaxStats = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);

// //     const stats = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //         { $group: { _id: null, outputTax: { $sum: '$totalTax' }, taxableSales: { $sum: '$subTotal' } } },
// //         {
// //             $unionWith: {
// //                 coll: 'purchases',
// //                 pipeline: [
// //                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //                     { $group: { _id: null, inputTax: { $sum: '$totalTax' }, taxablePurchase: { $sum: '$subTotal' } } }
// //                 ]
// //             }
// //         },
// //         {
// //             $group: {
// //                 _id: null,
// //                 totalOutputTax: { $sum: '$outputTax' },
// //                 totalInputTax: { $sum: '$inputTax' },
// //                 totalTaxableSales: { $sum: '$taxableSales' },
// //                 totalTaxablePurchase: { $sum: '$taxablePurchase' }
// //             }
// //         },
// //         {
// //             $project: {
// //                 _id: 0,
// //                 inputTax: '$totalInputTax',
// //                 outputTax: '$totalOutputTax',
// //                 netPayable: { $subtract: ['$totalOutputTax', '$totalInputTax'] }
// //             }
// //         }
// //     ]);

// //     return stats[0] || { inputTax: 0, outputTax: 0, netPayable: 0 };
// // };

// // /* ==========================================================================
// //    3. PRODUCT PERFORMANCE (Margins & Dead Stock)
// //    ========================================================================== */
// // exports.getProductPerformanceStats = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId) };
    
// //     // 1. High Margin Products
// //     const highMargin = await Product.aggregate([
// //         { $match: { ...match, isActive: true } },
// //         { 
// //             $project: { 
// //                 name: 1, 
// //                 sku: 1,
// //                 margin: { $subtract: ['$sellingPrice', '$purchasePrice'] },
// //                 marginPercent: {
// //                      $cond: [
// //                         { $eq: ['$purchasePrice', 0] }, 
// //                         100, 
// //                         { $multiply: [{ $divide: [{ $subtract: ['$sellingPrice', '$purchasePrice'] }, '$purchasePrice'] }, 100] }
// //                      ]
// //                 }
// //             } 
// //         },
// //         { $sort: { margin: -1 } },
// //         { $limit: 10 }
// //     ]);

// //     // 2. Dead Stock (Items with Inventory > 0 but NO Sales in last 90 days)
// //     const ninetyDaysAgo = new Date();
// //     ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

// //     const soldProducts = await Invoice.distinct('items.productId', { 
// //         ...match, 
// //         invoiceDate: { $gte: ninetyDaysAgo } 
// //     });

// //     const deadStock = await Product.aggregate([
// //         { 
// //             $match: { 
// //                 ...match, 
// //                 _id: { $nin: soldProducts }, 
// //                 isActive: true
// //             } 
// //         },
// //         { $unwind: "$inventory" }, 
// //         // Filter by branch if provided, otherwise show any dead stock
// //         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
// //         { $match: { "inventory.quantity": { $gt: 0 } } },
// //         {
// //             $project: {
// //                 name: 1,
// //                 sku: 1,
// //                 stockQuantity: "$inventory.quantity",
// //                 value: { $multiply: ["$inventory.quantity", "$purchasePrice"] }
// //             }
// //         },
// //         { $limit: 20 }
// //     ]);

// //     return { highMargin, deadStock };
// // };

// // exports.getInventoryAnalytics = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId) };
    
// //     // 1. Low Stock Products
// //     const lowStock = await Product.aggregate([
// //         { $match: { ...match, isActive: true } },
// //         { $unwind: "$inventory" },
// //         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
// //         {
// //             $project: {
// //                 name: 1, sku: 1,
// //                 currentStock: "$inventory.quantity",
// //                 reorderLevel: "$inventory.reorderLevel",
// //                 branchId: "$inventory.branchId",
// //                 isLow: { $lte: ["$inventory.quantity", "$inventory.reorderLevel"] }
// //             }
// //         },
// //         { $match: { isLow: true } },
// //         { $limit: 10 },
// //         { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
// //         { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
// //         { $project: { name: 1, sku: 1, currentStock: 1, reorderLevel: 1, branchName: "$branch.name" } }
// //     ]);

// //     // 2. Stock Valuation
// //     const valuation = await Product.aggregate([
// //         { $match: { ...match, isActive: true } },
// //         { $unwind: "$inventory" },
// //         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
// //         {
// //             $group: {
// //                 _id: null,
// //                 totalValue: { $sum: { $multiply: ["$inventory.quantity", "$purchasePrice"] } },
// //                 totalItems: { $sum: "$inventory.quantity" },
// //                 productCount: { $sum: 1 }
// //             }
// //         }
// //     ]);

// //     return {
// //         lowStockAlerts: lowStock,
// //         inventoryValuation: valuation[0] || { totalValue: 0, totalItems: 0, productCount: 0 }
// //     };
// // };

// // exports.getProcurementStats = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);

// //     const topSuppliers = await Purchase.aggregate([
// //         { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //         { $group: { _id: '$supplierId', totalSpend: { $sum: '$grandTotal' }, bills: { $sum: 1 } } },
// //         { $sort: { totalSpend: -1 } },
// //         { $limit: 5 },
// //         { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
// //         { $unwind: '$supplier' },
// //         { $project: { name: '$supplier.companyName', totalSpend: 1, bills: 1 } }
// //     ]);

// //     return { topSuppliers };
// // };

// // /* ==========================================================================
// //    4. CUSTOMER INSIGHTS
// //    ========================================================================== */
// // exports.getCustomerRiskStats = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId) };

// //     const creditRisk = await Customer.find({ 
// //         ...match, 
// //         outstandingBalance: { $gt: 0 } 
// //     })
// //     .sort({ outstandingBalance: -1 })
// //     .limit(10)
// //     .select('name phone outstandingBalance creditLimit');

// //     const sixMonthsAgo = new Date();
// //     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

// //     const activeIds = await Invoice.distinct('customerId', { 
// //         ...match, 
// //         invoiceDate: { $gte: sixMonthsAgo } 
// //     });

// //     const atRiskCustomers = await Customer.countDocuments({
// //         ...match,
// //         _id: { $nin: activeIds },
// //         type: 'business'
// //     });

// //     return { creditRisk, churnCount: atRiskCustomers };
// // };

// // exports.getLeaderboards = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);

// //     const data = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //         {
// //             $facet: {
// //                 topCustomers: [
// //                     { $group: { _id: '$customerId', totalSpent: { $sum: '$grandTotal' }, transactions: { $sum: 1 } } },
// //                     { $sort: { totalSpent: -1 } },
// //                     { $limit: 5 },
// //                     { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
// //                     { $unwind: '$customer' },
// //                     { $project: { name: '$customer.name', phone: '$customer.phone', totalSpent: 1, transactions: 1 } }
// //                 ],
// //                 topProducts: [
// //                     { $unwind: '$items' },
// //                     {
// //                         $group: {
// //                             _id: '$items.productId',
// //                             name: { $first: '$items.name' },
// //                             soldQty: { $sum: '$items.quantity' },
// //                             revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
// //                         }
// //                     },
// //                     { $sort: { soldQty: -1 } },
// //                     { $limit: 5 }
// //                 ]
// //             }
// //         }
// //     ]);

// //     return {
// //         topCustomers: data[0]?.topCustomers || [],
// //         topProducts: data[0]?.topProducts || []
// //     };
// // };

// // /* ==========================================================================
// //    5. OPERATIONAL METRICS
// //    ========================================================================== */
// // exports.getOperationalStats = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);

// //     const data = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } },
// //         {
// //             $facet: {
// //                 discounts: [
// //                     { $match: { status: { $ne: 'cancelled' } } },
// //                     { $group: { 
// //                         _id: null, 
// //                         totalDiscount: { $sum: '$totalDiscount' }, 
// //                         totalSales: { $sum: '$subTotal' } 
// //                       }
// //                     },
// //                     { $project: { 
// //                         discountRate: { 
// //                             $cond: [{ $eq: ['$totalSales', 0] }, 0, { $multiply: [{ $divide: ['$totalDiscount', '$totalSales'] }, 100] }]
// //                         },
// //                         totalDiscount: 1
// //                       }
// //                     }
// //                 ],
// //                 efficiency: [
// //                     {
// //                         $group: {
// //                             _id: null,
// //                             totalOrders: { $sum: 1 },
// //                             cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
// //                             successfulRevenue: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$grandTotal', 0] } },
// //                             successfulCount: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } }
// //                         }
// //                     },
// //                     {
// //                         $project: {
// //                             cancellationRate: { $multiply: [{ $divide: ['$cancelledOrders', '$totalOrders'] }, 100] },
// //                             averageOrderValue: { 
// //                                 $cond: [{ $eq: ['$successfulCount', 0] }, 0, { $divide: ['$successfulRevenue', '$successfulCount'] }]
// //                             }
// //                         }
// //                     }
// //                 ],
// //                 staffPerformance: [
// //                     { $match: { status: { $ne: 'cancelled' } } },
// //                     { $group: { _id: '$createdBy', revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
// //                     { $sort: { revenue: -1 } },
// //                     { $limit: 5 },
// //                     { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
// //                     { $unwind: '$user' },
// //                     { $project: { name: '$user.name', revenue: 1, count: 1 } }
// //                 ]
// //             }
// //         }
// //     ]);

// //     return {
// //         discountMetrics: data[0]?.discounts[0] || { totalDiscount: 0, discountRate: 0 },
// //         orderEfficiency: data[0]?.efficiency[0] || { cancellationRate: 0, averageOrderValue: 0 },
// //         topStaff: data[0]?.staffPerformance || []
// //     };
// // };

// // /* ==========================================================================
// //    6. BRANCH COMPARISON & PROFITABILITY
// //    ========================================================================== */
// // exports.getBranchComparisonStats = async (orgId, startDate, endDate) => {
// //     const match = { 
// //         organizationId: toObjectId(orgId),
// //         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
// //         status: { $ne: 'cancelled' }
// //     };

// //     const stats = await Invoice.aggregate([
// //         { $match: match },
// //         {
// //             $group: {
// //                 _id: '$branchId',
// //                 revenue: { $sum: '$grandTotal' },
// //                 invoiceCount: { $sum: 1 },
// //                 avgBasketValue: { $avg: '$grandTotal' }
// //             }
// //         },
// //         { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
// //         { $unwind: '$branch' },
// //         {
// //             $project: {
// //                 branchName: '$branch.name',
// //                 revenue: 1,
// //                 invoiceCount: 1,
// //                 avgBasketValue: { $round: ['$avgBasketValue', 0] }
// //             }
// //         },
// //         { $sort: { revenue: -1 } }
// //     ]);

// //     return stats;
// // };

// // exports.getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
    
// //     const data = await Invoice.aggregate([
// //         { 
// //             $match: { 
// //                 ...match, 
// //                 invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
// //                 status: { $ne: 'cancelled' }
// //             } 
// //         },
// //         { $unwind: '$items' },
// //         {
// //             $lookup: {
// //                 from: 'products',
// //                 localField: 'items.productId',
// //                 foreignField: '_id',
// //                 as: 'product'
// //             }
// //         },
// //         // preserveNullAndEmptyArrays needed if product was deleted
// //         { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
// //         {
// //             $group: {
// //                 _id: null,
// //                 totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
// //                 // Fallback to 0 if product ref is missing or has no purchasePrice
// //                 totalCOGS: { $sum: { $multiply: [{ $ifNull: ['$product.purchasePrice', 0] }, '$items.quantity'] } }
// //             }
// //         },
// //         {
// //             $project: {
// //                 _id: 0,
// //                 totalRevenue: 1,
// //                 totalCOGS: 1,
// //                 grossProfit: { $subtract: ['$totalRevenue', '$totalCOGS'] },
// //                 marginPercent: {
// //                     $cond: [
// //                         { $eq: ['$totalRevenue', 0] },
// //                         0,
// //                         { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCOGS'] }, '$totalRevenue'] }, 100] }
// //                     ]
// //                 }
// //             }
// //         }
// //     ]);

// //     return data[0] || { totalRevenue: 0, totalCOGS: 0, grossProfit: 0, marginPercent: 0 };
// // };

// // exports.getEmployeePerformance = async (orgId, branchId, startDate, endDate) => {
// //     const match = { 
// //         organizationId: toObjectId(orgId),
// //         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
// //         status: { $ne: 'cancelled' }
// //     };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     return await Invoice.aggregate([
// //         { $match: match },
// //         {
// //             $group: {
// //                 _id: '$createdBy',
// //                 totalSales: { $sum: '$grandTotal' },
// //                 invoiceCount: { $sum: 1 },
// //                 totalDiscountGiven: { $sum: '$totalDiscount' }
// //             }
// //         },
// //         { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
// //         { $unwind: '$user' },
// //         {
// //             $project: {
// //                 name: '$user.name',
// //                 email: '$user.email',
// //                 totalSales: 1,
// //                 invoiceCount: 1,
// //                 totalDiscountGiven: 1,
// //                 avgTicketSize: { $divide: ['$totalSales', '$invoiceCount'] }
// //             }
// //         },
// //         { $sort: { totalSales: -1 } }
// //     ]);
// // };

// // exports.getPeakHourAnalysis = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     const thirtyDaysAgo = new Date();
// //     thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

// //     return await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
// //         {
// //             $project: {
// //                 dayOfWeek: { $dayOfWeek: '$invoiceDate' },
// //                 hour: { $hour: '$invoiceDate' }
// //             }
// //         },
// //         {
// //             $group: {
// //                 _id: { day: '$dayOfWeek', hour: '$hour' },
// //                 count: { $sum: 1 }
// //             }
// //         },
// //         {
// //             $project: {
// //                 day: '$_id.day',
// //                 hour: '$_id.hour',
// //                 count: 1,
// //                 _id: 0
// //             }
// //         },
// //         { $sort: { day: 1, hour: 1 } }
// //     ]);
// // };

// // exports.getDeadStockAnalysis = async (orgId, branchId, daysThreshold = 90) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     const cutoffDate = new Date();
// //     cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysThreshold));

// //     const soldProductIds = await Invoice.distinct('items.productId', {
// //         ...match,
// //         invoiceDate: { $gte: cutoffDate }
// //     });

// //     return await Product.aggregate([
// //         { $match: { ...match, _id: { $nin: soldProductIds }, isActive: true } },
// //         { $unwind: '$inventory' },
// //         ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
// //         { $match: { 'inventory.quantity': { $gt: 0 } } },
// //         {
// //             $project: {
// //                 name: 1,
// //                 sku: 1,
// //                 category: 1,
// //                 quantity: '$inventory.quantity',
// //                 value: { $multiply: ['$inventory.quantity', '$purchasePrice'] },
// //                 daysInactive: { $literal: daysThreshold }
// //             }
// //         },
// //         { $sort: { value: -1 } }
// //     ]);
// // };

// // /* ==========================================================================
// //    7. ADVANCED PREDICTIONS & ANALYSIS
// //    ========================================================================== */

// // /**
// //  * 🚀 OPTIMIZED: Inventory Run Rate
// //  * Replaced heavy $lookup inside pipeline with "Aggregate Sales First" strategy
// //  */
// // exports.getInventoryRunRate = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     const thirtyDaysAgo = new Date();
// //     thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

// //     // 1. Get Sales Velocity (Fast Aggregation)
// //     const salesVelocity = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
// //         { $unwind: '$items' },
// //         {
// //             $group: {
// //                 _id: '$items.productId',
// //                 totalSold: { $sum: '$items.quantity' }
// //             }
// //         }
// //     ]);

// //     // Create Map: ProductID -> Daily Velocity
// //     const velocityMap = new Map();
// //     salesVelocity.forEach(item => {
// //         velocityMap.set(String(item._id), item.totalSold / 30);
// //     });

// //     // 2. Fetch Products with Inventory
// //     // We only care about products that have velocity OR inventory
// //     const productQuery = { organizationId: toObjectId(orgId), isActive: true };
// //     const products = await Product.find(productQuery).lean();

// //     const predictions = [];

// //     products.forEach(p => {
// //         let stock = 0;
// //         if (p.inventory) {
// //             if (branchId) {
// //                 const bInv = p.inventory.find(inv => String(inv.branchId) === String(branchId));
// //                 stock = bInv ? bInv.quantity : 0;
// //             } else {
// //                 stock = p.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
// //             }
// //         }

// //         const velocity = velocityMap.get(String(p._id)) || 0;
        
// //         if (velocity > 0 && stock > 0) {
// //             const daysLeft = stock / velocity;
// //             if (daysLeft <= 14) { // Only critical ones
// //                 predictions.push({
// //                     name: p.name,
// //                     currentStock: stock,
// //                     dailyVelocity: parseFloat(velocity.toFixed(2)),
// //                     daysUntilStockout: Math.round(daysLeft)
// //                 });
// //             }
// //         }
// //     });

// //     return predictions.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
// // };

// // exports.getDebtorAging = async (orgId, branchId) => {
// //     const match = { 
// //         organizationId: toObjectId(orgId),
// //         paymentStatus: { $ne: 'paid' },
// //         status: { $ne: 'cancelled' },
// //         balanceAmount: { $gt: 0 }
// //     };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     const now = new Date();

// //     const aging = await Invoice.aggregate([
// //         { $match: match },
// //         {
// //             $project: {
// //                 customerId: 1,
// //                 invoiceNumber: 1,
// //                 balanceAmount: 1,
// //                 dueDate: { $ifNull: ['$dueDate', '$invoiceDate'] },
// //                 daysOverdue: { 
// //                     $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24] 
// //                 }
// //             }
// //         },
// //         {
// //             $bucket: {
// //                 groupBy: "$daysOverdue",
// //                 boundaries: [0, 31, 61, 91],
// //                 default: "91+",
// //                 output: {
// //                     totalAmount: { $sum: "$balanceAmount" },
// //                     invoices: { $push: { number: "$invoiceNumber", amount: "$balanceAmount", cust: "$customerId" } }
// //                 }
// //             }
// //         }
// //     ]);

// //     const labels = { 0: '0-30 Days', 31: '31-60 Days', 61: '61-90 Days', '91+': '90+ Days' };
// //     return aging.map(a => ({
// //         range: labels[a._id] || a._id,
// //         amount: a.totalAmount,
// //         count: a.invoices.length
// //     }));
// // };

// // exports.getSecurityPulse = async (orgId, startDate, endDate) => {
// //     if (!AuditLog) return { recentEvents: [], riskyActions: 0 };

// //     const match = { 
// //         organizationId: toObjectId(orgId),
// //         createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
// //     };

// //     const logs = await AuditLog.find(match)
// //         .sort({ createdAt: -1 })
// //         .limit(20)
// //         .populate('userId', 'name email');
    
// //     const riskCount = await AuditLog.countDocuments({
// //         ...match,
// //         action: { $in: ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE'] }
// //     });

// //     return { recentEvents: logs, riskyActions: riskCount };
// // };

// // exports.calculateLTV = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId), status: 'active' };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     const stats = await Sales.aggregate([
// //         { $match: match },
// //         {
// //             $group: {
// //                 _id: "$customerId",
// //                 totalSpent: { $sum: "$totalAmount" },
// //                 transactionCount: { $sum: 1 },
// //                 firstPurchase: { $min: "$createdAt" },
// //                 lastPurchase: { $max: "$createdAt" }
// //             }
// //         },
// //         {
// //             $project: {
// //                 totalSpent: 1,
// //                 transactionCount: 1,
// //                 lifespanDays: {
// //                     $divide: [{ $subtract: ["$lastPurchase", "$firstPurchase"] }, 1000 * 60 * 60 * 24]
// //                 },
// //                 avgOrderValue: { $divide: ["$totalSpent", "$transactionCount"] }
// //             }
// //         },
// //         { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
// //         { $unwind: "$customer" },
// //         { $sort: { totalSpent: -1 } },
// //         { $limit: 50 }
// //     ]);

// //     return stats.map(s => ({
// //         name: s.customer.name,
// //         email: s.customer.email,
// //         totalSpent: s.totalSpent,
// //         avgOrderValue: Math.round(s.avgOrderValue),
// //         lifespanDays: Math.round(s.lifespanDays),
// //         ltv: s.totalSpent 
// //     }));
// // };

// // exports.analyzeChurnRisk = async (orgId, thresholdDays = 90) => {
// //     const cutoffDate = new Date();
// //     cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

// //     return await Customer.aggregate([
// //         { $match: { organizationId: toObjectId(orgId) } },
// //         {
// //             $lookup: {
// //                 from: 'invoices',
// //                 let: { custId: '$_id' },
// //                 pipeline: [
// //                     { $match: { $expr: { $eq: ['$customerId', '$$custId'] } } },
// //                     { $sort: { invoiceDate: -1 } },
// //                     { $limit: 1 }
// //                 ],
// //                 as: 'lastInvoice'
// //             }
// //         },
// //         { $unwind: { path: '$lastInvoice', preserveNullAndEmptyArrays: false } }, 
// //         {
// //             $project: {
// //                 name: 1,
// //                 phone: 1,
// //                 lastPurchaseDate: '$lastInvoice.invoiceDate',
// //                 daysSinceLastPurchase: {
// //                     $divide: [{ $subtract: [new Date(), '$lastInvoice.invoiceDate'] }, 1000 * 60 * 60 * 24]
// //                 }
// //             }
// //         },
// //         { $match: { daysSinceLastPurchase: { $gte: thresholdDays } } }, 
// //         { $sort: { daysSinceLastPurchase: -1 } }
// //     ]);
// // };

// // /**
// //  * 🚀 CRITICAL FIX: Memory-Safe Basket Analysis
// //  * - Limited to last 6 months
// //  * - Uses Map instead of Object for counting
// //  * - Returns top 10 associations only
// //  */
// // exports.performBasketAnalysis = async (orgId, minSupport = 2) => {
// //     const sixMonthsAgo = new Date();
// //     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

// //     const data = await Invoice.aggregate([
// //         { $match: { 
// //             organizationId: toObjectId(orgId), 
// //             invoiceDate: { $gte: sixMonthsAgo },
// //             status: { $nin: ['cancelled', 'draft'] } 
// //         }},
// //         { $project: { items: "$items.productId" } }
// //     ]);

// //     const pairs = new Map();
    
// //     data.forEach(inv => {
// //         const uniqueItems = [...new Set(inv.items.map(String))].sort(); 
// //         for (let i = 0; i < uniqueItems.length; i++) {
// //             for (let j = i + 1; j < uniqueItems.length; j++) {
// //                 const pair = `${uniqueItems[i]}|${uniqueItems[j]}`;
// //                 pairs.set(pair, (pairs.get(pair) || 0) + 1);
// //             }
// //         }
// //     });

// //     const results = [];
// //     for (const [pair, count] of pairs) {
// //         if (count >= minSupport) {
// //             const [p1, p2] = pair.split('|');
// //             results.push({ p1, p2, count });
// //         }
// //     }

// //     const topPairs = results.sort((a, b) => b.count - a.count).slice(0, 10);
    
// //     // Enrich with names
// //     const productIds = [...new Set(topPairs.flatMap(p => [p.p1, p.p2]))];
// //     const products = await Product.find({ _id: { $in: productIds } }).select('name').lean();
// //     const productMap = products.reduce((acc, p) => ({ ...acc, [String(p._id)]: p.name }), {});

// //     return topPairs.map(p => ({
// //         productA: productMap[p.p1] || 'Unknown',
// //         productB: productMap[p.p2] || 'Unknown',
// //         timesBoughtTogether: p.count
// //     }));
// // };

// // exports.analyzePaymentHabits = async (orgId, branchId) => {
// //     const match = { 
// //         organizationId: toObjectId(orgId), 
// //         referenceType: 'payment',
// //         paymentId: { $ne: null } 
// //     };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     return await AccountEntry.aggregate([
// //         { $match: match },
// //         {
// //             $lookup: {
// //                 from: 'invoices',
// //                 localField: 'invoiceId',
// //                 foreignField: '_id',
// //                 as: 'invoice'
// //             }
// //         },
// //         { $unwind: "$invoice" },
// //         {
// //             $project: {
// //                 customerId: 1,
// //                 paymentDate: "$date",
// //                 invoiceDate: "$invoice.invoiceDate",
// //                 amount: "$credit",
// //                 daysToPay: {
// //                     $divide: [{ $subtract: ["$date", "$invoice.invoiceDate"] }, 1000 * 60 * 60 * 24]
// //                 }
// //             }
// //         },
// //         {
// //             $group: {
// //                 _id: "$customerId",
// //                 avgDaysToPay: { $avg: "$daysToPay" },
// //                 totalPaid: { $sum: "$amount" },
// //                 paymentsCount: { $sum: 1 }
// //             }
// //         },
// //         { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
// //         { $unwind: "$customer" },
// //         {
// //             $project: {
// //                 customer: "$customer.name",
// //                 avgDaysToPay: { $round: ["$avgDaysToPay", 1] },
// //                 rating: {
// //                     $switch: {
// //                         branches: [
// //                             { case: { $lte: ["$avgDaysToPay", 7] }, then: "Excellent" },
// //                             { case: { $lte: ["$avgDaysToPay", 30] }, then: "Good" },
// //                             { case: { $lte: ["$avgDaysToPay", 60] }, then: "Fair" }
// //                         ],
// //                         default: "Poor"
// //                     }
// //                 }
// //             }
// //         },
// //         { $sort: { avgDaysToPay: 1 } }
// //     ]);
// // };

// // /* ==========================================================================
// //    8. EXPORT & UTILS
// //    ========================================================================== */

// // /**
// //  * 🚀 OPTIMIZED: Cursor for Export
// //  * Returns a Mongoose cursor for streaming responses in Controller
// //  */
// // exports.getExportCursor = (orgId, type, startDate, endDate) => {
// //     const match = { 
// //         organizationId: toObjectId(orgId),
// //         createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
// //     };

// //     if (type === 'sales') {
// //         return Invoice.find(match)
// //             .select('invoiceNumber invoiceDate grandTotal paymentStatus customerId')
// //             .populate('customerId', 'name')
// //             .lean()
// //             .cursor();
// //     }
// //     // Implement other types as needed
// //     return Invoice.find(match).cursor(); 
// // };

// // // Kept for backward compatibility but refined
// // exports.getExportData = async (orgId, type, startDate, endDate) => {
// //     const match = { 
// //         organizationId: toObjectId(orgId),
// //         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
// //     };

// //     if (type === 'sales') {
// //         const invoices = await Invoice.find(match)
// //             .select('invoiceNumber invoiceDate grandTotal paymentStatus customerId branchId')
// //             .populate('customerId', 'name')
// //             .populate('branchId', 'name')
// //             .lean();
        
// //         return invoices.map(inv => ({
// //             invoiceNumber: inv.invoiceNumber,
// //             date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
// //             customerName: inv.customerId?.name || 'Walk-in',
// //             branch: inv.branchId?.name || 'Main',
// //             amount: inv.grandTotal,
// //             status: inv.paymentStatus
// //         }));
// //     }

// //     if (type === 'inventory') {
// //         const products = await Product.find({ organizationId: toObjectId(orgId) }).lean();
// //         let rows = [];
// //         products.forEach(p => {
// //             if (p.inventory?.length > 0) {
// //                 p.inventory.forEach(inv => {
// //                     rows.push({
// //                         name: p.name,
// //                         sku: p.sku,
// //                         stock: inv.quantity,
// //                         value: inv.quantity * p.purchasePrice,
// //                         reorderLevel: inv.reorderLevel
// //                     });
// //                 });
// //             } else {
// //                 rows.push({ name: p.name, sku: p.sku, stock: 0, value: 0, reorderLevel: 0 });
// //             }
// //         });
// //         return rows;
// //     }
// //     return [];
// // };

// // exports.generateForecast = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     const sixMonthsAgo = new Date();
// //     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

// //     const monthlySales = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: sixMonthsAgo } } },
// //         {
// //             $group: {
// //                 _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
// //                 total: { $sum: "$grandTotal" }
// //             }
// //         },
// //         { $sort: { _id: 1 } }
// //     ]);

// //     if (monthlySales.length < 2) return { revenue: 0, trend: 'stable' };

// //     let xSum = 0, ySum = 0, xySum = 0, x2Sum = 0;
// //     const n = monthlySales.length;

// //     monthlySales.forEach((month, index) => {
// //         const x = index + 1;
// //         const y = month.total;
// //         xSum += x;
// //         ySum += y;
// //         xySum += x * y;
// //         x2Sum += x * x;
// //     });

// //     const denominator = n * x2Sum - xSum * xSum;
// //     if (denominator === 0) return { revenue: monthlySales[n-1].total, trend: 'stable' };

// //     const slope = (n * xySum - xSum * ySum) / denominator;
// //     const intercept = (ySum - slope * xSum) / n;
    
// //     const nextMonthRevenue = Math.round(slope * (n + 1) + intercept);
// //     const trend = slope > 0 ? 'up' : (slope < 0 ? 'down' : 'stable');

// //     return { revenue: Math.max(0, nextMonthRevenue), trend, historical: monthlySales };
// // };

// // exports.getCriticalAlerts = async (orgId, branchId) => {
// //     const [inv, risk] = await Promise.all([
// //         this.getInventoryAnalytics(orgId, branchId),
// //         this.getCustomerRiskStats(orgId, branchId)
// //     ]);
    
// //     return {
// //         lowStockCount: inv.lowStockAlerts.length,
// //         highRiskDebtCount: risk.creditRisk.length,
// //         itemsToReorder: inv.lowStockAlerts.map(i => i.name)
// //     };
// // };

// // exports.getCohortAnalysis = async (orgId, monthsBack = 6) => {
// //     const match = { 
// //         organizationId: toObjectId(orgId),
// //         status: { $ne: 'cancelled' }
// //     };

// //     const start = new Date();
// //     start.setMonth(start.getMonth() - monthsBack);
// //     start.setDate(1); 

// //     return await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: start } } },
// //         {
// //             $group: {
// //                 _id: "$customerId",
// //                 firstPurchase: { $min: "$invoiceDate" },
// //                 allPurchases: { $push: "$invoiceDate" }
// //             }
// //         },
// //         {
// //             $project: {
// //                 cohortMonth: { $dateToString: { format: "%Y-%m", date: "$firstPurchase" } },
// //                 activityMonths: {
// //                     $map: {
// //                         input: "$allPurchases",
// //                         as: "date",
// //                         in: { $dateToString: { format: "%Y-%m", date: "$$date" } }
// //                     }
// //                 }
// //             }
// //         },
// //         { $unwind: "$activityMonths" },
// //         { $group: { _id: { cohort: "$cohortMonth", activity: "$activityMonths" }, count: { $addToSet: "$_id" } } },
// //         { $project: { cohort: "$_id.cohort", activity: "$_id.activity", count: { $size: "$count" } } },
// //         { $sort: { cohort: 1, activity: 1 } }
// //     ]);
// // };

// // exports.getCustomerRFMAnalysis = async (orgId) => {
// //     const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    
// //     const rfmRaw = await Invoice.aggregate([
// //         { $match: match },
// //         {
// //             $group: {
// //                 _id: "$customerId",
// //                 lastPurchaseDate: { $max: "$invoiceDate" },
// //                 frequency: { $sum: 1 },
// //                 monetary: { $sum: "$grandTotal" }
// //             }
// //         }
// //     ]);

// //     const now = new Date();
// //     const scored = rfmRaw.map(c => {
// //         const daysSinceLast = Math.floor((now - c.lastPurchaseDate) / (1000 * 60 * 60 * 24));
        
// //         let rScore = daysSinceLast < 30 ? 3 : (daysSinceLast < 90 ? 2 : 1);
// //         let fScore = c.frequency > 10 ? 3 : (c.frequency > 3 ? 2 : 1);
// //         let mScore = c.monetary > 50000 ? 3 : (c.monetary > 10000 ? 2 : 1);
        
// //         let segment = 'Standard';
// //         if (rScore === 3 && fScore === 3 && mScore === 3) segment = 'Champion';
// //         else if (rScore === 1 && mScore === 3) segment = 'At Risk';
// //         else if (rScore === 3 && fScore === 1) segment = 'New Customer';
// //         else if (fScore === 3) segment = 'Loyal';

// //         return { ...c, segment };
// //     });

// //     const segments = { Champion: 0, 'At Risk': 0, Loyal: 0, 'New Customer': 0, Standard: 0 };
// //     scored.forEach(s => {
// //         if (segments[s.segment] !== undefined) segments[s.segment]++;
// //         else segments.Standard++;
// //     });

// //     return segments;
// // };

// // // const mongoose = require('mongoose');
// // // const Invoice = require('../models/invoiceModel');
// // // const Purchase = require('../models/purchaseModel');
// // // const Product = require('../models/productModel');
// // // const Sales = require('../models/salesModel');
// // // const Payment = require('../models/paymentModel');
// // // const AccountEntry = require('../models/accountEntryModel');
// // // const AuditLog = require('../models/auditLogModel');
// // // const Customer = require('../models/customerModel');
// // // const User = require('../models/userModel'); // Added for Staff Performance
// // // const { Parser } = require('json2csv')
// // // // Helper to cast ID
// // // const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// // // // Helper for Growth Calculation
// // // const calculateGrowth = (current, previous) => {
// // //     if (previous === 0) return current === 0 ? 0 : 100;
// // //     return Math.round(((current - previous) / previous) * 100);
// // // };

// // // // ===========================================================================
// // // // 1. EXECUTIVE DASHBOARD (Existing)
// // // // ===========================================================================
// // // exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);

// // //     const start = new Date(startDate);
// // //     const end = new Date(endDate);
// // //     const duration = end - start;
// // //     const prevStart = new Date(start - duration);
// // //     const prevEnd = new Date(start);

// // //     // SALES STATS (Current vs Previous)
// // //     const salesStats = await Invoice.aggregate([
// // //         {
// // //             $facet: {
// // //                 current: [
// // //                     { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //                     { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
// // //                 ],
// // //                 previous: [
// // //                     { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
// // //                     { $group: { _id: null, total: { $sum: '$grandTotal' } } }
// // //                 ]
// // //             }
// // //         }
// // //     ]);

// // //     // PURCHASE STATS (Current vs Previous)
// // //     const purchaseStats = await Purchase.aggregate([
// // //         {
// // //             $facet: {
// // //                 current: [
// // //                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //                     { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
// // //                 ],
// // //                 previous: [
// // //                     { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
// // //                     { $group: { _id: null, total: { $sum: '$grandTotal' } } }
// // //                 ]
// // //             }
// // //         }
// // //     ]);

// // //     const curSales = salesStats[0].current[0] || { total: 0, count: 0, due: 0 };
// // //     const prevSales = salesStats[0].previous[0] || { total: 0 };
// // //     const curPurch = purchaseStats[0].current[0] || { total: 0, count: 0, due: 0 };
// // //     const prevPurch = purchaseStats[0].previous[0] || { total: 0 };

// // //     return {
// // //         totalRevenue: { value: curSales.total, count: curSales.count, growth: calculateGrowth(curSales.total, prevSales.total) },
// // //         totalExpense: { value: curPurch.total, count: curPurch.count, growth: calculateGrowth(curPurch.total, prevPurch.total) },
// // //         netProfit: { value: curSales.total - curPurch.total, growth: calculateGrowth((curSales.total - curPurch.total), (prevSales.total - prevPurch.total)) },
// // //         outstanding: { receivables: curSales.due, payables: curPurch.due }
// // //     };
// // // };

// // // exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'day') => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);
    
// // //     const start = new Date(startDate);
// // //     const end = new Date(endDate);
// // //     const dateFormat = interval === 'month' ? '%Y-%m' : '%Y-%m-%d';

// // //     // Merged Timeline (Income vs Expense)
// // //     const timeline = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //         { $project: { date: '$invoiceDate', amount: '$grandTotal', type: 'Income' } },
// // //         {
// // //             $unionWith: {
// // //                 coll: 'purchases',
// // //                 pipeline: [
// // //                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //                     { $project: { date: '$purchaseDate', amount: '$grandTotal', type: 'Expense' } }
// // //                 ]
// // //             }
// // //         },
// // //         {
// // //             $group: {
// // //                 _id: { $dateToString: { format: dateFormat, date: '$date' } },
// // //                 income: { $sum: { $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0] } },
// // //                 expense: { $sum: { $cond: [{ $eq: ['$type', 'Expense'] }, '$amount', 0] } }
// // //             }
// // //         },
// // //         { $sort: { _id: 1 } },
// // //         { $project: { date: '$_id', income: 1, expense: 1, profit: { $subtract: ['$income', '$expense'] }, _id: 0 } }
// // //     ]);

// // //     return { timeline };
// // // };

// // // // ===========================================================================
// // // // 2. FINANCIAL INTELLIGENCE (Cash Flow & Tax)
// // // // ===========================================================================
// // // exports.getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);
// // //     const start = new Date(startDate);
// // //     const end = new Date(endDate);

// // //     // 1. Payment Mode Breakdown
// // //     const modes = await Payment.aggregate([
// // //         { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
// // //         { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
// // //         { $project: { name: '$_id', value: 1, _id: 0 } }
// // //     ]);

// // //     // 2. Aging Analysis (Receivables - How old is the debt?)
// // //     // Using current date relative to Due Date
// // //     const now = new Date();
// // //     const aging = await Invoice.aggregate([
// // //         { $match: { ...match, paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' } } },
// // //         {
// // //             $project: {
// // //                 balanceAmount: 1,
// // //                 daysOverdue: { 
// // //                     $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24] 
// // //                 }
// // //             }
// // //         },
// // //         {
// // //             $bucket: {
// // //                 groupBy: "$daysOverdue",
// // //                 boundaries: [0, 30, 60, 90, 365],
// // //                 default: "90+",
// // //                 output: {
// // //                     totalAmount: { $sum: "$balanceAmount" },
// // //                     count: { $sum: 1 }
// // //                 }
// // //             }
// // //         }
// // //     ]);

// // //     return { paymentModes: modes, agingReport: aging };
// // // };

// // // exports.getTaxStats = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);
// // //     const start = new Date(startDate);
// // //     const end = new Date(endDate);

// // //     const stats = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //         { $group: { _id: null, outputTax: { $sum: '$totalTax' }, taxableSales: { $sum: '$subTotal' } } },
// // //         {
// // //             $unionWith: {
// // //                 coll: 'purchases',
// // //                 pipeline: [
// // //                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //                     { $group: { _id: null, inputTax: { $sum: '$totalTax' }, taxablePurchase: { $sum: '$subTotal' } } }
// // //                 ]
// // //             }
// // //         },
// // //         {
// // //             $group: {
// // //                 _id: null,
// // //                 totalOutputTax: { $sum: '$outputTax' },
// // //                 totalInputTax: { $sum: '$inputTax' },
// // //                 totalTaxableSales: { $sum: '$taxableSales' },
// // //                 totalTaxablePurchase: { $sum: '$taxablePurchase' }
// // //             }
// // //         },
// // //         {
// // //             $project: {
// // //                 _id: 0,
// // //                 inputTax: '$totalInputTax',
// // //                 outputTax: '$totalOutputTax',
// // //                 netPayable: { $subtract: ['$totalOutputTax', '$totalInputTax'] }
// // //             }
// // //         }
// // //     ]);

// // //     return stats[0] || { inputTax: 0, outputTax: 0, netPayable: 0 };
// // // };

// // // // ===========================================================================
// // // // 3. PRODUCT PERFORMANCE (Margins & Dead Stock)
// // // // ===========================================================================
// // // exports.getProductPerformanceStats = async (orgId, branchId) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     // Branch filtering applies to inventory lookup
    
// // //     // 1. High Margin Products (Selling Price - Purchase Price)
// // //     // NOTE: This assumes current price. For historical accuracy, we'd query invoice items.
// // //     const highMargin = await Product.aggregate([
// // //         { $match: { ...match, isActive: true } },
// // //         { 
// // //             $project: { 
// // //                 name: 1, 
// // //                 sku: 1,
// // //                 margin: { $subtract: ['$sellingPrice', '$purchasePrice'] },
// // //                 marginPercent: {
// // //                      $cond: [
// // //                         { $eq: ['$purchasePrice', 0] }, 
// // //                         100, 
// // //                         { $multiply: [{ $divide: [{ $subtract: ['$sellingPrice', '$purchasePrice'] }, '$purchasePrice'] }, 100] }
// // //                      ]
// // //                 }
// // //             } 
// // //         },
// // //         { $sort: { margin: -1 } },
// // //         { $limit: 10 }
// // //     ]);

// // //     // 2. Dead Stock (Items with Inventory > 0 but NO Sales in last 90 days)
// // //     const ninetyDaysAgo = new Date();
// // //     ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

// // //     // Get IDs of sold products
// // //     const soldProducts = await Invoice.distinct('items.productId', { 
// // //         ...match, 
// // //         invoiceDate: { $gte: ninetyDaysAgo } 
// // //     });

// // //     const deadStock = await Product.aggregate([
// // //         { 
// // //             $match: { 
// // //                 ...match, 
// // //                 _id: { $nin: soldProducts }, // Not in sold list
// // //                 isActive: true
// // //             } 
// // //         },
// // //         { $unwind: "$inventory" }, // Check actual stock
// // //         { $match: { "inventory.quantity": { $gt: 0 } } }, // Has stock
// // //         {
// // //             $project: {
// // //                 name: 1,
// // //                 sku: 1,
// // //                 stockQuantity: "$inventory.quantity",
// // //                 value: { $multiply: ["$inventory.quantity", "$purchasePrice"] }
// // //             }
// // //         },
// // //         { $limit: 20 }
// // //     ]);

// // //     return { highMargin, deadStock };
// // // };

// // // exports.getInventoryAnalytics = async (orgId, branchId) => {
// // //     const match = { organizationId: toObjectId(orgId) };
    
// // //     // 1. Low Stock Products
// // //     const lowStock = await Product.aggregate([
// // //         { $match: { ...match, isActive: true } },
// // //         { $unwind: "$inventory" },
// // //         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
// // //         {
// // //             $project: {
// // //                 name: 1, sku: 1,
// // //                 currentStock: "$inventory.quantity",
// // //                 reorderLevel: "$inventory.reorderLevel",
// // //                 branchId: "$inventory.branchId",
// // //                 isLow: { $lte: ["$inventory.quantity", "$inventory.reorderLevel"] }
// // //             }
// // //         },
// // //         { $match: { isLow: true } },
// // //         { $limit: 10 },
// // //         { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
// // //         { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
// // //         { $project: { name: 1, sku: 1, currentStock: 1, reorderLevel: 1, branchName: "$branch.name" } }
// // //     ]);

// // //     // 2. Stock Valuation
// // //     const valuation = await Product.aggregate([
// // //         { $match: { ...match, isActive: true } },
// // //         { $unwind: "$inventory" },
// // //         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
// // //         {
// // //             $group: {
// // //                 _id: null,
// // //                 totalValue: { $sum: { $multiply: ["$inventory.quantity", "$purchasePrice"] } },
// // //                 totalItems: { $sum: "$inventory.quantity" },
// // //                 productCount: { $sum: 1 }
// // //             }
// // //         }
// // //     ]);

// // //     return {
// // //         lowStockAlerts: lowStock,
// // //         inventoryValuation: valuation[0] || { totalValue: 0, totalItems: 0, productCount: 0 }
// // //     };
// // // };

// // // exports.getProcurementStats = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);
// // //     const start = new Date(startDate);
// // //     const end = new Date(endDate);

// // //     // Top Suppliers by Spend
// // //     const topSuppliers = await Purchase.aggregate([
// // //         { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //         { $group: { _id: '$supplierId', totalSpend: { $sum: '$grandTotal' }, bills: { $sum: 1 } } },
// // //         { $sort: { totalSpend: -1 } },
// // //         { $limit: 5 },
// // //         { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
// // //         { $unwind: '$supplier' },
// // //         { $project: { name: '$supplier.companyName', totalSpend: 1, bills: 1 } }
// // //     ]);

// // //     return { topSuppliers };
// // // };

// // // // ===========================================================================
// // // // 4. CUSTOMER INSIGHTS (Risk & Acquisition)
// // // // ===========================================================================
// // // exports.getCustomerRiskStats = async (orgId, branchId) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     // Branch logic for customers is usually org-wide, but can apply if needed

// // //     // 1. Top Debtors (Credit Risk)
// // //     const creditRisk = await Customer.find({ 
// // //         ...match, 
// // //         outstandingBalance: { $gt: 0 } 
// // //     })
// // //     .sort({ outstandingBalance: -1 })
// // //     .limit(10)
// // //     .select('name phone outstandingBalance creditLimit');

// // //     // 2. Churn Risk (No purchase in 6 months)
// // //     const sixMonthsAgo = new Date();
// // //     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

// // //     const activeIds = await Invoice.distinct('customerId', { 
// // //         ...match, 
// // //         invoiceDate: { $gte: sixMonthsAgo } 
// // //     });

// // //     const atRiskCustomers = await Customer.countDocuments({
// // //         ...match,
// // //         _id: { $nin: activeIds },
// // //         type: 'business' // Usually care more about B2B churn
// // //     });

// // //     return { creditRisk, churnCount: atRiskCustomers };
// // // };

// // // exports.getLeaderboards = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);
// // //     const start = new Date(startDate);
// // //     const end = new Date(endDate);

// // //     const data = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// // //         {
// // //             $facet: {
// // //                 topCustomers: [
// // //                     { $group: { _id: '$customerId', totalSpent: { $sum: '$grandTotal' }, transactions: { $sum: 1 } } },
// // //                     { $sort: { totalSpent: -1 } },
// // //                     { $limit: 5 },
// // //                     { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
// // //                     { $unwind: '$customer' },
// // //                     { $project: { name: '$customer.name', phone: '$customer.phone', totalSpent: 1, transactions: 1 } }
// // //                 ],
// // //                 topProducts: [
// // //                     { $unwind: '$items' },
// // //                     {
// // //                         $group: {
// // //                             _id: '$items.productId',
// // //                             name: { $first: '$items.name' },
// // //                             soldQty: { $sum: '$items.quantity' },
// // //                             revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
// // //                         }
// // //                     },
// // //                     { $sort: { soldQty: -1 } },
// // //                     { $limit: 5 }
// // //                 ]
// // //             }
// // //         }
// // //     ]);

// // //     return {
// // //         topCustomers: data[0].topCustomers,
// // //         topProducts: data[0].topProducts
// // //     };
// // // };

// // // // ===========================================================================
// // // // 5. OPERATIONAL METRICS (Staff, Discounts, Efficiency)
// // // // ===========================================================================
// // // exports.getOperationalStats = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);
// // //     const start = new Date(startDate);
// // //     const end = new Date(endDate);

// // //     const data = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } }, // Match ALL statuses (including cancelled for analysis)
// // //         {
// // //             $facet: {
// // //                 // A. Discount Analysis
// // //                 discounts: [
// // //                     { $match: { status: { $ne: 'cancelled' } } },
// // //                     { $group: { 
// // //                         _id: null, 
// // //                         totalDiscount: { $sum: '$totalDiscount' }, 
// // //                         totalSales: { $sum: '$subTotal' } 
// // //                       }
// // //                     },
// // //                     { $project: { 
// // //                         discountRate: { 
// // //                             $cond: [{ $eq: ['$totalSales', 0] }, 0, { $multiply: [{ $divide: ['$totalDiscount', '$totalSales'] }, 100] }]
// // //                         },
// // //                         totalDiscount: 1
// // //                       }
// // //                     }
// // //                 ],
// // //                 // B. Order Efficiency (AOV & Cancellations)
// // //                 efficiency: [
// // //                     {
// // //                         $group: {
// // //                             _id: null,
// // //                             totalOrders: { $sum: 1 },
// // //                             cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
// // //                             successfulRevenue: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$grandTotal', 0] } },
// // //                             successfulCount: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } }
// // //                         }
// // //                     },
// // //                     {
// // //                         $project: {
// // //                             cancellationRate: { $multiply: [{ $divide: ['$cancelledOrders', '$totalOrders'] }, 100] },
// // //                             averageOrderValue: { 
// // //                                 $cond: [{ $eq: ['$successfulCount', 0] }, 0, { $divide: ['$successfulRevenue', '$successfulCount'] }]
// // //                             }
// // //                         }
// // //                     }
// // //                 ],
// // //                 // C. Staff Performance (Top Sales Reps)
// // //                 staffPerformance: [
// // //                     { $match: { status: { $ne: 'cancelled' } } },
// // //                     { $group: { _id: '$createdBy', revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
// // //                     { $sort: { revenue: -1 } },
// // //                     { $limit: 5 },
// // //                     { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
// // //                     { $unwind: '$user' },
// // //                     { $project: { name: '$user.name', revenue: 1, count: 1 } }
// // //                 ]
// // //             }
// // //         }
// // //     ]);

// // //     return {
// // //         discountMetrics: data[0].discounts[0] || { totalDiscount: 0, discountRate: 0 },
// // //         orderEfficiency: data[0].efficiency[0] || { cancellationRate: 0, averageOrderValue: 0 },
// // //         topStaff: data[0].staffPerformance
// // //     };
// // // };

// // // // ===========================================================================
// // // // 🆕 1. BRANCH COMPARISON (Strategic)
// // // // ===========================================================================
// // // exports.getBranchComparisonStats = async (orgId, startDate, endDate) => {
// // //     const match = { 
// // //         organizationId: toObjectId(orgId),
// // //         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
// // //         status: { $ne: 'cancelled' }
// // //     };

// // //     const stats = await Invoice.aggregate([
// // //         { $match: match },
// // //         {
// // //             $group: {
// // //                 _id: '$branchId',
// // //                 revenue: { $sum: '$grandTotal' },
// // //                 invoiceCount: { $sum: 1 },
// // //                 avgBasketValue: { $avg: '$grandTotal' }
// // //             }
// // //         },
// // //         { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
// // //         { $unwind: '$branch' },
// // //         {
// // //             $project: {
// // //                 branchName: '$branch.name',
// // //                 revenue: 1,
// // //                 invoiceCount: 1,
// // //                 avgBasketValue: { $round: ['$avgBasketValue', 0] }
// // //             }
// // //         },
// // //         { $sort: { revenue: -1 } }
// // //     ]);

// // //     return stats;
// // // };

// // // // ===========================================================================
// // // // 🆕 2. PROFITABILITY (Gross Profit = Sales - COGS)
// // // // ===========================================================================
// // // exports.getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);
    
// // //     // We need to unwind items to calculate profit per item
// // //     // Profit = (Selling Price - Purchase Cost) * Qty
// // //     // Note: Ideally, purchase cost should be historical (from batch). 
// // //     // Here we approximate using current product purchase price (COGS).

// // //     const data = await Invoice.aggregate([
// // //         { 
// // //             $match: { 
// // //                 ...match, 
// // //                 invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
// // //                 status: { $ne: 'cancelled' }
// // //             } 
// // //         },
// // //         { $unwind: '$items' },
// // //         {
// // //             $lookup: {
// // //                 from: 'products',
// // //                 localField: 'items.productId',
// // //                 foreignField: '_id',
// // //                 as: 'product'
// // //             }
// // //         },
// // //         { $unwind: '$product' },
// // //         {
// // //             $group: {
// // //                 _id: null,
// // //                 totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
// // //                 totalCOGS: { $sum: { $multiply: ['$product.purchasePrice', '$items.quantity'] } }
// // //             }
// // //         },
// // //         {
// // //             $project: {
// // //                 _id: 0,
// // //                 totalRevenue: 1,
// // //                 totalCOGS: 1,
// // //                 grossProfit: { $subtract: ['$totalRevenue', '$totalCOGS'] },
// // //                 marginPercent: {
// // //                     $cond: [
// // //                         { $eq: ['$totalRevenue', 0] },
// // //                         0,
// // //                         { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCOGS'] }, '$totalRevenue'] }, 100] }
// // //                     ]
// // //                 }
// // //             }
// // //         }
// // //     ]);

// // //     return data[0] || { totalRevenue: 0, totalCOGS: 0, grossProfit: 0, marginPercent: 0 };
// // // };

// // // // ===========================================================================
// // // // 🆕 3. STAFF PERFORMANCE (Detailed)
// // // // ===========================================================================
// // // exports.getEmployeePerformance = async (orgId, branchId, startDate, endDate) => {
// // //     const match = { 
// // //         organizationId: toObjectId(orgId),
// // //         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
// // //         status: { $ne: 'cancelled' }
// // //     };
// // //     if (branchId) match.branchId = toObjectId(branchId);

// // //     const stats = await Invoice.aggregate([
// // //         { $match: match },
// // //         {
// // //             $group: {
// // //                 _id: '$createdBy',
// // //                 totalSales: { $sum: '$grandTotal' },
// // //                 invoiceCount: { $sum: 1 },
// // //                 totalDiscountGiven: { $sum: '$totalDiscount' }
// // //             }
// // //         },
// // //         { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
// // //         { $unwind: '$user' },
// // //         {
// // //             $project: {
// // //                 name: '$user.name',
// // //                 email: '$user.email',
// // //                 totalSales: 1,
// // //                 invoiceCount: 1,
// // //                 totalDiscountGiven: 1,
// // //                 avgTicketSize: { $divide: ['$totalSales', '$invoiceCount'] }
// // //             }
// // //         },
// // //         { $sort: { totalSales: -1 } }
// // //     ]);

// // //     return stats;
// // // };

// // // // ===========================================================================
// // // // 🆕 4. PEAK HOURS (Heatmap)
// // // // ===========================================================================
// // // exports.getPeakHourAnalysis = async (orgId, branchId) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);

// // //     // Look back 30 days for trend analysis
// // //     const thirtyDaysAgo = new Date();
// // //     thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

// // //     const heatmap = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
// // //         {
// // //             $project: {
// // //                 dayOfWeek: { $dayOfWeek: '$invoiceDate' }, // 1 (Sun) - 7 (Sat)
// // //                 hour: { $hour: '$invoiceDate' }
// // //             }
// // //         },
// // //         {
// // //             $group: {
// // //                 _id: { day: '$dayOfWeek', hour: '$hour' },
// // //                 count: { $sum: 1 }
// // //             }
// // //         },
// // //         {
// // //             $project: {
// // //                 day: '$_id.day',
// // //                 hour: '$_id.hour',
// // //                 count: 1,
// // //                 _id: 0
// // //             }
// // //         },
// // //         { $sort: { day: 1, hour: 1 } }
// // //     ]);

// // //     return heatmap;
// // // };

// // // // ===========================================================================
// // // // 🆕 5. DEAD STOCK (No Sales > X Days)
// // // // ===========================================================================
// // // exports.getDeadStockAnalysis = async (orgId, branchId, daysThreshold = 90) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     const cutoffDate = new Date();
// // //     cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysThreshold));

// // //     // 1. Find all products sold after the cutoff date
// // //     const soldProductIds = await Invoice.distinct('items.productId', {
// // //         ...match,
// // //         invoiceDate: { $gte: cutoffDate }
// // //     });

// // //     // 2. Find products NOT in that list but have stock > 0
// // //     // Note: Branch filter applies to inventory subdoc
// // //     const deadStock = await Product.aggregate([
// // //         { $match: { ...match, _id: { $nin: soldProductIds }, isActive: true } },
// // //         { $unwind: '$inventory' },
// // //         ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
// // //         { $match: { 'inventory.quantity': { $gt: 0 } } },
// // //         {
// // //             $project: {
// // //                 name: 1,
// // //                 sku: 1,
// // //                 category: 1,
// // //                 quantity: '$inventory.quantity',
// // //                 value: { $multiply: ['$inventory.quantity', '$purchasePrice'] },
// // //                 daysInactive: { $literal: daysThreshold } // Just a label
// // //             }
// // //         },
// // //         { $sort: { value: -1 } }
// // //     ]);

// // //     return deadStock;
// // // };

// // // // ===========================================================================
// // // // 🆕 6. STOCK PREDICTIONS (Run Rate)
// // // // ===========================================================================
// // // exports.getInventoryRunRate = async (orgId, branchId) => {
// // //     const match = { organizationId: toObjectId(orgId) };
// // //     if (branchId) match.branchId = toObjectId(branchId);

// // //     // Calculate daily average sales over last 30 days
// // //     const thirtyDaysAgo = new Date();
// // //     thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

// // //     const dailySales = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
// // //         { $unwind: '$items' },
// // //         {
// // //             $group: {
// // //                 _id: '$items.productId',
// // //                 totalSold: { $sum: '$items.quantity' }
// // //             }
// // //         },
// // //         {
// // //             $project: {
// // //                 avgDailySales: { $divide: ['$totalSold', 30] }
// // //             }
// // //         }
// // //     ]);

// // //     // Map sales velocity to current stock to find "Days Left"
// // //     // This requires a join (lookup) which can be heavy.
// // //     // For efficiency, we'll fetch products and map in JS or use a complex aggregation.
// // //     // Let's use aggregation:

// // //     const predictions = await Product.aggregate([
// // //         { $match: { ...match, isActive: true } },
// // //         { $unwind: '$inventory' },
// // //         ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
// // //         {
// // //             $lookup: {
// // //                 from: 'invoices', // Self-join simulation via pipeline is expensive, so we use the pre-calculated logic approach usually.
// // //                 // Simplified: We will just assume the 'dailySales' array calculated above is passed, 
// // //                 // but MongoDB 5.0+ allows $lookup with pipeline on collections.
// // //                 // Optimized approach: Join with a view or simple lookup.
// // //                 // Here, let's just return low stock based on static reorder level for safety if velocity is complex,
// // //                 // BUT let's try a direct lookup for recent sales count.
// // //                 let: { pid: '$_id' },
// // //                 pipeline: [
// // //                    { $match: { $expr: { $and: [
// // //                        { $eq: ['$organizationId', toObjectId(orgId)] },
// // //                        { $gte: ['$invoiceDate', thirtyDaysAgo] }
// // //                    ]}}},
// // //                    { $unwind: '$items' },
// // //                    { $match: { $expr: { $eq: ['$items.productId', '$$pid'] } } },
// // //                    { $group: { _id: null, sold: { $sum: '$items.quantity' } } }
// // //                 ],
// // //                 as: 'salesStats'
// // //             }
// // //         },
// // //         {
// // //             $addFields: {
// // //                 last30DaysSold: { $ifNull: [{ $first: '$salesStats.sold' }, 0] }
// // //             }
// // //         },
// // //         {
// // //             $addFields: {
// // //                 dailyVelocity: { $divide: ['$last30DaysSold', 30] }
// // //             }
// // //         },
// // //         {
// // //             $match: { dailyVelocity: { $gt: 0 } } // Only predict for items selling
// // //         },
// // //         {
// // //             $project: {
// // //                 name: 1,
// // //                 currentStock: '$inventory.quantity',
// // //                 dailyVelocity: 1,
// // //                 daysUntilStockout: { $divide: ['$inventory.quantity', '$dailyVelocity'] }
// // //             }
// // //         },
// // //         { $match: { daysUntilStockout: { $lte: 14 } } }, // Only warn if < 14 days left
// // //         { $sort: { daysUntilStockout: 1 } }
// // //     ]);

// // //     return predictions;
// // // };

// // // // ===========================================================================
// // // // 🆕 7. DEBTOR AGING (Who owes money?)
// // // // ===========================================================================
// // // exports.getDebtorAging = async (orgId, branchId) => {
// // //     const match = { 
// // //         organizationId: toObjectId(orgId),
// // //         paymentStatus: { $ne: 'paid' },
// // //         status: { $ne: 'cancelled' },
// // //         balanceAmount: { $gt: 0 }
// // //     };
// // //     if (branchId) match.branchId = toObjectId(branchId);

// // //     const now = new Date();

// // //     const aging = await Invoice.aggregate([
// // //         { $match: match },
// // //         {
// // //             $project: {
// // //                 customerId: 1,
// // //                 invoiceNumber: 1,
// // //                 balanceAmount: 1,
// // //                 dueDate: { $ifNull: ['$dueDate', '$invoiceDate'] },
// // //                 daysOverdue: { 
// // //                     $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24] 
// // //                 }
// // //             }
// // //         },
// // //         {
// // //             $bucket: {
// // //                 groupBy: "$daysOverdue",
// // //                 boundaries: [0, 31, 61, 91], // 0-30, 31-60, 61-90, 91+
// // //                 default: "91+",
// // //                 output: {
// // //                     totalAmount: { $sum: "$balanceAmount" },
// // //                     invoices: { $push: { number: "$invoiceNumber", amount: "$balanceAmount", cust: "$customerId" } }
// // //                 }
// // //             }
// // //         }
// // //     ]);

// // //     // Map bucket IDs to readable labels
// // //     const labels = { 0: '0-30 Days', 31: '31-60 Days', 61: '61-90 Days', '91+': '90+ Days' };
// // //     return aging.map(a => ({
// // //         range: labels[a._id] || a._id,
// // //         amount: a.totalAmount,
// // //         count: a.invoices.length
// // //     }));
// // // };

// // // // ===========================================================================
// // // // 🆕 8. SECURITY PULSE (Audit Logs)
// // // // ===========================================================================
// // // exports.getSecurityPulse = async (orgId, startDate, endDate) => {
// // //     if (!AuditLog) return { recentEvents: [], riskyActions: 0 };

// // //     const match = { 
// // //         organizationId: toObjectId(orgId),
// // //         createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
// // //     };

// // //     const logs = await AuditLog.find(match)
// // //         .sort({ createdAt: -1 })
// // //         .limit(20)
// // //         .populate('userId', 'name email');
    
// // //     // Count specific risky actions
// // //     const riskCount = await AuditLog.countDocuments({
// // //         ...match,
// // //         action: { $in: ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE'] }
// // //     });

// // //     return { recentEvents: logs, riskyActions: riskCount };
// // // };

// // // /* -------------------------------------------------------------
// // //  * 1. Calculate Customer Lifetime Value (LTV)
// // //  * Formula: Avg Purchase Value * Purchase Freq * Lifespan
// // //  ------------------------------------------------------------- */
// // // exports.calculateLTV = async (orgId, branchId) => {
// // //     const match = { organizationId: new mongoose.Types.ObjectId(orgId), status: 'active' };
// // //     if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);

// // //     const stats = await Sales.aggregate([
// // //         { $match: match },
// // //         {
// // //             $group: {
// // //                 _id: "$customerId",
// // //                 totalSpent: { $sum: "$totalAmount" },
// // //                 transactionCount: { $sum: 1 },
// // //                 firstPurchase: { $min: "$createdAt" },
// // //                 lastPurchase: { $max: "$createdAt" }
// // //             }
// // //         },
// // //         {
// // //             $project: {
// // //                 totalSpent: 1,
// // //                 transactionCount: 1,
// // //                 lifespanDays: {
// // //                     $divide: [{ $subtract: ["$lastPurchase", "$firstPurchase"] }, 1000 * 60 * 60 * 24]
// // //                 },
// // //                 avgOrderValue: { $divide: ["$totalSpent", "$transactionCount"] }
// // //             }
// // //         },
// // //         {
// // //             $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' }
// // //         },
// // //         { $unwind: "$customer" },
// // //         { $sort: { totalSpent: -1 } }
// // //     ]);

// // //     return stats.map(s => ({
// // //         name: s.customer.name,
// // //         email: s.customer.email,
// // //         totalSpent: s.totalSpent,
// // //         avgOrderValue: Math.round(s.avgOrderValue),
// // //         lifespanDays: Math.round(s.lifespanDays),
// // //         // Simple Historic LTV
// // //         ltv: s.totalSpent 
// // //     })).slice(0, 50); // Top 50 High Value Customers
// // // };

// // // /* -------------------------------------------------------------
// // //  * 2. Analyze Churn Risk (Customers "cooling down")
// // //  ------------------------------------------------------------- */
// // // exports.analyzeChurnRisk = async (orgId, thresholdDays = 90) => {
// // //     const cutoffDate = new Date();
// // //     cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

// // //     return await Customer.aggregate([
// // //         { $match: { organizationId: new mongoose.Types.ObjectId(orgId) } },
// // //         {
// // //             $lookup: {
// // //                 from: 'invoices',
// // //                 let: { custId: '$_id' },
// // //                 pipeline: [
// // //                     { $match: { $expr: { $eq: ['$customerId', '$$custId'] } } },
// // //                     { $sort: { invoiceDate: -1 } },
// // //                     { $limit: 1 }
// // //                 ],
// // //                 as: 'lastInvoice'
// // //             }
// // //         },
// // //         { $unwind: { path: '$lastInvoice', preserveNullAndEmptyArrays: false } }, // Only customers who bought before
// // //         {
// // //             $project: {
// // //                 name: 1,
// // //                 phone: 1,
// // //                 lastPurchaseDate: '$lastInvoice.invoiceDate',
// // //                 totalPurchases: 1,
// // //                 daysSinceLastPurchase: {
// // //                     $divide: [{ $subtract: [new Date(), '$lastInvoice.invoiceDate'] }, 1000 * 60 * 60 * 24]
// // //                 }
// // //             }
// // //         },
// // //         { $match: { daysSinceLastPurchase: { $gte: thresholdDays } } }, // The Risk Threshold
// // //         { $sort: { daysSinceLastPurchase: -1 } }
// // //     ]);
// // // };

// // // /* -------------------------------------------------------------
// // //  * 3. Market Basket Analysis (What sells together?)
// // //  ------------------------------------------------------------- */
// // // exports.performBasketAnalysis = async (orgId, minSupport = 2) => {
// // //     // 1. Get all items in invoices
// // //     const data = await Invoice.aggregate([
// // //         { $match: { organizationId: new mongoose.Types.ObjectId(orgId), status: { $nin: ['cancelled', 'draft'] } } },
// // //         { $project: { items: "$items.productId" } }
// // //     ]);

// // //     // 2. Simple Co-occurrence counting (In-memory for speed on smaller datasets)
// // //     const pairs = {};
    
// // //     data.forEach(inv => {
// // //         const uniqueItems = [...new Set(inv.items.map(String))].sort(); // Remove dupes, sort for consistency
// // //         for (let i = 0; i < uniqueItems.length; i++) {
// // //             for (let j = i + 1; j < uniqueItems.length; j++) {
// // //                 const pair = `${uniqueItems[i]}|${uniqueItems[j]}`;
// // //                 pairs[pair] = (pairs[pair] || 0) + 1;
// // //             }
// // //         }
// // //     });

// // //     // 3. Format & Enrich
// // //     const results = [];
// // //     for (const [pair, count] of Object.entries(pairs)) {
// // //         if (count >= minSupport) {
// // //             const [p1, p2] = pair.split('|');
// // //             results.push({ p1, p2, count });
// // //         }
// // //     }

// // //     // Populate Names (Optional Optimization: Do this in aggregation if possible, but this is cleaner for complex logic)
// // //     const topPairs = results.sort((a, b) => b.count - a.count).slice(0, 10);
    
// // //     // Fetch product names for the IDs
// // //     const productIds = [...new Set(topPairs.flatMap(p => [p.p1, p.p2]))];
// // //     const products = await Product.find({ _id: { $in: productIds } }).select('name').lean();
// // //     const productMap = products.reduce((acc, p) => ({ ...acc, [String(p._id)]: p.name }), {});

// // //     return topPairs.map(p => ({
// // //         productA: productMap[p.p1] || 'Unknown',
// // //         productB: productMap[p.p2] || 'Unknown',
// // //         timesBoughtTogether: p.count
// // //     }));
// // // };

// // // /* -------------------------------------------------------------
// // //  * 4. Payment Behavior (DSO Analysis)
// // //  ------------------------------------------------------------- */
// // // exports.analyzePaymentHabits = async (orgId, branchId) => {
// // //     const match = { 
// // //         organizationId: new mongoose.Types.ObjectId(orgId), 
// // //         referenceType: 'payment',
// // //         paymentId: { $ne: null } // Only actual payments
// // //     };
// // //     if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);

// // //     // Join Payments with Invoices to find the date difference
// // //     return await AccountEntry.aggregate([
// // //         { $match: match },
// // //         {
// // //             $lookup: {
// // //                 from: 'invoices',
// // //                 localField: 'invoiceId',
// // //                 foreignField: '_id',
// // //                 as: 'invoice'
// // //             }
// // //         },
// // //         { $unwind: "$invoice" },
// // //         {
// // //             $project: {
// // //                 customerId: 1,
// // //                 paymentDate: "$date",
// // //                 invoiceDate: "$invoice.invoiceDate",
// // //                 amount: "$credit", // Payment is credit to AR
// // //                 daysToPay: {
// // //                     $divide: [{ $subtract: ["$date", "$invoice.invoiceDate"] }, 1000 * 60 * 60 * 24]
// // //                 }
// // //             }
// // //         },
// // //         // Filter out immediate payments (0 days) if you want only credit customers, or keep them to see efficiency
// // //         {
// // //             $group: {
// // //                 _id: "$customerId",
// // //                 avgDaysToPay: { $avg: "$daysToPay" },
// // //                 totalPaid: { $sum: "$amount" },
// // //                 paymentsCount: { $sum: 1 }
// // //             }
// // //         },
// // //         {
// // //             $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' }
// // //         },
// // //         { $unwind: "$customer" },
// // //         {
// // //             $project: {
// // //                 customer: "$customer.name",
// // //                 avgDaysToPay: { $round: ["$avgDaysToPay", 1] },
// // //                 rating: {
// // //                     $switch: {
// // //                         branches: [
// // //                             { case: { $lte: ["$avgDaysToPay", 7] }, then: "Excellent" },
// // //                             { case: { $lte: ["$avgDaysToPay", 30] }, then: "Good" },
// // //                             { case: { $lte: ["$avgDaysToPay", 60] }, then: "Fair" }
// // //                         ],
// // //                         default: "Poor"
// // //                     }
// // //                 }
// // //             }
// // //         },
// // //         { $sort: { avgDaysToPay: 1 } }
// // //     ]);
// // // };


// // // // ===========================================================================
// // // // 🆕 9. DATA EXPORT (Raw)
// // // // ===========================================================================
// // // // exports.getExportData = async (orgId, type, startDate, endDate) => {
// // // //     const match = { 
// // // //         organizationId: toObjectId(orgId),
// // // //         createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
// // // //     };

// // // //     if (type === 'sales') {
// // // //         const invoices = await Invoice.find(match)
// // // //             .populate('customerId', 'name')
// // // //             .populate('branchId', 'name')
// // // //             .lean();
        
// // // //         return invoices.map(inv => ({
// // // //             Date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
// // // //             InvoiceNo: inv.invoiceNumber,
// // // //             Customer: inv.customerId?.name || 'Walk-in',
// // // //             Branch: inv.branchId?.name,
// // // //             Amount: inv.grandTotal,
// // // //             Status: inv.paymentStatus
// // // //         }));
// // // //     }

// // // //     if (type === 'inventory') {
// // // //         const products = await Product.find({ organizationId: match.organizationId }).lean();
// // // //         // Flatten inventory array
// // // //         let rows = [];
// // // //         products.forEach(p => {
// // // //             p.inventory.forEach(inv => {
// // // //                 rows.push({
// // // //                     Product: p.name,
// // // //                     SKU: p.sku,
// // // //                     Stock: inv.quantity,
// // // //                     Price: p.sellingPrice
// // // //                 });
// // // //             });
// // // //         });
// // // //         return rows;
// // // //     }

// // // //     if (type === 'tax') {
// // // //         // Similar to sales but focused on tax breakdown
// // // //         const invoices = await Invoice.find(match).lean();
// // // //         return invoices.map(inv => ({
// // // //             InvoiceNo: inv.invoiceNumber,
// // // //             Taxable: inv.subTotal,
// // // //             TaxAmount: inv.totalTax,
// // // //             Total: inv.grandTotal
// // // //         }));
// // // //     }

// // // //     return [];
// // // // };


// // // // In analyticsService.js
// // // exports.generateForecast = async (orgId) => {
// // //     const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
// // //     const today = new Date();
    
// // //     // Get sales so far this month
// // //     const currentSales = await Invoice.aggregate([
// // //         { $match: { 
// // //             organizationId: mongoose.Types.ObjectId(orgId), 
// // //             invoiceDate: { $gte: startOfMonth },
// // //             status: { $ne: 'cancelled' }
// // //         }},
// // //         { $group: { _id: null, total: { $sum: "$grandTotal" } } }
// // //     ]);

// // //     const revenueSoFar = currentSales[0]?.total || 0;
// // //     const daysPassed = today.getDate();
// // //     const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

// // //     // Linear projection
// // //     const dailyAverage = revenueSoFar / daysPassed;
// // //     const predictedRevenue = Math.round(revenueSoFar + (dailyAverage * (daysInMonth - daysPassed)));

// // //     return {
// // //         revenue: predictedRevenue,
// // //         trend: dailyAverage > 0 ? 'up' : 'stable'
// // //     };
// // // };

// // // // ===========================================================================
// // // // 9. DATA EXPORT (Unified & Robust)
// // // // ===========================================================================
// // // exports.getRawSalesData = async (orgId, startDate, endDate) => {
// // //     const match = { 
// // //         organizationId: toObjectId(orgId),
// // //         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
// // //     };
// // //     const invoices = await Invoice.find(match)
// // //         .populate('customerId', 'name')
// // //         .populate('branchId', 'name')
// // //         .lean();
    
// // //     return invoices.map(inv => ({
// // //         invoiceNumber: inv.invoiceNumber,
// // //         date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
// // //         customerName: inv.customerId?.name || 'Walk-in',
// // //         branch: inv.branchId?.name || 'Main',
// // //         amount: inv.grandTotal,
// // //         status: inv.paymentStatus
// // //     }));
// // // };

// // // exports.getInventoryDump = async (orgId) => {
// // //     const products = await Product.find({ organizationId: toObjectId(orgId) }).lean();
// // //     let rows = [];
// // //     products.forEach(p => {
// // //         // Flatten array if product has multiple branch entries
// // //         if (p.inventory && p.inventory.length > 0) {
// // //             p.inventory.forEach(inv => {
// // //                 rows.push({
// // //                     name: p.name,
// // //                     sku: p.sku,
// // //                     stock: inv.quantity,
// // //                     value: inv.quantity * p.purchasePrice,
// // //                     reorderLevel: inv.reorderLevel
// // //                 });
// // //             });
// // //         } else {
// // //             // Product with no inventory record
// // //             rows.push({ name: p.name, sku: p.sku, stock: 0, value: 0, reorderLevel: 0 });
// // //         }
// // //     });
// // //     return rows;
// // // };

// // // exports.getExportData = async (orgId, type, startDate, endDate) => {
// // //     if (type === 'sales') return this.getRawSalesData(orgId, startDate, endDate);
// // //     if (type === 'inventory') return this.getInventoryDump(orgId);
// // //     if (type === 'tax') return this.getRawSalesData(orgId, startDate, endDate); // Can refine later
// // //     return [];
// // // };


// // // // ===========================================================================
// // // // 🌟 NEW: FORECASTING (Linear Regression)
// // // // ===========================================================================
// // // exports.generateForecast = async (orgId, branchId) => {
// // //     const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
// // //     if (branchId) match.branchId = toObjectId(branchId);

// // //     // Get last 6 months revenue grouped by month
// // //     const sixMonthsAgo = new Date();
// // //     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

// // //     const monthlySales = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: sixMonthsAgo } } },
// // //         {
// // //             $group: {
// // //                 _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
// // //                 total: { $sum: "$grandTotal" }
// // //             }
// // //         },
// // //         { $sort: { _id: 1 } }
// // //     ]);

// // //     if (monthlySales.length < 2) return { revenue: 0, trend: 'stable' };

// // //     // Simple Linear Regression: y = mx + b
// // //     let xSum = 0, ySum = 0, xySum = 0, x2Sum = 0;
// // //     const n = monthlySales.length;

// // //     monthlySales.forEach((month, index) => {
// // //         const x = index + 1;
// // //         const y = month.total;
// // //         xSum += x;
// // //         ySum += y;
// // //         xySum += x * y;
// // //         x2Sum += x * x;
// // //     });

// // //     const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
// // //     const intercept = (ySum - slope * xSum) / n;
    
// // //     // Predict next month (x = n + 1)
// // //     const nextMonthRevenue = Math.round(slope * (n + 1) + intercept);
// // //     const trend = slope > 0 ? 'up' : (slope < 0 ? 'down' : 'stable');

// // //     return { revenue: Math.max(0, nextMonthRevenue), trend, historical: monthlySales };
// // // };

// // // // ===========================================================================
// // // // 🌟 NEW: STAFF PERFORMANCE (Aliased for Controller)
// // // // ===========================================================================
// // // exports.getStaffStats = async (orgId, startDate, endDate) => {
// // //     const match = { 
// // //         organizationId: toObjectId(orgId),
// // //         invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
// // //         status: { $ne: 'cancelled' }
// // //     };

// // //     const stats = await Invoice.aggregate([
// // //         { $match: match },
// // //         {
// // //             $group: {
// // //                 _id: '$createdBy',
// // //                 totalSales: { $sum: '$grandTotal' },
// // //                 invoiceCount: { $sum: 1 },
// // //                 totalDiscount: { $sum: '$totalDiscount' }
// // //             }
// // //         },
// // //         { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
// // //         { $unwind: '$user' },
// // //         {
// // //             $project: {
// // //                 name: '$user.name',
// // //                 email: '$user.email',
// // //                 totalSales: 1,
// // //                 invoiceCount: 1,
// // //                 averageTicketSize: { $divide: ['$totalSales', '$invoiceCount'] }
// // //             }
// // //         },
// // //         { $sort: { totalSales: -1 } }
// // //     ]);

// // //     return stats;
// // // };

// // // // ===========================================================================
// // // // 🌟 NEW: CUSTOMER RFM ANALYSIS (Recency, Frequency, Monetary)
// // // // ===========================================================================
// // // exports.getCustomerRFMAnalysis = async (orgId) => {
// // //     const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    
// // //     // 1. Aggregate per customer
// // //     const rfmRaw = await Invoice.aggregate([
// // //         { $match: match },
// // //         {
// // //             $group: {
// // //                 _id: "$customerId",
// // //                 lastPurchaseDate: { $max: "$invoiceDate" },
// // //                 frequency: { $sum: 1 },
// // //                 monetary: { $sum: "$grandTotal" }
// // //             }
// // //         }
// // //     ]);

// // //     // 2. Score them (Simplified 1-3 scale)
// // //     // In production, we'd calculate percentiles. Here we use hard thresholds for speed.
// // //     const now = new Date();
// // //     const scored = rfmRaw.map(c => {
// // //         const daysSinceLast = Math.floor((now - c.lastPurchaseDate) / (1000 * 60 * 60 * 24));
        
// // //         let rScore = daysSinceLast < 30 ? 3 : (daysSinceLast < 90 ? 2 : 1);
// // //         let fScore = c.frequency > 10 ? 3 : (c.frequency > 3 ? 2 : 1);
// // //         let mScore = c.monetary > 50000 ? 3 : (c.monetary > 10000 ? 2 : 1);
        
// // //         let segment = 'Standard';
// // //         if (rScore === 3 && fScore === 3 && mScore === 3) segment = 'Champion';
// // //         else if (rScore === 1 && mScore === 3) segment = 'At Risk';
// // //         else if (rScore === 3 && fScore === 1) segment = 'New Customer';
// // //         else if (fScore === 3) segment = 'Loyal';

// // //         return { ...c, segment };
// // //     });

// // //     // 3. Group for Dashboard Chart
// // //     const segments = { Champion: 0, 'At Risk': 0, Loyal: 0, 'New Customer': 0, Standard: 0 };
// // //     scored.forEach(s => {
// // //         if (segments[s.segment] !== undefined) segments[s.segment]++;
// // //         else segments.Standard++;
// // //     });

// // //     return segments;
// // // };

// // // // //////////////////////////////////////////44

// // // // ===========================================================================
// // // // 🌟 NEW: CRITICAL ALERTS (Unified)
// // // // ===========================================================================
// // // exports.getCriticalAlerts = async (orgId, branchId) => {
// // //     const inv = await this.getInventoryAnalytics(orgId, branchId);
// // //     const risk = await this.getCustomerRiskStats(orgId, branchId);
    
// // //     return {
// // //         lowStockCount: inv.lowStockAlerts.length,
// // //         highRiskDebtCount: risk.creditRisk.length,
// // //         itemsToReorder: inv.lowStockAlerts.map(i => i.name)
// // //     };
// // // };

// // // // ===========================================================================
// // // // 9. DATA EXPORT (Unified & Robust)
// // // // ===========================================================================
// // // // 🌟 NEW: COHORT ANALYSIS (Retention)
// // // // ===========================================================================
// // // exports.getCohortAnalysis = async (orgId, monthsBack = 6) => {
// // //     const match = { 
// // //         organizationId: toObjectId(orgId),
// // //         status: { $ne: 'cancelled' }
// // //     };

// // //     const start = new Date();
// // //     start.setMonth(start.getMonth() - monthsBack);
// // //     start.setDate(1); // Start of that month

// // //     const cohorts = await Invoice.aggregate([
// // //         { $match: { ...match, invoiceDate: { $gte: start } } },
// // //         // 1. Find first purchase date for each customer
// // //         {
// // //             $group: {
// // //                 _id: "$customerId",
// // //                 firstPurchase: { $min: "$invoiceDate" },
// // //                 allPurchases: { $push: "$invoiceDate" }
// // //             }
// // //         },
// // //         // 2. Group by Cohort Month (YYYY-MM)
// // //         {
// // //             $project: {
// // //                 cohortMonth: { $dateToString: { format: "%Y-%m", date: "$firstPurchase" } },
// // //                 activityMonths: {
// // //                     $map: {
// // //                         input: "$allPurchases",
// // //                         as: "date",
// // //                         in: { $dateToString: { format: "%Y-%m", date: "$$date" } }
// // //                     }
// // //                 }
// // //             }
// // //         },
// // //         { $unwind: "$activityMonths" },
// // //         { $group: { _id: { cohort: "$cohortMonth", activity: "$activityMonths" }, count: { $addToSet: "$_id" } } },
// // //         { $project: { cohort: "$_id.cohort", activity: "$_id.activity", count: { $size: "$count" } } },
// // //         { $sort: { cohort: 1, activity: 1 } }
// // //     ]);

// // //     // Transform into friendly structure: { cohort: "2023-10", retention: [100%, 20%, 10%...] }
// // //     // (This transformation can also happen on frontend to save backend CPU)
// // //     return cohorts;
// // // };












