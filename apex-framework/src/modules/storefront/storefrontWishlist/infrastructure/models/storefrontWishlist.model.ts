const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontWishlistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontWishlist-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTWISHLIST_DB_NAME || 'storefrontWishlist_db');

module.exports = conn.model('StorefrontWishlist', storefrontWishlistSchema);
