// src/services/transactionService.js
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const Ledger = require('../models/ledgerModel');

function toObjectIdIfNeeded(id) {
  if (!id) return null;
  try { return mongoose.Types.ObjectId(id); } catch { return id; }
}

function buildDateMatch(fieldName, startDate, endDate) {
  if (!startDate && !endDate) return null;
  const condition = {};
  if (startDate) condition.$gte = new Date(startDate);
  if (endDate) condition.$lte = new Date(endDate);
  return { [fieldName]: condition };
}

/**
 * fetchTransactionsAggregated(user, query)
 * query: { startDate, endDate, type, partyId, branchId, sort, page, limit }
 */
async function fetchTransactionsAggregated(user, query = {}) {
  if (!user || !user.organizationId) throw new Error('Missing organization context');

  const orgId = toObjectIdIfNeeded(user.organizationId);
  const branchId = query.branchId || user.branchId || null;
  const partyId = query.partyId ? toObjectIdIfNeeded(query.partyId) : null;
  const startDate = query.startDate || null;
  const endDate = query.endDate || null;
  const wantedTypes = query.type ? String(query.type).split(',') : null;
  const sortDir = (query.sort && String(query.sort).toLowerCase() === 'asc') ? 1 : -1;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
  const skip = (page - 1) * limit;

  // base match (organization + optional branch)
  const baseMatch = { organizationId: orgId };
  if (branchId) baseMatch.branchId = branchId;

  // date matches
  const invoiceDateMatch = buildDateMatch('invoiceDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
  const paymentDateMatch = buildDateMatch('paymentDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
  const purchaseDateMatch = buildDateMatch('purchaseDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
  const ledgerDateMatch = buildDateMatch('entryDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);

  // party filters
  const invoiceParty = partyId ? { customerId: partyId } : {};
  const paymentParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};
  const purchaseParty = partyId ? { supplierId: partyId } : {};
  const ledgerParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};

  // invoice pipeline
  const invoicePipeline = [
    { $match: { ...baseMatch, ...invoiceParty, ...(invoiceDateMatch || {}) } },
    {
      $project: {
        _id: 0,
        type: { $literal: 'invoice' },
        date: { $ifNull: ['$invoiceDate', '$createdAt'] },
        amount: { $abs: [{ $ifNull: ['$grandTotal', '$totalAmount', 0] }] },
        effect: { $literal: 'debit' },
        refId: '$_id',
        refNumber: { $ifNull: ['$invoiceNumber', null] },
        partyId: '$customerId',
        description: { $ifNull: ['$notes', '$description', null] },
        meta: { status: '$status' }
      }
    }
  ];

  // payment pipeline
  const paymentPipeline = [
    { $match: { ...baseMatch, ...(paymentParty || {}), ...(paymentDateMatch || {}) } },
    {
      $project: {
        _id: 0,
        type: { $literal: 'payment' },
        date: { $ifNull: ['$paymentDate', '$createdAt'] },
        amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
        effect: {
          $cond: [{ $eq: ['$type', 'inflow'] }, 'credit',
            { $cond: [{ $eq: ['$type', 'outflow'] }, 'debit', 'debit'] }]
        },
        refId: '$_id',
        refNumber: { $ifNull: ['$referenceNumber', '$reference', null] },
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        description: { $ifNull: ['$description', '$paymentMethod', null] },
        meta: { status: '$status', invoiceId: '$invoiceId', purchaseId: '$purchaseId' }
      }
    }
  ];

  // purchase pipeline
  const purchasePipeline = [
    { $match: { ...baseMatch, ...purchaseParty, ...(purchaseDateMatch || {}) } },
    {
      $project: {
        _id: 0,
        type: { $literal: 'purchase' },
        date: { $ifNull: ['$purchaseDate', '$createdAt'] },
        amount: { $abs: [{ $ifNull: ['$grandTotal', '$totalAmount', 0] }] },
        effect: { $literal: 'debit' },
        refId: '$_id',
        refNumber: { $ifNull: ['$invoiceNumber', null] },
        partyId: '$supplierId',
        description: { $ifNull: ['$notes', '$description', null] },
        meta: { status: '$status' }
      }
    }
  ];

  // ledger pipeline
  const ledgerPipeline = [
    { $match: { ...baseMatch, ...(ledgerParty || {}), ...(ledgerDateMatch || {}) } },
    {
      $project: {
        _id: 0,
        type: { $literal: 'ledger' },
        date: { $ifNull: ['$entryDate', '$createdAt'] },
        amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
        effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'credit', 'debit'] },
        refId: '$_id',
        refNumber: { $ifNull: ['$referenceNumber', '$reference', '$voucherNo', null] },
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        description: '$description',
        meta: { accountType: '$accountType' }
      }
    }
  ];

  // assemble pipeline with unionWith
  const pipeline = [
    ...invoicePipeline,
    {
      $unionWith: { coll: Payment.collection.name, pipeline: paymentPipeline }
    },
    {
      $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipeline }
    },
    {
      $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipeline }
    }
  ];

  // filter by requested types (if any)
  if (wantedTypes && wantedTypes.length) pipeline.push({ $match: { type: { $in: wantedTypes } } });

  // sort and facet for pagination + count
  pipeline.push(
    { $sort: { date: sortDir } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limit }]
      }
    },
    { $unwind: { path: '$metadata', preserveNullAndEmptyArrays: true } },
    { $project: { total: { $ifNull: ['$metadata.total', 0] }, data: 1 } }
  );

  // run aggregation starting from invoices collection
  const res = await Invoice.collection.aggregate(pipeline, { allowDiskUse: true }).toArray();
  const first = res[0] || { total: 0, data: [] };

  return {
    total: first.total || 0,
    page,
    limit,
    results: first.data || []
  };
}

