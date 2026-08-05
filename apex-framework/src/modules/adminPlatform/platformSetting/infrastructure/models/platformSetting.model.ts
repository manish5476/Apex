const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const platformSettingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add PlatformSetting-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PLATFORMSETTING_DB_NAME || 'platformSetting_db');

module.exports = conn.model('PlatformSetting', platformSettingSchema);
