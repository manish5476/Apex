const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const shipmentAssignmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ShipmentAssignment-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SHIPMENTASSIGNMENT_DB_NAME || 'shipmentAssignment_db');

module.exports = conn.model('ShipmentAssignment', shipmentAssignmentSchema);