module.exports = { fetchTransactionsAggregated };


// // src/services/transactionService.js
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Payment = require('../models/paymentModel');
// const Purchase = require('../models/purchaseModel'); // optional - catch errors if missing
// const Ledger = require('../models/ledgerModel');

// function toObjectIdIfNeeded(id) {
//   if (!id) return null;
//   try { return mongoose.Types.ObjectId(id); } catch (e) { return id; }
// }

// function buildDateMatch(fieldName, startDate, endDate) {
//   const match = {};
//   if (startDate) match.$gte = new Date(startDate);
//   if (endDate) match.$lte = new Date(endDate);
//   if (Object.keys(match).length === 0) return null;
//   return { [fieldName]: match };
// }

// /**
//  * fetchTransactionsAggregated(user, query)
//  * - query: { startDate, endDate, type, partyId, branchId, sort, page, limit }
//  * Returns: { total, page, limit, results }
//  */
// async function fetchTransactionsAggregated(user, query = {}) {
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const branchId = query.branchId || user.branchId || null;
//   const partyId = query.partyId || null;
//   const startDate = query.startDate || null;
//   const endDate = query.endDate || null;
//   const wantedTypes = query.type ? String(query.type).split(',') : null;
//   const sortDir = (query.sort && String(query.sort).toLowerCase() === 'asc') ? 1 : -1;
//   const page = Math.max(1, parseInt(query.page, 10) || 1);
//   const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
//   const skip = (page - 1) * limit;

//   // base match for organization + optional branch
//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   // build match fragments per collection
//   const invoiceDateMatch = buildDateMatch('createdAt', startDate, endDate);
//   const paymentDateMatch = buildDateMatch('createdAt', startDate, endDate);
//   const purchaseDateMatch = buildDateMatch('createdAt', startDate, endDate);
//   const ledgerDateMatch = buildDateMatch('entryDate', startDate, endDate);

//   // Party filters are collection-specific (customerId, supplierId, supplierId)
//   const invoicePartyMatch = partyId ? { customerId: toObjectIdIfNeeded(partyId) } : {};
//   const paymentPartyMatch = partyId ? { $or: [{ customerId: toObjectIdIfNeeded(partyId) }, { supplierId: toObjectIdIfNeeded(partyId) }] } : {};
//   const purchasePartyMatch = partyId ? { supplierId: toObjectIdIfNeeded(partyId) } : {};
//   const ledgerPartyMatch = partyId ? { $or: [{ customerId: toObjectIdIfNeeded(partyId) }, { supplierId: toObjectIdIfNeeded(partyId) }] } : {};

