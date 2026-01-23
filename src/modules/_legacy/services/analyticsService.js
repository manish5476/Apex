const mongoose = require('mongoose');
const Invoice = require('../../accounting/billing/invoice.model');
const Purchase = require('../../inventory/core/purchase.model');
const Product = require('../../inventory/core/product.model');
const Customer = require('../../organization/core/customer.model');
const User = require('../../auth/core/user.model');
const Branch = require('../../organization/core/branch.model');
const AuditLog = require('../models/auditLogModel');
const Sales = require('../../inventory/core/sales.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');
const Payment = require('../../accounting/payments/payment.model');
const AttendanceDaily = require('../../hr/attendance/models/attendanceDaily.model');
const EMI = require('../../accounting/payments/emi.model');
const SalesReturn = require('../../../modules/inventory/core/salesReturn.model');
const { performance } = require('perf_hooks');
const { safeCache } = require('../../../core/utils/_legacy/redis'); 
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
   1. CACHE MANAGEMENT - FIXED VERSION
   ========================================================================== */
exports.cacheData = async (key, data, ttl = 300) => {  return safeCache.set(key, data, ttl);};

exports.getCachedData = async (key) => {
    return safeCache.get(key);
};

exports.clearCache = async (pattern) => {
    return safeCache.clear(pattern);
};

/* ==========================================================================
   2. ENHANCED CACHE WITH FALLBACK
   ========================================================================== */

// Simple in-memory fallback cache
const memoryCache = new Map();

exports.cacheDataInMemory = async (key, data, ttl = 300) => {
    try {
        const cacheItem = {
            data,
            cachedAt: Date.now(),
            expiresAt: Date.now() + (ttl * 1000)
        };
        memoryCache.set(key, cacheItem);
        return true;
    } catch (error) {
        console.warn('Memory cache error:', error.message);
        return false;
    }
};

exports.getCachedDataFromMemory = async (key) => {
    try {
        const cached = memoryCache.get(key);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.data;
        } else if (cached) {
            memoryCache.delete(key); // Clean expired
        }
        return null;
    } catch (error) {
        console.warn('Memory cache error:', error.message);
        return null;
    }
};

/* ==========================================================================
   3. SMART CACHE FUNCTIONS
   ========================================================================== */

exports.smartCache = {
    /**
     * Smart cache that tries Redis first, then memory
     */
    set: async (key, data, ttl = 300) => {
        // Try Redis first
        try {
            const redisResult = await safeCache.set(key, data, ttl);
            if (redisResult) {
                console.debug(`✅ Redis cache set: ${key}`);
                return true;
            }
        } catch (redisError) {
            console.warn(`Redis cache failed: ${redisError.message}`);
        }
        
        // Fallback to memory
        console.debug(`🟡 Falling back to memory cache: ${key}`);
        return await this.cacheDataInMemory(key, data, ttl);
    },

    get: async (key) => {
        // Try Redis first
        try {
            const redisData = await safeCache.get(key);
            if (redisData) {
                console.debug(`✅ Redis cache hit: ${key}`);
                return redisData;
            }
        } catch (redisError) {
            console.warn(`Redis cache failed: ${redisError.message}`);
        }
        
        // Fallback to memory
        console.debug(`🟡 Checking memory cache: ${key}`);
        return await this.getCachedDataFromMemory(key);
    },

    clear: async (pattern) => {
        let totalCleared = 0;
        
        // Clear Redis cache
        try {
            const redisCleared = await safeCache.clear(pattern);
            totalCleared += redisCleared;
            console.debug(`✅ Cleared ${redisCleared} Redis keys matching: ${pattern}`);
        } catch (redisError) {
            console.warn(`Failed to clear Redis cache: ${redisError.message}`);
        }
        
        // Clear memory cache
        let memoryCleared = 0;
        for (const key of memoryCache.keys()) {
            if (key.includes(pattern)) {
                memoryCache.delete(key);
                memoryCleared++;
            }
        }
        totalCleared += memoryCleared;
        
        if (memoryCleared > 0) {
            console.debug(`✅ Cleared ${memoryCleared} memory keys matching: ${pattern}`);
        }
        
        return totalCleared;
    }
};

/* ==========================================================================
   4. ANALYTICS-SPECIFIC CACHE HELPERS
   ========================================================================== */

/**
 * Generate cache key for analytics queries
 */
exports.generateAnalyticsCacheKey = (endpoint, orgId, branchId, startDate, endDate, extraParams = {}) => {
    const paramsString = JSON.stringify({
        orgId,
        branchId: branchId || 'all',
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        ...extraParams
    });
    
    // Simple hash for shorter keys
    const hash = require('crypto')
        .createHash('md5')
        .update(paramsString)
        .digest('hex')
        .substring(0, 8);
    
    return `analytics:${endpoint}:${hash}`;
};

/**
 * Get data with caching
 */
exports.getWithCache = async (cacheKey, fetchFunction, ttl = 300) => {
    // Try cache first
    const cached = await this.getCachedData(cacheKey);
    if (cached) {
        return {
            data: cached,
            cached: true,
            source: 'redis'
        };
    }
    
    // Fetch fresh data
    const freshData = await fetchFunction();
    
    // Cache it (fire and forget)
    this.cacheData(cacheKey, freshData, ttl).catch(err => 
        console.warn('Failed to cache data:', err.message)
    );
    
    return {
        data: freshData,
        cached: false,
        source: 'database'
    };
};

exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
    try {
        const startTime = performance.now();

        // Input validation
        if (!orgId) throw new Error('Organization ID is required');
        if (!mongoose.Types.ObjectId.isValid(orgId)) throw new Error('Invalid Organization ID');

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid date format');
        }
        if (start > end) throw new Error('Start date cannot be after end date');

        const match = { 
            organizationId: toObjectId(orgId),
            status: { $ne: 'cancelled' }
        };

        if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
            match.branchId = toObjectId(branchId);
        }

        const duration = end - start;
        const prevStart = new Date(start - duration);
        const prevEnd = new Date(start);

        // Create today date boundaries with timezone awareness
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // Parallel execution of key metrics
        const [
            salesStats,
            purchaseStats,
            customerStats,
            productStats
        ] = await Promise.all([
            // Sales metrics - FIXED: Removed $totalCost reference
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
                                        $gte: todayStart, 
                                        $lte: todayEnd 
                                    } 
                                } 
                            },
                            { $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
                        ]
                    }
                }
            ]),

            // Purchase metrics - FIXED: Ensure consistent field names
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

            // Customer metrics - FIXED: Filter null customerIds
            Invoice.aggregate([
                { 
                    $match: { 
                        ...match, 
                        invoiceDate: { $gte: start, $lte: end },
                        customerId: { $ne: null } // Exclude null customer IDs
                    } 
                },
                { $group: { _id: '$customerId' } },
                { $count: 'uniqueCustomers' }
            ]),

            // Product metrics - FIXED: Filter null productIds
            Invoice.aggregate([
                { 
                    $match: { 
                        ...match, 
                        invoiceDate: { $gte: start, $lte: end } 
                    } 
                },
                { $unwind: '$items' },
                { $match: { 'items.productId': { $ne: null } } }, // Exclude null product IDs
                { 
                    $group: { 
                        _id: null,
                        totalProductsSold: { $sum: '$items.quantity' },
                        uniqueProducts: { $addToSet: '$items.productId' }
                    } 
                },
                { 
                    $project: { 
                        totalProductsSold: 1,
                        uniqueProductCount: { 
                            $cond: {
                                if: { $isArray: "$uniqueProducts" },
                                then: { $size: "$uniqueProducts" },
                                else: 0
                            }
                        }
                    } 
                }
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

        // Get new customers count - FIXED: Call the function properly
        const newCustomersCount = await getNewCustomersCount(orgId, branchId, start, end);

        const executionTime = performance.now() - startTime;

        return {
            totalRevenue: {
                value: curSales.revenue,
                count: curSales.count,
                growth: calculateGrowth(curSales.revenue, prevSales.revenue),
                avgTicket: Number(curSales.avgTicket ? curSales.avgTicket.toFixed(2) : 0),
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
                margin: calculatePercentage(netProfit, curSales.revenue || 1) // Avoid division by zero
            },
            customers: {
                active: uniqueCustomers,
                new: newCustomersCount
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
                dataPoints: curSales.count + curPurch.count,
                queryCount: 4
            },
            period: {
                current: { start, end },
                previous: { start: prevStart, end: prevEnd },
                today: { start: todayStart, end: todayEnd }
            }
        };
    } catch (error) {
        console.error('Error in getExecutiveStats:', error);
        throw new Error(`Failed to fetch executive stats: ${error.message}`);
    }
};

// Get new customers count - CORRECTED VERSION
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

exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'auto') => {
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

/* ==========================================================================
   3. ENHANCED FUNCTIONS FROM ORIGINAL SERVICE (Modified)
   ========================================================================== */
exports.getInventoryAnalytics = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getInventoryAnalytics:', error);
        throw new Error(`Failed to fetch inventory analytics: ${error.message}`);
    }
};

exports.getProductPerformanceStats = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');
        const match = { organizationId: toObjectId(orgId) };
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
    } catch (error) {
        console.error('Error in getProductPerformanceStats:', error);
        throw new Error(`Failed to fetch product performance stats: ${error.message}`);
    }
};

exports.getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getCashFlowStats:', error);
        throw new Error(`Failed to fetch cash flow stats: ${error.message}`);
    }
};

exports.getTaxStats = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getTaxStats:', error);
        throw new Error(`Failed to fetch tax stats: ${error.message}`);
    }
};

exports.getProcurementStats = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getProcurementStats:', error);
        throw new Error(`Failed to fetch procurement stats: ${error.message}`);
    }
};

exports.getCustomerRiskStats = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getCustomerRiskStats:', error);
        throw new Error(`Failed to fetch customer risk stats: ${error.message}`);
    }
};

exports.getLeaderboards = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getLeaderboards:', error);
        throw new Error(`Failed to fetch leaderboards: ${error.message}`);
    }
};

exports.getOperationalStats = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getOperationalStats:', error);
        throw new Error(`Failed to fetch operational stats: ${error.message}`);
    }
};

exports.getBranchComparisonStats = async (orgId, startDate, endDate, groupBy = 'revenue', limit = 10) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getBranchComparisonStats:', error);
        throw new Error(`Failed to fetch branch comparison stats: ${error.message}`);
    }
};

exports.getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getGrossProfitAnalysis:', error);
        throw new Error(`Failed to fetch gross profit analysis: ${error.message}`);
    }
};

exports.getEmployeePerformance = async (orgId, branchId, startDate, endDate, minSales = 0, sortBy = 'revenue') => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getEmployeePerformance:', error);
        throw new Error(`Failed to fetch employee performance: ${error.message}`);
    }
};

exports.getPeakHourAnalysis = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getPeakHourAnalysis:', error);
        throw new Error(`Failed to fetch peak hour analysis: ${error.message}`);
    }
};

exports.getDeadStockAnalysis = async (orgId, branchId, daysThreshold = 90) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getDeadStockAnalysis:', error);
        throw new Error(`Failed to fetch dead stock analysis: ${error.message}`);
    }
};

exports.getInventoryRunRate = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getInventoryRunRate:', error);
        throw new Error(`Failed to fetch inventory run rate: ${error.message}`);
    }
};

exports.getDebtorAging = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getDebtorAging:', error);
        throw new Error(`Failed to fetch debtor aging: ${error.message}`);
    }
};

exports.getSecurityPulse = async (orgId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getSecurityPulse:', error);
        throw new Error(`Failed to fetch security pulse: ${error.message}`);
    }
};

exports.calculateLTV = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
                avgLTV: tieredCustomers.length > 0 ? tieredCustomers.reduce((sum, c) => sum + c.ltv, 0) / tieredCustomers.length : 0,
                topCustomer: tieredCustomers[0] || null
            }
        };
    } catch (error) {
        console.error('Error in calculateLTV:', error);
        throw new Error(`Failed to calculate LTV: ${error.message}`);
    }
};

exports.analyzeChurnRisk = async (orgId, thresholdDays = 90) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in analyzeChurnRisk:', error);
        throw new Error(`Failed to analyze churn risk: ${error.message}`);
    }
};

exports.performBasketAnalysis = async (orgId, minSupport = 2) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in performBasketAnalysis:', error);
        throw new Error(`Failed to perform basket analysis: ${error.message}`);
    }
};

