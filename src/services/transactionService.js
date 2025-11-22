// src/services/transactionService.js
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const Ledger = require('../models/ledgerModel');

// --- Helpers ---
function toObjectIdIfNeeded(id) {
  if (!id) return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return id; }
}

function buildDateMatch(fieldName, startDate, endDate) {
  if (!startDate && !endDate) return null;
  const condition = {};
  if (startDate) condition.$gte = new Date(startDate);
  if (endDate) condition.$lte = new Date(endDate);
  return { [fieldName]: condition };
}

// --- Main Service ---
async function fetchTransactionsAggregated(user, query = {}) {
  if (!user || !user.organizationId) throw new Error('Missing organization context');

  // 1. Setup Variables
  const orgId = toObjectIdIfNeeded(user.organizationId);
  const branchId = query.branchId || user.branchId || null;
  const partyId = query.partyId ? toObjectIdIfNeeded(query.partyId) : null;
  const startDate = query.startDate || null;
  const endDate = query.endDate || null;
  
  // Filters from Frontend
  const wantedTypes = query.type ? String(query.type).split(',') : null;
  const wantedEffect = query.effect ? String(query.effect).toLowerCase() : null; // ✅ Added
  const searchText = query.search || null; // ✅ Added

  const sortDir = (query.sort && String(query.sort).toLowerCase() === 'asc') ? 1 : -1;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
  const skip = (page - 1) * limit;

  // 2. Base Matches
  const baseMatch = { organizationId: orgId };
  if (branchId) baseMatch.branchId = branchId;

  const invoiceDateMatch = buildDateMatch('invoiceDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
  const paymentDateMatch = buildDateMatch('paymentDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
  const purchaseDateMatch = buildDateMatch('purchaseDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
  const ledgerDateMatch = buildDateMatch('entryDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);

  // 3. Party Matches (Handles Customer vs Supplier logic)
  const invoiceParty = partyId ? { customerId: partyId } : {};
  const paymentParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};
  const purchaseParty = partyId ? { supplierId: partyId } : {};
  const ledgerParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};

  // 4. Sub-Pipelines
  const invoicePipeline = [
    { $match: { ...baseMatch, ...invoiceParty, ...(invoiceDateMatch || {}) } },
    { $project: {
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
    }}
  ];

  const paymentPipeline = [
    { $match: { ...baseMatch, ...(paymentParty || {}), ...(paymentDateMatch || {}) } },
    { $project: {
        _id: 0,
        type: { $literal: 'payment' },
        date: { $ifNull: ['$paymentDate', '$createdAt'] },
        amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
        effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'credit', 'debit'] },
        refId: '$_id',
        refNumber: { $ifNull: ['$referenceNumber', '$reference', null] },
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        description: { $ifNull: ['$description', '$paymentMethod', null] },
        meta: { status: '$status' }
    }}
  ];

  const purchasePipeline = [
    { $match: { ...baseMatch, ...purchaseParty, ...(purchaseDateMatch || {}) } },
    { $project: {
        _id: 0,
        type: { $literal: 'purchase' },
        date: { $ifNull: ['$purchaseDate', '$createdAt'] },
        amount: { $abs: [{ $ifNull: ['$grandTotal', '$totalAmount', 0] }] },
        effect: { $literal: 'debit' }, // Logic Check: Usually Purchases are Credit to Supplier, but Debit to Expense. Keep as is if that's your logic.
        refId: '$_id',
        refNumber: { $ifNull: ['$invoiceNumber', null] },
        partyId: '$supplierId',
        description: { $ifNull: ['$notes', '$description', null] },
        meta: { status: '$status' }
    }}
  ];

  const ledgerPipeline = [
    { $match: { ...baseMatch, ...(ledgerParty || {}), ...(ledgerDateMatch || {}) } },
    { $project: {
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
    }}
  ];

  // 5. Assemble Pipeline
  const pipeline = [
    ...invoicePipeline,
    { $unionWith: { coll: Payment.collection.name, pipeline: paymentPipeline } },
    { $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipeline } },
    { $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipeline } }
  ];

  // --- 6. APPLY GLOBAL FILTERS ---

  // Filter by Type
  if (wantedTypes && wantedTypes.length) {
      pipeline.push({ $match: { type: { $in: wantedTypes } } });
  }

  // ✅ Filter by Effect (Credit/Debit)
  if (wantedEffect) {
      pipeline.push({ $match: { effect: wantedEffect } });
  }

  // ✅ Filter by Search Text (Description OR Ref Number)
  if (searchText) {
      const searchRegex = new RegExp(searchText, 'i');
      pipeline.push({
          $match: {
              $or: [
                  { description: searchRegex },
                  { refNumber: searchRegex }
              ]
          }
      });
  }

  // 7. Sort & Pagination
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

  // 8. Execute
  // Using allowDiskUse is critical for Union queries on large datasets
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
// const Purchase = require('../models/purchaseModel');
// const Ledger = require('../models/ledgerModel');

