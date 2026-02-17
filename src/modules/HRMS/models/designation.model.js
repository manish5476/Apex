const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  level: { type: Number, default: 1 }, // Hierarchy level
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

designationSchema.index({ organizationId: 1, title: 1 }, { unique: true });

module.exports = mongoose.model('Designation', designationSchema);