exports.analyzePaymentHabits = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in analyzePaymentHabits:', error);
        throw new Error(`Failed to analyze payment habits: ${error.message}`);
    }
};

// exports.getExportData = async (orgId, type, startDate, endDate, columns = null) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { 
//             organizationId: toObjectId(orgId),
//             invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
//         };

//         if (type === 'sales') {
//             const invoices = await Invoice.find(match)
//                 .select('invoiceNumber invoiceDate grandTotal paymentStatus customerId branchId')
//                 .populate('customerId', 'name')
//                 .populate('branchId', 'name')
//                 .lean();

//             return invoices.map(inv => ({
//                 invoiceNumber: inv.invoiceNumber,
//                 date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
//                 customerName: inv.customerId?.name || 'Walk-in',
//                 branch: inv.branchId?.name || 'Main',
//                 amount: inv.grandTotal,
//                 status: inv.paymentStatus
//             }));
//         }

//         if (type === 'inventory') {
//             const products = await Product.find({ organizationId: toObjectId(orgId) }).lean();
//             let rows = [];
//             products.forEach(p => {
//                 if (p.inventory?.length > 0) {
//                     p.inventory.forEach(inv => {
//                         rows.push({
//                             name: p.name,
//                             sku: p.sku,
//                             stock: inv.quantity,
//                             value: inv.quantity * p.purchasePrice,
//                             reorderLevel: inv.reorderLevel
//                         });
//                     });
//                 } else {
//                     rows.push({ name: p.name, sku: p.sku, stock: 0, value: 0, reorderLevel: 0 });
//                 }
//             });
//             return rows;
//         }
//         return [];
//     } catch (error) {
//         console.error('Error in getExportData:', error);
//         throw new Error(`Failed to get export data: ${error.message}`);
//     }
// };

exports.generateForecast = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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

        if (monthlySales.length < 2) return { revenue: monthlySales[0]?.total || 0, trend: 'stable' };

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
    } catch (error) {
        console.error('Error in generateForecast:', error);
        throw new Error(`Failed to generate forecast: ${error.message}`);
    }
};

exports.getCriticalAlerts = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const [inv, risk] = await Promise.all([
            this.getInventoryAnalytics(orgId, branchId),
            this.getCustomerRiskStats(orgId, branchId)
        ]);

        return {
            lowStockCount: inv.lowStockAlerts.length,
            highRiskDebtCount: risk.creditRisk.length,
            itemsToReorder: inv.lowStockAlerts.map(i => i.name)
        };
    } catch (error) {
        console.error('Error in getCriticalAlerts:', error);
        throw new Error(`Failed to get critical alerts: ${error.message}`);
    }
};

exports.getCohortAnalysis = async (orgId, monthsBack = 6) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getCohortAnalysis:', error);
        throw new Error(`Failed to get cohort analysis: ${error.message}`);
    }
};

exports.getCustomerRFMAnalysis = async (orgId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in getCustomerRFMAnalysis:', error);
        throw new Error(`Failed to get customer RFM analysis: ${error.message}`);
    }
};

/* ==========================================================================
   4. NEW ENHANCEMENTS
   ========================================================================== */
exports.calculateInventoryHealthScore = (analytics, performance, deadStock) => {
    try {
        let score = 100;

        // Deduct for low stock items
        const lowStockPenalty = Math.min(analytics.lowStockAlerts.length * 2, 30);
        score -= lowStockPenalty;

        // Deduct for dead stock
        const deadStockPenalty = Math.min(deadStock.length, 20);
        score -= deadStockPenalty;

        // Bonus for good turnover
        if (analytics.turnover?.turnover > 4) score += 10;

        const highMarginCount = performance.highMargin?.filter(p => p.marginPercent > 40).length || 0;
        if (highMarginCount > 5) score += 10;

        return Math.max(0, Math.min(100, score));
    } catch (error) {
        console.error('Error in calculateInventoryHealthScore:', error);
        return 0;
    }
};

// Staff productivity score
exports.calculateProductivityScore = (staff) => {
    try {
        const avgOrderValue = staff.avgTicketSize || 0;
        const orderCount = staff.invoiceCount || 0;

        // Simple productivity calculation
        return Math.min(100, (avgOrderValue * orderCount) / 1000);
    } catch (error) {
        console.error('Error in calculateProductivityScore:', error);
        return 0;
    }
};

// Generate insights
exports.generateInsights = (kpi, inventory, leaders) => {
    try {
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
    } catch (error) {
        console.error('Error in generateInsights:', error);
        return { insights: [], generatedAt: new Date().toISOString(), count: 0 };
    }
};

// Generate financial recommendations
exports.generateFinancialRecommendations = (kpi, profitability) => {
    try {
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
    } catch (error) {
        console.error('Error in generateFinancialRecommendations:', error);
        return { recommendations: [], generatedAt: new Date().toISOString() };
    }
};

// Calculate inventory turnover
exports.calculateInventoryTurnover = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in calculateInventoryTurnover:', error);
        return { turnover: 0, cogs: 0, avgInventoryValue: 0, interpretation: 'Unknown' };
    }
};

// Get export configuration
// exports.getExportConfig = (type, requestedColumns = 'all') => {
//     try {
//         const configs = {
//             sales: {
//                 defaultColumns: ['invoiceNumber', 'date', 'customerName', 'amount', 'status', 'branch'],
//                 columnLabels: {
//                     invoiceNumber: 'Invoice #',
//                     date: 'Date',
//                     customerName: 'Customer',
//                     amount: 'Amount',
//                     status: 'Status',
//                     branch: 'Branch'
//                 }
//             },
//             inventory: {
//                 defaultColumns: ['name', 'sku', 'stock', 'value', 'reorderLevel', 'category'],
//                 columnLabels: {
//                     name: 'Product Name',
//                     sku: 'SKU',
//                     stock: 'Current Stock',
//                     value: 'Inventory Value',
//                     reorderLevel: 'Reorder Level',
//                     category: 'Category'
//                 }
//             },
//             customers: {
//                 defaultColumns: ['name', 'email', 'totalSpent', 'lastPurchase', 'segment', 'ltv'],
//                 columnLabels: {
//                     name: 'Customer Name',
//                     email: 'Email',
//                     totalSpent: 'Total Spent',
//                     lastPurchase: 'Last Purchase',
//                     segment: 'Segment',
//                     ltv: 'Lifetime Value'
//                 }
//             }
//         };

