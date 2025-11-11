// src/controllers/adminController.js
const { getSummary, getMonthlyTrends, getOutstandingList } = require('../services/adminService');
const { logAudit } = require('../utils/auditLogger');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.summary = asyncHandler(async (req, res) => {
  const user = req.user;
  const data = await getSummary(user, { startDate: req.query.startDate, endDate: req.query.endDate, branchId: req.query.branchId });
  logAudit({ user, action: 'read:adminSummary', req, meta: { query: req.query } });
  res.status(200).json({ status: 'success', data });
});

exports.monthlyTrends = asyncHandler(async (req, res) => {
  const user = req.user;
  const months = req.query.months ? parseInt(req.query.months, 10) : 12;
  const data = await getMonthlyTrends(user, { months, branchId: req.query.branchId });
  logAudit({ user, action: 'read:adminMonthlyTrends', req, meta: { months } });
  res.status(200).json({ status: 'success', data });
});

exports.outstanding = asyncHandler(async (req, res) => {
  const user = req.user;
  const type = req.query.type || 'receivable';
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
  const data = await getOutstandingList(user, { type, limit, branchId: req.query.branchId });
  logAudit({ user, action: `read:adminOutstanding:${type}`, req, meta: { type, limit } });
  res.status(200).json({ status: 'success', data });
});
