const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Holiday name is required'], trim: true },
  
  date: { 
    type: Date, 
    required: true,
    index: true 
  },
  
  year: { type: Number, required: true, index: true }, // For easy queries
  month: { type: Number, min: 1, max: 12 },
  day: { type: Number, min: 1, max: 31 },
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // null = all branches
  
  description: String,
  
  holidayType: {
    type: String,
    enum: ['national', 'state', 'festival', 'company', 'restricted'],
    default: 'company'
  },
  
  isOptional: { type: Boolean, default: false },
  
  recurring: {
    isRecurring: { type: Boolean, default: false },
    frequency: { type: String, enum: ['yearly', 'monthly'], default: 'yearly' },
    endYear: Number
  },
  
  applicableTo: {
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    employmentTypes: [{ 
      type: String, 
      enum: ['permanent', 'contract', 'intern', 'all'] 
    }],
    allEmployees: { type: Boolean, default: true }
  },

  // --- Status ---
  isActive: { type: Boolean, default: true },
  replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Holiday' }, // If swapped
  
  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

// --- INDEXES ---
holidaySchema.index({ organizationId: 1, branchId: 1, date: 1 }, { unique: true });
holidaySchema.index({ organizationId: 1, year: 1, month: 1 });
holidaySchema.index({ isOptional: 1, date: 1 });

// --- MIDDLEWARE ---
holidaySchema.pre('save', function(next) {
  if (this.date) {
    this.year = this.date.getFullYear();
    this.month = this.date.getMonth() + 1;
    this.day = this.date.getDate();
  }
  next();
});

// --- STATICS ---
holidaySchema.statics.getHolidaysForYear = async function(organizationId, year, branchId = null) {
  const query = {
    organizationId,
    year,
    $or: [
      { branchId: branchId },
      { branchId: null }
    ]
  };
  return await this.find(query).sort({ date: 1 });
};

module.exports = mongoose.model('Holiday', holidaySchema);
