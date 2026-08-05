const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontPageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontPage-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTPAGE_DB_NAME || 'storefrontPage_db');

module.exports = conn.model('StorefrontPage', storefrontPageSchema);
