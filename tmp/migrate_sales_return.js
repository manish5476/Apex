'use strict';

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../src/.env') });

const Invoice = require('../src/modules/accounting/billing/invoice.model');
const Sales = require('../src/modules/inventory/core/model/sales.model');

async function migrate() {
  const DB_URI = process.env.DATABASE;
  if (!DB_URI) {
    console.error('❌ DATABASE URI not found in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Update Invoices
    console.log('⏳ Updating Invoices...');
    const invoices = await Invoice.find({ 'items.originalQuantity': { $exists: false } });
    console.log(`Found ${invoices.length} invoices to update.`);
    
    for (const inv of invoices) {
      inv.items.forEach(item => {
        if (item.originalQuantity === undefined) {
          item.originalQuantity = item.quantity;
        }
      });
      await inv.save();
    }
    console.log('✅ Invoices updated.');

    // 2. Update Sales
    console.log('⏳ Updating Sales...');
    const salesRecords = await Sales.find({ 'items.originalQty': { $exists: false } });
    console.log(`Found ${salesRecords.length} sales records to update.`);

    for (const sale of salesRecords) {
      sale.items.forEach(item => {
        if (item.originalQty === undefined) {
          item.originalQty = item.qty;
        }
      });
      await sale.save();
    }
    console.log('✅ Sales updated.');

    console.log('🎉 Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('💥 Migration failed:', err);
    process.exit(1);
  }
}

migrate();
