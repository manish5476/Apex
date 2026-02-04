// src/models/storefront/storefrontLayout.model.js
const mongoose = require('mongoose');

const layoutSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    unique: true, // Critical: One active layout per store
    index: true
  },

  // --- 1. THEME ENGINE (Synced with Angular) ---
  themeConfig: {
    // Matches the 'id' in your Angular allThemes array (e.g., 'theme-bio-frost')
    activeThemeId: { 
      type: String, 
      default: 'auto-theme',
      required: true 
    },

    // Mode override (independent of the theme's default nature)
    mode: {
      type: String,
      enum: ['system', 'light', 'dark'],
      default: 'system'
    },

    // User overrides. If null, frontend uses the default values from 'allThemes'
    overrides: {
      primaryColor: { type: String, match: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i },
      secondaryColor: { type: String, match: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i },
      
      // UI Density & Shape
      borderRadius: { 
        type: String, 
        enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'], 
        default: 'md' 
      },
      
      // Specific to your "Glass" themes
      glassEffect: {
        enabled: { type: Boolean, default: true },
        blur: { type: Number, min: 0, max: 20, default: 10 },
        opacity: { type: Number, min: 0, max: 1, default: 0.7 }
      }
    }
  },

  // --- 2. HEADER SECTIONS ---
  header: [{ 
    id: { type: String, required: true },
    type: { type: String, required: true }, // e.g., 'navbar_simple'
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  }],

  // --- 3. FOOTER SECTIONS ---
  footer: [{ 
    id: { type: String, required: true },
    type: { type: String, required: true }, 
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  }],

  // --- 4. GLOBAL SETTINGS ---
  globalSettings: {
    favicon: String,
    logo: {
      url: String,
      altText: String,
      width: Number 
    },
    socialLinks: {
      facebook: String,
      instagram: String,
      twitter: String,
      linkedin: String,
      youtube: String
    },
    // Enterprise Feature: Global Scripts (Pixels, Analytics)
    customScripts: {
      head: String, 
      body: String
    }
  },

  version: { type: Number, default: 1 }

}, { timestamps: true });

module.exports = mongoose.model('StorefrontLayout', layoutSchema);

// // src/models/storefront/storefrontLayout.model.js
// const mongoose = require('mongoose');

// const layoutSchema = new mongoose.Schema({
//   organizationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Organization',
//     required: true,
//     unique: true, // Critical: One active layout per store
//     index: true
//   },

//   // --- 1. THEME ENGINE (Synced with Angular) ---
//   themeConfig: {
//     // Matches the 'id' in your Angular allThemes array
//     activeThemeId: { 
//       type: String, 
//       default: 'auto-theme',
//       required: true 
//     },

//     // Mode override (independent of the theme's default nature)
//     mode: {
//       type: String,
//       enum: ['system', 'light', 'dark'],
//       default: 'system'
//     },

//     // "Pro" feature: User overrides specific parts of the selected theme
//     // If null, the frontend uses the default values from 'allThemes'
//     overrides: {
//       primaryColor: { type: String, match: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i },
//       secondaryColor: { type: String, match: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i },
      
//       // Font selection
//       headingFont: { type: String, default: 'Inter' },
//       bodyFont: { type: String, default: 'Inter' },
      
//       // UI Density & Shape
//       borderRadius: { 
//         type: String, 
//         enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'], 
//         default: 'md' 
//       },
      
//       // Specific to your "Glass" and "Bio Frost" themes
//       glassEffect: {
//         enabled: { type: Boolean, default: true },
//         blur: { type: Number, min: 0, max: 20, default: 10 },
//         opacity: { type: Number, min: 0, max: 1, default: 0.7 }
//       }
//     }
//   },

//   // --- 2. HEADER CONFIGURATION ---
//   header: [{ 
//     id: String,
//     type: String, // e.g., 'navbar_simple', 'navbar_centered'
//     config: mongoose.Schema.Types.Mixed, // Logo, menu items, transparent bg, etc.
//     position: { type: Number, default: 0 },
//     isActive: { type: Boolean, default: true }
//   }],

//   // --- 3. FOOTER CONFIGURATION ---
//   footer: [{ 
//     id: String,
//     type: String, 
//     config: mongoose.Schema.Types.Mixed,
//     position: { type: Number, default: 0 },
//     isActive: { type: Boolean, default: true }
//   }],

//   // --- 4. GLOBAL SETTINGS ---
//   globalSettings: {
//     favicon: String,
//     logo: {
//       url: String,
//       altText: String,
//       width: Number // For forcing size in CSS
//     },
//     socialLinks: {
//       facebook: String,
//       instagram: String,
//       twitter: String,
//       linkedin: String,
//       youtube: String
//     },
//     contactInfo: {
//       email: String,
//       phone: String,
//       address: String
//     },
//     // Custom Scripts (Pixels, Analytics) - Enterprise Feature
//     customScripts: {
//       head: String,
//       body: String
//     }
//   },

