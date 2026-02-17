const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Holiday name is required'], trim: true },
  date: { type: String, required: [true, 'Date is required (YYYY-MM-DD)'], index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // Null = All branches
  description: String,
  isOptional: { type: Boolean, default: false }, 
}, { timestamps: true });

holidaySchema.index({ organizationId: 1, branchId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);