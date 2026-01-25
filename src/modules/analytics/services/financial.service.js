const mongoose = require('mongoose');
const Sales = require('../../inventory/core/sales.model');
const Purchase = require('../../inventory/core/purchase.model');
const Payment = require('../../accounting/payments/payment.model');
const EMI = require('../../accounting/payments/emi.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');
const Invoice = require('../../accounting/billing/invoice.model');
const Customer = require('../../organization/core/customer.model');
const { toObjectId } = require('../utils/analytics.utils');

/* ==========================================================================
   💰 ENTERPRISE FINANCIAL ANALYTICS SERVICE - COMPLETE 12-FUNCTION SUITE
   ========================================================================== */

/**
 * 1. CASH FLOW STATS: Payment mode distribution and Liquidity
 */
exports.getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId), status: 'completed' };
    if (branchId) match.branchId = toObjectId(branchId);

    const [modes, aging] = await Promise.all([
        Payment.aggregate([
            { $match: { ...match, paymentDate: { $gte: new Date(startDate), $lte: new Date(endDate) }, type: 'inflow' } },
            { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
            { $project: { name: '$_id', value: 1, _id: 0 } }
        ]),
        this.getDebtorAging(orgId, branchId)
    ]);
    return { paymentModes: modes, agingReport: aging };
};

/**
 * 2. TAX STATS: Comprehensive GST Reconciliation (Output vs Input)
 */
exports.getTaxStats = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
    if (branchId) match.branchId = toObjectId(branchId);
    const start = new Date(startDate); const end = new Date(endDate);

    const stats = await Sales.aggregate([
        { $match: { ...match, createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, outputTax: { $sum: '$taxTotal' }, taxableSales: { $sum: '$subTotal' } } },
        {
            $unionWith: {
                coll: 'purchases',
                pipeline: [
                    { $match: { ...match, purchaseDate: { $gte: start, $lte: end } } },
                    { $group: { _id: null, inputTax: { $sum: '$totalTax' }, taxablePurchase: { $sum: '$subTotal' } } }
                ]
            }
        },
        { $group: { _id: null, outTax: { $sum: '$outputTax' }, inTax: { $sum: '$inputTax' } } },
        { $project: { _id: 0, inputTax: '$inTax', outputTax: '$outTax', netPayable: { $subtract: ['$outTax', '$inTax'] } } }
    ]);
    return stats[0] || { inputTax: 0, outputTax: 0, netPayable: 0 };
};

/**
 * 3. GROSS PROFIT ANALYSIS: Accurate Realized Profit via Snapshots
 */
exports.getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
    const match = { organizationId: toObjectId(orgId), status: 'active', createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    if (branchId) match.branchId = toObjectId(branchId);

    const data = await Sales.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
            $group: {
                _id: null,
                revenue: { $sum: '$items.lineTotal' },
                cogs: { $sum: { $multiply: ['$items.qty', '$items.purchasePriceAtSale'] } }
            }
        },
        {
            $project: {
                _id: 0, revenue: 1, costOfGoodsSold: '$cogs', grossProfit: { $subtract: ['$revenue', '$cogs'] },
                marginPercent: { $cond: [{ $eq: ['$revenue', 0] }, 0, { $multiply: [{ $divide: [{ $subtract: ['$revenue', '$cogs'] }, '$revenue'] }, 100] }] }
            }
        }
    ]);
    return data[0] || { revenue: 0, costOfGoodsSold: 0, grossProfit: 0, marginPercent: 0 };
};

/**
 * 4. DEBTOR AGING: Credit risk distribution
 */
exports.getDebtorAging = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), paymentStatus: { $ne: 'paid' }, status: 'active', balanceAmount: { $gt: 0 } };
    if (branchId) match.branchId = toObjectId(branchId);
    const now = new Date();

    return await Sales.aggregate([
        { $match: match },
        { $project: { balanceAmount: 1, daysOverdue: { $floor: { $divide: [{ $subtract: [now, '$createdAt'] }, 86400000] } } } },
        { $bucket: { groupBy: "$daysOverdue", boundaries: [0, 31, 61, 91], default: "91+", output: { amount: { $sum: "$balanceAmount" }, count: { $sum: 1 } } } },
        { $project: { range: { $switch: { branches: [{ case: { $eq: ["$_id", 0] }, then: "0-30 Days" }, { case: { $eq: ["$_id", 31] }, then: "31-60 Days" }, { case: { $eq: ["$_id", 61] }, then: "61-90 Days" }], default: "90+ Days" } }, amount: 1, count: 1, _id: 0 } }
    ]);
};

