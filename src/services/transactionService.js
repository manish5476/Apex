// src/services/transactionService.js
const mongoose = require('mongoose');
const AccountEntry = require('../models/accountEntryModel'); // ✅ Single Source of Truth

// --- Helper ---
function toObjectIdIfNeeded(id) {
  if (!id) return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return id; }
}

// --- Main Service ---
async function fetchTransactionsAggregated(user, query = {}) {
  if (!user || !user.organizationId) throw new Error('Missing organization context');

  // 1. Setup Variables
  const orgId = toObjectIdIfNeeded(user.organizationId);
  const branchId = query.branchId || user.branchId || null;
  const partyId = query.partyId ? toObjectIdIfNeeded(query.partyId) : null;
  
  // Filters
  const wantedTypes = query.type ? String(query.type).split(',').map(t => t.trim().toLowerCase()) : null;
  const wantedEffect = query.effect ? String(query.effect).toLowerCase() : null; // 'debit' or 'credit'
  const searchText = query.search || null;

  const sortDir = (query.sort && String(query.sort).toLowerCase() === 'asc') ? 1 : -1;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
  const skip = (page - 1) * limit;

  // 2. Build Match Object
  const match = { organizationId: orgId };
  
  if (branchId) match.branchId = toObjectIdIfNeeded(branchId);

  // Date Filter
  if (query.startDate || query.endDate) {
    match.date = {};
    if (query.startDate) match.date.$gte = new Date(query.startDate);
    if (query.endDate) match.date.$lte = new Date(query.endDate);
  }

  // Type Filter (Invoice, Payment, etc.)
  if (wantedTypes && wantedTypes.length > 0) {
    match.referenceType = { $in: wantedTypes };
  }

  // Party Filter (Customer or Supplier)
  if (partyId) {
    match.$or = [
        { customerId: partyId },
        { supplierId: partyId }
    ];
  }

  // Effect Filter (Debit/Credit)
  if (wantedEffect === 'debit') {
    match.debit = { $gt: 0 };
  } else if (wantedEffect === 'credit') {
    match.credit = { $gt: 0 };
  }

  // Search Filter (Regex)
  if (searchText) {
    const searchRegex = new RegExp(searchText, 'i');
    const searchConditions = [
        { description: searchRegex },
        { referenceNumber: searchRegex }
    ];
    
    // If we already have an $or (for partyId), we must combine carefully using $and
    if (match.$or) {
        match.$and = [
            { $or: match.$or },
            { $or: searchConditions }
        ];
        delete match.$or;
    } else {
        match.$or = searchConditions;
    }
  }

  // 3. Execute Pipeline
  // We use aggregation to lookup party names and format output
  const pipeline = [
    { $match: match },
    { $sort: { date: sortDir } },
    { $skip: skip },
    { $limit: limit },
    // Lookup Customer Name
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    // Lookup Supplier Name
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplierId',
        foreignField: '_id',
        as: 'supplier'
      }
    },
    // Format Result
    {
      $project: {
        _id: 1,
        type: { $ifNull: ['$referenceType', 'manual'] },
        date: '$date',
        amount: { $add: ['$debit', '$credit'] }, // Only one side is usually populated
        effect: { $cond: [{ $gt: ['$debit', 0] }, 'debit', 'credit'] },
        refId: '$referenceId',
        refNumber: '$referenceNumber',
        partyId: { $ifNull: ['$customerId', '$supplierId'] },
        partyName: { 
            $ifNull: [
                { $arrayElemAt: ["$customer.name", 0] },
                { $arrayElemAt: ["$supplier.companyName", 0] }, 
                null
            ] 
        },
        description: 1
      }
    }
  ];

  // 4. Run Queries (Parallel Count + Data)
  const [data, totalCount] = await Promise.all([
    AccountEntry.aggregate(pipeline),
    AccountEntry.countDocuments(match)
  ]);

  return {
    total: totalCount,
    page,
    limit,
    results: data
  };
}

module.exports = { fetchTransactionsAggregated };

// // src/services/transactionService.js
// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Payment = require('../models/paymentModel');
// const Purchase = require('../models/purchaseModel');

// // --- Helpers ---
// function toObjectIdIfNeeded(id) {
//   if (!id) return null;
//   try { return new mongoose.Types.ObjectId(id); } catch { return id; }
// }

// function buildDateMatch(fieldName, startDate, endDate) {
//   if (!startDate && !endDate) return null;
//   const condition = {};
//   if (startDate) condition.$gte = new Date(startDate);
//   if (endDate) condition.$lte = new Date(endDate);
//   return { [fieldName]: condition };
// }

// // --- Main Service ---
// async function fetchTransactionsAggregated(user, query = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');

