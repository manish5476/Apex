
require('dotenv').config();
const mongoose = require('mongoose');
const Invoice = require('../src/models/invoiceModel');
const Purchase = require('../src/models/purchaseModel');
const Payment = require('../src/models/paymentModel');
const Ledger = require('../src/models/ledgerModel');
const AccountEntry = require('../src/models/accountEntryModel');
const { postJournalEntries } = require('../src/services/accountingService');

async function connect() {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');
}

function accountCodeFor(type) {
  // Map logical short codes to COA codes. Adjust these to your seeded COA codes.
  // Make sure your organization COA contains these codes or update mapping.
  return {
    AR: '1100',
    CASH: '1000',
    AP: '2000',
    SALES: '4000',
    PURCHASES: '5000'
  }[type];
}

async function backfillInvoices(orgId, batchSize = 200) {
  console.log('Backfilling invoices...');
  const cursor = Invoice.find({ organizationId: orgId }).cursor();
  let processed = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const refId = doc._id;
    const exists = await AccountEntry.findOne({ organizationId: orgId, referenceType: 'invoice', referenceId: refId }).lean();
    if (exists) { processed++; continue; }

    const date = doc.invoiceDate || doc.createdAt || new Date();
    const amt = Number(doc.grandTotal || 0);
    if (amt === 0) { processed++; continue; }

    // Debit AR, Credit Sales
    const entries = [
      { accountCode: accountCodeFor('AR'), debit: amt, credit: 0, description: `Invoice ${doc.invoiceNumber}`, referenceType: 'invoice', referenceId: refId },
      { accountCode: accountCodeFor('SALES'), debit: 0, credit: amt, description: `Invoice ${doc.invoiceNumber}`, referenceType: 'invoice', referenceId: refId }
    ];

    try {
      await postJournalEntries(orgId, date, entries, { updateBalances: true });
    } catch (err) {
      console.error('Failed invoice', doc._id, err.message);
    }
    processed++;
    if (processed % batchSize === 0) console.log(`Invoices processed: ${processed}`);
  }
  console.log('Invoices backfilled complete');
}

async function backfillPurchases(orgId, batchSize = 200) {
  console.log('Backfilling purchases...');
  const cursor = Purchase.find({ organizationId: orgId }).cursor();
  let processed = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const refId = doc._id;
    const exists = await AccountEntry.findOne({ organizationId: orgId, referenceType: 'purchase', referenceId: refId }).lean();
    if (exists) { processed++; continue; }
    const date = doc.purchaseDate || doc.createdAt || new Date();
    const amt = Number(doc.grandTotal || 0);
    if (amt === 0) { processed++; continue; }

    // Debit Purchases (or Inventory depending on your COA), Credit AP
    const entries = [
      { accountCode: accountCodeFor('PURCHASES'), debit: amt, credit: 0, description: `Purchase ${doc.invoiceNumber || ''}`, referenceType: 'purchase', referenceId: refId },
      { accountCode: accountCodeFor('AP'), debit: 0, credit: amt, description: `Purchase ${doc.invoiceNumber || ''}`, referenceType: 'purchase', referenceId: refId }
    ];

    try {
      await postJournalEntries(orgId, date, entries, { updateBalances: true });
    } catch (err) {
      console.error('Failed purchase', doc._id, err.message);
    }
    processed++;
    if (processed % batchSize === 0) console.log(`Purchases processed: ${processed}`);
  }
  console.log('Purchases backfilled complete');
}

