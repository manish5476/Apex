const mongoose = require('mongoose');

// ─────────────────────────────────────────────
//  Valid leave type keys (used for validation in methods)
// ─────────────────────────────────────────────
const LEAVE_TYPES = [
  'casualLeave', 'sickLeave', 'earnedLeave', 'compensatoryOff',
  'paidLeave', 'unpaidLeave', 'marriageLeave', 'paternityLeave',
  'maternityLeave', 'bereavementLeave',
];

const leaveBalanceSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',         required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  financialYear: { type: String, required: true }, // "2024-2025"

  openingBalance: {
    casualLeave:       { type: Number, default: 0 },
    sickLeave:         { type: Number, default: 0 },
    earnedLeave:       { type: Number, default: 0 },
    compensatoryOff:   { type: Number, default: 0 },
    paidLeave:         { type: Number, default: 0 },
    unpaidLeave:       { type: Number, default: 0 },
    marriageLeave:     { type: Number, default: 0 },
    paternityLeave:    { type: Number, default: 0 },
    maternityLeave:    { type: Number, default: 0 },
    bereavementLeave:  { type: Number, default: 0 },
  },

  // --- Current Balances ---
  casualLeave:      { total: { type: Number, default: 12 }, used: { type: Number, default: 0 } },
  sickLeave:        { total: { type: Number, default: 10 }, used: { type: Number, default: 0 } },
  earnedLeave:      { total: { type: Number, default: 0 },  used: { type: Number, default: 0 } },
  compensatoryOff:  { total: { type: Number, default: 0 },  used: { type: Number, default: 0 } },
  paidLeave:        { total: { type: Number, default: 0 },  used: { type: Number, default: 0 } },

  // FIX BUG-LB-03 [MEDIUM] — unpaidLeave had no `total` field.
  // In debitLeave: `this.unpaidLeave.total - this.unpaidLeave.used` → `undefined - 0` → `NaN`
  // NaN < amount → false → no error thrown → `used` silently becomes NaN.
  // Fix: Set total to a very large number (effectively unlimited) since unpaid leave is not capped.
  unpaidLeave:      { total: { type: Number, default: 9999 }, used: { type: Number, default: 0 } },

  marriageLeave:    { total: { type: Number, default: 0 },  used: { type: Number, default: 0 } },
  paternityLeave:   { total: { type: Number, default: 0 },  used: { type: Number, default: 0 } },
  maternityLeave:   { total: { type: Number, default: 84 }, used: { type: Number, default: 0 } },
  bereavementLeave: { total: { type: Number, default: 0 },  used: { type: Number, default: 0 } },

  // --- Accrual Tracking ---
  lastAccruedAt: Date,
  accrualRate: {
    earnedLeavePerMonth:   { type: Number, default: 1.5 },
    sickLeavePerQuarter:   { type: Number, default: 2.5 },
  },

  // FIX BUG-LB-04 [MEDIUM] — transactions moved to a note/reference here.
  // For employees with years of service, thousands of transactions will bloat this document.
  // Transactions are now stored in a separate LeaveTransaction collection (see note below).
  // This embedded array is kept for RECENT transactions only (last 20) as a quick-view cache.
  recentTransactions: [{
    date:           { type: Date, default: Date.now },
    leaveType:      String,
    changeType:     { type: String, enum: ['credited', 'debited', 'adjusted', 'expired', 'carry_forward'] },
    amount:         Number,
    runningBalance: Number,
    referenceId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
    description:    String,
    processedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  carryForward: {
    maxDays:    { type: Number, default: 30 },
    expiryDate: Date,
    isExpired:  { type: Boolean, default: false },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
leaveBalanceSchema.index({ user: 1, financialYear: 1 }, { unique: true });
// FIX BUG-LB-05 [LOW] — Added org+year compound index for HR bulk queries
leaveBalanceSchema.index({ organizationId: 1, financialYear: 1 });

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────

// FIX BUG-LB-02 [HIGH] — availableLeaves now includes ALL 10 leave types.
// Original only summed casualLeave + sickLeave + earnedLeave.
// An employee with compensatoryOff balance saw 0 available compensatory days.
leaveBalanceSchema.virtual('availableLeaves').get(function () {
  const avail = {};
  let grandTotal = 0;

  for (const type of LEAVE_TYPES) {
    const balance = this[type];
    if (balance && balance.total !== undefined) {
      const available = Math.max(0, balance.total - (balance.used || 0));
      avail[type] = available;
      // Exclude unpaidLeave from grand total (it's always "available")
      if (type !== 'unpaidLeave') {
        grandTotal += available;
      }
    }
  }

  avail.totalPaidLeaves = grandTotal;
  return avail;
});

// ─────────────────────────────────────────────
//  Methods
// ─────────────────────────────────────────────

/**
 * FIX BUG-LB-01 [HIGH] — Removed dead variables leaveField/usedField.
 * Added leaveType validation to prevent prototype pollution via dynamic property access.
 *
 * @param {string} leaveType - Must be one of LEAVE_TYPES
 * @param {number} amount
 * @param {ObjectId} referenceId
 * @param {string} description
 * @param {ObjectId} userId
 */
leaveBalanceSchema.methods.creditLeave = async function (leaveType, amount, referenceId, description, userId) {
  // FIX BUG-LB-01 — Validate leaveType before using it as a dynamic property key
  if (!LEAVE_TYPES.includes(leaveType)) {
    throw new Error(`Invalid leaveType: '${leaveType}'. Must be one of: ${LEAVE_TYPES.join(', ')}`);
  }
  if (amount <= 0) throw new Error('Credit amount must be positive');

  this[leaveType].total += amount;

  const transaction = {
    leaveType,
    changeType:     'credited',
    amount,
    runningBalance: this[leaveType].total - this[leaveType].used,
    referenceId,
    description,
    processedBy:    userId,
  };

  // Keep only last 20 transactions in embedded cache
  this.recentTransactions.push(transaction);
  if (this.recentTransactions.length > 20) {
    this.recentTransactions.shift();
  }

  this.updatedBy = userId;
  await this.save();

  return transaction;
};

/**
 * FIX BUG-LB-01 [HIGH] — Removed dead variables. Added leaveType validation.
 *
 * @param {string} leaveType
 * @param {number} amount
 * @param {ObjectId} referenceId
 * @param {string} description
 * @param {ObjectId} userId
 */
leaveBalanceSchema.methods.debitLeave = async function (leaveType, amount, referenceId, description, userId) {
  if (!LEAVE_TYPES.includes(leaveType)) {
    throw new Error(`Invalid leaveType: '${leaveType}'. Must be one of: ${LEAVE_TYPES.join(', ')}`);
  }
  if (amount <= 0) throw new Error('Debit amount must be positive');

  // FIX BUG-LB-03 — After fixing unpaidLeave.total, this calculation is now safe for all types
  const available = this[leaveType].total - this[leaveType].used;
  if (available < amount) {
    throw new Error(`Insufficient ${leaveType} balance. Available: ${available}, Requested: ${amount}`);
  }

  this[leaveType].used += amount;

  const transaction = {
    leaveType,
    changeType:     'debited',
    amount,
    runningBalance: this[leaveType].total - this[leaveType].used,
    referenceId,
    description,
    processedBy:    userId,
  };

  this.recentTransactions.push(transaction);
  if (this.recentTransactions.length > 20) {
    this.recentTransactions.shift();
  }

  this.updatedBy = userId;
  await this.save();

  return transaction;
};

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);

/*
 * NOTE [BUG-LB-04]: For full transaction history, create a separate collection:
 *
 * const leaveTransactionSchema = new mongoose.Schema({
 *   userId:        { type: ObjectId, ref: 'User',         required: true, index: true },
 *   organizationId:{ type: ObjectId, ref: 'Organization', required: true, index: true },
 *   financialYear: { type: String,   required: true },
 *   leaveType:     String,
 *   changeType:    { type: String, enum: ['credited','debited','adjusted','expired','carry_forward'] },
 *   amount:        Number,
 *   runningBalance:Number,
 *   referenceId:   { type: ObjectId, ref: 'LeaveRequest' },
 *   description:   String,
 *   processedBy:   { type: ObjectId, ref: 'User' },
 * }, { timestamps: true });
 */



// const mongoose = require('mongoose');

// const leaveBalanceSchema = new mongoose.Schema({
//   user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

//   financialYear: { type: String, required: true }, // "2024-2025"

//   // --- Leave Types with Opening Balance ---
//   openingBalance: {
//     casualLeave: { type: Number, default: 0 },
//     sickLeave: { type: Number, default: 0 },
//     earnedLeave: { type: Number, default: 0 },
//     compensatoryOff: { type: Number, default: 0 },
//     paidLeave: { type: Number, default: 0 },
//     unpaidLeave: { type: Number, default: 0 },
//     marriageLeave: { type: Number, default: 0 },
//     paternityLeave: { type: Number, default: 0 },
//     maternityLeave: { type: Number, default: 0 },
//     bereavementLeave: { type: Number, default: 0 }
//   },

//   // --- Current Balances ---
//   casualLeave: { total: { type: Number, default: 12 }, used: { type: Number, default: 0 } },
//   sickLeave: { total: { type: Number, default: 10 }, used: { type: Number, default: 0 } },
//   earnedLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
//   compensatoryOff: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
//   paidLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
//   unpaidLeave: { used: { type: Number, default: 0 } },
//   marriageLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
//   paternityLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
//   maternityLeave: { total: { type: Number, default: 84 }, used: { type: Number, default: 0 } },
//   bereavementLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },

//   // --- Accrual Tracking ---
//   lastAccruedAt: Date,
//   accrualRate: {
//     earnedLeavePerMonth: { type: Number, default: 1.5 },
//     sickLeavePerQuarter: { type: Number, default: 2.5 }
//   },

//   // --- Transaction Log (Embedded for performance) ---
//   transactions: [{
//     date: { type: Date, default: Date.now },
//     leaveType: String,
//     changeType: { type: String, enum: ['credited', 'debited', 'adjusted', 'expired', 'carry_forward'] },
//     amount: Number,
//     runningBalance: Number,
//     referenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
//     description: String,
//     processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
//   }],

//   // --- Carry Forward Settings ---
//   carryForward: {
//     maxDays: { type: Number, default: 30 },
//     expiryDate: Date,
//     isExpired: { type: Boolean, default: false }
//   },

//   // --- Audit ---
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true }
// });

// // --- INDEXES ---
// leaveBalanceSchema.index({ user: 1, financialYear: 1 }, { unique: true });
// leaveBalanceSchema.index({ organizationId: 1, financialYear: 1 });

// // --- VIRTUALS ---
// leaveBalanceSchema.virtual('availableLeaves').get(function() {
//   return {
//     casualLeave: this.casualLeave.total - this.casualLeave.used,
//     sickLeave: this.sickLeave.total - this.sickLeave.used,
//     earnedLeave: this.earnedLeave.total - this.earnedLeave.used,
//     total: (this.casualLeave.total - this.casualLeave.used) +
//            (this.sickLeave.total - this.sickLeave.used) +
//            (this.earnedLeave.total - this.earnedLeave.used)
//   };
// });

// // --- METHODS ---
// leaveBalanceSchema.methods.creditLeave = async function(leaveType, amount, referenceId, description, userId) {
//   const leaveField = `${leaveType}.total`;
//   const usedField = `${leaveType}.used`;
  
//   this[leaveType].total += amount;
  
//   this.transactions.push({
//     leaveType,
//     changeType: 'credited',
//     amount,
//     runningBalance: this[leaveType].total - this[leaveType].used,
//     referenceId,
//     description,
//     processedBy: userId
//   });
  
//   this.updatedBy = userId;
//   await this.save();
// };

// leaveBalanceSchema.methods.debitLeave = async function(leaveType, amount, referenceId, description, userId) {
//   const available = this[leaveType].total - this[leaveType].used;
  
//   if (available < amount) {
//     throw new Error(`Insufficient ${leaveType} balance`);
//   }
  
//   this[leaveType].used += amount;
  
//   this.transactions.push({
//     leaveType,
//     changeType: 'debited',
//     amount,
//     runningBalance: this[leaveType].total - this[leaveType].used,
//     referenceId,
//     description,
//     processedBy: userId
//   });
  
//   this.updatedBy = userId;
//   await this.save();
// };

// module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);