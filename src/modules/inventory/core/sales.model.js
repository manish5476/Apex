
const mongoose = require('mongoose');
const { Schema } = mongoose;
// const SalesItemSchema = new Schema({
//   productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
//   sku: { type: String, default: "" },
//   name: { type: String, default: "" },
//   qty: { type: Number, required: true, min: 1 },
//   rate: { type: Number, required: true, min: 0 },
//   discount: { type: Number, default: 0 },
//   tax: { type: Number, default: 0 },
//   lineTotal: { type: Number, required: true, min: 0 }
// }, { _id: false });

const SalesItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, default: "" },
  name: { type: String, default: "" },
  qty: { type: Number, required: true, min: 1 },
  rate: { type: Number, required: true, min: 0 }, // Selling price
  
  // 🟢 ADDED: Historical cost snapshot
  purchasePriceAtSale: { type: Number, default: 0 }, 
  
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const SalesSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  branchId: {
    type: Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },


  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    unique: true
  },
  invoiceNumber: { type: String, trim: true },

  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  items: { type: [SalesItemSchema], default: [] },
  subTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid', 'refunded'],
    default: 'unpaid'
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'returned'],
    default: 'active'
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  meta: { type: Schema.Types.Mixed }
}, { timestamps: true });
SalesSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
SalesSchema.index({ organizationId: 1, customerId: 1 });
SalesSchema.index({ organizationId: 1, invoiceNumber: 1 });
// ... existing SalesSchema definition ...

SalesSchema.statics.aggregateMonthlyProfit = function (orgId, fromDate, toDate) {
  // Ensure the dates are objects and OrgId is an ObjectId
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const mongoose = require('mongoose');

  return this.aggregate([
    { 
      $match: { 
        organizationId: new mongoose.Types.ObjectId(orgId), 
        status: 'active', 
        createdAt: { $gte: start, $lte: end } 
      } 
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        // Revenue is based on line totals to be accurate with the profit calculation
        revenue: { $sum: '$items.lineTotal' }, 
        // Gross Profit Calculation
        grossProfit: { 
          $sum: { 
            $subtract: [
              { $multiply: ['$items.qty', '$items.rate'] }, 
              { $multiply: ['$items.qty', '$items.purchasePriceAtSale'] }
            ] 
          } 
        },
        count: { $addToSet: '$_id' } // Counts unique invoices
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        month: '$_id',
        revenue: 1,
        grossProfit: 1,
        orderCount: { $size: '$count' },
        margin: { 
          $cond: [
            { $eq: ['$revenue', 0] }, 
            0, 
            { $multiply: [{ $divide: ['$grossProfit', '$revenue'] }, 100] }
          ]
        },
        _id: 0
      }
    }
  ]).exec();
};


module.exports = mongoose.model('Sales', SalesSchema);

// SalesSchema.statics.aggregateMonthlyTotals = function (orgId, fromDate, toDate) {
//   const match = {
//     organizationId: new mongoose.Types.ObjectId(orgId),
//     createdAt: { $gte: fromDate, $lte: toDate },
//     status: 'active'
//   };
//   return this.aggregate([
//     { $match: match },
//     {
//       $group: {
//         _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
//         total: { $sum: '$totalAmount' },
//         count: { $sum: 1 }
//       }
//     },
//     { $sort: { _id: 1 } },
//     {
//       $project: {
//         month: '$_id',
//         total: 1,
//         count: 1,
//         _id: 0
//       }
//     }
//   ]).exec();
// };
// module.exports = mongoose.model('Sales', SalesSchema);
