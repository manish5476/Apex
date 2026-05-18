const mongoose = require('mongoose');

const platformSettingSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    namespace: { type: String, required: true, trim: true, lowercase: true, index: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    encrypted: { type: Boolean, default: false },
    description: { type: String, trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

platformSettingSchema.index(
  { organizationId: 1, namespace: 1, key: 1 },
  { unique: true, name: 'uniq_platform_setting_scope' }
);

module.exports = mongoose.model('PlatformSetting', platformSettingSchema);
