// src/models/storefront/sectionTemplate.model.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  // Template identity
  name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true,
    maxlength: [100, 'Template name cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  sectionType: {
    type: String,
    required: true,
    enum: [
      'hero_banner',
      'feature_grid',
      'product_slider',
      'product_grid',
      'category_grid',
      'text_content',
      'testimonial_slider',
      'contact_form',
      'map_locations',
      'blog_feed'
    ]
  },
  
  // Template configuration
  config: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Preview
  previewImage: {
    type: String,
    trim: true
  },
  
  // Categorization
  category: {
    type: String,
    enum: ['hero', 'content', 'product', 'contact', 'social', 'navigation', 'marketing'],
    default: 'content'
  },
  
  tags: [{
    type: String,
    trim: true
  }],
  
  // Usage stats
  usageCount: {
    type: Number,
    default: 0
  },
  
  // Visibility
  isPublic: {
    type: Boolean,
    default: false
  },
  
  isSystemTemplate: {
    type: Boolean,
    default: false
  },
  
  // Organization-specific templates
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

// Indexes
templateSchema.index({ sectionType: 1, isPublic: 1 });
templateSchema.index({ category: 1 });
templateSchema.index({ organizationId: 1 });

module.exports = mongoose.model('SectionTemplate', templateSchema);