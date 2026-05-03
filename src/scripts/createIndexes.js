// src/scripts/createIndexes.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

// --- Models ---
const Invoice = require('../modules/accounting/billing/invoice.model');
const Payment = require('../modules/accounting/payments/payment.model');
const Purchase = require('../modules/inventory/core/model/purchase.model');
const AccountEntry = require('../modules/accounting/core/model/accountEntry.model');
const Account = require('../modules/accounting/core/model/account.model');

const DB_URI = process.env.DATABASE;

if (!DB_URI) {
  console.error('❌ Missing DATABASE connection string in .env file');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('⏳ Creating Indexes...');
    await Invoice.createIndexes();
    await Payment.createIndexes();
    await Purchase.createIndexes();
    await Account.createIndexes();
    await AccountEntry.createIndexes();

    console.log('✨ Indexes created successfully.');
  } catch (err) {
    console.error('💥 Error creating indexes:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected.');
    process.exit(0);
  }
})();
