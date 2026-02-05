const mongoose = require("mongoose");
const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Template name is required"], trim: true, maxlength: 100, },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    sectionType: {
      type: String,
      required: true,
      enum: ["hero_banner", "video_hero", "product_slider", "product_grid", "featured_product", "feature_grid", "category_grid", "text_content", "split_image_text", "testimonial_slider", "logo_cloud", "instagram_feed", "stats_counter", "newsletter_signup", "countdown_timer", "faq_accordion", "pricing_table", "contact_form", "map_locations", "blog_feed",],
    },
    config: { type: mongoose.Schema.Types.Mixed, required: true, },
    // supportedDataSources: [{ type: String, enum: ["smart", "manual", "dynamic", "category"], },],
    previewImage: { type: String, trim: true, },
    styleTags: [{ type: String, enum: ["minimal", "dark", "colorful", "glass", "bold", "corporate"], },],
    category: { type: String, enum: ["hero", "content", "product", "marketing", "social", "navigation", "utility",], default: "content", },
    version: { type: String, default: "1.0.0", },
    usageCount: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: false },
    isSystemTemplate: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for fast filtering in the Page Builder UI
templateSchema.index({ sectionType: 1, isPublic: 1 });
templateSchema.index({ category: 1, isSystemTemplate: 1 });
templateSchema.index({ styleTags: 1 });

module.exports = mongoose.model("SectionTemplate", templateSchema);