//         const config = configs[type] || configs.sales;

//         // Filter columns if requested
//         if (requestedColumns !== 'all') {
//             const columns = requestedColumns.split(',');
//             config.defaultColumns = config.defaultColumns.filter(col => 
//                 columns.includes(col)
//             );
//         }

//         return config;
//     } catch (error) {
//         console.error('Error in getExportConfig:', error);
//         return {
//             defaultColumns: [],
//             columnLabels: {}
//         };
//     }
// };

// // Convert data to CSV
// exports.convertToCSV = (data, config) => {
//     try {
//         if (!data || data.length === 0) return '';

//         const headers = config.defaultColumns.map(col => 
//             config.columnLabels[col] || col
//         );

//         const rows = data.map(item => {
//             return config.defaultColumns.map(col => {
//                 let value = item[col] || '';
//                 return `"${String(value).replace(/"/g, '""')}"`;
//             }).join(',');
//         });

//         return [headers.join(','), ...rows].join('\n');
//     } catch (error) {
//         console.error('Error in convertToCSV:', error);
//         return '';
//     }
// };

// Generate advanced forecast
exports.generateAdvancedForecast = async (orgId, branchId, periods = 3, confidence = 0.95) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

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
    } catch (error) {
        console.error('Error in generateAdvancedForecast:', error);
        return {
            forecast: [],
            accuracy: 'unknown',
            historicalDataPoints: 0,
            model: 'error'
        };
    }
};

/* ==========================================================================
   5. STUB FUNCTIONS FOR NEW ENDPOINTS
   ========================================================================== */

// Stub functions that can be implemented later
exports.generateCashFlowProjection = async (orgId, branchId, days) => {
    try {
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
    } catch (error) {
        console.error('Error in generateCashFlowProjection:', error);
        throw new Error(`Failed to generate cash flow projection: ${error.message}`);
    }
};

exports.assessCashHealth = (currentFlow, projections) => {
    try {
        // Stub - implement cash health assessment
        return {
            score: 75,
            status: 'Healthy',
            risk: 'Low'
        };
    } catch (error) {
        console.error('Error in assessCashHealth:', error);
        return { score: 0, status: 'Unknown', risk: 'High' };
    }
};

exports.calculateTargetAchievement = (staff) => {
    try {
        // Stub - implement target achievement calculation
        return 85; // percentage
    } catch (error) {
        console.error('Error in calculateTargetAchievement:', error);
        return 0;
    }
};

exports.getStaffTrend = (staffId, orgId, branchId) => {
    try {
        // Stub - implement staff trend analysis
        return 'up';
    } catch (error) {
        console.error('Error in getStaffTrend:', error);
        return 'unknown';
    }
};

exports.calculateEfficiencyMetrics = async (orgId, branchId, startDate, endDate) => {
    try {
        // Stub - implement efficiency metrics
        return {
            laborEfficiency: 0.85,
            resourceUtilization: 0.72,
            operationalCostRatio: 0.15
        };
    } catch (error) {
        console.error('Error in calculateEfficiencyMetrics:', error);
        return {
            laborEfficiency: 0,
            resourceUtilization: 0,
            operationalCostRatio: 0
        };
    }
};

exports.generateStaffingRecommendations = (peakHours) => {
    try {
        // Stub - implement staffing recommendations
        return [
            'Increase staffing on Monday mornings',
            'Reduce staff on Thursday afternoons'
        ];
    } catch (error) {
        console.error('Error in generateStaffingRecommendations:', error);
        return [];
    }
};

exports.calculateOperationalKPIs = (metrics) => {
    try {
        // Stub - implement operational KPIs
        return {
            orderFulfillmentRate: 0.95,
            customerSatisfaction: 4.2,
            returnRate: 0.02
        };
    } catch (error) {
        console.error('Error in calculateOperationalKPIs:', error);
        return {
            orderFulfillmentRate: 0,
            customerSatisfaction: 0,
            returnRate: 0
        };
    }
};

exports.generateInventoryRecommendations = (lowStock, deadStock, predictions) => {
    try {
        // Stub - implement inventory recommendations
        return [
            'Reorder 50 units of Product A',
            'Create promotion for slow-moving items'
        ];
    } catch (error) {
        console.error('Error in generateInventoryRecommendations:', error);
        return [];
    }
};

exports.calculateForecastAccuracy = async (orgId, branchId) => {
    try {
        // Stub - implement forecast accuracy calculation
        return {
            mape: 12.5, // Mean Absolute Percentage Error
            accuracy: 'Good'
        };
    } catch (error) {
        console.error('Error in calculateForecastAccuracy:', error);
        return {
            mape: 0,
            accuracy: 'Unknown'
        };
    }
};

exports.getBestPerformingProducts = async (orgId, branchId, limit) => {
    try {
        // Stub - implement best performing products
        return this.getProductPerformanceStats(orgId, branchId)
            .then(data => data.highMargin.slice(0, limit));
    } catch (error) {
        console.error('Error in getBestPerformingProducts:', error);
        return [];
    }
};

exports.generateSalesRecommendations = (forecast) => {
    try {
        // Stub - implement sales recommendations
        return [
            'Increase marketing budget by 15%',
            'Launch new product line'
        ];
    } catch (error) {
        console.error('Error in generateSalesRecommendations:', error);
        return [];
    }
};

exports.generateCustomerInsights = (segments, churnRisk, ltv) => {
    try {
        // Stub - implement customer insights
        return {
            acquisitionCost: 150,
            retentionRate: 0.65,
            referralRate: 0.12
        };
    } catch (error) {
        console.error('Error in generateCustomerInsights:', error);
        return {
            acquisitionCost: 0,
            retentionRate: 0,
            referralRate: 0
        };
    }
};

exports.getRealTimeAlerts = async (orgId, branchId, severity, limit) => {
    try {
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
    } catch (error) {
        console.error('Error in getRealTimeAlerts:', error);
        return [];
    }
};

exports.convertToExcel = async (data, config) => {
    try {
        // Stub - implement Excel conversion
        // For now, return CSV as buffer
        const csv = this.convertToCSV(data, config);
        return Buffer.from(csv, 'utf-8');
    } catch (error) {
        console.error('Error in convertToExcel:', error);
        return Buffer.from('');
    }
};

