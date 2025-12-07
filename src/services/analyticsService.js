const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Product = require('../models/productModel');
const Payment = require('../models/paymentModel');
const AuditLog = require('../models/auditLogModel');
const Customer = require('../models/customerModel');
const User = require('../models/userModel'); // Added for Staff Performance
const { Parser } = require('json2csv')
// Helper to cast ID
const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// Helper for Growth Calculation
const calculateGrowth = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
};

// ===========================================================================
// 1. EXECUTIVE DASHBOARD (Existing)
// ===========================================================================
exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end - start;
    const prevStart = new Date(start - duration);
    const prevEnd = new Date(start);

    // SALES STATS (Current vs Previous)
    const salesStats = await Invoice.aggregate([
        {
            $facet: {
                current: [
                    { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
                ],
                previous: [
                    { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' } } }
                ]
            }
        }
    ]);

    // PURCHASE STATS (Current vs Previous)
    const purchaseStats = await Purchase.aggregate([
        {
            $facet: {
                current: [
                    { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
                ],
                previous: [
                    { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' } } }
                ]
            }
        }
    ]);

    const curSales = salesStats[0].current[0] || { total: 0, count: 0, due: 0 };
    const prevSales = salesStats[0].previous[0] || { total: 0 };
    const curPurch = purchaseStats[0].current[0] || { total: 0, count: 0, due: 0 };
    const prevPurch = purchaseStats[0].previous[0] || { total: 0 };

    return {
        totalRevenue: { value: curSales.total, count: curSales.count, growth: calculateGrowth(curSales.total, prevSales.total) },
        totalExpense: { value: curPurch.total, count: curPurch.count, growth: calculateGrowth(curPurch.total, prevPurch.total) },
        netProfit: { value: curSales.total - curPurch.total, growth: calculateGrowth((curSales.total - curPurch.total), (prevSales.total - prevPurch.total)) },
        outstanding: { receivables: curSales.due, payables: curPurch.due }
    };
};

exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'day') => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateFormat = interval === 'month' ? '%Y-%m' : '%Y-%m-%d';

    // Merged Timeline (Income vs Expense)
    const timeline = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $project: { date: '$invoiceDate', amount: '$grandTotal', type: 'Income' } },
        {
            $unionWith: {
                coll: 'purchases',
                pipeline: [
                    { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                    { $project: { date: '$purchaseDate', amount: '$grandTotal', type: 'Expense' } }
                ]
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: dateFormat, date: '$date' } },
                income: { $sum: { $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0] } },
                expense: { $sum: { $cond: [{ $eq: ['$type', 'Expense'] }, '$amount', 0] } }
            }
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', income: 1, expense: 1, profit: { $subtract: ['$income', '$expense'] }, _id: 0 } }
    ]);

    return { timeline };
};

// ===========================================================================
// 2. FINANCIAL INTELLIGENCE (Cash Flow & Tax)
// ===========================================================================
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

    // 2. Aging Analysis (Receivables - How old is the debt?)
    // Using current date relative to Due Date
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