/**
 * 5. CALCULATE LTV (Life Time Value): Identifying high-value customers
 */
exports.calculateLTV = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), status: 'active' };
    if (branchId) match.branchId = toObjectId(branchId);

    const stats = await Sales.aggregate([
        { $match: match },
        { $group: { _id: '$customerId', totalSpent: { $sum: '$totalAmount' }, txnCount: { $sum: 1 }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'cust' } },
        { $unwind: '$cust' },
        {
            $project: {
                name: '$cust.name', ltv: '$totalSpent', avgOrder: { $divide: ['$totalSpent', '$txnCount'] },
                tier: { $cond: [{ $gt: ['$totalSpent', 50000] }, 'Platinum', { $cond: [{ $gt: ['$totalSpent', 20000] }, 'Gold', 'Silver'] }] }
            }
        },
        { $sort: { ltv: -1 } }, { $limit: 20 }
    ]);
    return { customers: stats, summary: { avgLTV: stats.reduce((a, b) => a + b.ltv, 0) / stats.length || 0 } };
};

/**
 * 6. ANALYZE PAYMENT HABITS: Scoring customer reliability
 */
exports.analyzePaymentHabits = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), referenceType: 'payment' };
    if (branchId) match.branchId = toObjectId(branchId);

    return await AccountEntry.aggregate([
        { $match: match },
        { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'inv' } },
        { $unwind: '$inv' },
        { $project: { customerId: 1, delay: { $divide: [{ $subtract: ['$date', '$inv.invoiceDate'] }, 86400000] } } },
        { $group: { _id: '$customerId', avgDelay: { $avg: '$delay' } } },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'c' } },
        { $unwind: '$c' },
        { $project: { name: '$c.name', avgDelay: { $round: ['$avgDelay', 1] }, rating: { $cond: [{ $lte: ['$avgDelay', 7] }, 'Excellent', 'Needs Review'] } } }
    ]);
};

/**
 * 7. GENERATE FORECAST: Linear Regression for basic trends
 */
exports.generateForecast = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), status: 'active' };
    const historical = await Sales.aggregate([
        { $match: { ...match, createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, total: { $sum: "$totalAmount" } } },
        { $sort: { _id: 1 } }
    ]);
    if (historical.length < 2) return { revenue: historical[0]?.total || 0, trend: 'stable' };

    const n = historical.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    historical.forEach((m, i) => { const x = i + 1; const y = m.total; sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; });
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { revenue: Math.max(0, Math.round(slope * (n + 1) + intercept)), trend: slope > 0 ? 'up' : 'down', historical };
};

/**
 * 8. GENERATE ADVANCED FORECAST: Multi-period confidence intervals
 */
exports.generateAdvancedForecast = async (orgId, branchId) => {
    const base = await this.generateForecast(orgId, branchId);
    return {
        forecast: [{ period: 'Next Month', predictedRevenue: base.revenue, confidence: 85, range: { low: base.revenue * 0.9, high: base.revenue * 1.1 } }],
        historicalDataPoints: base.historical?.length || 0,
        model: 'least_squares_regression'
    };
};

/**
 * 9. CASH FLOW PROJECTION: Predictive future liquidity
 */
exports.generateCashFlowProjection = async (orgId, branchId, days = 30) => {
    const aging = await this.getDebtorAging(orgId, branchId);
    const totalDue = aging.reduce((acc, curr) => acc + curr.amount, 0);
    return {
        projectedCash: totalDue * 0.7, // Assuming 70% collection rate
        dailyProjections: Array.from({ length: days }, (_, i) => ({
            date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
            projectedInflow: totalDue / days,
            netCash: (totalDue / days) * 0.8
        }))
    };
};

/**
 * 10. ASSESS CASH HEALTH: Liquidity scoring
 */
