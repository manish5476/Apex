// src/storefront/models/storefrontLayout.model.js
const mongoose = require('mongoose');
const { sectionSchema } = require('./schemas/section.schema');
const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');

const globalSettingsSchema = new mongoose.Schema({
  favicon:  { type: String },
  logo: {
    url:     { type: String },
    altText: { type: String },
    width:   { type: Number, default: 150 }
  },
  typography: {
    headingFont: { type: String, default: 'Poppins' },
    bodyFont:    { type: String, default: 'Inter' }
  },
  colors: {
    primary:   { type: String, default: '#2563eb' },
    secondary: { type: String, default: '#475569' },
    accent:    { type: String, default: '#f59e0b' }
  },
  socialLinks: {
    facebook:  String,
    instagram: String,
    twitter:   String,
    linkedin:  String,
    youtube:   String
  },
  defaultSeo: {
    siteName:     { type: String, required: true, default: 'My Store' },
    defaultImage: { type: String },
    titleSuffix:  { type: String, default: '| My Store' }
  },
  // Commerce settings embedded here — avoids a separate config collection
  commerce: {
    currency:         { type: String, default: 'INR' },
    currencySymbol:   { type: String, default: '₹' },
    allowGuestCheckout: { type: Boolean, default: true },
    taxDisplayMode:   { type: String, enum: ['inclusive', 'exclusive', 'hidden'], default: 'inclusive' },
    shippingEnabled:  { type: Boolean, default: false },
    minOrderAmount:   { type: Number, default: 0 }
  }
}, { _id: false });

const layoutSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    unique: true,
    index: true
  },
  globalSettings: { type: globalSettingsSchema, default: () => ({}) },
  header: { type: [sectionSchema], default: [] },
  footer: { type: [sectionSchema], default: [] },
  version: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.model('StorefrontLayout', layoutSchema);



// // src/models/storefront/storefrontLayout.model.js
// const mongoose = require('mongoose');
// const sectionSchema = require('./schemas/section.schema');

// const layoutSchema = new mongoose.Schema({
//   organizationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Organization',
//     required: true,
//     unique: true, // One active layout per store
//     index: true
//   },
//   globalSettings: {
//     favicon: { type: String },
//     logo: {
//       url: { type: String },
//       altText: { type: String },
//       width: { type: Number, default: 150 } // px
//     },
//     typography: {
//       headingFont: { type: String, default: 'Poppins' },
//       bodyFont: { type: String, default: 'Inter' }
//     },
//     colors: {
//       primary: { type: String, default: '#2563eb' }, 
//       secondary: { type: String, default: '#475569' }, 
//       accent: { type: String, default: '#f59e0b' } 
//     },
//     socialLinks: {
//       facebook: String,
//       instagram: String,
//       twitter: String,
//       linkedin: String,
//       youtube: String
//     },
//     defaultSeo: {
//       siteName: { type: String, required: true },
//       defaultImage: { type: String },
//       titleSuffix: { type: String, default: '| My Store' }
//     }
//   },

//   // Dynamic Header & Footer (Array of sections allows TopBar + NavBar + PromoBanner)
//   header: [sectionSchema],
//   footer: [sectionSchema],

//   version: { type: Number, default: 1 }
// }, {
//   timestamps: true
// });

// module.exports = mongoose.model('StorefrontLayout', layoutSchema);