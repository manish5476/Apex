const mongoose = require('mongoose');
const { getConnection } = require('../../../../core/database');

const aiSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Ai-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.AI_DB_NAME || 'ai_db');

module.exports = conn.model('Ai', aiSchema);
