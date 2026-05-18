const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    enabled: { type: Boolean, default: false, index: true },
    rules: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

featureFlagSchema.index(
  { organizationId: 1, key: 1 },
  { unique: true, name: 'uniq_feature_flag_scope' }
);

module.exports = mongoose.model('FeatureFlag', featureFlagSchema);