// ===========================================================================
// 3. PRODUCT PERFORMANCE (Margins & Dead Stock)
// ===========================================================================
exports.getProductPerformanceStats = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    // Branch filtering applies to inventory lookup
    
    // 1. High Margin Products (Selling Price - Purchase Price)
    // NOTE: This assumes current price. For historical accuracy, we'd query invoice items.
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

    // Get IDs of sold products
    const soldProducts = await Invoice.distinct('items.productId', { 
        ...match, 
        invoiceDate: { $gte: ninetyDaysAgo } 
    });

    const deadStock = await Product.aggregate([
        { 
            $match: { 
                ...match, 
                _id: { $nin: soldProducts }, // Not in sold list
                isActive: true
            } 
        },
        { $unwind: "$inventory" }, // Check actual stock
        { $match: { "inventory.quantity": { $gt: 0 } } }, // Has stock
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

exports.getInventoryAnalytics = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    
    // 1. Low Stock Products
    const lowStock = await Product.aggregate([
        { $match: { ...match, isActive: true } },
        { $unwind: "$inventory" },
        ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
        {
            $project: {
                name: 1, sku: 1,
                currentStock: "$inventory.quantity",
                reorderLevel: "$inventory.reorderLevel",
                branchId: "$inventory.branchId",
                isLow: { $lte: ["$inventory.quantity", "$inventory.reorderLevel"] }
            }
        },
        { $match: { isLow: true } },
        { $limit: 10 },
        { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { name: 1, sku: 1, currentStock: 1, reorderLevel: 1, branchName: "$branch.name" } }
    ]);

    // 2. Stock Valuation
    const valuation = await Product.aggregate([
        { $match: { ...match, isActive: true } },
        { $unwind: "$inventory" },
        ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
        {
            $group: {
                _id: null,
                totalValue: { $sum: { $multiply: ["$inventory.quantity", "$purchasePrice"] } },
                totalItems: { $sum: "$inventory.quantity" },
                productCount: { $sum: 1 }
            }
        }
    ]);

    return {
        lowStockAlerts: lowStock,
        inventoryValuation: valuation[0] || { totalValue: 0, totalItems: 0, productCount: 0 }
    };
};

exports.getProcurementStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Top Suppliers by Spend
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

// ===========================================================================
// 4. CUSTOMER INSIGHTS (Risk & Acquisition)
// ===========================================================================
exports.getCustomerRiskStats = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    // Branch logic for customers is usually org-wide, but can apply if needed

    // 1. Top Debtors (Credit Risk)
    const creditRisk = await Customer.find({ 
        ...match, 
        outstandingBalance: { $gt: 0 } 
    })
    .sort({ outstandingBalance: -1 })
    .limit(10)
    .select('name phone outstandingBalance creditLimit');

    // 2. Churn Risk (No purchase in 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const activeIds = await Invoice.distinct('customerId', { 
        ...match, 
        invoiceDate: { $gte: sixMonthsAgo } 
    });

    const atRiskCustomers = await Customer.countDocuments({
        ...match,
        _id: { $nin: activeIds },
        type: 'business' // Usually care more about B2B churn
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
        topCustomers: data[0].topCustomers,
        topProducts: data[0].topProducts
    };
};

// ===========================================================================
// 5. OPERATIONAL METRICS (Staff, Discounts, Efficiency)
// ===========================================================================
exports.getOperationalStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const data = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: end } } }, // Match ALL statuses (including cancelled for analysis)
        {
            $facet: {
                // A. Discount Analysis
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
                // B. Order Efficiency (AOV & Cancellations)
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
                // C. Staff Performance (Top Sales Reps)
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
        discountMetrics: data[0].discounts[0] || { totalDiscount: 0, discountRate: 0 },
        orderEfficiency: data[0].efficiency[0] || { cancellationRate: 0, averageOrderValue: 0 },
        topStaff: data[0].staffPerformance
    };
};

// ===========================================================================
// 🆕 1. BRANCH COMPARISON (Strategic)
// ===========================================================================
exports.getBranchComparisonStats = async (orgId, startDate, endDate) => {
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
        { $sort: { revenue: -1 } }
    ]);

    return stats;
};

// ===========================================================================
// 🆕 2. PROFITABILITY (Gross Profit = Sales - COGS)
// ===========================================================================
exports.getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    
    // We need to unwind items to calculate profit per item
    // Profit = (Selling Price - Purchase Cost) * Qty
    // Note: Ideally, purchase cost should be historical (from batch). 
    // Here we approximate using current product purchase price (COGS).

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
        { $unwind: '$product' },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                totalCOGS: { $sum: { $multiply: ['$product.purchasePrice', '$items.quantity'] } }
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

// ===========================================================================
// 🆕 3. STAFF PERFORMANCE (Detailed)
// ===========================================================================
exports.getEmployeePerformance = async (orgId, branchId, startDate, endDate) => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    };
    if (branchId) match.branchId = toObjectId(branchId);

    const stats = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$createdBy',
                totalSales: { $sum: '$grandTotal' },
                invoiceCount: { $sum: 1 },
                totalDiscountGiven: { $sum: '$totalDiscount' }
            }
        },
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
        { $sort: { totalSales: -1 } }
    ]);

    return stats;
};

