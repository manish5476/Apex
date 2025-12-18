const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const ApiFeatures = require('../utils/ApiFeatures');
const mongoose = require('mongoose');

/* -------------------------------------------------------------
   GET ALL ENTRIES (Journal View)
------------------------------------------------------------- */
exports.getAllLedgers = catchAsync(async (req, res, next) => {
  const filter = { organizationId: req.user.organizationId };

  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.supplierId) filter.supplierId = req.query.supplierId;
  if (req.query.accountId) filter.accountId = req.query.accountId;

  const features = new ApiFeatures(AccountEntry.find(filter), req.query)
    .sort({ date: -1 })
    .limitFields()
    .paginate();

  features.query = features.query.populate([
    { path: 'accountId', select: 'name code type' },
    { path: 'customerId', select: 'name phone' },
    { path: 'supplierId', select: 'companyName name' },
    { path: 'invoiceId', select: 'invoiceNumber' },
    { path: 'purchaseId', select: 'invoiceNumber' }
  ]);

  const docs = await features.query;

  res.status(200).json({
    status: 'success',
    results: docs.length,
    data: { data: docs }
  });
});

/* -------------------------------------------------------------
   CUSTOMER STATEMENT (Optimized)
------------------------------------------------------------- */
exports.getCustomerLedger = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const { startDate, endDate } = req.query;
  const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
  const custId = new mongoose.Types.ObjectId(customerId);

  let openingBalance = 0;
  let dateFilter = {};

  // 1. Calculate Opening Balance
  if (startDate) {
    const start = new Date(startDate);
    dateFilter = { $gte: start };

    const prevStats = await AccountEntry.aggregate([
      {
        $match: {
          organizationId: orgId,
          customerId: custId,
          date: { $lt: start }
        }
      },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' }
        }
      }
    ]);

    if (prevStats.length > 0) {
      openingBalance = prevStats[0].totalDebit - prevStats[0].totalCredit;
    }
  }

  if (endDate) {
    if (!dateFilter.$gte) dateFilter = {};
    dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
  }

  // 2. Fetch Range
  const query = { organizationId: orgId, customerId: custId };
  if (startDate || endDate) query.date = dateFilter;

  const entries = await AccountEntry.find(query)
    .sort({ date: 1, createdAt: 1 })
    .populate('invoiceId', 'invoiceNumber')
    .lean();

  // 3. Build Running Balance
  let runningBalance = openingBalance;
  const history = [];

  if (startDate) {
    history.push({
      _id: 'opening', date: new Date(startDate), description: 'Opening Balance',
      ref: '-', docRef: '-', debit: 0, credit: 0, balance: Number(runningBalance.toFixed(2))
    });
  }

  entries.forEach(entry => {
    const debit = entry.debit || 0;
    const credit = entry.credit || 0;
    runningBalance += (debit - credit);

    history.push({
      _id: entry._id, date: entry.date, description: entry.description,
      ref: entry.referenceNumber,
      docRef: entry.invoiceId?.invoiceNumber || entry.referenceNumber || '-',
      debit, credit, balance: Number(runningBalance.toFixed(2))
    });
  });

  res.status(200).json({
    status: 'success',
    results: history.length,
    data: { customerId, openingBalance, closingBalance: runningBalance, history }
  });
});

