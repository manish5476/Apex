const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const organizationProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add OrganizationProfile-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ORGANIZATIONPROFILE_DB_NAME || 'organizationProfile_db');

module.exports = conn.model('OrganizationProfile', organizationProfileSchema);
