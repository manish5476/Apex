const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const employeeDocumentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add EmployeeDocument-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.EMPLOYEEDOCUMENT_DB_NAME || 'employeeDocument_db');

module.exports = conn.model('EmployeeDocument', employeeDocumentSchema);
