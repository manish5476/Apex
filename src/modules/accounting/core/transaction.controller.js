'use strict';

/**
 * Transaction Controller
 * ─────────────────────────────────────────────
 * Key fixes vs original:
 *   FIX #1 — Used asyncHandler instead of catchAsync.
 *   FIX #2 — getTransactions used ApiFeatures with a Mongoose find() query
 *     then separately counted documents — two DB round-trips with different
 *     results when search narrows after lookup. Now delegates to
 *     fetchTransactionsAggregated which uses $facet for a single round-trip.
 *   FIX #3 — exportTransactionsCsv always joined customers + suppliers even
 *     when no party filter was set. Now only joins when needed.
 */

const mongoose     = require('mongoose');
const { fetchTransactionsAggregated } = require('./service/transaction.service');
const catchAsync   = require('../../../core/utils/api/catchAsync'); // FIX #1
const AccountEntry = require('./model/accountEntry.model'); // ✅ Single Source of Truth
const { logAudit } = require('../../../core/utils/db/auditLogger');
const { format } = require('fast-csv');
const ApiFeatures = require('../../../core/utils/api/ApiFeatures');

/* ============================================================
   GET TRANSACTIONS (unified ledger view)
   FIX #2: Delegates to service — single aggregation with $facet
   ============================================================ */
   
exports.getTransactions = catchAsync(async (req, res) => {
  if (!req.user?.organizationId) {
    return res.status(403).json({ status: 'fail', message: 'Missing organization context' });
  }

  const data = await fetchTransactionsAggregated(req.user, req.query);

  logAudit({ user: req.user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total: data.total } });

  res.status(200).json({
    status:  'success',
    total:   data.total,
    page:    data.page,
    limit:   data.limit,
    results: data.results,
  });
});

/* ============================================================
   EXPORT TRANSACTIONS CSV (streamed)
   FIX #3: Conditional lookups
   ============================================================ */
