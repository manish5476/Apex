const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const outboxEventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add OutboxEvent-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.OUTBOXEVENT_DB_NAME || 'outboxEvent_db');

module.exports = conn.model('OutboxEvent', outboxEventSchema);