//   // Build aggregation starting from invoices collection
//   // Each branch will produce the normalized fields
//   const invoicePipeline = [
//     { $match: { ...baseMatch, ...invoicePartyMatch, ...(invoiceDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'invoice' },
//       date: { $ifNull: ['$createdAt', '$invoiceDate', '$entryDate'] },
//       amount: { $abs: [{ $ifNull: ['$totalAmount', '$amount', 0] }] },
//       effect: { $literal: 'debit' }, // domain convention
//       refId: '$_id',
//       refNumber: { $ifNull: ['$invoiceNumber', '$invoiceNo', null] },
//       partyId: '$customerId',
//       description: { $ifNull: ['$notes', '$description', null] },
//       meta: { status: '$status', raw: '$$ROOT' }
//     } }
//   ];

//   const paymentPipeline = [
//     { $match: { ...baseMatch, ...(paymentPartyMatch || {}), ...(paymentDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'payment' },
//       date: { $ifNull: ['$createdAt', '$paymentDate', '$entryDate'] },
//       amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//       effect: {
//         $switch: {
//           branches: [
//             { case: { $or: [{ $eq: ['$direction', 'inflow'] }, { $eq: ['$type', 'receipt'] }] }, then: 'credit' },
//           ],
//           default: 'debit'
//         }
//       },
//       refId: '$_id',
//       refNumber: { $ifNull: ['$reference', '$paymentNumber', null] },
//       partyId: { $ifNull: ['$customerId', '$supplierId'] },
//       description: { $ifNull: ['$description', '$method', null] },
//       meta: { method: '$method', invoiceId: '$invoiceId', raw: '$$ROOT' }
//     } }
//   ];

//   // Purchase pipeline - guarded if Purchase collection exists
//   const purchasePipeline = [
//     { $match: { ...baseMatch, ...(purchasePartyMatch || {}), ...(purchaseDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'purchase' },
//       date: { $ifNull: ['$createdAt', '$purchaseDate', '$entryDate'] },
//       amount: { $abs: [{ $ifNull: ['$totalAmount', '$amount', 0] }] },
//       effect: { $literal: 'debit' },
//       refId: '$_id',
//       refNumber: { $ifNull: ['$purchaseNumber', null] },
//       partyId: '$supplierId',
//       description: { $ifNull: ['$notes', null] },
//       meta: { raw: '$$ROOT' }
//     } }
//   ];

//   const ledgerPipeline = [
//     { $match: { ...baseMatch, ...(ledgerPartyMatch || {}), ...(ledgerDateMatch || {}) } },
//     { $project: {
//       _id: 0,
//       type: { $literal: 'adjustment' },
//       date: { $ifNull: ['$entryDate', '$createdAt'] },
//       amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//       effect: { $cond: [{ $eq: ['$type', 'credit'] }, 'credit', 'debit'] },
//       refId: '$_id',
//       refNumber: { $ifNull: ['$voucherNo', null] },
//       partyId: { $ifNull: ['$customerId', '$supplierId'] },
//       description: '$description',
//       meta: { accountCode: '$accountCode', raw: '$$ROOT' }
//     } }
//   ];

//   // Build full pipeline with unionWith for each collection
//   // Start pipeline with Invoice model (assumed to exist).
//   const agg = [];

//   // invoice pipeline root
//   agg.push(...invoicePipeline);

//   // union with payments
//   agg.push({
//     $unionWith: {
//       coll: Payment.collection.name,
//       pipeline: paymentPipeline
//     }
//   });

//   // union with purchases (if collection exists)
//   const purchaseCollectionName = Purchase && Purchase.collection ? Purchase.collection.name : null;
//   if (purchaseCollectionName) {
//     agg.push({
//       $unionWith: {
//         coll: purchaseCollectionName,
//         pipeline: purchasePipeline
//       }
//     });
//   }

