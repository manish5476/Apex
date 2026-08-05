const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const goalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Goal-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.GOAL_DB_NAME || 'goal_db');

module.exports = conn.model('Goal', goalSchema);
