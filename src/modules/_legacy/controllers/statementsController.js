// src/controllers/statementsController.js
const { getProfitAndLoss, getBalanceSheet, getTrialBalance } = require('../services/statementsService');
const { logAudit } = require('../../../core/utils/auditLogger');
const { format } = require('fast-csv'); // Run: npm install fast-csv
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.pl = asyncHandler(async (req, res) => {
  const user = req.user;
  const { startDate, endDate, branchId } = req.query;
  const data = await getProfitAndLoss(user, { startDate, endDate, branchId });
  logAudit({ user, action: 'read:pl', req, meta: { startDate, endDate, branchId } });
  res.status(200).json({ status: 'success', data });
});

exports.balanceSheet = asyncHandler(async (req, res) => {
  const user = req.user;
  const asOnDate = req.query.date || null;
  const branchId = req.query.branchId || null;
  const data = await getBalanceSheet(user, { asOnDate, branchId });
  logAudit({ user, action: 'read:balanceSheet', req, meta: { asOnDate, branchId } });
  res.status(200).json({ status: 'success', data });
});

exports.trialBalance = asyncHandler(async (req, res) => {
  const user = req.user;
  const asOnDate = req.query.date || null;
  const branchId = req.query.branchId || null;
  const data = await getTrialBalance(user, { asOnDate, branchId });
  logAudit({ user, action: 'read:trialBalance', req, meta: { asOnDate, branchId } });
  res.status(200).json({ status: 'success', data });
});

exports.exportStatement = asyncHandler(async (req, res) => {
  const user = req.user;
  const { type, format: fileFormat = 'csv', startDate, endDate, asOnDate, branchId } = req.query;

  let data, filename;
  
  if (type === 'pl') {
    data = await getProfitAndLoss(user, { startDate, endDate, branchId });
    filename = `ProfitLoss_${startDate}_to_${endDate}`;
  } else if (type === 'bs') {
    data = await getBalanceSheet(user, { asOnDate, branchId });
    filename = `BalanceSheet_${asOnDate}`;
  } else {
    return res.status(400).json({ status: 'fail', message: 'Invalid statement type' });
  }

  if (fileFormat === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    
    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    if (type === 'pl') {
      csvStream.write({ Section: 'INCOME', Category: '', Amount: '' });
      data.income.categories.forEach(c => csvStream.write({ Section: 'Income', Category: c.name, Amount: c.amount }));
      csvStream.write({ Section: 'EXPENSE', Category: '', Amount: '' });
      data.expenses.categories.forEach(c => csvStream.write({ Section: 'Expense', Category: c.name, Amount: c.amount }));
      csvStream.write({ Section: 'NET PROFIT', Category: '', Amount: data.netProfit });
    } else if (type === 'bs') {
       ['assets', 'liabilities', 'equity'].forEach(section => {
          csvStream.write({ Section: section.toUpperCase(), Category: '', Amount: '' });
          data[section].forEach(item => csvStream.write({ Section: section, Category: item.name, Amount: item.amount }));
       });
    }
    csvStream.end();
    return;
  }
  
  res.status(200).json({ status: 'success', data });
});