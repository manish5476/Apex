const mongoose = require('mongoose');

const attendanceDailySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  date: { type: String, required: true, index: true }, // Format: "YYYY-MM-DD"
  
  // Calculated from Logs
  firstIn: Date,
  lastOut: Date,
  
  // Duration Logic
  totalWorkHours: { type: Number, default: 0 }, // e.g., 8.5
  
  // status: { 
  //   type: String, 
  //   enum: ['present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'week_off'],
  //   default: 'absent'
  // },
  status: { 
    type: String, 
    enum: [
      'present', 'absent', 'half_day', 'late', 
      'on_leave', 
      'week_off', 'holiday',                 // Non-working days
      'week_off_work', 'holiday_work'        // Working on red days
    ],
    default: 'absent'
  },
  // 💰 The Payroll Magic Number
  // 1.0 = Normal Day
  // 2.0 = Double Pay (Holiday Work)
  // 0.0 = Absent (No Pay)
  payoutMultiplier: { type: Number, default: 1.0 },

  // Metadata to explain the collision
  calendarEvents: [{
    type: String, // 'sunday', 'diwali', 'election_day'
    priority: Number // 1=Low, 10=High
  }]
  isLate: { type: Boolean, default: false },
  isOvertime: { type: Boolean, default: false },
  
  // Link back to the evidence
  logs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }]
}, { timestamps: true });

// Ensure a user has only ONE record per day
attendanceDailySchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceDaily', attendanceDailySchema);
