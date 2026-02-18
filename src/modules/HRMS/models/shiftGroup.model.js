const mongoose = require('mongoose');

const shiftGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: String,
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

  // --- Shifts in rotation ---
  shifts: [{
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
    sequence: Number,
    color: String // For UI
  }],

  // --- Rotation Rules ---
  rotationType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    default: 'weekly'
  },
  
  rotationPattern: [{
    dayOffset: Number, // 0 = first day
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' }
  }],

  // --- Applicability ---
  applicableDepartments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  applicableDesignations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],

  // --- Status ---
  isActive: { type: Boolean, default: true },
  effectiveFrom: Date,
  effectiveTo: Date,

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

shiftGroupSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('ShiftGroup', shiftGroupSchema);