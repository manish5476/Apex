const mongoose = require('mongoose');

const layoutSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true, index: true },
  header: [{ id: { type: String, required: true }, type: { type: String, required: true }, config: { type: mongoose.Schema.Types.Mixed, default: {} }, position: { type: Number, default: 0 }, isActive: { type: Boolean, default: true } }],
  footer: [{ id: { type: String, required: true }, type: { type: String, required: true }, config: { type: mongoose.Schema.Types.Mixed, default: {} }, position: { type: Number, default: 0 }, isActive: { type: Boolean, default: true } }],
  globalSettings: { favicon: { type: String }, logo: { url: { type: String }, altText: { type: String }, width: { type: Number } }, socialLinks: { facebook: String, instagram: String, twitter: String, linkedin: String }, defaultSeo: { siteName: { type: String }, defaultImage: { type: String } }, theme: { primaryColor: String, secondaryColor: String, fontFamily: String } },
  version: { type: Number, default: 1 }

}, {
  timestamps: true
});

module.exports = mongoose.model('StorefrontLayout', layoutSchema);