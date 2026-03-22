// src/storefront/models/sectionTemplate.model.js
const mongoose = require('mongoose');
const { SECTION_TYPES } = require('./schemas/section.schema');

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, maxlength: 500 },
  sectionType: { type: String, required: true, enum: SECTION_TYPES, index: true },
  defaultConfig: { type: mongoose.Schema.Types.Mixed, required: true },
  previewImage: { type: String },
  category: {
    type: String,
    enum: ['hero', 'content', 'product', 'marketing', 'social', 'utility', 'navigation'],
    default: 'content',
    index: true
  },
  styleTags: [{ type: String }],
  isSystemTemplate: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  usageCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('SectionTemplate', templateSchema);
