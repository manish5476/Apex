'use strict';

const mongoose = require('mongoose');

/**
 * Counter Model
 * ─────────────────────────────────────────────
 * Atomic sequential number generator.
 * Used for invoice numbers, purchase order numbers, return numbers, etc.
 *
 * Usage:
 *   const counter = await Counter.findOneAndUpdate(
 *     { organizationId, type: 'invoice' },
 *     { $inc: { seq: 1 } },
 *     { new: true, upsert: true, session }
 *   );
 *   const number = `INV-${String(counter.seq).padStart(6, '0')}`;
 */
const counterSchema = new mongoose.Schema(
  {
    organizationId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Organization',
      required: true,
    },
    type: {
      type:     String,
      required: true,
      // e.g. 'invoice', 'purchase', 'purchase_return', 'sales_return'
    },
    seq: {
      type:    Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Unique per org + type
counterSchema.index({ organizationId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);