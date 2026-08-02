const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
//  Designation Model
// ═══════════════════════════════════════════════════════════

const designationSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  code:        { type: String, required: false, trim: true, uppercase: true },
  description: String,

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  level: { type: Number, required: true, default: 1 },
  grade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    default: 'C',
  },

  nextDesignation:    { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
  promotionAfterYears:Number,

  jobFamily:           String,
  responsibilities:    [String],
  qualifications:      [String],
  experienceRequired:  Number,

  salaryBand: {
    min:      Number,
    max:      Number,
    currency: { type: String, default: 'INR' },
  },

  reportsTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],

  isActive: { type: Boolean, default: true, index: true },

  metadata: {
    isManager:        { type: Boolean, default: false },
    isExecutive:      { type: Boolean, default: false },
    requiresApproval: { type: Boolean, default: false },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
designationSchema.index({ organizationId: 1, code: 1 }, { unique: true, sparse: true });
designationSchema.index({ organizationId: 1, title: 1 }, { unique: true });
designationSchema.index({ level: 1, grade: 1 });

// ─────────────────────────────────────────────
//  Pre-Validate
// ─────────────────────────────────────────────

// Guard: salaryBand.min must not exceed salaryBand.max
designationSchema.pre('validate', function (next) {
  if (
    this.salaryBand &&
    this.salaryBand.min !== undefined &&
    this.salaryBand.max !== undefined &&
    this.salaryBand.min > this.salaryBand.max
  ) {
    return next(new Error('salaryBand.min cannot exceed salaryBand.max'));
  }
  next();
});

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────

designationSchema.virtual('fullTitle').get(function () {
  return this.code ? `${this.title} (${this.code})` : this.title;
});

const Designation = mongoose.model('Designation', designationSchema);


// ─────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────
module.exports = Designation;










