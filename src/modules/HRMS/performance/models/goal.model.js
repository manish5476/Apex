const mongoose = require('mongoose');

const keyResultSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  targetValue: { type: Number, default: 100 },
  currentValue:{ type: Number, default: 0 },
  unit:        { type: String, trim: true },
  weight:      { type: Number, default: 1, min: 0 },
}, {
  _id: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

keyResultSchema.virtual('progress').get(function () {
  if (!this.targetValue) return 0;
  return Math.min(100, Math.max(0, Math.round((this.currentValue / this.targetValue) * 100)));
});

const goalSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  employeeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
  reviewCycleId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewCycle', index: true },

  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  category:    { type: String, enum: ['business', 'customer', 'process', 'learning', 'behavioral', 'project'], default: 'business' },
  visibility:  { type: String, enum: ['private', 'manager', 'department', 'organization'], default: 'manager' },

  startDate: { type: Date, required: true },
  dueDate:   { type: Date, required: true, index: true },
  weight:    { type: Number, default: 1, min: 0 },
  keyResults:[keyResultSchema],

  status: { type: String, enum: ['draft', 'active', 'at_risk', 'completed', 'cancelled'], default: 'draft', index: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

goalSchema.index({ organizationId: 1, user: 1, status: 1, dueDate: 1 });
goalSchema.index({ organizationId: 1, reviewCycleId: 1, status: 1 });

goalSchema.virtual('progress').get(function () {
  if (!this.keyResults || this.keyResults.length === 0) return 0;
  const totalWeight = this.keyResults.reduce((sum, kr) => sum + (kr.weight || 0), 0);
  if (!totalWeight) return 0;
  const weighted = this.keyResults.reduce((sum, kr) => sum + (kr.progress * (kr.weight || 0)), 0);
  return Math.round(weighted / totalWeight);
});

goalSchema.pre('validate', function (next) {
  if (this.dueDate && this.startDate && this.dueDate < this.startDate) {
    return next(new Error('dueDate cannot be before startDate'));
  }
  next();
});

module.exports = mongoose.model('Goal', goalSchema);