exports.assessCashHealth = (currentFlow, projections) => {
    const ratio = currentFlow.metrics.totalInflow / (currentFlow.metrics.totalOutflow || 1);
    return { score: Math.min(100, Math.round(ratio * 50)), status: ratio > 1.2 ? 'Healthy' : 'At Risk', risk: ratio < 1 ? 'High' : 'Low' };
};

/**
 * 11. EMI ANALYTICS: Portfolio risk and interest revenue
 */
exports.getEMIAnalytics = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    return await EMI.aggregate([
        { $match: match },
        { $unwind: '$installments' },
        { $group: { _id: '$status', total: { $sum: '$totalAmount' }, paid: { $sum: '$installments.paidAmount' }, overdue: { $sum: { $cond: [{ $and: [{ $eq: ['$installments.paymentStatus', 'pending'] }, { $lt: ['$installments.dueDate', new Date()] }] }, 1, 0] } }, count: { $sum: 1 } } },
        { $project: { status: '$_id', totalPortfolio: '$total', collectionEfficiency: { $multiply: [{ $divide: ['$paid', '$total'] }, 100] }, defaultRate: { $divide: ['$overdue', '$count'] } } }
    ]);
};

/**
 * 12. FORECAST ACCURACY: Back-testing model performance
 */
exports.calculateForecastAccuracy = async (orgId, branchId) => {
    const forecast = await this.generateForecast(orgId, branchId);
    const actuals = forecast.historical?.slice(-1)[0]?.total || 0;
    const mape = Math.abs((actuals - forecast.revenue) / (actuals || 1)) * 100;
    return { mape: mape.toFixed(2), accuracy: mape < 15 ? 'High' : 'Moderate' };
};

module.exports = {
    getCashFlowStats: exports.getCashFlowStats,
    getTaxStats: exports.getTaxStats,
    getGrossProfitAnalysis: exports.getGrossProfitAnalysis,
    getDebtorAging: exports.getDebtorAging,
    calculateLTV: exports.calculateLTV,
    analyzePaymentHabits: exports.analyzePaymentHabits,
    generateForecast: exports.generateForecast,
    generateAdvancedForecast: exports.generateAdvancedForecast,
    generateCashFlowProjection: exports.generateCashFlowProjection,
    assessCashHealth: exports.assessCashHealth,
    getEMIAnalytics: exports.getEMIAnalytics,
    calculateForecastAccuracy: exports.calculateForecastAccuracy
};











// const mongoose = require('mongoose');
// const Invoice = require('../../inventory/core/sales.model');
// const Purchase = require('../../inventory/core/purchase.model');
// const Payment = require('../../accounting/payments/payment.model');
// const EMI = require('../../accounting/payments/emi.model');
// const AccountEntry = require('../../accounting/core/accountEntry.model');
// const { toObjectId } = require('../utils/analytics.utils');


// const getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId) };
//         if (branchId) match.branchId = toObjectId(branchId);
//         const start = new Date(startDate);
//         const end = new Date(endDate);

//         // 1. Payment Mode Breakdown
//         const modes = await Payment.aggregate([
//             { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
//             { $group: { _id: '$paymentMethod', value: { $sum: '$amount' } } },
//             { $project: { name: '$_id', value: 1, _id: 0 } }
//         ]);

//         // 2. Aging Analysis (Receivables)
//         const now = new Date();
//         const aging = await Invoice.aggregate([
//             { $match: { ...match, paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' } } },
//             {
//                 $project: {
//                     balanceAmount: 1,
//                     daysOverdue: {
//                         $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24]
//                     }
//                 }
//             },
//             {
//                 $bucket: {
//                     groupBy: "$daysOverdue",
//                     boundaries: [0, 30, 60, 90, 365],
//                     default: "90+",
//                     output: {
//                         totalAmount: { $sum: "$balanceAmount" },
//                         count: { $sum: 1 }
//                     }
//                 }
//             }
//         ]);

//         return { paymentModes: modes, agingReport: aging };
//     } catch (error) {
//         console.error('Error in getCashFlowStats:', error);
//         throw new Error(`Failed to fetch cash flow stats: ${error.message}`);
//     }
// };

