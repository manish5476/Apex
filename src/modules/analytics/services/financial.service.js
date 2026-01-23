const mongoose = require('mongoose');
const Invoice = require('../../inventory/core/sales.model');
const Purchase = require('../../inventory/core/purchase.model');
const Payment = require('../../accounting/payments/payment.model');
const EMI = require('../../accounting/payments/emi.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');
const { toObjectId } = require('../utils/analytics.utils');


const getCashFlowStats = async (orgId, branchId, startDate, endDate) => {
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

const getTaxStats = async (orgId, branchId, startDate, endDate) => {
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


const getGrossProfitAnalysis = async (orgId, branchId, startDate, endDate) => {
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

const getDebtorAging = async (orgId, branchId) => {
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

const calculateLTV = async (orgId, branchId) => {
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


const analyzePaymentHabits = async (orgId, branchId) => {
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

const generateForecast = async (orgId, branchId) => {
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

const generateAdvancedForecast = async (orgId, branchId, periods = 3, confidence = 0.95) => {
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


// Stub functions that can be implemented later
const generateCashFlowProjection = async (orgId, branchId, days) => {
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


const assessCashHealth = (currentFlow, projections) => {
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

/**
 * 5. EMI/CREDIT SALES ANALYSIS
 * Based on EMI model
 */
const getEMIAnalytics = async (orgId, branchId) => {
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

const calculateForecastAccuracy = async (orgId, branchId) => {
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

module.exports = {
    getCashFlowStats,
    getTaxStats,
    getGrossProfitAnalysis,
    getDebtorAging,
    calculateLTV,
    analyzePaymentHabits,
    generateForecast,
    generateAdvancedForecast,
    generateCashFlowProjection,
    assessCashHealth,
    getEMIAnalytics,
    calculateForecastAccuracy
};
