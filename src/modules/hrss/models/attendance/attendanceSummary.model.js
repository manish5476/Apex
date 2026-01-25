const mongoose = require('mongoose');

const attendanceSummarySchema = new mongoose.Schema({
  // Identification
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true,
    index: true 
  },
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch',
    index: true 
  },
  department: { type: String, index: true },
  team: { type: String, index: true },
  
  // Period Definition
  periodType: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
    required: true,
    index: true 
  },
  periodValue: { 
    type: String, 
    required: true,
    index: true 
  }, // e.g., "2024-01", "2024-W01", "2024-Q1"
  periodLabel: String, // Human readable label
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  
  // Employee Counts
  totalEmployees: { type: Number, default: 0 },
  activeEmployees: { type: Number, default: 0 },
  newJoinings: { type: Number, default: 0 },
  resignations: { type: Number, default: 0 },
  
  // Attendance Statistics
  totalWorkingDays: { type: Number, default: 0 },
  totalManDays: { type: Number, default: 0 }, // Total employee * working days
  totalPresent: { type: Number, default: 0 },
  totalAbsent: { type: Number, default: 0 },
  totalLate: { type: Number, default: 0 },
  totalHalfDay: { type: Number, default: 0 },
  totalLeave: { type: Number, default: 0 },
  totalHoliday: { type: Number, default: 0 },
  totalWeekOff: { type: Number, default: 0 },
  totalWFH: { type: Number, default: 0 },
  totalOnDuty: { type: Number, default: 0 },
  
  // Hours Statistics
  totalScheduledHours: { type: Number, default: 0 },
  totalWorkedHours: { type: Number, default: 0 },
  totalOvertimeHours: { type: Number, default: 0 },
  totalBreakHours: { type: Number, default: 0 },
  totalLossOfPayHours: { type: Number, default: 0 },
  
  // Average Metrics
  avgAttendanceRate: { type: Number, default: 0 }, // Percentage
  avgWorkHours: { type: Number, default: 0 },
  avgOvertimeHours: { type: Number, default: 0 },
  avgLateMinutes: { type: Number, default: 0 },
  
  // Rates & Percentages
  attendanceRate: { type: Number, default: 0 }, // (Present/ManDays)*100
  lateRate: { type: Number, default: 0 }, // (Late Count/ManDays)*100
  absenteeismRate: { type: Number, default: 0 }, // (Absent/ManDays)*100
  overtimeRate: { type: Number, default: 0 }, // (OT Hours/Worked Hours)*100
  utilizationRate: { type: Number, default: 0 }, // (Worked Hours/Scheduled Hours)*100
  
  // Top Performers & Concerns
  topPerformers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    attendanceRate: Number,
    punctualityScore: Number
  }],
  frequentLateComers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    lateCount: Number,
    avgLateMinutes: Number
  }],
  frequentAbsentees: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    absentCount: Number,
    absenteeismRate: Number
  }],
  
  // Trend Analysis
  dailyTrend: [{
    date: String,
    present: Number,
    absent: Number,
    late: Number,
    attendanceRate: Number
  }],
  weeklyTrend: [{
    week: String,
    attendanceRate: Number,
    avgWorkHours: Number
  }],
  
  // Department-wise Breakdown (for organization level summaries)
  departmentWise: [{
    department: String,
    employeeCount: Number,
    present: Number,
    absent: Number,
    attendanceRate: Number,
    avgWorkHours: Number
  }],
  
  // Cost Implications
  overtimeCost: { type: Number, default: 0 },
  lossOfPay: { type: Number, default: 0 },
  productivityLoss: { type: Number, default: 0 }, // In percentage
  
  // Processing Metadata
  computedAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  dataSource: { type: String, default: 'system' }, // system, manual, imported
  
  // Status Flags
  isFinalized: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  
  // Audit
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  
  // Versioning for updates
  version: { type: Number, default: 1 },
  previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSummary' },
  
  // Custom Notes
  notes: String,
  anomalies: [{
    type: String,
    description: String,
    severity: { type: String, enum: ['low', 'medium', 'high'] }
  }]
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for fast lookups
attendanceSummarySchema.index({ organizationId: 1, periodType: 1, periodValue: 1 }, { unique: true });
attendanceSummarySchema.index({ organizationId: 1, branchId: 1, periodType: 1, periodValue: 1 });
attendanceSummarySchema.index({ organizationId: 1, department: 1, periodType: 1, periodValue: 1 });
attendanceSummarySchema.index({ organizationId: 1, startDate: 1, endDate: 1 });

// Virtual for period duration in days
attendanceSummarySchema.virtual('periodDurationDays').get(function() {
  const diffTime = Math.abs(this.endDate - this.startDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
});

// Pre-save middleware for calculated fields
attendanceSummarySchema.pre('save', function(next) {
  // Calculate man-days if not set
  if (this.totalManDays === 0 && this.totalEmployees > 0 && this.totalWorkingDays > 0) {
    this.totalManDays = this.totalEmployees * this.totalWorkingDays;
  }
  
  // Calculate rates if man-days available
  if (this.totalManDays > 0) {
    this.attendanceRate = ((this.totalPresent / this.totalManDays) * 100) || 0;
    this.lateRate = ((this.totalLate / this.totalManDays) * 100) || 0;
    this.absenteeismRate = ((this.totalAbsent / this.totalManDays) * 100) || 0;
  }
  
  // Calculate overtime rate
  if (this.totalWorkedHours > 0) {
    this.overtimeRate = ((this.totalOvertimeHours / this.totalWorkedHours) * 100) || 0;
  }
  
  // Calculate utilization rate
  if (this.totalScheduledHours > 0) {
    this.utilizationRate = ((this.totalWorkedHours / this.totalScheduledHours) * 100) || 0;
  }
  
  // Calculate average work hours per employee
  if (this.activeEmployees > 0) {
    this.avgWorkHours = (this.totalWorkedHours / this.activeEmployees) || 0;
    this.avgOvertimeHours = (this.totalOvertimeHours / this.activeEmployees) || 0;
  }
  
  // Update timestamp
  this.lastUpdated = new Date();
  
  next();
});

// Static method to get or create summary
attendanceSummarySchema.statics.getOrCreate = async function(organizationId, periodType, periodValue, startDate, endDate) {
  let summary = await this.findOne({
    organizationId,
    periodType,
    periodValue
  });
  
  if (!summary) {
    summary = await this.create({
      organizationId,
      periodType,
      periodValue,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      periodLabel: this.generatePeriodLabel(periodType, periodValue, startDate, endDate)
    });
  }
  
  return summary;
};

// Static method to generate period label
attendanceSummarySchema.statics.generatePeriodLabel = function(periodType, periodValue, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  switch (periodType) {
    case 'daily':
      return start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    case 'weekly':
      return `Week ${periodValue.split('-W')[1]}, ${start.getFullYear()}`;
    case 'monthly':
      return start.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    case 'quarterly':
      const quarter = Math.ceil((start.getMonth() + 1) / 3);
      return `Q${quarter} ${start.getFullYear()}`;
    case 'yearly':
      return `Year ${start.getFullYear()}`;
    default:
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }
};

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);