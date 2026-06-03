const mongoose = require('mongoose');

const taxDeductionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employeeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
  payslipId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Payslip', index: true },

  financialYear: { type: String, required: true, index: true },
  regime:        { type: String, enum: ['old', 'new'], default: 'new' },
  taxType:       { type: String, enum: ['tds', 'professional_tax', 'pf', 'esi', 'other'], required: true, index: true },

  taxableIncome: { type: Number, default: 0, min: 0 },
  deductionAmount: { type: Number, required: true, min: 0 },
  month:         { type: Number, min: 1, max: 12 },
  year:          { type: Number, min: 2000, max: 2100 },

  status: { type: String, enum: ['estimated', 'deducted', 'deposited', 'reversed'], default: 'estimated', index: true },
  challanNumber: { type: String, trim: true },
  depositedAt: Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

taxDeductionSchema.index({ organizationId: 1, user: 1, financialYear: 1, taxType: 1 });
taxDeductionSchema.index({ organizationId: 1, year: 1, month: 1, status: 1 });

module.exports = mongoose.model('TaxDeduction', taxDeductionSchema);
