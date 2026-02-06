// src/models/storefront/sectionTemplate.model.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, maxlength: 500 },
  
  // Matches the SectionSchema type
  sectionType: { 
    type: String, 
    required: true,
    index: true
  },
  
  // The default config payload
  defaultConfig: { type: mongoose.Schema.Types.Mixed, required: true },
  
  previewImage: { type: String }, // URL
  category: { 
    type: String, 
    enum: ['hero', 'content', 'product', 'marketing', 'social', 'utility', 'navigation'], 
    default: 'content',
    index: true
  },
  styleTags: [{ type: String }], // e.g., 'dark', 'minimal', 'glass'
  
  isSystemTemplate: { type: Boolean, default: false }, // Provided by the Platform
  isPublic: { type: Boolean, default: false }, // Shared by community?
  isPremium: { type: Boolean, default: false },
  
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }, // For custom saved templates
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  usageCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('SectionTemplate', templateSchema);






// const mongoose = require("mongoose");
// const templateSchema = new mongoose.Schema(
//   {
//     name: { type: String, required: [true, "Template name is required"], trim: true, maxlength: 100, },

//     description: {
//       type: String,
//       trim: true,
//       maxlength: 500,
//     },
//     sectionType: {
//       type: String,
//       required: true,
//       enum: ["hero_banner", "video_hero", "product_slider", "product_grid", "featured_product", "feature_grid", "category_grid", "text_content", "split_image_text", "testimonial_slider", "logo_cloud", "instagram_feed", "stats_counter", "newsletter_signup", "countdown_timer", "faq_accordion", "pricing_table", "contact_form", "map_locations", "blog_feed",],
//     },
//     config: { type: mongoose.Schema.Types.Mixed, required: true, },
//     // supportedDataSources: [{ type: String, enum: ["smart", "manual", "dynamic", "category"], },],
//     previewImage: { type: String, trim: true, },
//     styleTags: [{ type: String, enum: ["minimal", "dark", "colorful", "glass", "bold", "corporate"], },],
//     category: { type: String, enum: ["hero", "content", "product", "marketing", "social", "navigation", "utility",], default: "content", },
//     version: { type: String, default: "1.0.0", },
//     usageCount: { type: Number, default: 0 },
//     isPublic: { type: Boolean, default: false },
//     isSystemTemplate: { type: Boolean, default: false },
//     isPremium: { type: Boolean, default: false },
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Organization",
//     },

//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },
//   },
//   {
//     timestamps: true,
//   },
// );

// // Indexes for fast filtering in the Page Builder UI
// templateSchema.index({ sectionType: 1, isPublic: 1 });
// templateSchema.index({ category: 1, isSystemTemplate: 1 });
// templateSchema.index({ styleTags: 1 });

// module.exports = mongoose.model("SectionTemplate", templateSchema);
