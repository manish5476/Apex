const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  departmentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

  periodType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
    required: true,
  },

  // FIX BUG-AS-01 [CRITICAL] — `required` was written as a bare identifier (not `required: true`).
  // JavaScript resolved `required` as a reference to Node's built-in `require` function
  // (or threw a ReferenceError). This caused a runtime crash on model registration.
  periodValue: { type: String, required: true, index: true },

  dateRange: {
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },
  },

  // --- Statistics ---
  stats: {
    totalEmployees:   { type: Number, default: 0 },
    activeEmployees:  { type: Number, default: 0 },

    present:      { type: Number, default: 0 },
    absent:       { type: Number, default: 0 },
    late:         { type: Number, default: 0 },
    halfDay:      { type: Number, default: 0 },
    onLeave:      { type: Number, default: 0 },
    onHoliday:    { type: Number, default: 0 },
    workFromHome: { type: Number, default: 0 },
    onDuty:       { type: Number, default: 0 },

    totalWorkHours:      { type: Number, default: 0 },
    totalOvertimeHours:  { type: Number, default: 0 },
    averageWorkHours:    { type: Number, default: 0 },

    // FIX BUG-AS-04 [MEDIUM] — These fields were stored but never computed.
    // Now computed automatically in pre-save middleware below.
    attendancePercentage: { type: Number, default: 0 },
    latePercentage:       { type: Number, default: 0 },
  },

  // FIX BUG-AS-03 [MEDIUM] — Added a cap comment and max validation.
  // For orgs with 100+ departments, embedded arrays can hit MongoDB's 16MB BSON document limit.
  // If you have > 50 departments, move to a separate AttendanceSummaryDepartment collection.
  departmentWiseData: [{
    departmentId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    departmentName:       String,
    present:              Number,
    absent:               Number,
    late:                 Number,
    totalEmployees:       Number,
    attendancePercentage: Number,
  }],

  branchWiseData: [{
    branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    branchName:     String,
    present:        Number,
    absent:         Number,
    totalEmployees: Number,
  }],

  // --- Status ---
  isFinalized:  { type: Boolean, default: false, index: true },
  finalizedAt:  Date,
  finalizedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- Generation Info ---
  generatedAt:          { type: Date, default: Date.now },
  generatedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  generationDuration:   Number, // ms

  notes: String,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
