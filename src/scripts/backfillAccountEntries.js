const path = require('path');
const dotenv = require('dotenv');

// 1. Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// --- Import Real Models ---
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Payment = require('../models/paymentModel');
const Product = require('../models/productModel'); // ✅ Added Product
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');

const DB_URI = process.env.DATABASE;

// --- Temp Ledger Model ---
const ledgerSchema = new mongoose.Schema({
  organizationId: mongoose.Schema.Types.ObjectId,
  entryDate: Date,
  amount: Number,
  type: String, 
  description: String,
  referenceNumber: String,
  customerId: mongoose.Schema.Types.ObjectId,
  supplierId: mongoose.Schema.Types.ObjectId
}, { strict: false });

const OldLedger = mongoose.model('OldLedger', ledgerSchema, 'ledgers'); 

async function connect() {
  if (!DB_URI) {
      console.error('❌ FATAL ERROR: DATABASE env var is missing.');
      process.exit(1);
  }
  await mongoose.connect(DB_URI);
  console.log('✅ Connected to MongoDB');
}

// --- Helper: Get Account ID ---
const accountCache = {};
async function getAccountId(orgId, type) {
  const key = `${orgId}_${type}`;
  if (accountCache[key]) return accountCache[key];

  let criteria = { organizationId: orgId };
  
  if (type === 'AR') criteria.$or = [{ name: 'Accounts Receivable' }, { code: '1200' }];
  if (type === 'AP') criteria.$or = [{ name: 'Accounts Payable' }, { code: '2000' }];
  if (type === 'SALES') criteria.$or = [{ name: 'Sales' }, { code: '4000' }];
  if (type === 'PURCHASES') criteria.$or = [{ name: 'Inventory Asset' }, { name: 'Purchases' }]; // Prefer Asset
  if (type === 'CASH') criteria.$or = [{ name: 'Cash' }, { name: 'Cash in Hand' }];
  if (type === 'EQUITY') criteria.$or = [{ name: 'Opening Balance Equity' }, { name: 'Inventory Gain' }]; // ✅ For Products

  let account = await Account.findOne(criteria);

  // Fallback creation logic...
  if (!account) {
    console.log(`⚠️ Account ${type} missing. Creating...`);
    account = await Account.create({
      organizationId: orgId,
      name: type === 'EQUITY' ? 'Opening Balance Equity' : (type === 'AR' ? 'Accounts Receivable' : type),
      code: '9999',
      type: type === 'AR' || type === 'PURCHASES' ? 'asset' : type === 'EQUITY' ? 'equity' : 'expense',
      isGroup: false
    });
  }

  accountCache[key] = account._id;
  return account._id;
}

// --- 1. INVOICES ---
async function backfillInvoices(orgId) {
  console.log('🔄 Processing Invoices...');
  const invoices = await Invoice.find({ organizationId: orgId });
  const arId = await getAccountId(orgId, 'AR');
  const salesId = await getAccountId(orgId, 'SALES');

  let count = 0;
  for (const doc of invoices) {
    // SAFETY CHECK: Skip if already done
    const exists = await AccountEntry.exists({ referenceId: doc._id, referenceType: 'invoice' });
    if (exists) continue;

    await AccountEntry.create({
      organizationId: orgId, branchId: doc.branchId, accountId: arId, customerId: doc.customerId,
      date: doc.invoiceDate, debit: doc.grandTotal, credit: 0,
      description: `Inv #${doc.invoiceNumber}`, referenceType: 'invoice', referenceNumber: doc.invoiceNumber, referenceId: doc._id
    });
    await AccountEntry.create({
      organizationId: orgId, branchId: doc.branchId, accountId: salesId,
      date: doc.invoiceDate, debit: 0, credit: doc.grandTotal,
      description: `Rev #${doc.invoiceNumber}`, referenceType: 'invoice', referenceNumber: doc.invoiceNumber, referenceId: doc._id
    });
    count++;
  }
  console.log(`✅ Backfilled ${count} Invoices.`);
}

// --- 2. PURCHASES ---
async function backfillPurchases(orgId) {
  console.log('🔄 Processing Purchases...');
  const purchases = await Purchase.find({ organizationId: orgId });
  const purchaseId = await getAccountId(orgId, 'PURCHASES');
  const apId = await getAccountId(orgId, 'AP');

  let count = 0;
  for (const doc of purchases) {
    const exists = await AccountEntry.exists({ referenceId: doc._id, referenceType: 'purchase' });
    if (exists) continue;

    await AccountEntry.create({
      organizationId: orgId, branchId: doc.branchId, accountId: purchaseId,
      date: doc.purchaseDate, debit: doc.grandTotal, credit: 0,
      description: `Pur #${doc.invoiceNumber}`, referenceType: 'purchase', referenceNumber: doc.invoiceNumber, referenceId: doc._id
    });
    await AccountEntry.create({
      organizationId: orgId, branchId: doc.branchId, accountId: apId, supplierId: doc.supplierId,
      date: doc.purchaseDate, debit: 0, credit: doc.grandTotal,
      description: `Bill #${doc.invoiceNumber}`, referenceType: 'purchase', referenceNumber: doc.invoiceNumber, referenceId: doc._id
    });
    count++;
  }
  console.log(`✅ Backfilled ${count} Purchases.`);
}