//   // Versioning for "Undo" functionality
//   version: { type: Number, default: 1 }

// }, { timestamps: true });

// module.exports = mongoose.model('StorefrontLayout', layoutSchema);

// // // src/models/storefront/storefrontLayout.model.js
// // const mongoose = require('mongoose');

// // const layoutSchema = new mongoose.Schema({
// //   organizationId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Organization',
// //     required: true,
// //     unique: true,
// //     index: true
// //   },

// //   // 1. Navigation & Branding
// //   header: [{ 
// //     id: String,
// //     type: String,
// //     config: mongoose.Schema.Types.Mixed,
// //     isActive: { type: Boolean, default: true }
// //   }],

// //   // 2. Footer Area
// //   footer: [{ 
// //     id: String,
// //     type: String,
// //     config: mongoose.Schema.Types.Mixed,
// //     isActive: { type: Boolean, default: true }
// //   }],

// //   // 3. Global Design System (Used by all sections)
// //   themeConfig: {
// //     colors: {
// //       primary: { type: String, default: '#000000' },
// //       secondary: { type: String, default: '#ffffff' },
// //       accent: { type: String, default: '#3b82f6' },
// //       background: { type: String, default: '#ffffff' },
// //       text: { type: String, default: '#111827' }
// //     },
// //     typography: {
// //       headingFont: { type: String, default: 'Inter' },
// //       bodyFont: { type: String, default: 'Inter' },
// //       scale: { type: Number, default: 1 } // Font size multiplier
// //     },
// //     borderRadius: { type: String, enum: ['none', 'sm', 'md', 'lg', 'full'], default: 'md' },
// //     buttonStyle: { type: String, enum: ['solid', 'outline', 'flat'], default: 'solid' }
// //   },

// //   // 4. Functional Settings
// //   globalSettings: {
// //     favicon: String,
// //     socialLinks: {
// //       facebook: String,
// //       instagram: String,
// //       twitter: String,
// //       linkedin: String,
// //       youtube: String
// //     },
// //     checkout: {
// //       guestCheckout: { type: Boolean, default: true },
// //       minOrderAmount: Number
// //     },
// //     // Global Scripts (Google Analytics, Chat Widgets)
// //     customScripts: {
// //       head: String,
// //       body: String
// //     }
// //   },

// //   version: { type: Number, default: 1 }

// // }, { timestamps: true });

// // module.exports = mongoose.model('StorefrontLayout', layoutSchema);

// // // const mongoose = require('mongoose');

// // // const layoutSchema = new mongoose.Schema({
// // //   organizationId: {
// // //     type: mongoose.Schema.Types.ObjectId,
// // //     ref: 'Organization',
// // //     required: true,
// // //     unique: true, // critical: ensures only one active layout per store
// // //     index: true
// // //   },

// // //   // 1. Fixed Header Sections (Array of sections, just like Page sections)
// // //   header: [{
// // //     id: { type: String, required: true },
// // //     type: { type: String, required: true }, // e.g., 'navbar_simple', 'announcement_bar'
// // //     config: { type: mongoose.Schema.Types.Mixed, default: {} },
// // //     position: { type: Number, default: 0 },
// // //     isActive: { type: Boolean, default: true }
// // //   }],

// // //   // 2. Fixed Footer Sections
// // //   footer: [{
// // //     id: { type: String, required: true },
// // //     type: { type: String, required: true }, // e.g., 'footer_complex', 'newsletter_signup'
// // //     config: { type: mongoose.Schema.Types.Mixed, default: {} },
// // //     position: { type: Number, default: 0 },
// // //     isActive: { type: Boolean, default: true }
// // //   }],

// // //   // 3. Global Site Settings (Optimized location for site-wide data)
// // //   globalSettings: {
// // //     favicon: { type: String }, // URL to favicon
// // //     logo: {
// // //       url: { type: String },
// // //       altText: { type: String },
// // //       width: { type: Number }
// // //     },
// // //     socialLinks: {
// // //       facebook: String,
// // //       instagram: String,
// // //       twitter: String,
// // //       linkedin: String
// // //     },
// // //     defaultSeo: {
// // //       siteName: { type: String },
// // //       defaultImage: { type: String }
// // //     },
// // //     theme: {
// // //       // Global colors/fonts if you want to enforce them site-wide
// // //       primaryColor: String,
// // //       secondaryColor: String,
// // //       fontFamily: String
// // //     }
// // //   },

// // //   // 4. Versioning (Good for "Undo" features in your builder)
// // //   version: { type: Number, default: 1 }

// // // }, { 
// // //   timestamps: true 
// // // });

// // // module.exports = mongoose.model('StorefrontLayout', layoutSchema);