//   // 1. Setup Variables
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const branchId = query.branchId || user.branchId || null;
//   const partyId = query.partyId ? toObjectIdIfNeeded(query.partyId) : null;
//   const startDate = query.startDate || null;
//   const endDate = query.endDate || null;
  
//   // Filters from Frontend
//   const wantedTypes = query.type ? String(query.type).split(',') : null;
//   const wantedEffect = query.effect ? String(query.effect).toLowerCase() : null; // ✅ Added
//   const searchText = query.search || null; // ✅ Added

//   const sortDir = (query.sort && String(query.sort).toLowerCase() === 'asc') ? 1 : -1;
//   const page = Math.max(1, parseInt(query.page, 10) || 1);
//   const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
//   const skip = (page - 1) * limit;

//   // 2. Base Matches
//   const baseMatch = { organizationId: orgId };
//   if (branchId) baseMatch.branchId = branchId;

//   const invoiceDateMatch = buildDateMatch('invoiceDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
//   const paymentDateMatch = buildDateMatch('paymentDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
//   const purchaseDateMatch = buildDateMatch('purchaseDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);
//   const ledgerDateMatch = buildDateMatch('entryDate', startDate, endDate) || buildDateMatch('createdAt', startDate, endDate);

//   // 3. Party Matches (Handles Customer vs Supplier logic)
//   const invoiceParty = partyId ? { customerId: partyId } : {};
//   const paymentParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};
//   const purchaseParty = partyId ? { supplierId: partyId } : {};
//   const ledgerParty = partyId ? { $or: [{ customerId: partyId }, { supplierId: partyId }] } : {};

//   // 4. Sub-Pipelines
//   const invoicePipeline = [
//     { $match: { ...baseMatch, ...invoiceParty, ...(invoiceDateMatch || {}) } },
//     { $project: {
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
//     }}
//   ];

//   const paymentPipeline = [
//     { $match: { ...baseMatch, ...(paymentParty || {}), ...(paymentDateMatch || {}) } },
//     { $project: {
//         _id: 0,
//         type: { $literal: 'payment' },
//         date: { $ifNull: ['$paymentDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$amount', 0] }] },
//         effect: { $cond: [{ $eq: ['$type', 'inflow'] }, 'credit', 'debit'] },
//         refId: '$_id',
//         refNumber: { $ifNull: ['$referenceNumber', '$reference', null] },
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         description: { $ifNull: ['$description', '$paymentMethod', null] },
//         meta: { status: '$status' }
//     }}
//   ];

//   const purchasePipeline = [
//     { $match: { ...baseMatch, ...purchaseParty, ...(purchaseDateMatch || {}) } },
//     { $project: {
//         _id: 0,
//         type: { $literal: 'purchase' },
//         date: { $ifNull: ['$purchaseDate', '$createdAt'] },
//         amount: { $abs: [{ $ifNull: ['$grandTotal', '$totalAmount', 0] }] },
//         effect: { $literal: 'debit' }, // Logic Check: Usually Purchases are Credit to Supplier, but Debit to Expense. Keep as is if that's your logic.
//         refId: '$_id',
//         refNumber: { $ifNull: ['$invoiceNumber', null] },
//         partyId: '$supplierId',
//         description: { $ifNull: ['$notes', '$description', null] },
//         meta: { status: '$status' }
//     }}
//   ];

//   const ledgerPipeline = [
//     { $match: { ...baseMatch, ...(ledgerParty || {}), ...(ledgerDateMatch || {}) } },
//     { $project: {
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
//     }}
//   ];

//   // 5. Assemble Pipeline
//   const pipeline = [
//     ...invoicePipeline,
//     { $unionWith: { coll: Payment.collection.name, pipeline: paymentPipeline } },
//     { $unionWith: { coll: Purchase.collection.name, pipeline: purchasePipeline } },
//     { $unionWith: { coll: Ledger.collection.name, pipeline: ledgerPipeline } }
//   ];

//   // --- 6. APPLY GLOBAL FILTERS ---

//   // Filter by Type
//   if (wantedTypes && wantedTypes.length) {
//       pipeline.push({ $match: { type: { $in: wantedTypes } } });
//   }

//   // ✅ Filter by Effect (Credit/Debit)
//   if (wantedEffect) {
//       pipeline.push({ $match: { effect: wantedEffect } });
//   }

//   // ✅ Filter by Search Text (Description OR Ref Number)
//   if (searchText) {
//       const searchRegex = new RegExp(searchText, 'i');
//       pipeline.push({
//           $match: {
//               $or: [
//                   { description: searchRegex },
//                   { refNumber: searchRegex }
//               ]
//           }
//       });
//   }

//   // 7. Sort & Pagination
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

//   // 8. Execute
//   // Using allowDiskUse is critical for Union queries on large datasets
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

