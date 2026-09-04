// src/storefront/models/storefrontPage.model.js
const mongoose = require('mongoose');
const { sectionSchema } = require('./schemas/section.schema');
const { VALID_THEME_IDS } = require('../../utils/constants/storefront/themes.constants');
// ../../utils/constants/storefront/themes.constants
const pageSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Page name is required'],
    trim: true,
    maxlength: [100, 'Page name too long']
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens']
  },
  pageType: {
    type: String,
    required: true,
    enum: ['home','products','product_detail','category','blog','about','contact','landing','custom'],
    default: 'custom'
  },
  sections: { type: [sectionSchema], default: [] },
  seo: {
    title:       { type: String, maxlength: 70 },
    description: { type: String, maxlength: 160 },
    keywords:    [{ type: String }],
    ogImage:     { type: String },
    noIndex:     { type: Boolean, default: false }
  },
  themeOverride: {
    mode:     { type: String, enum: ['preset', 'custom'], default: 'preset' },
    presetId: { type: String, enum: VALID_THEME_IDS },
    customSettings: {
      primaryColor:   String,
      secondaryColor: String,
      fontFamily:     String,
      backgroundColor:String
    }
  },
  status:      { type: String, enum: ['draft','published','archived'], default: 'draft', index: true },
  isPublished: { type: Boolean, default: false },
  publishedAt: { type: Date },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  hasUnpublishedChanges: { type: Boolean, default: true },
  publishedVersion: { type: Number, default: 0 },
  draftUpdatedAt:   { type: Date },
  lastEditedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isHomepage:  { type: Boolean, default: false },
  isDeletable: { type: Boolean, default: true },
  // Analytics
  viewCount:    { type: Number, default: 0 },
  lastViewedAt: { type: Date },
  version:      { type: Number, default: 1 },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Compound indexes
pageSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
pageSchema.index({ organizationId: 1, isHomepage: 1 });
pageSchema.index({ organizationId: 1, status: 1 });

// Single homepage per org
pageSchema.pre('save', async function (next) {
  if (this.isHomepage && (this.isNew || this.isModified('isHomepage'))) {
    await this.constructor.updateMany(
      { organizationId: this.organizationId, _id: { $ne: this._id } },
      { $set: { isHomepage: false } }
    );
  }
  next();
});

module.exports = mongoose.model('StorefrontPage', pageSchema);
