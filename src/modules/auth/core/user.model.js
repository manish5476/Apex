const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
  password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
  
  // Multi-Tenancy & RBAC
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  
  // Permissions Integration
  isOwner: { type: Boolean, default: false }, // For Organization Owners
  isSuperAdmin: { type: Boolean, default: false }, // For Role-based SuperAdmins
  
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending', index: true },
  isActive: { type: Boolean, default: true },

  // Security
  passwordChangedAt: Date,
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },

  // Attendance Config
  attendanceConfig: {
    machineUserId: { type: String, sparse: true, index: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    isAttendanceEnabled: { type: Boolean, default: true },
    allowWebPunch: { type: Boolean, default: false },
    allowMobilePunch: { type: Boolean, default: false },
    enforceGeoFence: { type: Boolean, default: true }, 
    geoFenceRadius: { type: Number, default: 100 } 
  },

  avatar: String,
  phone: { type: String, trim: true },
  preferences: {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    notifications: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } }
  }
}, { timestamps: true });

// INDEX: Ensures email is unique WITHIN an organization (allows same email in different Orgs if needed)
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidate, userPassword) {
  return await bcrypt.compare(candidate, userPassword);
};

module.exports = mongoose.model('User', userSchema);

// const crypto = require('crypto');
// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');

// const userSchema = new mongoose.Schema({
//   // --- Authentication & Identity ---
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
//     select: false,
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

//   // --- Role & Status ---
//   role: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Role',
//     // Apex Note: Ensure you populate this field when querying if you need to check role names!
//   },
//   status: {
//     type: String,
//     enum: ['pending', 'approved', 'rejected', 'inactive'],
//     default: 'pending',
//     index: true,
//   },

//   // --- Profile Data ---
//   phone: {
//     type: String,
//     trim: true,
//   },
//   avatar: {
//     type: String, 
//   },
//   isActive: {
//     type: Boolean,
//     default: true,
//   },

//   // --- User Preferences ---
//   preferences: {
//     notifications: {
//       email: { type: Boolean, default: true },
//       sms: { type: Boolean, default: false },
//       push: { type: Boolean, default: true }
//     },
//     theme: { type: String, enum: ['light', 'dark'], default: 'light' },
//     denseMode: { type: Boolean, default: false }
//   },

//   // ---------------------------------------------------------
//   // 🟢 NEW: ATTENDANCE SYSTEM INTEGRATION
//   // ---------------------------------------------------------
//   attendanceConfig: {
//     // The ID stored on the physical biometric device (e.g., "1001")
//     machineUserId: { 
//       type: String, 
//       trim: true, 
//       index: true, // Crucial for fast lookups during sync
//       sparse: true // Allows multiple users to have undefined/null, but unique if set
//     },
//     // Assigned Shift Pattern
//     // shiftId: { 
//     //   type: mongoose.Schema.Types.ObjectId, 
//     //   ref: 'Shift' 
//     // },
//     shiftId: { 
//         type: mongoose.Schema.Types.ObjectId, 
//         ref: 'Shift',
//         required: false // Every employee MUST have a shift
//     },
    
//     // Master switch to ignore logs for specific users (e.g., external consultants)
//     isAttendanceEnabled: { 
//       type: Boolean, 
//       default: true 
//     },
//     allowWebPunch: { type: Boolean, default: false }, // Default FALSE for security
//     allowMobilePunch: { type: Boolean, default: false },
    
//     // If true, they MUST be within X meters of their Branch location
//     enforceGeoFence: { type: Boolean, default: true }, 
//     geoFenceRadius: { type: Number, default: 100 } 
//   }

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

// // --- FIX: Logic Check for Admin ---
// userSchema.methods.isAdmin = function () {
//   if (this.role && this.role.name) {
//       return ['admin', 'superadmin'].includes(this.role.name);
//   }
//   return false;
// };

// const User = mongoose.model('User', userSchema);
// module.exports = User;