exports.convertToPDF = async (data, config) => {
    try {
        // Stub - implement PDF conversion
        const csv = this.convertToCSV(data, config);
        return Buffer.from(csv, 'utf-8');
    } catch (error) {
        console.error('Error in convertToPDF:', error);
        return Buffer.from('');
    }
};

exports.validateAndParseQuery = (query) => {
    try {
        // Stub - implement query validation
        return query;
    } catch (error) {
        console.error('Error in validateAndParseQuery:', error);
        return {};
    }
};

exports.executeCustomQuery = async (orgId, query, parameters, limit) => {
    try {
        // Stub - implement custom query execution
        return {
            data: [],
            total: 0,
            executionTime: 0,
            metadata: { query, parameters }
        };
    } catch (error) {
        console.error('Error in executeCustomQuery:', error);
        return {
            data: [],
            total: 0,
            executionTime: 0,
            metadata: {}
        };
    }
};

exports.getPerformanceMetrics = async (orgId, hours) => {
    try {
        // Stub - implement performance metrics
        return {
            avgResponseTime: 250,
            errorRate: 0.02,
            requestCount: 1500,
            cacheHitRate: 0.65
        };
    } catch (error) {
        console.error('Error in getPerformanceMetrics:', error);
        return {
            avgResponseTime: 0,
            errorRate: 0,
            requestCount: 0,
            cacheHitRate: 0
        };
    }
};

exports.generatePerformanceRecommendations = (performanceStats) => {
    try {
        // Stub - implement performance recommendations
        return [
            'Consider adding indexes to frequently queried collections',
            'Increase cache TTL for slow-changing data'
        ];
    } catch (error) {
        console.error('Error in generatePerformanceRecommendations:', error);
        return [];
    }
};

exports.performDataHealthCheck = async (orgId) => {
    try {
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
    } catch (error) {
        console.error('Error in performDataHealthCheck:', error);
        return [];
    }
};

exports.calculateDataHealthScore = (healthCheck) => {
    try {
        // Stub - implement data health score calculation
        const healthyChecks = healthCheck.filter(item => item.status === 'healthy').length;
        return Math.round((healthyChecks / healthCheck.length) * 100);
    } catch (error) {
        console.error('Error in calculateDataHealthScore:', error);
        return 0;
    }
};

// Enhanced analyticsService.js additions based on your models

/* ==========================================================================
   NEW ANALYTICS BASED ON YOUR MODELS
   ========================================================================== */

/**
 * 1. STAFF ATTENDANCE & PRODUCTIVITY CORRELATION
 * Links attendance data with sales performance
 */
exports.getStaffAttendancePerformance = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { organizationId: toObjectId(orgId) };
        if (branchId) match.branchId = toObjectId(branchId);

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Get staff sales performance
        const staffSales = await Invoice.aggregate([
            { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: '$createdBy',
                    totalRevenue: { $sum: '$grandTotal' },
                    invoiceCount: { $sum: 1 },
                    avgTicketSize: { $avg: '$grandTotal' }
                }
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            { 
                $project: { 
                    userId: '$_id',
                    name: '$user.name',
                    totalRevenue: 1,
                    invoiceCount: 1,
                    avgTicketSize: 1,
                    machineUserId: '$user.attendanceConfig.machineUserId'
                } 
            }
        ]);

        // Get attendance data for these users
        const userIds = staffSales.map(s => s.userId);
        const attendanceData = await AttendanceDaily.aggregate([
            { 
                $match: { 
                    user: { $in: userIds },
                    date: { 
                        $gte: start.toISOString().split('T')[0],
                        $lte: end.toISOString().split('T')[0]
                    }
                } 
            },
            {
                $group: {
                    _id: '$user',
                    totalWorkHours: { $sum: '$totalWorkHours' },
                    presentDays: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
                    totalDays: { $sum: 1 }
                }
            }
        ]);

        // Combine data
        return staffSales.map(staff => {
            const attendance = attendanceData.find(a => a._id && a._id.toString() === staff.userId.toString());
            return {
                ...staff,
                attendance: attendance || { totalWorkHours: 0, presentDays: 0, totalDays: 0 },
                productivity: attendance ? 
                    (staff.totalRevenue / attendance.totalWorkHours) || 0 : 0
            };
        });
    } catch (error) {
        console.error('Error in getStaffAttendancePerformance:', error);
        throw new Error(`Failed to fetch staff attendance performance: ${error.message}`);
    }
};

/**
 * 2. CUSTOMER PAYMENT BEHAVIOR ENHANCED
 * Uses AccountEntry for more accurate payment tracking
 */
