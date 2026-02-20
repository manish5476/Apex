const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: false, trim: true, uppercase: true },
  description: String,
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  // --- Timing ---
  startTime: { type: String, required: true, default: '09:00' },
  endTime: { type: String, required: true, default: '18:00' },
  
  // --- Breaks ---
  breakDurationMins: { type: Number, default: 60, min: 0 },
  breaks: [{
    name: String,
    startTime: String,
    endTime: String,
    isPaid: { type: Boolean, default: false }
  }],

  // --- Rules ---
  gracePeriodMins: { type: Number, default: 15, min: 0 },
  lateThresholdMins: { type: Number, default: 30, min: 0 },
  earlyDepartureThresholdMins: { type: Number, default: 15, min: 0 },
  halfDayThresholdHrs: { type: Number, default: 4, min: 0 },
  minFullDayHrs: { type: Number, default: 8, min: 0 },
  maxOvertimeHrs: { type: Number, default: 4, min: 0 },

  // --- Shift Type ---
  shiftType: {
    type: String,
    enum: ['fixed', 'rotating', 'flexi', 'split', 'night'],
    default: 'fixed'
  },

  // --- Night Shift Handling ---
  isNightShift: { type: Boolean, default: false },
  crossesMidnight: { type: Boolean, default: false },

  // --- Weekly Offs ---
  weeklyOffs: [{ 
    type: Number, 
    enum: [0, 1, 2, 3, 4, 5, 6], 
    default: [0] 
  }], // 0 = Sunday

  // --- Applicability ---
  applicableDays: [{ 
    type: Number, 
    enum: [0, 1, 2, 3, 4, 5, 6] 
  }], // empty = all days

  // --- Overtime Rules ---
  overtimeRules: {
    enabled: { type: Boolean, default: false },
    multiplier: { type: Number, default: 1.5 },
    afterHours: { type: Number, default: 8 }, // OT after 8 hours
    doubleAfterHours: { type: Number, default: 12 }, // Double OT after 12 hours
    holidayMultiplier: { type: Number, default: 2.0 }
  },

  // --- Flexible Shift Config ---
  flexiConfig: {
    coreStartTime: String, // Must be present during this time
    coreEndTime: String,
    flexibleBandStart: String, // Can come anytime after this
    flexibleBandEnd: String, // Can leave anytime before this
    minHoursPerDay: { type: Number, default: 4 }
  },

  // --- Status ---
  isActive: { type: Boolean, default: true, index: true },
  effectiveFrom: Date,
  effectiveTo: Date,

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { 
  timestamps: true,
  toJSON: { virtuals: true }
});

// --- INDEXES ---
shiftSchema.index({ organizationId: 1, code: 1 }, { unique: true });
shiftSchema.index({ organizationId: 1, shiftType: 1, isActive: 1 });

// --- VIRTUALS ---
shiftSchema.virtual('duration').get(function() {
  const start = this.startTime.split(':').map(Number);
  const end = this.endTime.split(':').map(Number);
  let hours = end[0] - start[0];
  let minutes = end[1] - start[1];
  
  if (hours < 0) hours += 24; // Cross midnight
  
  return `${hours}h ${minutes}m`;
});

// --- MIDDLEWARE ---
shiftSchema.pre('save', function(next) {
  // Validate full day vs half day threshold
  if (this.minFullDayHrs <= this.halfDayThresholdHrs) {
    return next(new Error('Full day hours must be greater than half day threshold'));
  }
  
  // Auto-detect night shift
  const startHour = parseInt(this.startTime.split(':')[0]);
  const endHour = parseInt(this.endTime.split(':')[0]);
  this.isNightShift = startHour >= 20 || startHour <= 5 || endHour <= 5;
  this.crossesMidnight = endHour < startHour;
  
  next();
});

// --- METHODS ---
shiftSchema.methods.isWorkingDay = function(date) {
  const day = date.getDay();
  return !this.weeklyOffs.includes(day);
};

shiftSchema.methods.calculateOvertime = function(actualWorkHours) {
  if (!this.overtimeRules.enabled) return 0;
  
  const regularHours = this.overtimeRules.afterHours;
  if (actualWorkHours <= regularHours) return 0;
  
  return actualWorkHours - regularHours;
};

module.exports = mongoose.model('Shift', shiftSchema);
// const mongoose = require('mongoose');

// const shiftSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
//   startTime: { type: String, required: true, default: '09:00' }, 
//   endTime: { type: String, required: true, default: '18:00' },
//   breakDurationMins: { type: Number, default: 60 },
  
//   gracePeriodMins: { type: Number, default: 15 }, 
//   lateThresholdMins: { type: Number, default: 30 },
//   halfDayThresholdHrs: { type: Number, default: 4 }, 
//   minFullDayHrs: { type: Number, default: 8 }, 
  
//   isNightShift: { type: Boolean, default: false },
//   weeklyOffs: [{ type: Number, enum: [0,1,2,3,4,5,6], default: [0] }], // 0 = Sunday
//   isActive: { type: Boolean, default: true }
// }, { timestamps: true });

// shiftSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// shiftSchema.pre('save', function(next) {
//   if (this.minFullDayHrs <= this.halfDayThresholdHrs) {
//     return next(new Error('Full day hours must be greater than half day threshold.'));
//   }
//   next();
// });

// module.exports = mongoose.model('Shift', shiftSchema);