// ===========================================================================
// 🆕 4. PEAK HOURS (Heatmap)
// ===========================================================================
exports.getPeakHourAnalysis = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    // Look back 30 days for trend analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const heatmap = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
        {
            $project: {
                dayOfWeek: { $dayOfWeek: '$invoiceDate' }, // 1 (Sun) - 7 (Sat)
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

    return heatmap;
};

// ===========================================================================
// 🆕 5. DEAD STOCK (No Sales > X Days)
// ===========================================================================
exports.getDeadStockAnalysis = async (orgId, branchId, daysThreshold = 90) => {
    const match = { organizationId: toObjectId(orgId) };
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysThreshold));

    // 1. Find all products sold after the cutoff date
    const soldProductIds = await Invoice.distinct('items.productId', {
        ...match,
        invoiceDate: { $gte: cutoffDate }
    });

    // 2. Find products NOT in that list but have stock > 0
    // Note: Branch filter applies to inventory subdoc
    const deadStock = await Product.aggregate([
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
                daysInactive: { $literal: daysThreshold } // Just a label
            }
        },
        { $sort: { value: -1 } }
    ]);

    return deadStock;
};

// ===========================================================================
// 🆕 6. STOCK PREDICTIONS (Run Rate)
// ===========================================================================
exports.getInventoryRunRate = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    // Calculate daily average sales over last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailySales = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: thirtyDaysAgo } } },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.productId',
                totalSold: { $sum: '$items.quantity' }
            }
        },
        {
            $project: {
                avgDailySales: { $divide: ['$totalSold', 30] }
            }
        }
    ]);

    // Map sales velocity to current stock to find "Days Left"
    // This requires a join (lookup) which can be heavy.
    // For efficiency, we'll fetch products and map in JS or use a complex aggregation.
    // Let's use aggregation:

    const predictions = await Product.aggregate([
        { $match: { ...match, isActive: true } },
        { $unwind: '$inventory' },
        ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
        {
            $lookup: {
                from: 'invoices', // Self-join simulation via pipeline is expensive, so we use the pre-calculated logic approach usually.
                // Simplified: We will just assume the 'dailySales' array calculated above is passed, 
                // but MongoDB 5.0+ allows $lookup with pipeline on collections.
                // Optimized approach: Join with a view or simple lookup.
                // Here, let's just return low stock based on static reorder level for safety if velocity is complex,
                // BUT let's try a direct lookup for recent sales count.
                let: { pid: '$_id' },
                pipeline: [
                   { $match: { $expr: { $and: [
                       { $eq: ['$organizationId', toObjectId(orgId)] },
                       { $gte: ['$invoiceDate', thirtyDaysAgo] }
                   ]}}},
                   { $unwind: '$items' },
                   { $match: { $expr: { $eq: ['$items.productId', '$$pid'] } } },
                   { $group: { _id: null, sold: { $sum: '$items.quantity' } } }
                ],
                as: 'salesStats'
            }
        },
        {
            $addFields: {
                last30DaysSold: { $ifNull: [{ $first: '$salesStats.sold' }, 0] }
            }
        },
        {
            $addFields: {
                dailyVelocity: { $divide: ['$last30DaysSold', 30] }
            }
        },
        {
            $match: { dailyVelocity: { $gt: 0 } } // Only predict for items selling
        },
        {
            $project: {
                name: 1,
                currentStock: '$inventory.quantity',
                dailyVelocity: 1,
                daysUntilStockout: { $divide: ['$inventory.quantity', '$dailyVelocity'] }
            }
        },
        { $match: { daysUntilStockout: { $lte: 14 } } }, // Only warn if < 14 days left
        { $sort: { daysUntilStockout: 1 } }
    ]);

    return predictions;
};

