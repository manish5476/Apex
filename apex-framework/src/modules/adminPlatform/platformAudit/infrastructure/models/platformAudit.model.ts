const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const platformAuditSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add PlatformAudit-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PLATFORMAUDIT_DB_NAME || 'platformAudit_db');

module.exports = conn.model('PlatformAudit', platformAuditSchema);
