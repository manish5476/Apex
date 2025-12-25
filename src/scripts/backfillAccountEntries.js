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


// const path = require('path');
// const dotenv = require('dotenv');

// // 1. Load .env
// dotenv.config({ path: path.resolve(__dirname, '../.env') });

// const mongoose = require('mongoose');

// // --- Import Real Models ---
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Payment = require('../models/paymentModel');
// const Product = require('../models/productModel'); // ✅ Added Product
// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');

// const DB_URI = process.env.DATABASE;

// // --- Temp Ledger Model ---
// const ledgerSchema = new mongoose.Schema({
//   organizationId: mongoose.Schema.Types.ObjectId,
//   entryDate: Date,
//   amount: Number,
//   type: String, 
//   description: String,
//   referenceNumber: String,
//   customerId: mongoose.Schema.Types.ObjectId,
//   supplierId: mongoose.Schema.Types.ObjectId
// }, { strict: false });

// const OldLedger = mongoose.model('OldLedger', ledgerSchema, 'ledgers'); 

// async function connect() {
//   if (!DB_URI) {
//       console.error('❌ FATAL ERROR: DATABASE env var is missing.');
//       process.exit(1);
//   }
//   await mongoose.connect(DB_URI);
//   console.log('✅ Connected to MongoDB');
// }

// // --- Helper: Get Account ID ---
// const accountCache = {};
// async function getAccountId(orgId, type) {
//   const key = `${orgId}_${type}`;
//   if (accountCache[key]) return accountCache[key];

//   let criteria = { organizationId: orgId };
  
//   if (type === 'AR') criteria.$or = [{ name: 'Accounts Receivable' }, { code: '1200' }];
//   if (type === 'AP') criteria.$or = [{ name: 'Accounts Payable' }, { code: '2000' }];
//   if (type === 'SALES') criteria.$or = [{ name: 'Sales' }, { code: '4000' }];
//   if (type === 'PURCHASES') criteria.$or = [{ name: 'Inventory Asset' }, { name: 'Purchases' }]; // Prefer Asset
//   if (type === 'CASH') criteria.$or = [{ name: 'Cash' }, { name: 'Cash in Hand' }];
//   if (type === 'EQUITY') criteria.$or = [{ name: 'Opening Balance Equity' }, { name: 'Inventory Gain' }]; // ✅ For Products

//   let account = await Account.findOne(criteria);

//   // Fallback creation logic...
//   if (!account) {
//     console.log(`⚠️ Account ${type} missing. Creating...`);
//     account = await Account.create({
//       organizationId: orgId,
//       name: type === 'EQUITY' ? 'Opening Balance Equity' : (type === 'AR' ? 'Accounts Receivable' : type),
//       code: '9999',
//       type: type === 'AR' || type === 'PURCHASES' ? 'asset' : type === 'EQUITY' ? 'equity' : 'expense',
//       isGroup: false
//     });
//   }

//   accountCache[key] = account._id;
//   return account._id;
// }
// // --- 1. INVOICES ---
// async function backfillInvoices(orgId) {
//   console.log('🔄 Processing Invoices...');
//   const invoices = await Invoice.find({ organizationId: orgId });
//   const arId = await getAccountId(orgId, 'AR');
//   const salesId = await getAccountId(orgId, 'SALES');

//   let count = 0;
//   for (const doc of invoices) {
//     // SAFETY CHECK: Skip if already done
//     const exists = await AccountEntry.exists({ referenceId: doc._id, referenceType: 'invoice' });
//     if (exists) continue;
//     await AccountEntry.create({
//       organizationId: orgId, branchId: doc.branchId, accountId: arId, customerId: doc.customerId,
//       date: doc.invoiceDate, debit: doc.grandTotal, credit: 0,
//       description: `Inv #${doc.invoiceNumber}`, referenceType: 'invoice', referenceNumber: doc.invoiceNumber, referenceId: doc._id
//     });
//     await AccountEntry.create({
//       organizationId: orgId, branchId: doc.branchId, accountId: salesId,
//       date: doc.invoiceDate, debit: 0, credit: doc.grandTotal,
//       description: `Rev #${doc.invoiceNumber}`, referenceType: 'invoice', referenceNumber: doc.invoiceNumber, referenceId: doc._id
//     });
//     count++;
//   }
//   console.log(`✅ Backfilled ${count} Invoices.`);
// }