//   // union with ledger adjustments
//   agg.push({
//     $unionWith: {
//       coll: Ledger.collection.name,
//       pipeline: ledgerPipeline
//     }
//   });

//   // Optionally filter by requested types
//   if (wantedTypes && wantedTypes.length) {
//     agg.push({ $match: { type: { $in: wantedTypes } } });
//   }

//   // Final sort and facet for pagination + total count
//   agg.push(
//     { $sort: { date: sortDir } },
//     {
//       $facet: {
//         metadata: [{ $count: 'total' }],
//         data: [{ $skip: skip }, { $limit: limit }]
//       }
//     },
//     // unwind metadata to produce guaranteed shape
//     { $unwind: { path: '$metadata', preserveNullAndEmptyArrays: true } },
//     {
//       $project: {
//         total: { $ifNull: ['$metadata.total', 0] },
//         data: 1
//       }
//     }
//   );

//   // Run aggregation on Invoice collection (starting point)
//   const results = await Invoice.collection.aggregate(agg).toArray();
//   const first = results[0] || { total: 0, data: [] };

//   return {
//     total: first.total || 0,
//     page,
//     limit,
//     results: first.data || []
//   };
// }

// module.exports = { fetchTransactionsAggregated };



// // // src/services/transactionService.js
// // const mongoose = require('mongoose');

// // // Adjust these requires to match your project paths
// // const Invoice = require('../models/invoiceModel');
// // const Payment = require('../models/paymentModel');
// // const Purchase = require('../models/purchaseModel');
// // const Ledger = require('../models/ledgerModel');

// // /**
// //  * Normalize a DB record into common transaction shape:
// //  * { type, date, amount, effect, refId, refNumber, partyId, description, meta }
// //  */

// // const normalizeInvoice = inv => ({
// //   type: 'invoice',
// //   date: inv.createdAt || inv.invoiceDate || inv.entryDate,
// //   amount: Math.abs(inv.totalAmount ?? inv.amount ?? 0),
// //   effect: 'debit', // invoices -> receivable (domain convention)
// //   refId: inv._id,
// //   refNumber: inv.invoiceNumber || inv.invoiceNo || null,
// //   partyId: inv.customerId || inv.partyId || null,
// //   description: inv.notes || inv.description || null,
// //   meta: { status: inv.status, raw: inv }
// // });

// // const normalizePayment = p => ({
// //   type: 'payment',
// //   date: p.createdAt || p.paymentDate || p.entryDate,
// //   amount: Math.abs(p.amount ?? 0),
// //   effect: (p.direction === 'inflow' || p.type === 'receipt') ? 'credit' : 'debit',
// //   refId: p._id,
// //   refNumber: p.reference || p.paymentNumber || null,
// //   partyId: p.customerId || p.supplierId || p.partyId || null,
// //   description: p.description || p.method || null,
// //   meta: { method: p.method, invoiceId: p.invoiceId, raw: p }
// // });

// // const normalizePurchase = pu => ({
// //   type: 'purchase',
// //   date: pu.createdAt || pu.purchaseDate || pu.entryDate,
// //   amount: Math.abs(pu.totalAmount ?? pu.amount ?? 0),
// //   effect: 'debit',
// //   refId: pu._id,
// //   refNumber: pu.purchaseNumber || null,
// //   partyId: pu.supplierId || pu.supplierId || null,
// //   description: pu.notes || null,
// //   meta: { raw: pu }
// // });

// // const normalizeAdjustment = a => ({
// //   type: 'adjustment',
// //   date: a.entryDate || a.createdAt,
// //   amount: Math.abs(a.amount ?? 0),
// //   effect: a.type === 'credit' ? 'credit' : 'debit',
// //   refId: a._id,
// //   refNumber: a.voucherNo || null,
// //   partyId: a.customerId || a.supplierId || null,
// //   description: a.description || null,
// //   meta: { accountCode: a.accountCode, raw: a }
// // });

