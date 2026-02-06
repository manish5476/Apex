const mongoose = require("mongoose");
const { nanoid } = require("nanoid");
const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');

/**
 * Sub-schema for Dynamic Page Sections
 */
const pageSectionSchema = new mongoose.Schema({
    id: { type: String, default: () => nanoid(8), required: true },
    type: {
        type: String,
        required: [true, "Section type is required"],
        trim: true,
        // Enforced in controller via Registry, but kept flexible here for templates
    },
    position: { type: Number, required: true, min: 0 },
    config: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
    
    // Dynamic Data Source Linking
    dataSource: { 
        type: String, 
        enum: ['static', 'dynamic', 'manual', 'smart_rule'], 
        default: 'static' 
    },
    smartRuleId: { type: mongoose.Schema.Types.ObjectId, ref: "SmartRule" },
    manualData: { 
        productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Master' }]
    },
    
    isActive: { type: Boolean, default: true },
    scheduledDisplay: {
        startAt: { type: Date },
        endAt: { type: Date }
    },
    deviceVisibility: {
        mobile: { type: Boolean, default: true },
        desktop: { type: Boolean, default: true }
    }
}, { _id: false });

/**
 * StorefrontPage Model
 * Represents individual URLs/Routes within the organization's storefront.
 */
const pageSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: [true, "Organization ID is required"],
        index: true,
    },
    name: {
        type: String,
        required: [true, "Page name is required"],
        trim: true,
        maxlength: 100,
    },
    slug: {
        type: String,
        required: [true, "Page slug is required"],
        trim: true,
        lowercase: true,
    },
    pageType: {
        type: String,
        required: true,
        enum: ["home", "products", "product_detail", "category", "blog", "about", "contact", "landing", "custom"],
        default: "custom",
    },

    // Content Hierarchy
    sections: [pageSectionSchema],

    // Comprehensive SEO & Social Media Data
    seo: {
        title: { type: String, trim: true, maxlength: 70 },
        description: { type: String, trim: true, maxlength: 160 },
        keywords: [{ type: String, trim: true }],
        canonical: { type: String },
        noIndex: { type: Boolean, default: false },
        // Social Media specific (OpenGraph)
        ogType: { type: String, default: 'website' },
        ogImage: { type: String },
        twitterCard: { type: String, default: 'summary_large_image' }
    },

    // Design System Override (Optional)
    designOverride: {
        useCustomTheme: { type: Boolean, default: false },
        presetId: { type: String, enum: VALID_THEME_IDS },
        customColors: {
            primary: String,
            background: String
        }
    },

    // Publishing Lifecycle
    status: { 
        type: String, 
        enum: ["draft", "published", "archived", "scheduled"], 
        default: "draft", 
        index: true 
    },
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    isHomepage: { type: Boolean, default: false, index: true },
    
    // Internal Metadata
    version: { type: Number, default: 1 },
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// --- CRITICAL INDEXES ---
// 1. Unique slug per store (Primary Lookup)
pageSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
// 2. Faster filtering for admin lists
pageSchema.index({ organizationId: 1, status: 1, isHomepage: 1 });

/**
 * Middleware: Lifecycle management for Homepages.
 * Ensures an organization has exactly one homepage.
 */
pageSchema.pre("save", async function (next) {
    if (this.isHomepage && (this.isNew || this.isModified("isHomepage"))) {
        await this.constructor.updateMany(
            { organizationId: this.organizationId, _id: { $ne: this._id } },
            { $set: { isHomepage: false } }
        );
    }
    // Auto-increment version on significant changes
    if (this.isModified('sections') || this.isModified('seo')) {
        this.version += 1;
    }
    next();
});

module.exports = mongoose.model("StorefrontPage", pageSchema);

// const mongoose = require("mongoose");
// const { nanoid } = require("nanoid");
// const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');

// const sectionSchema = new mongoose.Schema(
//   {
//     id: {
//       type: String,
//       default: () => nanoid(8),
//       required: true,
//     },

//     // ✅ UPDATED: Complete List of "Best UI" Sections
//     type: {
//       type: String,
//       required: [true, "Section type is required"],
//       trim: true,
//       enum: [
//         // Hero
//         "hero_banner",
//         "video_hero",

//         // Products
//         "product_slider",
//         "product_grid",
//         "featured_product",

//         // Content & Layout
//         "feature_grid",
//         "category_grid",
//         "text_content",
//         "split_image_text",

//         // Trust & Social
//         "testimonial_slider",
//         "logo_cloud",
//         "instagram_feed",
//         "stats_counter",

//         // Marketing & Utility
//         "newsletter_signup",
//         "countdown_timer",
//         "faq_accordion",
//         "pricing_table",
//         "cta_banner",

//         // Contact & Misc
//         "contact_form",
//         "map_locations",
//         "blog_feed",
//         "image_gallery",
//         "social_proof",
//       ],
//     },

