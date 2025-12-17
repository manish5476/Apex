// src/services/statementsService.js
const mongoose = require('mongoose');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');

function toObjectIdIfNeeded(id) {
  if (!id) return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return id; }
}

/**
 * Profit & Loss (Income Statement)
 * Formula: Income - Expenses = Net Profit
 */
async function getProfitAndLoss(user, { startDate, endDate, branchId } = {}) {
  if (!user || !user.organizationId) throw new Error('Missing organization context');
  
  const orgId = toObjectIdIfNeeded(user.organizationId);
  const match = { organizationId: orgId };
  if (branchId) match.branchId = toObjectIdIfNeeded(branchId);

  // Date Range Filter
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  // Aggregate Income and Expenses
  const agg = [
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
      $match: { 'account.type': { $in: ['income', 'expense'] } }
    },
    {
      $group: {
        _id: '$account.type',
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    }
  ];

  const results = await AccountEntry.aggregate(agg);

  const getRow = (type) => results.find(r => r._id === type) || { totalDebit: 0, totalCredit: 0 };
  const incomeRow = getRow('income');
  const expenseRow = getRow('expense');

  // Calculations
  // Income is Credit-normal: (Credit - Debit)
  const totalIncome = incomeRow.totalCredit - incomeRow.totalDebit;
  
  // Expense is Debit-normal: (Debit - Credit)
  const totalExpenses = expenseRow.totalDebit - expenseRow.totalCredit;

  const netProfit = totalIncome - totalExpenses;

  return {
    period: { startDate, endDate },
    income: totalIncome,
    expenses: totalExpenses,
    netProfit
  };
}

/**
 * Balance Sheet
 * Formula: Assets = Liabilities + Equity
 */
async function getBalanceSheet(user, { asOnDate, branchId } = {}) {
  if (!user || !user.organizationId) throw new Error('Missing organization context');
  
  const orgId = toObjectIdIfNeeded(user.organizationId);
  const match = { organizationId: orgId };
  if (branchId) match.branchId = toObjectIdIfNeeded(branchId);

  const end = asOnDate ? new Date(asOnDate) : new Date();
  match.date = { $lte: end }; // Balance sheet is "As of", covers all history

  // Aggregate Assets, Liabilities, Equity
  const agg = [
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
        _id: '$account.type',
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    }
  ];

  const results = await AccountEntry.aggregate(agg);
  
  const getRow = (type) => results.find(r => r._id === type) || { totalDebit: 0, totalCredit: 0 };
  
  // Calculate Retained Earnings (Net Profit up to date)
  // This essentially does the P&L calculation again for the equity section
  const pl = await getProfitAndLoss(user, { endDate: end, branchId });
  const retainedEarnings = pl.netProfit;

  // Assets (Debit Balance)
  const assetsRow = getRow('asset');
  const totalAssets = assetsRow.totalDebit - assetsRow.totalCredit;

  // Liabilities (Credit Balance)
  const liabilitiesRow = getRow('liability');
  const totalLiabilities = liabilitiesRow.totalCredit - liabilitiesRow.totalDebit;

  // Equity (Credit Balance)
  const equityRow = getRow('equity');
  const totalEquity = (equityRow.totalCredit - equityRow.totalDebit) + retainedEarnings;

  return {
    asOnDate: end,
    assets: totalAssets,
    liabilities: totalLiabilities,
    equity: totalEquity,
    details: {
      retainedEarnings
    }
  };
}

/**
 * Trial Balance
 * Returns list of ALL accounts with their Debit/Credit totals.
 * Used to verify that Total Debit == Total Credit.
 */
async function getTrialBalance(user, { asOnDate, branchId } = {}) {
  if (!user || !user.organizationId) throw new Error('Missing organization context');
  
  const orgId = toObjectIdIfNeeded(user.organizationId);
  const match = { organizationId: orgId };
  if (branchId) match.branchId = toObjectIdIfNeeded(branchId);

  const end = asOnDate ? new Date(asOnDate) : new Date();
  match.date = { $lte: end };

  const agg = [
    { $match: match },
    {
      $group: {
        _id: '$accountId',
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' }
      }
    },
    {
      $lookup: {
        from: 'accounts',
        localField: '_id',
        foreignField: '_id',
        as: 'account'
      }
    },
    { $unwind: '$account' },
    {
      $project: {
        accountName: '$account.name',
        accountCode: '$account.code',
        type: '$account.type',
        debit: 1,
        credit: 1
      }
    },
    { $sort: { accountCode: 1 } }
  ];

  const rows = await AccountEntry.aggregate(agg);

  // Totals
  const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);

  return {
    asOnDate: end,
    rows,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      diff: totalDebit - totalCredit // Should be 0
    }
  };
}

