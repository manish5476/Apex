// src/models/salesModel.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/* -------------------------------------------------------------
 * Sales Item Schema — aligned with invoice items
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
 * Main Sales Schema
 ------------------------------------------------------------- */
const SalesSchema = new Schema({
  // 1. TENANCY & LOCATION (The Fix)
  organizationId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true, 
    index: true 
  },
  branchId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Branch',
    required: true, // A sale must belong to a branch
    index: true 
  },

  // 2. RELATIONS
  invoiceId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Invoice', 
    required: true, 
    unique: true // One invoice = One sales record
  },
  invoiceNumber: { type: String, trim: true },

  customerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true, 
    index: true 
  },

  // 3. ITEMS
  items: { type: [SalesItemSchema], default: [] },

  // 4. FINANCIALS
  subTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },

  totalAmount: { type: Number, required: true, min: 0 },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },

  // 5. STATUS
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

  // 6. META
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  meta: { type: Schema.Types.Mixed }
}, { timestamps: true });

/* -------------------------------------------------------------
 * Indexes for Performance
 ------------------------------------------------------------- */
// Essential for dashboard filtering (e.g., "Sales in Branch X for Org Y")
SalesSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
SalesSchema.index({ organizationId: 1, customerId: 1 });
SalesSchema.index({ organizationId: 1, invoiceNumber: 1 });

/* -------------------------------------------------------------
 * Aggregation: Monthly Totals
 ------------------------------------------------------------- */
SalesSchema.statics.aggregateMonthlyTotals = function (orgId, fromDate, toDate) {
  const match = { 
    organizationId: new mongoose.Types.ObjectId(orgId),
    createdAt: { $gte: fromDate, $lte: toDate }, 
    status: 'active' 
  };

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
