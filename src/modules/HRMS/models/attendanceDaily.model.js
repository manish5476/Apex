const mongoose = require('mongoose');

const attendanceDailySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  date: { type: String, required: true, index: true }, 
  firstIn: Date,
  lastOut: Date,
  totalWorkHours: { type: Number, default: 0 },
  breakHours: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['present', 'absent', 'half_day', 'late', 'on_leave', 'week_off', 'holiday', 'work_from_home', 'on_duty'],
    default: 'absent'
  },
  
  payoutMultiplier: { type: Number, default: 1.0 },
  isLate: { type: Boolean, default: false },
  isEarlyDeparture: { type: Boolean, default: false },
  isOvertime: { type: Boolean, default: false },
  isHalfDay: { type: Boolean, default: false },
  logs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog' }],
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  scheduledInTime: String,
  scheduledOutTime: String,
  
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
}, { timestamps: true });

attendanceDailySchema.index({ user: 1, date: 1 }, { unique: true });
attendanceDailySchema.index({ organizationId: 1, date: 1 });
attendanceDailySchema.virtual('netWorkHours').get(function() {
  return Math.max(0, (this.totalWorkHours || 0) - (this.breakHours || 0));
});

attendanceDailySchema.pre('save', async function(next) {
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
  next();
});
module.exports = mongoose.model('AttendanceDaily', attendanceDailySchema);