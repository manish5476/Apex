const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  financialYear: { type: String, required: true }, // "2024-2025"

  // --- Leave Types with Opening Balance ---
  openingBalance: {
    casualLeave: { type: Number, default: 0 },
    sickLeave: { type: Number, default: 0 },
    earnedLeave: { type: Number, default: 0 },
    compensatoryOff: { type: Number, default: 0 },
    paidLeave: { type: Number, default: 0 },
    unpaidLeave: { type: Number, default: 0 },
    marriageLeave: { type: Number, default: 0 },
    paternityLeave: { type: Number, default: 0 },
    maternityLeave: { type: Number, default: 0 },
    bereavementLeave: { type: Number, default: 0 }
  },

  // --- Current Balances ---
  casualLeave: { total: { type: Number, default: 12 }, used: { type: Number, default: 0 } },
  sickLeave: { total: { type: Number, default: 10 }, used: { type: Number, default: 0 } },
  earnedLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
  compensatoryOff: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
  paidLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
  unpaidLeave: { used: { type: Number, default: 0 } },
  marriageLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
  paternityLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },
  maternityLeave: { total: { type: Number, default: 84 }, used: { type: Number, default: 0 } },
  bereavementLeave: { total: { type: Number, default: 0 }, used: { type: Number, default: 0 } },

  // --- Accrual Tracking ---
  lastAccruedAt: Date,
  accrualRate: {
    earnedLeavePerMonth: { type: Number, default: 1.5 },
    sickLeavePerQuarter: { type: Number, default: 2.5 }
  },

  // --- Transaction Log (Embedded for performance) ---
  transactions: [{
    date: { type: Date, default: Date.now },
    leaveType: String,
    changeType: { type: String, enum: ['credited', 'debited', 'adjusted', 'expired', 'carry_forward'] },
    amount: Number,
    runningBalance: Number,
    referenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
    description: String,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  // --- Carry Forward Settings ---
  carryForward: {
    maxDays: { type: Number, default: 30 },
    expiryDate: Date,
    isExpired: { type: Boolean, default: false }
  },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { 
  timestamps: true,
  toJSON: { virtuals: true }
});

// --- INDEXES ---
leaveBalanceSchema.index({ user: 1, financialYear: 1 }, { unique: true });
leaveBalanceSchema.index({ organizationId: 1, financialYear: 1 });

// --- VIRTUALS ---
leaveBalanceSchema.virtual('availableLeaves').get(function() {
  return {
    casualLeave: this.casualLeave.total - this.casualLeave.used,
    sickLeave: this.sickLeave.total - this.sickLeave.used,
    earnedLeave: this.earnedLeave.total - this.earnedLeave.used,
    total: (this.casualLeave.total - this.casualLeave.used) +
           (this.sickLeave.total - this.sickLeave.used) +
           (this.earnedLeave.total - this.earnedLeave.used)
  };
});

// --- METHODS ---
leaveBalanceSchema.methods.creditLeave = async function(leaveType, amount, referenceId, description, userId) {
  const leaveField = `${leaveType}.total`;
  const usedField = `${leaveType}.used`;
  
  this[leaveType].total += amount;
  
  this.transactions.push({
    leaveType,
    changeType: 'credited',
    amount,
    runningBalance: this[leaveType].total - this[leaveType].used,
    referenceId,
    description,
    processedBy: userId
  });
  
  this.updatedBy = userId;
  await this.save();
};

leaveBalanceSchema.methods.debitLeave = async function(leaveType, amount, referenceId, description, userId) {
  const available = this[leaveType].total - this[leaveType].used;
  
  if (available < amount) {
    throw new Error(`Insufficient ${leaveType} balance`);
  }
  
  this[leaveType].used += amount;
  
  this.transactions.push({
    leaveType,
    changeType: 'debited',
    amount,
    runningBalance: this[leaveType].total - this[leaveType].used,
    referenceId,
    description,
    processedBy: userId
  });
  
  this.updatedBy = userId;
  await this.save();
};

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);