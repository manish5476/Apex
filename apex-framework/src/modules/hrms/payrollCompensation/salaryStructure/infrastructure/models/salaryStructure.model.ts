const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const salaryStructureSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add SalaryStructure-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SALARYSTRUCTURE_DB_NAME || 'salaryStructure_db');

module.exports = conn.model('SalaryStructure', salaryStructureSchema);
