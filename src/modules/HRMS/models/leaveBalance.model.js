const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  
  financialYear: { type: String, required: true }, // e.g., "2024-2025"

  casualLeave: { total: { type: Number, default: 12 }, used: { type: Number, default: 0 } },
  sickLeave: { total: { type: Number, default: 10 }, used: { type: Number, default: 0 } },
  earnedLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
  unpaidLeave: { used: { type: Number, default: 0 } },
}, { timestamps: true });

leaveBalanceSchema.index({ user: 1, financialYear: 1 }, { unique: true });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);