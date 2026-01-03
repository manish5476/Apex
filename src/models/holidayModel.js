const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Holiday name is required (e.g., "Diwali")'],
    trim: true 
  },
  date: { 
    type: String, 
    required: [true, 'Date is required (YYYY-MM-DD)'],
    index: true 
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true 
  },
  // If null, applies to ALL branches. If set, applies ONLY to that branch.
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch' 
  },
  
  description: String,
  
  isOptional: { type: Boolean, default: false }, // For "Restricted Holidays" (RH)
  
}, { timestamps: true });

// Prevent duplicate holiday entries for the same date/branch
holidaySchema.index({ organizationId: 1, branchId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);
