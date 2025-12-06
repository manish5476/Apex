const mongoose = require('mongoose');
const Invoice = require('../../models/invoiceModel');
const Purchase = require('../../models/purchaseModel');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// Growth utility
const growth = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
};


exports.getExecutiveStats = async ({ orgId, branchId, startDate, endDate }) => {
    
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);

    const range = end - start;
    const prevStart = new Date(start - range);
    const prevEnd = new Date(start);

    const [sales, purchases] = await Promise.all([
        Invoice.aggregate([
            {
                $facet: {
                    current: [
                        { $match: { ...match, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
                    ],
                    previous: [
                        { $match: { ...match, invoiceDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
                        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
                    ]
                }
            }
        ]),

        Purchase.aggregate([
            {
                $facet: {
                    current: [
                        { $match: { ...match, purchaseDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
                        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, due: { $sum: '$balanceAmount' } } }
                    ],
                    previous: [
                        { $match: { ...match, purchaseDate: { $gte: prevStart, $lte: prevEnd }, status: { $ne: 'cancelled' } } },
                        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
                    ]
                }
            }
        ])
    ]);


    const curSales = sales[0]?.current[0] || { total: 0, count: 0, due: 0 };
    const prevSales = sales[0]?.previous[0] || { total: 0 };

    const curPurchases = purchases[0]?.current[0] || { total: 0, count: 0, due: 0 };
    const prevPurchases = purchases[0]?.previous[0] || { total: 0 };


    const revenueGrowth = growth(curSales.total, prevSales.total);
    const expenseGrowth = growth(curPurchases.total, prevPurchases.total);

    const netProfitCurrent = curSales.total - curPurchases.total;
    const netProfitPrevious = prevSales.total - prevPurchases.total;

    const profitGrowth = growth(netProfitCurrent, netProfitPrevious);


    return {
        period: { startDate, endDate },
        metrics: {
            revenue: {
                value: curSales.total,
                count: curSales.count,
                growth: revenueGrowth
            },
            expense: {
                value: curPurchases.total,
                count: curPurchases.count,
                growth: expenseGrowth
            },
            netProfit: {
                value: netProfitCurrent,
                growth: profitGrowth
            },
            outstanding: {
                receivable: curSales.due,
                payable: curPurchases.due
            }
        }
    };
};
