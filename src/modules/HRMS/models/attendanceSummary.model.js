
const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

  periodType: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'], 
    required: true 
  },
  periodValue: { type: String, required, index: true }, // "2024-03", "2024-W12", etc.
  
  dateRange: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
  },

  // --- Statistics ---
  stats: {
    totalEmployees: { type: Number, default: 0 },
    activeEmployees: { type: Number, default: 0 },
    
    present: { type: Number, default: 0 },
    absent: { type: Number, default: 0 },
    late: { type: Number, default: 0 },
    halfDay: { type: Number, default: 0 },
    onLeave: { type: Number, default: 0 },
    onHoliday: { type: Number, default: 0 },
    workFromHome: { type: Number, default: 0 },
    onDuty: { type: Number, default: 0 },
    
    totalWorkHours: { type: Number, default: 0 },
    totalOvertimeHours: { type: Number, default: 0 },
    averageWorkHours: { type: Number, default: 0 },
    
    attendancePercentage: { type: Number, default: 0 },
    latePercentage: { type: Number, default: 0 }
  },

  // --- Department Wise Breakdown (Embedded for performance) ---
  departmentWiseData: [{
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    departmentName: String,
    present: Number,
    absent: Number,
    late: Number,
    totalEmployees: Number,
    attendancePercentage: Number
  }],

  // --- Branch Wise Breakdown ---
  branchWiseData: [{
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    branchName: String,
    present: Number,
    absent: Number,
    totalEmployees: Number
  }],

  // --- Status ---
  isFinalized: { type: Boolean, default: false, index: true },
  finalizedAt: Date,
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- Generation Info ---
  generatedAt: { type: Date, default: Date.now },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  generationDuration: Number, // in ms

  // --- Notes ---
  notes: String,
  
  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { 
  timestamps: true,
  toJSON: { virtuals: true }
});

// --- INDEXES ---
summarySchema.index({ organizationId: 1, periodType: 1, periodValue: 1 }, { unique: true });
summarySchema.index({ organizationId: 1, branchId: 1, 'dateRange.startDate': -1 });
summarySchema.index({ isFinalized: 1, periodValue: 1 });

// --- VIRTUALS ---
summarySchema.virtual('summaryPeriod').get(function() {
  return `${this.periodType}: ${this.periodValue}`;
});

// --- STATICS ---
summarySchema.statics.generateMonthlySummary = async function(organizationId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const periodValue = `${year}-${month.toString().padStart(2, '0')}`;
  
  // Aggregation pipeline would go here
  // This is just a placeholder for the schema
};

module.exports = mongoose.model('AttendanceSummary', summarySchema);// const mongoose = require('mongoose');

// const attendanceSummarySchema = new mongoose.Schema({
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
//   department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }, // Updated to reference model
  
//   periodType: { type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], required: true },
//   periodValue: { type: String, required: true }, 
//   startDate: Date,
//   endDate: Date,
  
//   totalEmployees: Number,
//   totalWorkDays: Number,
//   totalPresent: Number,
//   totalAbsent: Number,
//   totalLate: Number,
//   totalHalfDay: Number,
//   totalLeave: Number,
  
//   totalWorkHours: Number,
//   totalOvertimeHours: Number,
  
//   isFinalized: { type: Boolean, default: false },
// }, { timestamps: true });

// attendanceSummarySchema.index({ organizationId: 1, periodType: 1, periodValue: 1 });

// module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);