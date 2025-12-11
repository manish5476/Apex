const Ledger = require('../models/ledgerModel');
const Customer = require('../models/customerModel');
const Supplier = require('../models/supplierModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const ApiFeatures = require('../utils/ApiFeatures'); // ✅ Make sure to import this
const mongoose = require('mongoose');

/* -------------------------------------------------------------
 * GET ALL LEDGERS (With Date & Type Filtering)
 * supports: ?startDate=...&endDate=...&type=credit&limit=50
------------------------------------------------------------- */
exports.getAllLedgers = catchAsync(async (req, res, next) => {
  // 1. Build Custom Filter
  const filter = { organizationId: req.user.organizationId };

  // --- Date Range Filter (startDate/endDate -> entryDate) ---
  if (req.query.startDate || req.query.endDate) {
    filter.entryDate = {};
    if (req.query.startDate) filter.entryDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      // Set end date to end of day
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.entryDate.$lte = end;
    }
  }

  // --- Specific Filters ---
  if (req.query.type) filter.type = req.query.type; // 'credit' or 'debit'
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.supplierId) filter.supplierId = req.query.supplierId;
  if (req.query.accountId) filter.accountType = req.query.accountId; // If you filter by 'expense', 'income' etc.

  // 2. Initialize API Features
  // We pass our constructed 'filter' to the find() method
  const features = new ApiFeatures(Ledger.find(filter), req.query)
    .sort() // Defaults to -createdAt if not specified
    .limitFields()
    .paginate();

  // 3. Populate References (Important for UI Grid to show names)
  features.query = features.query.populate([
    { path: 'customerId', select: 'name phone' },
    { path: 'supplierId', select: 'name companyName phone' },
    { path: 'invoiceId', select: 'invoiceNumber' },
    { path: 'purchaseId', select: 'invoiceNumber' }
  ]);

  // 4. Execute Query
  const docs = await features.query;

  res.status(200).json({
    status: 'success',
    results: docs.length,
    data: { data: docs }
  });
});

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
 * Get Ledger Entries by Customer (With Running Balance)
