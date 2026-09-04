const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Employee-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.EMPLOYEE_DB_NAME || 'employee_db');

module.exports = conn.model('Employee', employeeSchema);
