// src/controllers/transactionController.js
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const Ledger = require('../models/ledgerModel');
const { fetchTransactionsAggregated } = require('../services/transactionService');
const { logAudit } = require('../utils/auditLogger'); // ensure this exists
const { format } = require('fast-csv');

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.getTransactions = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

  const data = await fetchTransactionsAggregated(user, req.query);

  // audit (non-blocking)
  logAudit({ user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total: data.total } });

  res.status(200).json({
    status: 'success',
    total: data.total,
    page: data.page,
    limit: data.limit,
    results: data.results
  });
});

// --- fast-csv streaming version ---

exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user || !user.organizationId)
    return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

  const orgId = mongoose.Types.ObjectId(user.organizationId);
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

  // pipelines per collection
  const invoicePipe = [
    { $match: { ...baseMatch, ...(partyId ? { customerId: mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('invoiceDate') } },
    { $project: {
        type: { $literal: 'invoice' },
        date: { $ifNull: ['$invoiceDate', '$createdAt'] },
        amount: '$grandTotal',
        effect: { $literal: 'debit' },
        refId: '$_id',
        refNumber: '$invoiceNumber',
        partyId: '$customerId',
        description: { $ifNull: ['$notes', '$description', null] }
    } }
  ];

  const paymentPipe = [
    { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('paymentDate') } },
    { $project: {
        type: { $literal: 'payment' },
        date: { $ifNull: ['$paymentDate', '$createdAt'] },
        amount: '$amount',
        effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'credit', 'debit'] },
        refId: '$_id',
        refNumber: '$referenceNumber',
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        description: { $ifNull: ['$remarks', '$paymentMethod', null] }
    } }
  ];

  const purchasePipe = [
    { $match: { ...baseMatch, ...(partyId ? { supplierId: mongoose.Types.ObjectId(partyId) } : {}), ...dateMatch('purchaseDate') } },
    { $project: {
        type: { $literal: 'purchase' },
        date: { $ifNull: ['$purchaseDate', '$createdAt'] },
        amount: '$grandTotal',
        effect: { $literal: 'debit' },
        refId: '$_id',
        refNumber: '$invoiceNumber',
        partyId: '$supplierId',
        description: { $ifNull: ['$notes', '$description', null] }
    } }
  ];

  const ledgerPipe = [
    { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {}), ...dateMatch('entryDate') } },
    { $project: {
        type: { $literal: 'ledger' },
        date: { $ifNull: ['$entryDate', '$createdAt'] },
        amount: '$amount',
        effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'credit', 'debit'] },
        refId: '$_id',
        refNumber: '$referenceNumber',
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        description: '$description'
    } }
  ];

  const pipeline = [
    ...invoicePipe,
    { $unionWith: { coll: Payment.collection.name, pipeline: paymentPipe } },
    { $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipe } },
    { $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipe } }
  ];

  if (wantedTypes && wantedTypes.length) pipeline.push({ $match: { type: { $in: wantedTypes } } });
  pipeline.push({ $sort: { date: sortDir } });

  const cursor = Invoice.collection.aggregate(pipeline, { allowDiskUse: true, cursor: { batchSize: 1000 } });

  const fileName = `transactions_${new Date().toISOString().replace(/[:T]/g, '_').slice(0,19)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const csvStream = format({ headers: true });
  csvStream.pipe(res);

  let rowCount = 0;
  while (await cursor.hasNext()) {
    const d = await cursor.next();
    csvStream.write({
      type: d.type,
      date: d.date ? new Date(d.date).toISOString() : '',
      amount: d.amount ?? '',
      effect: d.effect ?? '',
      refId: d.refId ?? '',
      refNumber: d.refNumber ?? '',
      partyId: d.partyId ?? '',
      description: d.description ?? ''
    });
    rowCount++;
  }
  csvStream.end();

  logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
});


// exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
//   const user = req.user;
//   if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

//   // Build same pipelines but without pagination; stream cursor
//   const orgId = mongoose.Types.ObjectId(user.organizationId);
//   const branchId = req.query.branchId || user.branchId || null;
//   const partyId = req.query.partyId || null;
//   const startDate = req.query.startDate || null;
//   const endDate = req.query.endDate || null;
//   const wantedTypes = req.query.type ? String(req.query.type).split(',') : null;
//   const sortDir = (req.query.sort && String(req.query.sort).toLowerCase() === 'asc') ? 1 : -1;

//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const invoiceDateMatch = (startDate || endDate) ? { invoiceDate: {} } : null;
//   if (invoiceDateMatch) {
//     if (startDate) invoiceDateMatch.invoiceDate.$gte = new Date(startDate);
//     if (endDate) invoiceDateMatch.invoiceDate.$lte = new Date(endDate);
//   }
//   const paymentDateMatch = (startDate || endDate) ? { paymentDate: {} } : null;
//   if (paymentDateMatch) {
//     if (startDate) paymentDateMatch.paymentDate.$gte = new Date(startDate);
//     if (endDate) paymentDateMatch.paymentDate.$lte = new Date(endDate);
//   }
//   const purchaseDateMatch = (startDate || endDate) ? { purchaseDate: {} } : null;
//   if (purchaseDateMatch) {
//     if (startDate) purchaseDateMatch.purchaseDate.$gte = new Date(startDate);
//     if (endDate) purchaseDateMatch.purchaseDate.$lte = new Date(endDate);
//   }
//   const ledgerDateMatch = (startDate || endDate) ? { entryDate: {} } : null;
//   if (ledgerDateMatch) {
//     if (startDate) ledgerDateMatch.entryDate.$gte = new Date(startDate);
//     if (endDate) ledgerDateMatch.entryDate.$lte = new Date(endDate);
//   }

//   // party filters
//   const invoiceParty = partyId ? { customerId: mongoose.Types.ObjectId(partyId) } : {};
//   const paymentParty = partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {};
//   const purchaseParty = partyId ? { supplierId: mongoose.Types.ObjectId(partyId) } : {};
//   const ledgerParty = partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {};

//   const invoicePipe = [
//     { $match: { ...baseMatch, ...invoiceParty, ...(invoiceDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'invoice' },
//       date: { $ifNull: ['$invoiceDate', '$createdAt'] },
//       amount: { $abs: [{ $ifNull: ['$grandTotal', 0] }] },
//       effect: { $literal: 'debit' },
//       refId: '$_id',
//       refNumber: { $ifNull: ['$invoiceNumber', null] },
//       partyId: '$customerId',
//       description: { $ifNull: ['$notes', '$description', null] }
//     } }
//   ];

//   const paymentPipe = [
//     { $match: { ...baseMatch, ...(paymentParty || {}), ...(paymentDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'payment' },
//       date: { $ifNull: ['$paymentDate', '$createdAt'] },
//       amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//       effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'credit', 'debit'] },
//       refId: '$_id',
//       refNumber: { $ifNull: ['$referenceNumber', '$reference', null] },
//       partyId: { $ifNull: ['$customerId', '$supplierId'] },
//       description: { $ifNull: ['$description', '$paymentMethod', null] }
//     } }
//   ];

//   const purchasePipe = [
//     { $match: { ...baseMatch, ...purchaseParty, ...(purchaseDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'purchase' },
//       date: { $ifNull: ['$purchaseDate', '$createdAt'] },
//       amount: { $abs: [{ $ifNull: ['$grandTotal', 0] }] },
//       effect: { $literal: 'debit' },
//       refId: '$_id',
//       refNumber: { $ifNull: ['$invoiceNumber', null] },
//       partyId: '$supplierId',
//       description: { $ifNull: ['$notes', '$description', null] }
//     } }
//   ];

//   const ledgerPipe = [
//     { $match: { ...baseMatch, ...(ledgerParty || {}), ...(ledgerDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'ledger' },
//       date: { $ifNull: ['$entryDate', '$createdAt'] },
//       amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//       effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'credit', 'debit'] },
//       refId: '$_id',
//       refNumber: { $ifNull: ['$referenceNumber', '$reference', '$voucherNo', null] },
//       partyId: { $ifNull: ['$customerId', '$supplierId'] },
//       description: '$description'
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

//   res.setHeader('Content-Type', 'text/csv');
//   const fileName = `transactions_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'_')}.csv`;
//   res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

//   // write CSV header
//   res.write('type,date,amount,effect,refId,refNumber,partyId,description\n');

//   let rowCount = 0;

//   // Stream cursor
//   while (await cursor.hasNext()) {
//     const d = await cursor.next();
//     const dateStr = d.date ? new Date(d.date).toISOString() : '';
//     const description = d.description ? `"${String(d.description).replace(/"/g, '""')}"` : '';
//     const row = [
//       d.type || '',
//       dateStr,
//       d.amount != null ? String(d.amount) : '',
//       d.effect || '',
//       d.refId ? String(d.refId) : '',
//       d.refNumber ? String(d.refNumber) : '',
//       d.partyId ? String(d.partyId) : '',
//       description
//     ];
//     // write row
//     if (!res.write(row.join(',') + '\n')) {
//       await new Promise(resolve => res.once('drain', resolve));
//     }
//     rowCount++;
//   }

