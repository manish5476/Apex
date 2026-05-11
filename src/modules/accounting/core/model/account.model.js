const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },

  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },

  type: {
    type: String,
    required: true,
    enum: ['asset', 'liability', 'equity', 'income', 'expense', 'other'],
    index: true, // FIX #1 — Added index: common query is "all expense accounts for P&L"
  },

  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    default: null,
    index: true, // FIX #2 — Added index for chart-of-accounts tree traversal queries
  },

  // Safety Flags
  isGroup: { type: Boolean, default: false }, // Group accounts cannot receive direct entries

  // FIX #3 — cachedBalance is a denormalized performance field.
  // It must NEVER be the source of truth for reporting — always recompute from AccountEntry.
  // It exists only as a read-cache for UI display. Document this explicitly to prevent misuse.
  // Responsibility: Update this field in the AccountEntry post-save hook or a sync job.
  cachedBalance: { type: Number, default: 0 },

  // FIX #4 — Added isActive flag so accounts can be deactivated without deletion.
  // Deleting accounts that have history is dangerous; deactivation is safer.
  isActive: { type: Boolean, default: true },

  metadata: { type: mongoose.Schema.Types.Mixed },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// Compound unique: account code must be unique per organization
accountSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// FIX #5 — Added name index for chart-of-accounts search
accountSchema.index({ organizationId: 1, name: 1 });

// FIX #6 — Added compound type + isGroup index for P&L / Balance Sheet report queries
// e.g., "give me all non-group income accounts for this org"
accountSchema.index({ organizationId: 1, type: 1, isGroup: 1 });

// ─────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────

// FIX #7 — Guard: an account cannot be its own parent (circular reference prevention)
accountSchema.pre('validate', function (next) {
  if (this.parent && this.parent.toString() === this._id.toString()) {
    return next(new Error('An account cannot reference itself as its parent'));
  }
  next();
});

module.exports = mongoose.model('Account', accountSchema);