// function toObjectIdIfNeeded(id) {
//   if (!id) return null;
//   try { return mongoose.Types.ObjectId(id); } catch { return id; }
// }

// function buildDateMatch(fieldName, startDate, endDate) {
//   if (!startDate && !endDate) return null;
//   const condition = {};
//   if (startDate) condition.$gte = new Date(startDate);
//   if (endDate) condition.$lte = new Date(endDate);
//   return { [fieldName]: condition };
// }

// async function fetchTransactionsAggregated(user, query = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');

//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const branchId = query.branchId || user.branchId || null;
//   const partyId = query.partyId ? toObjectIdIfNeeded(query.partyId) : null;
//   const startDate = query.startDate || null;
//   const endDate = query.endDate || null;
//   const wantedTypes = query.type ? String(query.type).split(',') : null;
//   const sortDir = (query.sort && String(query.sort).toLowerCase() === 'asc') ? 1 : -1;

//   const page = Math.max(1, parseInt(query.page, 10) || 1);
//   const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
//   const skip = (page - 1) * limit;

//   // base match (organization + optional branch)
//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   // date matches
//   const invoiceDateMatch = buildDateMatch('invoiceDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
//   const paymentDateMatch = buildDateMatch('paymentDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
//   const purchaseDateMatch = buildDateMatch('purchaseDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
//   const ledgerDateMatch = buildDateMatch('entryDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);

//   // party filters
//   const invoiceParty = partyId ? { customerId: partyId } : {};
//   const paymentParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};
//   const purchaseParty = partyId ? { supplierId: partyId } : {};
//   const ledgerParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};

//   // invoice pipeline
//   const invoicePipeline = [
//     { $match: { ...baseMatch, ...invoiceParty, ...(invoiceDateMatch || {}) } },
//     {
//       $project: {
//         _id: 0,
//         type: { $literal: 'invoice' },
//         date: { $ifNull: ['$invoiceDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$grandTotal', '$totalAmount', 0] }] },
//         effect: { $literal: 'debit' },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$invoiceNumber', null] },
//         partyId: '$customerId',
//         description: { $ifNull: ['$notes', '$description', null] },
//         meta: { status: '$status' }
//       }
//     }
//   ];

//   // payment pipeline
//   const paymentPipeline = [
//     { $match: { ...baseMatch, ...(paymentParty || {}), ...(paymentDateMatch || {}) } },
//     {
//       $project: {
//         _id: 0,
//         type: { $literal: 'payment' },
//         date: { $ifNull: ['$paymentDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//         effect: {
//           $cond: [{ $eq: ['$type', 'inflow'] }, 'credit',
//             { $cond: [{ $eq: ['$type', 'outflow'] }, 'debit', 'debit'] }]
//         },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$referenceNumber', '$reference', null] },
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         description: { $ifNull: ['$description', '$paymentMethod', null] },
//         meta: { status: '$status', invoiceId: '$invoiceId', purchaseId: '$purchaseId' }
//       }
//     }
//   ];

//   // purchase pipeline
//   const purchasePipeline = [
//     { $match: { ...baseMatch, ...purchaseParty, ...(purchaseDateMatch || {}) } },
//     {
//       $project: {
//         _id: 0,
//         type: { $literal: 'purchase' },
//         date: { $ifNull: ['$purchaseDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$grandTotal', '$totalAmount', 0] }] },
//         effect: { $literal: 'debit' },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$invoiceNumber', null] },
//         partyId: '$supplierId',
//         description: { $ifNull: ['$notes', '$description', null] },
//         meta: { status: '$status' }
//       }
//     }
//   ];

//   // ledger pipeline
//   const ledgerPipeline = [
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
//         description: '$description',
//         meta: { accountType: '$accountType' }
//       }
//     }
//   ];

//   // assemble pipeline with unionWith
//   const pipeline = [
//     ...invoicePipeline,
//     {
//       $unionWith: { coll: Payment.collection.name, pipeline: paymentPipeline }
//     },
//     {
//       $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipeline }
//     },
//     {
//       $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipeline }
//     }
//   ];

//   // filter by requested types (if any)
//   if (wantedTypes && wantedTypes.length) pipeline.push({ $match: { type: { $in: wantedTypes } } });

//   // sort and facet for pagination + count
//   pipeline.push(
//     { $sort: { date: sortDir } },
//     {
//       $facet: {
//         metadata: [{ $count: 'total' }],
//         data: [{ $skip: skip }, { $limit: limit }]
//       }
//     },
//     { $unwind: { path: '$metadata', preserveNullAndEmptyArrays: true } },
//     { $project: { total: { $ifNull: ['$metadata.total', 0] }, data: 1 } }
//   );

//   // run aggregation starting from invoices collection
//   const res = await Invoice.collection.aggregate(pipeline, { allowDiskUse: true }).toArray();
//   const first = res[0] || { total: 0, data: [] };

//   return {
//     total: first.total || 0,
//     page,
//     limit,
//     results: first.data || []
//   };
// }

// module.exports = { fetchTransactionsAggregated };