// ===========================================================================
// 🆕 7. DEBTOR AGING (Who owes money?)
// ===========================================================================
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
                boundaries: [0, 31, 61, 91], // 0-30, 31-60, 61-90, 91+
                default: "91+",
                output: {
                    totalAmount: { $sum: "$balanceAmount" },
                    invoices: { $push: { number: "$invoiceNumber", amount: "$balanceAmount", cust: "$customerId" } }
                }
            }
        }
    ]);

    // Map bucket IDs to readable labels
    const labels = { 0: '0-30 Days', 31: '31-60 Days', 61: '61-90 Days', '91+': '90+ Days' };
    return aging.map(a => ({
        range: labels[a._id] || a._id,
        amount: a.totalAmount,
        count: a.invoices.length
    }));
};

// ===========================================================================
// 🆕 8. SECURITY PULSE (Audit Logs)
// ===========================================================================
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
    
    // Count specific risky actions
    const riskCount = await AuditLog.countDocuments({
        ...match,
        action: { $in: ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE'] }
    });

    return { recentEvents: logs, riskyActions: riskCount };
};

// ===========================================================================
// 🆕 9. DATA EXPORT (Raw)
// ===========================================================================
// exports.getExportData = async (orgId, type, startDate, endDate) => {
//     const match = { 
//         organizationId: toObjectId(orgId),
//         createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
//     };

//     if (type === 'sales') {
//         const invoices = await Invoice.find(match)
//             .populate('customerId', 'name')
//             .populate('branchId', 'name')
//             .lean();
        
//         return invoices.map(inv => ({
//             Date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
//             InvoiceNo: inv.invoiceNumber,
//             Customer: inv.customerId?.name || 'Walk-in',
//             Branch: inv.branchId?.name,
//             Amount: inv.grandTotal,
//             Status: inv.paymentStatus
//         }));
//     }

//     if (type === 'inventory') {
//         const products = await Product.find({ organizationId: match.organizationId }).lean();
//         // Flatten inventory array
//         let rows = [];
//         products.forEach(p => {
//             p.inventory.forEach(inv => {
//                 rows.push({
//                     Product: p.name,
//                     SKU: p.sku,
//                     Stock: inv.quantity,
//                     Price: p.sellingPrice
//                 });
//             });
//         });
//         return rows;
//     }

//     if (type === 'tax') {
//         // Similar to sales but focused on tax breakdown
//         const invoices = await Invoice.find(match).lean();
//         return invoices.map(inv => ({
//             InvoiceNo: inv.invoiceNumber,
//             Taxable: inv.subTotal,
//             TaxAmount: inv.totalTax,
//             Total: inv.grandTotal
//         }));
//     }

//     return [];
// };


// In analyticsService.js
exports.generateForecast = async (orgId) => {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const today = new Date();
    
    // Get sales so far this month
    const currentSales = await Invoice.aggregate([
        { $match: { 
            organizationId: mongoose.Types.ObjectId(orgId), 
            invoiceDate: { $gte: startOfMonth },
            status: { $ne: 'cancelled' }
        }},
        { $group: { _id: null, total: { $sum: "$grandTotal" } } }
    ]);

    const revenueSoFar = currentSales[0]?.total || 0;
    const daysPassed = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    // Linear projection
    const dailyAverage = revenueSoFar / daysPassed;
    const predictedRevenue = Math.round(revenueSoFar + (dailyAverage * (daysInMonth - daysPassed)));

    return {
        revenue: predictedRevenue,
        trend: dailyAverage > 0 ? 'up' : 'stable'
    };
};

// ===========================================================================
// 9. DATA EXPORT (Unified & Robust)
// ===========================================================================
exports.getRawSalesData = async (orgId, startDate, endDate) => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };
    const invoices = await Invoice.find(match)
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
};

exports.getInventoryDump = async (orgId) => {
    const products = await Product.find({ organizationId: toObjectId(orgId) }).lean();
    let rows = [];
    products.forEach(p => {
        // Flatten array if product has multiple branch entries
        if (p.inventory && p.inventory.length > 0) {
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
            // Product with no inventory record
            rows.push({ name: p.name, sku: p.sku, stock: 0, value: 0, reorderLevel: 0 });
        }
    });
    return rows;
};