//   res.end();

//   // audit export (non-blocking)
//   logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
// });


// // src/controllers/transactionController.js
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Payment = require('../models/paymentModel');
// const Purchase = require('../models/purchaseModel');
// const Ledger = require('../models/ledgerModel');
// const { fetchTransactionsAggregated } = require('../services/transactionService');
// const { logAudit } = require('../utils/auditLogger'); // ensure this exists

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

// exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
//   const user = req.user;
//   if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing organization context' });

//   // Build same pipelines but without pagination; stream cursor
//   const orgId = mongoose.Types.ObjectId(user.organizationId);
//   const branchId = req.query.branchId || user.branchId || null;
//   const partyId = req.query.partyId || null;
//   const startDate = req.query.startDate || null;
//   const endDate = req.query.endDate || null;
//   const wantedTypes = req.query.type ? String(req.query.type).split(',') : null;
//   const sortDir = (req.query.sort && String(req.query.sort).toLowerCase() === 'asc') ? 1 : -1;

//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const invoiceDateMatch = (startDate || endDate) ? { invoiceDate: {} } : null;
//   if (invoiceDateMatch) {
//     if (startDate) invoiceDateMatch.invoiceDate.$gte = new Date(startDate);
//     if (endDate) invoiceDateMatch.invoiceDate.$lte = new Date(endDate);
//   }
//   const paymentDateMatch = (startDate || endDate) ? { paymentDate: {} } : null;
//   if (paymentDateMatch) {
//     if (startDate) paymentDateMatch.paymentDate.$gte = new Date(startDate);
//     if (endDate) paymentDateMatch.paymentDate.$lte = new Date(endDate);
//   }
//   const purchaseDateMatch = (startDate || endDate) ? { purchaseDate: {} } : null;
//   if (purchaseDateMatch) {
//     if (startDate) purchaseDateMatch.purchaseDate.$gte = new Date(startDate);
//     if (endDate) purchaseDateMatch.purchaseDate.$lte = new Date(endDate);
//   }
//   const ledgerDateMatch = (startDate || endDate) ? { entryDate: {} } : null;
//   if (ledgerDateMatch) {
//     if (startDate) ledgerDateMatch.entryDate.$gte = new Date(startDate);
//     if (endDate) ledgerDateMatch.entryDate.$lte = new Date(endDate);
//   }

