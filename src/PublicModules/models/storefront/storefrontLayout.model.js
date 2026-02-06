const mongoose = require('mongoose');

/**
 * Sub-schema for UI Sections (Header/Footer components)
 */
const layoutSectionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    type: { 
        type: String, 
        required: true,
        enum: ['navbar_classic', 'navbar_centered', 'footer_minimal', 'footer_detailed', 'promo_bar', 'cookie_consent']
    },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    visibility: {
        desktop: { type: Boolean, default: true },
        mobile: { type: Boolean, default: true }
    }
}, { _id: false });

/**
 * StorefrontLayout Model
 * Manages global site-wide settings, branding, and shell components.
 */
const layoutSchema = new mongoose.Schema({
    organizationId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Organization', 
        required: true, 
        unique: true, 
        index: true 
    },
    // The "Shell" components
    header: [layoutSectionSchema],
    footer: [layoutSectionSchema],
    
    // Global Branding & Design System
    branding: {
        favicon: { type: String },
        logo: {
            url: { type: String },
            altText: { type: String },
            width: { type: Number, default: 150 }
        },
        stickyHeader: { type: Boolean, default: true }
    },

    // Centralized Design System Tokens
    designTokens: {
        colors: {
            primary: { type: String, default: '#2563eb' },
            secondary: { type: String, default: '#64748b' },
            accent: { type: String, default: '#f59e0b' },
            background: { type: String, default: '#ffffff' },
            surface: { type: String, default: '#f8fafc' }
        },
        typography: {
            headings: { type: String, default: 'Inter' },
            body: { type: String, default: 'Inter' },
            baseFontSize: { type: Number, default: 16 }
        },
        borderRadius: { 
            type: String, 
            enum: ['none', 'sm', 'md', 'lg', 'full'], 
            default: 'md' 
        }
    },

    // Global SEO Fallbacks
    globalSeo: {
        siteName: { type: String, trim: true },
        titleSeparator: { type: String, default: '|' },
        defaultDescription: { type: String, maxlength: 160 },
        defaultOgImage: { type: String },
        socialLinks: {
            facebook: String,
            instagram: String,
            twitter: String,
            linkedin: String,
            youtube: String
        }
    },

    // Tracking & Compliance
    analytics: {
        googleAnalyticsId: { type: String },
        facebookPixelId: { type: String },
        customHeadScripts: { type: String }
    },

    version: { type: Number, default: 1 }
}, {
    timestamps: true,
    minimize: false
});

// Optimized for organization-based lookups
layoutSchema.index({ organizationId: 1 });

module.exports = mongoose.model('StorefrontLayout', layoutSchema);
// const mongoose = require('mongoose');

// const layoutSchema = new mongoose.Schema({
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true },
//   header: [{ id: { type: String, required: true }, type: { type: String, required: true }, config: { type: mongoose.Schema.Types.Mixed, default: {} }, position: { type: Number, default: 0 }, isActive: { type: Boolean, default: true } }],
//   footer: [{ id: { type: String, required: true }, type: { type: String, required: true }, config: { type: mongoose.Schema.Types.Mixed, default: {} }, position: { type: Number, default: 0 }, isActive: { type: Boolean, default: true } }],
//   globalSettings: { favicon: { type: String }, logo: { url: { type: String }, altText: { type: String }, width: { type: Number } }, socialLinks: { facebook: String, instagram: String, twitter: String, linkedin: String }, defaultSeo: { siteName: { type: String }, defaultImage: { type: String } }, theme: { primaryColor: String, secondaryColor: String, fontFamily: String } },
//   version: { type: Number, default: 1 }

// }, {
//   timestamps: true
// });

// module.exports = mongoose.model('StorefrontLayout', layoutSchema);
