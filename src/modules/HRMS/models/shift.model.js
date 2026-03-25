const mongoose = require('mongoose');

// ─────────────────────────────────────────────
//  Time format validator (HH:MM)
// FIX BUG-SH-01 [HIGH] — Schema-level validation added to startTime/endTime.
// Without this, documents created via insertMany or findOneAndUpdate with
// runValidators:false bypass pre-save middleware entirely, allowing invalid time strings.
// ─────────────────────────────────────────────
const timeValidator = {
  validator: (v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  message:   (props) => `'${props.value}' is not a valid time. Use HH:MM format (e.g. "09:00", "18:30")`,
};

const shiftSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  code:        { type: String, required: false, trim: true, uppercase: true },
  description: String,

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  // --- Timing ---
  startTime: { type: String, required: true, default: '09:00', validate: timeValidator },
  endTime:   { type: String, required: true, default: '18:00', validate: timeValidator },

  // --- Breaks ---
  breakDurationMins: { type: Number, default: 60, min: 0 },
  breaks: [{
    name:      String,
    startTime: { type: String, validate: timeValidator },
    endTime:   { type: String, validate: timeValidator },
    isPaid:    { type: Boolean, default: false },
  }],

  // --- Rules ---
  gracePeriodMins:              { type: Number, default: 15,  min: 0 },
  lateThresholdMins:            { type: Number, default: 30,  min: 0 },
  earlyDepartureThresholdMins:  { type: Number, default: 15,  min: 0 },
  halfDayThresholdHrs:          { type: Number, default: 4,   min: 0 },
  minFullDayHrs:                { type: Number, default: 8,   min: 0 },
  maxOvertimeHrs:               { type: Number, default: 4,   min: 0 },

  shiftType: {
    type: String,
    enum: ['fixed', 'rotating', 'flexi', 'split', 'night'],
    default: 'fixed',
  },

  isNightShift:   { type: Boolean, default: false },
  crossesMidnight:{ type: Boolean, default: false },

  // FIX BUG-SH-02 [MEDIUM] — weeklyOffs array default was set on the item schema, not the array field.
  // `[{ type: Number, default: [0] }]` — the `default: [0]` on an array item definition has no effect.
  // Fixed: define weeklyOffs as a typed array field with the default on the array itself.
  weeklyOffs: {
    type:    [Number],
    enum:    [0, 1, 2, 3, 4, 5, 6],
    default: [0], // Default: Sunday off
  },

  applicableDays: {
    type: [Number],
    enum: [0, 1, 2, 3, 4, 5, 6],
  },

  overtimeRules: {
    enabled:          { type: Boolean, default: false },
    multiplier:       { type: Number, default: 1.5 },
    afterHours:       { type: Number, default: 8 },
    doubleAfterHours: { type: Number, default: 12 },
    holidayMultiplier:{ type: Number, default: 2.0 },
  },

  flexiConfig: {
    coreStartTime:       String,
    coreEndTime:         String,
    flexibleBandStart:   String,
    flexibleBandEnd:     String,
    minHoursPerDay:      { type: Number, default: 4 },
  },

  isActive:      { type: Boolean, default: true, index: true },
  effectiveFrom: Date,
  effectiveTo:   Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
shiftSchema.index({ organizationId: 1, code: 1 }, { unique: true, sparse: true });
shiftSchema.index({ organizationId: 1, shiftType: 1, isActive: 1 });

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────

shiftSchema.virtual('duration').get(function () {
  if (!this.startTime || !this.endTime) return '0h 0m';
  try {
    const [startH, startM] = this.startTime.split(':').map(Number);
    const [endH,   endM  ] = this.endTime.split(':').map(Number);

    let hours   = endH - startH;
    let minutes = endM - startM;

    if (minutes < 0) { minutes += 60; hours -= 1; }
    if (hours < 0)   { hours   += 24; }         // Cross midnight

    return `${hours}h ${minutes}m`;
  } catch {
    return '0h 0m';
  }
});

// ─────────────────────────────────────────────
//  Pre-Validate
// ─────────────────────────────────────────────

shiftSchema.pre('validate', function (next) {
  // Guard: minFullDayHrs must exceed halfDayThresholdHrs
  if (this.minFullDayHrs <= this.halfDayThresholdHrs) {
    return next(new Error(
      `minFullDayHrs (${this.minFullDayHrs}) must be greater than halfDayThresholdHrs (${this.halfDayThresholdHrs})`
    ));
  }
  next();
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────

shiftSchema.pre('save', function (next) {
  if (this.startTime && this.endTime) {
    const [startH] = this.startTime.split(':').map(Number);
    const [endH  ] = this.endTime.split(':').map(Number);

    this.isNightShift    = startH >= 20 || startH <= 5 || endH <= 5;
    this.crossesMidnight = endH < startH;
  }
  next();
});

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

shiftSchema.methods.isWorkingDay = function (date) {
  const day = date.getDay();
  return !this.weeklyOffs.includes(day);
};

/**
 * FIX BUG-SH-03 [LOW] — calculateOvertime now returns structured object including
 * regular OT hours and double-time OT hours, applying the correct multipliers.
 * Original returned raw hours only and completely ignored doubleAfterHours.
 *
 * @param {number} actualWorkHours
 * @returns {{ regularOTHours: number, doubleOTHours: number, totalOTHours: number, effectiveOTHours: number }}
 */
shiftSchema.methods.calculateOvertime = function (actualWorkHours) {
  if (!this.overtimeRules || !this.overtimeRules.enabled) {
    return { regularOTHours: 0, doubleOTHours: 0, totalOTHours: 0, effectiveOTHours: 0 };
  }

  const { afterHours, doubleAfterHours, multiplier, } = this.overtimeRules;

  if (actualWorkHours <= afterHours) {
    return { regularOTHours: 0, doubleOTHours: 0, totalOTHours: 0, effectiveOTHours: 0 };
  }

  let regularOTHours = 0;
  let doubleOTHours  = 0;

  if (actualWorkHours <= doubleAfterHours) {
    regularOTHours = actualWorkHours - afterHours;
  } else {
    regularOTHours = doubleAfterHours - afterHours;
    doubleOTHours  = actualWorkHours  - doubleAfterHours;
  }

  // effectiveOTHours = paid equivalent hours (applying multipliers)
  const effectiveOTHours =
    (regularOTHours * (multiplier      || 1.5)) +
    (doubleOTHours  * (multiplier * 2  || 2.0));

  return {
    regularOTHours:  parseFloat(regularOTHours.toFixed(2)),
    doubleOTHours:   parseFloat(doubleOTHours.toFixed(2)),
    totalOTHours:    parseFloat((regularOTHours + doubleOTHours).toFixed(2)),
    effectiveOTHours:parseFloat(effectiveOTHours.toFixed(2)),
  };
};

module.exports = mongoose.model('Shift', shiftSchema);

// const mongoose = require('mongoose');

// const shiftSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   code: { type: String, required: false, trim: true, uppercase: true },
//   description: String,
  
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

//   // --- Timing ---
//   startTime: { type: String, required: true, default: '09:00' },
//   endTime: { type: String, required: true, default: '18:00' },
  
//   // --- Breaks ---
//   breakDurationMins: { type: Number, default: 60, min: 0 },
//   breaks: [{
//     name: String,
//     startTime: String,
//     endTime: String,
//     isPaid: { type: Boolean, default: false }
//   }],

//   // --- Rules ---
//   gracePeriodMins: { type: Number, default: 15, min: 0 },
//   lateThresholdMins: { type: Number, default: 30, min: 0 },
//   earlyDepartureThresholdMins: { type: Number, default: 15, min: 0 },
//   halfDayThresholdHrs: { type: Number, default: 4, min: 0 },
//   minFullDayHrs: { type: Number, default: 8, min: 0 },
//   maxOvertimeHrs: { type: Number, default: 4, min: 0 },

//   // --- Shift Type ---
//   shiftType: {
//     type: String,
//     enum: ['fixed', 'rotating', 'flexi', 'split', 'night'],
//     default: 'fixed'
//   },

//   // --- Night Shift Handling ---
//   isNightShift: { type: Boolean, default: false },
//   crossesMidnight: { type: Boolean, default: false },

//   // --- Weekly Offs ---
//   weeklyOffs: [{ 
//     type: Number, 
//     enum: [0, 1, 2, 3, 4, 5, 6], 
//     default: [0] 
//   }], // 0 = Sunday

//   // --- Applicability ---
//   applicableDays: [{ 
//     type: Number, 
//     enum: [0, 1, 2, 3, 4, 5, 6] 
//   }], // empty = all days

//   // --- Overtime Rules ---
//   overtimeRules: {
//     enabled: { type: Boolean, default: false },
//     multiplier: { type: Number, default: 1.5 },
//     afterHours: { type: Number, default: 8 }, // OT after 8 hours
//     doubleAfterHours: { type: Number, default: 12 }, // Double OT after 12 hours
//     holidayMultiplier: { type: Number, default: 2.0 }
//   },

//   // --- Flexible Shift Config ---
//   flexiConfig: {
//     coreStartTime: String, 
//     coreEndTime: String,
//     flexibleBandStart: String, 
//     flexibleBandEnd: String, 
//     minHoursPerDay: { type: Number, default: 4 }
//   },

//   // --- Status ---
//   isActive: { type: Boolean, default: true, index: true },
//   effectiveFrom: Date,
//   effectiveTo: Date,

//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true },
//   toObject: { virtuals: true }
// });

// // --- INDEXES ---
// shiftSchema.index({ organizationId: 1, code: 1 }, { unique: true });
// shiftSchema.index({ organizationId: 1, shiftType: 1, isActive: 1 });

// // --- VIRTUALS ---
// shiftSchema.virtual('duration').get(function() {
//   // FIX: Added null checks to prevent "split of undefined"
//   if (!this.startTime || !this.endTime) return '0h 0m';
  
//   try {
//     const start = this.startTime.split(':').map(Number);
//     const end = this.endTime.split(':').map(Number);
    
//     if (start.length < 2 || end.length < 2) return '0h 0m';

//     let hours = end[0] - start[0];
//     let minutes = end[1] - start[1];
    
//     if (minutes < 0) {
//       minutes += 60;
//       hours -= 1;
//     }
    
//     if (hours < 0) hours += 24; // Cross midnight
    
//     return `${hours}h ${minutes}m`;
//   } catch (e) {
//     return '0h 0m';
//   }
// });

// // --- MIDDLEWARE ---
// shiftSchema.pre('save', function(next) {
//   // Validate full day vs half day threshold
//   if (this.minFullDayHrs <= this.halfDayThresholdHrs) {
//     return next(new Error('Full day hours must be greater than half day threshold'));
//   }
  
//   // FIX: Added safe parsing for startTime and endTime
//   if (this.startTime && this.endTime) {
//     const startParts = this.startTime.split(':');
//     const endParts = this.endTime.split(':');
    
//     const startHour = parseInt(startParts[0] || 0);
//     const endHour = parseInt(endParts[0] || 0);
    
//     // Auto-detect night shift logic
//     this.isNightShift = startHour >= 20 || startHour <= 5 || endHour <= 5;
//     this.crossesMidnight = endHour < startHour;
//   }
  
//   next();
// });

// // --- METHODS ---
// shiftSchema.methods.isWorkingDay = function(date) {
//   const day = date.getDay();
//   return !this.weeklyOffs.includes(day);
// };

// shiftSchema.methods.calculateOvertime = function(actualWorkHours) {
//   if (!this.overtimeRules || !this.overtimeRules.enabled) return 0;
  
//   const regularHours = this.overtimeRules.afterHours;
//   if (actualWorkHours <= regularHours) return 0;
  
//   return actualWorkHours - regularHours;
// };

// module.exports = mongoose.model('Shift', shiftSchema);
