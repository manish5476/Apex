const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Product = require('../models/productModel');
const Payment = require('../models/paymentModel');
const Customer = require('../models/customerModel');
const User = require('../models/userModel'); // Added for Staff Performance

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
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Product = require('../models/productModel');
// const Payment = require('../models/paymentModel');
// const Customer = require('../models/customerModel');

// // Helper to cast ID
// const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// // Helper for Growth Calculation
// const calculateGrowth = (current, previous) => {
//     if (previous === 0) return current === 0 ? 0 : 100;
//     return Math.round(((current - previous) / previous) * 100);
// };

// // ===========================================================================
// // 1. EXECUTIVE DASHBOARD (Existing)
// // ===========================================================================
// exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);

//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     const duration = end - start;
//     const prevStart = new Date(start - duration);
//     const prevEnd = new Date(start);

//     // SALES STATS (Current vs Previous)
//     const salesStats = await Invoice.aggregate([
//         {
//             $facet: {
//                 current: [
//                     { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//                     { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
//                 ],
//                 previous: [
//                     { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
//                     { $group: { _id: null, total: { $sum: '$grandTotal' } } }
//                 ]
//             }
//         }
//     ]);

//     // PURCHASE STATS (Current vs Previous)
//     const purchaseStats = await Purchase.aggregate([
//         {
//             $facet: {
//                 current: [
//                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//                     { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
//                 ],
//                 previous: [
//                     { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
//                     { $group: { _id: null, total: { $sum: '$grandTotal' } } }
//                 ]
//             }
//         }
//     ]);

//     const curSales = salesStats[0].current[0] || { total: 0, count: 0, due: 0 };
//     const prevSales = salesStats[0].previous[0] || { total: 0 };
//     const curPurch = purchaseStats[0].current[0] || { total: 0, count: 0, due: 0 };
//     const prevPurch = purchaseStats[0].previous[0] || { total: 0 };

//     return {
//         totalRevenue: { value: curSales.total, count: curSales.count, growth: calculateGrowth(curSales.total, prevSales.total) },
//         totalExpense: { value: curPurch.total, count: curPurch.count, growth: calculateGrowth(curPurch.total, prevPurch.total) },
//         netProfit: { value: curSales.total - curPurch.total, growth: calculateGrowth((curSales.total - curPurch.total), (prevSales.total - prevPurch.total)) },
//         outstanding: { receivables: curSales.due, payables: curPurch.due }
//     };
// };

// exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'day') => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);
    
//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     const dateFormat = interval === 'month' ? '%Y-%m' : '%Y-%m-%d';

//     // Merged Timeline (Income vs Expense)
//     const timeline = await Invoice.aggregate([
//         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//         { $project: { date: '$invoiceDate', amount: '$grandTotal', type: 'Income' } },
//         {
//             $unionWith: {
//                 coll: 'purchases',
//                 pipeline: [
//                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//                     { $project: { date: '$purchaseDate', amount: '$grandTotal', type: 'Expense' } }
//                 ]
//             }
//         },
//         {
//             $group: {
//                 _id: { $dateToString: { format: dateFormat, date: '$date' } },
//                 income: { $sum: { $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0] } },
//                 expense: { $sum: { $cond: [{ $eq: ['$type', 'Expense'] }, '$amount', 0] } }
//             }
//         },
//         { $sort: { _id: 1 } },
//         { $project: { date: '$_id', income: 1, expense: 1, profit: { $subtract: ['$income', '$expense'] }, _id: 0 } }
//     ]);

//     return { timeline };
// };

// // ===========================================================================
// // 2. FINANCIAL INTELLIGENCE (Cash Flow & Tax)
// // ===========================================================================
// exports.getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);
//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     // 1. Payment Mode Breakdown
//     const modes = await Payment.aggregate([
//         { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
//         { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
//         { $project: { name: '$_id', value: 1, _id: 0 } }
//     ]);

//     // 2. Aging Analysis (Receivables - How old is the debt?)
//     // Using current date relative to Due Date
//     const now = new Date();
//     const aging = await Invoice.aggregate([
//         { $match: { ...match, paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' } } },
//         {
//             $project: {
//                 balanceAmount: 1,
//                 daysOverdue: { 
//                     $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24] 
//                 }
//             }
//         },
//         {
//             $bucket: {
//                 groupBy: "$daysOverdue",
//                 boundaries: [0, 30, 60, 90, 365],
//                 default: "90+",
//                 output: {
//                     totalAmount: { $sum: "$balanceAmount" },
//                     count: { $sum: 1 }
//                 }
//             }
//         }
//     ]);

//     return { paymentModes: modes, agingReport: aging };
// };

