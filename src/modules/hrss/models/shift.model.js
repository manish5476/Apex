const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Shift name is required'],
    trim: true,
    maxlength: 50 
  },
  code: { 
    type: String, 
    uppercase: true,
    trim: true,
    maxlength: 10 
  },
  
  // Organization Scope
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true,
    index: true 
  },
  
  // Shift Timings
  startTime: { 
    type: String, // HH:mm format
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Invalid time format. Use HH:mm'
    }
  },
  endTime: { 
    type: String, // HH:mm format
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Invalid time format. Use HH:mm'
    }
  },
  
  // Break Configuration
  breaks: [{
    name: String,
    startTime: String, // HH:mm
    endTime: String, // HH:mm
    duration: Number, // in minutes
    isPaid: { type: Boolean, default: false }
  }],
  totalBreakMinutes: { type: Number, default: 60 },
  
  // Shift Rules
  gracePeriodMins: { 
    type: Number, 
    default: 15,
    min: 0,
    max: 120 
  },
  lateThresholdMins: { 
    type: Number, 
    default: 30,
    min: 0,
    max: 240 
  },
  earlyDepartureThresholdMins: { 
    type: Number, 
    default: 30,
    min: 0,
    max: 240 
  },
  
  // Attendance Calculation
  halfDayThresholdHrs: { 
    type: Number, 
    default: 4,
    min: 1,
    max: 8 
  },
  minFullDayHrs: { 
    type: Number, 
    default: 8,
    min: 4,
    max: 12 
  },
  
  // Shift Type
  isNightShift: { type: Boolean, default: false },
  nightShiftAllowance: { type: Number, default: 0 },
  
  // Weekly Configuration
  weeklyOffs: [{ 
    type: Number, 
    enum: [0, 1, 2, 3, 4, 5, 6], // 0=Sunday, 6=Saturday
    default: [0] 
  }],
  workingDays: [{ 
    type: Number, 
    enum: [0, 1, 2, 3, 4, 5, 6] 
  }],
  
  // Overtime Rules
  overtimeRules: {
    dailyThreshold: { type: Number, default: 9 }, // Hours after which OT starts
    weeklyThreshold: { type: Number, default: 48 }, // Weekly hours limit
    multiplier: { type: Number, default: 1.5 }, // OT rate multiplier
    nightMultiplier: { type: Number, default: 2.0 }, // Night OT multiplier
  },
  
  // Geo-fencing
  locationRestrictions: {
    enabled: { type: Boolean, default: false },
    radius: { type: Number, default: 100 }, // meters
    locations: [{
      name: String,
      coordinates: {
        type: { type: String, default: 'Point' },
        coordinates: [Number] // [longitude, latitude]
      },
      radius: Number
    }]
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  
  // Metadata
  description: String,
  colorCode: String,
  
  // Audit
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
shiftSchema.index({ organizationId: 1, name: 1 }, { unique: true });
shiftSchema.index({ organizationId: 1, isActive: 1 });
shiftSchema.index({ organizationId: 1, isDefault: 1 });

// Virtuals
shiftSchema.virtual('totalWorkHours').get(function() {
  const [startHour, startMinute] = this.startTime.split(':').map(Number);
  const [endHour, endMinute] = this.endTime.split(':').map(Number);
  
  let startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  
  // Handle night shift (end time next day)
  if (this.isNightShift && endTotal < startTotal) {
    endTotal += 24 * 60;
  }
  
  const totalMinutes = endTotal - startTotal - this.totalBreakMinutes;
  return (totalMinutes / 60).toFixed(2);
});

shiftSchema.virtual('formattedSchedule').get(function() {
  return `${this.startTime} - ${this.endTime}`;
});

// Pre-save validation
shiftSchema.pre('save', function(next) {
  // Set working days if not provided
  if (!this.workingDays || this.workingDays.length === 0) {
    this.workingDays = [1, 2, 3, 4, 5]; // Monday to Friday by default
  }
  
  // Calculate total break minutes
  if (this.breaks && this.breaks.length > 0) {
    this.totalBreakMinutes = this.breaks.reduce((total, breakItem) => {
      return total + (breakItem.duration || 0);
    }, 0);
  }
  
  // Validate full day > half day
  if (this.minFullDayHrs <= this.halfDayThresholdHrs) {
    return next(new Error('Full day hours must be greater than half day threshold'));
  }
  
  // Validate time order for non-night shifts
  if (!this.isNightShift) {
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    
    if (endTotal <= startTotal) {
      return next(new Error('End time must be after start time for non-night shifts'));
    }
  }
  
  next();
});

// Instance method to check if day is working day
shiftSchema.methods.isWorkingDay = function(dayOfWeek) {
  return this.workingDays.includes(dayOfWeek);
};

// Instance method to check if day is weekly off
shiftSchema.methods.isWeeklyOff = function(dayOfWeek) {
  return this.weeklyOffs.includes(dayOfWeek);
};

// Static method to get default shift
shiftSchema.statics.getDefaultShift = async function(organizationId) {
  return await this.findOne({ 
    organizationId, 
    isDefault: true, 
    isActive: true 
  });
};

module.exports = mongoose.model('Shift', shiftSchema);