//   // party filters
//   const invoiceParty = partyId ? { customerId: mongoose.Types.ObjectId(partyId) } : {};
//   const paymentParty = partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {};
//   const purchaseParty = partyId ? { supplierId: mongoose.Types.ObjectId(partyId) } : {};
//   const ledgerParty = partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {};

//   const invoicePipe = [
//     { $match: { ...baseMatch, ...invoiceParty, ...(invoiceDateMatch || {}) } },
//     {
//       $project: {
//         _id: 0,
//         type: { $literal: 'invoice' },
//         date: { $ifNull: ['$invoiceDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$grandTotal', 0] }] },
//         effect: { $literal: 'debit' },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$invoiceNumber', null] },
//         partyId: '$customerId',
//         description: { $ifNull: ['$notes', '$description', null] }
//       }
//     }
//   ];

//   const paymentPipe = [
//     { $match: { ...baseMatch, ...(paymentParty || {}), ...(paymentDateMatch || {}) } },
//     {
//       $project: {
//         _id: 0,
//         type: { $literal: 'payment' },
//         date: { $ifNull: ['$paymentDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//         effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'credit', 'debit'] },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$referenceNumber', '$reference', null] },
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         description: { $ifNull: ['$description', '$paymentMethod', null] }
//       }
//     }
//   ];

