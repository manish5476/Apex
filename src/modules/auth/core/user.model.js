const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // --- Auth & Identity ---
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
  password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
  avatar: { type: String, default: null },
  
  // PRIMARY PHONE: Unique within the same organization
  phone: { type: String, required: [true, 'Primary phone is required'], trim: true },

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
    employeeId: { type: String, trim: true },
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
    
    // CONNECTION LOGIC: Secondary/Guarantor numbers (Allow duplicates)
    secondaryPhone: { type: String, trim: true }, 
    guarantorDetails: {
      name: String,
      relationship: String,
      phone: { type: String, trim: true } 
    },

    // Bank Details (secured)
    bankDetails: {
      type: new mongoose.Schema({
        accountName: String,
        accountNumber: { type: String, select: false },
        ifscCode: { type: String, select: false },
        bankName: String,
        panCard: { type: String, select: false },
        uanNumber: String 
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

// 1. Unique Email per Organization
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

// 2. Unique Primary Phone per Organization (The "Strict" number)
userSchema.index({ organizationId: 1, phone: 1 }, { unique: true });

// 3. Unique Employee ID per Organization (Partial filter so nulls don't clash)
userSchema.index({ organizationId: 1, "employeeProfile.employeeId": 1 }, { 
  unique: true, 
  partialFilterExpression: { "employeeProfile.employeeId": { $type: "string" } }
});

// 4. Performance Indexes
userSchema.index({ organizationId: 1, status: 1 });
userSchema.index({ organizationId: 1, "employeeProfile.reportingManagerId": 1 });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });


// --- VIRTUALS ---
userSchema.virtual('fullProfile').get(function() {
  return `${this.name} (${this.employeeProfile?.employeeId || 'No ID'})`;
});


// --- MIDDLEWARE ---
userSchema.pre('save', async function(next) {
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
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; 
  }
  
  return this.updateOne(updates);
};

module.exports = mongoose.model('User', userSchema);



// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');

// const userSchema = new mongoose.Schema({
//   // --- Auth & Identity ---
//   name: { type: String, required: [true, 'Name is required'], trim: true },
//   email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
//   password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
//   avatar: String,
//   phone: { type: String, trim: true },
//   // --- Multi-Tenancy & Access ---
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
//   role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  
//   // --- Permissions Flags ---
//   isOwner: { type: Boolean, default: false },
//   isSuperAdmin: { type: Boolean, default: false },
//   status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending', index: true },
//   isActive: { type: Boolean, default: true },

//   // --- 🟢 HRMS Specific Profile (Nested Object) ---
//   employeeProfile: {
//     employeeId: { type: String, trim: true }, // Custom ID like EMP-001
//     departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
//     designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
//     dateOfJoining: Date,
//     dateOfBirth: Date,
//     reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
//     // 🔒 SECURITY: Exclude bank details by default
//     bankDetails: {
//       type: new mongoose.Schema({
//         accountName: String,
//         accountNumber: String,
//         ifscCode: String,
//         bankName: String
//       }, { _id: false }), 
//       select: false 
//     }
//   },
// upiId:{type:String},
  
//   attendanceConfig: {
//     machineUserId: { type: String, sparse: true }, 
//     shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
//     isAttendanceEnabled: { type: Boolean, default: true },
//     allowWebPunch: { type: Boolean, default: false },
//     allowMobilePunch: { type: Boolean, default: false },
//     enforceGeoFence: { type: Boolean, default: true }, 
//     geoFenceRadius: { type: Number, default: 100 } 
//   },

//   // --- UI Preferences ---
//   themeId: { type: String, default: 'theme-glass' },
//   language: { type: String, default: 'en' },
//   preferences: {
//     theme: { type: String, enum: ['light', 'dark'], default: 'light' },
//     notifications: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } }
//   },

//   // 🔒 SECURITY: The "Kill Switch"
//   isLoginBlocked: { 
//     type: Boolean, 
//     default: false, 
//     index: true 
//   },
  
//   // 📝 AUDIT: Why were they blocked? (Crucial for legal/HR)
//   blockReason: { 
//     type: String, 
//     trim: true 
//   },
  
//   blockedAt: Date,
//   blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
//   // --- Security ---
//   passwordChangedAt: Date,
//   passwordResetToken: { type: String, select: false },
//   passwordResetExpires: { type: Date, select: false },

// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true }, // Ensure virtuals show up
//   toObject: { virtuals: true } 
// });

// // --- INDEXES ---
// userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// // Uniqueness for Employee ID (Only if it exists)
// userSchema.index({ organizationId: 1, "employeeProfile.employeeId": 1 }, { 
//   unique: true, 
//   partialFilterExpression: { "employeeProfile.employeeId": { $exists: true } } 
// });

// // --- MIDDLEWARE ---
// userSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();
//   this.password = await bcrypt.hash(this.password, 12);
//   next();
// });

// // --- METHODS ---
// userSchema.methods.correctPassword = async function(candidate, userPassword) {
//   return await bcrypt.compare(candidate, userPassword);
// };

// module.exports = mongoose.model('User', userSchema);

// // // models/user.model.js
// // const mongoose = require('mongoose');
// // const bcrypt = require('bcryptjs');

// // const userSchema = new mongoose.Schema({
// //   // --- Auth & Identity ---
// //   name: { type: String, required: [true, 'Name is required'], trim: true },
// //   email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
// //   password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
// //   avatar: String,
// //   phone: { type: String, trim: true },

// //   // --- Multi-Tenancy & Access ---
// //   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
// //   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
// //   role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }, // Link to your Role model
  
// //   // --- Permissions Flags ---
// //   isOwner: { type: Boolean, default: false },
// //   isSuperAdmin: { type: Boolean, default: false },
// //   status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending', index: true },
// //   isActive: { type: Boolean, default: true },

// //   // --- 🟢 HRMS Specific Profile (New Section) ---
// //   employeeProfile: {
// //     employeeId: { type: String, trim: true }, // Custom ID like EMP-001
// //     departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
// //     designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
// //     dateOfJoining: Date,
// //     dateOfBirth: Date,
// //     reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
// //     bankDetails: {
// //       accountName: String,
// //       accountNumber: String,
// //       ifscCode: String,
// //       bankName: String
// //     }
// //   },
// //   // --- Attendance Config ---
// //   attendanceConfig: {
// //     machineUserId: { type: String, sparse: true }, // ID on the biometric machine
// //     shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
// //     isAttendanceEnabled: { type: Boolean, default: true },
// //     allowWebPunch: { type: Boolean, default: false },
// //     allowMobilePunch: { type: Boolean, default: false },
// //     enforceGeoFence: { type: Boolean, default: true }, 
// //     geoFenceRadius: { type: Number, default: 100 } 
// //   },

// //   // --- UI Preferences ---
// //   themeId: { type: String, default: 'theme-glass' },
// //   language: { type: String, default: 'en' },
// //   preferences: {
// //     theme: { type: String, enum: ['light', 'dark'], default: 'light' },
// //     notifications: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } }
// //   },

// //   // --- Security ---
// //   passwordChangedAt: Date,
// //   passwordResetToken: { type: String, select: false },
// //   passwordResetExpires: { type: Date, select: false },

// // }, { timestamps: true })

// // userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// // userSchema.index({ organizationId: 1, "employeeProfile.employeeId": 1 }, { unique: true, partialFilterExpression: { "employeeProfile.employeeId": { $exists: true } } });
// // userSchema.pre('save', async function (next) {
// //   if (!this.isModified('password')) return next();
// //   this.password = await bcrypt.hash(this.password, 12);
// //   next();
// // });

// // userSchema.methods.correctPassword = async function(candidate, userPassword) {
// //   return await bcrypt.compare(candidate, userPassword);
// // };

// // module.exports = mongoose.model('User', userSchema);
// // // const mongoose = require('mongoose');
// // // const bcrypt = require('bcryptjs');
// // // const crypto = require('crypto');

// // // const userSchema = new mongoose.Schema({
// // //   name: { type: String, required: [true, 'Name is required'], trim: true },
// // //   email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
// // //   password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
  
// // //   themeId: { 
// // //       type: String, 
// // //       default: 'theme-glass',
// // //       enum: ['auto-theme', 'theme-glass', 'theme-light', 'theme-dark', 'theme-bio-frost','theme-premium', 'theme-titanium', 'theme-slate', 'theme-data-science', 'theme-cobalt-steel', 'theme-luminous', 'theme-minimal', 'theme-monochrome', 'theme-rose', 'theme-sunset', 'theme-bold', 'theme-nebula', 'theme-luxury', 'theme-futuristic', 'theme-midnight-royal', 'theme-emerald-regal', 'theme-material-you', 'theme-solar-flare', 'theme-horizon', 'theme-midnight-city', 'theme-synthwave', 'theme-crimson-night', 'theme-oceanic', 'theme-neumorphic', 'theme-deep-space'
// // //       ]
// // //     },
// // //     language: { type: String, default: 'en' },
// // //   // Multi-Tenancy & RBAC
// // //   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
// // //   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
// // //   role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  
// // //   // Permissions Integration
// // //   isOwner: { type: Boolean, default: false }, // For Organization Owners
// // //   isSuperAdmin: { type: Boolean, default: false }, // For Role-based SuperAdmins
  
// // //   status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending', index: true },
// // //   isActive: { type: Boolean, default: true },

// // //   // Security
// // //   passwordChangedAt: Date,
// // //   passwordResetToken: { type: String, select: false },
// // //   passwordResetExpires: { type: Date, select: false },

// // //   // Attendance Config
// // //   attendanceConfig: {
// // //     machineUserId: { type: String, sparse: true, index: true },
// // //     shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
// // //     isAttendanceEnabled: { type: Boolean, default: true },
// // //     allowWebPunch: { type: Boolean, default: false },
// // //     allowMobilePunch: { type: Boolean, default: false },
// // //     enforceGeoFence: { type: Boolean, default: true }, 
// // //     geoFenceRadius: { type: Number, default: 100 } 
// // //   },

// // //   avatar: String,
// // //   phone: { type: String, trim: true },
// // //   preferences: {
// // //     theme: { type: String, enum: ['light', 'dark'], default: 'light' },
// // //     notifications: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } }
// // //   }
// // // }, { timestamps: true });

// // // // INDEX: Ensures email is unique WITHIN an organization (allows same email in different Orgs if needed)
// // // userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

// // // userSchema.pre('save', async function (next) {
// // //   if (!this.isModified('password')) return next();
// // //   this.password = await bcrypt.hash(this.password, 12);
// // //   next();
// // // });

// // // userSchema.methods.correctPassword = async function(candidate, userPassword) {
// // //   return await bcrypt.compare(candidate, userPassword);
// // // };

// // // module.exports = mongoose.model('User', userSchema);
