const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Holiday name is required'],
    trim: true,
    maxlength: 100
  },
  
  // Date Information
  date: { 
    type: String, // YYYY-MM-DD
    required: [true, 'Date is required'],
    index: true 
  },
  year: { type: Number, index: true }, // Derived from date for easy filtering
  
  // Organization Scope
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true,
    index: true 
  },
  
  // Branch Specificity
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch',
    index: true 
  },
  
  // Department Specificity
  department: String,
  
  // Holiday Details
  description: {
    type: String,
    maxlength: 500
  },
  longDescription: String,
  
  // Holiday Type
  type: {
    type: String,
    enum: ['national', 'state', 'regional', 'company', 'optional', 'religious'],
    default: 'national'
  },
  
  // Flags
  isOptional: { 
    type: Boolean, 
    default: false 
  }, // Restricted Holiday
  isRecurring: { 
    type: Boolean, 
    default: false 
  }, // Repeats every year
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  // Compensation Rules
  compensationRule: {
    type: String,
    enum: ['double_pay', 'comp_off', 'extra_leave', 'none'],
    default: 'none'
  },
  workingRule: {
    type: String,
    enum: ['no_work', 'optional_work', 'mandatory_work'],
    default: 'no_work'
  },
  
  // Metadata
  country: String,
  state: String,
  religion: String,
  icon: String,
  colorCode: String,
  
  // Audit
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  updatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware
holidaySchema.pre('save', function(next) {
  // Extract year from date for easy filtering
  if (this.date) {
    this.year = parseInt(this.date.split('-')[0]);
  }
  
  next();
});

// Compound indexes for unique constraints
holidaySchema.index({ 
  organizationId: 1, 
  branchId: 1, 
  date: 1 
}, { 
  unique: true,
  partialFilterExpression: { 
    $or: [
      { branchId: { $exists: true } },
      { branchId: null }
    ]
  }
});

// Indexes for efficient querying
holidaySchema.index({ organizationId: 1, year: 1 });
holidaySchema.index({ organizationId: 1, type: 1, date: 1 });
holidaySchema.index({ organizationId: 1, isOptional: 1, date: 1 });

// Virtual for formatted date
holidaySchema.virtual('formattedDate').get(function() {
  if (!this.date) return '';
  const [year, month, day] = this.date.split('-');
  return `${day}-${month}-${year}`;
});

// Static method to check if a date is holiday
holidaySchema.statics.isHoliday = async function(organizationId, date, branchId = null) {
  const query = {
    organizationId,
    date,
    isActive: true,
    $or: [
      { branchId: null }, // Organization-wide
      { branchId: branchId } // Branch-specific
    ]
  };
  
  return await this.findOne(query);
};

// Static method to get holidays for a month
holidaySchema.statics.getMonthlyHolidays = async function(organizationId, year, month, branchId = null) {
  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
  
  const query = {
    organizationId,
    date: { $gte: startDate, $lte: endDate },
    isActive: true,
    $or: [
      { branchId: null },
      { branchId: branchId }
    ]
  };
  
  return await this.find(query).sort({ date: 1 });
};

module.exports = mongoose.model('Holiday', holidaySchema);