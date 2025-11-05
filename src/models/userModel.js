const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
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
    select: false, // Never show password in query results
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
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'inactive'],
    default: 'pending',
    index: true,
  },

  // --- Profile ---
  phone: {
    type: String,
    trim: true,
  },
  avatar: {
    type: String, // URL to profile image
  },

  isActive: {
    type: Boolean,
    default: true,
  },
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

// --- Helper ---
userSchema.methods.isAdmin = function () {
  return ['admin', 'superadmin'].includes(this.role);
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
//     // This is NOT required because:
//     // 1. A 'pending' user doesn't have a branch yet.
//     // 2. The 'superadmin' (owner) may not be tied to one branch.
//   },

//   // --- Role & Status ---
//   role: {
//     type: String,
//     enum: ['superadmin', 'admin', 'employee'],
//     default: 'employee',
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
//     type: String, // URL to the image
//   },

//   isActive: {
//     type: Boolean,
//     default: true,
//   }
// }, { timestamps: true });

// // --- Mongoose Hooks (Middleware) ---

// // 1. Hash password before saving
// userSchema.pre('save', async function (next) {
//   // Only run this function if password was actually modified
//   if (!this.isModified('password')) return next();

//   // Hash the password with cost of 12
//   this.password = await bcrypt.hash(this.password, 12);

//   next();
// });

// // 2. Set passwordChangedAt timestamp
// userSchema.pre('save', function (next) {
//   if (!this.isModified('password') || this.isNew) return next();

//   // Subtract 1 second to ensure token is created AFTER password change
//   this.passwordChangedAt = Date.now() - 1000;
//   next();
// });

// // --- Mongoose Instance Methods ---

// // 1. Compare candidate password with the hashed password
// userSchema.methods.correctPassword = async function (
//   candidatePassword,
//   userPassword
// ) {
//   return await bcrypt.compare(candidatePassword, userPassword);
// };

// // 2. Check if user changed password after JWT was issued
// userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
//   if (this.passwordChangedAt) {
//     const changedTimestamp = parseInt(
//       this.passwordChangedAt.getTime() / 1000,
//       10
//     );
//     // True = Password was changed after token was issued
//     return JWTTimestamp < changedTimestamp;
//   }
//   // False = Not changed
//   return false;
// };

// // 3. Create a password reset token
// userSchema.methods.createPasswordResetToken = function () {
//   const resetToken = crypto.randomBytes(32).toString('hex');

//   this.passwordResetToken = crypto
//     .createHash('sha256')
//     .update(resetToken)
//     .digest('hex');

//   // Token expires in 10 minutes
//   this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

//   // Return the unhashed token (to be sent via email)
//   return resetToken;
// };

// const User = mongoose.model('User', userSchema);
// module.exports = User;