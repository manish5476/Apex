const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const featureFlagSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add FeatureFlag-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.FEATUREFLAG_DB_NAME || 'featureFlag_db');

module.exports = conn.model('FeatureFlag', featureFlagSchema);
