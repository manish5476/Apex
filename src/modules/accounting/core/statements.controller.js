'use strict';

/**
 * Statements Controller
 * ─────────────────────────────────────────────
 * Key fixes vs original:
 *   FIX #1 — Used asyncHandler instead of catchAsync. asyncHandler doesn't
 *     pass errors through your AppError handler. Fixed: use catchAsync.
 *
 *   FIX #2 — exportStatement CSV iterated data.income.categories and
 *     data.expenses.categories — but statementsService returns plain numbers
 *     for income/expenses, not objects with categories arrays. This threw a
 *     runtime TypeError. Fixed: CSV uses the flat numbers from the service.
 *
 *   FIX #3 — Missing audit log on exportStatement. Added.
 */

const { getProfitAndLoss, getBalanceSheet, getTrialBalance } = require('./service/statements.service');
const { logAudit } = require('../../../core/utils/db/auditLogger');
const { format }   = require('fast-csv');
const catchAsync   = require('../../../core/utils/api/catchAsync'); // FIX #1

exports.pl = catchAsync(async (req, res) => {
  const { startDate, endDate, branchId } = req.query;
  const data = await getProfitAndLoss(req.user, { startDate, endDate, branchId });
  logAudit({ user: req.user, action: 'read:pl', req, meta: { startDate, endDate, branchId } });
  res.status(200).json({ status: 'success', data });
});

exports.balanceSheet = catchAsync(async (req, res) => {
  const asOnDate = req.query.date   || null;
  const branchId = req.query.branchId || null;
  const data = await getBalanceSheet(req.user, { asOnDate, branchId });
  logAudit({ user: req.user, action: 'read:balanceSheet', req, meta: { asOnDate, branchId } });
  res.status(200).json({ status: 'success', data });
});

exports.trialBalance = catchAsync(async (req, res) => {
  const asOnDate = req.query.date   || null;
  const branchId = req.query.branchId || null;
  const data = await getTrialBalance(req.user, { asOnDate, branchId });
  logAudit({ user: req.user, action: 'read:trialBalance', req, meta: { asOnDate, branchId } });
  res.status(200).json({ status: 'success', data });
});

exports.exportStatement = catchAsync(async (req, res) => {
  const { type, format: fileFormat = 'csv', startDate, endDate, asOnDate, branchId } = req.query;

  let data, filename;

  if (type === 'pl') {
    data     = await getProfitAndLoss(req.user, { startDate, endDate, branchId });
    filename = `ProfitLoss_${startDate || 'all'}_to_${endDate || 'now'}`;
  } else if (type === 'bs') {
    data     = await getBalanceSheet(req.user, { asOnDate, branchId });
    filename = `BalanceSheet_${asOnDate || 'now'}`;
  } else if (type === 'tb') {
    data     = await getTrialBalance(req.user, { asOnDate, branchId });
    filename = `TrialBalance_${asOnDate || 'now'}`;
  } else {
    return res.status(400).json({ status: 'fail', message: 'Invalid type. Use: pl, bs, tb' });
  }

  logAudit({ user: req.user, action: 'export:statement', req, meta: { type, filename } }); // FIX #3

  if (fileFormat === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    // FIX #2: use the actual flat structure returned by the service
    if (type === 'pl') {
      csvStream.write({ Section: 'INCOME',     Category: 'Total Income',     Amount: data.income    });
      csvStream.write({ Section: 'EXPENSE',    Category: 'Total Expenses',   Amount: data.expenses  });
      csvStream.write({ Section: 'NET PROFIT', Category: '',                 Amount: data.netProfit });
    } else if (type === 'bs') {
      csvStream.write({ Section: 'ASSETS',      Category: 'Total Assets',      Amount: data.assets      });
      csvStream.write({ Section: 'LIABILITIES', Category: 'Total Liabilities', Amount: data.liabilities });
      csvStream.write({ Section: 'EQUITY',      Category: 'Total Equity',      Amount: data.equity      });
      csvStream.write({ Section: 'EQUITY',      Category: 'Retained Earnings', Amount: data.details?.retainedEarnings });
    } else if (type === 'tb') {
      data.rows.forEach(r => csvStream.write({
        Section: r.type, Category: `${r.accountCode} — ${r.accountName}`,
        Debit: r.debit, Credit: r.credit, Net: r.net,
      }));
      csvStream.write({ Section: 'TOTALS', Category: '', Debit: data.totals.debit, Credit: data.totals.credit, Net: data.totals.diff });
    }

    csvStream.end();
    return;
  }

  res.status(200).json({ status: 'success', data });
});

