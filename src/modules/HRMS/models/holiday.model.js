const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Holiday name is required'], trim: true },

  date: { type: Date, required: true, index: true },

  // year/month/day are derived from `date` in pre-save.
  // FIX BUG-HO-03 [MEDIUM] — These fields can drift if `date` is updated via
  // findOneAndUpdate without going through pre('save'). A pre('findOneAndUpdate')
  // hook is added below to keep them in sync.
  year:  { type: Number, required: true, index: true },
  month: { type: Number, min: 1, max: 12 },
  day:   { type: Number, min: 1, max: 31 },

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null }, // null = all branches

  description: String,

  holidayType: {
    type: String,
    enum: ['national', 'state', 'festival', 'company', 'restricted'],
    default: 'company',
  },

  isOptional: { type: Boolean, default: false },

  recurring: {
    isRecurring: { type: Boolean, default: false },
    frequency:   { type: String, enum: ['yearly', 'monthly'], default: 'yearly' },
    endYear:     Number,
  },

  applicableTo: {
    departments:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    employmentTypes: [{ type: String, enum: ['permanent', 'contract', 'intern', 'all'] }],
    allEmployees:    { type: Boolean, default: true },
  },

  isActive:    { type: Boolean, default: true },
  replacedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Holiday' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// FIX BUG-HO-01 [CRITICAL] — Original unique index was `{ organizationId, branchId, date }`.
// Problem: An org-wide holiday has branchId: null. A branch-specific holiday on the same date
// would have a different branchId but same organizationId+date — this is VALID and should be allowed.
// However, you also CANNOT have two org-wide holidays on the same date (both branchId: null).
//
// The fix uses a partial index for org-wide holidays (branchId is null) separately,
// and a standard index for branch-specific holidays.
// This allows: 1 org-wide + N branch-specific on same date, but not 2 org-wide.
holidaySchema.index(
  { organizationId: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { branchId: { $eq: null } },
    name: 'unique_org_wide_holiday_per_date',
  }
);
holidaySchema.index(
  { organizationId: 1, branchId: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { branchId: { $ne: null } },
    name: 'unique_branch_holiday_per_date',
  }
);

holidaySchema.index({ organizationId: 1, year: 1, month: 1 });
holidaySchema.index({ isOptional: 1, date: 1 });

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────

holidaySchema.pre('save', function (next) {
  if (this.date) {
    this.year  = this.date.getFullYear();
    this.month = this.date.getMonth() + 1;
    this.day   = this.date.getDate();
  }
  next();
});

// FIX BUG-HO-03 [MEDIUM] — Sync year/month/day when date is changed via findOneAndUpdate.
// Without this hook, bypassing pre('save') (which is common with patch endpoints)
// leaves year/month/day stale, breaking `getHolidaysForYear` queries.
holidaySchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  const newDate = update.$set?.date || update.date;
  if (newDate) {
    const d = new Date(newDate);
    this.setUpdate({
      ...update,
      $set: {
        ...update.$set,
        year:  d.getFullYear(),
        month: d.getMonth() + 1,
        day:   d.getDate(),
      },
    });
  }
  next();
});

// ─────────────────────────────────────────────
//  Statics
// ─────────────────────────────────────────────

/**
 * FIX BUG-HO-02 [HIGH] — Added `isActive: true` filter.
 * Original returned cancelled/inactive holidays in results, which would
 * incorrectly mark those days as holidays in attendance calculations.
 *
 * @param {ObjectId|string} organizationId
 * @param {number} year
 * @param {ObjectId|string|null} branchId
 */
holidaySchema.statics.getHolidaysForYear = async function (organizationId, year, branchId = null) {
  const query = {
    organizationId,
    year,
    isActive: true, // FIX: exclude deactivated/cancelled holidays
    $or: [
      { branchId },        // Branch-specific
      { branchId: null },  // Org-wide (applies to all branches)
    ],
  };
  return await this.find(query).sort({ date: 1 });
};

module.exports = mongoose.model('Holiday', holidaySchema);
// const mongoose = require('mongoose');

// const holidaySchema = new mongoose.Schema({
//   name: { type: String, required: [true, 'Holiday name is required'], trim: true },
  
//   date: { 
//     type: Date, 
//     required: true,
//     index: true 
//   },
  
//   year: { type: Number, required: true, index: true }, // For easy queries
//   month: { type: Number, min: 1, max: 12 },
//   day: { type: Number, min: 1, max: 31 },
  
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // null = all branches
  
//   description: String,
  
//   holidayType: {
//     type: String,
//     enum: ['national', 'state', 'festival', 'company', 'restricted'],
//     default: 'company'
//   },
  
//   isOptional: { type: Boolean, default: false },
  
//   recurring: {
//     isRecurring: { type: Boolean, default: false },
//     frequency: { type: String, enum: ['yearly', 'monthly'], default: 'yearly' },
//     endYear: Number
//   },
  
//   applicableTo: {
//     departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
//     employmentTypes: [{ 
//       type: String, 
//       enum: ['permanent', 'contract', 'intern', 'all'] 
//     }],
//     allEmployees: { type: Boolean, default: true }
//   },

//   // --- Status ---
//   isActive: { type: Boolean, default: true },
//   replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Holiday' }, // If swapped
  
//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { timestamps: true });

// // --- INDEXES ---
// holidaySchema.index({ organizationId: 1, branchId: 1, date: 1 }, { unique: true });
// holidaySchema.index({ organizationId: 1, year: 1, month: 1 });
// holidaySchema.index({ isOptional: 1, date: 1 });

// // --- MIDDLEWARE ---
// holidaySchema.pre('save', function(next) {
//   if (this.date) {
//     this.year = this.date.getFullYear();
//     this.month = this.date.getMonth() + 1;
//     this.day = this.date.getDate();
//   }
//   next();
// });

// // --- STATICS ---
// holidaySchema.statics.getHolidaysForYear = async function(organizationId, year, branchId = null) {
//   const query = {
//     organizationId,
//     year,
//     $or: [
//       { branchId: branchId },
//       { branchId: null }
//     ]
//   };
//   return await this.find(query).sort({ date: 1 });
// };

// module.exports = mongoose.model('Holiday', holidaySchema);
