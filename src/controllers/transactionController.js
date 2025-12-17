// src/controllers/transactionController.js
const mongoose = require('mongoose');
const AccountEntry = require('../models/accountEntryModel'); // ✅ Single Source of Truth
const { logAudit } = require('../utils/auditLogger');
const { format } = require('fast-csv');
const ApiFeatures = require('../utils/ApiFeatures');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ============================================================
   GET TRANSACTIONS (Unified View from AccountEntry)
============================================================ */
exports.getTransactions = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

  // 1. Build Filter
  const filter = { organizationId: user.organizationId };
  
  if (req.query.branchId) filter.branchId = req.query.branchId;
  
  // Date Filtering
  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  // Type Filtering (Invoice, Payment, Purchase)
  if (req.query.type) {
    // Map UI terms to database 'referenceType'
    const types = req.query.type.split(',').map(t => t.trim().toLowerCase());
    filter.referenceType = { $in: types };
  }

  // Party Filtering (Find entries tagged with Customer OR Supplier)
  if (req.query.partyId) {
    const pId = new mongoose.Types.ObjectId(req.query.partyId);
    filter.$or = [
        { customerId: pId },
        { supplierId: pId }
    ];
  }

  // 2. Execute Query using API Features (Pagination, Sorting)
  const features = new ApiFeatures(AccountEntry.find(filter), req.query)
    .sort({ date: -1 })
    .paginate();

  // Populate references for UI
  features.query = features.query.populate([
    { path: 'customerId', select: 'name' },
    { path: 'supplierId', select: 'companyName name' },
    { path: 'invoiceId', select: 'invoiceNumber' },
    { path: 'purchaseId', select: 'invoiceNumber' }
  ]);

  const results = await features.query;
  const total = await AccountEntry.countDocuments(filter);

  // 3. Format Response
  const formattedResults = results.map(doc => ({
    _id: doc._id,
    date: doc.date,
    type: doc.referenceType || 'manual', // invoice, payment, etc.
    referenceNumber: doc.referenceNumber || '-',
    partyName: doc.customerId?.name || doc.supplierId?.companyName || doc.supplierId?.name || '-',
    description: doc.description,
    debit: doc.debit,
    credit: doc.credit,
    amount: (doc.debit || 0) + (doc.credit || 0) // Total value involved
  }));

  logAudit({ user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total } });

  res.status(200).json({
    status: 'success',
    total: total,
    results: formattedResults
  });
});