// const getTaxStats = async (orgId, branchId, startDate, endDate) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId) };
//         if (branchId) match.branchId = toObjectId(branchId);
//         const start = new Date(startDate);
//         const end = new Date(endDate);

//         const stats = await Invoice.aggregate([
//             { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//             { $group: { _id: null, outputTax: { $sum: '$totalTax' }, taxableSales: { $sum: '$subTotal' } } },
//             {
//                 $unionWith: {
//                     coll: 'purchases',
//                     pipeline: [
//                         { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
//                         { $group: { _id: null, inputTax: { $sum: '$totalTax' }, taxablePurchase: { $sum: '$subTotal' } } }
//                     ]
//                 }
//             },
//             {
//                 $group: {
//                     _id: null,
//                     totalOutputTax: { $sum: '$outputTax' },
//                     totalInputTax: { $sum: '$inputTax' },
//                     totalTaxableSales: { $sum: '$taxableSales' },
//                     totalTaxablePurchase: { $sum: '$taxablePurchase' }
//                 }
//             },
//             {
//                 $project: {
//                     _id: 0,
//                     inputTax: '$totalInputTax',
//                     outputTax: '$totalOutputTax',
//                     netPayable: { $subtract: ['$totalOutputTax', '$totalInputTax'] }
//                 }
//             }
//         ]);

//         return stats[0] || { inputTax: 0, outputTax: 0, netPayable: 0 };
//     } catch (error) {
//         console.error('Error in getTaxStats:', error);
//         throw new Error(`Failed to fetch tax stats: ${error.message}`);
//     }
// };


// const getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId) };
//         if (branchId) match.branchId = toObjectId(branchId);

//         const data = await Invoice.aggregate([
//             {
//                 $match: {
//                     ...match,
//                     invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
//                     status: { $ne: 'cancelled' }
//                 }
//             },
//             { $unwind: '$items' },
//             {
//                 $lookup: {
//                     from: 'products',
//                     localField: 'items.productId',
//                     foreignField: '_id',
//                     as: 'product'
//                 }
//             },
//             { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
//             {
//                 $group: {
//                     _id: null,
//                     totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
//                     totalCOGS: { $sum: { $multiply: [{ $ifNull: ['$product.purchasePrice', 0] }, '$items.quantity'] } }
//                 }
//             },
//             {
//                 $project: {
//                     _id: 0,
//                     totalRevenue: 1,
//                     totalCOGS: 1,
//                     grossProfit: { $subtract: ['$totalRevenue', '$totalCOGS'] },
//                     marginPercent: {
//                         $cond: [
//                             { $eq: ['$totalRevenue', 0] },
//                             0,
//                             { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCOGS'] }, '$totalRevenue'] }, 100] }
//                         ]
//                     }
//                 }
//             }
//         ]);

//         return data[0] || { totalRevenue: 0, totalCOGS: 0, grossProfit: 0, marginPercent: 0 };
//     } catch (error) {
//         console.error('Error in getGrossProfitAnalysis:', error);
//         throw new Error(`Failed to fetch gross profit analysis: ${error.message}`);
//     }
// };

// const getDebtorAging = async (orgId, branchId) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = {
//             organizationId: toObjectId(orgId),
//             paymentStatus: { $ne: 'paid' },
//             status: { $ne: 'cancelled' },
//             balanceAmount: { $gt: 0 }
//         };
//         if (branchId) match.branchId = toObjectId(branchId);

//         const now = new Date();

//         const aging = await Invoice.aggregate([
//             { $match: match },
//             {
//                 $project: {
//                     customerId: 1,
//                     invoiceNumber: 1,
//                     balanceAmount: 1,
//                     dueDate: { $ifNull: ['$dueDate', '$invoiceDate'] },
//                     daysOverdue: {
//                         $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", "$invoiceDate"] }] }, 1000 * 60 * 60 * 24]
//                     }
//                 }
//             },
//             {
//                 $bucket: {
//                     groupBy: "$daysOverdue",
//                     boundaries: [0, 31, 61, 91],
//                     default: "91+",
//                     output: {
//                         totalAmount: { $sum: "$balanceAmount" },
//                         invoices: { $push: { number: "$invoiceNumber", amount: "$balanceAmount", cust: "$customerId" } }
//                 }
//                 }
//             }
//         ]);

