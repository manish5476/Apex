const mongoose = require('mongoose');

const reviewCycleSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

  name:        { type: String, required: true, trim: true },
  code:        { type: String, trim: true, uppercase: true },
  description: { type: String, trim: true },
  type:        { type: String, enum: ['probation', 'quarterly', 'half_yearly', 'annual', 'project'], default: 'annual' },

  periodStart: { type: Date, required: true },
  periodEnd:   { type: Date, required: true },
  goalSubmissionDeadline: Date,
  selfReviewDeadline:    Date,
  managerReviewDeadline: Date,
  calibrationDeadline:   Date,

  eligibleDepartments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  eligibleDesignations:[{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],

  status: { type: String, enum: ['draft', 'active', 'calibration', 'closed', 'archived'], default: 'draft', index: true },

  ratingScale: {
    min: { type: Number, default: 1 },
    max: { type: Number, default: 5 },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

reviewCycleSchema.index({ organizationId: 1, code: 1 }, { unique: true, sparse: true });
reviewCycleSchema.index({ organizationId: 1, status: 1, periodStart: -1 });

reviewCycleSchema.pre('validate', function (next) {
  if (this.periodEnd && this.periodStart && this.periodEnd < this.periodStart) {
    return next(new Error('periodEnd cannot be before periodStart'));
  }
  if (this.ratingScale && this.ratingScale.min > this.ratingScale.max) {
    return next(new Error('ratingScale.min cannot exceed ratingScale.max'));
  }
  next();
});

module.exports = mongoose.model('ReviewCycle', reviewCycleSchema);