async function backfillPayments(orgId, batchSize = 200) {
  console.log('Backfilling payments...');
  const cursor = Payment.find({ organizationId: orgId }).cursor();
  let processed = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const refId = doc._id;
    const exists = await AccountEntry.findOne({ organizationId: orgId, referenceType: 'payment', referenceId: refId }).lean();
    if (exists) { processed++; continue; }
    const date = doc.paymentDate || doc.createdAt || new Date();
    const amt = Number(doc.amount || 0);
    if (amt === 0) { processed++; continue; }

    // Map payment type: inflow = receipt from customer, outflow = payment to supplier
    let entries = [];
    if (doc.type === 'inflow') {
      // Debit Cash, Credit AR (if invoiceId) else credit Sales/CashSale
      entries = [
        { accountCode: accountCodeFor('CASH'), debit: amt, credit: 0, description: `Payment ${doc.referenceNumber}`, referenceType: 'payment', referenceId: refId },
        { accountCode: accountCodeFor('AR'), debit: 0, credit: amt, description: `Payment ${doc.referenceNumber}`, referenceType: 'payment', referenceId: refId }
      ];
    } else {
      // outflow: Debit AP (or expense), Credit Cash
      entries = [
        { accountCode: accountCodeFor('AP'), debit: amt, credit: 0, description: `Payment ${doc.referenceNumber}`, referenceType: 'payment', referenceId: refId },
        { accountCode: accountCodeFor('CASH'), debit: 0, credit: amt, description: `Payment ${doc.referenceNumber}`, referenceType: 'payment', referenceId: refId }
      ];
    }

    try {
      await postJournalEntries(orgId, date, entries, { updateBalances: true });
    } catch (err) {
      console.error('Failed payment', doc._id, err.message);
    }
    processed++;
    if (processed % batchSize === 0) console.log(`Payments processed: ${processed}`);
  }
  console.log('Payments backfilled complete');
}

async function backfillLedger(orgId, batchSize = 200) {
  console.log('Backfilling ledger adjustments...');
  const cursor = Ledger.find({ organizationId: orgId }).cursor();
  let processed = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const refId = doc._id;
    const exists = await AccountEntry.findOne({ organizationId: orgId, referenceType: 'ledger', referenceId: refId }).lean();
    if (exists) { processed++; continue; }
    const date = doc.entryDate || doc.createdAt || new Date();
    const amt = Number(doc.amount || 0);
    if (amt === 0) { processed++; continue; }

    // Ledger documents should ideally include accountCode; if not, assign based on accountType mapping
    const accountCode = doc.accountCode || (doc.accountType === 'expense' ? accountCodeFor('PURCHASES') : accountCodeFor('CASH'));

    if (!accountCode) {
      console.warn('Skipping ledger without accountCode', doc._id);
      processed++;
      continue;
    }

    // Depending on doc.type (credit|debit) create one entry that posts to the specified account and balancing to CASH for simplicity
    const entries = [];
    if (doc.type === 'debit') {
      entries.push({ accountCode: accountCode, debit: amt, credit: 0, description: doc.description || 'Ledger entry', referenceType: 'ledger', referenceId: refId });
      entries.push({ accountCode: accountCodeFor('CASH'), debit: 0, credit: amt, description: 'Balancing entry', referenceType: 'ledger', referenceId: refId });
    } else {
      entries.push({ accountCode: accountCodeFor('CASH'), debit: amt, credit: 0, description: 'Balancing entry', referenceType: 'ledger', referenceId: refId });
      entries.push({ accountCode: accountCode, debit: 0, credit: amt, description: doc.description || 'Ledger entry', referenceType: 'ledger', referenceId: refId });
    }

    try {
      await postJournalEntries(orgId, date, entries, { updateBalances: true });
    } catch (err) {
      console.error('Failed ledger', doc._id, err.message);
    }
    processed++;
    if (processed % batchSize === 0) console.log(`Ledger processed: ${processed}`);
  }
  console.log('Ledger backfilled complete');
}

(async () => {
  try {
    await connect();
    const orgId = process.env.BACKFILL_ORG_ID || process.env.SEED_ORG_ID;
    if (!orgId) throw new Error('Set BACKFILL_ORG_ID env var to organization id');

    console.log(`Starting backfill for org ${orgId}`);
    await backfillInvoices(orgId);
    await backfillPurchases(orgId);
    await backfillPayments(orgId);
    await backfillLedger(orgId);

    console.log('Backfill completed');
  } catch (err) {
    console.error('Backfill error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
    process.exit(0);
  }
})();
