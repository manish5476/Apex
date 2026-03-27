const mongoose = require('mongoose');
const Customer = require('../../organization/core/customer.model');
const Sales = require('../../inventory/core/model/sales.model');
const SalesReturn = require('../../inventory/core/model/salesReturn.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');
const Product = require('../../inventory/core/model/product.model');
const { toObjectId } = require('../utils/analytics.utils');

/* ==========================================================================
   👥 CUSTOMER INTELLIGENCE SERVICE — 8 Functions
   ========================================================================== */

/**
 * 1. CUSTOMER RISK STATS: High-debt monitoring + churn counting
 */
const getCustomerRiskStats = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [creditRisk, churnStats] = await Promise.all([
        Customer.find({ ...match, outstandingBalance: { $gt: 0 } })
            .sort({ outstandingBalance: -1 }).limit(10)
            .select('name phone outstandingBalance creditLimit'),

        Sales.aggregate([
            { $match: match },
            { $group: { _id: "$customerId", lastSale: { $max: "$createdAt" } } },
            { $match: { lastSale: { $lt: sixMonthsAgo } } },
            { $count: "churnedCount" }
        ])
    ]);

    return {
        creditRisk,
        churnCount: churnStats[0]?.churnedCount || 0,
        riskLevel: (churnStats[0]?.churnedCount > 50) ? 'High' : 'Stable'
    };
};

/**
 * 2. CHURN RISK DEEP-DIVE: Customers who haven't purchased within threshold
 */
const analyzeChurnRisk = async (orgId, thresholdDays = 90) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

    return await Sales.aggregate([
        { $match: { organizationId: toObjectId(orgId), status: 'active' } },
        { $group: { _id: "$customerId", lastPurchaseDate: { $max: "$createdAt" } } },
        { $match: { lastPurchaseDate: { $lt: cutoffDate } } },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'cust' } },
        { $unwind: '$cust' },
        {
            $project: {
                name: '$cust.name', phone: '$cust.phone', lastPurchaseDate: 1,
                daysInactive: { $floor: { $divide: [{ $subtract: [new Date(), "$lastPurchaseDate"] }, 86400000] } }
            }
        },
        { $sort: { daysInactive: -1 } }
    ]);
};

/**
 * 3. RFM SEGMENTATION: Recency, Frequency, Monetary
 */
const getCustomerRFMAnalysis = async (orgId) => {
    const now = new Date();
    return await Sales.aggregate([
        { $match: { organizationId: toObjectId(orgId), status: 'active' } },
        { $group: { _id: "$customerId", lastDate: { $max: "$createdAt" }, frequency: { $sum: 1 }, monetary: { $sum: "$totalAmount" } } },
        {
            $project: {
                segment: {
                    $switch: {
                        branches: [
                            { case: { $and: [{ $lte: [{ $subtract: [now, "$lastDate"] }, 2592000000] }, { $gte: ["$frequency", 5] }] }, then: "Champion" },
                            { case: { $and: [{ $lte: [{ $subtract: [now, "$lastDate"] }, 5184000000] }, { $gte: ["$frequency", 2] }] }, then: "Loyal" },
                            { case: { $gt: [{ $subtract: [now, "$lastDate"] }, 7776000000] }, then: "At Risk" }
                        ],
                        default: "Standard"
                    }
                }
            }
        },
        { $group: { _id: "$segment", count: { $sum: 1 } } }
    ]);
};

/**
 * 4. NET LTV: Revenue minus returns = TRUE customer value
 */
const getEnhancedCustomerLTV = async (orgId) => {
    return await Sales.aggregate([
        { $match: { organizationId: toObjectId(orgId), status: 'active' } },
        { $group: { _id: "$customerId", grossSpent: { $sum: "$totalAmount" }, orders: { $sum: 1 }, lastActive: { $max: "$createdAt" } } },
        { $lookup: { from: 'salesreturns', localField: '_id', foreignField: 'customerId', as: 'returns' } },
        {
            $project: {
                ltv: { $subtract: ["$grossSpent", { $sum: "$returns.totalRefundAmount" }] },
                avgOrder: { $divide: ["$grossSpent", "$orders"] },
                lastActive: 1
            }
        },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'c' } },
        { $unwind: "$c" },
        { $project: { name: "$c.name", ltv: 1, avgOrder: 1, lastActive: 1 } },
        { $sort: { ltv: -1 } },
        { $limit: 50 }
    ]);
};