//         const labels = { 0: '0-30 Days', 31: '31-60 Days', 61: '61-90 Days', '91+': '90+ Days' };
//         return aging.map(a => ({
//             range: labels[a._id] || a._id,
//             amount: a.totalAmount,
//             count: a.invoices.length
//         }));
//     } catch (error) {
//         console.error('Error in getDebtorAging:', error);
//         throw new Error(`Failed to fetch debtor aging: ${error.message}`);
//     }
// };

// const calculateLTV = async (orgId, branchId) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = {
//             organizationId: toObjectId(orgId),
//             status: { $ne: 'cancelled' }
//         };

//         if (branchId) match.branchId = toObjectId(branchId);

//         const customerStats = await Invoice.aggregate([
//             { $match: match },
//             {
//                 $group: {
//                     _id: '$customerId',
//                     totalSpent: { $sum: '$grandTotal' },
//                     transactionCount: { $sum: 1 },
//                     firstPurchase: { $min: '$invoiceDate' },
//                     lastPurchase: { $max: '$invoiceDate' },
//                     avgOrderValue: { $avg: '$grandTotal' }
//                 }
//             },
//             {
//                 $project: {
//                     totalSpent: 1,
//                     transactionCount: 1,
//                     avgOrderValue: { $round: ['$avgOrderValue', 2] },
//                     lifespanDays: {
//                         $cond: [
//                             { $eq: ['$firstPurchase', '$lastPurchase'] },
//                             1,
//                             {
//                                 $divide: [
//                                     { $subtract: ['$lastPurchase', '$firstPurchase'] },
//                                     1000 * 60 * 60 * 24
//                                 ]
//                             }
//                         ]
//                     }
//                 }
//             },
//             { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
//             { $unwind: '$customer' },
//             {
//                 $project: {
//                     customerId: '$_id',
//                     name: '$customer.name',
//                     email: '$customer.email',
//                     totalSpent: 1,
//                     transactionCount: 1,
//                     avgOrderValue: 1,
//                     lifespanDays: { $round: ['$lifespanDays', 1] },
//                     ltv: '$totalSpent'
//                 }
//             },
//             { $sort: { ltv: -1 } },
//             { $limit: 100 }
//         ]);

//         // Calculate LTV tiers
//         const tieredCustomers = customerStats.map(customer => {
//             let tier = 'Bronze';
//             if (customer.ltv > 50000) tier = 'Platinum';
//             else if (customer.ltv > 20000) tier = 'Gold';
//             else if (customer.ltv > 5000) tier = 'Silver';

//             return {
//                 ...customer,
//                 tier,
//                 valueScore: customer.ltv > 0 ? Math.min(100, (customer.ltv / 100000) * 100) : 0
//             };
//         });

//         return {
//             customers: tieredCustomers,
//             summary: {
//                 totalLTV: tieredCustomers.reduce((sum, c) => sum + c.ltv, 0),
//                 avgLTV: tieredCustomers.length > 0 ? tieredCustomers.reduce((sum, c) => sum + c.ltv, 0) / tieredCustomers.length : 0,
//                 topCustomer: tieredCustomers[0] || null
//             }
//         };
//     } catch (error) {
//         console.error('Error in calculateLTV:', error);
//         throw new Error(`Failed to calculate LTV: ${error.message}`);
//     }
// };


// const analyzePaymentHabits = async (orgId, branchId) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = {
//             organizationId: toObjectId(orgId),
//             referenceType: 'payment',
//             paymentId: { $ne: null }
//         };
//         if (branchId) match.branchId = toObjectId(branchId);

