'use strict';

/**
 * TransactionService
 * ─────────────────────────────────────────────
 * Unified view of all financial transactions from AccountEntry.
 *
 * Key fixes vs original:
 *   FIX #1 — search combined with partyId built an invalid $and/$or query.
 *     The search now runs as a post-lookup $match so party names can be matched.
 *
 *   FIX #2 — $skip and $limit ran BEFORE $lookup and search filters.
 *     Pagination is now after all filters using $facet.
 *
 *   FIX #3 — countDocuments(match) counted raw entries but the pipeline
 *     filters more after $lookup (search). Count is now inside $facet.
 *
 *   FIX #4 — endDate didn't include the full last day. Fixed: 23:59:59.999.
 *
 *   FIX #5 — amount was $add: debit + credit which is correct but the
 *     field is now named clearly and both debit/credit are exposed separately.
 */

const mongoose     = require('mongoose');
const AccountEntry = require('../model/accountEntry.model');

function toObjectId(id) {
  if (!id) return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return id; }
}

async function fetchTransactionsAggregated(user, query = {}) {
  if (!user?.organizationId) throw new Error('Missing organization context');

  const orgId    = toObjectId(user.organizationId);
  const branchId = query.branchId || user.branchId || null;
  const partyId  = query.partyId ? toObjectId(query.partyId) : null;

  const wantedTypes  = query.type   ? String(query.type).split(',').map(t => t.trim().toLowerCase()) : null;
  const wantedEffect = query.effect ? String(query.effect).toLowerCase() : null;
  const searchText   = query.search || null;
  const sortDir      = query.sort?.toLowerCase() === 'asc' ? 1 : -1;
  const page         = Math.max(1, parseInt(query.page,  10) || 1);
  const limit        = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
  const skip         = (page - 1) * limit;

  // ── Base match (uses indexes) ──────────────────────────────────────
  const match = { organizationId: orgId };

  if (branchId) match.branchId = toObjectId(branchId);

  if (query.startDate || query.endDate) {
    match.date = {};
    if (query.startDate) match.date.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999); // FIX #4
      match.date.$lte = end;
    }
  }

  if (wantedTypes?.length)       match.referenceType = { $in: wantedTypes };
  if (wantedEffect === 'debit')  match.debit  = { $gt: 0 };
  if (wantedEffect === 'credit') match.credit = { $gt: 0 };
  if (partyId) match.$or = [{ customerId: partyId }, { supplierId: partyId }];

  // ── Aggregation pipeline ───────────────────────────────────────────
  const pipeline = [
    { $match: match },
    { $sort:  { date: sortDir, _id: sortDir } },

    // Lookups (needed for party name and search)
    { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
    { $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supplier' } },
  ];

  // FIX #1 & #2: search after lookups, pagination after search
  if (searchText) {
    const regex = new RegExp(searchText, 'i');
    pipeline.push({
      $match: {
        $or: [
          { description:            regex },
          { referenceNumber:        regex },
          { 'customer.name':        regex },
          { 'supplier.companyName': regex },
        ],
      },
    });
  }

  // FIX #3: $facet gives correct count AND paginated data in one round-trip
  pipeline.push({
    $facet: {
      data: [
        { $skip:  skip },
        { $limit: limit },
        {
          $project: {
            _id:         1,
            date:        1,
            type:        { $ifNull: ['$referenceType', 'manual'] },
            debit:       1,
            credit:      1,
            amount:      { $add: ['$debit', '$credit'] },
            effect:      { $cond: [{ $gt: ['$debit', 0] }, 'debit', 'credit'] },
            referenceId: '$referenceId',
            refNumber:   '$referenceNumber',
            description: 1,
            partyId:     { $ifNull: ['$customerId', '$supplierId'] },
            partyName: {
              $ifNull: [
                { $arrayElemAt: ['$customer.name',        0] },
                { $arrayElemAt: ['$supplier.companyName', 0] },
                null,
              ],
            },
          },
        },
      ],
      totalCount: [{ $count: 'count' }],
    },
  });

  const [result]   = await AccountEntry.aggregate(pipeline);
  const data       = result?.data || [];
  const totalCount = result?.totalCount[0]?.count || 0;

  return { total: totalCount, page, limit, results: data };
}

module.exports = { fetchTransactionsAggregated };

// // src/services/transactionService.js
// const mongoose = require('mongoose');
// const AccountEntry = require('../model/accountEntry.model'); // ✅ Single Source of Truth

// // --- Helper ---
// function toObjectIdIfNeeded(id) {
//   if (!id) return null;
//   try { return new mongoose.Types.ObjectId(id); } catch { return id; }
// }

// // --- Main Service ---
// async function fetchTransactionsAggregated(user, query = {}) {
//   if (!user || !user.organizationId) throw new Error('Missing organization context');

//   // 1. Setup Variables
//   const orgId = toObjectIdIfNeeded(user.organizationId);
//   const branchId = query.branchId || user.branchId || null;
//   const partyId = query.partyId ? toObjectIdIfNeeded(query.partyId) : null;
  
//   // Filters
//   const wantedTypes = query.type ? String(query.type).split(',').map(t => t.trim().toLowerCase()) : null;
//   const wantedEffect = query.effect ? String(query.effect).toLowerCase() : null; // 'debit' or 'credit'
//   const searchText = query.search || null;

//   const sortDir = (query.sort && String(query.sort).toLowerCase() === 'asc') ? 1 : -1;
//   const page = Math.max(1, parseInt(query.page, 10) || 1);
//   const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
//   const skip = (page - 1) * limit;

//   // 2. Build Match Object
//   const match = { organizationId: orgId };
  
//   if (branchId) match.branchId = toObjectIdIfNeeded(branchId);

//   // Date Filter
//   if (query.startDate || query.endDate) {
//     match.date = {};
//     if (query.startDate) match.date.$gte = new Date(query.startDate);
//     if (query.endDate) match.date.$lte = new Date(query.endDate);
//   }

//   // Type Filter (Invoice, Payment, etc.)
//   if (wantedTypes && wantedTypes.length > 0) {
//     match.referenceType = { $in: wantedTypes };
//   }

//   // Party Filter (Customer or Supplier)
//   if (partyId) {
//     match.$or = [
//         { customerId: partyId },
//         { supplierId: partyId }
//     ];
//   }

//   // Effect Filter (Debit/Credit)
//   if (wantedEffect === 'debit') {
//     match.debit = { $gt: 0 };
//   } else if (wantedEffect === 'credit') {
//     match.credit = { $gt: 0 };
//   }

//   // Search Filter (Regex)
//   if (searchText) {
//     const searchRegex = new RegExp(searchText, 'i');
//     const searchConditions = [
//         { description: searchRegex },
//         { referenceNumber: searchRegex }
//     ];
    
//     // If we already have an $or (for partyId), we must combine carefully using $and
//     if (match.$or) {
//         match.$and = [
//             { $or: match.$or },
//             { $or: searchConditions }
//         ];
//         delete match.$or;
//     } else {
//         match.$or = searchConditions;
//     }
//   }

//   // 3. Execute Pipeline
//   // We use aggregation to lookup party names and format output
//   const pipeline = [
//     { $match: match },
//     { $sort: { date: sortDir } },
//     { $skip: skip },
//     { $limit: limit },
//     // Lookup Customer Name
//     {
//       $lookup: {
//         from: 'customers',
//         localField: 'customerId',
//         foreignField: '_id',
//         as: 'customer'
//       }
//     },
//     // Lookup Supplier Name
//     {
//       $lookup: {
//         from: 'suppliers',
//         localField: 'supplierId',
//         foreignField: '_id',
//         as: 'supplier'
//       }
//     },
//     // Format Result
//     {
//       $project: {
//         _id: 1,
//         type: { $ifNull: ['$referenceType', 'manual'] },
//         date: '$date',
//         amount: { $add: ['$debit', '$credit'] }, // Only one side is usually populated
//         effect: { $cond: [{ $gt: ['$debit', 0] }, 'debit', 'credit'] },
//         refId: '$referenceId',
//         refNumber: '$referenceNumber',
//         partyId: { $ifNull: ['$customerId', '$supplierId'] },
//         partyName: { 
//             $ifNull: [
//                 { $arrayElemAt: ["$customer.name", 0] },
//                 { $arrayElemAt: ["$supplier.companyName", 0] }, 
//                 null
//             ] 
//         },
//         description: 1
//       }
//     }
//   ];

//   // 4. Run Queries (Parallel Count + Data)
//   const [data, totalCount] = await Promise.all([
//     AccountEntry.aggregate(pipeline),
//     AccountEntry.countDocuments(match)
//   ]);

//   return {
//     total: totalCount,
//     page,
//     limit,
//     results: data
//   };
// }

// module.exports = { fetchTransactionsAggregated };
