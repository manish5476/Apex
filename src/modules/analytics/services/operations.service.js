const mongoose = require('mongoose');
const Invoice = require('../../inventory/core/sales.model');
const Purchase = require('../../inventory/core/purchase.model');
const Branch = require('../../organization/core/branch.model');
const { toObjectId } = require('../utils/analytics.utils');

const getOperationalStats = async (orgId, branchId, startDate, endDate) => {
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

const getBranchComparisonStats = async (orgId, startDate, endDate, groupBy = 'revenue', limit = 10) => {
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

const getProcurementStats = async (orgId, branchId, startDate, endDate) => {
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

const getSupplierPerformance = async (orgId, branchId, startDate, endDate) => {
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

const calculateEfficiencyMetrics = async (orgId, branchId, startDate, endDate) => {
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

const calculateOperationalKPIs = (metrics) => {
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


module.exports = {
    getOperationalStats,
    getBranchComparisonStats,
    getProcurementStats,
    getSupplierPerformance,
    calculateEfficiencyMetrics,
    calculateOperationalKPIs
};
