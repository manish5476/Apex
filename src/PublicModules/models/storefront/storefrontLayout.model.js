const mongoose = require('mongoose');

const layoutSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    unique: true, // critical: ensures only one active layout per store
    index: true
  },

  // 1. Fixed Header Sections (Array of sections, just like Page sections)
  header: [{
    id: { type: String, required: true },
    type: { type: String, required: true }, // e.g., 'navbar_simple', 'announcement_bar'
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  }],

  // 2. Fixed Footer Sections
  footer: [{
    id: { type: String, required: true },
    type: { type: String, required: true }, // e.g., 'footer_complex', 'newsletter_signup'
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  }],

  // 3. Global Site Settings (Optimized location for site-wide data)
  globalSettings: {
    favicon: { type: String }, // URL to favicon
    logo: {
      url: { type: String },
      altText: { type: String },
      width: { type: Number }
    },
    socialLinks: {
      facebook: String,
      instagram: String,
      twitter: String,
      linkedin: String
    },
    defaultSeo: {
      siteName: { type: String },
      defaultImage: { type: String }
    },
    theme: {
      // Global colors/fonts if you want to enforce them site-wide
      primaryColor: String,
      secondaryColor: String,
      fontFamily: String
    }
  },

  // 4. Versioning (Good for "Undo" features in your builder)
  version: { type: Number, default: 1 }

}, { 
  timestamps: true 
});

module.exports = mongoose.model('StorefrontLayout', layoutSchema);