//   const purchasePipe = [
//     { $match: { ...baseMatch, ...purchaseParty, ...(purchaseDateMatch || {}) } },
//     {
//       $project: {
//         _id: 0,
//         type: { $literal: 'purchase' },
//         date: { $ifNull: ['$purchaseDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$grandTotal', 0] }] },
//         effect: { $literal: 'debit' },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$invoiceNumber', null] },
//         partyId: '$supplierId',
//         description: { $ifNull: ['$notes', '$description', null] }
//       }
//     }
//   ];

//   const ledgerPipe = [
//     { $match: { ...baseMatch, ...(ledgerParty || {}), ...(ledgerDateMatch || {}) } },
//     {
//       $project: {
//         _id: 0,
//         type: { $literal: 'ledger' },
//         date: { $ifNull: ['$entryDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//         effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'credit', 'debit'] },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$referenceNumber', '$reference', '$voucherNo', null] },
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         description: '$description'
//       }
//     }
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

//   res.setHeader('Content-Type', 'text/csv');
//   const fileName = `transactions_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.csv`;
//   res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

//   // write CSV header
//   res.write('type,date,amount,effect,refId,refNumber,partyId,description\n');

//   let rowCount = 0;

//   // Stream cursor
//   while (await cursor.hasNext()) {
//     const d = await cursor.next();
//     const dateStr = d.date ? new Date(d.date).toISOString() : '';
//     const description = d.description ? `"${String(d.description).replace(/"/g, '""')}"` : '';
//     const row = [
//       d.type || '',
//       dateStr,
//       d.amount != null ? String(d.amount) : '',
//       d.effect || '',
//       d.refId ? String(d.refId) : '',
//       d.refNumber ? String(d.refNumber) : '',
//       d.partyId ? String(d.partyId) : '',
//       description
//     ];
//     // write row
//     if (!res.write(row.join(',') + '\n')) {
//       await new Promise(resolve => res.once('drain', resolve));
//     }
//     rowCount++;
//   }

//   res.end();

//   // audit export (non-blocking)
//   logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
// });


// // // src/controllers/transactionController.js
// // const mongoose = require('mongoose');
// // const { fetchTransactionsAggregated } = require('../services/transactionService');
// // const { logAudit } = require('../utils/auditLogger');
// // const Invoice = require('../models/invoiceModel'); // used to run aggregation cursor
// // const Payment = require('../models/paymentModel');
// // const Purchase = require('../models/purchaseModel');
// // const Ledger = require('../models/ledgerModel');

// // const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// // // GET /api/v1/transactions
// // exports.getTransactions = asyncHandler(async (req, res) => {
// //   const user = req.user;
// //   if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing user/org' });

// //   const data = await fetchTransactionsAggregated(user, req.query);

// //   // Audit log: read
// //   logAudit({ user, action: 'read:transactions', entityType: 'transaction', req, meta: { query: req.query, total: data.total } });

// //   res.status(200).json({
// //     status: 'success',
// //     total: data.total,
// //     page: data.page,
// //     limit: data.limit,
// //     results: data.results
// //   });
// // });

// // // GET /api/v1/transactions/export?startDate=&endDate=&type=&partyId=...
// // exports.exportTransactionsCsv = asyncHandler(async (req, res) => {
// //   const user = req.user;
// //   if (!user || !user.organizationId) return res.status(403).json({ status: 'fail', message: 'Missing user/org' });

// //   // Build same aggregation pipeline used in service, but return a cursor to stream raw documents.
// //   // We'll construct an aggregation like in transactionService but without pagination; for export we stream ALL matching rows.
// //   const orgId = mongoose.Types.ObjectId(user.organizationId);
// //   const branchId = req.query.branchId || user.branchId || null;
// //   const partyId = req.query.partyId || null;
// //   const startDate = req.query.startDate || null;
// //   const endDate = req.query.endDate || null;
// //   const wantedTypes = req.query.type ? String(req.query.type).split(',') : null;
// //   const sortDir = (req.query.sort && String(req.query.sort).toLowerCase() === 'asc') ? 1 : -1;

