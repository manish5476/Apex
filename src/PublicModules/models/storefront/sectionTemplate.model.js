// src/models/storefront/sectionTemplate.model.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  // --- 1. IDENTITY ---
  name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },

  // ✅ UPDATED: Comprehensive list of modern UI sections
  sectionType: {
    type: String,
    required: true,
    enum: [
      // Hero & Headers
      'hero_banner',
      'video_hero',        // New
      
      // Products
      'product_slider',
      'product_grid',
      'featured_product',  // New (Single product focus)
      
      // Content & Layout
      'feature_grid',
      'category_grid',
      'text_content',
      'split_image_text',  // New (50% Image / 50% Text)
      
      // Trust & Social
      'testimonial_slider',
      'logo_cloud',        // New (Partner logos)
      'instagram_feed',    // New
      'stats_counter',     // New
      
      // Marketing & Utility
      'newsletter_signup', // New
      'countdown_timer',   // New
      'faq_accordion',     // New
      'pricing_table',     // New
      
      // Contact
      'contact_form',
      'map_locations',
      'blog_feed'
    ]
  },

  // --- 2. CONFIGURATION ---
  // The default JSON config that gets loaded when user selects this template
  config: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // ✅ NEW: Helps the UI know what data this template needs
  supportedDataSources: [{
    type: String,
    enum: ['static', 'smart', 'manual', 'dynamic', 'category']
  }],

  // --- 3. VISUAL METADATA ---
  previewImage: {
    type: String, // URL to a screenshot of the section
    trim: true
  },
  
  // ✅ NEW: Helps users find "Dark Mode" or "Minimal" templates
  styleTags: [{
    type: String, 
    enum: ['minimal', 'dark', 'colorful', 'glass', 'bold', 'corporate']
  }],

  category: {
    type: String,
    enum: ['hero', 'content', 'product', 'marketing', 'social', 'navigation', 'utility'],
    default: 'content'
  },

  // --- 4. SYSTEM & ACCESS ---
  version: {
    type: String,
    default: '1.0.0' // Versioning for backward compatibility
  },

  usageCount: { type: Number, default: 0 },
  isPublic: { type: Boolean, default: false }, // Visible to all orgs?
  isSystemTemplate: { type: Boolean, default: false }, // Created by Admin?
  isPremium: { type: Boolean, default: false }, // For monetization later

  // --- 5. OWNERSHIP ---
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for fast filtering in the Page Builder UI
templateSchema.index({ sectionType: 1, isPublic: 1 });
templateSchema.index({ category: 1, isSystemTemplate: 1 });
templateSchema.index({ 'styleTags': 1 });

module.exports = mongoose.model('SectionTemplate', templateSchema);

// // src/models/storefront/sectionTemplate.model.js
// const mongoose = require('mongoose');

// const templateSchema = new mongoose.Schema({
//   // Template identity
//   name: {
//     type: String,
//     required: [true, 'Template name is required'],
//     trim: true,
//     maxlength: [100, 'Template name cannot exceed 100 characters']
//   },
  
//   description: {
//     type: String,
//     trim: true,
//     maxlength: [500, 'Description cannot exceed 500 characters']
//   },
  
//   sectionType: {
//     type: String,
//     required: true,
//     enum: ['hero_banner','feature_grid','product_slider','product_grid','category_grid','text_content','testimonial_slider','contact_form','map_locations','blog_feed'
//     ]
//   },
  
//   // Template configuration
//   config: {
//     type: mongoose.Schema.Types.Mixed,
//     required: true
//   },
  
//   // Preview
//   previewImage: {
//     type: String,
//     trim: true
//   },
  
//   // Categorization
//   category: {
//     type: String,
//     enum: ['hero', 'content', 'product', 'contact', 'social', 'navigation', 'marketing'],
//     default: 'content'
//   },
  
//   tags: [{
//     type: String,
//     trim: true
//   }],
  
//   // Usage stats
//   usageCount: {
//     type: Number,
//     default: 0
//   },
  
//   // Visibility
//   isPublic: {
//     type: Boolean,
//     default: false
//   },
  
//   isSystemTemplate: {
//     type: Boolean,
//     default: false
//   },
  
//   // Organization-specific templates
//   organizationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Organization'
//   },
  
//   createdBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User'
//   }
// }, {
//   timestamps: true
// });

// // Indexes
// templateSchema.index({ sectionType: 1, isPublic: 1 });
// templateSchema.index({ category: 1 });
// templateSchema.index({ organizationId: 1 });

// module.exports = mongoose.model('SectionTemplate', templateSchema);