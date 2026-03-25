const mongoose = require('mongoose');
const Product = require('../../inventory/core/product.model');
const Sales = require('../../inventory/core/sales.model');
const { toObjectId } = require('../utils/analytics.utils');

/* ==========================================================================
   📦 INVENTORY ANALYTICS SERVICE
   ========================================================================== */

const getInventoryAnalytics = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { organizationId: toObjectId(orgId), isActive: true };

        const [lowStock, valuation] = await Promise.all([
            Product.aggregate([
                { $match: match },
                { $unwind: '$inventory' },
                ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
                {
                    $project: {
                        name: 1, sku: 1,
                        currentStock: '$inventory.quantity',
                        reorderLevel: '$inventory.reorderLevel',
                        branchId: '$inventory.branchId',
                        urgency: {
                            $cond: [
                                { $lte: ['$inventory.quantity', { $multiply: ['$inventory.reorderLevel', 0.5] }] },
                                'critical',
                                { $cond: [{ $lte: ['$inventory.quantity', '$inventory.reorderLevel'] }, 'warning', 'normal'] }
                            ]
                        }
                    }
                },
                { $match: { urgency: { $in: ['critical', 'warning'] } } },
                { $sort: { urgency: 1, currentStock: 1 } },
                { $limit: 20 },
                { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
                { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
                { $project: { name: 1, sku: 1, currentStock: 1, reorderLevel: 1, branchName: '$branch.name', urgency: 1 } }
            ]),
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

        const orgObjectId = toObjectId(orgId);
        const branchObjectId = branchId ? toObjectId(branchId) : null;

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // FIX: Use `createdAt` instead of `invoiceDate` (Sales model uses createdAt)
        const soldMatch = {
            organizationId: orgObjectId,
            createdAt: { $gte: ninetyDaysAgo },
            status: { $ne: 'cancelled' }
        };
        if (branchObjectId) soldMatch.branchId = branchObjectId;

        const soldProductsData = await Sales.aggregate([
            { $match: soldMatch },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId' } }
        ]);
        const soldProductIds = soldProductsData.map(p => p._id);

        const [highMargin, deadStock] = await Promise.all([
            Product.aggregate([
                { $match: { organizationId: orgObjectId, isActive: true } },
                {
                    $project: {
                        name: 1, sku: 1,
                        margin: { $subtract: ['$sellingPrice', '$purchasePrice'] },
                        marginPercent: {
                            $cond: [
                                { $lte: ['$purchasePrice', 0] }, 100,
                                { $multiply: [{ $divide: [{ $subtract: ['$sellingPrice', '$purchasePrice'] }, '$purchasePrice'] }, 100] }
                            ]
                        }
                    }
                },
                { $sort: { margin: -1 } },
                { $limit: 10 }
            ]),
            Product.aggregate([
                { $match: { organizationId: orgObjectId, _id: { $nin: soldProductIds }, isActive: true } },
                { $unwind: "$inventory" },
                ...(branchObjectId ? [{ $match: { "inventory.branchId": branchObjectId } }] : []),
                { $match: { "inventory.quantity": { $gt: 0 } } },
                {
                    $project: {
                        name: 1, sku: 1,
                        stockQuantity: "$inventory.quantity",
                        value: { $multiply: ["$inventory.quantity", { $ifNull: ["$purchasePrice", 0] }] }
                    }
                },
                { $sort: { value: -1 } },
                { $limit: 20 }
            ])
        ]);

        return { highMargin, deadStock };
    } catch (error) {
        console.error('Error in getProductPerformanceStats:', error);
        throw new Error(`Analytics Engine Error: ${error.message}`);
    }
};

const getDeadStockAnalysis = async (orgId, branchId, daysThreshold = 90) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = { organizationId: toObjectId(orgId) };
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysThreshold));

        // FIX: Use `createdAt` instead of `invoiceDate`
        const soldProductIds = await Sales.distinct('items.productId', {
            ...match,
            createdAt: { $gte: cutoffDate }
        });

        return await Product.aggregate([
            { $match: { ...match, _id: { $nin: soldProductIds }, isActive: true } },
            { $unwind: '$inventory' },
            ...(branchId ? [{ $match: { 'inventory.branchId': toObjectId(branchId) } }] : []),
            { $match: { 'inventory.quantity': { $gt: 0 } } },
            {
                $project: {
                    name: 1, sku: 1, category: 1,
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

        // FIX: Use `createdAt` instead of `invoiceDate`
        const salesVelocity = await Sales.aggregate([
            { $match: { ...match, createdAt: { $gte: thirtyDaysAgo } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', totalSold: { $sum: '$items.qty' } } }
        ]);

        const velocityMap = new Map();
        salesVelocity.forEach(item => {
            velocityMap.set(String(item._id), item.totalSold / 30);
        });

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

        // FIX: Use `createdAt` instead of `invoiceDate`
        const match = {
            organizationId: toObjectId(orgId),
            createdAt: { $gte: ninetyDaysAgo },
            status: { $ne: 'cancelled' }
        };
        if (branchId) match.branchId = toObjectId(branchId);

        const salesData = await Sales.aggregate([
            { $match: match },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', totalSold: { $sum: '$items.qty' } } }
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
                let productStock = 0;
                if (product.inventory) {
                    if (branchId) {
                        const branchInv = product.inventory.find(inv => inv.branchId && inv.branchId.toString() === branchId);
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
        const lowStockCount = analytics?.lowStockAlerts?.length || 0;
        const deadStockCount = deadStock?.length || 0;
        const highMargins = performance?.highMargin || [];

        let score = 100;
        score -= Math.min(lowStockCount * 2, 30);
        score -= Math.min(deadStockCount, 20);
        if (analytics?.turnover?.turnover > 4) score += 10;
        const highMarginCount = highMargins.filter(p => p.marginPercent > 40).length;
        if (highMarginCount > 5) score += 10;

        return Math.max(0, Math.min(100, score));
    } catch (error) {
        console.error('Health Score Error:', error);
        return 0;
    }
};

const generateInventoryRecommendations = (lowStock, deadStock, predictions) => {
    try {
        const recommendations = [];
        if (lowStock && lowStock.length > 0) {
            recommendations.push(`Reorder ${lowStock.length} low-stock items immediately`);
        }
        if (deadStock && deadStock.length > 0) {
            recommendations.push(`Create promotions for ${deadStock.length} slow-moving items`);
        }
        if (predictions && predictions.length > 0) {
            const urgent = predictions.filter(p => p.daysUntilStockout <= 7);
            if (urgent.length > 0) {
                recommendations.push(`${urgent.length} items will stock out within 7 days`);
            }
        }
        return recommendations.length > 0 ? recommendations : ['Inventory health is good — no urgent actions needed'];
    } catch (error) {
        console.error('Error in generateInventoryRecommendations:', error);
        return [];
    }
};

// FIX: Use direct function call instead of `this.getProductPerformanceStats`
const getBestPerformingProducts = async (orgId, branchId, limit = 10) => {
    try {
        const data = await getProductPerformanceStats(orgId, branchId);
        return data.highMargin.slice(0, limit);
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
