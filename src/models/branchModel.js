
// src/models/branchModel.js
const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true, lowercase: true },
  state: { type: String, trim: true, lowercase: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' }
});

const locationSchema = new mongoose.Schema({
  lat: { type: Number },
  lng: { type: Number }
});

const branchSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    branchCode: {
      type: String,
      trim: true,
      uppercase: true
    },

    phoneNumber: {
      type: String,
      trim: true,
      validate: {
        validator: v => !v || /^[0-9+\-()\s]{6,20}$/.test(v),
        message: 'Invalid phone number'
      }
    },

    address: addressSchema,
    location: locationSchema,

    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    isMainBranch: {
      type: Boolean,
      default: false
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

/**
 * Compound unique index per organization
 */
branchSchema.index(
  { organizationId: 1, branchCode: 1 },
  { unique: true, sparse: true }
);

/**
 * Text index for fuzzy search
 */
branchSchema.index({
  name: 'text',
  branchCode: 'text',
  'address.city': 'text',
  'address.state': 'text'
});

/**
 * Virtual field for computed address
 */
branchSchema.virtual('fullAddress').get(function () {
  const a = this.address || {};
  return [a.street, a.city, a.state, a.zipCode, a.country]
    .filter(Boolean)
    .join(', ');
});

module.exports = mongoose.model('Branch', branchSchema);

// // src/models/branchModel.js
// const mongoose = require('mongoose');

// // --- Subdocument for address ---
// const addressSchema = new mongoose.Schema({
//     street: { type: String, trim: true },
//     city: { type: String, trim: true },
//     state: { type: String, trim: true },
//     zipCode: { type: String, trim: true },
//     country: { type: String, trim: true, default: 'India' },
// });

// // --- Main branch schema ---
// const branchSchema = new mongoose.Schema({
//     name: { type: String, required: [true, 'Branch name is required (e.g., "Main Store")'], trim: true, },
//     address: addressSchema,
//     phoneNumber: { type: String, trim: true, },
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, },
//     managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },
//     branchCode: { type: String, trim: true, uppercase: true, },
//     location: { lat: { type: Number }, lng: { type: Number }, },
//     isMainBranch: { type: Boolean, default: false, },
//     isActive: { type: Boolean, default: true, },
// }, { timestamps: true });

// // --- Auto-lowercase city/state for consistency ---
// branchSchema.pre('save', function (next) {
//     if (this.address?.city) this.address.city = this.address.city.toLowerCase();
//     if (this.address?.state) this.address.state = this.address.state.toLowerCase();
//     next();
// });

// const Branch = mongoose.model('Branch', branchSchema);
// module.exports = Branch;
