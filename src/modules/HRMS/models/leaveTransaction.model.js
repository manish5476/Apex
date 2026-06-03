const mongoose = require('mongoose');

const VALID_LEAVE_TYPES = [
  'casualLeave',
  'sickLeave',
  'earnedLeave',
  'compensatoryOff',
  'paidLeave',
  'unpaidLeave',
  'marriageLeave',
  'paternityLeave',
  'maternityLeave',
  'bereavementLeave',
];

const leaveTransactionSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  leaveBalanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveBalance', required: true, index: true },

  financialYear: { type: String, required: true, index: true },
  leaveType:     { type: String, enum: VALID_LEAVE_TYPES, required: true, index: true },
  changeType: {
    type: String,
    enum: ['credited', 'debited', 'adjusted', 'expired', 'carry_forward', 'reversed'],
    required: true,
    index: true,
  },

  amount:         { type: Number, required: true, min: 0 },
  balanceBefore:  { type: Number, required: true, min: 0 },
  runningBalance: { type: Number, required: true, min: 0 },

  referenceType: {
    type: String,
    enum: ['LeaveRequest', 'ManualAdjustment', 'Accrual', 'CarryForward', 'Expiry', 'Correction'],
    default: 'ManualAdjustment',
  },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  description: { type: String, trim: true },

  metadata: {
    source:     { type: String, enum: ['system', 'manual', 'import', 'api'], default: 'system' },
    batchId:    String,
    payrollRun: { type: mongoose.Schema.Types.ObjectId, ref: 'Payslip' },
  },

  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

leaveTransactionSchema.index({ organizationId: 1, user: 1, financialYear: 1, createdAt: -1 });
leaveTransactionSchema.index({ organizationId: 1, leaveType: 1, changeType: 1, createdAt: -1 });
leaveTransactionSchema.index({ organizationId: 1, referenceType: 1, referenceId: 1 });

leaveTransactionSchema.virtual('signedAmount').get(function () {
  return ['debited', 'expired'].includes(this.changeType) ? -this.amount : this.amount;
});

module.exports = mongoose.model('LeaveTransaction', leaveTransactionSchema);