// //   const baseMatch = { organizationId: orgId };
// //   if (branchId) baseMatch.branchId = branchId;

// //   // reuse same project shapes as service
// //   const invoiceDateMatch = (startDate || endDate) ? { createdAt: {} } : null;
// //   if (startDate) invoiceDateMatch.createdAt.$gte = new Date(startDate);
// //   if (endDate) invoiceDateMatch.createdAt.$lte = new Date(endDate);

// //   // We'll reuse the same pipelines; to avoid duplication keep them similar to service,
// //   // but we need them inline for the cursor.

// //   const invoicePipeline = [
// //     { $match: { ...baseMatch, ...(partyId ? { customerId: mongoose.Types.ObjectId(partyId) } : {}), ...(invoiceDateMatch || {}) } },
// //     { $project: {
// //       _id: 0,
// //       type: { $literal: 'invoice' },
// //       date: { $ifNull: ['$createdAt', '$invoiceDate', '$entryDate'] },
// //       amount: { $abs: [{ $ifNull: ['$totalAmount', '$amount', 0] }] },
// //       effect: { $literal: 'debit' },
// //       refId: '$_id',
// //       refNumber: { $ifNull: ['$invoiceNumber', '$invoiceNo', null] },
// //       partyId: '$customerId',
// //       description: { $ifNull: ['$notes', '$description', null] },
// //       meta: { status: '$status' }
// //     } }
// //   ];

// //   const paymentPipeline = [
// //     { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {}), ...(startDate || endDate ? { createdAt: {} } : {}) } },
// //     // add createdAt constraints if provided
// //     ...(startDate || endDate ? [{ $match: { ...(startDate ? { createdAt: { $gte: new Date(startDate) } } : {}), ...(endDate ? { createdAt: { ...(startDate ? { $lte: new Date(endDate) } : { $lte: new Date(endDate) }) } } : {}) } }] : []),
// //     { $project: {
// //       _id: 0,
// //       type: { $literal: 'payment' },
// //       date: { $ifNull: ['$createdAt', '$paymentDate', '$entryDate'] },
// //       amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
// //       effect: { $cond: [{ $or: [{ $eq: ['$direction', 'inflow'] }, { $eq: ['$type', 'receipt'] }] }, 'credit', 'debit'] },
// //       refId: '$_id',
// //       refNumber: { $ifNull: ['$reference', '$paymentNumber', null] },
// //       partyId: { $ifNull: ['$customerId', '$supplierId'] },
// //       description: { $ifNull: ['$description', '$method', null] },
// //       meta: { method: '$method', invoiceId: '$invoiceId' }
// //     } }
// //   ];

// //   const purchaseCollectionName = (Purchase && Purchase.collection) ? Purchase.collection.name : null;
// //   const purchasePipeline = [
// //     { $match: { ...baseMatch, ...(partyId ? { supplierId: mongoose.Types.ObjectId(partyId) } : {}), ...(startDate || endDate ? { createdAt: {} } : {}) } },
// //     ...(startDate || endDate ? [{ $match: { ...(startDate ? { createdAt: { $gte: new Date(startDate) } } : {}), ...(endDate ? { createdAt: { ...(startDate ? { $lte: new Date(endDate) } : { $lte: new Date(endDate) }) } } : {}) } }] : []),
// //     { $project: {
// //       _id: 0,
// //       type: { $literal: 'purchase' },
// //       date: { $ifNull: ['$createdAt', '$purchaseDate', '$entryDate'] },
// //       amount: { $abs: [{ $ifNull: ['$totalAmount', '$amount', 0] }] },
// //       effect: { $literal: 'debit' },
// //       refId: '$_id',
// //       refNumber: { $ifNull: ['$purchaseNumber', null] },
// //       partyId: '$supplierId',
// //       description: { $ifNull: ['$notes', null] }
// //     } }
// //   ];

