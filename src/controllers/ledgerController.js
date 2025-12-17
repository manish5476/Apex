const AccountEntry = require('../models/accountEntryModel'); // ✅ NEW SOURCE
const Account = require('../models/accountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const ApiFeatures = require('../utils/ApiFeatures');
const mongoose = require('mongoose');

/* -------------------------------------------------------------
 * GET ALL ENTRIES (Journal View)
 * Replaces the old Ledger List
------------------------------------------------------------- */
exports.getAllLedgers = catchAsync(async (req, res, next) => {
  // 1. Build Filter
  const filter = { organizationId: req.user.organizationId };

  // --- Date Range (Field is now 'date', not 'entryDate') ---
  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  // --- Specific Filters ---
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.supplierId) filter.supplierId = req.query.supplierId;

  // Filter by Account (e.g., show all 'Cash' entries)
  if (req.query.accountId) filter.accountId = req.query.accountId;

  // 2. Execute Query
  const features = new ApiFeatures(AccountEntry.find(filter), req.query)
    .sort({ date: -1 })
    .limitFields()
    .paginate();

  // 3. Populate for UI
  features.query = features.query.populate([
    { path: 'accountId', select: 'name code type' }, // ✅ Show Account Name
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
 * Get One Entry
------------------------------------------------------------- */
exports.getLedger = factory.getOne(AccountEntry, [
  { path: 'accountId', select: 'name code' },
  { path: 'customerId', select: 'name' },
  { path: 'supplierId', select: 'companyName' }
]);

/* -------------------------------------------------------------
 * Delete Entry (Restricted)
------------------------------------------------------------- */
exports.deleteLedger = factory.deleteOne(AccountEntry);

/* -------------------------------------------------------------
 * CUSTOMER STATEMENT (Ledger)
 * Logic: Running Balance of (Debit - Credit)
------------------------------------------------------------- */
exports.getCustomerLedger = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
    customerId: new mongoose.Types.ObjectId(customerId) // ✅ Filter by Customer Tag
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
  }

  // Fetch entries sorted by date (oldest first for running balance)
  const entries = await AccountEntry.find(match)
    .sort({ date: 1, createdAt: 1 })
    .populate('invoiceId', 'invoiceNumber')
    .lean();

  let balance = 0;

  const history = entries.map((entry) => {
    // Customer Logic (Asset):
    // Debit = They bought something (Balance Increases)
    // Credit = They paid us (Balance Decreases)
    const debit = entry.debit || 0;
    const credit = entry.credit || 0;

    balance += (debit - credit);

    return {
      _id: entry._id,
      date: entry.date,
      description: entry.description,
      ref: entry.referenceNumber,
      // Fallback to invoice number if ref is missing
      docRef: entry.invoiceId?.invoiceNumber || entry.referenceNumber || '-',
      debit,
      credit,
      balance: Number(balance.toFixed(2))
    };
  });

  res.status(200).json({
    status: 'success',
    results: history.length,
    data: { customerId, history, closingBalance: balance }
  });
});

/* -------------------------------------------------------------
 * SUPPLIER STATEMENT (Ledger)
 * Logic: Running Balance of (Credit - Debit)
------------------------------------------------------------- */
exports.getSupplierLedger = catchAsync(async (req, res, next) => {
  const { supplierId } = req.params;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
    supplierId: new mongoose.Types.ObjectId(supplierId) // ✅ Filter by Supplier Tag
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
  }

  const entries = await AccountEntry.find(match)
    .sort({ date: 1, createdAt: 1 })
    .populate('purchaseId', 'invoiceNumber')
    .lean();

  let balance = 0;

  const history = entries.map((entry) => {
    // Supplier Logic (Liability):
    // Credit = We bought something (Balance Increases)
    // Debit = We paid them (Balance Decreases)
    const debit = entry.debit || 0;
    const credit = entry.credit || 0;

    balance += (credit - debit);

    return {
      _id: entry._id,
      date: entry.date,
      description: entry.description,
      ref: entry.referenceNumber,
      docRef: entry.purchaseId?.invoiceNumber || entry.referenceNumber || '-',
      debit,
      credit,
      balance: Number(balance.toFixed(2))
    };
  });

  res.status(200).json({
    status: 'success',
    results: history.length,
    data: { supplierId, history, closingBalance: balance }
  });
});