module.exports = { getProfitAndLoss, getBalanceSheet, getTrialBalance };

// // src/services/statementsService.js
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Payment = require('../models/paymentModel');

// /**
//  * Important domain notes:
//  * - This implementation is pragmatic: it derives P&L from invoices (sales), purchases (COGS/expenses),
//  *   payments and ledger adjustments. For an accounting-accurate system you need a maintained Chart of Accounts (COA)
//  *   and post every transaction to specific account codes. This implementation provides correct aggregates
//  *   for most business dashboards and can be migrated to COA-based calculations later.
//  */

// function toObjectIdIfNeeded(id) {
//   if (!id) return null;
//   try { return mongoose.Types.ObjectId(id); } catch { return id; }
// }

// function dateRangeMatch(field, start, end) {
//   const m = {};
//   if (start) m.$gte = new Date(start);
//   if (end) m.$lte = new Date(end);
//   return Object.keys(m).length ? { [field]: m } : {};
// }

// /**
//  * Profit & Loss (P&L)
//  * - Sales = sum(invoice.grandTotal within period)
//  * - Cost of Goods Sold (COGS) approximation = sum(purchase.grandTotal for goods) [you might have a purchase.type to split]
//  * - Expenses = sum(ledger entries tagged as expense OR ledger.accountType == 'expense') + purchases not tied to inventory
//  * - Returns/adjustments handled via ledger entries (negative amounts)
//  */
// async function getProfitAndLoss(user, { startDate, endDate, branchId } = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const invoiceMatch = { ...baseMatch, ...dateRangeMatch('invoiceDate', startDate, endDate) };
//   const purchaseMatch = { ...baseMatch, ...dateRangeMatch('purchaseDate', startDate, endDate) };
//   const ledgerMatch = { ...baseMatch, ...dateRangeMatch('entryDate', startDate, endDate) };

//   // Sales
//   const salesAgg = [
//     { $match: invoiceMatch },
//     { $group: { _id: null, totalSales: { $sum: { $ifNull: ['$grandTotal', 0] } }, salesCount: { $sum: 1 } } }
//   ];
//   const salesRes = await Invoice.collection.aggregate(salesAgg).toArray();
//   const totalSales = (salesRes[0] && salesRes[0].totalSales) || 0;

//   // Purchases — treat purchases as COGS by default
//   const purchasesAgg = [
//     { $match: purchaseMatch },
//     { $group: { _id: null, totalPurchases: { $sum: { $ifNull: ['$grandTotal', 0] } }, purchaseCount: { $sum: 1 } } }
//   ];
//   const purchasesRes = await Purchase.collection.aggregate(purchasesAgg).toArray();
//   const totalPurchases = (purchasesRes[0] && purchasesRes[0].totalPurchases) || 0;

//   // Ledger entries grouped by accountType (if you use accountType) or type
//   const ledgerAgg = [
//     { $match: ledgerMatch },
//     { $group: { _id: '$accountType', total: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const ledgerRes = await Ledger.collection.aggregate(ledgerAgg).toArray();
//   // ledgerRes could look like [{ _id: 'expense', total: 2000 }, { _id: 'income', total: -100 }]
//   const ledgerMap = (ledgerRes || []).reduce((acc, r) => { acc[r._id || 'unknown'] = r.total; return acc; }, {});

//   // Expenses approximation:
//   const ledgerExpenses = ledgerMap['expense'] || 0;
//   // If you keep explicit expense purchases vs inventory purchases, refine logic here.
//   const totalExpenses = ledgerExpenses;

//   // Net profit approx:
//   const grossProfit = totalSales - totalPurchases;
//   const netProfit = grossProfit - totalExpenses;

