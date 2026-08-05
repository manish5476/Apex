const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const shipmentEventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ShipmentEvent-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SHIPMENTEVENT_DB_NAME || 'shipmentEvent_db');

module.exports = conn.model('ShipmentEvent', shipmentEventSchema);
