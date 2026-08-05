const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const uploadsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Uploads-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.UPLOADS_DB_NAME || 'uploads_db');

module.exports = conn.model('Uploads', uploadsSchema);
