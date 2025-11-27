// src/models/salesModel.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* -------------------------------------------------------------
 * Sales Item Schema — aligned EXACTLY with invoice items
------------------------------------------------------------- */
const SalesItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, default: "" },
  name: { type: String, default: "" },

  qty: { type: Number, required: true, min: 1 },
  rate: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },

  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

/* -------------------------------------------------------------
 * Main Sales Schema — corrected and aligned
------------------------------------------------------------- */
const SalesSchema = new Schema({
  invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, unique: true, index: true },
  invoiceNumber: { type: String, index: true },

  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },

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

/* -------------------------------------------------------------
 * Indexes
------------------------------------------------------------- */
SalesSchema.index({ createdAt: 1 });
SalesSchema.index({ customerId: 1, invoiceId: 1 });

/* -------------------------------------------------------------
 * Monthly Aggregation
------------------------------------------------------------- */
SalesSchema.statics.aggregateMonthlyTotals = function (fromDate, toDate) {
  const match = { createdAt: { $gte: fromDate, $lte: toDate }, status: 'active' };
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        total: { $sum: '$totalAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        month: '$_id',
        total: 1,
        count: 1,
        _id: 0
      }
    }
  ]).exec();
};

module.exports = mongoose.model('Sales', SalesSchema);
