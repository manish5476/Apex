// scripts/createIndexes.js
require('dotenv').config();
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const Ledger = require('../models/ledgerModel');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    await Invoice.createIndexes();
    await Payment.createIndexes();
    await Purchase.createIndexes();
    await Ledger.createIndexes();

    console.log('Indexes created successfully.');
  } catch (err) {
    console.error('Error creating indexes:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
})();