/* -------------------------------------------------------------
   SUPPLIER STATEMENT (Optimized)
------------------------------------------------------------- */
exports.getSupplierLedger = catchAsync(async (req, res, next) => {
  const { supplierId } = req.params;
  const { startDate, endDate } = req.query;
  const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
  const suppId = new mongoose.Types.ObjectId(supplierId);

  let openingBalance = 0;
  let dateFilter = {};

  if (startDate) {
    const start = new Date(startDate);
    dateFilter = { $gte: start };

    const prevStats = await AccountEntry.aggregate([
      {
        $match: {
          organizationId: orgId,
          supplierId: suppId,
          date: { $lt: start }
        }
      },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: '$debit' },
          totalCredit: { $sum: '$credit' }
        }
      }
    ]);

    if (prevStats.length > 0) {
      // Supplier (Liability): Credit - Debit
      openingBalance = prevStats[0].totalCredit - prevStats[0].totalDebit;
    }
  }

  if (endDate) {
    if (!dateFilter.$gte) dateFilter = {};
    dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
  }

  const query = { organizationId: orgId, supplierId: suppId };
  if (startDate || endDate) query.date = dateFilter;

  const entries = await AccountEntry.find(query)
    .sort({ date: 1, createdAt: 1 })
    .populate('purchaseId', 'invoiceNumber')
    .lean();

  let runningBalance = openingBalance;
  const history = [];

  if (startDate) {
    history.push({
      _id: 'opening', date: new Date(startDate), description: 'Opening Balance',
      ref: '-', docRef: '-', debit: 0, credit: 0, balance: Number(runningBalance.toFixed(2))
    });
  }

  entries.forEach(entry => {
    const debit = entry.debit || 0;
    const credit = entry.credit || 0;
    runningBalance += (credit - debit);

    history.push({
      _id: entry._id, date: entry.date, description: entry.description,
      ref: entry.referenceNumber,
      docRef: entry.purchaseId?.invoiceNumber || entry.referenceNumber || '-',
      debit, credit, balance: Number(runningBalance.toFixed(2))
    });
  });

  res.status(200).json({
    status: 'success',
    results: history.length,
    data: { supplierId, openingBalance, closingBalance: runningBalance, history }
  });
});

/* -------------------------------------------------------------
   ORG SUMMARY & EXPORTS
------------------------------------------------------------- */
exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { startDate, endDate } = req.query;
  const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const summary = await AccountEntry.aggregate([
    { $match: match },
    { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
    { $unwind: '$account' },
    { $group: { _id: '$account.type', totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
  ]);

  const incomeStats = summary.find(s => s._id === 'income') || { totalCredit: 0, totalDebit: 0 };
  const expenseStats = summary.find(s => s._id === 'expense') || { totalCredit: 0, totalDebit: 0 };

  const income = (incomeStats.totalCredit - incomeStats.totalDebit);
  const expense = (expenseStats.totalDebit - expenseStats.totalCredit);

  res.status(200).json({ status: 'success', data: { income, expense, netProfit: income - expense } });
});

exports.exportLedgers = catchAsync(async (req, res, next) => {
  const { start, end, customerId, supplierId, format = 'csv' } = req.query;
  const filter = { organizationId: req.user.organizationId };

  if (start || end) {
    filter.date = {};
    if (start) filter.date.$gte = new Date(start);
    if (end) filter.date.$lte = new Date(end);
  }
  if (customerId) filter.customerId = customerId;
  if (supplierId) filter.supplierId = supplierId;

  const docs = await AccountEntry.find(filter)
    .sort({ date: 1 })
    .populate('accountId', 'name')
    .populate('customerId', 'name')
    .populate('supplierId', 'companyName name')
    .lean();

  if (format === 'csv') {
    const headers = ['Date', 'Account', 'Description', 'Ref', 'Party', 'Debit', 'Credit', 'Balance'];
    let runningBalance = 0;
    const rows = docs.map(d => {
      const party = d.customerId?.name || d.supplierId?.companyName || d.supplierId?.name || '-';
      const account = d.accountId?.name || 'Unknown';
      const date = d.date ? new Date(d.date).toLocaleDateString() : '-';
      const notes = (d.description || '').replace(/,/g, ' ');
      const debit = d.debit || 0;
      const credit = d.credit || 0;
      if (supplierId) runningBalance += (credit - debit);
      else runningBalance += (debit - credit);

      return `${date},${account},${notes},${d.referenceNumber || '-'},${party},${debit},${credit},${runningBalance.toFixed(2)}`;
    });

    const csvContent = [headers.join(',')].concat(rows).join('\n');
    res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csvContent);
  }
  res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
});

// Standard CRUD
exports.getLedger = factory.getOne(AccountEntry);
exports.deleteLedger = factory.deleteOne(AccountEntry);

// const AccountEntry = require('../models/accountEntryModel'); // ✅ NEW SOURCE
// const Account = require('../models/accountModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const ApiFeatures = require('../utils/ApiFeatures');
// const mongoose = require('mongoose');

// /* -------------------------------------------------------------
//  * GET ALL ENTRIES (Journal View)
//  * Replaces the old Ledger List
// ------------------------------------------------------------- */
// exports.getAllLedgers = catchAsync(async (req, res, next) => {
//   // 1. Build Filter
//   const filter = { organizationId: req.user.organizationId };