//         return await AccountEntry.aggregate([
//             { $match: match },
//             {
//                 $lookup: {
//                     from: 'invoices',
//                     localField: 'invoiceId',
//                     foreignField: '_id',
//                     as: 'invoice'
//                 }
//             },
//             { $unwind: "$invoice" },
//             {
//                 $project: {
//                     customerId: 1,
//                     paymentDate: "$date",
//                     invoiceDate: "$invoice.invoiceDate",
//                     amount: "$credit",
//                     daysToPay: {
//                         $divide: [{ $subtract: ["$date", "$invoice.invoiceDate"] }, 1000 * 60 * 60 * 24]
//                     }
//                 }
//             },
//             {
//                 $group: {
//                     _id: "$customerId",
//                     avgDaysToPay: { $avg: "$daysToPay" },
//                     totalPaid: { $sum: "$amount" },
//                     paymentsCount: { $sum: 1 }
//                 }
//             },
//             { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
//             { $unwind: "$customer" },
//             {
//                 $project: {
//                     customer: "$customer.name",
//                     avgDaysToPay: { $round: ["$avgDaysToPay", 1] },
//                     rating: {
//                         $switch: {
//                             branches: [
//                                 { case: { $lte: ["$avgDaysToPay", 7] }, then: "Excellent" },
//                                 { case: { $lte: ["$avgDaysToPay", 30] }, then: "Good" },
//                                 { case: { $lte: ["$avgDaysToPay", 60] }, then: "Fair" }
//                             ],
//                             default: "Poor"
//                         }
//                     }
//                 }
//             },
//             { $sort: { avgDaysToPay: 1 } }
//         ]);
//     } catch (error) {
//         console.error('Error in analyzePaymentHabits:', error);
//         throw new Error(`Failed to analyze payment habits: ${error.message}`);
//     }
// };

// const generateForecast = async (orgId, branchId) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };
//         if (branchId) match.branchId = toObjectId(branchId);

//         const sixMonthsAgo = new Date();
//         sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

//         const monthlySales = await Invoice.aggregate([
//             { $match: { ...match, invoiceDate: { $gte: sixMonthsAgo } } },
//             {
//                 $group: {
//                     _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
//                     total: { $sum: "$grandTotal" }
//                 }
//             },
//             { $sort: { _id: 1 } }
//         ]);

//         if (monthlySales.length < 2) return { revenue: monthlySales[0]?.total || 0, trend: 'stable' };

//         let xSum = 0, ySum = 0, xySum = 0, x2Sum = 0;
//         const n = monthlySales.length;

//         monthlySales.forEach((month, index) => {
//             const x = index + 1;
//             const y = month.total;
//             xSum += x;
//             ySum += y;
//             xySum += x * y;
//             x2Sum += x * x;
//         });

//         const denominator = n * x2Sum - xSum * xSum;
//         if (denominator === 0) return { revenue: monthlySales[n-1].total, trend: 'stable' };

//         const slope = (n * xySum - xSum * ySum) / denominator;
//         const intercept = (ySum - slope * xSum) / n;

//         const nextMonthRevenue = Math.round(slope * (n + 1) + intercept);
//         const trend = slope > 0 ? 'up' : (slope < 0 ? 'down' : 'stable');

//         return { revenue: Math.max(0, nextMonthRevenue), trend, historical: monthlySales };
//     } catch (error) {
//         console.error('Error in generateForecast:', error);
//         throw new Error(`Failed to generate forecast: ${error.message}`);
//     }
// };

// const generateAdvancedForecast = async (orgId, branchId, periods = 3, confidence = 0.95) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const forecast = await this.generateForecast(orgId, branchId);

//         return {
//             forecast: [{
//                 period: 'Next Month',
//                 predictedRevenue: forecast.revenue,
//                 lowerBound: Math.max(0, Math.round(forecast.revenue * 0.8)),
//                 upperBound: Math.round(forecast.revenue * 1.2),
//                 confidence: Math.round(confidence * 100),
//                 growth: forecast.trend === 'up' ? 10 : forecast.trend === 'down' ? -10 : 0
//             }],
//             accuracy: 'medium',
//             historicalDataPoints: forecast.historical?.length || 0,
//             model: 'linear_regression'
//         };
//     } catch (error) {
//         console.error('Error in generateAdvancedForecast:', error);
//         return {
//             forecast: [],
//             accuracy: 'unknown',
//             historicalDataPoints: 0,
//             model: 'error'
//         };
//     }
// };


