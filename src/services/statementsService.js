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
