const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  uniqueShopId: { type: String, required: true, unique: true, uppercase: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // The 'members' array was removed. Use User.find({ organizationId: org._id }) instead.

  // Primary Branch Link
  mainBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  
  // Business Details
  gstNumber: { type: String, trim: true, uppercase: true },
  primaryEmail: { type: String, required: true, lowercase: true },
  primaryPhone: { type: String, required: true },
  
  // Status & Subscription
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false }, // Soft delete
  
  features: {
    whatsappEnabled: { type: Boolean, default: false },
    inventoryEnabled: { type: Boolean, default: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('Organization', organizationSchema);

// // src/models/organizationModel.js
// const mongoose = require('mongoose');

// const organizationSchema = new mongoose.Schema({
//   name: { type: String, required: [true, 'Organization name is required'], trim: true, },
//   uniqueShopId: { type: String, required: [true, 'A unique Shop ID is required'], unique: true, uppercase: true, trim: true, },
//   owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, },
//   members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', }],
//   gstNumber: { type: String, trim: true, uppercase: true },
//   primaryEmail: { type: String, required: [true, 'Primary email is required'], trim: true, lowercase: true, },
//   secondaryEmail: { type: String, trim: true, lowercase: true },
//   primaryPhone: { type: String, required: [true, 'Primary phone number is required'], trim: true, },
//   secondaryPhone: { type: String, trim: true },
//   mainBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', },
//   branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', }],
//   superAdminRole: { type: String, default: 'superadmin', },
//   isActive: { type: Boolean, default: true, },
// }, { timestamps: true });

// // --- Hooks / Middleware ---
// organizationSchema.pre('save', function (next) {
//   if (this.isNew && this.owner && !this.members.includes(this.owner)) { this.members.push(this.owner); }
//   next();
// });

// const Organization = mongoose.model('Organization', organizationSchema);
// module.exports = Organization;
