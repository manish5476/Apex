const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
//  ShiftGroup Model
// ═══════════════════════════════════════════════════════════

const shiftGroupSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  code:        { type: String, required: true, trim: true, uppercase: true },
  description: String,

  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

  shifts: [{
    shiftId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
    sequence: Number,
    color:    String,
  }],

  rotationType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    default: 'weekly',
  },

  rotationPattern: [{
    dayOffset: Number,
    shiftId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  }],

  applicableDepartments:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  applicableDesignations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],

  isActive:      { type: Boolean, default: true },
  effectiveFrom: Date,
  effectiveTo:   Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

shiftGroupSchema.index({ organizationId: 1, code: 1 }, { unique: true });

const ShiftGroup = mongoose.model('ShiftGroup', shiftGroupSchema);

module.exports = { ShiftGroup };




