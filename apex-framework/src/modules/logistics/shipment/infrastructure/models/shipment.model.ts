const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const shipmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Shipment-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SHIPMENT_DB_NAME || 'shipment_db');

module.exports = conn.model('Shipment', shipmentSchema);
