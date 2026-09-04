const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const transferRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add TransferRequest-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.TRANSFERREQUEST_DB_NAME || 'transferRequest_db');

module.exports = conn.model('TransferRequest', transferRequestSchema);
