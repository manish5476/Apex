const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontSessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontSession-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTSESSION_DB_NAME || 'storefrontSession_db');

module.exports = conn.model('StorefrontSession', storefrontSessionSchema);
