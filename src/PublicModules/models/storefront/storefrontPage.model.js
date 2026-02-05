const mongoose = require("mongoose");
const { nanoid } = require("nanoid");
const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');

const sectionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => nanoid(8),
      required: true,
    },

    // ✅ UPDATED: Complete List of "Best UI" Sections
    type: {
      type: String,
      required: [true, "Section type is required"],
      trim: true,
      enum: [
        // Hero
        "hero_banner",
        "video_hero",

        // Products
        "product_slider",
        "product_grid",
        "featured_product",

        // Content & Layout
        "feature_grid",
        "category_grid",
        "text_content",
        "split_image_text",

        // Trust & Social
        "testimonial_slider",
        "logo_cloud",
        "instagram_feed",
        "stats_counter",

        // Marketing & Utility
        "newsletter_signup",
        "countdown_timer",
        "faq_accordion",
        "pricing_table",
        "cta_banner",

        // Contact & Misc
        "contact_form",
        "map_locations",
        "blog_feed",
        "image_gallery",
        "social_proof",
      ],
    },

    position: {
      type: Number,
      required: true,
      min: 0,
    },

    config: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },

    // Data Source Configuration
    // dataSource: {
    //   type: String,
    //   enum: ["static", "smart", "manual", "dynamic", "category"],
    //   default: "dynamic",
    // },

    // For Smart Rules (Best Sellers, etc.)
    smartRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SmartRule",
    },

    // For Manual Product Selection
    manualData: {
      type: mongoose.Schema.Types.Mixed,
      // Structure: { productIds: [ObjectId], categoryIds: [ObjectId] }
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const pageSchema = new mongoose.Schema(
  {
    // --- 1. CORE IDENTITY ---
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
      maxlength: [100, "Page name cannot exceed 100 characters"],
    },

    slug: {
      type: String,
      required: [true, "Page slug is required"],
      trim: true,
      lowercase: true,
      match: [
        /^[a-z0-9-]+$/,
        "Slug can only contain lowercase letters, numbers, and hyphens",
      ],
    },

    pageType: {
      type: String,
      required: true,
      enum: [
        "home",
        "products",
        "product_detail",
        "category",
        "blog",
        "about",
        "contact",
        "landing",
        "custom",
      ],
      default: "custom",
    },

    // --- 2. CONTENT ---
    sections: [sectionSchema],

    // --- 3. SEO & SOCIAL ---
    seo: {
      title: { type: String, trim: true, maxlength: 60 },
      description: { type: String, trim: true, maxlength: 160 },
      keywords: [{ type: String, trim: true }],
      ogImage: { type: String, trim: true }, // Social Share Image
      canonicalUrl: { type: String, trim: true },
      noIndex: { type: Boolean, default: false },
    },

    // --- 4. PAGE-SPECIFIC THEME OVERRIDES ---
    // (Optional: Allows a "Black Friday" page to look different from the main site)
    theme: {
      primaryColor: {
        type: String,
        match: [/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"],
      },
      secondaryColor: {
        type: String,
        match: [/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"],
      },
      backgroundColor: { type: String, default: "#FDFCF8" }, // Page Background
      fontFamily: { type: String },
      borderRadius: { type: String, enum: ["none", "sm", "md", "lg", "xl"] },
    },

    // --- 5. PUBLISHING ---
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },

    isHomepage: { type: Boolean, default: false },

    // --- 6. METADATA ---
    version: { type: Number, default: 1 },
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date },

    // --- 4. PAGE DESIGN SYSTEM (The Boss) ---
    theme: {
      mode: {
        type: String,
        enum: ["preset", "custom"],
        default: "preset",
      },
      presetId: {
        type: String,
        enum: VALID_THEME_IDS,
        default: "auto-theme",
      },
      variant: { type: String, default: "default" },
      // 🅱️ OPTION B: CUSTOM (Manual Control)
      // Applies ONLY if mode === 'custom'. Ignored otherwise.
      customSettings: {
        backgroundColor: { type: String, default: "#ffffff" },
        backgroundImage: { type: String },
        primaryColor: { type: String },
        secondaryColor: { type: String },
        fontFamily: { type: String, default: "Inter" },
      },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
pageSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
pageSchema.index({ organizationId: 1, isHomepage: 1 });

// Ensure only one Homepage per Org
pageSchema.pre("save", async function (next) {
  if (this.isHomepage && (this.isNew || this.isModified("isHomepage"))) {
    try {
      await this.constructor.updateMany(
        { organizationId: this.organizationId, _id: { $ne: this._id } },
        { $set: { isHomepage: false } },
      );
    } catch (error) {
      return next(error);
    }
  }

  // Auto SEO Fallback
  if (!this.seo.title && this.name) {
    this.seo.title = this.name;
  }

  next();
});

module.exports = mongoose.model("StorefrontPage", pageSchema);
