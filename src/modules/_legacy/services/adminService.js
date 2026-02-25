// src/services/adminService.js
const mongoose = require('mongoose');
const AccountEntry = require('../../accounting/core/accountEntry.model'); // ✅ Single Source
const Account = require('../../accounting/core/account.model'); 
const Customer = require('../../organization/core/customer.model');
const Supplier = require('../../organization/core/supplier.model');
const { getCache, setCache } = require('../../../config/redis');

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

