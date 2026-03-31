const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  street:  { type: String, trim: true },
  city:    { type: String, trim: true, lowercase: true },
  state:   { type: String, trim: true, lowercase: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
}, { _id: false }); // no unnecessary subdoc _id

const locationSchema = new mongoose.Schema({
  lat: {
    type: Number,
    min: [-90,  'Latitude must be between -90 and 90'],
    max: [90,   'Latitude must be between -90 and 90'],
  },
  lng: {
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180,  'Longitude must be between -180 and 180'],
  },
}, { _id: false });

const branchSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },

    // Auto-generated if not provided (see pre-validate hook below)
    branchCode: { type: String, trim: true, uppercase: true },

    phoneNumber: {
      type: String,
      trim: true,
      validate: {
        validator: v => !v || /^[0-9+\-()\s]{6,20}$/.test(v),
        message: 'Invalid phone number',
      },
    },

    address:  addressSchema,
    location: locationSchema,

    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    isMainBranch: { type: Boolean, default: false },
    isActive:     { type: Boolean, default: true,  index: true },
    isDeleted:    { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
branchSchema.index(
  { organizationId: 1, branchCode: 1 },
  { unique: true, sparse: true }
);

branchSchema.index({ organizationId: 1, isMainBranch: 1 });
branchSchema.index({ organizationId: 1, isActive: 1, isDeleted: 1 });

branchSchema.index({
  name:           'text',
  branchCode:     'text',
  'address.city': 'text',
  'address.state':'text',
});

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────
branchSchema.virtual('fullAddress').get(function () {
  const a = this.address || {};
  return [a.street, a.city, a.state, a.zipCode, a.country]
    .filter(Boolean)
    .join(', ');
});

// ─────────────────────────────────────────────
//  Pre-validate: Auto-generate branchCode
// ─────────────────────────────────────────────
branchSchema.pre('validate', function (next) {
  if (!this.branchCode && this.isNew) {
    // e.g. "BR-A1B2C3"
    this.branchCode = `BR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
  next();
});

// ─────────────────────────────────────────────
//  Pre-save: Enforce single main branch at model level
//  This guards direct .save() calls (seeders, migrations, tests)
//  that bypass the controller.
// ─────────────────────────────────────────────
branchSchema.pre('save', async function (next) {
  if (this.isModified('isMainBranch') && this.isMainBranch) {
    await this.constructor.updateMany(
      { organizationId: this.organizationId, _id: { $ne: this._id } },
      { $set: { isMainBranch: false } }
    );
  }
  next();
});

module.exports = mongoose.model('Branch', branchSchema);


// const mongoose = require('mongoose');

// const addressSchema = new mongoose.Schema({
//   street: { type: String, trim: true },
//   city: { type: String, trim: true, lowercase: true },
//   state: { type: String, trim: true, lowercase: true },
//   zipCode: { type: String, trim: true },
//   country: { type: String, trim: true, default: 'India' }
// });

// const locationSchema = new mongoose.Schema({
//   lat: { type: Number },
//   lng: { type: Number }
// });

// const branchSchema = new mongoose.Schema(
//   {
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//     name: { type: String, required: true, trim: true },
//     branchCode: { type: String, trim: true, uppercase: true },
//     phoneNumber: { type: String, trim: true, validate: { validator: v => !v || /^[0-9+\-()\s]{6,20}$/.test(v), message: 'Invalid phone number' } },
//     address: addressSchema,
//     location: locationSchema,
//     managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     isMainBranch: { type: Boolean, default: false },
//     isActive: { type: Boolean, default: true, index: true },
//     isDeleted: { type: Boolean, default: false, index: true }
//   },
//   { timestamps: true }
// );
// branchSchema.index(
//   { organizationId: 1, branchCode: 1 },
//   { unique: true, sparse: true }
// );
// branchSchema.index({
//   name: 'text',
//   branchCode: 'text',
//   'address.city': 'text',
//   'address.state': 'text'
// });

// branchSchema.virtual('fullAddress').get(function () {
//   const a = this.address || {};
//   return [a.street, a.city, a.state, a.zipCode, a.country]
//     .filter(Boolean)
//     .join(', ');
// });
// module.exports = mongoose.model('Branch', branchSchema);