// exports.getTaxStats = async (orgId, branchId, startDate, endDate) => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);
//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     const stats = await Invoice.aggregate([
//         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//         { $group: { _id: null, outputTax: { $sum: '$totalTax' }, taxableSales: { $sum: '$subTotal' } } },
//         {
//             $unionWith: {
//                 coll: 'purchases',
//                 pipeline: [
//                     { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//                     { $group: { _id: null, inputTax: { $sum: '$totalTax' }, taxablePurchase: { $sum: '$subTotal' } } }
//                 ]
//             }
//         },
//         {
//             $group: {
//                 _id: null,
//                 totalOutputTax: { $sum: '$outputTax' },
//                 totalInputTax: { $sum: '$inputTax' },
//                 totalTaxableSales: { $sum: '$taxableSales' },
//                 totalTaxablePurchase: { $sum: '$taxablePurchase' }
//             }
//         },
//         {
//             $project: {
//                 _id: 0,
//                 inputTax: '$totalInputTax',
//                 outputTax: '$totalOutputTax',
//                 netPayable: { $subtract: ['$totalOutputTax', '$totalInputTax'] }
//             }
//         }
//     ]);

//     return stats[0] || { inputTax: 0, outputTax: 0, netPayable: 0 };
// };

// // ===========================================================================
// // 3. PRODUCT PERFORMANCE (Margins & Dead Stock)
// // ===========================================================================
// exports.getProductPerformanceStats = async (orgId, branchId) => {
//     const match = { organizationId: toObjectId(orgId) };
//     // Branch filtering applies to inventory lookup
    
//     // 1. High Margin Products (Selling Price - Purchase Price)
//     // NOTE: This assumes current price. For historical accuracy, we'd query invoice items.
//     const highMargin = await Product.aggregate([
//         { $match: { ...match, isActive: true } },
//         { 
//             $project: { 
//                 name: 1, 
//                 sku: 1,
//                 margin: { $subtract: ['$sellingPrice', '$purchasePrice'] },
//                 marginPercent: {
//                      $cond: [
//                         { $eq: ['$purchasePrice', 0] }, 
//                         100, 
//                         { $multiply: [{ $divide: [{ $subtract: ['$sellingPrice', '$purchasePrice'] }, '$purchasePrice'] }, 100] }
//                      ]
//                 }
//             } 
//         },
//         { $sort: { margin: -1 } },
//         { $limit: 10 }
//     ]);

//     // 2. Dead Stock (Items with Inventory > 0 but NO Sales in last 90 days)
//     const ninetyDaysAgo = new Date();
//     ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

//     // Get IDs of sold products
//     const soldProducts = await Invoice.distinct('items.productId', { 
//         ...match, 
//         invoiceDate: { $gte: ninetyDaysAgo } 
//     });

//     const deadStock = await Product.aggregate([
//         { 
//             $match: { 
//                 ...match, 
//                 _id: { $nin: soldProducts }, // Not in sold list
//                 isActive: true
//             } 
//         },
//         { $unwind: "$inventory" }, // Check actual stock
//         { $match: { "inventory.quantity": { $gt: 0 } } }, // Has stock
//         {
//             $project: {
//                 name: 1,
//                 sku: 1,
//                 stockQuantity: "$inventory.quantity",
//                 value: { $multiply: ["$inventory.quantity", "$purchasePrice"] }
//             }
//         },
//         { $limit: 20 }
//     ]);

//     return { highMargin, deadStock };
// };

// exports.getInventoryAnalytics = async (orgId, branchId) => {
//     const match = { organizationId: toObjectId(orgId) };
    
//     // 1. Low Stock Products
//     const lowStock = await Product.aggregate([
//         { $match: { ...match, isActive: true } },
//         { $unwind: "$inventory" },
//         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
//         {
//             $project: {
//                 name: 1, sku: 1,
//                 currentStock: "$inventory.quantity",
//                 reorderLevel: "$inventory.reorderLevel",
//                 branchId: "$inventory.branchId",
//                 isLow: { $lte: ["$inventory.quantity", "$inventory.reorderLevel"] }
//             }
//         },
//         { $match: { isLow: true } },
//         { $limit: 10 },
//         { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
//         { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
//         { $project: { name: 1, sku: 1, currentStock: 1, reorderLevel: 1, branchName: "$branch.name" } }
//     ]);

//     // 2. Stock Valuation
//     const valuation = await Product.aggregate([
//         { $match: { ...match, isActive: true } },
//         { $unwind: "$inventory" },
//         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
//         {
//             $group: {
//                 _id: null,
//                 totalValue: { $sum: { $multiply: ["$inventory.quantity", "$purchasePrice"] } },
//                 totalItems: { $sum: "$inventory.quantity" },
//                 productCount: { $sum: 1 }
//             }
//         }
//     ]);

