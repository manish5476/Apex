const Ledger = require('../models/ledgerModel');
const Customer = require('../models/customerModel');
const Supplier = require('../models/supplierModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const mongoose = require('mongoose');

/* -------------------------------------------------------------
 * Get All Ledger Entries (Scoped to Organization)
------------------------------------------------------------- */
exports.getAllLedgers = factory.getAll(Ledger);

/* -------------------------------------------------------------
 * Get One Ledger Entry
------------------------------------------------------------- */
exports.getLedger = factory.getOne(Ledger, [
  { path: 'customerId', select: 'name phone' },
  { path: 'supplierId', select: 'name phone' },
  { path: 'invoiceId', select: 'invoiceNumber grandTotal' },
  { path: 'purchaseId', select: 'invoiceNumber grandTotal' },
  { path: 'paymentId', select: 'amount paymentMethod type' },
]);

/* -------------------------------------------------------------
 * Delete Ledger Entry (Platform Admin only)
------------------------------------------------------------- */
exports.deleteLedger = factory.deleteOne(Ledger);

/* -------------------------------------------------------------
 * Get Ledger Entries by Customer
------------------------------------------------------------- */
exports.getCustomerLedger = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;

  const ledgers = await Ledger.find({
    organizationId: req.user.organizationId,
    customerId,
  })
    .sort({ createdAt: 1 })
    .select('createdAt description type amount');

  if (!ledgers.length) {
    return next(new AppError('No ledger records found for this customer', 404));
  }

  // Calculate running balance (debits increase, credits decrease)
  let balance = 0;
  const history = ledgers.map((entry) => {
    balance += entry.type === 'debit' ? entry.amount : -entry.amount;
    return {
      date: entry.createdAt,
      description: entry.description,
      type: entry.type,
      amount: entry.amount,
      balance,
    };
  });

  res.status(200).json({
    status: 'success',
    results: history.length,
    data: { customerId, history, closingBalance: balance },
  });
});

/* -------------------------------------------------------------
 * Get Ledger Entries by Supplier
------------------------------------------------------------- */
exports.getSupplierLedger = catchAsync(async (req, res, next) => {
  const { supplierId } = req.params;

  const ledgers = await Ledger.find({
    organizationId: req.user.organizationId,
    supplierId,
  })
    .sort({ createdAt: 1 })
    .select('createdAt description type amount');

  if (!ledgers.length) {
    return next(new AppError('No ledger records found for this supplier', 404));
  }

  // Calculate running balance (credits increase, debits decrease)
  let balance = 0;
  const history = ledgers.map((entry) => {
    balance += entry.type === 'credit' ? entry.amount : -entry.amount;
    return {
      date: entry.createdAt,
      description: entry.description,
      type: entry.type,
      amount: entry.amount,
      balance,
    };
  });

  res.status(200).json({
    status: 'success',
    results: history.length,
    data: { supplierId, history, closingBalance: balance },
  });
});

/* -------------------------------------------------------------
 * Organization Summary: Total Income vs Expenses
------------------------------------------------------------- */
exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;

  const summary = await Ledger.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  const income = summary.find((e) => e._id === 'credit')?.totalAmount || 0;
  const expense = summary.find((e) => e._id === 'debit')?.totalAmount || 0;

  res.status(200).json({
    status: 'success',
    data: {
      income,
      expense,
      netBalance: income - expense,
    },
  });
});


// GET /v1/ledgers/export?start=&end&customerId=&supplierId=
exports.exportLedgers = catchAsync(async (req, res, next) => {
  const { start, end, customerId, supplierId, format='csv' } = req.query;
  const filter = { organizationId: req.user.organizationId };
  if (start || end) filter.date = {};
  if (start) filter.date.$gte = new Date(start);
  if (end) filter.date.$lte = new Date(end);
  if (customerId) filter.customerId = customerId;
  if (supplierId) filter.supplierId = supplierId;

  const docs = await Ledger.find(filter).lean();
  if (format === 'csv') {
    const headers = ['date','type','amount','party','notes'];
    const rows = [headers.join(',')].concat(docs.map(d => {
      return `${d.date?.toISOString()||''},${d.type||''},${d.amount||0},${d.party||''},${JSON.stringify(d.notes||'')}`;
    }));
    res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
    res.setHeader('Content-Type', 'text/csv');
    return res.send(rows.join('\n'));
  }
  res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
});
