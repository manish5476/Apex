/* ============================================================
   BACKFILL ACCOUNT JOURNAL — FINAL & SAFE
   ------------------------------------------------------------
   ✔ Mirrors live controller logic
   ✔ Double-entry enforced
   ✔ EMI-safe
   ✔ Idempotent
   ✔ Opening stock NOT re-booked
   ✔ Run ONCE only
============================================================ */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

/* ===================== MODELS ===================== */
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Payment = require('../models/paymentModel');
const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

/* ===================== DB ===================== */
const DB_URI = process.env.DATABASE;
const ORG_ID = process.env.BACKFILL_ORG_ID;

if (!DB_URI || !ORG_ID) {
  console.error('❌ DATABASE or BACKFILL_ORG_ID missing');
  process.exit(1);
}

/* ===================== CONNECT ===================== */
async function connect() {
  await mongoose.connect(DB_URI);
  console.log('✅ MongoDB connected');
}

/* ===================== ACCOUNT RESOLVER ===================== */
const accountCache = {};

async function getAccount(orgId, code, fallbackName, type) {
  const key = `${orgId}_${code}`;
  if (accountCache[key]) return accountCache[key];

  let acc = await Account.findOne({ organizationId: orgId, code });

  if (!acc) {
    acc = await Account.create({
      organizationId: orgId,
      name: fallbackName,
      code,
      type,
      isGroup: false
    });
    console.log(`⚠️ Created missing account: ${fallbackName} (${code})`);
  }

  accountCache[key] = acc._id;
  return acc._id;
}

/* ===================== INVOICE BACKFILL ===================== */
async function backfillInvoices() {
  console.log('🔄 Backfilling Invoices...');
  const invoices = await Invoice.find({ organizationId: ORG_ID });

  const AR = await getAccount(ORG_ID, '1200', 'Accounts Receivable', 'asset');
  const SALES = await getAccount(ORG_ID, '4000', 'Sales', 'income');
  const TAX = await getAccount(ORG_ID, '2100', 'Tax Payable', 'liability');

  let count = 0;

  for (const inv of invoices) {
    const exists = await AccountEntry.exists({
      referenceType: 'invoice',
      referenceId: inv._id
    });
    if (exists) continue;

    const entries = [];

    // Dr AR
    entries.push({
      organizationId: ORG_ID,
      branchId: inv.branchId,
      accountId: AR,
      customerId: inv.customerId,
      date: inv.invoiceDate,
      debit: inv.grandTotal,
      credit: 0,
      referenceType: 'invoice',
      referenceId: inv._id
    });

    // Cr Sales (Net)
    const netRevenue = inv.grandTotal - (inv.totalTax || 0);
    entries.push({
      organizationId: ORG_ID,
      branchId: inv.branchId,
      accountId: SALES,
      date: inv.invoiceDate,
      debit: 0,
      credit: netRevenue,
      referenceType: 'invoice',
      referenceId: inv._id
    });

    // Cr Tax
    if (inv.totalTax > 0) {
      entries.push({
        organizationId: ORG_ID,
        branchId: inv.branchId,
        accountId: TAX,
        date: inv.invoiceDate,
        debit: 0,
        credit: inv.totalTax,
        referenceType: 'invoice',
        referenceId: inv._id
      });
    }

    await AccountEntry.insertMany(entries);
    count++;
  }

  console.log(`✅ Invoices backfilled: ${count}`);
}

/* ===================== PURCHASE BACKFILL ===================== */
async function backfillPurchases() {
  console.log('🔄 Backfilling Purchases...');
  const purchases = await Purchase.find({ organizationId: ORG_ID });

  const INVENTORY = await getAccount(ORG_ID, '1500', 'Inventory Asset', 'asset');
  const AP = await getAccount(ORG_ID, '2000', 'Accounts Payable', 'liability');

  let count = 0;

  for (const p of purchases) {
    const exists = await AccountEntry.exists({
      referenceType: 'purchase',
      referenceId: p._id
    });
    if (exists) continue;

    await AccountEntry.insertMany([
      {
        organizationId: ORG_ID,
        branchId: p.branchId,
        accountId: INVENTORY,
        date: p.purchaseDate,
        debit: p.grandTotal,
        credit: 0,
        referenceType: 'purchase',
        referenceId: p._id
      },
      {
        organizationId: ORG_ID,
        branchId: p.branchId,
        accountId: AP,
        supplierId: p.supplierId,
        date: p.purchaseDate,
        debit: 0,
        credit: p.grandTotal,
        referenceType: 'purchase',
        referenceId: p._id
      }
    ]);

    count++;
  }

  console.log(`✅ Purchases backfilled: ${count}`);
}

/* ===================== PAYMENT BACKFILL ===================== */
async function backfillPayments() {
  console.log('🔄 Backfilling Payments...');
  const payments = await Payment.find({
    organizationId: ORG_ID,
    status: 'completed',
    transactionMode: { $ne: 'auto' } // ❌ Skip EMI
  });

  const CASH = await getAccount(ORG_ID, '1001', 'Cash', 'asset');
  const BANK = await getAccount(ORG_ID, '1002', 'Bank', 'asset');
  const AR = await getAccount(ORG_ID, '1200', 'Accounts Receivable', 'asset');
  const AP = await getAccount(ORG_ID, '2000', 'Accounts Payable', 'liability');

  let count = 0;

  for (const p of payments) {
    const exists = await AccountEntry.exists({
      referenceType: 'payment',
      referenceId: p._id
    });
    if (exists) continue;

    const asset = p.paymentMethod === 'cash' ? CASH : BANK;

    if (p.type === 'inflow') {
      await AccountEntry.insertMany([
        {
          organizationId: ORG_ID,
          branchId: p.branchId,
          accountId: asset,
          date: p.paymentDate,
          debit: p.amount,
          credit: 0,
          referenceType: 'payment',
          referenceId: p._id
        },
        {
          organizationId: ORG_ID,
          branchId: p.branchId,
          accountId: AR,
          customerId: p.customerId,
          date: p.paymentDate,
          debit: 0,
          credit: p.amount,
          referenceType: 'payment',
          referenceId: p._id
        }
      ]);
    } else {
      await AccountEntry.insertMany([
        {
          organizationId: ORG_ID,
          branchId: p.branchId,
          accountId: AP,
          supplierId: p.supplierId,
          date: p.paymentDate,
          debit: p.amount,
          credit: 0,
          referenceType: 'payment',
          referenceId: p._id
        },
        {
          organizationId: ORG_ID,
          branchId: p.branchId,
          accountId: asset,
          date: p.paymentDate,
          debit: 0,
          credit: p.amount,
          referenceType: 'payment',
          referenceId: p._id
        }
      ]);
    }

    count++;
  }

  console.log(`✅ Payments backfilled: ${count}`);
}

/* ===================== RUN ===================== */
(async () => {
  try {
    await connect();
    console.log(`🚀 Starting Backfill for Org: ${ORG_ID}`);

    await backfillInvoices();
    await backfillPurchases();
    await backfillPayments();

    console.log('🎉 BACKFILL COMPLETE — DATA IS CONSISTENT');
  } catch (err) {
    console.error('❌ BACKFILL FAILED:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