//     position: {
//       type: Number,
//       required: true,
//       min: 0,
//     },

//     config: {
//       type: mongoose.Schema.Types.Mixed,
//       required: true,
//       default: {},
//     },

//     // Data Source Configuration
//     // dataSource: {
//     //   type: String,
//     //   enum: ["static", "smart", "manual", "dynamic", "category"],
//     //   default: "dynamic",
//     // },

//     // For Smart Rules (Best Sellers, etc.)
//     smartRuleId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "SmartRule",
//     },

//     // For Manual Product Selection
//     manualData: {
//       type: mongoose.Schema.Types.Mixed,
//       // Structure: { productIds: [ObjectId], categoryIds: [ObjectId] }
//     },

//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//   },
//   { _id: false },
// );

// const pageSchema = new mongoose.Schema(
//   {
//     // --- 1. CORE IDENTITY ---
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Organization",
//       required: [true, "Organization ID is required"],
//       index: true,
//     },

//     name: {
//       type: String,
//       required: [true, "Page name is required"],
//       trim: true,
//       maxlength: [100, "Page name cannot exceed 100 characters"],
//     },

//     slug: {
//       type: String,
//       required: [true, "Page slug is required"],
//       trim: true,
//       lowercase: true,
//       match: [
//         /^[a-z0-9-]+$/,
//         "Slug can only contain lowercase letters, numbers, and hyphens",
//       ],
//     },

//     pageType: {
//       type: String,
//       required: true,
//       enum: [
//         "home",
//         "products",
//         "product_detail",
//         "category",
//         "blog",
//         "about",
//         "contact",
//         "landing",
//         "custom",
//       ],
//       default: "custom",
//     },

//     // --- 2. CONTENT ---
//     sections: [sectionSchema],

//     // --- 3. SEO & SOCIAL ---
//     seo: {
//       title: { type: String, trim: true, maxlength: 60 },
//       description: { type: String, trim: true, maxlength: 160 },
//       keywords: [{ type: String, trim: true }],
//       ogImage: { type: String, trim: true }, // Social Share Image
//       canonicalUrl: { type: String, trim: true },
//       noIndex: { type: Boolean, default: false },
//     },

//     // --- 4. PAGE-SPECIFIC THEME OVERRIDES ---
//     // (Optional: Allows a "Black Friday" page to look different from the main site)
//     theme: {
//       primaryColor: {
//         type: String,
//         match: [/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"],
//       },
//       secondaryColor: {
//         type: String,
//         match: [/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"],
//       },
//       backgroundColor: { type: String, default: "#FDFCF8" }, // Page Background
//       fontFamily: { type: String },
//       borderRadius: { type: String, enum: ["none", "sm", "md", "lg", "xl"] },
//     },

//     // --- 5. PUBLISHING ---
//     status: {
//       type: String,
//       enum: ["draft", "published", "archived"],
//       default: "draft",
//       index: true,
//     },
//     isPublished: { type: Boolean, default: false, index: true },
//     publishedAt: { type: Date },

//     isHomepage: { type: Boolean, default: false },

//     // --- 6. METADATA ---
//     version: { type: Number, default: 1 },
//     viewCount: { type: Number, default: 0 },
//     lastViewedAt: { type: Date },

//     // --- 4. PAGE DESIGN SYSTEM (The Boss) ---
//     theme: {
//       mode: {
//         type: String,
//         enum: ["preset", "custom"],
//         default: "preset",
//       },
//       presetId: {
//         type: String,
//         enum: VALID_THEME_IDS,
//         default: "auto-theme",
//       },
//       variant: { type: String, default: "default" },
//       // 🅱️ OPTION B: CUSTOM (Manual Control)
//       // Applies ONLY if mode === 'custom'. Ignored otherwise.
//       customSettings: {
//         backgroundColor: { type: String, default: "#ffffff" },
//         backgroundImage: { type: String },
//         primaryColor: { type: String },
//         secondaryColor: { type: String },
//         fontFamily: { type: String, default: "Inter" },
//       },
//     },

//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   },
//   {
//     timestamps: true,
//     toJSON: { virtuals: true },
//     toObject: { virtuals: true },
//   },
// );

// // Indexes
// pageSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
// pageSchema.index({ organizationId: 1, isHomepage: 1 });

// // Ensure only one Homepage per Org
// pageSchema.pre("save", async function (next) {
//   if (this.isHomepage && (this.isNew || this.isModified("isHomepage"))) {
//     try {
//       await this.constructor.updateMany(
//         { organizationId: this.organizationId, _id: { $ne: this._id } },
//         { $set: { isHomepage: false } },
//       );
//     } catch (error) {
//       return next(error);
//     }
//   }

//   // Auto SEO Fallback
//   if (!this.seo.title && this.name) {
//     this.seo.title = this.name;
//   }

//   next();
// });

// module.exports = mongoose.model("StorefrontPage", pageSchema);