// // Stub functions that can be implemented later
// const generateCashFlowProjection = async (orgId, branchId, days) => {
//     try {
//         // Stub - implement cash flow projection logic
//         return {
//             projectedCash: 100000,
//             dailyProjections: Array.from({ length: days }, (_, i) => ({
//                 date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
//                 projectedInflow: 5000,
//                 projectedOutflow: 3000,
//                 netCash: 2000
//             }))
//         };
//     } catch (error) {
//         console.error('Error in generateCashFlowProjection:', error);
//         throw new Error(`Failed to generate cash flow projection: ${error.message}`);
//     }
// };


// const assessCashHealth = (currentFlow, projections) => {
//     try {
//         // Stub - implement cash health assessment
//         return {
//             score: 75,
//             status: 'Healthy',
//             risk: 'Low'
//         };
//     } catch (error) {
//         console.error('Error in assessCashHealth:', error);
//         return { score: 0, status: 'Unknown', risk: 'High' };
//     }
// };

// /**
//  * 5. EMI/CREDIT SALES ANALYSIS
//  * Based on EMI model
//  */
// const getEMIAnalytics = async (orgId, branchId) => {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const match = { organizationId: toObjectId(orgId) };
//         if (branchId) match.branchId = toObjectId(branchId);

//         return await EMI.aggregate([
//             { $match: match },
//             {
//                 $unwind: '$installments'
//             },
//             {
//                 $group: {
//                     _id: '$status',
//                     totalAmount: { $sum: '$totalAmount' },
//                     activeEMIs: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
//                     completedEMIs: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
//                     defaultedEMIs: { $sum: { $cond: [{ $eq: ['$status', 'defaulted'] }, 1, 0] } },
//                     totalInstallments: { $sum: 1 },
//                     paidInstallments: {
//                         $sum: {
//                             $cond: [
//                                 { $eq: ['$installments.paymentStatus', 'paid'] },
//                                 1,
//                                 0
//                             ]
//                         }
//                     },
//                     overdueInstallments: {
//                         $sum: {
//                             $cond: [
//                                 {
//                                     $and: [
//                                         { $eq: ['$installments.paymentStatus', 'pending'] },
//                                         { $lt: ['$installments.dueDate', new Date()] }
//                                     ]
//                                 },
//                                 1,
//                                 0
//                             ]
//                         }
//                     },
//                     totalInterestEarned: { $sum: '$installments.interestAmount' }
//                 }
//             },
//             {
//                 $project: {
//                     status: '$_id',
//                     totalAmount: 1,
//                     activeEMIs: 1,
//                     completedEMIs: 1,
//                     defaultedEMIs: 1,
//                     totalInstallments: 1,
//                     paidInstallments: 1,
//                     overdueInstallments: 1,
//                     completionRate: {
//                         $cond: [
//                             { $eq: ['$totalInstallments', 0] },
//                             0,
//                             { $multiply: [{ $divide: ['$paidInstallments', '$totalInstallments'] }, 100] }
//                         ]
//                     },
//                     defaultRate: {
//                         $cond: [
//                             { $eq: ['$totalInstallments', 0] },
//                             0,
//                             { $multiply: [{ $divide: ['$overdueInstallments', '$totalInstallments'] }, 100] }
//                         ]
//                     },
//                     totalInterestEarned: 1
//                 }
//             }
//         ]);
//     } catch (error) {
//         console.error('Error in getEMIAnalytics:', error);
//         throw new Error(`Failed to fetch EMI analytics: ${error.message}`);
//     }
// };

// const calculateForecastAccuracy = async (orgId, branchId) => {
//     try {
//         // Stub - implement forecast accuracy calculation
//         return {
//             mape: 12.5, // Mean Absolute Percentage Error
//             accuracy: 'Good'
//         };
//     } catch (error) {
//         console.error('Error in calculateForecastAccuracy:', error);
//         return {
//             mape: 0,
//             accuracy: 'Unknown'
//         };
//     }
// };

// module.exports = {
//     getCashFlowStats,
//     getTaxStats,
//     getGrossProfitAnalysis,
//     getDebtorAging,
//     calculateLTV,
//     analyzePaymentHabits,
//     generateForecast,
//     generateAdvancedForecast,
//     generateCashFlowProjection,
//     assessCashHealth,
//     getEMIAnalytics,
//     calculateForecastAccuracy
// };