/* ============================================================
   EXPORT TRANSACTIONS CSV (Streamed from AccountEntry)
============================================================ */
exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
  const user = req.user;
  const orgId = new mongoose.Types.ObjectId(user.organizationId);

  // 1. Build Match Stage
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
    const types = String(req.query.type).split(',').map(t => t.trim().toLowerCase());
    match.referenceType = { $in: types };
  }

  if (req.query.partyId) {
    const pId = new mongoose.Types.ObjectId(req.query.partyId);
    match.$or = [{ customerId: pId }, { supplierId: pId }];
  }

  // 2. Define Aggregation Pipeline
  const pipeline = [
    { $match: match },
    { $sort: { date: (req.query.sort === 'asc' ? 1 : -1) } },
    // Lookup Customer
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    // Lookup Supplier
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplierId',
        foreignField: '_id',
        as: 'supplier'
      }
    },
    // Project final shape
    {
      $project: {
        Date: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$date", timezone: "Asia/Kolkata" } }, // Adjust Timezone
        Type: { $toUpper: "$referenceType" },
        'Reference No': { $ifNull: ["$referenceNumber", "-"] },
        'Party Name': { 
            $ifNull: [
                { $arrayElemAt: ["$customer.name", 0] },
                { $arrayElemAt: ["$supplier.companyName", 0] },
                "-"
            ] 
        },
        Description: "$description",
        Debit: "$debit",
        Credit: "$credit"
      }
    }
  ];

  // 3. Configure Stream
  const cursor = AccountEntry.aggregate(pipeline).cursor({ batchSize: 1000 });

  const fileName = `Export_Transactions_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const csvStream = format({ headers: true });
  csvStream.pipe(res);

  let rowCount = 0;
  for await (const doc of cursor) {
    csvStream.write(doc);
    rowCount++;
  }
  
  csvStream.end();

  logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
});

// // src/controllers/transactionController.js
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Payment = require('../models/paymentModel');
// const Purchase = require('../models/purchaseModel');
// const { fetchTransactionsAggregated } = require('../services/transactionService');
// const { logAudit } = require('../utils/auditLogger');
// const { format } = require('fast-csv');

// const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// exports.getTransactions = asyncHandler(async (req, res) => {
//   const user = req.user;
//   if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });
//   const data = await fetchTransactionsAggregated(user, req.query);

//   logAudit({ user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total: data.total } });

//   res.status(200).json({
//     status: 'success',
//     total: data.total,
//     page: data.page,
//     limit: data.limit,
//     results: data.results
//   });
// });

// // --- IMPROVED FAST-CSV STREAMING VERSION ---

// exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
//   const user = req.user;
//   if (!user || !user.organizationId)
//     return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

//   // FIX: Added 'new' keyword here
//   const orgId = new mongoose.Types.ObjectId(user.organizationId); 
  
//   const branchId = req.query.branchId || user.branchId || null;
//   const partyId = req.query.partyId || null;
//   const startDate = req.query.startDate || null;
//   const endDate = req.query.endDate || null;
//   const wantedTypes = req.query.type ? String(req.query.type).split(',') : null;
//   const sortDir = (req.query.sort || '').toLowerCase() === 'asc' ? 1 : -1;

//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const dateMatch = (field) => {
//     if (!startDate && !endDate) return {};
//     const obj = {};
//     if (startDate) obj.$gte = new Date(startDate);
//     if (endDate) obj.$lte = new Date(endDate);
//     return { [field]: obj };
//   };

//   // 1. Define Pipelines
  
//   const invoicePipe = [
//     { $match: { ...baseMatch, ...(partyId ? { customerId: new mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('invoiceDate') } },
//     { $project: {
//         type: { $literal: 'Invoice' },
//         date: { $ifNull: ['$invoiceDate', '$createdAt'] },
//         amount: '$grandTotal',
//         effect: { $literal: 'Debit' },
//         refId: '$_id',
//         refNumber: '$invoiceNumber',
//         partyId: '$customerId',
//         partyCollection: { $literal: 'customers' }, // Tag for lookup later
//         description: { $ifNull: ['$notes', '$description', 'Invoice generated'] }
//     } }
//   ];

//   const paymentPipe = [
//     { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: new mongoose.Types.ObjectId(partyId) }, { supplierId: new mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('paymentDate') } },
//     { $project: {
//         type: { $literal: 'Payment' },
//         date: { $ifNull: ['$paymentDate', '$createdAt'] },
//         amount: '$amount',
//         effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'Credit', 'Debit'] },
//         refId: '$_id',
//         refNumber: '$referenceNumber',
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         partyCollection: { $cond: [{ $ifNull: ['$customerId', false] }, 'customers', 'suppliers'] }, // Determine collection
//         description: { $ifNull: ['$remarks', '$paymentMethod', 'Payment processed'] }
//     } }
//   ];

//   const purchasePipe = [
//     { $match: { ...baseMatch, ...(partyId ? { supplierId: new mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('purchaseDate') } },
//     { $project: {
//         type: { $literal: 'Purchase' },
//         date: { $ifNull: ['$purchaseDate', '$createdAt'] },
//         amount: '$grandTotal',
//         effect: { $literal: 'Debit' },
//         refId: '$_id',
//         refNumber: '$invoiceNumber',
//         partyId: '$supplierId',
//         partyCollection: { $literal: 'suppliers' },
//         description: { $ifNull: ['$notes', '$description', 'Purchase recorded'] }
//     } }
//   ];

//   const ledgerPipe = [
//     { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: new mongoose.Types.ObjectId(partyId) }, { supplierId: new mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('entryDate') } },
//     { $project: {
//         type: { $literal: 'Journal' }, // Renamed from Ledger for clarity
//         date: { $ifNull: ['$entryDate', '$createdAt'] },
//         amount: '$amount',
//         effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'Credit', 'Debit'] },
//         refId: '$_id',
//         refNumber: '$referenceNumber',
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         partyCollection: { $cond: [{ $ifNull: ['$customerId', false] }, 'customers', 'suppliers'] },
//         description: '$description'
//     } }
//   ];

//   // 2. Build Main Pipeline
//   const pipeline = [
//     ...invoicePipe,
//     { $unionWith: { coll: Payment.collection.name, pipeline: paymentPipe } },
//     { $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipe } },
//     { $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipe } }
//   ];

//   // Filter by Type if requested
//   if (wantedTypes && wantedTypes.length) {
//     // Case insensitive matching for types (e.g., 'Invoice', 'invoice')
//     const typesRegex = wantedTypes.map(t => new RegExp(`^${t}$`, 'i'));
//     pipeline.push({ $match: { type: { $in: typesRegex } } });
//   }

//   // 3. ENHANCEMENT: Lookup Party Names
//   // This looks up both collections. It might be slightly heavy on large datasets, 
//   // but ensures the CSV has names, not IDs.
//   pipeline.push(
//     {
//       $lookup: {
//         from: 'customers', // Ensure this matches your actual MongoDB collection name (usually lowercase plural)
//         localField: 'partyId',
//         foreignField: '_id',
//         as: 'customerDetails'
//       }
//     },
//     {
//       $lookup: {
//         from: 'suppliers', // Ensure matches actual collection name
//         localField: 'partyId',
//         foreignField: '_id',
//         as: 'supplierDetails'
//       }
//     },
//     {
//       $addFields: {
//         partyName: { 
//           $ifNull: [ 
//             { $arrayElemAt: ["$customerDetails.name", 0] }, 
//             { $arrayElemAt: ["$supplierDetails.name", 0] }, 
//             "Unknown Party" 
//           ] 
//         }
//       }
//     },
//     { $project: { customerDetails: 0, supplierDetails: 0 } } // Cleanup
//   );

//   pipeline.push({ $sort: { date: sortDir } });

//   // 4. Stream Response
//   const cursor = Invoice.collection.aggregate(pipeline, { allowDiskUse: true, cursor: { batchSize: 1000 } });

//   const fileName = `Export_Transactions_${new Date().toISOString().slice(0,10)}.csv`;
//   res.setHeader('Content-Type', 'text/csv');
//   res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

//   // Configure CSV Stream with professional headers
//   const csvStream = format({ 
//     headers: [
//       'Date', 'Type', 'Reference No', 'Party Name', 'Description', 'Effect', 'Amount'
//     ] 
//   });
  
//   csvStream.pipe(res);

//   let rowCount = 0;
//   while (await cursor.hasNext()) {
//     const d = await cursor.next();
    
//     // Write Transformed Data
//     csvStream.write({
//       'Date': d.date ? new Date(d.date).toLocaleString('en-IN', { hour12: true }) : '', // Better date format
//       'Type': d.type,
//       'Reference No': d.refNumber || '-',
//       'Party Name': d.partyName || '-',
//       'Description': d.description || '-',
//       'Effect': d.effect,
//       'Amount': d.amount ? parseFloat(d.amount).toFixed(2) : '0.00'
//     });
    
//     rowCount++;
//   }
//   csvStream.end();

//   // Audit success
//   logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
// });