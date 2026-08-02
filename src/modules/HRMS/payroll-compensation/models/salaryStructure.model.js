const mongoose = require('mongoose');

const salaryComponentSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  code:       { type: String, required: true, trim: true, uppercase: true },
  category:   { type: String, enum: ['earning', 'deduction', 'benefit', 'reimbursement'], required: true },
  calculationType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  amount:     { type: Number, default: 0, min: 0 },
  percentageOf: { type: String, trim: true },
  taxable:    { type: Boolean, default: true },
  affectsPF:  { type: Boolean, default: false },
  affectsESI: { type: Boolean, default: false },
  isVariable: { type: Boolean, default: false },
}, { _id: false });

const salaryStructureSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employeeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },

  structureCode: { type: String, trim: true, uppercase: true },
  title:         { type: String, required: true, trim: true },
  currency:      { type: String, default: 'INR' },
  payFrequency:  { type: String, enum: ['monthly', 'weekly', 'daily'], default: 'monthly' },

  effectiveFrom: { type: Date, required: true, index: true },
  effectiveTo:   Date,
  status:        { type: String, enum: ['draft', 'active', 'superseded', 'archived'], default: 'draft', index: true },

  components: [salaryComponentSchema],

  approvals: [{
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status:   { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    comments: String,
    actionAt: Date,
  }],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

salaryStructureSchema.index({ organizationId: 1, user: 1, status: 1, effectiveFrom: -1 });
salaryStructureSchema.index(
  { organizationId: 1, user: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
salaryStructureSchema.index({ organizationId: 1, structureCode: 1 }, { unique: true, sparse: true });

salaryStructureSchema.virtual('grossMonthly').get(function () {
  return (this.components || [])
    .filter((item) => ['earning', 'benefit'].includes(item.category))
    .reduce((sum, item) => sum + (item.calculationType === 'fixed' ? item.amount || 0 : 0), 0);
});

salaryStructureSchema.virtual('fixedDeductionsMonthly').get(function () {
  return (this.components || [])
    .filter((item) => item.category === 'deduction')
    .reduce((sum, item) => sum + (item.calculationType === 'fixed' ? item.amount || 0 : 0), 0);
});

salaryStructureSchema.virtual('netFixedMonthly').get(function () {
  return Math.max(0, this.grossMonthly - this.fixedDeductionsMonthly);
});

salaryStructureSchema.pre('validate', function (next) {
  if (this.effectiveTo && this.effectiveFrom && this.effectiveTo < this.effectiveFrom) {
    return next(new Error('effectiveTo cannot be before effectiveFrom'));
  }
  next();
});

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
