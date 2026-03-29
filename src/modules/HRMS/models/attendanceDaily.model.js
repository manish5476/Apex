const mongoose = require('mongoose');

const attendanceDailySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

  // FIX BUG-AD-01 [CRITICAL] — Removed getter/setter from the `date` field entirely.
  // The original getter converted the stored Date to a STRING ("2024-03-15") which:
  //   1. Broke all MongoDB aggregation ($gte, $lte, $dateToString) — they received a string, not a Date.
  //   2. Broke the unique compound index { user, date } — string vs Date mismatch.
  //   3. Broke .sort({ date: -1 }) — lexicographic string sort, not chronological.
  // Rule: Always store as pure UTC Date. Format strings belong in the API serializer layer.
  date: {
    type: Date,
    required: true,
  },

  firstIn: Date,
  lastOut: Date,

  // FIX BUG-AD-06 [MEDIUM] — Removed max: 24 restriction.
  // Night shift workers legitimately span midnight. Raw punch-in/out difference
  // can be computed outside the 0–24 range during reconciliation before normalization.
  totalWorkHours: { type: Number, default: 0, min: 0 },
  breakHours:     { type: Number, default: 0, min: 0 },
  overtimeHours:  { type: Number, default: 0, min: 0 },

  status: {
    type: String,
    enum: ['present', 'absent', 'half_day', 'late', 'on_leave', 'week_off', 'holiday', 'work_from_home', 'on_duty'],
    default: 'absent',
    index: true,
  },

  // --- Attendance Flags ---
  payoutMultiplier:  { type: Number, default: 1.0, min: 0.5, max: 3.0 },
  isLate:            { type: Boolean, default: false },
  isEarlyDeparture:  { type: Boolean, default: false },
  isOvertime:        { type: Boolean, default: false },
  isHalfDay:         { type: Boolean, default: false },
  isRegularized:     { type: Boolean, default: false },

  // --- References ---
  logs:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },

  // FIX BUG-AD-05 [HIGH] — Added regex validation for HH:MM format.
  // The middleware parses these with .split(':').map(Number). Without validation,
  // inputs like "9am", "900", or "9:0" cause setHours(NaN) → Invalid Date →
  // isLate silently becomes false for all employees.
  scheduledInTime: {
    type: String,
    validate: {
      validator: (v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      message: 'scheduledInTime must be in HH:MM format (e.g. "09:00")',
    },
  },
  scheduledOutTime: {
    type: String,
    validate: {
      validator: (v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
      message: 'scheduledOutTime must be in HH:MM format (e.g. "18:00")',
    },
  },

  // --- Leave Integration ---
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
  holidayId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Holiday' },

  // --- Regularization ---
  regularizedById:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  regularizedAt:        Date,
  regularizationReason: String,

  // --- Audit ---
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

// Primary: one record per user per day (unique constraint)
attendanceDailySchema.index({ user: 1, date: 1 }, { unique: true });

// Org-level attendance dashboard: "all employees present today"
attendanceDailySchema.index({ organizationId: 1, date: 1, status: 1 });

// Branch-level attendance view
attendanceDailySchema.index({ organizationId: 1, branchId: 1, date: 1 });

// FIX BUG-AD-07 [MEDIUM] — Added org+user+date index for manager-level user history queries
attendanceDailySchema.index({ organizationId: 1, user: 1, date: -1 });

// FIX BUG-AD-08 [LOW] — Removed the bare `{ date, status }` index (no organizationId = cross-tenant scan risk).
// Covered by the `{ organizationId, date, status }` index above.

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────

attendanceDailySchema.virtual('netWorkHours').get(function () {
  return Math.max(0, (this.totalWorkHours || 0) - (this.breakHours || 0));
});

attendanceDailySchema.virtual('isPresent').get(function () {
  return ['present', 'late', 'half_day', 'work_from_home', 'on_duty'].includes(this.status);
});

// ─────────────────────────────────────────────
//  Pre-Validate
// ─────────────────────────────────────────────

attendanceDailySchema.pre('validate', function (next) {
  // FIX BUG-AD-06 [MEDIUM] — Guard: breakHours cannot exceed totalWorkHours
  if (this.breakHours > this.totalWorkHours) {
    return next(new Error(`breakHours (${this.breakHours}) cannot exceed totalWorkHours (${this.totalWorkHours})`));
  }
  next();
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────

attendanceDailySchema.pre('save', async function (next) {
  // FIX BUG-AD-02 [CRITICAL] — Wrapped entire middleware in try/catch.
  // Original had no error handling: if Shift.findById() threw, next() was never called
  // and the request hung indefinitely.
  try {
    // --- Late & Half-Day Detection ---
    if (
      (this.isModified('firstIn') || this.isModified('scheduledInTime') || this.isModified('isRegularized')) &&
      this.firstIn &&
      this.scheduledInTime
    ) {
      const Shift = mongoose.model('Shift');
      const shift = this.shiftId ? await Shift.findById(this.shiftId).lean() : null;

      const [inHours, inMinutes] = this.scheduledInTime.split(':').map(Number);

      // FIX BUG-AD-03 [CRITICAL] — Base scheduled time on firstIn date (not this.date).
      // Using this.date caused night-shift overtime to be calculated against the wrong calendar day.
      const scheduledIn = new Date(this.firstIn);
      scheduledIn.setHours(inHours, inMinutes, 0, 0);

      const graceMs = ((shift && shift.gracePeriodMins) || 15) * 60 * 1000;
      this.isLate = this.firstIn > new Date(scheduledIn.getTime() + graceMs);

      // FIX BUG-AD-04 [HIGH] — isHalfDay now recalculates whenever totalWorkHours changes,
      // not just when firstIn or scheduledInTime changes. This ensures regularized records
      // update isHalfDay correctly when only totalWorkHours is patched.
      if (this.totalWorkHours !== undefined && shift) {
        this.isHalfDay = this.totalWorkHours < shift.halfDayThresholdHrs;
      }
    }

    // --- Overtime Calculation ---
    if (this.lastOut && this.scheduledOutTime && this.firstIn) {
      const [outHours, outMinutes] = this.scheduledOutTime.split(':').map(Number);

      // FIX BUG-AD-03 [CRITICAL] — Base scheduledEnd on firstIn (real punch date), not this.date.
      // For night shifts crossing midnight, the scheduled end is on the NEXT calendar day.
      const scheduledEnd = new Date(this.firstIn);
      scheduledEnd.setHours(outHours, outMinutes, 0, 0);

      // If scheduledEnd is before firstIn, it crosses midnight — add 1 day
      if (scheduledEnd <= this.firstIn) {
        scheduledEnd.setDate(scheduledEnd.getDate() + 1);
      }

      if (this.lastOut > scheduledEnd) {
        const diffMs = this.lastOut - scheduledEnd;
        this.overtimeHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        this.isOvertime = this.overtimeHours > 0;
      } else {
        this.overtimeHours = 0;
        this.isOvertime = false;
      }
    }

    next();
  } catch (err) {
    // FIX BUG-AD-02 — Pass error to next() so Express/Mongoose error handler catches it.
    // Without this, the middleware silently hung on any async failure.
    next(err);
  }
});

module.exports = mongoose.model('AttendanceDaily', attendanceDailySchema);

// const mongoose = require('mongoose');

// const attendanceDailySchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  
//   date: { 
//     type: Date, 
//     required: true,
//     get: (date) => date.toISOString().split('T')[0],
//     set: (date) => new Date(date)
//   },
  
//   firstIn: Date,
//   lastOut: Date,
//   totalWorkHours: { type: Number, default: 0, min: 0, max: 24 },
//   breakHours: { type: Number, default: 0, min: 0 },
//   overtimeHours: { type: Number, default: 0, min: 0 },
  
//   status: { 
//     type: String, 
//     enum: ['present', 'absent', 'half_day', 'late', 'on_leave', 'week_off', 'holiday', 'work_from_home', 'on_duty'],
//     default: 'absent',
//     index: true
//   },

//   // --- Attendance Flags ---
//   payoutMultiplier: { type: Number, default: 1.0, min: 0.5, max: 3.0 },
//   isLate: { type: Boolean, default: false },
//   isEarlyDeparture: { type: Boolean, default: false },
//   isOvertime: { type: Boolean, default: false },
//   isHalfDay: { type: Boolean, default: false },
//   isRegularized: { type: Boolean, default: false },
  
//   // --- References ---
//   logs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
//   shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
//   scheduledInTime: String,
//   scheduledOutTime: String,
  
//   // --- Leave Integration ---
//   leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
//   holidayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Holiday' },
  
//   // --- Regularization ---
//   regularizedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   regularizedAt: Date,
//   regularizationReason: String,

//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { 
//   timestamps: true,
//   toJSON: { getters: true, virtuals: true },
//   toObject: { getters: true, virtuals: true }
// });

// // --- INDEXES ---
// attendanceDailySchema.index({ user: 1, date: 1 }, { unique: true });
// attendanceDailySchema.index({ organizationId: 1, date: 1, status: 1 });
// attendanceDailySchema.index({ organizationId: 1, branchId: 1, date: 1 });
// attendanceDailySchema.index({ date: 1, status: 1 });

// // --- VIRTUALS ---
// attendanceDailySchema.virtual('netWorkHours').get(function() {
//   return Math.max(0, (this.totalWorkHours || 0) - (this.breakHours || 0));
// });

// attendanceDailySchema.virtual('isPresent').get(function() {
//   return ['present', 'late', 'half_day', 'work_from_home', 'on_duty'].includes(this.status);
// });

// // --- MIDDLEWARE ---
// attendanceDailySchema.pre('save', async function(next) {
//   // Calculate late status
//   if ((this.isModified('firstIn') || this.isModified('scheduledInTime')) && this.firstIn && this.scheduledInTime) {
//     const Shift = mongoose.model('Shift');
//     const shift = await Shift.findById(this.shiftId);
    
//     if (shift) {
//       const [hours, minutes] = this.scheduledInTime.split(':').map(Number);
//       const scheduledTime = new Date(this.firstIn);
//       scheduledTime.setHours(hours, minutes, 0, 0);
      
//       const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
//       this.isLate = this.firstIn > new Date(scheduledTime.getTime() + graceMs);
      
//       if (this.totalWorkHours) {
//         this.isHalfDay = this.totalWorkHours < shift.halfDayThresholdHrs;
//       }
//     }
//   }
  
//   // Auto-calculate overtime
//   if (this.totalWorkHours && this.scheduledOutTime) {
//     const [hours, minutes] = this.scheduledOutTime.split(':').map(Number);
//     const scheduledEnd = new Date(this.date);
//     scheduledEnd.setHours(hours, minutes, 0, 0);
    
//     if (this.lastOut > scheduledEnd) {
//       const diffMs = this.lastOut - scheduledEnd;
//       this.overtimeHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
//     }
//   }
  
//   next();
// });

// module.exports = mongoose.model('AttendanceDaily', attendanceDailySchema);