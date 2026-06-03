const mongoose = require('mongoose');

const expenseItemSchema = new mongoose.Schema({
  category:    { type: String, enum: ['travel', 'food', 'lodging', 'fuel', 'phone', 'office', 'client', 'other'], required: true },
  description: { type: String, trim: true },
  expenseDate: { type: Date, required: true },
  amount:      { type: Number, required: true, min: 0 },
  taxAmount:   { type: Number, default: 0, min: 0 },
  receiptAsset:{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
}, { _id: true });

const expenseClaimSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employeeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },

  claimNumber: { type: String, trim: true, uppercase: true },
  title:       { type: String, required: true, trim: true },
  items:       [expenseItemSchema],
  totalAmount: { type: Number, default: 0, min: 0 },
  approvedAmount: { type: Number, default: 0, min: 0 },
  currency:    { type: String, default: 'INR' },

  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'partially_approved', 'rejected', 'reimbursed', 'cancelled'],
    default: 'draft',
    index: true,
  },

  approvalFlow: [{
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    level:    Number,
    status:   { type: String, enum: ['pending', 'approved', 'rejected'] },
    comments: String,
    actionAt: Date,
  }],

  submittedAt: Date,
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:  Date,
  reimbursedAt: Date,
  payslipId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Payslip' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

expenseClaimSchema.index({ organizationId: 1, user: 1, status: 1, createdAt: -1 });
expenseClaimSchema.index({ organizationId: 1, branchId: 1, status: 1, createdAt: -1 });
expenseClaimSchema.index({ organizationId: 1, claimNumber: 1 }, { unique: true, sparse: true });

expenseClaimSchema.pre('validate', function (next) {
  this.totalAmount = (this.items || []).reduce((sum, item) => sum + (item.amount || 0) + (item.taxAmount || 0), 0);
  if (this.approvedAmount > this.totalAmount) {
    return next(new Error('approvedAmount cannot exceed totalAmount'));
  }
  next();
});

module.exports = mongoose.model('ExpenseClaim', expenseClaimSchema);
