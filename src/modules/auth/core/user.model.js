const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // --- Auth & Identity ---
  name: { type: String, required: [true, 'Name is required'], trim: true },
  email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
  password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
  avatar: String,
  phone: { type: String, trim: true },
  // --- Multi-Tenancy & Access ---
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  
  // --- Permissions Flags ---
  isOwner: { type: Boolean, default: false },
  isSuperAdmin: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending', index: true },
  isActive: { type: Boolean, default: true },

  // --- 🟢 HRMS Specific Profile (Nested Object) ---
  employeeProfile: {
    employeeId: { type: String, trim: true }, // Custom ID like EMP-001
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    dateOfJoining: Date,
    dateOfBirth: Date,
    reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // 🔒 SECURITY: Exclude bank details by default
    bankDetails: {
      type: new mongoose.Schema({
        accountName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String
      }, { _id: false }), 
      select: false 
    }
  },
upiId:{type:String},
  
  attendanceConfig: {
    machineUserId: { type: String, sparse: true }, 
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    isAttendanceEnabled: { type: Boolean, default: true },
    allowWebPunch: { type: Boolean, default: false },
    allowMobilePunch: { type: Boolean, default: false },
    enforceGeoFence: { type: Boolean, default: true }, 
    geoFenceRadius: { type: Number, default: 100 } 
  },

  // --- UI Preferences ---
  themeId: { type: String, default: 'theme-glass' },
  language: { type: String, default: 'en' },
  preferences: {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    notifications: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } }
  },

  // 🔒 SECURITY: The "Kill Switch"
  isLoginBlocked: { 
    type: Boolean, 
    default: false, 
    index: true 
  },
  
  // 📝 AUDIT: Why were they blocked? (Crucial for legal/HR)
  blockReason: { 
    type: String, 
    trim: true 
  },
  
  blockedAt: Date,
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // --- Security ---
  passwordChangedAt: Date,
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },

}, { 
  timestamps: true,
  toJSON: { virtuals: true }, // Ensure virtuals show up
  toObject: { virtuals: true } 
});

// --- INDEXES ---
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// Uniqueness for Employee ID (Only if it exists)
userSchema.index({ organizationId: 1, "employeeProfile.employeeId": 1 }, { 
  unique: true, 
  partialFilterExpression: { "employeeProfile.employeeId": { $exists: true } } 
});

// --- MIDDLEWARE ---
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// --- METHODS ---
userSchema.methods.correctPassword = async function(candidate, userPassword) {
  return await bcrypt.compare(candidate, userPassword);
};

module.exports = mongoose.model('User', userSchema);

// // models/user.model.js
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
//   role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' }, // Link to your Role model
  
//   // --- Permissions Flags ---
//   isOwner: { type: Boolean, default: false },
//   isSuperAdmin: { type: Boolean, default: false },
//   status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending', index: true },
//   isActive: { type: Boolean, default: true },

//   // --- 🟢 HRMS Specific Profile (New Section) ---
//   employeeProfile: {
//     employeeId: { type: String, trim: true }, // Custom ID like EMP-001
//     departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
//     designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
//     dateOfJoining: Date,
//     dateOfBirth: Date,
//     reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     bankDetails: {
//       accountName: String,
//       accountNumber: String,
//       ifscCode: String,
//       bankName: String
//     }
//   },
//   // --- Attendance Config ---
//   attendanceConfig: {
//     machineUserId: { type: String, sparse: true }, // ID on the biometric machine
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

//   // --- Security ---
//   passwordChangedAt: Date,
//   passwordResetToken: { type: String, select: false },
//   passwordResetExpires: { type: Date, select: false },

// }, { timestamps: true })

// userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// userSchema.index({ organizationId: 1, "employeeProfile.employeeId": 1 }, { unique: true, partialFilterExpression: { "employeeProfile.employeeId": { $exists: true } } });
// userSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();
//   this.password = await bcrypt.hash(this.password, 12);
//   next();
// });

// userSchema.methods.correctPassword = async function(candidate, userPassword) {
//   return await bcrypt.compare(candidate, userPassword);
// };

// module.exports = mongoose.model('User', userSchema);
// // const mongoose = require('mongoose');
// // const bcrypt = require('bcryptjs');
// // const crypto = require('crypto');

// // const userSchema = new mongoose.Schema({
// //   name: { type: String, required: [true, 'Name is required'], trim: true },
// //   email: { type: String, required: [true, 'Email is required'], lowercase: true, trim: true },
// //   password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
  
// //   themeId: { 
// //       type: String, 
// //       default: 'theme-glass',
// //       enum: ['auto-theme', 'theme-glass', 'theme-light', 'theme-dark', 'theme-bio-frost','theme-premium', 'theme-titanium', 'theme-slate', 'theme-data-science', 'theme-cobalt-steel', 'theme-luminous', 'theme-minimal', 'theme-monochrome', 'theme-rose', 'theme-sunset', 'theme-bold', 'theme-nebula', 'theme-luxury', 'theme-futuristic', 'theme-midnight-royal', 'theme-emerald-regal', 'theme-material-you', 'theme-solar-flare', 'theme-horizon', 'theme-midnight-city', 'theme-synthwave', 'theme-crimson-night', 'theme-oceanic', 'theme-neumorphic', 'theme-deep-space'
// //       ]
// //     },
// //     language: { type: String, default: 'en' },
// //   // Multi-Tenancy & RBAC
// //   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
// //   branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
// //   role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  
// //   // Permissions Integration
// //   isOwner: { type: Boolean, default: false }, // For Organization Owners
// //   isSuperAdmin: { type: Boolean, default: false }, // For Role-based SuperAdmins
  
// //   status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending', index: true },
// //   isActive: { type: Boolean, default: true },

// //   // Security
// //   passwordChangedAt: Date,
// //   passwordResetToken: { type: String, select: false },
// //   passwordResetExpires: { type: Date, select: false },

// //   // Attendance Config
// //   attendanceConfig: {
// //     machineUserId: { type: String, sparse: true, index: true },
// //     shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
// //     isAttendanceEnabled: { type: Boolean, default: true },
// //     allowWebPunch: { type: Boolean, default: false },
// //     allowMobilePunch: { type: Boolean, default: false },
// //     enforceGeoFence: { type: Boolean, default: true }, 
// //     geoFenceRadius: { type: Number, default: 100 } 
// //   },

// //   avatar: String,
// //   phone: { type: String, trim: true },
// //   preferences: {
// //     theme: { type: String, enum: ['light', 'dark'], default: 'light' },
// //     notifications: { email: { type: Boolean, default: true }, push: { type: Boolean, default: true } }
// //   }
// // }, { timestamps: true });

// // // INDEX: Ensures email is unique WITHIN an organization (allows same email in different Orgs if needed)
// // userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

// // userSchema.pre('save', async function (next) {
// //   if (!this.isModified('password')) return next();
// //   this.password = await bcrypt.hash(this.password, 12);
// //   next();
// // });

// // userSchema.methods.correctPassword = async function(candidate, userPassword) {
// //   return await bcrypt.compare(candidate, userPassword);
// // };

// // module.exports = mongoose.model('User', userSchema);