// //   const ledgerPipeline = [
// //     { $match: { ...baseMatch, ...(partyId ? { $or: [{ customerId: mongoose.Types.ObjectId(partyId) }, { supplierId: mongoose.Types.ObjectId(partyId) }] } : {}), ...(startDate || endDate ? { entryDate: {} } : {}) } },
// //     ...(startDate || endDate ? [{ $match: { ...(startDate ? { entryDate: { $gte: new Date(startDate) } } : {}), ...(endDate ? { entryDate: { ...(startDate ? { $lte: new Date(endDate) } : { $lte: new Date(endDate) }) } } : {}) } }] : []),
// //     { $project: {
// //       _id: 0,
// //       type: { $literal: 'adjustment' },
// //       date: { $ifNull: ['$entryDate', '$createdAt'] },
// //       amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
// //       effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'credit', 'debit'] },
// //       refId: '$_id',
// //       refNumber: { $ifNull: ['$voucherNo', null] },
// //       partyId: { $ifNull: ['$customerId', '$supplierId'] },
// //       description: '$description',
// //       meta: { accountCode: '$accountCode' }
// //     } }
// //   ];

// //   // build pipeline for cursor
// //   const cursorPipeline = [];
// //   cursorPipeline.push(...invoicePipeline);
// //   cursorPipeline.push({
// //     $unionWith: {
// //       coll: Payment.collection.name,
// //       pipeline: paymentPipeline
// //     }
// //   });
// //   if (purchaseCollectionName) {
// //     cursorPipeline.push({
// //       $unionWith: {
// //         coll: purchaseCollectionName,
// //         pipeline: purchasePipeline
// //       }
// //     });
// //   }
// //   cursorPipeline.push({
// //     $unionWith: {
// //       coll: Ledger.collection.name,
// //       pipeline: ledgerPipeline
// //     }
// //   });

// //   if (wantedTypes && wantedTypes.length) cursorPipeline.push({ $match: { type: { $in: wantedTypes } } });

// //   cursorPipeline.push({ $sort: { date: sortDir } }); // final sort

// //   // get aggregation cursor
// //   const cursor = Invoice.collection.aggregate(cursorPipeline, { allowDiskUse: true, cursor: { batchSize: 1000 } });

// //   // Stream CSV:
// //   res.setHeader('Content-Type', 'text/csv');
// //   const now = new Date();
// //   const fileName = `transactions_${now.toISOString().slice(0,19).replace(/[:T]/g,'_')}.csv`;
// //   res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

// //   // CSV header
// //   const header = ['type','date','amount','effect','refId','refNumber','partyId','description'];
// //   res.write(header.join(',') + '\n');

// //   let rowCount = 0;

// //   // iterate cursor using next()
// //   const aggCursor = cursor; // mongodb cursor-like
// //   while (await aggCursor.hasNext()) {
// //     const doc = await aggCursor.next();
// //     // flatten fields, escape quotes and commas roughly (simple CSV safe)
// //     const row = [
// //       doc.type || '',
// //       doc.date ? new Date(doc.date).toISOString() : '',
// //       doc.amount != null ? String(doc.amount) : '',
// //       doc.effect || '',
// //       doc.refId ? String(doc.refId) : '',
// //       doc.refNumber != null ? String(doc.refNumber).replace(/"/g, '""') : '',
// //       doc.partyId != null ? String(doc.partyId) : '',
// //       doc.description != null ? (`"${String(doc.description).replace(/"/g, '""')}"`) : ''
// //     ];
// //     res.write(row.join(',') + '\n');
// //     rowCount++;
// //     // backpressure: if connection buffer fills, pause loop until drain
// //     if (!res.write('')) {
// //       await new Promise(resolve => res.once('drain', resolve));
// //     }
// //   }

// //   // finalize response
// //   res.end();

// //   // Audit: export action (non-blocking)
// //   logAudit({ user, action: 'export:transactions', entityType: 'transaction', req, meta: { fileName, rowCount } });
// // });

// // // // src/controllers/transactionController.js
// // // const transactionService = require('../services/transactionService');
// // // const catchAsync = require('../utils/catchAsync'); // adjust path if needed

// // // exports.getTransactions = catchAsync(async (req, res) => {
// // //   const user = req.user;
// // //   if (!user || !user.organizationId) {
// // //     return res.status(403).json({ status: 'fail', message: 'Missing user/organization context' });
// // //   }

// // //   const data = await transactionService.fetchTransactions(user, req.query);
// // //   res.status(200).json({
// // //     status: 'success',
// // //     results: data.results.length,
// // //     total: data.total,
// // //     page: data.page,
// // //     limit: data.limit,
// // //     data: data.results
// // //   });
// // // });