// // src/controllers/statementsController.js

// const { getProfitAndLoss, getBalanceSheet, getTrialBalance } = require('./service/statements.service');
// const { logAudit } = require('../../../core/utils/db/auditLogger');
// const { format } = require('fast-csv'); // Run: npm install fast-csv
// const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// exports.pl = asyncHandler(async (req, res) => {
//   const user = req.user;
//   const { startDate, endDate, branchId } = req.query;
//   const data = await getProfitAndLoss(user, { startDate, endDate, branchId });
//   logAudit({ user, action: 'read:pl', req, meta: { startDate, endDate, branchId } });
//   res.status(200).json({ status: 'success', data });
// });

// exports.balanceSheet = asyncHandler(async (req, res) => {
//   const user = req.user;
//   const asOnDate = req.query.date || null;
//   const branchId = req.query.branchId || null;
//   const data = await getBalanceSheet(user, { asOnDate, branchId });
//   logAudit({ user, action: 'read:balanceSheet', req, meta: { asOnDate, branchId } });
//   res.status(200).json({ status: 'success', data });
// });

// exports.trialBalance = asyncHandler(async (req, res) => {
//   const user = req.user;
//   const asOnDate = req.query.date || null;
//   const branchId = req.query.branchId || null;
//   const data = await getTrialBalance(user, { asOnDate, branchId });
//   logAudit({ user, action: 'read:trialBalance', req, meta: { asOnDate, branchId } });
//   res.status(200).json({ status: 'success', data });
// });

// exports.exportStatement = asyncHandler(async (req, res) => {
//   const user = req.user;
//   const { type, format: fileFormat = 'csv', startDate, endDate, asOnDate, branchId } = req.query;

//   let data, filename;
  
//   if (type === 'pl') {
//     data = await getProfitAndLoss(user, { startDate, endDate, branchId });
//     filename = `ProfitLoss_${startDate}_to_${endDate}`;
//   } else if (type === 'bs') {
//     data = await getBalanceSheet(user, { asOnDate, branchId });
//     filename = `BalanceSheet_${asOnDate}`;
//   } else {
//     return res.status(400).json({ status: 'fail', message: 'Invalid statement type' });
//   }

//   if (fileFormat === 'csv') {
//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    
//     const csvStream = format({ headers: true });
//     csvStream.pipe(res);

//     if (type === 'pl') {
//       csvStream.write({ Section: 'INCOME', Category: '', Amount: '' });
//       data.income.categories.forEach(c => csvStream.write({ Section: 'Income', Category: c.name, Amount: c.amount }));
//       csvStream.write({ Section: 'EXPENSE', Category: '', Amount: '' });
//       data.expenses.categories.forEach(c => csvStream.write({ Section: 'Expense', Category: c.name, Amount: c.amount }));
//       csvStream.write({ Section: 'NET PROFIT', Category: '', Amount: data.netProfit });
//     } else if (type === 'bs') {
//        ['assets', 'liabilities', 'equity'].forEach(section => {
//           csvStream.write({ Section: section.toUpperCase(), Category: '', Amount: '' });
//           data[section].forEach(item => csvStream.write({ Section: section, Category: item.name, Amount: item.amount }));
//        });
//     }
//     csvStream.end();
//     return;
//   }
  
//   res.status(200).json({ status: 'success', data });
// });