//     return {
//         lowStockAlerts: lowStock,
//         inventoryValuation: valuation[0] || { totalValue: 0, totalItems: 0, productCount: 0 }
//     };
// };

// exports.getProcurementStats = async (orgId, branchId, startDate, endDate) => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);
//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     // Top Suppliers by Spend
//     const topSuppliers = await Purchase.aggregate([
//         { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//         { $group: { _id: '$supplierId', totalSpend: { $sum: '$grandTotal' }, bills: { $sum: 1 } } },
//         { $sort: { totalSpend: -1 } },
//         { $limit: 5 },
//         { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
//         { $unwind: '$supplier' },
//         { $project: { name: '$supplier.companyName', totalSpend: 1, bills: 1 } }
//     ]);

//     return { topSuppliers };
// };

// // ===========================================================================
// // 4. CUSTOMER INSIGHTS (Risk & Acquisition)
// // ===========================================================================
// exports.getCustomerRiskStats = async (orgId, branchId) => {
//     const match = { organizationId: toObjectId(orgId) };
//     // Branch logic for customers is usually org-wide, but can apply if needed

//     // 1. Top Debtors (Credit Risk)
//     const creditRisk = await Customer.find({ 
//         ...match, 
//         outstandingBalance: { $gt: 0 } 
//     })
//     .sort({ outstandingBalance: -1 })
//     .limit(10)
//     .select('name phone outstandingBalance creditLimit');

//     // 2. Churn Risk (No purchase in 6 months)
//     const sixMonthsAgo = new Date();
//     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

//     const activeIds = await Invoice.distinct('customerId', { 
//         ...match, 
//         invoiceDate: { $gte: sixMonthsAgo } 
//     });

//     const atRiskCustomers = await Customer.countDocuments({
//         ...match,
//         _id: { $nin: activeIds },
//         type: 'business' // Usually care more about B2B churn
//     });

//     return { creditRisk, churnCount: atRiskCustomers };
// };

// exports.getLeaderboards = async (orgId, branchId, startDate, endDate) => {
//     const match = { organizationId: toObjectId(orgId) };
//     if (branchId) match.branchId = toObjectId(branchId);
//     const start = new Date(startDate);
//     const end = new Date(endDate);

//     const data = await Invoice.aggregate([
//         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//         {
//             $facet: {
//                 topCustomers: [
//                     { $group: { _id: '$customerId', totalSpent: { $sum: '$grandTotal' }, transactions: { $sum: 1 } } },
//                     { $sort: { totalSpent: -1 } },
//                     { $limit: 5 },
//                     { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
//                     { $unwind: '$customer' },
//                     { $project: { name: '$customer.name', phone: '$customer.phone', totalSpent: 1, transactions: 1 } }
//                 ],
//                 topProducts: [
//                     { $unwind: '$items' },
//                     {
//                         $group: {
//                             _id: '$items.productId',
//                             name: { $first: '$items.name' },
//                             soldQty: { $sum: '$items.quantity' },
//                             revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
//                         }
//                     },
//                     { $sort: { soldQty: -1 } },
//                     { $limit: 5 }
//                 ]
//             }
//         }
//     ]);

//     return {
//         topCustomers: data[0].topCustomers,
//         topProducts: data[0].topProducts
//     };
// };

// // const mongoose = require('mongoose');
// // const Invoice = require('../models/invoiceModel');
// // const Purchase = require('../models/purchaseModel');
// // const Product = require('../models/productModel');
// // const Payment = require('../models/paymentModel');
// // const Customer = require('../models/customerModel');

// // // Helper to cast ID
// // const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// // /**
// //  * Helper: Calculate Percentage Change
// //  */
// // const calculateGrowth = (current, previous) => {
// //     if (previous === 0) return current === 0 ? 0 : 100;
// //     return Math.round(((current - previous) / previous) * 100);
// // };

// // /**
// //  * GET EXECUTIVE DASHBOARD CARDS
// //  * Calculates Sales, Expenses, Net Profit, and Receivables with comparison to previous period.
// //  */
// // exports.getExecutiveStats = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);

// //     // Calculate Previous Period Dates for comparison
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

// //     // Extract Data safely
// //     const curSales = salesStats[0].current[0] || { total: 0, count: 0, due: 0 };
// //     const prevSales = salesStats[0].previous[0] || { total: 0 };
// //     const curPurch = purchaseStats[0].current[0] || { total: 0, count: 0, due: 0 };
// //     const prevPurch = purchaseStats[0].previous[0] || { total: 0 };

