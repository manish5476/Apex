const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { VALID_TAGS } = require('../../../config/permissions');

// ======================================================
//  SUB-SCHEMAS
// ======================================================

const guarantorSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  relationship: { type: String, trim: true },
  phone: { type: String, trim: true },
}, { _id: false });

const bankDetailsSchema = new mongoose.Schema({
  accountName: { type: String, trim: true },
  accountNumber: { type: String, trim: true, select: false },
  ifscCode: { type: String, trim: true, uppercase: true, select: false },
  bankName: { type: String, trim: true },
  panCard: { type: String, trim: true, uppercase: true, select: false },
  uanNumber: { type: String, trim: true },
}, { _id: false });

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String },
  deviceType: { type: String, enum: ['web', 'mobile', 'tablet'] },
  lastActive: { type: Date },
  userAgent: { type: String },
}, { _id: false }); // _id: false — devices are matched by deviceId, not _id

// ======================================================
//  MAIN SCHEMA
// ======================================================

const userSchema = new mongoose.Schema(
  {
    // ── Identity ───────────────────────────────────────────────────────────
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },

    // Virtual field — used during save for validation, never persisted
    // Set on User instance before .save(), cleared by pre-save hook
    passwordConfirm: {
      type: String,
      validate: {
        // Only runs on create / save (not findByIdAndUpdate)
        validator: function (val) {
          return val === this.password;
        },
        message: 'Passwords do not match',
      },
    },

    avatar: { type: String },
    avatarAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },

    // Primary phone — unique within org (enforced by index)
    phone: {
      type: String,
      required: [true, 'Primary phone is required'],
      trim: true,
    },

    // ── Multi-tenancy & Access ──────────────────────────────────────────────
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },

    // ── Permission Flags ────────────────────────────────────────────────────
    isOwner: { type: Boolean, default: false },
    isSuperAdmin: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'inactive', 'suspended'],
      default: 'pending',
      index: true,
    },

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true }, // soft delete flag

    // Per-user permission overrides (granted/revoked on top of role permissions)
    permissionOverrides: {
      granted: [{ type: String, enum: { values: VALID_TAGS, message: 'Invalid permission: {VALUE}' } }],
      revoked: [{ type: String, enum: { values: VALID_TAGS, message: 'Invalid permission: {VALUE}' } }],
    },

    // ── Account lifecycle flags ─────────────────────────────────────────────
    // Set to true by admin password reset or createUser — forces reset on first login
    mustChangePassword: { type: Boolean, default: false },

    // ── HRMS Employee Profile ──────────────────────────────────────────────
    employeeProfile: {
      employeeId: { type: String, trim: true },
      departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
      designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
      dateOfJoining: { type: Date, index: true },
      dateOfBirth: { type: Date },

      reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

      employmentType: {
        type: String,
        enum: ['permanent', 'contract', 'intern', 'probation', 'consultant'],
        default: 'permanent',
      },

      workLocation: { type: String, trim: true }, // e.g. 'Remote', 'Office', 'Hybrid'

      // Secondary phone — NOT unique (family/alternate numbers)
      secondaryPhone: { type: String, trim: true },
      guarantorDetails: guarantorSchema,

      // Sensitive financial fields — excluded from default queries
      bankDetails: { type: bankDetailsSchema, select: false },
    },

    upiId: { type: String, trim: true, sparse: true }, // sparse makes sense only with a sparse index below

    // ── Attendance Configuration ────────────────────────────────────────────
    attendanceConfig: {
      machineUserId: { type: String },
      shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
      shiftGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftGroup' },
      isAttendanceEnabled: { type: Boolean, default: true },
      allowWebPunch: { type: Boolean, default: false },
      allowMobilePunch: { type: Boolean, default: true },
      enforceGeoFence: { type: Boolean, default: false },
      geoFenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeoFence' },
      geoFenceRadius: { type: Number, default: 100 },
      biometricVerified: { type: Boolean, default: false },
    },

    // ── Security & Login Tracking ───────────────────────────────────────────
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
    lastLoginIP: { type: String },

    isLoginBlocked: { type: Boolean, default: false, index: true },
    blockReason: { type: String, trim: true },
    blockedAt: { type: Date },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ── Security Tokens ─────────────────────────────────────────────────────
    passwordChangedAt: { type: Date },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false }, // expiry for verification link
    emailVerified: { type: Boolean, default: false },

    // Legacy array — kept for backward compat but no longer populated.
    // Session management is handled by the Session collection.
    // TODO: remove after confirming no active consumers.
    refreshTokens: [{ type: String, select: false }],

    // ── Device & Session Management ─────────────────────────────────────────
    // Controls how many simultaneous logins are allowed.
    // Default: 1. Can be raised per-user for multi-device access.
    maxConcurrentSessions: { type: Number, default: 1 },
    devices: [deviceSchema],

    // ── UI Preferences ──────────────────────────────────────────────────────
    themeId: { type: String, default: 'theme-glass' },
    language: { type: String, default: 'en' },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light',
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
      },
    },

    // ── Audit ───────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ======================================================
