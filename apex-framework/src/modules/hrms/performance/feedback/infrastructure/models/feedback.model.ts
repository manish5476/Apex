const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const feedbackSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Feedback-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.FEEDBACK_DB_NAME || 'feedback_db');

module.exports = conn.model('Feedback', feedbackSchema);