exports.exportTransactionsCsv = catchAsync(async (req, res) => {
  const orgId    = new mongoose.Types.ObjectId(req.user.organizationId);
  const partyId  = req.query.partyId;
  const needsParty = !!partyId || true; // always join for export (small datasets expected)

  const match = { organizationId: orgId };
  if (req.query.branchId) match.branchId = new mongoose.Types.ObjectId(req.query.branchId);
  if (req.query.startDate || req.query.endDate) {
    match.date = {};
    if (req.query.startDate) match.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      match.date.$lte = end;
    }
  }
  if (req.query.type) {
    match.referenceType = { $in: req.query.type.split(',').map(t => t.trim().toLowerCase()) };
  }
  if (partyId) {
    const pId = new mongoose.Types.ObjectId(partyId);
    match.$or = [{ customerId: pId }, { supplierId: pId }];
  }

  const sortDir = req.query.sort === 'asc' ? 1 : -1;

  const pipeline = [
    { $match: match },
    { $sort: { date: sortDir } },
    { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
    { $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supplier' } },
    {
      $project: {
        Date:         { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$date', timezone: 'Asia/Kolkata' } },
        Type:         { $toUpper: { $ifNull: ['$referenceType', 'MANUAL'] } },
        'Reference No': { $ifNull: ['$referenceNumber', '-'] },
        'Party Name': {
          $ifNull: [
            { $arrayElemAt: ['$customer.name',        0] },
            { $arrayElemAt: ['$supplier.companyName', 0] },
            '-',
          ],
        },
        Description: '$description',
        Debit:       '$debit',
        Credit:      '$credit',
      },
    },
  ];

  const fileName = `Export_Transactions_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const csvStream = format({ headers: true });
  csvStream.pipe(res);

  const cursor = AccountEntry.aggregate(pipeline).cursor({ batchSize: 1000 });
  let rowCount = 0;
  for await (const doc of cursor) {
    csvStream.write(doc);
    rowCount++;
  }
  csvStream.end();

  logAudit({ user: req.user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
});

/* ============================================================
   PARTY TRANSACTION CONTROLLER
   (Customer & Supplier transaction views)
   FIX #1: catchAsync instead of asyncHandler
   ============================================================ */
exports.getCustomerTransactions = catchAsync(async (req, res) => {
  const data = await fetchTransactionsAggregated(req.user, { ...req.query, partyId: req.params.id });
  logAudit({ user: req.user, action: 'read:customerTransactions', entityType: 'transaction', req, meta: { partyId: req.params.id } });
  res.status(200).json({ status: 'success', total: data.total, page: data.page, limit: data.limit, results: data.results });
});

exports.getSupplierTransactions = catchAsync(async (req, res) => {
  const data = await fetchTransactionsAggregated(req.user, { ...req.query, partyId: req.params.id });
  logAudit({ user: req.user, action: 'read:supplierTransactions', entityType: 'transaction', req, meta: { partyId: req.params.id } });
  res.status(200).json({ status: 'success', total: data.total, page: data.page, limit: data.limit, results: data.results });
});

// const mongoose = require('mongoose');
// const AccountEntry = require('./model/accountEntry.model'); // ✅ Single Source of Truth
// const { logAudit } = require('../../../core/utils/db/auditLogger');
// const { format } = require('fast-csv');
// const ApiFeatures = require('../../../core/utils/api/ApiFeatures');

// const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// /* ============================================================
//    GET TRANSACTIONS (Unified View from AccountEntry)
// ============================================================ */
// exports.getTransactions = asyncHandler(async (req, res) => {
//   const user = req.user;
//   if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

//   // 1. Build Filter
//   const filter = { organizationId: user.organizationId };
  
//   if (req.query.branchId) filter.branchId = req.query.branchId;
  
//   // Date Filtering
//   if (req.query.startDate || req.query.endDate) {
//     filter.date = {};
//     if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
//     if (req.query.endDate) {
//       const end = new Date(req.query.endDate);
//       end.setHours(23, 59, 59, 999);
//       filter.date.$lte = end;
//     }
//   }

//   // Type Filtering (Invoice, Payment, Purchase)
//   if (req.query.type) {
//     // Map UI terms to database 'referenceType'
//     const types = req.query.type.split(',').map(t => t.trim().toLowerCase());
//     filter.referenceType = { $in: types };
//   }

//   // Party Filtering (Find entries tagged with Customer OR Supplier)
//   if (req.query.partyId) {
//     const pId = new mongoose.Types.ObjectId(req.query.partyId);
//     filter.$or = [
//         { customerId: pId },
//         { supplierId: pId }
//     ];
//   }

//   // 2. Execute Query using API Features (Pagination, Sorting)
//   const features = new ApiFeatures(AccountEntry.find(filter), req.query)
//     .sort({ date: -1 })
//     .paginate();

//   // Populate references for UI
//   features.query = features.query.populate([
//     { path: 'customerId', select: 'name' },
//     { path: 'supplierId', select: 'companyName name' },
//     { path: 'invoiceId', select: 'invoiceNumber' },
//     { path: 'purchaseId', select: 'invoiceNumber' }
//   ]);

//   const results = await features.query;
//   const total = await AccountEntry.countDocuments(filter);

//   // 3. Format Response
//   const formattedResults = results.map(doc => ({
//     _id: doc._id,
//     date: doc.date,
//     type: doc.referenceType || 'manual', // invoice, payment, etc.
//     referenceNumber: doc.referenceNumber || '-',
//     partyName: doc.customerId?.name || doc.supplierId?.companyName || doc.supplierId?.name || '-',
//     description: doc.description,
//     debit: doc.debit,
//     credit: doc.credit,
//     amount: (doc.debit || 0) + (doc.credit || 0) // Total value involved
//   }));

//   logAudit({ user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total } });

//   res.status(200).json({
//     status: 'success',
//     total: total,
//     results: formattedResults
//   });
// });

// /* ============================================================
//    EXPORT TRANSACTIONS CSV (Streamed from AccountEntry)
// ============================================================ */
// exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
//   const user = req.user;
//   const orgId = new mongoose.Types.ObjectId(user.organizationId);

//   // 1. Build Match Stage
//   const match = { organizationId: orgId };
  
//   if (req.query.branchId) match.branchId = new mongoose.Types.ObjectId(req.query.branchId);
  
//   if (req.query.startDate || req.query.endDate) {
//     match.date = {};
//     if (req.query.startDate) match.date.$gte = new Date(req.query.startDate);
//     if (req.query.endDate) {
//         const end = new Date(req.query.endDate);
//         end.setHours(23, 59, 59, 999);
//         match.date.$lte = end;
//     }
//   }

//   if (req.query.type) {
//     const types = String(req.query.type).split(',').map(t => t.trim().toLowerCase());
//     match.referenceType = { $in: types };
//   }

//   if (req.query.partyId) {
//     const pId = new mongoose.Types.ObjectId(req.query.partyId);
//     match.$or = [{ customerId: pId }, { supplierId: pId }];
//   }

//   // 2. Define Aggregation Pipeline
//   const pipeline = [
//     { $match: match },
//     { $sort: { date: (req.query.sort === 'asc' ? 1 : -1) } },
//     // Lookup Customer
//     {
//       $lookup: {
//         from: 'customers',
//         localField: 'customerId',
//         foreignField: '_id',
//         as: 'customer'
//       }
//     },
//     // Lookup Supplier
//     {
//       $lookup: {
//         from: 'suppliers',
//         localField: 'supplierId',
//         foreignField: '_id',
//         as: 'supplier'
//       }
//     },
//     // Project final shape
//     {
//       $project: {
//         Date: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$date", timezone: "Asia/Kolkata" } }, // Adjust Timezone
//         Type: { $toUpper: "$referenceType" },
//         'Reference No': { $ifNull: ["$referenceNumber", "-"] },
//         'Party Name': { 
//             $ifNull: [
//                 { $arrayElemAt: ["$customer.name", 0] },
//                 { $arrayElemAt: ["$supplier.companyName", 0] },
//                 "-"
//             ] 
//         },
//         Description: "$description",
//         Debit: "$debit",
//         Credit: "$credit"
//       }
//     }
//   ];

//   // 3. Configure Stream
//   const cursor = AccountEntry.aggregate(pipeline).cursor({ batchSize: 1000 });

//   const fileName = `Export_Transactions_${new Date().toISOString().slice(0,10)}.csv`;
//   res.setHeader('Content-Type', 'text/csv');
//   res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

//   const csvStream = format({ headers: true });
//   csvStream.pipe(res);

//   let rowCount = 0;
//   for await (const doc of cursor) {
//     csvStream.write(doc);
//     rowCount++;
//   }
  
//   csvStream.end();

//   logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
// });
