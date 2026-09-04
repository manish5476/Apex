const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const companyAssetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add CompanyAsset-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.COMPANYASSET_DB_NAME || 'companyAsset_db');

module.exports = conn.model('CompanyAsset', companyAssetSchema);
