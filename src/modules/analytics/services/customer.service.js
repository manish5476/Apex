const mongoose = require('mongoose');
const Customer = require('../../organization/core/customer.model');
const Invoice = require('../../inventory/core/sales.model');
const SalesReturn = require('../../../modules/inventory/core/salesReturn.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');
const { toObjectId } = require('../utils/analytics.utils');


const getCustomerRiskStats = async (orgId, branchId) => {
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

const analyzeChurnRisk = async (orgId, thresholdDays = 90) => {
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

const getCustomerRFMAnalysis = async (orgId) => {
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
const getEnhancedCustomerLTV = async (orgId, branchId) => {
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
const getEnhancedPaymentBehavior = async (orgId, branchId) => {
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

const generateCustomerInsights = (segments, churnRisk, ltv) => {
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

const performBasketAnalysis = async (orgId, minSupport = 2) => {
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

const getCohortAnalysis = async (orgId, monthsBack = 6) => {
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