const mongoose = require('mongoose');

const attendanceDailySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  date: { type: String, required: true, index: true },
  
  // Punch Times
  firstIn: Date,
  lastOut: Date,
  scheduledInTime: String,
  scheduledOutTime: String,
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  
  // Hours Calculation
  totalWorkHours: { type: Number, default: 0 },
  breakHours: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  netWorkHours: { type: Number, default: 0 },
  
  // Status
  status: { 
    type: String, 
    enum: [
      'present', 'absent', 'half_day', 'late', 
      'on_leave', 'week_off', 'holiday',
      'week_off_work', 'holiday_work',
      'work_from_home', 'on_duty', 'missed_punch'
    ],
    default: 'absent'
  },
  
  // Flags
  isLate: { type: Boolean, default: false },
  isEarlyDeparture: { type: Boolean, default: false },
  isOvertime: { type: Boolean, default: false },
  isHalfDay: { type: Boolean, default: false },
  
  // Metadata
  payoutMultiplier: { type: Number, default: 1.0 },
  calendarEvents: [String],
  remarks: String,
  
  // References
  logs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
  attendanceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRequest' },
  
  // Verification
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
attendanceDailySchema.index({ user: 1, date: 1 }, { unique: true });
attendanceDailySchema.index({ organizationId: 1, date: 1 });
attendanceDailySchema.index({ branchId: 1, date: 1 });
attendanceDailySchema.index({ status: 1, date: 1 });
attendanceDailySchema.index({ user: 1, organizationId: 1 });

// Virtual for net work hours
attendanceDailySchema.virtual('calculatedNetWorkHours').get(function() {
  return Math.max(0, (this.totalWorkHours || 0) - (this.breakHours || 0));
});

// Pre-save middleware
attendanceDailySchema.pre('save', async function(next) {
  // Calculate net work hours
  this.netWorkHours = Math.max(0, (this.totalWorkHours || 0) - (this.breakHours || 0));
  
  // Calculate if late based on shift
  if (this.firstIn && this.scheduledInTime) {
    const shift = await mongoose.model('Shift').findById(this.shiftId);
    if (shift) {
      const [scheduledHour, scheduledMinute] = this.scheduledInTime.split(':').map(Number);
      const scheduledTime = new Date(this.firstIn);
      scheduledTime.setHours(scheduledHour, scheduledMinute, 0, 0);
      
      const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
      this.isLate = this.firstIn > new Date(scheduledTime.getTime() + graceMs);
    }
  }
  
  next();
});

module.exports = mongoose.model('AttendanceDaily', attendanceDailySchema);