// //     return {
// //         totalRevenue: {
// //             value: curSales.total,
// //             count: curSales.count,
// //             growth: calculateGrowth(curSales.total, prevSales.total)
// //         },
// //         totalExpense: {
// //             value: curPurch.total,
// //             count: curPurch.count,
// //             growth: calculateGrowth(curPurch.total, prevPurch.total)
// //         },
// //         netProfit: {
// //             value: curSales.total - curPurch.total,
// //             growth: calculateGrowth((curSales.total - curPurch.total), (prevSales.total - prevPurch.total))
// //         },
// //         outstanding: {
// //             receivables: curSales.due,
// //             payables: curPurch.due
// //         }
// //     };
// // };

// // /**
// //  * GET VISUALIZATION DATA
// //  * Returns data formatted for Charts (Area, Bar, Pie)
// //  */
// // exports.getChartData = async (orgId, branchId, startDate, endDate, interval = 'day') => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
    
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);

// //     // Date Format based on interval
// //     const dateFormat = interval === 'month' ? '%Y-%m' : '%Y-%m-%d';

// //     // PIPELINE: Sales vs Purchases Over Time
// //     const historyData = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //         {
// //             $group: {
// //                 _id: { $dateToString: { format: dateFormat, date: '$invoiceDate' } },
// //                 sales: { $sum: '$grandTotal' }
// //             }
// //         },
// //         { $sort: { _id: 1 } }
// //     ]);

// //     // We need to merge purchases into this timeline. 
// //     // Usually easier to do separate aggregation and merge in JS for complex timelines, 
// //     // or use $unionWith (MongoDB 4.4+). Using $unionWith for "Best Practice".
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

// //     // Payment Methods Breakdown (Pie Chart)
// //     const paymentMethods = await Payment.aggregate([
// //         { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
// //         { $group: { _id: '$paymentMethod', total: { $sum: '$amount' } } },
// //         { $project: { name: '$_id', value: '$total', _id: 0 } }
// //     ]);

// //     return { timeline, paymentMethods };
// // };

// // /**
// //  * GET INVENTORY HEALTH
// //  * Low stock, Valuation, Top Performers
// //  */
// // exports.getInventoryAnalytics = async (orgId, branchId) => {
// //     const match = { organizationId: toObjectId(orgId) };
    
// //     // Note: Inventory is inside Product array or separate logic? 
// //     // Based on your model: Product has `inventory: [{branchId, quantity}]`
    
// //     // 1. Low Stock Products
// //     const lowStock = await Product.aggregate([
// //         { $match: { ...match, isActive: true } },
// //         { $unwind: "$inventory" },
// //         // Filter by branch if provided
// //         ...(branchId ? [{ $match: { "inventory.branchId": toObjectId(branchId) } }] : []),
// //         {
// //             $project: {
// //                 name: 1,
// //                 sku: 1,
// //                 currentStock: "$inventory.quantity",
// //                 reorderLevel: "$inventory.reorderLevel",
// //                 branchId: "$inventory.branchId",
// //                 isLow: { $lte: ["$inventory.quantity", "$inventory.reorderLevel"] }
// //             }
// //         },
// //         { $match: { isLow: true } },
// //         { $limit: 10 },
// //         // Lookup Branch Name
// //         { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
// //         { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
// //         { $project: { name: 1, sku: 1, currentStock: 1, reorderLevel: 1, branchName: "$branch.name" } }
// //     ]);

// //     // 2. Stock Valuation (FIFO/Average logic simplified to current purchasePrice)
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

// // /**
// //  * GET LEADERBOARD
// //  * Top Customers & Top Selling Products
// //  */
// // exports.getLeaderboards = async (orgId, branchId, startDate, endDate) => {
// //     const match = { organizationId: toObjectId(orgId) };
// //     if (branchId) match.branchId = toObjectId(branchId);
// //     const start = new Date(startDate);
// //     const end = new Date(endDate);

// //     const data = await Invoice.aggregate([
// //         { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
// //         {
// //             $facet: {
// //                 // Top Customers
// //                 topCustomers: [
// //                     { $group: { _id: '$customerId', totalSpent: { $sum: '$grandTotal' }, transactions: { $sum: 1 } } },
// //                     { $sort: { totalSpent: -1 } },
// //                     { $limit: 5 },
// //                     { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
// //                     { $unwind: '$customer' },
// //                     { $project: { name: '$customer.name', phone: '$customer.phone', totalSpent: 1, transactions: 1 } }
// //                 ],
// //                 // Top Products (Requires Unwinding Items)
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
// //         topCustomers: data[0].topCustomers,
// //         topProducts: data[0].topProducts
// //     };
// // };