// services/analytics/operational.js
const mongoose = require('mongoose');
const Invoice = require('../../../accounting/billing/invoice.model');
const User = require('../../../auth/core/user.model');

const toObjectId = (v) => (v ? new mongoose.Types.ObjectId(v) : null);


exports.getOperationalOverview = async ({ orgId, branchId, startDate, endDate }) => {
    const match = {
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };

    if (branchId) match.branchId = toObjectId(branchId);

    const data = await Invoice.aggregate([
        { $match: match },
        {
            $facet: {
                discountStats: [
                    { $match: { status: { $ne: 'cancelled' } } },
                    {
                        $group: {
                            _id: null,
                            totalSales: { $sum: '$subTotal' },
                            totalDiscount: { $sum: '$totalDiscount' }
                        }
                    }
                ],
                orderEfficiency: [
                    {
                        $group: {
                            _id: null,
                            totalOrders: { $sum: 1 },
                            cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                            completedRevenue: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$grandTotal', 0] } },
                            completedCount: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } }
                        }
                    }
                ],
                staffPerformance: [
                    { $match: { status: { $ne: 'cancelled' } } },
                    {
                        $group: {
                            _id: '$createdBy',
                            totalSales: { $sum: '$grandTotal' },
                            invoiceCount: { $sum: 1 },
                            totalDiscountGiven: { $sum: '$totalDiscount' }
                        }
                    },
                    { $sort: { totalSales: -1 } },
                    { $limit: 10 },
                    {
                        $lookup: {
                            from: 'users',
                            localField: '_id',
                            foreignField: '_id',
                            as: 'user'
                        }
                    },
                    { $unwind: '$user' },
                    {
                        $project: {
                            name: '$user.name',
                            email: '$user.email',
                            totalSales: 1,
                            invoiceCount: 1,
                            totalDiscountGiven: 1,
                            avgTicket: { $divide: ['$totalSales', '$invoiceCount'] }
                        }
                    }
                ]
            }
        }
    ]);

    const discount = data[0].discountStats[0] || { totalSales: 0, totalDiscount: 0 };
    const efficiency = data[0].orderEfficiency[0] || { totalOrders: 0, cancelledOrders: 0, completedCount: 0, completedRevenue: 0 };

    return {
        period: { startDate, endDate, branchId: branchId || null },

        summary: {
            discountRate: discount.totalSales > 0
                ? Math.round((discount.totalDiscount / discount.totalSales) * 100)
                : 0,
            cancellationRate: efficiency.totalOrders > 0
                ? Math.round((efficiency.cancelledOrders / efficiency.totalOrders) * 100)
                : 0,
            avgOrderValue: efficiency.completedCount > 0
                ? Math.round(efficiency.completedRevenue / efficiency.completedCount)
                : 0
        },

        charts: [
            {
                label: 'Sales Contributor Leaderboard',
                dataset: data[0].staffPerformance || []
            }
        ],

        reportTables: {
            staffPerformance: data[0].staffPerformance || []
        },

        advisory: [
            efficiency.cancelledOrders > efficiency.totalOrders * 0.2
                ? 'High cancellation rate detected — operational friction likely present.'
                : null,
            discount.totalDiscount > discount.totalSales * 0.15
                ? 'Discount leak detected — enforce approval routing.'
                : null,
            data[0].staffPerformance?.length
                ? 'Top performers identified — consider incentive alignment.'
                : 'No operational activity found during this period.'
        ].filter(Boolean)
    };
};



// -------------------------------
// PEAK HOURS HEATMAP
// -------------------------------

exports.getPeakHours = async ({ orgId, branchId }) => {
    const match = { organizationId: toObjectId(orgId) };

    if (branchId) match.branchId = toObjectId(branchId);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const heatmap = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: cutoff } } },
        {
            $project: {
                day: { $dayOfWeek: '$invoiceDate' },
                hour: { $hour: '$invoiceDate' }
            }
        },
        {
            $group: {
                _id: { day: '$day', hour: '$hour' },
                count: { $sum: 1 }
            }
        }
    ]);

    return {
        period: { lastDays: 30 },
        heatmap
    };
};
