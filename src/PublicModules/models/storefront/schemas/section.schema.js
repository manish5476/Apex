// src/models/storefront/schemas/section.schema.js
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

/**
 * Section Schema
 * Represents a single UI block (Hero, Product Grid, etc.)
 * Used in: StorefrontPage, StorefrontLayout
 */
const sectionSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => nanoid(10), // Short, URL-safe unique ID for UI keys
    required: true
  },
  type: {
    type: String,
    required: [true, 'Section type is required'],
    trim: true,
    // Enum ensures UI doesn't crash trying to render unknown components
    enum: [
      // Hero
      'hero_banner', 'video_hero',
      // Commerce
      'product_slider', 'product_grid', 'product_listing', 'featured_product',
      // Content
      'text_content', 'split_image_text', 'feature_grid', 'faq_accordion', 'blog_feed',
      // Marketing
      'newsletter_signup', 'countdown_timer', 'pricing_table', 'stats_counter',
      // Social
      'testimonial_slider', 'logo_cloud', 'instagram_feed',
      // Utility
      'map_locations', 'contact_form', 'divider', 'spacer',
      // Navigation (Specific to Layouts)
      'navbar_simple', 'navbar_mega', 'footer_simple', 'footer_complex'
    ]
  },
  // The configuration payload (Validated by Joi/Zod in Controller before saving)
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Visual Styles specific to this section instance (Padding, Margin, Background)
  styles: {
    backgroundColor: { type: String }, // Hex or CSS Var
    paddingTop: { type: String, default: '4rem' },
    paddingBottom: { type: String, default: '4rem' },
    themeMode: { type: String, enum: ['light', 'dark', 'glass', 'auto'], default: 'auto' }
  },
  // For manually selected data (e.g., "Handpicked Products")
  manualData: {
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Master' }],
    imageUrls: [{ type: String }]
  },
  // For automated data (e.g., "Best Sellers")
  smartRuleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SmartRule'
  },
  isActive: { type: Boolean, default: true },
  isHiddenOnMobile: { type: Boolean, default: false },
  isHiddenOnDesktop: { type: Boolean, default: false }
}, {
  _id: false, // We use 'id' (nanoid) for frontend keys, not Mongo _id
  timestamps: false
});

module.exports = sectionSchema;