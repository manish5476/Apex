const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Customer-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.CUSTOMER_DB_NAME || 'customer_db');

module.exports = conn.model('Customer', customerSchema);
