const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  startTime: { type: String, required: true, default: '09:00' }, 
  endTime: { type: String, required: true, default: '18:00' },
  breakDurationMins: { type: Number, default: 60 },
  
  gracePeriodMins: { type: Number, default: 15 }, 
  lateThresholdMins: { type: Number, default: 30 },
  halfDayThresholdHrs: { type: Number, default: 4 }, 
  minFullDayHrs: { type: Number, default: 8 }, 
  
  isNightShift: { type: Boolean, default: false },
  weeklyOffs: [{ type: Number, enum: [0,1,2,3,4,5,6], default: [0] }], // 0 = Sunday
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

shiftSchema.index({ organizationId: 1, name: 1 }, { unique: true });

shiftSchema.pre('save', function(next) {
  if (this.minFullDayHrs <= this.halfDayThresholdHrs) {
    return next(new Error('Full day hours must be greater than half day threshold.'));
  }
  next();
});

module.exports = mongoose.model('Shift', shiftSchema);