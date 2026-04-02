const mongoose = require('mongoose');
const { VALID_TAGS } = require('../../../config/permissions');

const roleSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    permissions: [{
      type: String,
      enum: { values: VALID_TAGS, message: 'Invalid permission: {VALUE}' },
    }],

    isSuperAdmin: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false }, // org's fallback role for new users
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Unique role name per org (case-sensitive at DB level — controller handles case-insensitive check)
roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Fast lookups for common query patterns
roleSchema.index({ organizationId: 1, isActive: 1, isDeleted: 1 });
roleSchema.index({ organizationId: 1, isSuperAdmin: 1 });
roleSchema.index({ organizationId: 1, isDefault: 1 });

module.exports = mongoose.model('Role', roleSchema);

// const mongoose = require("mongoose");
// const { VALID_TAGS } = require("../../../config/permissions");

// const roleSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
//   permissions: [{
//     type: String,
//     enum: { values: VALID_TAGS, message: "Invalid permission: {VALUE}" }
//   }],
//   isSuperAdmin: { type: Boolean, default: false },
//   isDefault: { type: Boolean, default: false },
//   isActive: { type: Boolean, default: true }
// }, { timestamps: true });

// roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// module.exports = mongoose.model("Role", roleSchema);