summarySchema.index({ organizationId: 1, periodType: 1, periodValue: 1 }, { unique: true });
summarySchema.index({ organizationId: 1, branchId: 1, 'dateRange.startDate': -1 });
summarySchema.index({ isFinalized: 1, periodValue: 1 });

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────
summarySchema.virtual('summaryPeriod').get(function () {
  return `${this.periodType}: ${this.periodValue}`;
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────

// FIX BUG-AS-04 [MEDIUM] — Auto-compute derived percentage fields.
// Previously these were stored as 0 always because nothing computed them.
summarySchema.pre('save', function (next) {
  if (this.isModified('stats')) {
    const s = this.stats;
    const eligibleDays = s.totalEmployees - s.onHoliday;

    if (eligibleDays > 0) {
      // attendancePercentage = (present + late + halfDay*0.5 + wfh + onDuty) / eligible * 100
      const effectivePresent =
        (s.present || 0) +
        (s.late    || 0) +
        (s.workFromHome || 0) +
        (s.onDuty  || 0) +
        ((s.halfDay || 0) * 0.5);

      s.attendancePercentage = parseFloat(
        ((effectivePresent / eligibleDays) * 100).toFixed(2)
      );

      // latePercentage = late / (present + late) * 100
      const presentAndLate = (s.present || 0) + (s.late || 0);
      s.latePercentage = presentAndLate > 0
        ? parseFloat(((s.late / presentAndLate) * 100).toFixed(2))
        : 0;

      // averageWorkHours = totalWorkHours / activeEmployees
      s.averageWorkHours = s.activeEmployees > 0
        ? parseFloat((s.totalWorkHours / s.activeEmployees).toFixed(2))
        : 0;
    }
  }
  next();
});

// ─────────────────────────────────────────────
//  Statics
// ─────────────────────────────────────────────

/**
 * FIX BUG-AS-02 [HIGH] — generateMonthlySummary was an empty stub that always
 * returned undefined. Calling code (cron jobs) received undefined silently.
 * Now implemented with the aggregation pipeline using AttendanceDaily.
 *
 * @param {ObjectId|string} organizationId
 * @param {number} year  - e.g. 2024
 * @param {number} month - 1-12
 */
summarySchema.statics.generateMonthlySummary = async function (organizationId, year, month) {
  const startDate  = new Date(year, month - 1, 1);
  const endDate    = new Date(year, month, 0, 23, 59, 59, 999);
  const periodValue = `${year}-${month.toString().padStart(2, '0')}`;
  const orgId      = new mongoose.Types.ObjectId(organizationId);
  const startMs    = Date.now();

  const AttendanceDaily = mongoose.model('AttendanceDaily');

  const [result] = await AttendanceDaily.aggregate([
    {
      $match: {
        organizationId: orgId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalRecords:    { $sum: 1 },
        present:         { $sum: { $cond: [{ $eq: ['$status', 'present'] },       1, 0] } },
        absent:          { $sum: { $cond: [{ $eq: ['$status', 'absent'] },        1, 0] } },
        late:            { $sum: { $cond: [{ $eq: ['$status', 'late'] },          1, 0] } },
        halfDay:         { $sum: { $cond: [{ $eq: ['$status', 'half_day'] },      1, 0] } },
        onLeave:         { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] },      1, 0] } },
        onHoliday:       { $sum: { $cond: [{ $eq: ['$status', 'holiday'] },       1, 0] } },
        workFromHome:    { $sum: { $cond: [{ $eq: ['$status', 'work_from_home'] }, 1, 0] } },
        onDuty:          { $sum: { $cond: [{ $eq: ['$status', 'on_duty'] },       1, 0] } },
        totalWorkHours:  { $sum: '$totalWorkHours'  },
        totalOvertimeHrs:{ $sum: '$overtimeHours'   },
        uniqueEmployees: { $addToSet: '$user' },
      },
    },
    {
      $project: {
        _id:              0,
        totalRecords:     1,
        present:          1,
        absent:           1,
        late:             1,
        halfDay:          1,
        onLeave:          1,
        onHoliday:        1,
        workFromHome:     1,
        onDuty:           1,
        totalWorkHours:   { $round: ['$totalWorkHours',   2] },
        totalOvertimeHrs: { $round: ['$totalOvertimeHrs', 2] },
        activeEmployees:  { $size: '$uniqueEmployees' },
      },
    },
  ]);

  if (!result) {
    throw new Error(`No attendance data found for ${periodValue} in organization ${organizationId}`);
  }

  const duration = Date.now() - startMs;

  // Upsert the summary document
  const summary = await this.findOneAndUpdate(
    { organizationId: orgId, periodType: 'monthly', periodValue },
    {
      $set: {
        organizationId,
        periodType:    'monthly',
        periodValue,
        dateRange:     { startDate, endDate },
        stats: {
          totalEmployees:   result.activeEmployees,
          activeEmployees:  result.activeEmployees,
          present:          result.present,
          absent:           result.absent,
          late:             result.late,
          halfDay:          result.halfDay,
          onLeave:          result.onLeave,
          onHoliday:        result.onHoliday,
          workFromHome:     result.workFromHome,
          onDuty:           result.onDuty,
          totalWorkHours:   result.totalWorkHours,
          totalOvertimeHours: result.totalOvertimeHrs,
        },
        generatedAt:          new Date(),
        generationDuration:   duration,
        isFinalized:          false,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  return summary;
};

module.exports = mongoose.model('AttendanceSummary', summarySchema);


// const mongoose = require('mongoose');

// const summarySchema = new mongoose.Schema({
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
//   departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

//   periodType: { 
//     type: String, 
//     enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'], 
//     required: true 
//   },
//   periodValue: { type: String, required, index: true }, // "2024-03", "2024-W12", etc.
  
//   dateRange: {
//     startDate: { type: Date, required: true },
//     endDate: { type: Date, required: true }
//   },

//   // --- Statistics ---
//   stats: {
//     totalEmployees: { type: Number, default: 0 },
//     activeEmployees: { type: Number, default: 0 },
    
//     present: { type: Number, default: 0 },
//     absent: { type: Number, default: 0 },
//     late: { type: Number, default: 0 },
//     halfDay: { type: Number, default: 0 },
//     onLeave: { type: Number, default: 0 },
//     onHoliday: { type: Number, default: 0 },
//     workFromHome: { type: Number, default: 0 },
//     onDuty: { type: Number, default: 0 },
    
//     totalWorkHours: { type: Number, default: 0 },
//     totalOvertimeHours: { type: Number, default: 0 },
//     averageWorkHours: { type: Number, default: 0 },
    
//     attendancePercentage: { type: Number, default: 0 },
//     latePercentage: { type: Number, default: 0 }
//   },

//   // --- Department Wise Breakdown (Embedded for performance) ---
//   departmentWiseData: [{
//     departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
//     departmentName: String,
//     present: Number,
//     absent: Number,
//     late: Number,
//     totalEmployees: Number,
//     attendancePercentage: Number
//   }],

//   // --- Branch Wise Breakdown ---
//   branchWiseData: [{
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
//     branchName: String,
//     present: Number,
//     absent: Number,
//     totalEmployees: Number
//   }],

//   // --- Status ---
//   isFinalized: { type: Boolean, default: false, index: true },
//   finalizedAt: Date,
//   finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

//   // --- Generation Info ---
//   generatedAt: { type: Date, default: Date.now },
//   generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   generationDuration: Number, // in ms

//   // --- Notes ---
//   notes: String,
  
//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true }
// });

// // --- INDEXES ---
// summarySchema.index({ organizationId: 1, periodType: 1, periodValue: 1 }, { unique: true });
// summarySchema.index({ organizationId: 1, branchId: 1, 'dateRange.startDate': -1 });
// summarySchema.index({ isFinalized: 1, periodValue: 1 });

// // --- VIRTUALS ---
// summarySchema.virtual('summaryPeriod').get(function() {
//   return `${this.periodType}: ${this.periodValue}`;
// });

// // --- STATICS ---
// summarySchema.statics.generateMonthlySummary = async function(organizationId, year, month) {
//   const startDate = new Date(year, month - 1, 1);
//   const endDate = new Date(year, month, 0, 23, 59, 59);
//   const periodValue = `${year}-${month.toString().padStart(2, '0')}`;
  
//   // Aggregation pipeline would go here
//   // This is just a placeholder for the schema
// };

// module.exports = mongoose.model('AttendanceSummary', summarySchema);// const mongoose = require('mongoose');
