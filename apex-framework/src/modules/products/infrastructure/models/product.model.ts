const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: { type: String, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', sku: 'text' });

// 'products_db' -> its own logical database. Change to 'main' if you want
// every module sharing one physical DB for now (still fine, still isolated logically).
const conn = getConnection(process.env.PRODUCTS_DB_NAME || 'products_db');

module.exports = conn.model('Product', productSchema);