//   // --- Date Range (Field is now 'date', not 'entryDate') ---
//   if (req.query.startDate || req.query.endDate) {
//     filter.date = {};
//     if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
//     if (req.query.endDate) {
//       const end = new Date(req.query.endDate);
//       end.setHours(23, 59, 59, 999);
//       filter.date.$lte = end;
//     }
//   }

//   // --- Specific Filters ---
//   if (req.query.customerId) filter.customerId = req.query.customerId;
//   if (req.query.supplierId) filter.supplierId = req.query.supplierId;

//   // Filter by Account (e.g., show all 'Cash' entries)
//   if (req.query.accountId) filter.accountId = req.query.accountId;

//   // 2. Execute Query
//   const features = new ApiFeatures(AccountEntry.find(filter), req.query)
//     .sort({ date: -1 })
//     .limitFields()
//     .paginate();

//   // 3. Populate for UI
//   features.query = features.query.populate([
//     { path: 'accountId', select: 'name code type' }, // ✅ Show Account Name
//     { path: 'customerId', select: 'name phone' },
//     { path: 'supplierId', select: 'companyName name' },
//     { path: 'invoiceId', select: 'invoiceNumber' },
//     { path: 'purchaseId', select: 'invoiceNumber' }
//   ]);

//   const docs = await features.query;

//   res.status(200).json({
//     status: 'success',
//     results: docs.length,
//     data: { data: docs }
//   });
// });

// /* -------------------------------------------------------------
//  * Get One Entry
// ------------------------------------------------------------- */
// exports.getLedger = factory.getOne(AccountEntry, [
//   { path: 'accountId', select: 'name code' },
//   { path: 'customerId', select: 'name' },
//   { path: 'supplierId', select: 'companyName' }
// ]);

// /* -------------------------------------------------------------
//  * Delete Entry (Restricted)
// ------------------------------------------------------------- */
// exports.deleteLedger = factory.deleteOne(AccountEntry);

// /* -------------------------------------------------------------
//  * CUSTOMER STATEMENT (Ledger)
//  * Logic: Running Balance of (Debit - Credit)
// ------------------------------------------------------------- */
// exports.getCustomerLedger = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;
//   const { startDate, endDate } = req.query;

//   const match = {
//     organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
//     customerId: new mongoose.Types.ObjectId(customerId) // ✅ Filter by Customer Tag
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
//   }

//   // Fetch entries sorted by date (oldest first for running balance)
//   const entries = await AccountEntry.find(match)
//     .sort({ date: 1, createdAt: 1 })
//     .populate('invoiceId', 'invoiceNumber')
//     .lean();

//   let balance = 0;

//   const history = entries.map((entry) => {
//     // Customer Logic (Asset):
//     // Debit = They bought something (Balance Increases)
//     // Credit = They paid us (Balance Decreases)
//     const debit = entry.debit || 0;
//     const credit = entry.credit || 0;

//     balance += (debit - credit);

//     return {
//       _id: entry._id,
//       date: entry.date,
//       description: entry.description,
//       ref: entry.referenceNumber,
//       // Fallback to invoice number if ref is missing
//       docRef: entry.invoiceId?.invoiceNumber || entry.referenceNumber || '-',
//       debit,
//       credit,
//       balance: Number(balance.toFixed(2))
//     };
//   });

//   res.status(200).json({
//     status: 'success',
//     results: history.length,
//     data: { customerId, history, closingBalance: balance }
//   });
// });

// /* -------------------------------------------------------------
//  * SUPPLIER STATEMENT (Ledger)
//  * Logic: Running Balance of (Credit - Debit)
// ------------------------------------------------------------- */
// exports.getSupplierLedger = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;
//   const { startDate, endDate } = req.query;

//   const match = {
//     organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
//     supplierId: new mongoose.Types.ObjectId(supplierId) // ✅ Filter by Supplier Tag
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
//   }

//   const entries = await AccountEntry.find(match)
//     .sort({ date: 1, createdAt: 1 })
//     .populate('purchaseId', 'invoiceNumber')
//     .lean();

//   let balance = 0;

