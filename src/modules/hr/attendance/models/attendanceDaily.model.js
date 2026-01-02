const mongoose = require('mongoose');

const attendanceDailySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  date: { type: String, required: true, index: true }, // Format: "YYYY-MM-DD"
  
  // Timing
  firstIn: Date,
  lastOut: Date,
  
  // Duration
  totalWorkHours: { type: Number, default: 0 },
  breakHours: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  
  // Status
  status: { 
    type: String, 
    enum: [
      'present', 'absent', 'half_day', 'late', 
      'on_leave', 
      'week_off', 'holiday',
      'week_off_work', 'holiday_work',
      'work_from_home', 'on_duty'
    ],
    default: 'absent'
  },
  
  // Payroll
  payoutMultiplier: { type: Number, default: 1.0 },
  
  // Metadata
  calendarEvents: [{
    type: String,
    priority: Number
  }],
  isLate: { type: Boolean, default: false },
  isEarlyDeparture: { type: Boolean, default: false },
  isOvertime: { type: Boolean, default: false },
  isHalfDay: { type: Boolean, default: false },
  
  // Proof
  logs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
  
  // Shifts
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  scheduledInTime: String,
  scheduledOutTime: String,
  
  // Leave Integration
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
  
  // Verification
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  
}, { timestamps: true });

// Compound indexes for performance
attendanceDailySchema.index({ user: 1, date: 1 }, { unique: true });
attendanceDailySchema.index({ organizationId: 1, date: 1 });
attendanceDailySchema.index({ branchId: 1, date: 1 });
attendanceDailySchema.index({ status: 1, date: 1 });

// Virtual for net work hours
attendanceDailySchema.virtual('netWorkHours').get(function() {
  return Math.max(0, (this.totalWorkHours || 0) - (this.breakHours || 0));
});

// Pre-save to calculate flags
attendanceDailySchema.pre('save', function(next) {
  if (this.firstIn && this.scheduledInTime) {
    const [hours, minutes] = this.scheduledInTime.split(':').map(Number);
    const scheduledTime = new Date(this.firstIn);
    scheduledTime.setHours(hours, minutes, 0, 0);
    
    // Check if late (after grace period)
    const graceMs = (this.shift?.gracePeriodMins || 15) * 60 * 1000;
    this.isLate = this.firstIn > new Date(scheduledTime.getTime() + graceMs);
  }
  
  // Check half day
  if (this.totalWorkHours && this.shift?.halfDayThresholdHrs) {
    this.isHalfDay = this.totalWorkHours < this.shift.halfDayThresholdHrs;
  }
  
  next();
});

module.exports = mongoose.model('AttendanceDaily', attendanceDailySchema);
