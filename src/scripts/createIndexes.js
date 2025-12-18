// src/scripts/createIndexes.js
require('dotenv').config();
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const AccountEntry = require('../models/accountEntryModel'); // ✅ Added
const Account = require('../models/accountModel'); // ✅ Added

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    console.log('Creating Indexes...');
    await Invoice.createIndexes();
    await Payment.createIndexes();
    await Purchase.createIndexes();
    
    // ✅ Index the new financial models
    await Account.createIndexes();
    await AccountEntry.createIndexes();

    console.log('Indexes created successfully.');
  } catch (err) {
    console.error('Error creating indexes:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
})();