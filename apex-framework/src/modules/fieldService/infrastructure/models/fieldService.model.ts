const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const fieldServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add FieldService-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.FIELDSERVICE_DB_NAME || 'fieldService_db');

module.exports = conn.model('FieldService', fieldServiceSchema);
