// src/controllers/partyTransactionController.js
const { fetchTransactionsAggregated } = require('../../accounting/core/transaction.service');
const { logAudit } = require('../../../core/utils/db/auditLogger');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/v1/customers/:id/transactions
exports.getCustomerTransactions = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const query = { ...req.query, partyId: id };

  const data = await fetchTransactionsAggregated(user, query);

  logAudit({ user, action: 'read:customerTransactions', entityType: 'transaction', req, meta: { partyId: id } });

  res.status(200).json({
    status: 'success',
    total: data.total,
    page: data.page,
    limit: data.limit,
    results: data.results
  });
});

// GET /api/v1/suppliers/:id/transactions
exports.getSupplierTransactions = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const query = { ...req.query, partyId: id };

  const data = await fetchTransactionsAggregated(user, query);

  logAudit({ user, action: 'read:supplierTransactions', entityType: 'transaction', req, meta: { partyId: id } });

  res.status(200).json({
    status: 'success',
    total: data.total,
    page: data.page,
    limit: data.limit,
    results: data.results
  });
});
