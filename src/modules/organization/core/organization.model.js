const mongoose = require('mongoose');

// Shared Address Schema
const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
}, { _id: false });

const organizationSchema = new mongoose.Schema({
  // --- Basic Info ---
  name: { type: String, required: [true, 'Organization name is required'], trim: true },
  uniqueShopId: { type: String, required: [true, 'A unique Shop ID is required'], unique: true, uppercase: true, trim: true },
  
  // --- Branding (For Invoices/UI) ---
  logo: { type: String, trim: true }, // Cloudinary URL
  
  // --- Relations ---
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mainBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
  
  // --- Legal & Contact ---
  gstNumber: { type: String, trim: true, uppercase: true },
  primaryEmail: { type: String, required: [true, 'Primary email is required'], trim: true, lowercase: true },
  secondaryEmail: { type: String, trim: true, lowercase: true },
  primaryPhone: { type: String, required: [true, 'Primary phone number is required'], trim: true },
  secondaryPhone: { type: String, trim: true },
  
  // 🟢 NEW: Billing Address (Printed on Invoices)
  address: addressSchema,

  // 🟢 NEW: ERP Settings (Crucial for global scaling & reports)
  settings: {
    currency: { type: String, default: 'INR', uppercase: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    financialYearStart: { type: String, default: 'April' } // April for India, Jan for US
  },

  // --- Features & System ---
  features: { 
    whatsappEnabled: { type: Boolean, default: true }
  },
  whatsappWallet: { 
    credits: { type: Number, default: 0 } 
  },
  superAdminRole: { type: String, default: 'superadmin' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const Organization = mongoose.model('Organization', organizationSchema);
module.exports = Organization;




// const mongoose = require('mongoose');
// const organizationSchema = new mongoose.Schema({
//   name: {type: String, required: [true, 'Organization name is required'], trim: true,  },
//   uniqueShopId: {type: String, required: [true, 'A unique Shop ID is required'], unique: true, uppercase: true, trim: true,  },
//   owner: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true,  },
//   // members: [{type: mongoose.Schema.Types.ObjectId, ref: 'User',  }],
//   gstNumber: { type: String, trim: true, uppercase: true },
//   primaryEmail: {type: String, required: [true, 'Primary email is required'], trim: true, lowercase: true,  },
//   secondaryEmail: { type: String, trim: true, lowercase: true },
//   primaryPhone: {type: String, required: [true, 'Primary phone number is required'], trim: true,  },
//   secondaryPhone: { type: String, trim: true },
//   mainBranch: {type: mongoose.Schema.Types.ObjectId, ref: 'Branch',  },
//   branches: [{type: mongoose.Schema.Types.ObjectId, ref: 'Branch',  }],
//   superAdminRole: {type: String, default: 'superadmin',  },
//   isActive: {type: Boolean, default: true,  },
// }, { timestamps: true });
// // --- Hooks / Middleware ---
// // organizationSchema.pre('save', function (next) {
// //   if (this.isNew && this.owner && !this.members.includes(this.owner)) {this.members.push(this.owner);  }
// //   next();
// // });
// const Organization = mongoose.model('Organization', organizationSchema);
// module.exports = Organization;
