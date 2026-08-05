const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontPageSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontPageSnapshot-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTPAGESNAPSHOT_DB_NAME || 'storefrontPageSnapshot_db');

module.exports = conn.model('StorefrontPageSnapshot', storefrontPageSnapshotSchema);