exports.getExportData = async (orgId, type, startDate, endDate) => {
    if (type === 'sales') return this.getRawSalesData(orgId, startDate, endDate);
    if (type === 'inventory') return this.getInventoryDump(orgId);
    if (type === 'tax') return this.getRawSalesData(orgId, startDate, endDate); // Can refine later
    return [];
};


// ===========================================================================
// 🌟 NEW: FORECASTING (Linear Regression)
// ===========================================================================
exports.generateForecast = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    // Get last 6 months revenue grouped by month
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

    // Simple Linear Regression: y = mx + b
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

    const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;
    
    // Predict next month (x = n + 1)
    const nextMonthRevenue = Math.round(slope * (n + 1) + intercept);
    const trend = slope > 0 ? 'up' : (slope < 0 ? 'down' : 'stable');

    return { revenue: Math.max(0, nextMonthRevenue), trend, historical: monthlySales };
};

// ===========================================================================
// 🌟 NEW: STAFF PERFORMANCE (Aliased for Controller)
// ===========================================================================
exports.getStaffStats = async (orgId, startDate, endDate) => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    };

    const stats = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$createdBy',
                totalSales: { $sum: '$grandTotal' },
                invoiceCount: { $sum: 1 },
                totalDiscount: { $sum: '$totalDiscount' }
            }
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        {
            $project: {
                name: '$user.name',
                email: '$user.email',
                totalSales: 1,
                invoiceCount: 1,
                averageTicketSize: { $divide: ['$totalSales', '$invoiceCount'] }
            }
        },
        { $sort: { totalSales: -1 } }
    ]);

    return stats;
};

// ===========================================================================
// 🌟 NEW: CUSTOMER RFM ANALYSIS (Recency, Frequency, Monetary)
// ===========================================================================
exports.getCustomerRFMAnalysis = async (orgId) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    
    // 1. Aggregate per customer
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

    // 2. Score them (Simplified 1-3 scale)
    // In production, we'd calculate percentiles. Here we use hard thresholds for speed.
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

    // 3. Group for Dashboard Chart
    const segments = { Champion: 0, 'At Risk': 0, Loyal: 0, 'New Customer': 0, Standard: 0 };
    scored.forEach(s => {
        if (segments[s.segment] !== undefined) segments[s.segment]++;
        else segments.Standard++;
    });

    return segments;
};

// //////////////////////////////////////////44

// ===========================================================================
// 🌟 NEW: CRITICAL ALERTS (Unified)
// ===========================================================================
exports.getCriticalAlerts = async (orgId, branchId) => {
    const inv = await this.getInventoryAnalytics(orgId, branchId);
    const risk = await this.getCustomerRiskStats(orgId, branchId);
    
    return {
        lowStockCount: inv.lowStockAlerts.length,
        highRiskDebtCount: risk.creditRisk.length,
        itemsToReorder: inv.lowStockAlerts.map(i => i.name)
    };
};

// ===========================================================================
// 9. DATA EXPORT (Unified & Robust)
// ===========================================================================
// 🌟 NEW: COHORT ANALYSIS (Retention)
// ===========================================================================
exports.getCohortAnalysis = async (orgId, monthsBack = 6) => {
    const match = { 
        organizationId: toObjectId(orgId),
        status: { $ne: 'cancelled' }
    };

    const start = new Date();
    start.setMonth(start.getMonth() - monthsBack);
    start.setDate(1); // Start of that month

    const cohorts = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start } } },
        // 1. Find first purchase date for each customer
        {
            $group: {
                _id: "$customerId",
                firstPurchase: { $min: "$invoiceDate" },
                allPurchases: { $push: "$invoiceDate" }
            }
        },
        // 2. Group by Cohort Month (YYYY-MM)
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

    // Transform into friendly structure: { cohort: "2023-10", retention: [100%, 20%, 10%...] }
    // (This transformation can also happen on frontend to save backend CPU)
    return cohorts;
};














