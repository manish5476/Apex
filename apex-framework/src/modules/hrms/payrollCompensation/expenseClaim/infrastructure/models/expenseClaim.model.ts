const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const expenseClaimSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ExpenseClaim-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.EXPENSECLAIM_DB_NAME || 'expenseClaim_db');

module.exports = conn.model('ExpenseClaim', expenseClaimSchema);