/* -------------------------------------------------------------
 * ORGANIZATION SUMMARY (Income vs Expense)
 * Note: Must join with Accounts to determine Type
------------------------------------------------------------- */
exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  // Aggregate by Account Type
  const summary = await AccountEntry.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'accounts', // Join with Account collection
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
  ]);

  // Income = Credit - Debit
  const incomeStats = summary.find(s => s._id === 'income') || { totalCredit: 0, totalDebit: 0 };
  const income = (incomeStats.totalCredit - incomeStats.totalDebit);

  // Expense = Debit - Credit
  const expenseStats = summary.find(s => s._id === 'expense') || { totalCredit: 0, totalDebit: 0 };
  const expense = (expenseStats.totalDebit - expenseStats.totalCredit);

  res.status(200).json({
    status: 'success',
    data: {
      income,
      expense,
      netProfit: income - expense
    }
  });
});

/* -------------------------------------------------------------
 * EXPORT LEDGERS (CSV)
------------------------------------------------------------- */
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
      const ref = d.referenceNumber || '-';

      const debit = d.debit || 0;
      const credit = d.credit || 0;

      // Running Balance Logic
      if (supplierId) {
        runningBalance += (credit - debit);
      } else {
        runningBalance += (debit - credit);
      }

      return `${date},${account},${notes},${ref},${party},${debit || ''},${credit || ''},${runningBalance.toFixed(2)}`;
    });

    const csvContent = [headers.join(',')].concat(rows).join('\n');

    res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csvContent);
  }

  res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
});

// const Ledger = require('../models/ledgerModel');
// const Customer = require('../models/customerModel');
// const Supplier = require('../models/supplierModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const ApiFeatures = require('../utils/ApiFeatures'); // ✅ Make sure to import this
// const mongoose = require('mongoose');


// exports.getAllLedgers = catchAsync(async (req, res, next) => {
//   // 1. Build Custom Filter
//   const filter = { organizationId: req.user.organizationId };

//   // --- Date Range Filter (startDate/endDate -> entryDate) ---
//   if (req.query.startDate || req.query.endDate) {
//     filter.entryDate = {};
//     if (req.query.startDate) filter.entryDate.$gte = new Date(req.query.startDate);
//     if (req.query.endDate) {
//       // Set end date to end of day
//       const end = new Date(req.query.endDate);
//       end.setHours(23, 59, 59, 999);
//       filter.entryDate.$lte = end;
//     }
//   }
//   if (req.query.type) filter.type = req.query.type; // 'credit' or 'debit'
//   if (req.query.customerId) filter.customerId = req.query.customerId;
//   if (req.query.supplierId) filter.supplierId = req.query.supplierId;
//   if (req.query.accountId) filter.accountType = req.query.accountId; // If you filter by 'expense', 'income' etc.
//   const features = new ApiFeatures(Ledger.find(filter), req.query)
//     .sort() // Defaults to -createdAt if not specified
//     .limitFields()
//     .paginate();
//   features.query = features.query.populate([
//     { path: 'customerId', select: 'name phone' },
//     { path: 'supplierId', select: 'name companyName phone' },
//     { path: 'invoiceId', select: 'invoiceNumber' },
//     { path: 'purchaseId', select: 'invoiceNumber' }
//   ]);

//   // 4. Execute Query
//   const docs = await features.query;

//   res.status(200).json({
//     status: 'success',
//     results: docs.length,
//     data: { data: docs }
//   });
// });

