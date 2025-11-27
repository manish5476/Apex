// src/controllers/transactionController.js
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const Ledger = require('../models/ledgerModel');
const { fetchTransactionsAggregated } = require('../services/transactionService');
const { logAudit } = require('../utils/auditLogger');
const { format } = require('fast-csv');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.getTransactions = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });
  const data = await fetchTransactionsAggregated(user, req.query);

  logAudit({ user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total: data.total } });

  res.status(200).json({
    status: 'success',
    total: data.total,
    page: data.page,
    limit: data.limit,
    results: data.results
  });
});

// --- IMPROVED FAST-CSV STREAMING VERSION ---

exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user || !user.organizationId)
    return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

  // FIX: Added 'new' keyword here
  const orgId = new mongoose.Types.ObjectId(user.organizationId); 
  
  const branchId = req.query.branchId || user.branchId || null;
  const partyId = req.query.partyId || null;
  const startDate = req.query.startDate || null;
  const endDate = req.query.endDate || null;
  const wantedTypes = req.query.type ? String(req.query.type).split(',') : null;
  const sortDir = (req.query.sort || '').toLowerCase() === 'asc' ? 1 : -1;

  const baseMatch = { organizationId: orgId };
  if (branchId) baseMatch.branchId = branchId;

  const dateMatch = (field) => {
    if (!startDate && !endDate) return {};
    const obj = {};
    if (startDate) obj.$gte = new Date(startDate);
    if (endDate) obj.$lte = new Date(endDate);
    return { [field]: obj };
  };

  // 1. Define Pipelines
  
  const invoicePipe = [
    { $match: { ...baseMatch, ...(partyId ? { customerId: new mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('invoiceDate') } },
    { $project: {
        type: { $literal: 'Invoice' },
        date: { $ifNull: ['$invoiceDate', '$createdAt'] },
        amount: '$grandTotal',
        effect: { $literal: 'Debit' },
        refId: '$_id',
        refNumber: '$invoiceNumber',
        partyId: '$customerId',
        partyCollection: { $literal: 'customers' }, // Tag for lookup later
        description: { $ifNull: ['$notes', '$description', 'Invoice generated'] }
    } }
  ];

  const paymentPipe = [
    { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: new mongoose.Types.ObjectId(partyId) }, { supplierId: new mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('paymentDate') } },
    { $project: {
        type: { $literal: 'Payment' },
        date: { $ifNull: ['$paymentDate', '$createdAt'] },
        amount: '$amount',
        effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'Credit', 'Debit'] },
        refId: '$_id',
        refNumber: '$referenceNumber',
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        partyCollection: { $cond: [{ $ifNull: ['$customerId', false] }, 'customers', 'suppliers'] }, // Determine collection
        description: { $ifNull: ['$remarks', '$paymentMethod', 'Payment processed'] }
    } }
  ];

  const purchasePipe = [
    { $match: { ...baseMatch, ...(partyId ? { supplierId: new mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('purchaseDate') } },
    { $project: {
        type: { $literal: 'Purchase' },
        date: { $ifNull: ['$purchaseDate', '$createdAt'] },
        amount: '$grandTotal',
        effect: { $literal: 'Debit' },
        refId: '$_id',
        refNumber: '$invoiceNumber',
        partyId: '$supplierId',
        partyCollection: { $literal: 'suppliers' },
        description: { $ifNull: ['$notes', '$description', 'Purchase recorded'] }
    } }
  ];

  const ledgerPipe = [
    { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: new mongoose.Types.ObjectId(partyId) }, { supplierId: new mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('entryDate') } },
    { $project: {
        type: { $literal: 'Journal' }, // Renamed from Ledger for clarity
        date: { $ifNull: ['$entryDate', '$createdAt'] },
        amount: '$amount',
        effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'Credit', 'Debit'] },
        refId: '$_id',
        refNumber: '$referenceNumber',
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        partyCollection: { $cond: [{ $ifNull: ['$customerId', false] }, 'customers', 'suppliers'] },
        description: '$description'
    } }
  ];

  // 2. Build Main Pipeline
  const pipeline = [
    ...invoicePipe,
    { $unionWith: { coll: Payment.collection.name, pipeline: paymentPipe } },
    { $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipe } },
    { $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipe } }
  ];

  // Filter by Type if requested
  if (wantedTypes && wantedTypes.length) {
    // Case insensitive matching for types (e.g., 'Invoice', 'invoice')
    const typesRegex = wantedTypes.map(t => new RegExp(`^${t}$`, 'i'));
    pipeline.push({ $match: { type: { $in: typesRegex } } });
  }

  // 3. ENHANCEMENT: Lookup Party Names
  // This looks up both collections. It might be slightly heavy on large datasets, 
  // but ensures the CSV has names, not IDs.
  pipeline.push(
    {
      $lookup: {
        from: 'customers', // Ensure this matches your actual MongoDB collection name (usually lowercase plural)
        localField: 'partyId',
        foreignField: '_id',
        as: 'customerDetails'
      }
    },
    {
      $lookup: {
        from: 'suppliers', // Ensure matches actual collection name
        localField: 'partyId',
        foreignField: '_id',
        as: 'supplierDetails'
      }
    },
    {
      $addFields: {
        partyName: { 
          $ifNull: [ 
            { $arrayElemAt: ["$customerDetails.name", 0] }, 
            { $arrayElemAt: ["$supplierDetails.name", 0] }, 
            "Unknown Party" 
          ] 
        }
      }
    },
    { $project: { customerDetails: 0, supplierDetails: 0 } } // Cleanup
  );

  pipeline.push({ $sort: { date: sortDir } });

  // 4. Stream Response
  const cursor = Invoice.collection.aggregate(pipeline, { allowDiskUse: true, cursor: { batchSize: 1000 } });

  const fileName = `Export_Transactions_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  // Configure CSV Stream with professional headers
  const csvStream = format({ 
    headers: [
      'Date', 'Type', 'Reference No', 'Party Name', 'Description', 'Effect', 'Amount'
    ] 
  });
  
  csvStream.pipe(res);

  let rowCount = 0;
  while (await cursor.hasNext()) {
    const d = await cursor.next();
    
    // Write Transformed Data
    csvStream.write({
      'Date': d.date ? new Date(d.date).toLocaleString('en-IN', { hour12: true }) : '', // Better date format
      'Type': d.type,
      'Reference No': d.refNumber || '-',
      'Party Name': d.partyName || '-',
      'Description': d.description || '-',
      'Effect': d.effect,
      'Amount': d.amount ? parseFloat(d.amount).toFixed(2) : '0.00'
    });
    
    rowCount++;
  }
  csvStream.end();

  // Audit success
  logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
});

// const Transaction = require('../models/transactionModel');

// exports.getTransactionById = catchAsync(async (req, res, next) => {
//   const tx = await Transaction.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!tx) return next(new AppError("Transaction not found", 404));
//   res.status(200).json({ status: "success", data: { transaction: tx } });
// });

// exports.updateTransaction = catchAsync(async (req, res, next) => {
//   const tx = await Transaction.findOneAndUpdate({ _id: req.params.id, organizationId: req.user.organizationId }, req.body, { new: true });
//   if (!tx) return next(new AppError("Transaction not found", 404));
//   res.status(200).json({ status: "success", data: { transaction: tx } });
// });

// exports.deleteTransaction = catchAsync(async (req, res, next) => {
//   const tx = await Transaction.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!tx) return next(new AppError("Transaction not found", 404));
//   res.status(200).json({ status: "success", message: "Transaction deleted" });
// });










// // src/controllers/transactionController.js
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Payment = require('../models/paymentModel');
// const Purchase = require('../models/purchaseModel');
// const Ledger = require('../models/ledgerModel');
// const { fetchTransactionsAggregated } = require('../services/transactionService');
// const { logAudit } = require('../utils/auditLogger'); // ensure this exists
// const { format } = require('fast-csv');

// const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// exports.getTransactions = asyncHandler(async (req, res) => {
//   const user = req.user;
//   if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

//   const data = await fetchTransactionsAggregated(user, req.query);

//   // audit (non-blocking)
//   logAudit({ user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total: data.total } });

//   res.status(200).json({
//     status: 'success',
//     total: data.total,
//     page: data.page,
//     limit: data.limit,
//     results: data.results
//   });
// });

// // --- fast-csv streaming version ---

// exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
//   const user = req.user;
//   if (!user || !user.organizationId)
//     return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

//   const orgId = mongoose.Types.ObjectId(user.organizationId);
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

//   // pipelines per collection
//   const invoicePipe = [
//     { $match: { ...baseMatch, ...(partyId ? { customerId: mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('invoiceDate') } },
//     { $project: {
//         type: { $literal: 'invoice' },
//         date: { $ifNull: ['$invoiceDate', '$createdAt'] },
//         amount: '$grandTotal',
//         effect: { $literal: 'debit' },
//         refId: '$_id',
//         refNumber: '$invoiceNumber',
//         partyId: '$customerId',
//         description: { $ifNull: ['$notes', '$description', null] }
//     } }
//   ];

//   const paymentPipe = [
//     { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('paymentDate') } },
//     { $project: {
//         type: { $literal: 'payment' },
//         date: { $ifNull: ['$paymentDate', '$createdAt'] },
//         amount: '$amount',
//         effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'credit', 'debit'] },
//         refId: '$_id',
//         refNumber: '$referenceNumber',
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         description: { $ifNull: ['$remarks', '$paymentMethod', null] }
//     } }
//   ];

//   const purchasePipe = [
//     { $match: { ...baseMatch, ...(partyId ? { supplierId: mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('purchaseDate') } },
//     { $project: {
//         type: { $literal: 'purchase' },
//         date: { $ifNull: ['$purchaseDate', '$createdAt'] },
//         amount: '$grandTotal',
//         effect: { $literal: 'debit' },
//         refId: '$_id',
//         refNumber: '$invoiceNumber',
//         partyId: '$supplierId',
//         description: { $ifNull: ['$notes', '$description', null] }
//     } }
//   ];

//   const ledgerPipe = [
//     { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('entryDate') } },
//     { $project: {
//         type: { $literal: 'ledger' },
//         date: { $ifNull: ['$entryDate', '$createdAt'] },
//         amount: '$amount',
//         effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'credit', 'debit'] },
//         refId: '$_id',
//         refNumber: '$referenceNumber',
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         description: '$description'
//     } }
//   ];

//   const pipeline = [
//     ...invoicePipe,
//     { $unionWith: { coll: Payment.collection.name, pipeline: paymentPipe } },
//     { $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipe } },
//     { $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipe } }
//   ];

//   if (wantedTypes && wantedTypes.length) pipeline.push({ $match: { type: { $in: wantedTypes } } });
//   pipeline.push({ $sort: { date: sortDir } });

//   const cursor = Invoice.collection.aggregate(pipeline, { allowDiskUse: true, cursor: { batchSize: 1000 } });

//   const fileName = `transactions_${new Date().toISOString().replace(/[:T]/g, '_').slice(0,19)}.csv`;
//   res.setHeader('Content-Type', 'text/csv');
//   res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

//   const csvStream = format({ headers: true });
//   csvStream.pipe(res);

//   let rowCount = 0;
//   while (await cursor.hasNext()) {
//     const d = await cursor.next();
//     csvStream.write({
//       type: d.type,
//       date: d.date ? new Date(d.date).toISOString() : '',
//       amount: d.amount ?? '',
//       effect: d.effect ?? '',
//       refId: d.refId ?? '',
//       refNumber: d.refNumber ?? '',
//       partyId: d.partyId ?? '',
//       description: d.description ?? ''
//     });
//     rowCount++;
//   }
//   csvStream.end();

//   logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
// });

