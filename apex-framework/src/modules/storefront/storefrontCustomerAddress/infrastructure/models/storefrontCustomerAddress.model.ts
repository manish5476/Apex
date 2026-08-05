const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontCustomerAddressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontCustomerAddress-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTCUSTOMERADDRESS_DB_NAME || 'storefrontCustomerAddress_db');

module.exports = conn.model('StorefrontCustomerAddress', storefrontCustomerAddressSchema);