//   return {
//     period: { startDate, endDate },
//     sales: { totalSales },
//     purchases: { totalPurchases },
//     ledger: ledgerMap,
//     grossProfit,
//     totalExpenses,
//     netProfit
//   };
// }

// /**
//  * Balance Sheet as of a given date.
//  * - Assets: cash/bank balances (approx from payments), receivables (invoices - payments), inventory (purchases - COGS, approximate)
//  * - Liabilities: payables (purchases - payments to suppliers), loans/other via ledger (accountType 'liability')
//  * - Equity: net retained earnings = sum(netProfit up to date) approximate
//  *
//  * NOTE: This is an approximate balance sheet. For accounting-accurate reports, maintain per-account balances in COA.
//  */
// async function getBalanceSheet(user, { asOnDate, branchId } = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const end = asOnDate ? new Date(asOnDate) : new Date();

//   // Receivables = sum(invoices where invoiceDate <= end) - sum(payments to invoices where paymentDate <= end)
//   const invoicesAgg = [
//     { $match: { ...baseMatch, invoiceDate: { $lte: end } } },
//     { $group: { _id: null, totalInvoiced: { $sum: { $ifNull: ['$grandTotal', 0] } } } }
//   ];
//   const invoicesRes = await Invoice.collection.aggregate(invoicesAgg).toArray();
//   const totalInvoiced = (invoicesRes[0] && invoicesRes[0].totalInvoiced) || 0;

//   const paymentsToInvoicesAgg = [
//     { $match: { ...baseMatch, paymentDate: { $lte: end }, type: 'inflow', invoiceId: { $exists: true, $ne: null } } },
//     { $group: { _id: null, totalPaidToInvoices: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const paidInvRes = await Payment.collection.aggregate(paymentsToInvoicesAgg).toArray();
//   const totalPaidToInvoices = (paidInvRes[0] && paidInvRes[0].totalPaidToInvoices) || 0;
//   const receivables = Math.max(0, totalInvoiced - totalPaidToInvoices);

//   // Cash/Bank balances = sum of payments (inflows - outflows) up to date
//   const cashAgg = [
//     { $match: { ...baseMatch, paymentDate: { $lte: end } } },
//     { $group: { _id: '$type', total: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const cashRes = await Payment.collection.aggregate(cashAgg).toArray();
//   let cashBalance = 0;
//   (cashRes || []).forEach(r => {
//     if (r._id === 'inflow') cashBalance += r.total;
//     else if (r._id === 'outflow') cashBalance -= r.total;
//   });

//   // Payables = sum(purchases up to date) - sum(payments to suppliers up to date)
//   const purchasesAgg = [
//     { $match: { ...baseMatch, purchaseDate: { $lte: end } } },
//     { $group: { _id: null, totalPurchased: { $sum: { $ifNull: ['$grandTotal', 0] } } } }
//   ];
//   const purchasesRes = await Purchase.collection.aggregate(purchasesAgg).toArray();
//   const totalPurchased = (purchasesRes[0] && purchasesRes[0].totalPurchased) || 0;

//   const paymentsToSuppliersAgg = [
//     { $match: { ...baseMatch, paymentDate: { $lte: end }, type: 'outflow', supplierId: { $exists: true, $ne: null } } },
//     { $group: { _id: null, totalPaidToSuppliers: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const paidSuppRes = await Payment.collection.aggregate(paymentsToSuppliersAgg).toArray();
//   const totalPaidToSuppliers = (paidSuppRes[0] && paidSuppRes[0].totalPaidToSuppliers) || 0;
//   const payables = Math.max(0, totalPurchased - totalPaidToSuppliers);

//   // Ledger balances by accountType
//   const ledgerAgg = [
//     { $match: { ...baseMatch, entryDate: { $lte: end } } },
//     { $group: { _id: '$accountType', total: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const ledgerRes = await Ledger.collection.aggregate(ledgerAgg).toArray();
//   const ledgerMap = (ledgerRes || []).reduce((acc, r) => { acc[r._id || 'unknown'] = r.total; return acc; }, {});

