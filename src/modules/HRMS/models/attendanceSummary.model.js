const mongoose = require('mongoose');

const attendanceSummarySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }, // Updated to reference model
  
  periodType: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], required: true },
  periodValue: { type: String, required: true }, 
  startDate: Date,
  endDate: Date,
  
  totalEmployees: Number,
  totalWorkDays: Number,
  totalPresent: Number,
  totalAbsent: Number,
  totalLate: Number,
  totalHalfDay: Number,
  totalLeave: Number,
  
  totalWorkHours: Number,
  totalOvertimeHours: Number,
  
  isFinalized: { type: Boolean, default: false },
}, { timestamps: true });

attendanceSummarySchema.index({ organizationId: 1, periodType: 1, periodValue: 1 });

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);