// /* -------------------------------------------------------------
//  * Get One Ledger Entry
// ------------------------------------------------------------- */
// exports.getLedger = factory.getOne(Ledger, [
//   { path: 'customerId', select: 'name phone' },
//   { path: 'supplierId', select: 'name phone' },
//   { path: 'invoiceId', select: 'invoiceNumber grandTotal' },
//   { path: 'purchaseId', select: 'invoiceNumber grandTotal' },
//   { path: 'paymentId', select: 'amount paymentMethod type' },
// ]);

// /* -------------------------------------------------------------
//  * Delete Ledger Entry (Platform Admin only)
// ------------------------------------------------------------- */
// exports.deleteLedger = factory.deleteOne(Ledger);

// /* -------------------------------------------------------------
//  * Get Ledger Entries by Customer (With Running Balance)
// ------------------------------------------------------------- */
// exports.getCustomerLedger = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;
//   const { startDate, endDate } = req.query;

//   // Base Match
//   const match = {
//     organizationId: req.user.organizationId,
//     customerId: new mongoose.Types.ObjectId(customerId)
//   };

//   // Date Filtering
//   if (startDate || endDate) {
//     match.entryDate = {};
//     if (startDate) match.entryDate.$gte = new Date(startDate);
//     if (endDate) {
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       match.entryDate.$lte = end;
//     }
//   }

//   // Fetch Logic
//   const ledgers = await Ledger.find(match)
//     .sort({ entryDate: 1, createdAt: 1 }) // Chronological order for running balance
//     .select('entryDate description type amount referenceNumber')
//     .lean();

//   if (!ledgers.length) {
//     return res.status(200).json({
//       status: 'success',
//       results: 0,
//       data: { customerId, history: [], closingBalance: 0 }
//     });
//   }

//   // Calculate Running Balance
//   // Note: For pagination to work with running balance, you ideally need the
//   // "Opening Balance" from before the page starts. This simplified version
//   // calculates balance based on fetched records.

//   let balance = 0;
//   // Optional: If date filter exists, you might want to fetch "Opening Balance"
//   // from transactions BEFORE startDate. For now, we start at 0.

//   const history = ledgers.map((entry) => {
//     // Logic: Debit increases what customer owes (Receivable), Credit decreases it.
//     balance += entry.type === 'debit' ? entry.amount : -entry.amount;
//     return {
//       _id: entry._id,
//       date: entry.entryDate,
//       description: entry.description,
//       ref: entry.referenceNumber,
//       type: entry.type,
//       amount: entry.amount,
//       balance,
//     };
//   });

//   res.status(200).json({
//     status: 'success',
//     results: history.length,
//     data: { customerId, history, closingBalance: balance },
//   });
// });

// /* -------------------------------------------------------------
//  * Get Ledger Entries by Supplier (With Running Balance)
// ------------------------------------------------------------- */
// exports.getSupplierLedger = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;
//   const { startDate, endDate } = req.query;

//   const match = {
//     organizationId: req.user.organizationId,
//     supplierId: new mongoose.Types.ObjectId(supplierId)
//   };

//   if (startDate || endDate) {
//     match.entryDate = {};
//     if (startDate) match.entryDate.$gte = new Date(startDate);
//     if (endDate) {
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       match.entryDate.$lte = end;
//     }
//   }

//   const ledgers = await Ledger.find(match)
//     .sort({ entryDate: 1, createdAt: 1 })
//     .select('entryDate description type amount referenceNumber')
//     .lean();

//   if (!ledgers.length) {
//     return res.status(200).json({
//       status: 'success',
//       results: 0,
//       data: { supplierId, history: [], closingBalance: 0 }
//     });
//   }

//   let balance = 0;
//   const history = ledgers.map((entry) => {
//     // Logic: Credit increases what we owe supplier (Payable), Debit decreases it.
//     balance += entry.type === 'credit' ? entry.amount : -entry.amount;
//     return {
//       _id: entry._id,
//       date: entry.entryDate,
//       description: entry.description,
//       ref: entry.referenceNumber,
//       type: entry.type,
//       amount: entry.amount,
//       balance,
//     };
//   });