// --- 3. PAYMENTS ---
async function backfillPayments(orgId) {
  console.log('🔄 Processing Payments...');
  const payments = await Payment.find({ organizationId: orgId });
  const cashId = await getAccountId(orgId, 'CASH');
  const arId = await getAccountId(orgId, 'AR');
  const apId = await getAccountId(orgId, 'AP');

  let count = 0;
  for (const doc of payments) {
    const exists = await AccountEntry.exists({ referenceId: doc._id, referenceType: 'payment' });
    if (exists) continue;

    if (doc.type === 'inflow') {
      await AccountEntry.create({
        organizationId: orgId, branchId: doc.branchId, accountId: cashId,
        date: doc.paymentDate, debit: doc.amount, credit: 0,
        description: `Pay Recv`, referenceType: 'payment', referenceId: doc._id
      });
      await AccountEntry.create({
        organizationId: orgId, branchId: doc.branchId, accountId: arId, customerId: doc.customerId,
        date: doc.paymentDate, debit: 0, credit: doc.amount,
        description: `Pay Recv`, referenceType: 'payment', referenceId: doc._id
      });
    } else {
      await AccountEntry.create({
        organizationId: orgId, branchId: doc.branchId, accountId: apId, supplierId: doc.supplierId,
        date: doc.paymentDate, debit: doc.amount, credit: 0,
        description: `Paid Supplier`, referenceType: 'payment', referenceId: doc._id
      });
      await AccountEntry.create({
        organizationId: orgId, branchId: doc.branchId, accountId: cashId,
        date: doc.paymentDate, debit: 0, credit: doc.amount,
        description: `Paid Supplier`, referenceType: 'payment', referenceId: doc._id
      });
    }
    count++;
  }
  console.log(`✅ Backfilled ${count} Payments.`);
}

// --- 4. MANUAL LEDGERS ---
async function backfillManualLedgers(orgId) {
  console.log('🔄 Processing Manual Journals...');
  const ledgers = await OldLedger.find({ organizationId: orgId, invoiceId: null, paymentId: null, purchaseId: null });
  const cashId = await getAccountId(orgId, 'CASH'); 

  let count = 0;
  for (const doc of ledgers) {
    const exists = await AccountEntry.exists({ description: doc.description, date: doc.entryDate, $or: [{ debit: doc.amount }, { credit: doc.amount }] });
    if (exists) continue;

    await AccountEntry.create({
      organizationId: orgId, branchId: doc.branchId, accountId: cashId,
      customerId: doc.customerId, supplierId: doc.supplierId,
      date: doc.entryDate,
      debit: doc.type === 'debit' ? doc.amount : 0,
      credit: doc.type === 'credit' ? doc.amount : 0,
      description: doc.description || 'Manual Adjustment', referenceType: 'manual', referenceNumber: doc.referenceNumber
    });
    count++;
  }
  console.log(`✅ Backfilled ${count} Manual Ledgers.`);
}

// --- 5. EXISTING PRODUCTS (Opening Stock) ---
async function backfillProducts(orgId) {
  console.log('🔄 Processing Product Inventory (Opening Stock)...');
  const products = await Product.find({ organizationId: orgId });
  
  const inventoryId = await getAccountId(orgId, 'PURCHASES'); // Use Inventory Asset
  const equityId = await getAccountId(orgId, 'EQUITY');

  let count = 0;
  for (const doc of products) {
    // Check if we already have an entry for this product
    const exists = await AccountEntry.exists({ referenceId: doc._id });
    if (exists) continue;

    // Calculate Value
    let totalValue = 0;
    if (doc.inventory && doc.inventory.length > 0) {
        const qty = doc.inventory.reduce((acc, i) => acc + (i.quantity || 0), 0);
        totalValue = qty * (doc.purchasePrice || 0);
    }

    if (totalValue > 0) {
        // Dr Inventory
        await AccountEntry.create({
            organizationId: orgId,
            branchId: doc.inventory?.[0]?.branchId, // Use first branch found
            accountId: inventoryId,
            date: doc.createdAt,
            debit: totalValue,
            credit: 0,
            description: `Opening Stock: ${doc.name}`,
            referenceType: 'manual',
            referenceId: doc._id,
            referenceNumber: 'OPEN-STOCK'
        });

        // Cr Equity
        await AccountEntry.create({
            organizationId: orgId,
            branchId: doc.inventory?.[0]?.branchId,
            accountId: equityId,
            date: doc.createdAt,
            debit: 0,
            credit: totalValue,
            description: `Opening Stock Equity: ${doc.name}`,
            referenceType: 'manual',
            referenceId: doc._id,
            referenceNumber: 'OPEN-STOCK'
        });
        count++;
    }
  }
  console.log(`✅ Backfilled ${count} Products (Opening Stock).`);
}

