const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const paymentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Payment-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PAYMENT_DB_NAME || 'payment_db');

module.exports = conn.model('Payment', paymentSchema);
