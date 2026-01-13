// src/models/storefront/storefrontPage.model.js
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const sectionSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => nanoid(8),
    required: true
  },
  type: {
    type: String,
    required: [true, 'Section type is required'],
    trim: true,
    enum: [
      'hero_banner',
      'feature_grid',
      'product_slider',
      'category_grid',
      'text_content',
      'testimonial_slider',
      'contact_form',
      'map_locations',
      'blog_feed',
      'image_gallery',
      'video_section',
      'cta_banner',
      'social_proof',
      'pricing_table',
      'faq_section',
      'product_grid'  // NEW: For product listing pages
    ]
  },
  position: {
    type: Number,
    required: true,
    min: 0
  },
  config: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    default: {}
  },
  dataSource: {
    type: String,
    enum: ['static', 'smart', 'manual', 'dynamic', 'category'],
    default: 'static'
  },
  smartRuleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SmartRule'
  },
  categoryFilter: {
    type: String,
    trim: true
  },
  manualData: {
    type: mongoose.Schema.Types.Mixed
  },
  isActive: {
    type: Boolean,
    default: true
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const pageSchema = new mongoose.Schema({
  // Core identifiers
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: [true, 'Organization ID is required'],
    index: true
  },
  
  // Page identity
  name: {
    type: String,
    required: [true, 'Page name is required'],
    trim: true,
    maxlength: [100, 'Page name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    required: [true, 'Page slug is required'],
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens']
  },
  pageType: {
    type: String,
    required: true,
    enum: ['home', 'products', 'product_detail', 'category', 'blog', 'about', 'contact', 'custom'],
    default: 'custom'
  },
  
  // Content structure
  sections: [sectionSchema],
  
  // SEO & Metadata
  seo: {
    title: {
      type: String,
      trim: true,
      maxlength: [60, 'SEO title cannot exceed 60 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [160, 'SEO description cannot exceed 160 characters']
    },
    keywords: [{
      type: String,
      trim: true
    }],
    ogImage: {
      type: String,
      trim: true
    },
    canonicalUrl: {
      type: String,
      trim: true
    },
    noIndex: {
      type: Boolean,
      default: false
    }
  },
  
  // Theme & Design
  theme: {
    primaryColor: {
      type: String,
      default: '#3B82F6',
      match: [/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color']
    },
    secondaryColor: {
      type: String,
      default: '#10B981',
      match: [/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color']
    },
    fontFamily: {
      type: String,
      default: 'Inter, system-ui, sans-serif'
    },
    borderRadius: {
      type: String,
      enum: ['none', 'sm', 'md', 'lg', 'xl'],
      default: 'md'
    },
    containerWidth: {
      type: String,
      enum: ['full', 'wide', 'standard', 'narrow'],
      default: 'standard'
    }
  },
  
  // Settings
  isPublished: {
    type: Boolean,
    default: false,
    index: true
  },
  publishedAt: {
    type: Date
  },
  isHomepage: {
    type: Boolean,
    default: false
  },
  
  // Versioning
  version: {
    type: Number,
    default: 1
  },
  parentVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StorefrontPage'
  },
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  lastViewedAt: {
    type: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full URL
pageSchema.virtual('fullUrl').get(function() {
  const org = this.organizationId;
  return `${process.env.BASE_URL || ''}/store/${org.uniqueShopId || org._id}/${this.slug}`;
});

// Indexes
pageSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
pageSchema.index({ organizationId: 1, isHomepage: 1 });
pageSchema.index({ organizationId: 1, pageType: 1 });
pageSchema.index({ organizationId: 1, status: 1 });
pageSchema.index({ organizationId: 1, isPublished: 1, slug: 1 });

// Middleware to ensure only one homepage per organization
pageSchema.pre('save', async function(next) {
  if (this.isHomepage && this.isModified('isHomepage')) {
    try {
      await this.constructor.updateMany(
        { 
          organizationId: this.organizationId,
          _id: { $ne: this._id }
        },
        { $set: { isHomepage: false } }
      );
    } catch (error) {
      return next(error);
    }
  }
  
  // Auto-generate SEO title if not provided
  if (!this.seo.title && this.name) {
    this.seo.title = `${this.name} - ${this.organizationId.name || 'Store'}`;
  }
  
  // Auto-generate SEO description if not provided
  if (!this.seo.description && this.name) {
    this.seo.description = `Explore ${this.name} at our store. Find the best products and services.`;
  }
  
  next();
});

module.exports = mongoose.model('StorefrontPage', pageSchema);