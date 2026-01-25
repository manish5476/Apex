// shift.model.js
const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // Timing (HH:mm format)
  startTime: { type: String, required: true, default: '09:00' }, 
  endTime: { type: String, required: true, default: '18:00' },
  
  // 🟢 PERFECTION: Break Management (Deducted from work hours)
  breakDurationMins: { type: Number, default: 60 },
  
  // Rules
  gracePeriodMins: { type: Number, default: 15 }, 
  lateThresholdMins: { type: Number, default: 30 },

  // Deduction Logic
  halfDayThresholdHrs: { type: Number, default: 4 }, 
  minFullDayHrs: { type: Number, default: 8 }, 
  
  isNightShift: { type: Boolean, default: false },
  weeklyOffs: [{ type: Number, enum: [0,1,2,3,4,5,6], default: [0] }], 

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// 🟢 PERFECTION: Compound Index to prevent duplicate shift names in the same shop
shiftSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// 🟢 PERFECTION: Middleware to ensure logic consistency
shiftSchema.pre('save', function(next) {
  // Ensure full day is longer than half day
  if (this.minFullDayHrs <= this.halfDayThresholdHrs) {
    return next(new Error('Full day hours must be greater than half day threshold.'));
  }
  next();
});

module.exports = mongoose.model('Shift', shiftSchema);





// const mongoose = require('mongoose');

// const shiftSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
//   // Timing
//   startTime: { type: String, required: true, default: '09:00' }, 
//   endTime: { type: String, required: true, default: '18:00' },
  
//   // Penalties & Rules
//   gracePeriodMins: { type: Number, default: 15 }, 
//   lateThresholdMins: { type: Number, default: 30 }, // NEW: After 30 mins, mark as "Late"

//   // Deducction Logic
//   halfDayThresholdHrs: { type: Number, default: 4 }, 
//   minFullDayHrs: { type: Number, default: 8 }, 
  
//   // Night Shift Support
//   isNightShift: { type: Boolean, default: false },
  
//   // Days (0=Sun, 1=Mon...)
//   weeklyOffs: [{ type: Number, default: [0] }], 

//   isActive: { type: Boolean, default: true }
// }, { timestamps: true });

// // Ensure shift names are unique per organization
// shiftSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// module.exports = mongoose.model('Shift', shiftSchema);






// // const mongoose = require('mongoose');

// // const shiftSchema = new mongoose.Schema({
// //   name: { 
// //     type: String, 
// //     required: [true, 'Shift name is required (e.g., "General Shift")'],
// //     trim: true 
// //   },
// //   organizationId: { 
// //     type: mongoose.Schema.Types.ObjectId, 
// //     ref: 'Organization', 
// //     required: true 
// //   },
  
// //   // ⏰ Timing Rules (24-hour format HH:mm)
// //   startTime: { type: String, required: true, default: '09:00' },
// //   endTime: { type: String, required: true, default: '18:00' },
  
// //   // 🛡️ Grace & Penalties
// //   gracePeriodMins: { type: Number, default: 15 }, // Late allowed until 09:15
  
// //   // 📉 Deduction Logic
// //   halfDayThresholdHrs: { type: Number, default: 4 }, // If worked < 4 hrs = Half Day
// //   minFullDayHrs: { type: Number, default: 8 }, // Target work hours
  
// //   // 🌙 Night Shift Support (Cross-Midnight)
// //   isNightShift: { type: Boolean, default: false },
  
// //   // 🗓️ Week Offs (0=Sun, 1=Mon...)
// //   weeklyOffs: [{ type: Number, default: [0] }], 

// //   isActive: { type: Boolean, default: true }

// // }, { timestamps: true });

// // module.exports = mongoose.model('Shift', shiftSchema);
