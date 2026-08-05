const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const sectionTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add SectionTemplate-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SECTIONTEMPLATE_DB_NAME || 'sectionTemplate_db');

module.exports = conn.model('SectionTemplate', sectionTemplateSchema);
