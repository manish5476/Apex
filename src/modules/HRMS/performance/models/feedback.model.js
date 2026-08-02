const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  reviewCycleId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewCycle', index: true },
  goalId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },

  subjectUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subjectEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
  reviewer:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  feedbackType: {
    type: String,
    enum: ['self', 'manager', 'peer', 'reportee', 'hr', 'client'],
    required: true,
    index: true,
  },
  rating: { type: Number, min: 1, max: 5 },
  strengths:   { type: String, trim: true },
  improvements:{ type: String, trim: true },
  comments:    { type: String, trim: true },

  competencies: [{
    name:     { type: String, trim: true },
    rating:   { type: Number, min: 1, max: 5 },
    comments: { type: String, trim: true },
  }],

  status: { type: String, enum: ['draft', 'submitted', 'acknowledged', 'archived'], default: 'draft', index: true },
  submittedAt: Date,
  acknowledgedAt: Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

feedbackSchema.index({ organizationId: 1, subjectUser: 1, reviewCycleId: 1, feedbackType: 1 });
feedbackSchema.index({ organizationId: 1, reviewer: 1, status: 1, createdAt: -1 });

feedbackSchema.pre('validate', function (next) {
  if (this.subjectUser && this.reviewer && this.feedbackType !== 'self' && this.subjectUser.toString() === this.reviewer.toString()) {
    return next(new Error('Non-self feedback reviewer cannot be the subject user'));
  }
  next();
});

module.exports = mongoose.model('Feedback', feedbackSchema);
