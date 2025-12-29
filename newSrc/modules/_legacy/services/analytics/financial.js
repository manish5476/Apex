const mongoose = require('mongoose');
const Invoice = require('../../models/invoiceModel');
const Payment = require('../../models/paymentModel');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

exports.getCashFlow = async ({ orgId, branchId, startDate, endDate }) => {
    
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);

    const now = new Date();

    const [modes, aging] = await Promise.all([

        Payment.aggregate([
            { $match: { ...match, paymentDate: { $gte: start, $lte: end }, type: 'inflow' } },
            { $group: { _id: '$paymentMethod', amount: { $sum: '$amount' } } },
            { $project: { method: '$_id', amount: 1, _id: 0 } }
        ]),

        Invoice.aggregate([
            { $match: { 
                ...match, 
                balanceAmount: { $gt: 0 }, 
                status: { $ne: 'cancelled' }, 
                paymentStatus: { $ne: 'paid' } 
            }},
            {
                $project: {
                    balanceAmount: 1,
                    daysOverdue: { 
                        $divide: [{ $subtract: [now, { $ifNull: ['$dueDate', '$invoiceDate'] }] }, 86400000] 
                    }
                }
            },
            {
                $bucket: {
                    groupBy: "$daysOverdue",
                    boundaries: [0, 30, 60, 90, 365],
                    default: "90+",
                    output: {
                        total: { $sum: "$balanceAmount" },
                        count: { $sum: 1 }
                    }
                }
            }
        ])
    ]);

    // Normalize buckets
    const bucketMap = {
        0: '0-30 Days',
        30: '31-60 Days',
        60: '61-90 Days',
        90: '91-365 Days',
        '90+': '365+ Days'
    };

    const formattedAging = aging.map(a => ({
        range: bucketMap[a._id] || a._id,
        invoices: a.count,
        amount: a.total
    }));

    return {
        period: { startDate, endDate },
        paymentBreakdown: modes,
        aging: formattedAging
    };
};


exports.getTaxStats = async ({ orgId, branchId, startDate, endDate }) => {
    
    const match = { organizationId: toObjectId(orgId) };
    if (branchId) match.branchId = toObjectId(branchId);

    const start = new Date(startDate);
    const end = new Date(endDate);

    const stats = await Invoice.aggregate([
        { 
            $match: { 
                ...match, 
                invoiceDate: { $gte: start, $lte: end },
                status: { $ne: 'cancelled' }
            } 
        },
        {
            $group: {
                _id: null,
                taxable: { $sum: '$subTotal' },
                outputTax: { $sum: '$totalTax' }
            }
        }
    ]);

    return {
        period: { startDate, endDate },
        taxableValue: stats[0]?.taxable || 0,
        outputTax: stats[0]?.outputTax || 0,
        netTaxPayable: stats[0]?.outputTax || 0
    };
};


exports.getDebtorAging = async ({ orgId, branchId }) => {
    
    const match = { 
        organizationId: toObjectId(orgId),
        balanceAmount: { $gt: 0 },
        status: { $ne: 'cancelled' },
        paymentStatus: { $ne: 'paid' }
    };

    if (branchId) match.branchId = toObjectId(branchId);

    const now = new Date();

    const report = await Invoice.aggregate([
        { $match: match },
        {
            $project: {
                invoiceNumber: 1,
                balanceAmount: 1,
                customerId: 1,
                overdue: { $divide: [{ $subtract: [now, '$invoiceDate'] }, 86400000] }
            }
        },
        {
            $bucket: {
                groupBy: "$overdue",
                boundaries: [0, 30, 60, 90, 365],
                default: "90+",
                output: {
                    totalAmount: { $sum: "$balanceAmount" },
                    count: { $sum: 1 }
                }
            }
        }
    ]);

    const labels = {
        0: "0-30 Days",
        30: "31-60 Days",
        60: "61-90 Days",
        90: "91-365 Days",
        "90+": "365+ Days"
    };

    return report.map(r => ({
        range: labels[r._id] || r._id,
        amount: r.totalAmount,
        count: r.count
    }));
};
