const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Department-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.DEPARTMENT_DB_NAME || 'department_db');

module.exports = conn.model('Department', departmentSchema);