(async () => {
  try {
    await connect();
    const orgId = process.env.BACKFILL_ORG_ID; 
    
    if (!orgId) {
        console.error('❌ Please set BACKFILL_ORG_ID env var.');
        process.exit(1);
    }

    console.log(`🚀 Starting Migration for Org: ${orgId}`);
    
    await backfillInvoices(orgId);
    await backfillPurchases(orgId);
    await backfillPayments(orgId);
    await backfillManualLedgers(orgId);
    await backfillProducts(orgId); // ✅ Runs the new product logic

    console.log('🎉 Migration Complete!');
  } catch (err) {
    console.error('❌ Migration Failed:', err);
  } finally {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    process.exit(0);
  }
})();

// const path = require('path');
// const dotenv = require('dotenv');

// // 1. Load .env from the 'src' folder (same logic as server.js)
// dotenv.config({ path: path.resolve(__dirname, '../.env') });

// const mongoose = require('mongoose');

// // --- Import Real Models ---
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Payment = require('../models/paymentModel');
// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');

// // 2. Use the correct variable name: 'DATABASE'
// const DB_URI = process.env.DATABASE;

// // --- Define Temporary Ledger Model (To read old data) ---
// const ledgerSchema = new mongoose.Schema({
//   organizationId: mongoose.Schema.Types.ObjectId,
//   entryDate: Date,
//   amount: Number,
//   type: String, // debit/credit
//   description: String,
//   referenceNumber: String,
//   customerId: mongoose.Schema.Types.ObjectId,
//   supplierId: mongoose.Schema.Types.ObjectId,
//   transactionMode: String // manual vs auto
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

// // --- Helper: Get or Create Standard Accounts ---
// const accountCache = {};
// async function getAccountId(orgId, type) {
//   const key = `${orgId}_${type}`;
//   if (accountCache[key]) return accountCache[key];

//   let criteria = { organizationId: orgId };
  
//   if (type === 'AR') criteria.$or = [{ name: 'Accounts Receivable' }, { code: '1200' }];
//   if (type === 'AP') criteria.$or = [{ name: 'Accounts Payable' }, { code: '2000' }];
//   if (type === 'SALES') criteria.$or = [{ name: 'Sales' }, { code: '4000' }];
//   if (type === 'PURCHASES') criteria.$or = [{ name: 'Purchases' }, { name: 'Inventory Asset' }];
//   if (type === 'CASH') criteria.$or = [{ name: 'Cash' }, { name: 'Cash in Hand' }];

//   let account = await Account.findOne(criteria);

//   if (!account) {
//     console.log(`⚠️ Account ${type} missing. Creating default...`);
//     account = await Account.create({
//       organizationId: orgId,
//       name: type === 'AR' ? 'Accounts Receivable' : type === 'AP' ? 'Accounts Payable' : type,
//       code: type === 'AR' ? '1200' : type === 'AP' ? '2000' : '9999',
//       type: type === 'AR' || type === 'CASH' ? 'asset' : type === 'AP' ? 'liability' : type === 'SALES' ? 'income' : 'expense',
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
//     const exists = await AccountEntry.exists({ referenceId: doc._id, referenceType: 'invoice' });
//     if (exists) continue;

//     // Dr AR
//     await AccountEntry.create({
//       organizationId: orgId,
//       branchId: doc.branchId,
//       accountId: arId,
//       customerId: doc.customerId,
//       date: doc.invoiceDate,
//       debit: doc.grandTotal,
//       credit: 0,
//       description: `Inv #${doc.invoiceNumber}`,
//       referenceType: 'invoice',
//       referenceNumber: doc.invoiceNumber,
//       referenceId: doc._id
//     });

//     // Cr Sales
//     await AccountEntry.create({
//       organizationId: orgId,
//       branchId: doc.branchId,
//       accountId: salesId,
//       date: doc.invoiceDate,
//       debit: 0,
//       credit: doc.grandTotal,
//       description: `Rev #${doc.invoiceNumber}`,
//       referenceType: 'invoice',
//       referenceNumber: doc.invoiceNumber,
//       referenceId: doc._id
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

