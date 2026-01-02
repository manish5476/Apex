
const mongoose = require('mongoose');
const Product = require('../../../inventory/core/product.model');
const Invoice = require('../../../accounting/billing/invoice.model');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);


exports.getInventorySnapshot = async ({ orgId, branchId, startDate, endDate }) => {

    const match = { organizationId: toObjectId(orgId), isActive: true };
    if (branchId) match['inventory.branchId'] = toObjectId(branchId);

    const [lowStock, valuation] = await Promise.all([

        Product.aggregate([
            { $match: match },
            { $unwind: "$inventory" },
            branchId ? { $match: { "inventory.branchId": toObjectId(branchId) } } : null,
            {
                $project: {
                    name: 1,
                    sku: 1,
                    currentStock: "$inventory.quantity",
                    reorderLevel: "$inventory.reorderLevel",
                    isLow: { $lte: ["$inventory.quantity", "$inventory.reorderLevel"] }
                }
            },
            { $match: { isLow: true } },
            { $limit: 20 }
        ].filter(Boolean)),

        Product.aggregate([
            { $match: match },
            { $unwind: "$inventory" },
            branchId ? { $match: { "inventory.branchId": toObjectId(branchId) } } : null,
            {
                $group: {
                    _id: null,
                    totalStockValue: { $sum: { $multiply: ["$inventory.quantity", "$purchasePrice"] } },
                    totalUnits: { $sum: "$inventory.quantity" },
                    items: { $sum: 1 }
                }
            }
        ].filter(Boolean))
    ]);

    const summary = {
        totalStockValue: valuation[0]?.totalStockValue || 0,
        totalUnits: valuation[0]?.totalUnits || 0,
        productCount: valuation[0]?.items || 0
    };

    return {
        period: { startDate, endDate },
        summary,
        alerts: {
            lowStockCount: lowStock.length,
        },
        charts: [],
        reportTables: {
            lowStock
        }
    };
};



exports.getDeadStock = async ({ orgId, branchId, thresholdDays = 90 }) => {

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - thresholdDays);

    const soldProductIds = await Invoice.distinct("items.productId", {
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: cutoff }
    });

    const match = {
        organizationId: toObjectId(orgId),
        isActive: true,
        _id: { $nin: soldProductIds }
    };

    const deadStock = await Product.aggregate([
        { $match: match },
        { $unwind: "$inventory" },
        branchId ? { $match: { "inventory.branchId": toObjectId(branchId) } } : null,
        { $match: { "inventory.quantity": { $gt: 0 } } },
        {
            $project: {
                name: 1,
                sku: 1,
                qty: "$inventory.quantity",
                value: { $multiply: ["$inventory.quantity", "$purchasePrice"] },
                daysInactive: thresholdDays
            }
        },
        { $sort: { value: -1 } }
    ].filter(Boolean));

    return {
        period: { thresholdDays },
        summary: {
            count: deadStock.length,
            totalValue: deadStock.reduce((acc, x) => acc + x.value, 0)
        },
        alerts: {
            highLossRisk: deadStock.length > 0
        },
        charts: [],
        reportTables: { deadStock }
    };
};



exports.getStockRunRate = async ({ orgId, branchId }) => {

    const matchInvoice = { organizationId: toObjectId(orgId) };
    if (branchId) matchInvoice.branchId = toObjectId(branchId);

    const days = 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const velocity = await Invoice.aggregate([
        { $match: { ...matchInvoice, invoiceDate: { $gte: cutoff }, status: { $ne: 'cancelled' } }},
        { $unwind: "$items" },
        {
            $group: {
                _id: "$items.productId",
                totalSold: { $sum: "$items.quantity" }
            }
        },
        {
            $project: {
                avgDaily: { $divide: ["$totalSold", days] }
            }
        }
    ]);

    const velocityMap = new Map();
    velocity.forEach(v => velocityMap.set(String(v._id), v.avgDaily));

    const matchStock = { organizationId: toObjectId(orgId), isActive: true };

    const stocks = await Product.aggregate([
        { $match: matchStock },
        { $unwind: "$inventory" },
        branchId ? { $match: { "inventory.branchId": toObjectId(branchId) } } : null,
        {
            $project: {
                name: 1,
                sku: 1,
                qty: "$inventory.quantity",
                reorderLevel: "$inventory.reorderLevel",
                productId: "$_id"
            }
        }
    ].filter(Boolean));

    const forecast = stocks
        .map(s => {
            const rate = velocityMap.get(String(s.productId)) || 0;
            const daysLeft = rate > 0 ? Math.round(s.qty / rate) : null;
            return { ...s, avgDailySales: rate, daysUntilOut: daysLeft };
        })
        .filter(x => x.daysUntilOut !== null && x.daysUntilOut <= 14)
        .sort((a, b) => a.daysUntilOut - b.daysUntilOut);

    return {
        period: { windowDays: 30 },
        summary: { riskCount: forecast.length },
        alerts: {
            urgent: forecast.filter(f => f.daysUntilOut <= 5).length
        },
        charts: [],
        reportTables: {
            stockoutPredictions: forecast
        }
    };
};
