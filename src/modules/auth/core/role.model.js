const mongoose = require("mongoose");
const { VALID_TAGS } = require("../../../config/permissions");

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  permissions: [{
    type: String,
    enum: { values: VALID_TAGS, message: "Invalid permission: {VALUE}" }
  }],
  isSuperAdmin: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Role", roleSchema);
