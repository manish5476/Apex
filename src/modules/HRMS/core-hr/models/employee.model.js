const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema({
  accountName: { type: String, trim: true },
  accountNumber: { type: String, trim: true, select: false },
  ifscCode: { type: String, trim: true, uppercase: true, select: false },
  bankName: { type: String, trim: true },
  panCard: { type: String, trim: true, uppercase: true, select: false },
  uanNumber: { type: String, trim: true },
  esiNumber: { type: String, trim: true },
  pfNumber: { type: String, trim: true },
}, { _id: false });

const employeeSchema = new mongoose.Schema({
  // Identity link to User (optional to support non-login employees and pre-onboarding)
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  
  // Basic contact fields (canonical when user is not linked or for HR directory reference)
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  officialEmail: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },

  employeeId: { type: String, trim: true, uppercase: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
  designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', index: true },
  reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  employmentType: {
    type: String,
    enum: ['permanent', 'contract', 'intern', 'probation', 'consultant'],
    default: 'permanent',
    index: true,
  },
  workMode: { type: String, enum: ['office', 'remote', 'hybrid', 'field'], default: 'office' },
  status: {
    type: String,
    enum: ['active', 'probation', 'notice_period', 'relieved', 'terminated', 'inactive'],
    default: 'active',
    index: true,
  },

  dateOfJoining: { type: Date, index: true },
  probationEndDate: Date,
  confirmationDate: Date,
  dateOfExit: Date,
  exitReason: { type: String, trim: true },
  personal: {
    dateOfBirth: Date,
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed'] },
    bloodGroup: String,
    secondaryPhone: { type: String, trim: true },
  },
  emergencyContacts: [{
    name: { type: String, trim: true },
    relationship: { type: String, trim: true },
    phone: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
  }],

  attendanceConfig: {
    machineUserId: { type: String, trim: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    shiftGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftGroup' },
    isAttendanceEnabled: { type: Boolean, default: true },
    allowWebPunch: { type: Boolean, default: false },
    allowMobilePunch: { type: Boolean, default: true },
    enforceGeoFence: { type: Boolean, default: false },
    geoFenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeoFence' },
    geoFenceRadius: { type: Number, default: 100, min: 0 },
    biometricVerified: { type: Boolean, default: false },
  },

  compensation: {
    salaryStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure' },
    payCycle: { type: String, enum: ['monthly', 'weekly', 'daily'], default: 'monthly' },
    ctcAnnual: { type: Number, min: 0 },
    currency: { type: String, default: 'INR' },
    bankDetails: { type: bankDetailsSchema, select: false },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

employeeSchema.index(
  { organizationId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: 'string' } } }
);

// One User can only be linked to at most one Employee per organization
employeeSchema.index(
  { organizationId: 1, user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } }
);

employeeSchema.index({ organizationId: 1, branchId: 1, status: 1 });
employeeSchema.index({ organizationId: 1, departmentId: 1, status: 1 });
employeeSchema.index({ organizationId: 1, reportingManagerId: 1, status: 1 });

employeeSchema.virtual('serviceYears').get(function () {
  if (!this.dateOfJoining) return 0;
  const end = this.dateOfExit || new Date();
  return Math.max(0, Math.round(((end - this.dateOfJoining) / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10);
});

employeeSchema.virtual('displayName').get(function () {
  if (this.firstName || this.lastName) {
    return [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
  if (this.user && typeof this.user === 'object' && this.user.name) {
    return this.user.name;
  }
  return this.employeeId || 'Unnamed Employee';
});

employeeSchema.pre('validate', function (next) {
  if (this.dateOfExit && this.dateOfJoining && this.dateOfExit < this.dateOfJoining) {
    return next(new Error('dateOfExit cannot be before dateOfJoining'));
  }
  if (this.reportingManagerId && this.user && this.reportingManagerId.toString() === this.user.toString()) {
    return next(new Error('Employee cannot report to their own user account'));
  }
  next();
});

module.exports = mongoose.model('Employee', employeeSchema);