------------------------------------------------------------- */
exports.getCustomerLedger = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const { startDate, endDate } = req.query;

  // Base Match
  const match = {
    organizationId: req.user.organizationId,
    customerId: new mongoose.Types.ObjectId(customerId)
  };

  // Date Filtering
  if (startDate || endDate) {
    match.entryDate = {};
    if (startDate) match.entryDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.entryDate.$lte = end;
    }
  }

  // Fetch Logic
  const ledgers = await Ledger.find(match)
    .sort({ entryDate: 1, createdAt: 1 }) // Chronological order for running balance
    .select('entryDate description type amount referenceNumber')
    .lean();

  if (!ledgers.length) {
    return res.status(200).json({
      status: 'success',
      results: 0,
      data: { customerId, history: [], closingBalance: 0 }
    });
  }

  // Calculate Running Balance
  // Note: For pagination to work with running balance, you ideally need the 
  // "Opening Balance" from before the page starts. This simplified version 
  // calculates balance based on fetched records.

  let balance = 0;
  // Optional: If date filter exists, you might want to fetch "Opening Balance" 
  // from transactions BEFORE startDate. For now, we start at 0.

  const history = ledgers.map((entry) => {
    // Logic: Debit increases what customer owes (Receivable), Credit decreases it.
    balance += entry.type === 'debit' ? entry.amount : -entry.amount;
    return {
      _id: entry._id,
      date: entry.entryDate,
      description: entry.description,
      ref: entry.referenceNumber,
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
 * Get Ledger Entries by Supplier (With Running Balance)
------------------------------------------------------------- */
exports.getSupplierLedger = catchAsync(async (req, res, next) => {
  const { supplierId } = req.params;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: req.user.organizationId,
    supplierId: new mongoose.Types.ObjectId(supplierId)
  };

  if (startDate || endDate) {
    match.entryDate = {};
    if (startDate) match.entryDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.entryDate.$lte = end;
    }
  }

  const ledgers = await Ledger.find(match)
    .sort({ entryDate: 1, createdAt: 1 })
    .select('entryDate description type amount referenceNumber')
    .lean();

  if (!ledgers.length) {
    return res.status(200).json({
      status: 'success',
      results: 0,
      data: { supplierId, history: [], closingBalance: 0 }
    });
  }

  let balance = 0;
  const history = ledgers.map((entry) => {
    // Logic: Credit increases what we owe supplier (Payable), Debit decreases it.
    balance += entry.type === 'credit' ? entry.amount : -entry.amount;
    return {
      _id: entry._id,
      date: entry.entryDate,
      description: entry.description,
      ref: entry.referenceNumber,
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
 * Organization Summary
------------------------------------------------------------- */
exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { startDate, endDate } = req.query;

  const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };

  if (startDate || endDate) {
    match.entryDate = {};
    if (startDate) match.entryDate.$gte = new Date(startDate);
    if (endDate) match.entryDate.$lte = new Date(endDate);
  }

  const summary = await Ledger.aggregate([
    { $match: match },
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

/* -------------------------------------------------------------
 * Export Ledgers (CSV)
------------------------------------------------------------- */
// exports.exportLedgers = catchAsync(async (req, res, next) => {
//   const { start, end, customerId, supplierId, format='csv' } = req.query;
//   const filter = { organizationId: req.user.organizationId };

//   if (start || end) {
//     filter.entryDate = {};
//     if (start) filter.entryDate.$gte = new Date(start);
//     if (end) filter.entryDate.$lte = new Date(end);
//   }
//   if (customerId) filter.customerId = customerId;
//   if (supplierId) filter.supplierId = supplierId;

//   const docs = await Ledger.find(filter)
//     .populate('customerId', 'name')
//     .populate('supplierId', 'companyName name')
//     .lean();

//   if (format === 'csv') {
//     const headers = ['Date', 'Type', 'Amount', 'Party', 'Description', 'Ref'];
//     const rows = [headers.join(',')].concat(docs.map(d => {
//       const party = d.customerId?.name || d.supplierId?.companyName || d.supplierId?.name || '-';
//       const date = d.entryDate ? new Date(d.entryDate).toLocaleDateString() : '';
//       const notes = (d.description || '').replace(/,/g, ' '); // simple escape comma
//       return `${date},${d.type},${d.amount},${party},${notes},${d.referenceNumber||''}`;
//     }));

//     res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
//     res.setHeader('Content-Type', 'text/csv');
//     return res.send(rows.join('\n'));
//   }

//   res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
// });
/* -------------------------------------------------------------
 * Export Ledgers (CSV with Debit/Credit & Running Balance)
------------------------------------------------------------- */
exports.exportLedgers = catchAsync(async (req, res, next) => {
  const { start, end, customerId, supplierId, format = 'csv' } = req.query;
  const filter = { organizationId: req.user.organizationId };

  // 1. Date Filter
  if (start || end) {
    filter.entryDate = {};
    if (start) filter.entryDate.$gte = new Date(start);
    if (end) filter.entryDate.$lte = new Date(end);
  }
  if (customerId) filter.customerId = customerId;
  if (supplierId) filter.supplierId = supplierId;

  // 2. Fetch & Sort (Crucial: Must be sorted by date for Running Balance to work)
  const docs = await Ledger.find(filter)
    .sort({ entryDate: 1 })
    .populate('customerId', 'name')
    .populate('supplierId', 'companyName name')
    .lean();

  if (format === 'csv') {
    // 3. Define Headers (Side-by-Side Format)
    const headers = ['Date', 'Description', 'Ref', 'Party', 'Debit', 'Credit', 'Balance'];

    let runningBalance = 0;

    const rows = docs.map(d => {
      const party = d.customerId?.name || d.supplierId?.companyName || d.supplierId?.name || '-';
      const date = d.entryDate ? new Date(d.entryDate).toLocaleDateString() : '-';
      const notes = (d.description || '').replace(/,/g, ' '); // Remove commas to prevent CSV break
      const ref = d.referenceNumber || '-';

      // 4. Split Amount into Debit/Credit Columns
      let debit = 0;
      let credit = 0;

      if (d.type === 'debit') {
        debit = d.amount;
      } else {
        credit = d.amount;
      }

      // 5. Calculate Running Balance
      // Logic Check:
      // - For Supplier: Credit (Purchase) increases what we owe. Debit (Payment) decreases it.
      // - For Customer: Debit (Sale) increases what they owe. Credit (Payment) decreases it.
      if (supplierId) {
        runningBalance += (credit - debit);
      } else {
        // Default/Customer behavior
        runningBalance += (debit - credit);
      }

      // 6. Format Row
      // We use empty strings '' for zero values to make the CSV look cleaner
      return `${date},${notes},${ref},${party},${debit || ''},${credit || ''},${runningBalance.toFixed(2)}`;
    });

    // 7. Add Header Row
    const csvContent = [headers.join(',')].concat(rows).join('\n');

    res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csvContent);
  }

  // Fallback JSON response
  res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
});

// 1
// const Ledger = require('../models/ledgerModel');
// const Customer = require('../models/customerModel');
// const Supplier = require('../models/supplierModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const mongoose = require('mongoose');

// /* -------------------------------------------------------------
//  * Get All Ledger Entries (Scoped to Organization)
// ------------------------------------------------------------- */
// exports.getAllLedgers = factory.getAll(Ledger);

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
//  * Get Ledger Entries by Customer
// ------------------------------------------------------------- */
// exports.getCustomerLedger = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;

//   const ledgers = await Ledger.find({
//     organizationId: req.user.organizationId,
//     customerId,
//   })
//     .sort({ createdAt: 1 })
//     .select('createdAt description type amount');

//   if (!ledgers.length) {
//     return next(new AppError('No ledger records found for this customer', 404));
//   }

//   // Calculate running balance (debits increase, credits decrease)
//   let balance = 0;
//   const history = ledgers.map((entry) => {
//     balance += entry.type === 'debit' ? entry.amount : -entry.amount;
//     return {
//       date: entry.createdAt,
//       description: entry.description,
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
//  * Get Ledger Entries by Supplier
// ------------------------------------------------------------- */
// exports.getSupplierLedger = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;

//   const ledgers = await Ledger.find({
//     organizationId: req.user.organizationId,
//     supplierId,
//   })
//     .sort({ createdAt: 1 })
//     .select('createdAt description type amount');

//   if (!ledgers.length) {
//     return next(new AppError('No ledger records found for this supplier', 404));
//   }

//   // Calculate running balance (credits increase, debits decrease)
//   let balance = 0;
//   const history = ledgers.map((entry) => {
//     balance += entry.type === 'credit' ? entry.amount : -entry.amount;
//     return {
//       date: entry.createdAt,
//       description: entry.description,
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
//  * Organization Summary: Total Income vs Expenses
// ------------------------------------------------------------- */
// exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
//   const { organizationId } = req.user;

//   const summary = await Ledger.aggregate([
//     { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
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


// // GET /v1/ledgers/export?start=&end&customerId=&supplierId=
// exports.exportLedgers = catchAsync(async (req, res, next) => {
//   const { start, end, customerId, supplierId, format='csv' } = req.query;
//   const filter = { organizationId: req.user.organizationId };
//   if (start || end) filter.date = {};
//   if (start) filter.date.$gte = new Date(start);
//   if (end) filter.date.$lte = new Date(end);
//   if (customerId) filter.customerId = customerId;
//   if (supplierId) filter.supplierId = supplierId;

//   const docs = await Ledger.find(filter).lean();
//   if (format === 'csv') {
//     const headers = ['date','type','amount','party','notes'];
//     const rows = [headers.join(',')].concat(docs.map(d => {
//       return `${d.date?.toISOString()||''},${d.type||''},${d.amount||0},${d.party||''},${JSON.stringify(d.notes||'')}`;
//     }));
//     res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
//     res.setHeader('Content-Type', 'text/csv');
//     return res.send(rows.join('\n'));
//   }
//   res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
// });
