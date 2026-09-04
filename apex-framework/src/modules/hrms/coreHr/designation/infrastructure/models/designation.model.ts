const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const designationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Designation-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.DESIGNATION_DB_NAME || 'designation_db');

module.exports = conn.model('Designation', designationSchema);
