const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const globalDeliveryPartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add GlobalDeliveryPartner-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.GLOBALDELIVERYPARTNER_DB_NAME || 'globalDeliveryPartner_db');

module.exports = conn.model('GlobalDeliveryPartner', globalDeliveryPartnerSchema);