// // function buildDateRange(query) {
// //   if (query.startDate || query.endDate) {
// //     const range = {};
// //     if (query.startDate) range.$gte = new Date(query.startDate);
// //     if (query.endDate) range.$lte = new Date(query.endDate);
// //     return range;
// //   }
// //   // default last 30 days
// //   const end = new Date();
// //   const start = new Date();
// //   start.setDate(end.getDate() - 30);
// //   return { $gte: start, $lte: end };
// // }

// // /**
// //  * fetchTransactions(user, query)
// //  * query: { page, limit, startDate, endDate, type, branchId, partyId, sort }
// //  */
// // async function fetchTransactions(user, query = {}) {
// //   // Scope to org + branch
// //   const orgId = user.organizationId;
// //   const branchId = query.branchId || user.branchId || undefined;

// //   const dateRange = buildDateRange(query);

// //   const commonFilter = {
// //     organizationId: mongoose.Types.ObjectId(orgId)
// //   };
// //   if (branchId) commonFilter.branchId = branchId;

// //   // Add date filter helper
// //   const invoiceFilter = { ...commonFilter };
// //   if (dateRange) invoiceFilter.createdAt = dateRange;
// //   if (query.partyId) invoiceFilter.customerId = query.partyId;

// //   const paymentFilter = { ...commonFilter };
// //   if (dateRange) paymentFilter.createdAt = dateRange;
// //   if (query.partyId) paymentFilter.$or = [{ customerId: query.partyId }, { supplierId: query.partyId }];

// //   const purchaseFilter = { ...commonFilter };
// //   if (dateRange) purchaseFilter.createdAt = dateRange;
// //   if (query.partyId) purchaseFilter.supplierId = query.partyId;

// //   const ledgerFilter = { ...commonFilter };
// //   if (dateRange) ledgerFilter.entryDate = dateRange;
// //   if (query.partyId) ledgerFilter.$or = [{ customerId: query.partyId }, { supplierId: query.partyId }];

// //   // Parallel fetch (only fetch fields we need)
// //   const [
// //     invoices,
// //     payments,
// //     purchases,
// //     adjustments
// //   ] = await Promise.all([
// //     Invoice.find(invoiceFilter)
// //       .select('_id invoiceNumber totalAmount status customerId createdAt notes invoiceDate')
// //       .lean(),
// //     Payment.find(paymentFilter)
// //       .select('_id amount method type direction reference invoiceId customerId supplierId createdAt description')
// //       .lean(),
// //     // if your project has Purchase model, otherwise skip or return []
// //     (async () => {
// //       try {
// //         return await Purchase.find(purchaseFilter)
// //           .select('_id totalAmount supplierId createdAt notes purchaseNumber')
// //           .lean();
// //       } catch (e) {
// //         return [];
// //       }
// //     })(),
// //     Ledger.find(ledgerFilter)
// //       .select('_id entryDate amount type description customerId supplierId voucherNo accountCode')
// //       .lean()
// //   ]);

// //   // Map to normalized items
// //   const mapped = [
// //     ...(invoices || []).map(normalizeInvoice),
// //     ...(payments || []).map(normalizePayment),
// //     ...(purchases || []).map(normalizePurchase),
// //     ...(adjustments || []).map(normalizeAdjustment)
// //   ];

// //   // Optionally filter by type
// //   let filtered = mapped;
// //   if (query.type) {
// //     const wanted = Array.isArray(query.type) ? query.type : String(query.type).split(',');
// //     filtered = mapped.filter(m => wanted.includes(m.type));
// //   }

// //   // sort by date desc by default (newest first)
// //   const sortDir = (query.sort && query.sort.toLowerCase() === 'asc') ? 1 : -1;
// //   filtered.sort((a, b) => (new Date(a.date) - new Date(b.date)) * sortDir);

// //   // pagination
// //   const page = Math.max(1, parseInt(query.page, 10) || 1);
// //   const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
// //   const start = (page - 1) * limit;
// //   const paginated = filtered.slice(start, start + limit);