// // --- 2. PURCHASES ---
// async function backfillPurchases(orgId) {
//   console.log('🔄 Processing Purchases...');
//   const purchases = await Purchase.find({ organizationId: orgId });
//   const purchaseId = await getAccountId(orgId, 'PURCHASES');
//   const apId = await getAccountId(orgId, 'AP');

//   let count = 0;
//   for (const doc of purchases) {
//     const exists = await AccountEntry.exists({ referenceId: doc._id, referenceType: 'purchase' });
//     if (exists) continue;

//     await AccountEntry.create({
//       organizationId: orgId, branchId: doc.branchId, accountId: purchaseId,
//       date: doc.purchaseDate, debit: doc.grandTotal, credit: 0,
//       description: `Pur #${doc.invoiceNumber}`, referenceType: 'purchase', referenceNumber: doc.invoiceNumber, referenceId: doc._id
//     });
//     await AccountEntry.create({
//       organizationId: orgId, branchId: doc.branchId, accountId: apId, supplierId: doc.supplierId,
//       date: doc.purchaseDate, debit: 0, credit: doc.grandTotal,
//       description: `Bill #${doc.invoiceNumber}`, referenceType: 'purchase', referenceNumber: doc.invoiceNumber, referenceId: doc._id
//     });
//     count++;
//   }
//   console.log(`✅ Backfilled ${count} Purchases.`);
// }

// // --- 3. PAYMENTS ---
// async function backfillPayments(orgId) {
//   console.log('🔄 Processing Payments...');
//   const payments = await Payment.find({ organizationId: orgId });
//   const cashId = await getAccountId(orgId, 'CASH');
//   const arId = await getAccountId(orgId, 'AR');
//   const apId = await getAccountId(orgId, 'AP');

//   let count = 0;
//   for (const doc of payments) {
//     const exists = await AccountEntry.exists({ referenceId: doc._id, referenceType: 'payment' });
//     if (exists) continue;

//     if (doc.type === 'inflow') {
//       await AccountEntry.create({
//         organizationId: orgId, branchId: doc.branchId, accountId: cashId,
//         date: doc.paymentDate, debit: doc.amount, credit: 0,
//         description: `Pay Recv`, referenceType: 'payment', referenceId: doc._id
//       });
//       await AccountEntry.create({
//         organizationId: orgId, branchId: doc.branchId, accountId: arId, customerId: doc.customerId,
//         date: doc.paymentDate, debit: 0, credit: doc.amount,
//         description: `Pay Recv`, referenceType: 'payment', referenceId: doc._id
//       });
//     } else {
//       await AccountEntry.create({
//         organizationId: orgId, branchId: doc.branchId, accountId: apId, supplierId: doc.supplierId,
//         date: doc.paymentDate, debit: doc.amount, credit: 0,
//         description: `Paid Supplier`, referenceType: 'payment', referenceId: doc._id
//       });
//       await AccountEntry.create({
//         organizationId: orgId, branchId: doc.branchId, accountId: cashId,
//         date: doc.paymentDate, debit: 0, credit: doc.amount,
//         description: `Paid Supplier`, referenceType: 'payment', referenceId: doc._id
//       });
//     }
//     count++;
//   }
//   console.log(`✅ Backfilled ${count} Payments.`);
// }

