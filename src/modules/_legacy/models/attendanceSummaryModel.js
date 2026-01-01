const mongoose = require('mongoose');

const attendanceSummarySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  department: String,
  
  // Period
  periodType: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], required: true },
  periodValue: { type: String, required: true }, // e.g., "2024-01", "2024-W01"
  startDate: Date,
  endDate: Date,
  
  // Statistics
  totalEmployees: Number,
  totalWorkDays: Number,
  totalPresent: Number,
  totalAbsent: Number,
  totalLate: Number,
  totalHalfDay: Number,
  totalLeave: Number,
  totalHoliday: Number,
  totalWeekOff: Number,
  
  // Hours
  totalWorkHours: Number,
  totalOvertimeHours: Number,
  avgWorkHours: Number,
  
  // Rates
  attendanceRate: Number,
  lateRate: Number,
  overtimeRate: Number,
  
  // Computed at
  computedAt: { type: Date, default: Date.now },
  lastUpdated: Date,
  
  // Metadata
  isFinalized: { type: Boolean, default: false },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizedAt: Date
  
}, { timestamps: true });

// Compound index for fast lookups
attendanceSummarySchema.index({ organizationId: 1, periodType: 1, periodValue: 1 });
attendanceSummarySchema.index({ branchId: 1, periodType: 1, periodValue: 1 });
attendanceSummarySchema.index({ department: 1, periodType: 1, periodValue: 1 });

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);