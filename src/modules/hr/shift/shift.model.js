const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Shift name is required (e.g., "General Shift")'],
    trim: true 
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true 
  },
  
  // ⏰ Timing Rules (24-hour format HH:mm)
  startTime: { type: String, required: true, default: '09:00' },
  endTime: { type: String, required: true, default: '18:00' },
  
  // 🛡️ Grace & Penalties
  gracePeriodMins: { type: Number, default: 15 }, // Late allowed until 09:15
  
  // 📉 Deduction Logic
  halfDayThresholdHrs: { type: Number, default: 4 }, // If worked < 4 hrs = Half Day
  minFullDayHrs: { type: Number, default: 8 }, // Target work hours
  
  // 🌙 Night Shift Support (Cross-Midnight)
  isNightShift: { type: Boolean, default: false },
  
  // 🗓️ Week Offs (0=Sun, 1=Mon...)
  weeklyOffs: [{ type: Number, default: [0] }], 

  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model('Shift', shiftSchema);
