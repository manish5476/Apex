const mongoose = require('mongoose');
const { toObjectId } = require('../utils/analytics.utils');

const Product = require('../../inventory/core/model/product.model');
const Customer = require('../../organization/core/customer.model');
const Sales = require('../../inventory/core/model/sales.model');

/* ==========================================================================
   💡 INSIGHTS & RECOMMENDATIONS SERVICE
   ========================================================================== */

/**
 * 1. GENERATE INSIGHTS: Revenue, inventory, customer, and profit analysis
 */
const generateInsights = (kpi, inventory, leaders) => {
    try {
        const insights = [];

        if (kpi.totalRevenue.growth > 20) {
            insights.push({ type: 'positive', category: 'revenue', title: 'Strong Revenue Growth', message: `Revenue growing at ${kpi.totalRevenue.growth}% - consider expanding successful products`, priority: 'medium' });
        } else if (kpi.totalRevenue.growth < -10) {
            insights.push({ type: 'warning', category: 'revenue', title: 'Revenue Decline Detected', message: `Revenue down by ${Math.abs(kpi.totalRevenue.growth)}% - investigate market changes`, priority: 'high' });
        }

        if (inventory.lowStockAlerts?.length > 5) {
            insights.push({ type: 'warning', category: 'inventory', title: 'Multiple Stock Shortages', message: `${inventory.lowStockAlerts.length} items need immediate restocking`, priority: 'high' });
        }

        if (leaders.topCustomers && leaders.topCustomers.length > 0) {
            const topCustomer = leaders.topCustomers[0];
            insights.push({ type: 'info', category: 'customer', title: 'Top Performing Customer', message: `${topCustomer.name} spent ${topCustomer.totalSpent} - consider loyalty program`, priority: 'low' });
        }

        if (kpi.netProfit.margin < 10) {
            insights.push({ type: 'warning', category: 'profit', title: 'Low Profit Margin', message: `Profit margin at ${kpi.netProfit.margin}% - review pricing and costs`, priority: 'high' });
        }

        return { insights, generatedAt: new Date().toISOString(), count: insights.length };
    } catch (error) {
        console.error('Error in generateInsights:', error);
        return { insights: [], generatedAt: new Date().toISOString(), count: 0 };
    }
};

/**
 * 2. FINANCIAL RECOMMENDATIONS: Cash flow and profitability advice
 */
const generateFinancialRecommendations = (kpi, profitability) => {
    try {
        const recommendations = [];
        if (kpi.outstanding.receivables > kpi.totalRevenue.value * 0.3) {
            recommendations.push({ action: 'Improve Receivables Collection', reason: 'High outstanding receivables affecting cash flow', impact: 'high', timeframe: 'short' });
        }
        if (profitability.marginPercent < 15) {
            recommendations.push({ action: 'Increase Profit Margins', reason: `Current margin of ${profitability.marginPercent}% is below target`, impact: 'high', timeframe: 'medium' });
        }
        return { recommendations, generatedAt: new Date().toISOString() };
    } catch (error) {
        console.error('Error in generateFinancialRecommendations:', error);
        return { recommendations: [], generatedAt: new Date().toISOString() };
    }
};

/**
 * 3. CUSTOMER RISK STATS: Credit risk and churn detection
 */
const getCustomerRiskStats = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');
        const match = { organizationId: toObjectId(orgId) };

        const creditRisk = await Customer.find({ ...match, outstandingBalance: { $gt: 0 } })
            .sort({ outstandingBalance: -1 }).limit(10)
            .select('name phone outstandingBalance creditLimit');

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const activeIds = await Sales.distinct('customerId', { ...match, createdAt: { $gte: sixMonthsAgo } });
        const atRiskCustomers = await Customer.countDocuments({ ...match, _id: { $nin: activeIds }, type: 'business' });

        return { creditRisk, churnCount: atRiskCustomers };
    } catch (error) {
        console.error('Error in getCustomerRiskStats:', error);
        throw new Error(`Failed to fetch customer risk stats: ${error.message}`);
    }
};

/**
 * 4. INVENTORY ANALYTICS HELPER: For insights that need inventory context
 */
const getInventoryAnalyticsHelper = async (orgId, branchId) => {
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
                        name: 1, sku: 1, currentStock: '$inventory.quantity', reorderLevel: '$inventory.reorderLevel', branchId: '$inventory.branchId',
                        urgency: {
                            $cond: [
                                { $lte: ['$inventory.quantity', { $multiply: ['$inventory.reorderLevel', 0.5] }] }, 'critical',
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
                { $group: { _id: null, totalValue: { $sum: { $multiply: ['$inventory.quantity', '$purchasePrice'] } }, totalItems: { $sum: '$inventory.quantity' }, productCount: { $sum: 1 } } }
            ])
        ]);

        const valuationResult = valuation[0] || { totalValue: 0, totalItems: 0, productCount: 0 };
        return {
            lowStockAlerts: lowStock,
            inventoryValuation: valuationResult,
            summary: { totalAlerts: lowStock.length, criticalAlerts: lowStock.filter(item => item.urgency === 'critical').length, valuation: valuationResult.totalValue }
        };
    } catch (error) {
        console.error('Error in getInventoryAnalyticsHelper:', error);
        throw new Error(`Failed to fetch inventory analytics: ${error.message}`);
    }
};

/**
 * 5. CRITICAL ALERTS: Combined inventory + customer risk alerts
 */
const getCriticalAlerts = async (orgId, branchId) => {
    try {
        if (!orgId) throw new Error('Organization ID is required');
        const [inv, risk] = await Promise.all([
            getInventoryAnalyticsHelper(orgId, branchId),
            getCustomerRiskStats(orgId, branchId)
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

/**
 * 6. REAL-TIME ALERTS: Formatted alert feed
 */
const getRealTimeAlerts = async (orgId, branchId, severity, limit) => {
    try {
        const criticalAlerts = await getCriticalAlerts(orgId, branchId);
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

/**
 * 7. PERFORMANCE RECOMMENDATIONS: System optimization tips
 */
const generatePerformanceRecommendations = (performanceStats) => {
    try {
        return [
            'Consider adding indexes to frequently queried collections',
            'Increase cache TTL for slow-changing data'
        ];
    } catch (error) {
        console.error('Error in generatePerformanceRecommendations:', error);
        return [];
    }
};

module.exports = {
    generateInsights,
    generateFinancialRecommendations,
    getCriticalAlerts,
    getRealTimeAlerts,
    generatePerformanceRecommendations,
    getCustomerRiskStats,
    getInventoryAnalyticsHelper
};