//   const history = entries.map((entry) => {
//     // Supplier Logic (Liability):
//     // Credit = We bought something (Balance Increases)
//     // Debit = We paid them (Balance Decreases)
//     const debit = entry.debit || 0;
//     const credit = entry.credit || 0;

//     balance += (credit - debit);

//     return {
//       _id: entry._id,
//       date: entry.date,
//       description: entry.description,
//       ref: entry.referenceNumber,
//       docRef: entry.purchaseId?.invoiceNumber || entry.referenceNumber || '-',
//       debit,
//       credit,
//       balance: Number(balance.toFixed(2))
//     };
//   });

//   res.status(200).json({
//     status: 'success',
//     results: history.length,
//     data: { supplierId, history, closingBalance: balance }
//   });
// });

// /* -------------------------------------------------------------
//  * ORGANIZATION SUMMARY (Income vs Expense)
//  * Note: Must join with Accounts to determine Type
// ------------------------------------------------------------- */
// exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
//   const { organizationId } = req.user;
//   const { startDate, endDate } = req.query;

//   const match = {
//     organizationId: new mongoose.Types.ObjectId(organizationId)
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(endDate);
//   }

//   // Aggregate by Account Type
//   const summary = await AccountEntry.aggregate([
//     { $match: match },
//     {
//       $lookup: {
//         from: 'accounts', // Join with Account collection
//         localField: 'accountId',
//         foreignField: '_id',
//         as: 'account'
//       }
//     },
//     { $unwind: '$account' },
//     {
//       $group: {
//         _id: '$account.type',
//         totalDebit: { $sum: '$debit' },
//         totalCredit: { $sum: '$credit' }
//       }
//     }
//   ]);

//   // Income = Credit - Debit
//   const incomeStats = summary.find(s => s._id === 'income') || { totalCredit: 0, totalDebit: 0 };
//   const income = (incomeStats.totalCredit - incomeStats.totalDebit);

//   // Expense = Debit - Credit
//   const expenseStats = summary.find(s => s._id === 'expense') || { totalCredit: 0, totalDebit: 0 };
//   const expense = (expenseStats.totalDebit - expenseStats.totalCredit);

//   res.status(200).json({
//     status: 'success',
//     data: {
//       income,
//       expense,
//       netProfit: income - expense
//     }
//   });
// });

// /* -------------------------------------------------------------
//  * EXPORT LEDGERS (CSV)
// ------------------------------------------------------------- */
// exports.exportLedgers = catchAsync(async (req, res, next) => {
//   const { start, end, customerId, supplierId, format = 'csv' } = req.query;
//   const filter = { organizationId: req.user.organizationId };

//   if (start || end) {
//     filter.date = {};
//     if (start) filter.date.$gte = new Date(start);
//     if (end) filter.date.$lte = new Date(end);
//   }
//   if (customerId) filter.customerId = customerId;
//   if (supplierId) filter.supplierId = supplierId;

//   const docs = await AccountEntry.find(filter)
//     .sort({ date: 1 })
//     .populate('accountId', 'name')
//     .populate('customerId', 'name')
//     .populate('supplierId', 'companyName name')
//     .lean();

//   if (format === 'csv') {
//     const headers = ['Date', 'Account', 'Description', 'Ref', 'Party', 'Debit', 'Credit', 'Balance'];
//     let runningBalance = 0;

//     const rows = docs.map(d => {
//       const party = d.customerId?.name || d.supplierId?.companyName || d.supplierId?.name || '-';
//       const account = d.accountId?.name || 'Unknown';
//       const date = d.date ? new Date(d.date).toLocaleDateString() : '-';
//       const notes = (d.description || '').replace(/,/g, ' ');
//       const ref = d.referenceNumber || '-';

//       const debit = d.debit || 0;
//       const credit = d.credit || 0;

//       // Running Balance Logic
//       if (supplierId) {
//         runningBalance += (credit - debit);
//       } else {
//         runningBalance += (debit - credit);
//       }

//       return `${date},${account},${notes},${ref},${party},${debit || ''},${credit || ''},${runningBalance.toFixed(2)}`;
//     });

//     const csvContent = [headers.join(',')].concat(rows).join('\n');

//     res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
//     res.setHeader('Content-Type', 'text/csv');
//     return res.send(csvContent);
//   }

//   res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
// });
