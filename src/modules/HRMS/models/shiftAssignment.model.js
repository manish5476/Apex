const mongoose = require('mongoose');

const shiftAssignmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
  shiftGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftGroup' },
  // --- Assignment Period ---
  startDate: { type: Date, required: true, index: true },
  endDate: Date, // null = ongoing
  isTemporary: { type: Boolean, default: false },
  // --- Rotation Info (if from group) ---
  rotationSequence: Number,
  rotationEndDate: Date,
  // --- Override Rules ---
  overrides: { startTime: String, endTime: String, breakDuration: Number, weeklyOffs: [Number] },
  // --- Status ---
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active', index: true },
  // --- Reason for assignment ---
  reason: String,
  // --- Audit ---
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt: { type: Date, default: Date.now },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancellationReason: String

}, { timestamps: true });

// --- INDEXES ---
shiftAssignmentSchema.index({ user: 1, status: 1, startDate: -1 });
shiftAssignmentSchema.index({ organizationId: 1, shiftId: 1, status: 1 });
shiftAssignmentSchema.index({ endDate: 1 }, { sparse: true });

// --- VIRTUALS ---
shiftAssignmentSchema.virtual('isActive').get(function () {
  const now = new Date();
  return this.status === 'active' &&
    this.startDate <= now &&
    (!this.endDate || this.endDate >= now);
});

// --- METHODS ---
shiftAssignmentSchema.methods.cancel = async function (userId, reason) {
  this.status = 'cancelled';
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  await this.save();
};

module.exports = mongoose.model('ShiftAssignment', shiftAssignmentSchema);