/**const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Product = require('../models/productModel');
const Payment = require('../models/paymentModel');
const AuditLog = require('../models/auditLogModel');
const Customer = require('../models/customerModel');
const User = require('../models/userModel');

// Helper to cast ID
const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// Helper for Growth Calculation
const calculateGrowth = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
};

// ===========================================================================
// 1. EXECUTIVE DASHBOARD
// ===========================================================================
exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end - start;
    const prevStart = new Date(start - duration);
    const prevEnd = new Date(start);

    // SALES STATS (Current vs Previous)
    const salesStats = await Invoice.aggregate([
        {
            $facet: {
                current: [
                    { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
                ],
                previous: [
                    { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' } } }
                ]
            }
        }
    ]);

    // PURCHASE STATS (Current vs Previous)
    const purchaseStats = await Purchase.aggregate([
        {
            $facet: {
                current: [
                    { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
                ],
                previous: [
                    { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$grandTotal' } } }
                ]
            }
        }
    ]);

    const curSales = salesStats[0].current[0] || { total: 0, count: 0, due: 0 };
    const prevSales = salesStats[0].previous[0] || { total: 0 };
    const curPurch = purchaseStats[0].current[0] || { total: 0, count: 0, due: 0 };
    const prevPurch = purchaseStats[0].previous[0] || { total: 0 };

    return {
        revenue: curSales.total, // Normalized for Controller
        profit: curSales.total - curPurch.total, // Normalized for Controller
        expenses: curPurch.total,
        outstanding: curSales.due,
        // Detailed Object for Legacy support
        totalRevenue: { value: curSales.total, count: curSales.count, growth: calculateGrowth(curSales.total, prevSales.total) },
        totalExpense: { value: curPurch.total, count: curPurch.count, growth: calculateGrowth(curPurch.total, prevPurch.total) },
        netProfit: { value: curSales.total - curPurch.total, growth: calculateGrowth((curSales.total - curPurch.total), (prevSales.total - prevPurch.total)) },
        outstandingDetail: { receivables: curSales.due, payables: curPurch.due }
    };
};

exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'day') => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateFormat = interval === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const timeline = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $project: { date: '$invoiceDate', amount: '$grandTotal', type: 'Income' } },
        {
            $unionWith: {
                coll: 'purchases',
                pipeline: [
                    { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                    { $project: { date: '$purchaseDate', amount: '$grandTotal', type: 'Expense' } }
                ]
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: dateFormat, date: '$date' } },
                income: { $sum: { $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0] } },
                expense: { $sum: { $cond: [{ $eq: ['$type', 'Expense'] }, '$amount', 0] } }
            }
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', income: 1, expense: 1, profit: { $subtract: ['$income', '$expense'] }, _id: 0 } }
    ]);

    return { timeline };
};

// ===========================================================================
// 2. FINANCIAL INTELLIGENCE (Cash Flow & Tax)
// ===========================================================================
exports.getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const modes = await Payment.aggregate([
        { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
        { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
        { $project: { name: '$_id', value: 1, _id: 0 } }
    ]);

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

// ===========================================================================
// 3. PRODUCT PERFORMANCE (Margins & Dead Stock)
// ===========================================================================
exports.getProductPerformanceStats = async (orgId, branchId, sortBy = 'revenue') => {
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

    // Dead Stock Logic
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

exports.getInventoryAnalytics = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    
    // 1. Low Stock Products
    const lowStock = await Product.aggregate([
        { $match: { ...match, isActive: true } },
        { $unwind: "$inventory" },
        ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
        {
            $project: {
                name: 1, sku: 1,
                currentStock: "$inventory.quantity",
                reorderLevel: "$inventory.reorderLevel",
                branchId: "$inventory.branchId",
                isLow: { $lte: ["$inventory.quantity", "$inventory.reorderLevel"] }
            }
        },
        { $match: { isLow: true } },
        { $limit: 10 },
        { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { name: 1, sku: 1, currentStock: 1, reorderLevel: 1, branchName: "$branch.name" } }
    ]);

    // 2. Stock Valuation
    const valuation = await Product.aggregate([
        { $match: { ...match, isActive: true } },
        { $unwind: "$inventory" },
        ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
        {
            $group: {
                _id: null,
                totalValue: { $sum: { $multiply: ["$inventory.quantity", "$purchasePrice"] } },
                totalItems: { $sum: "$inventory.quantity" },
                productCount: { $sum: 1 }
            }
        }
    ]);

    return {
        lowStockAlerts: lowStock,
        inventoryValuation: valuation[0] || { totalValue: 0, totalItems: 0, productCount: 0 }
    };
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

// ===========================================================================
// 4. CUSTOMER INSIGHTS & EXTRAS
// ===========================================================================
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
        topCustomers: data[0].topCustomers,
        topProducts: data[0].topProducts
    };
};

// ===========================================================================
// 🌟 NEW: FORECASTING (Linear Regression)
// ===========================================================================
exports.generateForecast = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);

    // Get last 6 months revenue grouped by month
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

    // Simple Linear Regression: y = mx + b
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

    const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;
    
    // Predict next month (x = n + 1)
    const nextMonthRevenue = Math.round(slope * (n + 1) + intercept);
    const trend = slope > 0 ? 'up' : (slope < 0 ? 'down' : 'stable');

    return { revenue: Math.max(0, nextMonthRevenue), trend, historical: monthlySales };
};

// ===========================================================================
// 🌟 NEW: STAFF PERFORMANCE (Aliased for Controller)
// ===========================================================================
exports.getStaffStats = async (orgId, startDate, endDate) => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    };

    const stats = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$createdBy',
                totalSales: { $sum: '$grandTotal' },
                invoiceCount: { $sum: 1 },
                totalDiscount: { $sum: '$totalDiscount' }
            }
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        {
            $project: {
                name: '$user.name',
                email: '$user.email',
                totalSales: 1,
                invoiceCount: 1,
                averageTicketSize: { $divide: ['$totalSales', '$invoiceCount'] }
            }
        },
        { $sort: { totalSales: -1 } }
    ]);

    return stats;
};

// ===========================================================================
// 🌟 NEW: CUSTOMER RFM ANALYSIS (Recency, Frequency, Monetary)
// ===========================================================================
exports.getCustomerRFMAnalysis = async (orgId) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    
    // 1. Aggregate per customer
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

    // 2. Score them (Simplified 1-3 scale)
    // In production, we'd calculate percentiles. Here we use hard thresholds for speed.
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

    // 3. Group for Dashboard Chart
    const segments = { Champion: 0, 'At Risk': 0, Loyal: 0, 'New Customer': 0, Standard: 0 };
    scored.forEach(s => {
        if (segments[s.segment] !== undefined) segments[s.segment]++;
        else segments.Standard++;
    });

    return segments;
};

// ===========================================================================
// 🌟 NEW: CRITICAL ALERTS (Unified)
// ===========================================================================
exports.getCriticalAlerts = async (orgId, branchId) => {
    const inv = await this.getInventoryAnalytics(orgId, branchId);
    const risk = await this.getCustomerRiskStats(orgId, branchId);
    
    return {
        lowStockCount: inv.lowStockAlerts.length,
        highRiskDebtCount: risk.creditRisk.length,
        itemsToReorder: inv.lowStockAlerts.map(i => i.name)
    };
};

// ===========================================================================
// 9. DATA EXPORT (Unified & Robust)
// ===========================================================================
exports.getRawSalesData = async (orgId, startDate, endDate) => {
    const match = { 
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };

    const invoices = await Invoice.find(match)
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
};

exports.getInventoryDump = async (orgId) => {
    const products = await Product.find({ organizationId: toObjectId(orgId) }).lean();
    let rows = [];
    products.forEach(p => {
        // Flatten array if product has multiple branch entries
        if (p.inventory && p.inventory.length > 0) {
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
            // Product with no inventory record
            rows.push({ name: p.name, sku: p.sku, stock: 0, value: 0, reorderLevel: 0 });
        }
    });
    return rows;
};

exports.getExportData = async (orgId, type, startDate, endDate) => {
    if (type === 'sales') return this.getRawSalesData(orgId, startDate, endDate);
    if (type === 'inventory') return this.getInventoryDump(orgId);
    if (type === 'tax') return this.getRawSalesData(orgId, startDate, endDate); // Can refine later
    return [];
}; */