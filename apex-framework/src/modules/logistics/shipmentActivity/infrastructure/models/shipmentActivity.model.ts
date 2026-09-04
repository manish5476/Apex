const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const shipmentActivitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ShipmentActivity-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SHIPMENTACTIVITY_DB_NAME || 'shipmentActivity_db');

module.exports = conn.model('ShipmentActivity', shipmentActivitySchema);
