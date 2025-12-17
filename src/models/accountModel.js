const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['asset', 'liability', 'equity', 'income', 'expense', 'other'] },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  
  // ✅ NEW: Safety Flags
  isGroup: { type: Boolean, default: false }, // If true, cannot contain entries
  cachedBalance: { type: Number, default: 0 }, // Renamed from 'balance' to show it is calculated

  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

accountSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);