//  INDEXES
// ======================================================

// Unique email per org
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

// Unique primary phone per org
userSchema.index({ organizationId: 1, phone: 1 }, { unique: true });

// Unique employee ID per org — partial filter allows null/missing IDs
userSchema.index(
  { organizationId: 1, 'employeeProfile.employeeId': 1 },
  {
    unique: true,
    partialFilterExpression: { 'employeeProfile.employeeId': { $type: 'string' } },
  }
);

// Sparse index on upiId — unique when present, allows multiple nulls
userSchema.index({ upiId: 1 }, { unique: true, sparse: true });

// Compound query indexes (matches common filter patterns)
userSchema.index({ organizationId: 1, status: 1 });
userSchema.index({ organizationId: 1, isActive: 1, isDeleted: 1 });
userSchema.index({ organizationId: 1, isActive: 1, status: 1 }); // getAllUsers filter
userSchema.index({ organizationId: 1, isLoginBlocked: 1 });
userSchema.index({ organizationId: 1, 'employeeProfile.reportingManagerId': 1 });
userSchema.index({ organizationId: 1, 'employeeProfile.departmentId': 1 });

// Sparse token indexes — fast lookup during password reset / email verification
userSchema.index({ passwordResetToken: 1 }, { sparse: true });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });

// ======================================================
//  VIRTUALS
// ======================================================

userSchema.virtual('fullProfile').get(function () {
  return `${this.name} (${this.employeeProfile?.employeeId || 'No ID'})`;
});

// ======================================================
//  PRE-SAVE MIDDLEWARE
// ======================================================

userSchema.pre('save', async function (next) {
  // Only hash if password was explicitly changed
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);

  // Clear the confirm field — it must never be persisted
  this.passwordConfirm = undefined;

  // Only set passwordChangedAt on updates, NOT on initial creation.
  // On creation, iat will always be >= createdAt so no false positives.
  if (!this.isNew) {
    // Subtract 1s to ensure tokens issued immediately after are still valid
    this.passwordChangedAt = Date.now() - 1000;
  }

  next();
});

// ======================================================
//  INSTANCE METHODS
// ======================================================

/** Compare a plain-text candidate against the stored bcrypt hash */
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return bcrypt.compare(candidatePassword, userPassword);
};

/** Returns true if the account is currently locked out */
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

/**
 * Increment failed login attempts.
 * Locks account for 2 hours after 5 consecutive failures.
 * Resets the counter if a previous lock has already expired.
 */
userSchema.methods.incrementLoginAttempts = function () {
  // If a previous lock has expired, reset counter
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;

  // Lock if this increment hits the threshold and not already locked
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: new Date(Date.now() + 2 * 60 * 60 * 1000) }; // 2 hours
  }

  return this.updateOne(updates);
};

module.exports = mongoose.model('User', userSchema);

