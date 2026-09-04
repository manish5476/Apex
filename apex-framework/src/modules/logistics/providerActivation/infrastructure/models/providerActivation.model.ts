const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const providerActivationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ProviderActivation-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PROVIDERACTIVATION_DB_NAME || 'providerActivation_db');

module.exports = conn.model('ProviderActivation', providerActivationSchema);