/**
 * 5. PAYMENT BEHAVIOR: Customer payment speed analysis
 */
const getEnhancedPaymentBehavior = async (orgId, branchId) => {
    const match = { organizationId: toObjectId(orgId), referenceType: 'payment' };
    if (branchId) match.branchId = toObjectId(branchId);

    return await AccountEntry.aggregate([
        { $match: match },
        { $lookup: { from: 'sales', localField: 'invoiceId', foreignField: 'invoiceId', as: 'sale' } },
        { $unwind: '$sale' },
        { $project: { customerId: 1, delay: { $divide: [{ $subtract: ['$date', '$sale.createdAt'] }, 86400000] } } },
        { $group: { _id: '$customerId', avgDelay: { $avg: '$delay' }, totalPayments: { $sum: 1 } } },
        { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'c' } },
        { $unwind: '$c' },
        { $project: { name: '$c.name', avgDelay: { $round: ['$avgDelay', 1] }, reliability: { $cond: [{ $lte: ['$avgDelay', 7] }, 'Excellent', 'Needs Review'] } } }
    ]);
};

/**
 * 6. CUSTOMER INSIGHTS: Strategic metrics
 */
const generateCustomerInsights = (segments, churnRisk, ltv) => {
    const total = ltv.length || 1;
    const champions = segments.find(s => s._id === 'Champion')?.count || 0;
    return {
        healthScore: Math.round((champions / total) * 100),
        churnRate: ((churnRisk.length / total) * 100).toFixed(1),
        topTierFocus: "Focus on retaining the top 5% who generate 40% of revenue."
    };
};

/**
 * 7. MARKET BASKET ANALYSIS: Product correlation (Apriori-lite)
 */
const performBasketAnalysis = async (orgId) => {
    const sales = await Sales.find({ organizationId: toObjectId(orgId) }).select('items.productId');
    const pairs = {};

    sales.forEach(s => {
        const ids = s.items.map(i => i.productId.toString()).sort();
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const key = `${ids[i]}|${ids[j]}`;
                pairs[key] = (pairs[key] || 0) + 1;
            }
        }
    });

    const topPairs = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const productIds = [...new Set(topPairs.flatMap(([k]) => k.split('|')))];
    const products = await Product.find({ _id: { $in: productIds } }).select('name');
    const pMap = products.reduce((a, p) => ({ ...a, [p._id]: p.name }), {});

    return topPairs.map(([k, v]) => ({ combo: k.split('|').map(id => pMap[id]).join(' + '), strength: v }));
};

/**
 * 8. COHORT RETENTION: Monthly acquisition groups and return rates
 */
const getCohortAnalysis = async (orgId) => {
    return await Sales.aggregate([
        { $match: { organizationId: toObjectId(orgId), status: 'active' } },
        { $group: { _id: "$customerId", first: { $min: "$createdAt" }, all: { $push: "$createdAt" } } },
        { $unwind: "$all" },
        {
            $project: {
                cohort: { $dateToString: { format: "%Y-%m", date: "$first" } },
                month: { $dateToString: { format: "%Y-%m", date: "$all" } }
            }
        },
        { $group: { _id: { c: "$cohort", m: "$month" }, count: { $addToSet: "$_id" } } },
        { $project: { cohort: "$_id.c", month: "$_id.m", count: { $size: "$count" }, _id: 0 } },
        { $sort: { cohort: 1, month: 1 } }
    ]);
};

module.exports = {
    getCustomerRiskStats,
    analyzeChurnRisk,
    getCustomerRFMAnalysis,
    getEnhancedCustomerLTV,
    getEnhancedPaymentBehavior,
    generateCustomerInsights,
    performBasketAnalysis,
    getCohortAnalysis
};