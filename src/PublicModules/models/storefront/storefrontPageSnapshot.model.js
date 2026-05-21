// src/storefront/models/storefrontPageSnapshot.model.js
const mongoose = require('mongoose');
const { sectionSchema } = require('./schemas/section.schema');

const snapshotLayoutSchema = new mongoose.Schema({
  header: { type: [sectionSchema], default: [] },
  footer: { type: [sectionSchema], default: [] },
  globalSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 }
}, { _id: false });

const pageSnapshotSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  pageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StorefrontPage',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  pageType: {
    type: String,
    required: true
  },
  sections: { type: [sectionSchema], default: [] },
  seo: {
    title: String,
    description: String,
    keywords: [{ type: String }],
    ogImage: String,
    noIndex: { type: Boolean, default: false }
  },
  themeOverride: { type: mongoose.Schema.Types.Mixed, default: {} },
  layout: { type: snapshotLayoutSchema, default: () => ({}) },
  isHomepage: { type: Boolean, default: false, index: true },
  pageVersion: { type: Number, default: 1 },
  layoutVersion: { type: Number, default: 1 },
  publishedAt: { type: Date },
  sourceUpdatedAt: { type: Date }
}, { timestamps: true });

pageSnapshotSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
pageSnapshotSchema.index({ organizationId: 1, pageId: 1 }, { unique: true });
pageSnapshotSchema.index({ organizationId: 1, isHomepage: 1 });

module.exports = mongoose.model('StorefrontPageSnapshot', pageSnapshotSchema);