//   // Equity approximate as retained earnings = sum(netProfit to date). We'll approximate netProfit = sales - purchases - ledgerExpenses up to date
//   const plUpToDate = await getProfitAndLoss(user, { startDate: null, endDate: end, branchId });
//   const equity = plUpToDate.netProfit || 0;

//   const assets = {
//     cash: cashBalance,
//     receivables
//     // inventory & other assets omitted (requires inventory valuation)
//   };

//   const liabilities = {
//     payables,
//     // loans, other liabilities from ledgerMap['liability'] if present
//     other: ledgerMap['liability'] || 0
//   };

//   const equityObj = {
//     retainedEarnings: equity,
//     // additional equity from ledgerMap['equity'] if present
//     otherEquity: ledgerMap['equity'] || 0
//   };

//   return { asOnDate: end, assets, liabilities, equity: equityObj, ledgerMap };
// }

// /**
//  * Trial Balance as of a given date
//  * - Returns grouped sums by accountType and by type (debit/credit)
//  * - Requires ledger entries to carry accountCode/accountType. We will assemble:
//  *    - Invoices contribute to 'sales' credit
//  *    - Purchases contribute to 'purchases' debit (COGS or inventory)
//  *    - Payments adjust cash/bank (debit/credit accordingly)
//  *    - Ledger entries are used directly
//  *
//  * This is a pragmatic trial balance; replace with COA-based sums when you have account postings.
//  */
// async function getTrialBalance(user, { asOnDate, branchId } = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const end = asOnDate ? new Date(asOnDate) : new Date();

//   // Sales (credit)
//   const salesAgg = [
//     { $match: { ...baseMatch, invoiceDate: { $lte: end } } },
//     { $group: { _id: 'sales', credit: { $sum: { $ifNull: ['$grandTotal', 0] } }, debit: { $sum: 0 } } }
//   ];
//   const salesRes = await Invoice.collection.aggregate(salesAgg).toArray();

//   // Purchases (debit)
//   const purchasesAgg = [
//     { $match: { ...baseMatch, purchaseDate: { $lte: end } } },
//     { $group: { _id: 'purchases', debit: { $sum: { $ifNull: ['$grandTotal', 0] } }, credit: { $sum: 0 } } }
//   ];
//   const purchasesRes = await Purchase.collection.aggregate(purchasesAgg).toArray();

//   // Payments effect on cash: inflow -> debit cash, outflow -> credit cash (we'll summarize)
//   const paymentsAgg = [
//     { $match: { ...baseMatch, paymentDate: { $lte: end } } },
//     { $group: { _id: '$type', total: { $sum: { $ifNull: ['$amount', 0] } } } }
//   ];
//   const paymentsRes = await Payment.collection.aggregate(paymentsAgg).toArray();
//   let cashDebit = 0, cashCredit = 0;
//   (paymentsRes || []).forEach(r => {
//     if (r._id === 'inflow') cashDebit += r.total; // cash increases -> debit
//     else if (r._id === 'outflow') cashCredit += r.total;
//   });

//   // Ledger grouped by accountCode
//   const ledgerAgg = [
//     { $match: { ...baseMatch, entryDate: { $lte: end } } },
//     { $group: { _id: '$accountCode', debit: { $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] } }, credit: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } } } }
//   ];
//   const ledgerRes = await Ledger.collection.aggregate(ledgerAgg).toArray();

//   // Construct trial balance rows
//   const rows = [];

//   if (salesRes[0]) rows.push({ account: 'sales', debit: 0, credit: salesRes[0].credit || 0 });
//   if (purchasesRes[0]) rows.push({ account: 'purchases', debit: purchasesRes[0].debit || 0, credit: 0 });
//   if (cashDebit || cashCredit) rows.push({ account: 'cash', debit: cashDebit, credit: cashCredit });

//   (ledgerRes || []).forEach(r => {
//     rows.push({ account: r._id || 'unassigned', debit: r.debit || 0, credit: r.credit || 0 });
//   });

//   // totals
//   const totals = rows.reduce((acc, r) => { acc.debit += Number(r.debit || 0); acc.credit += Number(r.credit || 0); return acc; }, { debit: 0, credit: 0 });

//   return { asOnDate: end, rows, totals };
// }

// module.exports = { getProfitAndLoss, getBalanceSheet, getTrialBalance };
