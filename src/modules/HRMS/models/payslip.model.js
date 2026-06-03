const mongoose = require('mongoose');

const payLineSchema = new mongoose.Schema({
  code:        { type: String, required: true, trim: true, uppercase: true },
  name:        { type: String, required: true, trim: true },
  amount:      { type: Number, required: true, min: 0 },
  taxable:     { type: Boolean, default: true },
  source:      { type: String, enum: ['salary_structure', 'attendance', 'leave', 'manual', 'expense', 'tax'], default: 'salary_structure' },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
}, { _id: false });

const payslipSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employeeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
  salaryStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure' },

  payslipNumber: { type: String, trim: true, uppercase: true },
  month:         { type: Number, required: true, min: 1, max: 12, index: true },
  year:          { type: Number, required: true, min: 2000, max: 2100, index: true },
  periodStart:   { type: Date, required: true },
  periodEnd:     { type: Date, required: true },

  attendanceSnapshot: {
    paidDays:       { type: Number, default: 0, min: 0 },
    presentDays:    { type: Number, default: 0, min: 0 },
    leaveDays:      { type: Number, default: 0, min: 0 },
    unpaidLeaveDays:{ type: Number, default: 0, min: 0 },
    overtimeHours:  { type: Number, default: 0, min: 0 },
    lateCount:      { type: Number, default: 0, min: 0 },
  },

  earnings:   [payLineSchema],
  deductions: [payLineSchema],
  reimbursements: [payLineSchema],

  grossPay:     { type: Number, default: 0, min: 0 },
  deductionTotal:{ type: Number, default: 0, min: 0 },
  reimbursementTotal: { type: Number, default: 0, min: 0 },
  netPay:       { type: Number, default: 0, min: 0 },
  currency:     { type: String, default: 'INR' },

  payment: {
    status:      { type: String, enum: ['pending', 'processing', 'paid', 'failed', 'on_hold'], default: 'pending', index: true },
    paidAt:      Date,
    paymentMode: { type: String, enum: ['bank_transfer', 'cash', 'cheque', 'upi'] },
    referenceNo: { type: String, trim: true },
  },

  status: {
    type: String,
    enum: ['draft', 'approved', 'locked', 'paid', 'cancelled'],
    default: 'draft',
    index: true,
  },

  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  lockedAt:   Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

payslipSchema.index({ organizationId: 1, user: 1, year: 1, month: 1 }, { unique: true });
payslipSchema.index({ organizationId: 1, branchId: 1, year: 1, month: 1, status: 1 });
payslipSchema.index({ organizationId: 1, payslipNumber: 1 }, { unique: true, sparse: true });

payslipSchema.pre('validate', function (next) {
  if (this.periodEnd && this.periodStart && this.periodEnd < this.periodStart) {
    return next(new Error('periodEnd cannot be before periodStart'));
  }

  const sum = (items) => (items || []).reduce((total, item) => total + (item.amount || 0), 0);
  this.grossPay = sum(this.earnings);
  this.deductionTotal = sum(this.deductions);
  this.reimbursementTotal = sum(this.reimbursements);
  this.netPay = Math.max(0, this.grossPay - this.deductionTotal + this.reimbursementTotal);
  next();
});

module.exports = mongoose.model('Payslip', payslipSchema);