exports.getEnhancedPaymentBehavior = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { 
            organizationId: toObjectId(orgId),
            referenceType: 'payment',
            customerId: { $ne: null }
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
            { $unwind: '$invoice' },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: '$customer' },
            {
                $group: {
                    _id: '$customerId',
                    customerName: { $first: '$customer.name' },
                    totalInvoiced: { $sum: '$invoice.grandTotal' },
                    totalPaid: { $sum: '$credit' },
                    avgDaysToPay: {
                        $avg: {
                            $divide: [
                                { $subtract: ['$date', '$invoice.invoiceDate'] },
                                1000 * 60 * 60 * 24
                            ]
                        }
                    },
                    paymentCount: { $sum: 1 },
                    paymentMethods: { 
                        $addToSet: { 
                            $cond: [
                                { $eq: ['$credit', 0] },
                                null,
                                '$paymentMethod'
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    customerName: 1,
                    totalInvoiced: 1,
                    totalPaid: 1,
                    outstanding: { $subtract: ['$totalInvoiced', '$totalPaid'] },
                    paymentRatio: { 
                        $cond: [
                            { $eq: ['$totalInvoiced', 0] },
                            0,
                            { $divide: ['$totalPaid', '$totalInvoiced'] }
                        ]
                    },
                    avgDaysToPay: { $round: ['$avgDaysToPay', 1] },
                    paymentCount: 1,
                    paymentMethods: { $filter: { input: '$paymentMethods', as: 'method', cond: { $ne: ['$$method', null] } } },
                    reliability: {
                        $switch: {
                            branches: [
                                { case: { $gte: ['$paymentRatio', 0.95] }, then: 'Excellent' },
                                { case: { $gte: ['$paymentRatio', 0.85] }, then: 'Good' },
                                { case: { $gte: ['$paymentRatio', 0.70] }, then: 'Fair' },
                                { case: { $lt: ['$paymentRatio', 0.70] }, then: 'Poor' }
                            ],
                            default: 'Unknown'
                        }
                    }
                }
            },
            { $sort: { outstanding: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getEnhancedPaymentBehavior:', error);
        throw new Error(`Failed to fetch enhanced payment behavior: ${error.message}`);
    }
};

/**
 * 3. PRODUCT CATEGORY PERFORMANCE
 * Deep dive into category performance
 */
exports.getCategoryAnalytics = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { 
            organizationId: toObjectId(orgId),
            invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
            status: { $ne: 'cancelled' }
        };

        if (branchId) match.branchId = toObjectId(branchId);

        return await Invoice.aggregate([
            { $match: match },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    totalRevenue: { 
                        $sum: { $multiply: ['$items.quantity', '$items.price'] } 
                    },
                    totalQuantity: { $sum: '$items.quantity' },
                    avgPrice: { $avg: '$items.price' },
                    uniqueProducts: { $addToSet: '$items.productId' },
                    margin: {
                        $sum: {
                            $subtract: [
                                { $multiply: ['$items.quantity', '$items.price'] },
                                { $multiply: ['$items.quantity', '$product.purchasePrice'] }
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    category: '$_id',
                    totalRevenue: 1,
                    totalQuantity: 1,
                    avgPrice: { $round: ['$avgPrice', 2] },
                    productCount: { $size: '$uniqueProducts' },
                    margin: 1,
                    marginPercentage: {
                        $cond: [
                            { $eq: ['$totalRevenue', 0] },
                            0,
                            { $multiply: [{ $divide: ['$margin', '$totalRevenue'] }, 100] }
                        ]
                    },
                    avgMarginPerUnit: {
                        $cond: [
                            { $eq: ['$totalQuantity', 0] },
                            0,
                            { $divide: ['$margin', '$totalQuantity'] }
                        ]
                    }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getCategoryAnalytics:', error);
        throw new Error(`Failed to fetch category analytics: ${error.message}`);
    }
};

/**
 * 4. SUPPLIER PERFORMANCE ANALYSIS
 * Based on Purchase model
 */
exports.getSupplierPerformance = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { 
            organizationId: toObjectId(orgId),
            purchaseDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
            status: { $ne: 'cancelled' }
        };

        if (branchId) match.branchId = toObjectId(branchId);

        return await Purchase.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$supplierId',
                    totalSpend: { $sum: '$grandTotal' },
                    purchaseCount: { $sum: 1 },
                    avgPurchaseValue: { $avg: '$grandTotal' },
                    totalItems: { $sum: { $size: '$items' } },
                    paymentEfficiency: {
                        $avg: {
                            $cond: [
                                { $eq: ['$paymentStatus', 'paid'] },
                                100,
                                { $cond: [
                                    { $eq: ['$paymentStatus', 'partial'] },
                                    50,
                                    0
                                ]}
                            ]
                        }
                    }
                }
            },
            { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
            { $unwind: '$supplier' },
            {
                $project: {
                    supplierName: '$supplier.companyName',
                    contactPerson: '$supplier.contactPerson',
                    totalSpend: 1,
                    purchaseCount: 1,
                    avgPurchaseValue: { $round: ['$avgPurchaseValue', 2] },
                    totalItems: 1,
                    paymentEfficiency: { $round: ['$paymentEfficiency', 1] },
                    supplierRating: {
                        $switch: {
                            branches: [
                                { case: { $gte: ['$paymentEfficiency', 90] }, then: 'A' },
                                { case: { $gte: ['$paymentEfficiency', 75] }, then: 'B' },
                                { case: { $gte: ['$paymentEfficiency', 60] }, then: 'C' },
                                { case: { $lt: ['$paymentEfficiency', 60] }, then: 'D' }
                            ],
                            default: 'N/A'
                        }
                    }
                }
            },
            { $sort: { totalSpend: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getSupplierPerformance:', error);
        throw new Error(`Failed to fetch supplier performance: ${error.message}`);
    }
};

/**
 * 5. EMI/CREDIT SALES ANALYSIS
 * Based on EMI model
 */
exports.getEMIAnalytics = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { organizationId: toObjectId(orgId) };
        if (branchId) match.branchId = toObjectId(branchId);

        return await EMI.aggregate([
            { $match: match },
            {
                $unwind: '$installments'
            },
            {
                $group: {
                    _id: '$status',
                    totalAmount: { $sum: '$totalAmount' },
                    activeEMIs: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                    completedEMIs: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    defaultedEMIs: { $sum: { $cond: [{ $eq: ['$status', 'defaulted'] }, 1, 0] } },
                    totalInstallments: { $sum: 1 },
                    paidInstallments: { 
                        $sum: { 
                            $cond: [
                                { $eq: ['$installments.paymentStatus', 'paid'] },
                                1,
                                0
                            ]
                        }
                    },
                    overdueInstallments: {
                        $sum: {
                            $cond: [
                                { 
                                    $and: [
                                        { $eq: ['$installments.paymentStatus', 'pending'] },
                                        { $lt: ['$installments.dueDate', new Date()] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    totalInterestEarned: { $sum: '$installments.interestAmount' }
                }
            },
            {
                $project: {
                    status: '$_id',
                    totalAmount: 1,
                    activeEMIs: 1,
                    completedEMIs: 1,
                    defaultedEMIs: 1,
                    totalInstallments: 1,
                    paidInstallments: 1,
                    overdueInstallments: 1,
                    completionRate: {
                        $cond: [
                            { $eq: ['$totalInstallments', 0] },
                            0,
                            { $multiply: [{ $divide: ['$paidInstallments', '$totalInstallments'] }, 100] }
                        ]
                    },
                    defaultRate: {
                        $cond: [
                            { $eq: ['$totalInstallments', 0] },
                            0,
                            { $multiply: [{ $divide: ['$overdueInstallments', '$totalInstallments'] }, 100] }
                        ]
                    },
                    totalInterestEarned: 1
                }
            }
        ]);
    } catch (error) {
        console.error('Error in getEMIAnalytics:', error);
        throw new Error(`Failed to fetch EMI analytics: ${error.message}`);
    }
};

/**
 * 6. SALES RETURN ANALYSIS
 * Based on SalesReturn model
 */
exports.getReturnAnalytics = async (orgId, branchId, startDate, endDate) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { 
            organizationId: toObjectId(orgId),
            returnDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
            status: 'approved'
        };

        if (branchId) match.branchId = toObjectId(branchId);

        return await SalesReturn.aggregate([
            { $match: match },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.productId',
                    productName: { $first: '$items.name' },
                    totalReturnQuantity: { $sum: '$items.quantity' },
                    totalRefundAmount: { $sum: '$items.refundAmount' },
                    returnCount: { $sum: 1 }
                }
            },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    productName: 1,
                    totalReturnQuantity: 1,
                    totalRefundAmount: 1,
                    returnCount: 1,
                    category: '$product.category',
                    returnRate: null // Will be calculated after getting sales data
                }
            },
            { $sort: { totalRefundAmount: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getReturnAnalytics:', error);
        throw new Error(`Failed to fetch return analytics: ${error.message}`);
    }
};

/**
 * 7. TIME-BASED ANALYTICS (Peak Hours, Days, Months)
 */
exports.getTimeBasedAnalytics = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
        if (branchId) match.branchId = toObjectId(branchId);

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        match.invoiceDate = { $gte: sixMonthsAgo };

        const [hourly, daily, monthly, weekly] = await Promise.all([
            // Hourly analysis
            Invoice.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $hour: '$invoiceDate' },
                        totalRevenue: { $sum: '$grandTotal' },
                        transactionCount: { $sum: 1 },
                        avgTicketSize: { $avg: '$grandTotal' }
                    }
                },
                { $sort: { _id: 1 } }
            ]),

            // Daily analysis (by day of week)
            Invoice.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $dayOfWeek: '$invoiceDate' },
                        totalRevenue: { $sum: '$grandTotal' },
                        transactionCount: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),

            // Monthly analysis
            Invoice.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { 
                            year: { $year: '$invoiceDate' },
                            month: { $month: '$invoiceDate' }
                        },
                        totalRevenue: { $sum: '$grandTotal' },
                        transactionCount: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),

            // Weekly trends
            Invoice.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: { $isoWeek: '$invoiceDate' },
                        totalRevenue: { $sum: '$grandTotal' },
                        transactionCount: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        return {
            hourly: hourly.map(h => ({
                hour: h._id,
                ...h,
                hourLabel: `${h._id}:00 - ${h._id}:59`
            })),
            daily: daily.map(d => ({
                day: d._id,
                ...d,
                dayLabel: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d._id - 1]
            })),
            monthly: monthly.map(m => ({
                year: m._id.year,
                month: m._id.month,
                ...m,
                monthLabel: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`
            })),
            weekly: weekly.map(w => ({
                week: w._id,
                ...w
            }))
        };
    } catch (error) {
        console.error('Error in getTimeBasedAnalytics:', error);
        throw new Error(`Failed to fetch time-based analytics: ${error.message}`);
    }
};

/**
 * 8. CUSTOMER LIFETIME VALUE ENHANCED
 * Uses multiple models for comprehensive LTV
 */
exports.getEnhancedCustomerLTV = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
        if (branchId) match.branchId = toObjectId(branchId);

        const [purchaseData, returnData, paymentData] = await Promise.all([
            // Purchase history
            Invoice.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: '$customerId',
                        totalSpent: { $sum: '$grandTotal' },
                        purchaseCount: { $sum: 1 },
                        firstPurchase: { $min: '$invoiceDate' },
                        lastPurchase: { $max: '$invoiceDate' },
                        avgPurchaseValue: { $avg: '$grandTotal' },
                        productCategories: { $addToSet: '$items.productId' } // Will need to join with products
                    }
                }
            ]),

            // Return history
            SalesReturn.aggregate([
                { $match: { ...match, status: 'approved' } },
                {
                    $group: {
                        _id: '$customerId',
                        totalReturns: { $sum: '$totalRefundAmount' },
                        returnCount: { $sum: 1 }
                    }
                }
            ]),

            // Payment behavior
            AccountEntry.aggregate([
                { $match: { ...match, referenceType: 'payment', customerId: { $ne: null } } },
                {
                    $group: {
                        _id: '$customerId',
                        avgPaymentDays: {
                            $avg: {
                                $cond: [
                                    { $ne: ['$invoiceId', null] },
                                    {
                                        $divide: [
                                            { $subtract: ['$date', { $first: '$invoice.invoiceDate' }] },
                                            1000 * 60 * 60 * 24
                                        ]
                                    },
                                    null
                                ]
                            }
                        },
                        onTimePayments: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ['$invoiceId', null] },
                                            { 
                                                $lte: [
                                                    { 
                                                        $divide: [
                                                            { $subtract: ['$date', { $first: '$invoice.invoiceDate' }] },
                                                            1000 * 60 * 60 * 24
                                                        ]
                                                    },
                                                    30
                                                ]
                                            }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },
                        totalPayments: { $sum: 1 }
                    }
                }
            ])
        ]);

        // Combine all data
        const customerMap = new Map();

        purchaseData.forEach(customer => {
            customerMap.set(customer._id.toString(), {
                ...customer,
                returns: { totalReturns: 0, returnCount: 0 },
                payments: { avgPaymentDays: 0, onTimePayments: 0, totalPayments: 0 }
            });
        });

        returnData.forEach(returnCust => {
            const cust = customerMap.get(returnCust._id.toString());
            if (cust) {
                cust.returns = {
                    totalReturns: returnCust.totalReturns || 0,
                    returnCount: returnCust.returnCount || 0
                };
            }
        });

        paymentData.forEach(paymentCust => {
            const cust = customerMap.get(paymentCust._id.toString());
            if (cust) {
                cust.payments = {
                    avgPaymentDays: paymentCust.avgPaymentDays || 0,
                    onTimePayments: paymentCust.onTimePayments || 0,
                    totalPayments: paymentCust.totalPayments || 0
                };
            }
        });

        // Calculate enhanced LTV metrics
        const enhancedCustomers = Array.from(customerMap.values()).map(customer => {
            const lifespanDays = customer.lastPurchase && customer.firstPurchase ? 
                (customer.lastPurchase - customer.firstPurchase) / (1000 * 60 * 60 * 24) : 0;

            const netSpent = customer.totalSpent - (customer.returns.totalReturns || 0);
            const purchaseFrequency = lifespanDays > 0 ? (customer.purchaseCount / lifespanDays) * 365 : 0;

            // Calculate LTV score
            let ltvScore = netSpent;
            if (customer.payments.onTimePayments > 0) {
                const onTimeRate = customer.payments.onTimePayments / customer.payments.totalPayments;
                ltvScore *= (1 + onTimeRate); // Bonus for on-time payments
            }

            // Penalty for returns
            const returnRate = customer.returns.totalReturns / customer.totalSpent;
            ltvScore *= (1 - returnRate);

            return {
                customerId: customer._id,
                totalSpent: customer.totalSpent,
                netSpent,
                purchaseCount: customer.purchaseCount,
                lifespanDays,
                purchaseFrequency,
                avgPurchaseValue: customer.avgPurchaseValue,
                returnRate,
                onTimePaymentRate: customer.payments.totalPayments > 0 ? 
                    customer.payments.onTimePayments / customer.payments.totalPayments : 0,
                ltvScore,
                predictedLTV: netSpent * (1 + purchaseFrequency) // Simple projection
            };
        });

        return enhancedCustomers.sort((a, b) => b.ltvScore - a.ltvScore).slice(0, 50);
    } catch (error) {
        console.error('Error in getEnhancedCustomerLTV:', error);
        throw new Error(`Failed to fetch enhanced customer LTV: ${error.message}`);
    }
};

// Helper to safely access nested properties (e.g., "customerId.name")
const getNestedValue = (obj, path) => {
    return path.split('.').reduce((o, key) => (o && o[key] !== undefined) ? o[key] : null, obj);
};

/**
 * 1. Fetch Data
 * Gets raw data from MongoDB based on the export type and date range
 */
exports.getExportData = async (orgId, type, startDate, endDate) => {
    const query = { organizationId: orgId };

    // Apply Date Filters
    if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);
        
        // Use 'updatedAt' for inventory (to see stock movement) or remove date filter for current stock
        // For Sales/Customers we use createdAt
        const dateField = type === 'inventory' ? 'updatedAt' : 'createdAt';
        
        // Note: Usually inventory export is "Current State", so we might skip date filter for it
        if (type !== 'inventory') {
            query[dateField] = dateFilter;
        }
    }

    switch (type) {
        case 'sales':
            return await Sales.find(query)
                .populate('customerId', 'name email phone') 
                .sort({ createdAt: -1 })
                .lean();

        case 'inventory':
            // For inventory, we usually want active products
            query.isActive = true;
            return await Product.find(query)
                .populate('categoryId', 'name')
                .populate('brandId', 'name')
                .sort({ name: 1 })
                .lean();

        case 'customers':
            return await Customer.find(query)
                .sort({ name: 1 })
                .lean();

        default:
            throw new Error('Invalid export type. Must be sales, inventory, or customers.');
    }
};

/**
 * 2. Get Config
 * Defines the CSV Columns (Headers) and how to map data to them
 */
exports.getExportConfig = (type) => {
    const configs = {
        sales: [
            { header: 'Date', key: 'createdAt', format: 'date' },
            { header: 'Invoice No', key: 'invoiceNumber' },
            { header: 'Customer', key: 'customerId.name', default: 'Walk-in' },
            { header: 'Status', key: 'status' },
            { header: 'Payment Status', key: 'paymentStatus' },
            { header: 'Total Amount', key: 'totalAmount', format: 'currency' },
            { header: 'Paid Amount', key: 'paidAmount', format: 'currency' },
            { header: 'Items Count', key: 'items', transform: (items) => items ? items.length : 0 }
        ],
        inventory: [
            { header: 'Product Name', key: 'name' },
            { header: 'SKU', key: 'sku' },
            { header: 'Category', key: 'categoryId.name', default: '-' },
            { header: 'Brand', key: 'brandId.name', default: '-' },
            { header: 'Selling Price', key: 'sellingPrice', format: 'currency' },
            // Manually calculate stock from inventory array since virtuals don't work in lean()
            { header: 'Total Stock', key: 'inventory', transform: (inv) => inv ? inv.reduce((sum, i) => sum + i.quantity, 0) : 0 },
            { header: 'Last Sold', key: 'lastSold', format: 'date' }
        ],
        customers: [
            { header: 'Name', key: 'name' },
            { header: 'Type', key: 'type' },
            { header: 'Phone', key: 'phone' },
            { header: 'Email', key: 'email', default: '-' },
            { header: 'GSTIN', key: 'gstNumber', default: '-' },
            { header: 'Outstanding Balance', key: 'outstandingBalance', format: 'currency' },
            { header: 'Total Purchases', key: 'totalPurchases', format: 'currency' },
            { header: 'Last Purchase', key: 'lastPurchaseDate', format: 'date' }
        ]
    };

    return configs[type] || [];
};

/**
 * 3. Convert to CSV
 * Transforms the JSON data into a CSV string using the config
 */
exports.convertToCSV = (data, config) => {
    if (!data || !data.length) return '';

    // Create Header Row
    const headers = config.map(c => `"${c.header}"`).join(',');

    // Create Data Rows
    const rows = data.map(row => {
        return config.map(col => {
            // Get raw value (supports nested keys like 'customerId.name')
            let val = getNestedValue(row, col.key);

            // Apply transformations (e.g. counting items array)
            if (col.transform) {
                val = col.transform(val);
            }

            // Handle null/undefined
            if (val === undefined || val === null) {
                val = col.default || '';
            } 
            // Handle Dates
            else if (col.format === 'date') {
                try {
                    val = new Date(val).toISOString().split('T')[0];
                } catch (e) { val = ''; }
            } 
            // Handle Currency
            else if (col.format === 'currency') {
                val = Number(val).toFixed(2);
            }

            // Escape quotes in data to prevent CSV breaking
            // e.g. 'John "The Rock"' becomes '"John ""The Rock"""'
            const stringVal = String(val).replace(/"/g, '""');
            
            return `"${stringVal}"`;
        }).join(',');
    });

    return [headers, ...rows].join('\n');
};

module.exports = exports;
