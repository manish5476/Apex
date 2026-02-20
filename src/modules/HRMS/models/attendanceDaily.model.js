const mongoose = require('mongoose');

const attendanceDailySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  
  date: { 
    type: Date, 
    required: true,
    get: (date) => date.toISOString().split('T')[0],
    set: (date) => new Date(date)
  },
  
  firstIn: Date,
  lastOut: Date,
  totalWorkHours: { type: Number, default: 0, min: 0, max: 24 },
  breakHours: { type: Number, default: 0, min: 0 },
  overtimeHours: { type: Number, default: 0, min: 0 },
  
  status: { 
    type: String, 
    enum: ['present', 'absent', 'half_day', 'late', 'on_leave', 'week_off', 'holiday', 'work_from_home', 'on_duty'],
    default: 'absent',
    index: true
  },

  // --- Attendance Flags ---
  payoutMultiplier: { type: Number, default: 1.0, min: 0.5, max: 3.0 },
  isLate: { type: Boolean, default: false },
  isEarlyDeparture: { type: Boolean, default: false },
  isOvertime: { type: Boolean, default: false },
  isHalfDay: { type: Boolean, default: false },
  isRegularized: { type: Boolean, default: false },
  
  // --- References ---
  logs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  scheduledInTime: String,
  scheduledOutTime: String,
  
  // --- Leave Integration ---
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
  holidayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Holiday' },
  
  // --- Regularization ---
  regularizedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  regularizedAt: Date,
  regularizationReason: String,

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { 
  timestamps: true,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// --- INDEXES ---
attendanceDailySchema.index({ user: 1, date: 1 }, { unique: true });
attendanceDailySchema.index({ organizationId: 1, date: 1, status: 1 });
attendanceDailySchema.index({ organizationId: 1, branchId: 1, date: 1 });
attendanceDailySchema.index({ date: 1, status: 1 });

// --- VIRTUALS ---
attendanceDailySchema.virtual('netWorkHours').get(function() {
  return Math.max(0, (this.totalWorkHours || 0) - (this.breakHours || 0));
});

attendanceDailySchema.virtual('isPresent').get(function() {
  return ['present', 'late', 'half_day', 'work_from_home', 'on_duty'].includes(this.status);
});

// --- MIDDLEWARE ---
attendanceDailySchema.pre('save', async function(next) {
  // Calculate late status
  if ((this.isModified('firstIn') || this.isModified('scheduledInTime')) && this.firstIn && this.scheduledInTime) {
    const Shift = mongoose.model('Shift');
    const shift = await Shift.findById(this.shiftId);
    
    if (shift) {
      const [hours, minutes] = this.scheduledInTime.split(':').map(Number);
      const scheduledTime = new Date(this.firstIn);
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      const graceMs = (shift.gracePeriodMins || 15) * 60 * 1000;
      this.isLate = this.firstIn > new Date(scheduledTime.getTime() + graceMs);
      
      if (this.totalWorkHours) {
        this.isHalfDay = this.totalWorkHours < shift.halfDayThresholdHrs;
      }
    }
  }
  
  // Auto-calculate overtime
  if (this.totalWorkHours && this.scheduledOutTime) {
    const [hours, minutes] = this.scheduledOutTime.split(':').map(Number);
    const scheduledEnd = new Date(this.date);
    scheduledEnd.setHours(hours, minutes, 0, 0);
    
    if (this.lastOut > scheduledEnd) {
      const diffMs = this.lastOut - scheduledEnd;
      this.overtimeHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    }
  }
  
  next();
});

module.exports = mongoose.model('AttendanceDaily', attendanceDailySchema);