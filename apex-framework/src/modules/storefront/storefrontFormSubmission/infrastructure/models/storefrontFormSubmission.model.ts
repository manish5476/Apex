const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontFormSubmissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontFormSubmission-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTFORMSUBMISSION_DB_NAME || 'storefrontFormSubmission_db');

module.exports = conn.model('StorefrontFormSubmission', storefrontFormSubmissionSchema);
