const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// 1. Financial Series (Line/Bar Chart)
exports.getFinancialSeries = async (orgId, year, interval) => {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const format = interval === 'month' ? '%Y-%m' : '%Y-%U'; // Month vs Week

  const pipeline = (model, type) => [
    {
      $match: {
        organizationId: toObjectId(orgId),
        [type === 'Income' ? 'invoiceDate' : 'purchaseDate']: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format, date: type === 'Income' ? '$invoiceDate' : '$purchaseDate' } },
        total: { $sum: '$grandTotal' }
      }
    }
  ];

  const [income, expenses] = await Promise.all([
    Invoice.aggregate(pipeline(Invoice, 'Income')),
    Purchase.aggregate(pipeline(Purchase, 'Expense'))
  ]);

  // Merge logic: Ensure all months exist even if 0 data
  const labels = []; // Generate array of months/weeks dynamically based on interval
  // (Implementation omitted for brevity: standard loop)

  // Return structured for Chart.js / Recharts
  return {
    series: [
      { name: 'Income', data: income },   // simplified mapping needed here
      { name: 'Expense', data: expenses }
    ]
  };
};

// 2. Distribution (Pie Chart)
exports.getDistributionData = async (orgId, groupBy, startDate, endDate) => {
  const match = {
    organizationId: toObjectId(orgId),
    invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
    status: { $ne: 'cancelled' }
  };

  let groupKey = '$paymentMethod'; // default
  let lookupStage = [];
  let unwindStage = [];
  let projectStage = {};

  if (groupBy === 'branch') {
    groupKey = '$branchId';
    lookupStage = [{ $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'meta' } }];
    unwindStage = [{ $unwind: '$meta' }];
    projectStage = { name: '$meta.name', value: 1 };
  } else if (groupBy === 'category') {
    // Complex: Requires unwinding items -> lookup product -> group by category
    // For simplicity in this snippet, let's assume grouping by Payment Method or Status
  }

  const data = await Invoice.aggregate([
    { $match: match },
    { $group: { _id: groupKey, value: { $sum: '$grandTotal' } } },
    ...lookupStage,
    ...(unwindStage.length ? unwindStage : []),
    { $project: projectStage.name ? projectStage : { name: '$_id', value: 1 } },
    { $sort: { value: -1 } }
  ]);

  return data; // Returns [{ name: 'Branch A', value: 50000 }, ...]
};

// 3. Radar Chart Data
exports.getBranchRadarData = async (orgId, startDate, endDate) => {
  const match = {
    organizationId: toObjectId(orgId),
    invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
  };

  return await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$branchId',
        revenue: { $sum: '$grandTotal' }, // Axis 1
        orders: { $sum: 1 },              // Axis 2
        discounts: { $sum: '$totalDiscount' }, // Axis 3
        canceled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } // Axis 4
      }
    },
    { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
    { $unwind: '$branch' },
    {
      $project: {
        subject: '$branch.name',
        A: '$revenue',
        B: '$orders',
        C: '$discounts',
        D: '$canceled',
        fullMark: { $literal: 100 } // For radar scaling
      }
    }
  ]);
};