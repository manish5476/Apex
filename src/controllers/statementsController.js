// src/controllers/statementsController.js
const { getProfitAndLoss, getBalanceSheet, getTrialBalance } = require('../services/statementsService');
const { logAudit } = require('../utils/auditLogger');

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
