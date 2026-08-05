const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Product-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PRODUCT_DB_NAME || 'product_db');

module.exports = conn.model('Product', productSchema);
