const mongoose = require('mongoose');
const Product = require('../../inventory/core/product.model');
const Invoice = require('../../inventory/core/sales.model');
const { toObjectId } = require('../utils/analytics.utils');

const getInventoryAnalytics = async (orgId, branchId) => {
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

const getProductPerformanceStats = async (orgId, branchId) => {
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

const getDeadStockAnalysis = async (orgId, branchId, daysThreshold = 90) => {
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

const getInventoryRunRate = async (orgId, branchId) => {
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

const calculateInventoryTurnover = async (orgId, branchId) => {
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

const calculateInventoryHealthScore = (analytics, performance, deadStock) => {
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

const generateInventoryRecommendations = (lowStock, deadStock, predictions) => {
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

const getBestPerformingProducts = async (orgId, branchId, limit) => {
    try {
        // Stub - implement best performing products
        return this.getProductPerformanceStats(orgId, branchId)
            .then(data => data.highMargin.slice(0, limit));
    } catch (error) {
        console.error('Error in getBestPerformingProducts:', error);
        return [];
    }
};


module.exports = {
    getInventoryAnalytics,
    getProductPerformanceStats,
    getDeadStockAnalysis,
    getInventoryRunRate,
    calculateInventoryTurnover,
    calculateInventoryHealthScore,
    generateInventoryRecommendations,
    getBestPerformingProducts
};
