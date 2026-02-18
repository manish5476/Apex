const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // --- Auth & Identity ---
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
  password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
  avatar: { type: String, default: null },
  phone: { type: String, trim: true, index: true },
  
  // --- Multi-Tenancy & Access ---
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },

  // --- Permissions Flags ---
  isOwner: { type: Boolean, default: false },
  isSuperAdmin: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'inactive', 'suspended'], 
    default: 'pending', 
    index: true 
  },
  isActive: { type: Boolean, default: true },

  // --- HRMS Specific Profile ---
  employeeProfile: {
    employeeId: { type: String, trim: true, sparse: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    dateOfJoining: { type: Date, index: true },
    dateOfBirth: Date,
    reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    employmentType: { 
      type: String, 
      enum: ['permanent', 'contract', 'intern', 'probation', 'consultant'],
      default: 'permanent'
    },
    workLocation: String, // Remote, Office, Hybrid
    // Bank Details (secured)
    bankDetails: {
      type: new mongoose.Schema({
        accountName: String,
        accountNumber: { type: String, select: false },
        ifscCode: { type: String, select: false },
        bankName: String,
        panCard: { type: String, select: false },
        uanNumber: String // For PF
      }, { _id: false }), 
      select: false 
    }
  },
  
  upiId: { type: String, sparse: true },

  // --- Attendance Configuration ---
  attendanceConfig: {
    machineUserId: { type: String, sparse: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    shiftGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftGroup' },
    isAttendanceEnabled: { type: Boolean, default: true },
    allowWebPunch: { type: Boolean, default: false },
    allowMobilePunch: { type: Boolean, default: true },
    enforceGeoFence: { type: Boolean, default: false },
    geoFenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeoFence' },
    geoFenceRadius: { type: Number, default: 100 },
    biometricVerified: { type: Boolean, default: false }
  },

  // --- Security & Login Tracking ---
  loginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  lastLoginAt: Date,
  lastLoginIP: String,
  
  isLoginBlocked: { type: Boolean, default: false, index: true },
  blockReason: { type: String, trim: true },
  blockedAt: Date,
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- Security Tokens ---
  passwordChangedAt: Date,
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  emailVerificationToken: { type: String, select: false },
  emailVerified: { type: Boolean, default: false },
  refreshTokens: [{ type: String, select: false }],

  // --- Device & Session Management ---
  devices: [{
    deviceId: String,
    deviceType: { type: String, enum: ['web', 'mobile', 'tablet'] },
    lastActive: Date,
    userAgent: String
  }],

  // --- UI Preferences ---
  themeId: { type: String, default: 'theme-glass' },
  language: { type: String, default: 'en' },
  preferences: {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    notifications: { 
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    }
  },

  // --- Audit ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true } 
});

// --- INDEXES ---
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
userSchema.index({ organizationId: 1, "employeeProfile.employeeId": 1 }, { 
  unique: true, 
  sparse: true 
});
userSchema.index({ organizationId: 1, status: 1 });
userSchema.index({ organizationId: 1, "employeeProfile.reportingManagerId": 1 });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });

// --- VIRTUALS ---
userSchema.virtual('fullProfile').get(function() {
  return `${this.name} (${this.employeeProfile?.employeeId || 'No ID'})`;
});

// --- MIDDLEWARE ---
userSchema.pre('save', async function(next) {
  // Hash password if modified
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
    this.passwordChangedAt = Date.now() - 1000;
  }
  next();
});

// --- METHODS ---
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.incrementLoginAttempts = function() {
  // Reset attempts if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  // Increment attempts
  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  
  // Lock account if max attempts reached
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

module.exports = mongoose.model('User', userSchema);