// //   return {
// //     total: filtered.length,
// //     page,
// //     limit,
// //     results: paginated
// //   };
// // }

// // module.exports = { fetchTransactions };



// // // version 1 over
// // // // src/services/transactionService.js
// // // const mongoose = require('mongoose');
// // // const Invoice = require('../models/invoiceModel');
// // // const Payment = require('../models/paymentModel');
// // // const Purchase = require('../models/purchaseModel');
// // // const Ledger = require('../models/ledgerModel');

// // // const buildDateRange = (query) => {
// // //   if (query.startDate && query.endDate) {
// // //     return { $gte: new Date(query.startDate), $lte: new Date(query.endDate) };
// // //   }
// // //   // default last 30 days
// // //   const end = new Date();
// // //   const start = new Date();
// // //   start.setDate(end.getDate() - 30);
// // //   return { $gte: start, $lte: end };
// // // };

// // // async function fetchTransactions(user, query = {}) {
// // //   const orgId = user.organizationId;
// // //   const branchId = query.branchId || user.branchId;
// // //   const dateRange = buildDateRange(query);

// // //   // fetch invoices
// // //   const invoices = await Invoice.find({
// // //     organizationId: orgId,
// // //     branchId,
// // //     createdAt: dateRange
// // //   }).select(' _id invoiceNumber customerId totalAmount status createdAt ').lean();

// // //   // map to common format
// // //   const mapInvoice = invoices.map(inv => ({
// // //     type: 'invoice',
// // //     date: inv.createdAt,
// // //     amount: inv.totalAmount,
// // //     effect: 'debit',             // decide convention: invoice increases receivable
// // //     refId: inv._id,
// // //     refNumber: inv.invoiceNumber,
// // //     partyId: inv.customerId,
// // //     meta: { status: inv.status },
// // //   }));

// // //   // payments
// // //   const payments = await Payment.find({
// // //     organizationId: orgId,
// // //     branchId,
// // //     createdAt: dateRange
// // //   }).select('_id amount method invoiceId supplierId customerId createdAt type').lean();

// // //   const mapPayments = payments.map(p => ({
// // //     type: 'payment',
// // //     date: p.createdAt,
// // //     amount: p.amount,
// // //     effect: p.type === 'inflow' ? 'credit' : 'debit', // adapt to your domain
// // //     refId: p._id,
// // //     refNumber: null,
// // //     partyId: p.customerId || p.supplierId,
// // //     meta: { method: p.method, invoiceId: p.invoiceId }
// // //   }));

// // //   // purchases (if you have)
// // //   const purchases = await Purchase.find({
// // //     organizationId: orgId,
// // //     branchId,
// // //     createdAt: dateRange
// // //   }).select('_id totalAmount supplierId createdAt').lean();

// // //   const mapPurchases = purchases.map(p => ({
// // //     type: 'purchase',
// // //     date: p.createdAt,
// // //     amount: p.totalAmount,
// // //     effect: 'debit',
// // //     refId: p._id,
// // //     partyId: p.supplierId
// // //   }));

// // //   // optionally include ledger direct entries (adjustments)
// // //   const adjustments = await Ledger.find({
// // //     organizationId: orgId,
// // //     branchId,
// // //     entryDate: dateRange
// // //   }).select('_id entryDate amount type description customerId supplierId').lean();

// // //   const mapAdjustments = adjustments.map(a => ({
// // //     type: 'adjustment',
// // //     date: a.entryDate || a.createdAt,
// // //     amount: a.amount,
// // //     effect: a.type === 'credit' ? 'credit' : 'debit',
// // //     refId: a._id,
// // //     partyId: a.customerId || a.supplierId,
// // //     meta: { description: a.description }
// // //   }));

// // //   // merge and sort descending
// // //   const all = [...mapInvoice, ...mapPayments, ...mapPurchases, ...mapAdjustments];
// // //   all.sort((a, b) => new Date(b.date) - new Date(a.date));
// // //   return all;
// // // }

// // // module.exports = { fetchTransactions };
