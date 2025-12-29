const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // --- Authentication & Identity ---
  name: {
    type: String,
    required: [true, 'Please tell us your name!'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 8,
    select: false,
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,

  // --- Organization & Branch Links ---
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'User must belong to an organization'],
    index: true,
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
  },

  // --- Role & Status ---
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    // Apex Note: Ensure you populate this field when querying if you need to check role names!
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'inactive'],
    default: 'pending',
    index: true,
  },

  // --- Profile Data ---
  phone: {
    type: String,
    trim: true,
  },
  avatar: {
    type: String, 
  },
  isActive: {
    type: Boolean,
    default: true,
  },

  // --- User Preferences ---
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    denseMode: { type: Boolean, default: false }
  },

  // ---------------------------------------------------------
  // 🟢 NEW: ATTENDANCE SYSTEM INTEGRATION
  // ---------------------------------------------------------
  attendanceConfig: {
    // The ID stored on the physical biometric device (e.g., "1001")
    machineUserId: { 
      type: String, 
      trim: true, 
      index: true, // Crucial for fast lookups during sync
      sparse: true // Allows multiple users to have undefined/null, but unique if set
    },
    // Assigned Shift Pattern
    // shiftId: { 
    //   type: mongoose.Schema.Types.ObjectId, 
    //   ref: 'Shift' 
    // },
    shiftId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Shift',
        required: false // Every employee MUST have a shift
    },
    
    // Master switch to ignore logs for specific users (e.g., external consultants)
    isAttendanceEnabled: { 
      type: Boolean, 
      default: true 
    },
    allowWebPunch: { type: Boolean, default: false }, // Default FALSE for security
    allowMobilePunch: { type: Boolean, default: false },
    
    // If true, they MUST be within X meters of their Branch location
    enforceGeoFence: { type: Boolean, default: true }, 
    geoFenceRadius: { type: Number, default: 100 } // Meters
  }

}, { timestamps: true });

// --- Virtuals ---
userSchema.virtual('displayName').get(function () {
  return this.name?.trim();
});

// --- Middleware: Password Hashing ---
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// --- Middleware: Password Changed Timestamp ---
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// --- Instance Methods ---
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// --- FIX: Logic Check for Admin ---
userSchema.methods.isAdmin = function () {
  // Apex Fix: Since 'role' is an ObjectId, we cannot compare it to strings directly 
  // without populating. This method assumes you have populated 'role'.
  // If 'role' is just an ID, this returns false safely.
  if (this.role && this.role.name) {
      return ['admin', 'superadmin'].includes(this.role.name);
  }
  return false;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
// const crypto = require('crypto');
// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');

// const userSchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: [true, 'Please tell us your name!'],
//     trim: true,
//   },

//   email: {
//     type: String,
//     required: [true, 'Please provide your email'],
//     unique: true,
//     lowercase: true,
//     trim: true,
//   },

//   password: {
//     type: String,
//     required: [true, 'Please provide a password'],
//     minlength: 8,
//     select: false, // Never show password in query results
//   },

//   passwordChangedAt: Date,
//   passwordResetToken: String,
//   passwordResetExpires: Date,

//   // --- Organization & Branch Links ---
//   organizationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Organization',
//     required: [true, 'User must belong to an organization'],
//     index: true,
//   },
//   branchId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Branch',
//   },
//   preferences: {
//     notifications: {
//       email: { type: Boolean, default: true },
//       sms: { type: Boolean, default: false },
//       push: { type: Boolean, default: true }
//     },
//     theme: { type: String, enum: ['light', 'dark'], default: 'light' },
//     denseMode: { type: Boolean, default: false }
//   },
//   // --- Role & Status ---
//   role: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Role',
//   },
//   status: {
//     type: String,
//     enum: ['pending', 'approved', 'rejected', 'inactive'],
//     default: 'pending',
//     index: true,
//   },

//   // --- Profile ---
//   phone: {
//     type: String,
//     trim: true,
//   },
//   avatar: {
//     type: String, // URL to profile image
//   },
//   passwordResetToken: String,
//   passwordResetExpires: Date,

//   isActive: {
//     type: Boolean,
//     default: true,
//   },
// }, { timestamps: true });

// // --- Virtuals ---
// userSchema.virtual('displayName').get(function () {
//   return this.name?.trim();
// });

// // --- Middleware: Password Hashing ---
// userSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();
//   this.password = await bcrypt.hash(this.password, 12);
//   next();
// });

// // --- Middleware: Password Changed Timestamp ---
// userSchema.pre('save', function (next) {
//   if (!this.isModified('password') || this.isNew) return next();
//   this.passwordChangedAt = Date.now() - 1000;
//   next();
// });

// // --- Instance Methods ---
// userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
//   return await bcrypt.compare(candidatePassword, userPassword);
// };

// userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
//   if (this.passwordChangedAt) {
//     const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
//     return JWTTimestamp < changedTimestamp;
//   }
//   return false;
// };

// userSchema.methods.createPasswordResetToken = function () {
//   const resetToken = crypto.randomBytes(32).toString('hex');
//   this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
//   this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
//   return resetToken;
// };

// userSchema.methods.isAdmin = function () {
//   return ['admin', 'superadmin'].includes(this.role);
// };

// const User = mongoose.model('User', userSchema);
// module.exports = User;

