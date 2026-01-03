// src/scripts/verifyBackfillReport.js
require('dotenv').config();
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Payment = require('../models/paymentModel');
const AccountEntry = require('../models/accountEntryModel');

// Define Temp Schema for verification against old data
const ledgerSchema = new mongoose.Schema({}, { strict: false });
const OldLedger = mongoose.model('OldLedger', ledgerSchema, 'ledgers');

async function connect() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');
}

/**
 * Sum helpers
 */
async function sumInvoices(orgId) {
  const agg = [
    { $match: { organizationId: new mongoose.Types.ObjectId(orgId) } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$grandTotal', 0] } }, count: { $sum: 1 } } }
  ];
  const r = await Invoice.aggregate(agg);
  return r[0] || { total: 0, count: 0 };
}

async function sumPurchases(orgId) {
  const agg = [
    { $match: { organizationId: new mongoose.Types.ObjectId(orgId) } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$grandTotal', 0] } }, count: { $sum: 1 } } }
  ];
  const r = await Purchase.aggregate(agg);
  return r[0] || { total: 0, count: 0 };
}

async function sumPayments(orgId) {
  const agg = [
    { $match: { organizationId: new mongoose.Types.ObjectId(orgId) } },
    { $group: { _id: '$type', total: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
  ];
  const r = await Payment.aggregate(agg);
  const map = {};
  (r || []).forEach(x => map[x._id || 'unknown'] = x);
  return map;
}

async function sumOldLedger(orgId) {
  const agg = [
    { $match: { organizationId: new mongoose.Types.ObjectId(orgId) } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
  ];
  const r = await OldLedger.aggregate(agg);
  return r[0] || { total: 0, count: 0 };
}

/**
 * Aggregate AccountEntry totals grouped by referenceType
 */
async function sumAccountEntriesByReference(orgId) {
  const agg = [
    { $match: { organizationId: new mongoose.Types.ObjectId(orgId), referenceType: { $exists: true, $ne: null } } },
    { $group: {
        _id: { referenceType: '$referenceType', referenceId: '$referenceId' },
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
    } },
    { $project: {
        referenceType: '$_id.referenceType',
        referenceId: '$_id.referenceId',
        totalDebit: 1,
        totalCredit: 1
    } }
  ];
  const rows = await AccountEntry.aggregate(agg);
  return rows;
}

async function runVerification(orgId) {
  console.log('🔍 Verifying backfill for org:', orgId);
  const invoicesSum = await sumInvoices(orgId);
  const purchasesSum = await sumPurchases(orgId);
  const paymentsMap = await sumPayments(orgId);
  const ledgerSum = await sumOldLedger(orgId);
  const entryRows = await sumAccountEntriesByReference(orgId);

  // totals of AccountEntry by referenceType
  const totalsByType = {};
  entryRows.forEach(r => {
    const t = r.referenceType || 'unknown';
    totalsByType[t] = totalsByType[t] || { debit: 0, credit: 0, count: 0 };
    totalsByType[t].debit += Number(r.totalDebit || 0);
    totalsByType[t].credit += Number(r.totalCredit || 0);
    totalsByType[t].count++;
  });

  const report = {
    sourceTotals: {
      invoices: { total: invoicesSum.total || 0, count: invoicesSum.count || 0 },
      purchases: { total: purchasesSum.total || 0, count: purchasesSum.count || 0 },
      payments: Object.keys(paymentsMap).reduce((acc, k) => { acc[k] = { total: paymentsMap[k].total || 0, count: paymentsMap[k].count || 0 }; return acc; }, {}),
      oldLedger: { total: ledgerSum.total || 0, count: ledgerSum.count || 0 }
    },
    postedTotals: totalsByType,
    discrepancies: []
  };

  // --- CHECKS ---

  // 1. Invoices (Double Entry Check)
  // Expected: Debit + Credit = 2 * Invoice Total
  const invPost = totalsByType['invoice'] || { debit: 0, credit: 0 };
  const invCombined = (invPost.debit || 0) + (invPost.credit || 0);
  const invExpectedCombined = (invoicesSum.total || 0) * 2;
  
  if (Math.abs(invCombined - invExpectedCombined) > 1) { // Tolerance of 1.00
    report.discrepancies.push({
      type: 'Invoice Mismatch',
      expected: invExpectedCombined,
      actual: invCombined,
      diff: invCombined - invExpectedCombined
    });
  }

  // 2. Purchases
  const purPost = totalsByType['purchase'] || { debit: 0, credit: 0 };
  const purCombined = (purPost.debit || 0) + (purPost.credit || 0);
  const purExpectedCombined = (purchasesSum.total || 0) * 2;

  if (Math.abs(purCombined - purExpectedCombined) > 1) {
    report.discrepancies.push({
      type: 'Purchase Mismatch',
      expected: purExpectedCombined,
      actual: purCombined,
      diff: purCombined - purExpectedCombined
    });
  }

  // 3. Payments
  const payPost = totalsByType['payment'] || { debit: 0, credit: 0 };
  const payCombined = (payPost.debit || 0) + (payPost.credit || 0);
  
  let totalPayments = 0;
  for(let key in report.sourceTotals.payments) {
      totalPayments += report.sourceTotals.payments[key].total;
  }
  const payExpectedCombined = totalPayments * 2;

  if (Math.abs(payCombined - payExpectedCombined) > 1) {
    report.discrepancies.push({
      type: 'Payment Mismatch',
      expected: payExpectedCombined,
      actual: payCombined,
      diff: payCombined - payExpectedCombined
    });
  }

  console.log('--- VERIFICATION REPORT ---');
  console.log(JSON.stringify(report, null, 2));
  
  if(report.discrepancies.length === 0) {
      console.log("✅ All Systems Balanced.");
  } else {
      console.log("⚠️ Discrepancies Found. Run backfill script again.");
  }
}

(async () => {
  try {
    await connect();
    const orgId = process.env.BACKFILL_ORG_ID;
    if (!orgId) throw new Error('Set BACKFILL_ORG_ID env var');
    await runVerification(orgId);
  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();

// // scripts/verifyBackfillReport.js
// require('dotenv').config();
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Payment = require('../models/paymentModel');
// const AccountEntry = require('../models/accountEntryModel');

// async function connect() {
//   await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
//   console.log('Connected to MongoDB');
// }

// /**
//  * Sum helpers
//  */
// async function sumInvoices(orgId) {
//   const agg = [
//     { $match: { organizationId: mongoose.Types.ObjectId(orgId) } },
//     { $group: { _id: null, total: { $sum: { $ifNull: ['$grandTotal', 0] } }, count: { $sum: 1 } } }
//   ];
//   const r = await Invoice.collection.aggregate(agg).toArray();
//   return r[0] || { total: 0, count: 0 };
// }

// async function sumPurchases(orgId) {
//   const agg = [
//     { $match: { organizationId: mongoose.Types.ObjectId(orgId) } },
//     { $group: { _id: null, total: { $sum: { $ifNull: ['$grandTotal', 0] } }, count: { $sum: 1 } } }
//   ];
//   const r = await Purchase.collection.aggregate(agg).toArray();
//   return r[0] || { total: 0, count: 0 };
// }

// async function sumPayments(orgId) {
//   // separate inflow/outflow
//   const agg = [
//     { $match: { organizationId: mongoose.Types.ObjectId(orgId) } },
//     { $group: { _id: '$type', total: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
//   ];
//   const r = await Payment.collection.aggregate(agg).toArray();
//   const map = {};
//   (r || []).forEach(x => map[x._id || 'unknown'] = x);
//   return map;
// }

// async function sumLedger(orgId) {
//   const agg = [
//     { $match: { organizationId: mongoose.Types.ObjectId(orgId) } },
//     { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
//   ];
//   const r = await Ledger.collection.aggregate(agg).toArray();
//   return r[0] || { total: 0, count: 0 };
// }

// /**
//  * Aggregate AccountEntry totals grouped by referenceType
//  */
// async function sumAccountEntriesByReference(orgId) {
//   const agg = [
//     { $match: { organizationId: mongoose.Types.ObjectId(orgId), referenceType: { $exists: true, $ne: null } } },
//     { $group: {
//         _id: { referenceType: '$referenceType', referenceId: '$referenceId' },
//         totalDebit: { $sum: '$debit' },
//         totalCredit: { $sum: '$credit' }
//     } },
//     { $project: {
//         referenceType: '$_id.referenceType',
//         referenceId: '$_id.referenceId',
//         totalDebit: 1,
//         totalCredit: 1
//     } }
//   ];
//   const rows = await AccountEntry.collection.aggregate(agg).toArray();
//   return rows;
// }

// /**
//  * For each reference entry, compute net posted amount (credit - debit or debit - credit depending on type convention).
//  * We'll compute absolute totals by referenceType:
//  * - invoices -> expected credit = sales (credit) and debit = AR
//  * We'll simply compare sum of invoices' grandTotal vs sum of posted entries that have referenceType invoice.
//  */
// async function runVerification(orgId) {
//   console.log('Verifying backfill for org:', orgId);
//   const invoicesSum = await sumInvoices(orgId);
//   const purchasesSum = await sumPurchases(orgId);
//   const paymentsMap = await sumPayments(orgId);
//   const ledgerSum = await sumLedger(orgId);
//   const entryRows = await sumAccountEntriesByReference(orgId);

//   // totals of AccountEntry by referenceType
//   const totalsByType = {};
//   entryRows.forEach(r => {
//     const t = r.referenceType || 'unknown';
//     totalsByType[t] = totalsByType[t] || { debit: 0, credit: 0, count: 0 };
//     totalsByType[t].debit += Number(r.totalDebit || 0);
//     totalsByType[t].credit += Number(r.totalCredit || 0);
//     totalsByType[t].count++;
//   });

//   // Report summary
//   const report = {
//     sourceTotals: {
//       invoices: { total: invoicesSum.total || 0, count: invoicesSum.count || 0 },
//       purchases: { total: purchasesSum.total || 0, count: purchasesSum.count || 0 },
//       payments: Object.keys(paymentsMap).reduce((acc, k) => { acc[k] = { total: paymentsMap[k].total || 0, count: paymentsMap[k].count || 0 }; return acc; }, {}),
//       ledger: { total: ledgerSum.total || 0, count: ledgerSum.count || 0 }
//     },
//     postedTotals: totalsByType,
//     discrepancies: []
//   };

//   // Basic checks:
//   // Invoices: expects sum posted credit to SALES (credit) and debit to AR (debit) — combined debits/credits should equal invoice total * 2 (since two sides)
//   const invPost = totalsByType['invoice'] || { debit: 0, credit: 0 };
//   // For sanity: sum(inv.debit + inv.credit) should be close to invoicesSum.total * 2
//   const invCombined = (invPost.debit || 0) + (invPost.credit || 0);
//   const invExpectedCombined = (invoicesSum.total || 0) * 2;
//   if (Math.abs(invCombined - invExpectedCombined) > Math.max(1, 0.001 * invExpectedCombined)) {
//     report.discrepancies.push({
//       referenceType: 'invoice',
//       expectedCombined: invExpectedCombined,
//       postedCombined: invCombined,
//       note: 'Invoice postings mismatch: expected debits+credits ~ 2 * invoice sum'
//     });
//   }

//   const purPost = totalsByType['purchase'] || { debit: 0, credit: 0 };
//   const purCombined = (purPost.debit || 0) + (purPost.credit || 0);
//   const purExpectedCombined = (purchasesSum.total || 0) * 2;
//   if (Math.abs(purCombined - purExpectedCombined) > Math.max(1, 0.001 * purExpectedCombined)) {
//     report.discrepancies.push({
//       referenceType: 'purchase',
//       expectedCombined: purExpectedCombined,
//       postedCombined: purCombined,
//       note: 'Purchase postings mismatch'
//     });
//   }

//   // payments: sum of entry postings for payments should equal payments totals * 1 (since some payments posted as two entries but have same total)
//   const payPost = totalsByType['payment'] || { debit: 0, credit: 0 };
//   const payCombined = (payPost.debit || 0) + (payPost.credit || 0);
//   const payExpectedCombined = Object.keys(report.sourceTotals.payments).reduce((s,k)=> s + (report.sourceTotals.payments[k].total || 0), 0) * 2;
//   // Use 2*total because we expect two sided postings too
//   if (Math.abs(payCombined - payExpectedCombined) > Math.max(1, 0.001 * payExpectedCombined)) {
//     report.discrepancies.push({
//       referenceType: 'payment',
//       expectedCombined: payExpectedCombined,
//       postedCombined: payCombined,
//       note: 'Payment postings mismatch'
//     });
//   }

//   // ledger: ensure postings exist for ledger entries
//   const ledPost = totalsByType['ledger'] || { debit: 0, credit: 0 };
//   const ledCombined = (ledPost.debit || 0) + (ledPost.credit || 0);
//   const ledExpectedCombined = (ledgerSum.total || 0) * 2;
//   if (Math.abs(ledCombined - ledExpectedCombined) > Math.max(1, 0.001 * ledExpectedCombined)) {
//     report.discrepancies.push({
//       referenceType: 'ledger',
//       expectedCombined: ledExpectedCombined,
//       postedCombined: ledCombined,
//       note: 'Ledger postings mismatch'
//     });
//   }

//   // Detailed mismatches by referenceId: list rows where debit != credit OR absolute sum differs from source
//   // Build quick map of source amounts per referenceType+id (for invoices/purchases/payments/ledger)
//   const sourceMap = {};

//   // invoices map
//   const invs = await Invoice.find({ organizationId: orgId }).select('_id grandTotal').lean();
//   invs.forEach(i => sourceMap[`invoice:${String(i._id)}`] = Number(i.grandTotal || 0));

//   const purs = await Purchase.find({ organizationId: orgId }).select('_id grandTotal').lean();
//   purs.forEach(p => sourceMap[`purchase:${String(p._id)}`] = Number(p.grandTotal || 0));

//   const pays = await Payment.find({ organizationId: orgId }).select('_id amount').lean();
//   pays.forEach(p => sourceMap[`payment:${String(p._id)}`] = Number(p.amount || 0));

//   const leds = await Ledger.find({ organizationId: orgId }).select('_id amount').lean();
//   leds.forEach(l => sourceMap[`ledger:${String(l._1 || l._id)}`] = Number(l.amount || 0)); // use _id

//   // Evaluate each AccountEntry grouping
//   entryRows.forEach(r => {
//     const key = `${r.referenceType}:${String(r.referenceId)}`;
//     const postedSum = Number(r.totalDebit || 0) + Number(r.totalCredit || 0);
//     const = sourceMap[key] || 0;
//     const expected = * 2; // two-sided posting usually
//     if (Math.abs(postedSum - expected) > Math.max(1, 0.001 * expected)) {
//       report.discrepancies.push({
//         referenceType: r.referenceType,
//         referenceId: r.referenceId,
//         sourceAmount:,
//         postedDebit: r.totalDebit,
//         postedCredit: r.totalCredit,
//         postedCombined: postedSum,
//         expectedCombined: expected,
//         note: 'Per-reference posting mismatch'
//       });
//     }
//     // Also check debit vs credit equal (balanced)
//     if (Math.abs((r.totalDebit || 0) - (r.totalCredit || 0)) > 1e-6) {
//       report.discrepancies.push({
//         referenceType: r.referenceType,
//         referenceId: r.referenceId,
//         postedDebit: r.totalDebit,
//         postedCredit: r.totalCredit,
//         note: 'Unbalanced journal for reference'
//       });
//     }
//   });

//   // Output report to console; also write to file optionally
//   console.log('--- BACKFILL VERIFICATION SUMMARY ---');
//   console.log(JSON.stringify(report, null, 2));
//   return report;
// }

// (async () => {
//   try {
//     await connect();
//     const orgId = process.env.BACKFILL_ORG_ID || process.env.SEED_ORG_ID;
//     if (!orgId) throw new Error('Set BACKFILL_ORG_ID env var to organization id');
//     await runVerification(orgId);
//   } catch (err) {
//     console.error('Verification error:', err);
//   } finally {
//     await mongoose.disconnect();
//     process.exit(0);
//   }
// })();