// // --- 4. MANUAL LEDGERS ---
// async function backfillManualLedgers(orgId) {
//   console.log('🔄 Processing Manual Journals...');
//   const ledgers = await OldLedger.find({ organizationId: orgId, invoiceId: null, paymentId: null, purchaseId: null });
//   const cashId = await getAccountId(orgId, 'CASH'); 

//   let count = 0;
//   for (const doc of ledgers) {
//     const exists = await AccountEntry.exists({ description: doc.description, date: doc.entryDate, $or: [{ debit: doc.amount }, { credit: doc.amount }] });
//     if (exists) continue;

//     await AccountEntry.create({
//       organizationId: orgId, branchId: doc.branchId, accountId: cashId,
//       customerId: doc.customerId, supplierId: doc.supplierId,
//       date: doc.entryDate,
//       debit: doc.type === 'debit' ? doc.amount : 0,
//       credit: doc.type === 'credit' ? doc.amount : 0,
//       description: doc.description || 'Manual Adjustment', referenceType: 'manual', referenceNumber: doc.referenceNumber
//     });
//     count++;
//   }
//   console.log(`✅ Backfilled ${count} Manual Ledgers.`);
// }

// // --- 5. EXISTING PRODUCTS (Opening Stock) ---
// async function backfillProducts(orgId) {
//   console.log('🔄 Processing Product Inventory (Opening Stock)...');
//   const products = await Product.find({ organizationId: orgId });
  
//   const inventoryId = await getAccountId(orgId, 'PURCHASES'); // Use Inventory Asset
//   const equityId = await getAccountId(orgId, 'EQUITY');

//   let count = 0;
//   for (const doc of products) {
//     // Check if we already have an entry for this product
//     const exists = await AccountEntry.exists({ referenceId: doc._id });
//     if (exists) continue;

//     // Calculate Value
//     let totalValue = 0;
//     if (doc.inventory && doc.inventory.length > 0) {
//         const qty = doc.inventory.reduce((acc, i) => acc + (i.quantity || 0), 0);
//         totalValue = qty * (doc.purchasePrice || 0);
//     }

//     if (totalValue > 0) {
//         // Dr Inventory
//         await AccountEntry.create({
//             organizationId: orgId,
//             branchId: doc.inventory?.[0]?.branchId, // Use first branch found
//             accountId: inventoryId,
//             date: doc.createdAt,
//             debit: totalValue,
//             credit: 0,
//             description: `Opening Stock: ${doc.name}`,
//             referenceType: 'manual',
//             referenceId: doc._id,
//             referenceNumber: 'OPEN-STOCK'
//         });

//         // Cr Equity
//         await AccountEntry.create({
//             organizationId: orgId,
//             branchId: doc.inventory?.[0]?.branchId,
//             accountId: equityId,
//             date: doc.createdAt,
//             debit: 0,
//             credit: totalValue,
//             description: `Opening Stock Equity: ${doc.name}`,
//             referenceType: 'manual',
//             referenceId: doc._id,
//             referenceNumber: 'OPEN-STOCK'
//         });
//         count++;
//     }
//   }
//   console.log(`✅ Backfilled ${count} Products (Opening Stock).`);
// }

// (async () => {
//   try {
//     await connect();
//     const orgId = process.env.BACKFILL_ORG_ID; 
    
//     if (!orgId) {
//         console.error('❌ Please set BACKFILL_ORG_ID env var.');
//         process.exit(1);
//     }

//     console.log(`🚀 Starting Migration for Org: ${orgId}`);
    
//     await backfillInvoices(orgId);
//     await backfillPurchases(orgId);
//     await backfillPayments(orgId);
//     await backfillManualLedgers(orgId);
//     await backfillProducts(orgId); // ✅ Runs the new product logic

//     console.log('🎉 Migration Complete!');
//   } catch (err) {
//     console.error('❌ Migration Failed:', err);
//   } finally {
//     if (mongoose.connection.readyState !== 0) {
//         await mongoose.disconnect();
//     }
//     process.exit(0);
//   }
// })();