//     // Dr Purchases
//     await AccountEntry.create({
//       organizationId: orgId,
//       branchId: doc.branchId,
//       accountId: purchaseId,
//       date: doc.purchaseDate,
//       debit: doc.grandTotal,
//       credit: 0,
//       description: `Pur #${doc.invoiceNumber}`,
//       referenceType: 'purchase',
//       referenceNumber: doc.invoiceNumber,
//       referenceId: doc._id
//     });

//     // Cr AP
//     await AccountEntry.create({
//       organizationId: orgId,
//       branchId: doc.branchId,
//       accountId: apId,
//       supplierId: doc.supplierId,
//       date: doc.purchaseDate,
//       debit: 0,
//       credit: doc.grandTotal,
//       description: `Bill #${doc.invoiceNumber}`,
//       referenceType: 'purchase',
//       referenceNumber: doc.invoiceNumber,
//       referenceId: doc._id
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
//       // Dr Cash
//       await AccountEntry.create({
//         organizationId: orgId,
//         branchId: doc.branchId,
//         accountId: cashId,
//         date: doc.paymentDate,
//         debit: doc.amount,
//         credit: 0,
//         description: `Pay Recv ${doc.referenceNumber || ''}`,
//         referenceType: 'payment',
//         referenceNumber: doc.referenceNumber,
//         referenceId: doc._id
//       });
//       // Cr AR
//       await AccountEntry.create({
//         organizationId: orgId,
//         branchId: doc.branchId,
//         accountId: arId,
//         customerId: doc.customerId,
//         date: doc.paymentDate,
//         debit: 0,
//         credit: doc.amount,
//         description: `Pay Recv ${doc.referenceNumber || ''}`,
//         referenceType: 'payment',
//         referenceNumber: doc.referenceNumber,
//         referenceId: doc._id
//       });
//     } else {
//       // Dr AP
//       await AccountEntry.create({
//         organizationId: orgId,
//         branchId: doc.branchId,
//         accountId: apId,
//         supplierId: doc.supplierId,
//         date: doc.paymentDate,
//         debit: doc.amount,
//         credit: 0,
//         description: `Paid Supplier ${doc.referenceNumber || ''}`,
//         referenceType: 'payment',
//         referenceNumber: doc.referenceNumber,
//         referenceId: doc._id
//       });
//       // Cr Cash
//       await AccountEntry.create({
//         organizationId: orgId,
//         branchId: doc.branchId,
//         accountId: cashId,
//         date: doc.paymentDate,
//         debit: 0,
//         credit: doc.amount,
//         description: `Paid Supplier ${doc.referenceNumber || ''}`,
//         referenceType: 'payment',
//         referenceNumber: doc.referenceNumber,
//         referenceId: doc._id
//       });
//     }
//     count++;
//   }
//   console.log(`✅ Backfilled ${count} Payments.`);
// }

// // --- 4. MANUAL LEDGERS ---
// async function backfillManualLedgers(orgId) {
//   console.log('🔄 Processing Manual Journals...');
  
//   const ledgers = await OldLedger.find({ 
//     organizationId: orgId,
//     invoiceId: null, 
//     paymentId: null, 
//     purchaseId: null 
//   });

//   const cashId = await getAccountId(orgId, 'CASH'); 

//   let count = 0;
//   for (const doc of ledgers) {
//     // Only migrate if not already exists (check description + amount + date)
//     const exists = await AccountEntry.exists({ 
//         description: doc.description, 
//         date: doc.entryDate,
//         $or: [{ debit: doc.amount }, { credit: doc.amount }]
//     });
//     if (exists) continue;

//     await AccountEntry.create({
//       organizationId: orgId,
//       branchId: doc.branchId,
//       accountId: cashId, // Defaulting to Cash for manual migration safety
//       customerId: doc.customerId,
//       supplierId: doc.supplierId,
//       date: doc.entryDate,
//       debit: doc.type === 'debit' ? doc.amount : 0,
//       credit: doc.type === 'credit' ? doc.amount : 0,
//       description: doc.description || 'Manual Adjustment',
//       referenceType: 'manual',
//       referenceNumber: doc.referenceNumber
//     });
//     count++;
//   }
//   console.log(`✅ Backfilled ${count} Manual Ledgers.`);
// }

// (async () => {
//   try {
//     await connect();
//     // You can hardcode this ID for a single run if env var is annoying:
//     const orgId = process.env.BACKFILL_ORG_ID; 
    
//     if (!orgId) {
//         console.error('❌ Please set BACKFILL_ORG_ID in your .env file or command line.');
//         console.log('Example: BACKFILL_ORG_ID=65df... node src/scripts/backfillAccountEntries.js');
//         process.exit(1);
//     }

//     console.log(`🚀 Starting Migration for Org: ${orgId}`);
    
//     await backfillInvoices(orgId);
//     await backfillPurchases(orgId);
//     await backfillPayments(orgId);
//     await backfillManualLedgers(orgId);

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