//   res.status(200).json({
//     status: 'success',
//     results: history.length,
//     data: { supplierId, history, closingBalance: balance },
//   });
// });

// /* -------------------------------------------------------------
//  * Organization Summary
// ------------------------------------------------------------- */
// exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
//   const { organizationId } = req.user;
//   const { startDate, endDate } = req.query;

//   const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };

//   if (startDate || endDate) {
//     match.entryDate = {};
//     if (startDate) match.entryDate.$gte = new Date(startDate);
//     if (endDate) match.entryDate.$lte = new Date(endDate);
//   }

//   const summary = await Ledger.aggregate([
//     { $match: match },
//     {
//       $group: {
//         _id: '$type',
//         totalAmount: { $sum: '$amount' },
//       },
//     },
//   ]);

//   const income = summary.find((e) => e._id === 'credit')?.totalAmount || 0;
//   const expense = summary.find((e) => e._id === 'debit')?.totalAmount || 0;

//   res.status(200).json({
//     status: 'success',
//     data: {
//       income,
//       expense,
//       netBalance: income - expense,
//     },
//   });
// });

// /* -------------------------------------------------------------
//  * Export Ledgers (CSV with Debit/Credit & Running Balance)
// ------------------------------------------------------------- */
// exports.exportLedgers = catchAsync(async (req, res, next) => {
//   const { start, end, customerId, supplierId, format = 'csv' } = req.query;
//   const filter = { organizationId: req.user.organizationId };

//   // 1. Date Filter
//   if (start || end) {
//     filter.entryDate = {};
//     if (start) filter.entryDate.$gte = new Date(start);
//     if (end) filter.entryDate.$lte = new Date(end);
//   }
//   if (customerId) filter.customerId = customerId;
//   if (supplierId) filter.supplierId = supplierId;

//   // 2. Fetch & Sort (Crucial: Must be sorted by date for Running Balance to work)
//   const docs = await Ledger.find(filter)
//     .sort({ entryDate: 1 })
//     .populate('customerId', 'name')
//     .populate('supplierId', 'companyName name')
//     .lean();

//   if (format === 'csv') {
//     // 3. Define Headers (Side-by-Side Format)
//     const headers = ['Date', 'Description', 'Ref', 'Party', 'Debit', 'Credit', 'Balance'];

//     let runningBalance = 0;

//     const rows = docs.map(d => {
//       const party = d.customerId?.name || d.supplierId?.companyName || d.supplierId?.name || '-';
//       const date = d.entryDate ? new Date(d.entryDate).toLocaleDateString() : '-';
//       const notes = (d.description || '').replace(/,/g, ' '); // Remove commas to prevent CSV break
//       const ref = d.referenceNumber || '-';

//       // 4. Split Amount into Debit/Credit Columns
//       let debit = 0;
//       let credit = 0;

//       if (d.type === 'debit') {
//         debit = d.amount;
//       } else {
//         credit = d.amount;
//       }

//       // 5. Calculate Running Balance
//       // Logic Check:
//       // - For Supplier: Credit (Purchase) increases what we owe. Debit (Payment) decreases it.
//       // - For Customer: Debit (Sale) increases what they owe. Credit (Payment) decreases it.
//       if (supplierId) {
//         runningBalance += (credit - debit);
//       } else {
//         // Default/Customer behavior
//         runningBalance += (debit - credit);
//       }

//       // 6. Format Row
//       // We use empty strings '' for zero values to make the CSV look cleaner
//       return `${date},${notes},${ref},${party},${debit || ''},${credit || ''},${runningBalance.toFixed(2)}`;
//     });

//     // 7. Add Header Row
//     const csvContent = [headers.join(',')].concat(rows).join('\n');

//     res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
//     res.setHeader('Content-Type', 'text/csv');
//     return res.send(csvContent);
//   }

//   // Fallback JSON response
//   res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
// });
