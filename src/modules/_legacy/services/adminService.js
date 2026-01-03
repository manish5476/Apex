// src/services/adminService.js
const mongoose = require('mongoose');
const AccountEntry = require('../../accounting/core/accountEntry.model'); // ✅ Single Source
const Account = require('../../accounting/core/account.model'); 
const Customer = require('../../organization/core/customer.model');
const Supplier = require('../../organization/core/supplier.model');
const { getCache, setCache } = require('../../../core/utils/_legacy/cache');

function toObjectIdIfNeeded(id) {
  if (!id) return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return id; }
}

function buildDateFilter(fieldName, startDate, endDate) {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) range.$lte = new Date(endDate);
  return { [fieldName]: range };
}

/**
 * getSummary(user, { startDate, endDate, branchId })
 * Returns financial totals directly from the General Ledger (AccountEntry)
 */
async function getSummary(user, opts = {}) {
  if (!user || !user.organizationId) throw new Error('Missing organization context');

  const cacheKey = `summary:${user.organizationId}:${opts.branchId || 'main'}:${opts.startDate || 'none'}:${opts.endDate || 'none'}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const orgId = toObjectIdIfNeeded(user.organizationId);
  const branchId = opts.branchId ? toObjectIdIfNeeded(opts.branchId) : null;
  
  // 1. Base Filter for Account Entries
  const match = { organizationId: orgId };
  if (branchId) match.branchId = branchId;
  
  // Date Filter
  if (opts.startDate || opts.endDate) {
    Object.assign(match, buildDateFilter('date', opts.startDate, opts.endDate));
  }

  // 2. Aggregate Totals by Account Type
  // We need to join with Account to know if it's Income, Expense, Asset (AR), or Liability (AP)
  const summaryAgg = [
    { $match: match },
    {
      $lookup: {
        from: 'accounts',
        localField: 'accountId',
        foreignField: '_id',
        as: 'account'
      }
    },
    { $unwind: '$account' },
    {
      $group: {
        _id: '$account.type', // Group by 'income', 'expense', 'asset', 'liability'
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    }
  ];

  const results = await AccountEntry.aggregate(summaryAgg);
  
  // Helper to safely get values
  const getTotals = (type) => {
    const row = results.find(r => r._id === type);
    return row ? { debit: row.totalDebit, credit: row.totalCredit } : { debit: 0, credit: 0 };
  };

  const incomeStats = getTotals('income');
  const expenseStats = getTotals('expense');
  const assetStats = getTotals('asset');     // Mostly AR + Cash
  const liabilityStats = getTotals('liability'); // Mostly AP

  // 3. Calculate Key Metrics
  // Sales = Total Credit in Income Accounts
  const totalSales = incomeStats.credit - incomeStats.debit;
  
  // Purchases = Total Debit in Expense Accounts
  const totalPurchases = expenseStats.debit - expenseStats.credit;
  
  // Net Revenue
  const netRevenue = totalSales - totalPurchases;

  // Outstanding Receivables (AR)
  // For precise AR, we'd filter specifically for 'Accounts Receivable' account, 
  // but essentially Assets Debit > Credit = Balance
  // We can do a quick specific query for AR account for precision:
  const arAccount = await Account.findOne({ organizationId: orgId, code: '1200' });
  let outstandingReceivables = 0;
  if (arAccount) {
      const arBal = await AccountEntry.aggregate([
          { $match: { ...match, accountId: arAccount._id } },
          { $group: { _id: null, bal: { $sum: { $subtract: ['$debit', '$credit'] } } } }
      ]);
      outstandingReceivables = arBal[0]?.bal || 0;
  }

  // Outstanding Payables (AP)
  const apAccount = await Account.findOne({ organizationId: orgId, code: '2000' });
  let outstandingPayables = 0;
  if (apAccount) {
      const apBal = await AccountEntry.aggregate([
          { $match: { ...match, accountId: apAccount._id } },
          { $group: { _id: null, bal: { $sum: { $subtract: ['$credit', '$debit'] } } } }
      ]);
      outstandingPayables = apBal[0]?.bal || 0;
  }

  // Payments In/Out (Cash Flow)
  // We look at entries where referenceType = 'payment'
  const paymentFlow = await AccountEntry.aggregate([
      { $match: { ...match, referenceType: 'payment' } },
      { $group: { _id: null, totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
  ]);
  
  // In Double Entry: 
  // Payment In = Debit Cash (Asset increases)
  // Payment Out = Credit Cash (Asset decreases)
  const paymentsIn = paymentFlow[0]?.totalDebit || 0;
  const paymentsOut = paymentFlow[0]?.totalCredit || 0;

  const result = {
    totals: {
      totalSales,
      totalPurchases,
      netRevenue,
      outstandingReceivables,
      outstandingPayables,
      paymentsIn,
      paymentsOut
    },
    period: { startDate: opts.startDate, endDate: opts.endDate }
  };

  await setCache(cacheKey, result, 60);
  return result;
}

/**
 * getMonthlyTrends(user, { months = 12 })
 * Trends derived from AccountEntry
 */
async function getMonthlyTrends(user, opts = {}) {
  const orgId = toObjectIdIfNeeded(user.organizationId);
  const months = Math.max(1, parseInt(opts.months, 10) || 12);
  
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  
  const match = { 
      organizationId: orgId,
      date: { $gte: start, $lte: end }
  };

  // Aggregation to get Sales (Income) and Purchases (Expense) per month
  const trendAgg = [
    { $match: match },
    {
      $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' }
    },
    { $unwind: '$account' },
    {
      $group: {
        _id: { 
            month: { $dateToString: { format: '%Y-%m', date: '$date' } },
            type: '$account.type'
        },
        amount: { $sum: { $subtract: ['$credit', '$debit'] } } // Income is Credit - Debit
      }
    },
    { $sort: { '_id.month': 1 } }
  ];

  const rawTrends = await AccountEntry.aggregate(trendAgg);

  // Remap for chart
  const monthMap = {};
  rawTrends.forEach(r => {
      const m = r._id.month;
      const type = r._id.type;
      if (!monthMap[m]) monthMap[m] = { month: m, sales: 0, purchases: 0 };
      
      if (type === 'income') monthMap[m].sales = Math.abs(r.amount); // Sales are Credit balance
      if (type === 'expense') monthMap[m].purchases = Math.abs(r.amount) * -1; // Expenses are Debit balance (usually comes negative in Cred-Deb logic, flip it)
  });

  const series = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  return { series };
}

/**
 * getOutstandingList(user, { type: 'receivable'|'payable' })
 * Top debtors/creditors based on AccountEntry balances
 */
async function getOutstandingList(user, opts = {}) {
  const orgId = toObjectIdIfNeeded(user.organizationId);
  const type = opts.type || 'receivable'; // receivable (Customers) or payable (Suppliers)
  const limit = 10;

  const match = { organizationId: orgId };
  
  // Filter by Party presence
  if (type === 'receivable') match.customerId = { $ne: null };
  else match.supplierId = { $ne: null };

  const groupBy = type === 'receivable' ? '$customerId' : '$supplierId';

  const agg = [
    { $match: match },
    {
      $group: {
        _id: groupBy,
        // Receivable (Asset): Debit - Credit
        // Payable (Liability): Credit - Debit
        balance: { 
            $sum: type === 'receivable' 
                ? { $subtract: ['$debit', '$credit'] }
                : { $subtract: ['$credit', '$debit'] }
        }
      }
    },
    { $match: { balance: { $gt: 0 } } }, // Only show those who owe money
    { $sort: { balance: -1 } },
    { $limit: limit },
    // Join Party Details
    {
        $lookup: {
            from: type === 'receivable' ? 'customers' : 'suppliers',
            localField: '_id',
            foreignField: '_id',
            as: 'party'
        }
    },
    { $unwind: '$party' },
    {
        $project: {
            partyName: type === 'receivable' ? '$party.name' : '$party.companyName',
            amount: '$balance'
        }
    }
  ];

  const list = await AccountEntry.aggregate(agg);
  return { type, list };
}

module.exports = { getSummary, getMonthlyTrends, getOutstandingList };


// // src/services/adminService.js
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Payment = require('../models/paymentModel');
// const { getCache, setCache } = require('../utils/cache');
// const Customer = require('../models/customerModel');
// const Supplier = require('../models/supplierModel');

// function toObjectIdIfNeeded(id) {
//   if (!id) return null;
//   try { return mongoose.Types.ObjectId(id); } catch { return id; }
// }

// function buildDateFilter(fieldName, startDate, endDate) {
//   if (!startDate && !endDate) return {};
//   const range = {};
//   if (startDate) range.$gte = new Date(startDate);
//   if (endDate) range.$lte = new Date(endDate);
//   return { [fieldName]: range };
// }

// /**
//  * getSummary(user, { startDate, endDate, branchId })
//  * Returns totals: sales, purchases, paymentsIn, paymentsOut, netRevenue, outstandingReceivables, outstandingPayables
//  */
// async function getSummary(user, opts = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');

  
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const branchId = opts.branchId || user.branchId || null;
//   const startDate = opts.startDate || null;
//   const endDate = opts.endDate || null;

//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const cacheKey = `summary:${user.organizationId}:${opts.branchId || 'main'}:${opts.startDate || 'none'}:${opts.endDate || 'none'}`;
// const cached = await getCache(cacheKey);
// if (cached) return cached;


//   // Invoice totals (sales)
//   const invoiceMatch = {
//     ...baseMatch,
//     ...buildDateFilter('invoiceDate', startDate, endDate)
//   };

//   const invoiceAgg = [
//     { $match: invoiceMatch },
//     { $group: { _id: null, totalSales: { $sum: { $ifNull: ['$grandTotal', 0] } }, invoiceCount: { $sum: 1 } } }
//   ];
//   const invoiceRes = await Invoice.collection.aggregate(invoiceAgg).toArray();
//   const totalSales = (invoiceRes[0] && invoiceRes[0].totalSales) || 0;
//   const invoiceCount = (invoiceRes[0] && invoiceRes[0].invoiceCount) || 0;

//   // Purchase totals
//   const purchaseMatch = {
//     ...baseMatch,
//     ...buildDateFilter('purchaseDate', startDate, endDate)
//   };
//   const purchaseAgg = [
//     { $match: purchaseMatch },
//     { $group: { _id: null, totalPurchases: { $sum: { $ifNull: ['$grandTotal', 0] } }, purchaseCount: { $sum: 1 } } }
//   ];
//   const purchaseRes = await Purchase.collection.aggregate(purchaseAgg).toArray();
//   const totalPurchases = (purchaseRes[0] && purchaseRes[0].totalPurchases) || 0;
//   const purchaseCount = (purchaseRes[0] && purchaseRes[0].purchaseCount) || 0;

//   // Payments: separate inflows and outflows
//   const paymentMatch = {
//     ...baseMatch,
//     ...buildDateFilter('paymentDate', startDate, endDate)
//   };
//   const paymentAgg = [
//     { $match: paymentMatch },
//     { $group: {
//         _id: '$type',
//         total: { $sum: { $ifNull: ['$amount', 0] } },
//         count: { $sum: 1 }
//     } }
//   ];
//   const paymentRes = await Payment.collection.aggregate(paymentAgg).toArray();
//   let paymentsIn = 0, paymentsOut = 0, paymentsCount = 0;
//   (paymentRes || []).forEach(p => {
//     if (!p._id) return;
//     if (String(p._id) === 'inflow') paymentsIn += p.total;
//     else if (String(p._id) === 'outflow') paymentsOut += p.total;
//     paymentsCount += p.count || 0;
//   });

//   // Outstanding Receivables:
//   // Strategy: sum(invoices.grandTotal) - sum(payments.amount where payment.invoiceId exists && type=inflow)
//   const paidToInvoicesAgg = [
//     { $match: { ...baseMatch, ...buildDateFilter('paymentDate', startDate, endDate), type: 'inflow', invoiceId: { $exists: true, $ne: null } } },
//     { $group: { _id: null, totalPaidToInvoices: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const paidRes = await Payment.collection.aggregate(paidToInvoicesAgg).toArray();
//   const totalPaidToInvoices = (paidRes[0] && paidRes[0].totalPaidToInvoices) || 0;

//   // Total invoice grand totals in the same period (we already got totalSales). Use that.
//   // Outstanding receivables approximate:
//   const outstandingReceivables = Math.max(0, totalSales - totalPaidToInvoices);

//   // Outstanding Payables (to suppliers):
//   // Sum(purchases.grandTotal) - sum(payments.amount where payment.purchaseId exists or supplierId && type=outflow)
//   const paidToPurchasesAgg = [
//     { $match: { ...baseMatch, ...buildDateFilter('paymentDate', startDate, endDate), type: 'outflow', $or: [{ purchaseId: { $exists: true, $ne: null } }, { supplierId: { $exists: true, $ne: null } }] } },
//     { $group: { _id: null, totalPaidToPurchases: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const paidPurchRes = await Payment.collection.aggregate(paidToPurchasesAgg).toArray();
//   const totalPaidToPurchases = (paidPurchRes[0] && paidPurchRes[0].totalPaidToPurchases) || 0;

//   const outstandingPayables = Math.max(0, totalPurchases - totalPaidToPurchases);

//   // Net revenue (simple): sales - purchases
//   const netRevenue = totalSales - totalPurchases;

//   // Quick ledger summary (adjustments)
//   const ledgerMatch = { ...baseMatch, ...buildDateFilter('entryDate', startDate, endDate) };
//   const ledgerAgg = [
//     { $match: ledgerMatch },
//     { $group: { _id: '$type', total: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const ledgerRes = await Ledger.collection.aggregate(ledgerAgg).toArray();
//   const ledgerTotals = {};
//   (ledgerRes || []).forEach(l => { ledgerTotals[l._id] = l.total; });

//   return {
//     totals: {
//       totalSales,
//       invoiceCount,
//       totalPurchases,
//       purchaseCount,
//       paymentsIn,
//       paymentsOut,
//       paymentsCount,
//       netRevenue,
//       outstandingReceivables,
//       outstandingPayables,
//       ledgerTotals
//     },
//   period: { startDate, endDate }
//   };
//   await setCache(cacheKey, result, 60); // cache for 1 minute
// return result;
// }

// /**
//  * getMonthlyTrends(user, { months = 12 })
//  * returns month-wise sales, purchases, paymentsIn/paymentsOut
//  */
// async function getMonthlyTrends(user, opts = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');

//   const cacheKey = `monthly:${user.organizationId}:${opts.branchId || 'main'}:${opts.months || 12}`;
// const cached = await getCache(cacheKey);
// if (cached) return cached;


//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const branchId = opts.branchId || user.branchId || null;
//   const months = Math.max(1, parseInt(opts.months, 10) || 12);

//   // compute startDate as first day of month 'months' ago
//   const end = new Date();
//   const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   // Helper to produce month key YYYY-MM
//   const monthProject = {
//     yearMonth: { $dateToString: { format: '%Y-%m', date: '$$date' } }
//   };

//   // Invoices monthly
//   const invoiceAgg = [
//     { $match: { ...baseMatch, invoiceDate: { $gte: start, $lte: end } } },
//     { $project: { amount: { $ifNull: ['$grandTotal', 0] }, month: { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } } } },
//     { $group: { _id: '$month', totalSales: { $sum: '$amount' }, count: { $sum: 1 } } },
//     { $sort: { _id: 1 } }
//   ];
//   const inv = await Invoice.collection.aggregate(invoiceAgg).toArray();

//   // Purchases monthly
//   const purchaseAgg = [
//     { $match: { ...baseMatch, purchaseDate: { $gte: start, $lte: end } } },
//     { $project: { amount: { $ifNull: ['$grandTotal', 0] }, month: { $dateToString: { format: '%Y-%m', date: '$purchaseDate' } } } },
//     { $group: { _id: '$month', totalPurchases: { $sum: '$amount' }, count: { $sum: 1 } } },
//     { $sort: { _id: 1 } }
//   ];
//   const pur = await Purchase.collection.aggregate(purchaseAgg).toArray();

//   // Payments monthly (split inflow / outflow)
//   const paymentAgg = [
//     { $match: { ...baseMatch, paymentDate: { $gte: start, $lte: end } } },
//     { $project: { amount: { $ifNull: ['$amount', 0] }, type: '$type', month: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } } } },
//     { $group: { _id: { month: '$month', type: '$type' }, total: { $sum: '$amount' } } },
//     { $sort: { '_id.month': 1 } }
//   ];
//   const pay = await Payment.collection.aggregate(paymentAgg).toArray();

//   // build unified array of months
//   const monthsSet = new Set();
//   inv.forEach(r => monthsSet.add(r._id));
//   pur.forEach(r => monthsSet.add(r._id));
//   pay.forEach(r => monthsSet.add(r._id));
//   const monthsArray = Array.from(monthsSet).sort();

//   // map results into month objects
//   const mapInv = inv.reduce((acc, r) => { acc[r._id] = r; return acc; }, {});
//   const mapPur = pur.reduce((acc, r) => { acc[r._1 || r._id] = r; return acc; }, {});
//   // payments keyed by month and type
//   const mapPay = {};
//   pay.forEach(r => {
//     const m = r._id.month;
//     const t = r._id.type;
//     mapPay[m] = mapPay[m] || {};
//     mapPay[m][t] = r.total;
//   });

//   // produce final series
//   const series = monthsArray.map(m => {
//     const sales = (mapInv[m] && mapInv[m].totalSales) || 0;
//     const purchases = (mapPur[m] && mapPur[m].totalPurchases) || 0;
//     const paymentsIn = (mapPay[m] && (mapPay[m].inflow || 0)) || 0;
//     const paymentsOut = (mapPay[m] && (mapPay[m].outflow || 0)) || 0;
//     return { month: m, sales, purchases, paymentsIn, paymentsOut, net: sales - purchases };
//   });

// await setCache(cacheKey, { series, months: monthsArray }, 300); // cache for 5 minutes
// return { series, months: monthsArray };
// }

// /**
//  * getOutstandingList(user, { type: 'receivable'|'payable', limit=20, sortBy='amount' })
//  * Returns top outstanding customers or suppliers.
//  */
// async function getOutstandingList(user, opts = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const branchId = opts.branchId || user.branchId || null;
//   const type = opts.type || 'receivable';
//   const limit = Math.max(1, parseInt(opts.limit, 10) || 20);
//   const sortBy = opts.sortBy || 'amount';

//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   if (type === 'receivable') {
//     // Aggregate outstanding per customer
//     const invoicesByCustomer = await Invoice.collection.aggregate([
//       { $match: { ...baseMatch } },
//       { $group: { _id: '$customerId', totalInvoiced: { $sum: { $ifNull: ['$grandTotal', 0] } } } }
//     ]).toArray();

//     const paymentsByCustomer = await Payment.collection.aggregate([
//       { $match: { ...baseMatch, type: 'inflow', customerId: { $exists: true, $ne: null } } },
//       { $group: { _id: '$customerId', totalPaid: { $sum: { $ifNull: ['$amount', 0] } } } }
//     ]).toArray();

//     const paidMap = (paymentsByCustomer || []).reduce((acc, r) => { acc[String(r._id)] = r.totalPaid; return acc; }, {});
//     const list = (invoicesByCustomer || []).map(r => {
//       const cid = r._id ? String(r._id) : null;
//       const invoiced = r.totalInvoiced || 0;
//       const paid = paidMap[cid] || 0;
//       const outstanding = Math.max(0, invoiced - paid);
//       return { partyId: r._id, invoiced, paid, outstanding };
//     }).filter(r => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, limit);

//     // Lookup customer names
//     const ids = list.map(r => r.partyId).filter(Boolean);
//     const customers = await Customer.find({ _id: { $in: ids } }).select('name phone email').lean();
//     const customerMap = customers.reduce((acc, c) => { acc[String(c._id)] = c; return acc; }, {});
//     const enriched = list.map(r => ({
//       ...r,
//       party: customerMap[String(r.partyId)] || null
//     }));

//     return { type: 'receivable', list: enriched };
//   } else {
//     // payables (supplier)
//     const purchasesBySupplier = await Purchase.collection.aggregate([
//       { $match: { ...baseMatch } },
//       { $group: { _id: '$supplierId', totalPurchased: { $sum: { $ifNull: ['$grandTotal', 0] } } } }
//     ]).toArray();

//     const paymentsToSuppliers = await Payment.collection.aggregate([
//       { $match: { ...baseMatch, type: 'outflow', supplierId: { $exists: true, $ne: null } } },
//       { $group: { _id: '$supplierId', totalPaid: { $sum: { $ifNull: ['$amount', 0] } } } }
//     ]).toArray();

//     const paidMap = (paymentsToSuppliers || []).reduce((acc, r) => { acc[String(r._id)] = r.totalPaid; return acc; }, {});
//     const list = (purchasesBySupplier || []).map(r => {
//       const sid = r._id ? String(r._id) : null;
//       const purchased = r.totalPurchased || 0;
//       const paid = paidMap[sid] || 0;
//       const outstanding = Math.max(0, purchased - paid);
//       return { partyId: r._id, purchased, paid, outstanding };
//     }).filter(r => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, limit);

//     // Lookup supplier names
//     const ids = list.map(r => r.partyId).filter(Boolean);
//     const suppliers = await Supplier.find({ _id: { $in: ids } }).select('name phone email').lean();
//     const supplierMap = suppliers.reduce((acc, s) => { acc[String(s._id)] = s; return acc; }, {});
//     const enriched = list.map(r => ({
//       ...r,
//       party: supplierMap[String(r.partyId)] || null
//     }));

//     return { type: 'payable', list: enriched };
//   }
// }

// module.exports = { getSummary, getMonthlyTrends, getOutstandingList };
