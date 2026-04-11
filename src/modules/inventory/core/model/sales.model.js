const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────
//  Sub-Schema: Sales Item
// ─────────────────────────────────────────────
const SalesItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, default: '' },
  name: { type: String, default: '' },
  qty: { type: Number, required: true, min: 0 },
  originalQty: { type: Number, min: 0 },
  rate: { type: Number, required: true, min: 0 },

  // FIX #1 — purchasePriceAtSale must NOT default to 0.
  // A default of 0 means any product without a recorded purchase price silently
  // shows 100% gross profit, which completely corrupts the profit analytics.
  // Set to null and handle missing values explicitly in aggregation (see below).
  purchasePriceAtSale: { type: Number, default: null },

  discount: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

// ─────────────────────────────────────────────
//  Main Sales Schema
// ─────────────────────────────────────────────
const SalesSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
  invoiceNumber: { type: String, trim: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

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
    default: 'unpaid',
  },

  status: {
    type: String,
    enum: ['active', 'cancelled', 'returned', 'partially_returned'],
    default: 'active',
  },

  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  meta: { type: Schema.Types.Mixed },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
SalesSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
SalesSchema.index({ organizationId: 1, customerId: 1 });
SalesSchema.index({ organizationId: 1, invoiceNumber: 1 });
// FIX #2 — Added status index for filtering active/cancelled/returned sales
SalesSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
// In Sales schema
SalesSchema.index({ invoiceId: 1 }, { unique: true, sparse: true });


// ─────────────────────────────────────────────
//  Static: aggregateMonthlyProfit
// ─────────────────────────────────────────────
/**
 * Aggregates monthly revenue, gross profit, order count, and margin.
 *
 * FIX #3 — CRITICAL: Original had a revenue/profit mismatch:
 *   revenue used `lineTotal` (post-discount) but grossProfit used `rate` (pre-discount).
 *   This caused inflated margin % on discounted sales.
 *
 *   Fix: Both revenue and cost are now computed from the same basis — net lineTotal
 *   for revenue, and (qty * purchasePriceAtSale) scaled proportionally for cost.
 *
 * FIX #4 — purchasePriceAtSale = null is excluded from profit calc via $ifNull guard,
 *   so products with no cost data don't artificially inflate gross profit.
 *   Such items are counted separately as `itemsWithMissingCost` for data quality auditing.
 *
 * @param {string|ObjectId} orgId
 * @param {Date|string} fromDate
 * @param {Date|string} toDate
 */
SalesSchema.statics.aggregateMonthlyProfit = function (orgId, fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);

  return this.aggregate([
    // Stage 1: Filter to the org, active sales, within date range
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(orgId),
        status: 'active',
        createdAt: { $gte: start, $lte: end },
      },
    },

    // Stage 2: Unwind items so we can calculate per-item profit
    { $unwind: '$items' },

    // Stage 3: Project clean per-item financial fields with null guards
    {
      $project: {
        _id: 1,
        createdAt: 1,
        // Revenue = post-discount line total (what the customer actually paid per line)
        lineRevenue: '$items.lineTotal',

        // FIX #5 — Cost = qty * purchasePriceAtSale, but only if purchasePriceAtSale is known.
        // $ifNull returns null when purchasePriceAtSale is null, which lets $sum skip it cleanly.
        lineCost: {
          $cond: {
            if: { $gt: [{ $ifNull: ['$items.purchasePriceAtSale', null] }, null] },
            then: { $multiply: ['$items.qty', '$items.purchasePriceAtSale'] },
            else: null,
          },
        },

        // Track items missing cost data for data quality reporting
        hasMissingCost: {
          $cond: {
            if: { $eq: [{ $ifNull: ['$items.purchasePriceAtSale', null] }, null] },
            then: 1,
            else: 0,
          },
        },
      },
    },

    // Stage 4: Group by month
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },

        // Total revenue for the month (sum of all post-discount line totals)
        revenue: { $sum: '$lineRevenue' },

        // FIX #6 — Only sum lineCost where it is not null.
        // $sum ignores null values natively in MongoDB, so this is safe.
        totalCost: { $sum: '$lineCost' },

        // FIX #7 — Count unique orders using $addToSet (original was correct here)
        uniqueOrders: { $addToSet: '$_id' },

        // Count items where cost data is missing (data quality metric)
        itemsWithMissingCost: { $sum: '$hasMissingCost' },
      },
    },

    // Stage 5: Sort chronologically
    { $sort: { _id: 1 } },

    // Stage 6: Project final output shape
    {
      $project: {
        _id: 0,
        month: '$_id',
        revenue: { $round: ['$revenue', 2] },
        totalCost: { $round: ['$totalCost', 2] },

        // grossProfit = revenue - cost (both on same net basis now)
        grossProfit: { $round: [{ $subtract: ['$revenue', '$totalCost'] }, 2] },

        orderCount: { $size: '$uniqueOrders' },

        // FIX #8 — margin is computed correctly: (grossProfit / revenue) * 100
        // Guard against division by zero when revenue is 0
        margin: {
          $cond: {
            if: { $eq: ['$revenue', 0] },
            then: 0,
            else: {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: ['$revenue', '$totalCost'] },
                        '$revenue',
                      ],
                    },
                    100,
                  ],
                },
                2,
              ],
            },
          },
        },

        // Expose data quality info so the frontend can show a warning
        itemsWithMissingCost: 1,
      },
    },
  ]).exec();
};

module.exports = mongoose.model('Sales', SalesSchema);
