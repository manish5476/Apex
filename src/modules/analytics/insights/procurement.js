// services/analytics/procurement.js
const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

/**
 * Procurement analytics:
 * - Top suppliers by spend
 * - Basic purchase KPIs for the period
 */
exports.getProcurementStats = async ({ orgId, branchId, startDate, endDate }) => {
    const match = {
        organizationId: toObjectId(orgId),
        purchaseDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' },
        isDeleted: { $ne: true }
    };

    if (branchId) {
        match.branchId = toObjectId(branchId);
    }

    // 1) Top suppliers by spend
    const topSuppliers = await Purchase.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$supplierId',
                totalSpend: { $sum: '$grandTotal' },
                bills: { $sum: 1 }
            }
        },
        { $sort: { totalSpend: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: 'suppliers',
                localField: '_id',
                foreignField: '_id',
                as: 'supplier'
            }
        },
        { $unwind: '$supplier' },
        {
            $project: {
                _id: 0,
                supplierId: '$_id',
                name: '$supplier.companyName',
                phone: '$supplier.phone',
                totalSpend: 1,
                bills: 1
            }
        }
    ]);

    // 2) High-level procurement KPIs
    const kpiAgg = await Purchase.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalSpend: { $sum: '$grandTotal' },
                billCount: { $sum: 1 },
                avgBillValue: { $avg: '$grandTotal' }
            }
        }
    ]);

    const kpi = kpiAgg[0] || {
        totalSpend: 0,
        billCount: 0,
        avgBillValue: 0
    };

    // 3) Spend over time (for charts)
    const dailySpend = await Purchase.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$purchaseDate' } },
                totalSpend: { $sum: '$grandTotal' },
                bills: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                date: '$_id',
                totalSpend: 1,
                bills: 1
            }
        }
    ]);

    return {
        period: { startDate, endDate, branchId: branchId || null },

        summary: {
            totalSpend: kpi.totalSpend,
            billCount: kpi.billCount,
            avgBillValue: Math.round(kpi.avgBillValue || 0)
        },

        charts: [
            {
                label: 'Daily Purchase Spend',
                dataset: dailySpend
            }
        ],

        reportTables: {
            topSuppliers,
            dailySpend
        },

        advisory: [
            topSuppliers.length === 0
                ? 'No purchase activity in this period.'
                : null,
            topSuppliers.length > 0 && topSuppliers[0].totalSpend > (kpi.totalSpend || 1) * 0.6
                ? 'A single supplier accounts for the majority of spend — check dependency risk and negotiate terms.'
                : 'Supplier spend looks reasonably diversified.'
        ].filter(Boolean)
    };
};
