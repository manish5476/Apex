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

const mongoose = require('mongoose');
const AccountEntry = require('../model/accountEntry.model');

function toObjectId(id) {
  if (!id || id === 'null' || id === 'undefined') return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return id; }
}

async function fetchTransactionsAggregated(user, query = {}) {
  if (!user?.organizationId) throw new Error('Missing organization context');

  const orgId = toObjectId(user.organizationId);
  const qBranch = (query.branchId === 'null' || query.branchId === 'undefined') ? null : query.branchId;
  const branchId = qBranch || user.branchId || null;
  
  const qParty = (query.partyId === 'null' || query.partyId === 'undefined') ? null : query.partyId;
  const partyId = qParty ? toObjectId(qParty) : null;

  const qType = (query.type === 'null' || query.type === 'undefined') ? null : query.type;
  const wantedTypes = qType ? String(qType).split(',').map(t => t.trim().toLowerCase()) : null;
  
  const qEffect = (query.effect === 'null' || query.effect === 'undefined') ? null : query.effect;
  const wantedEffect = qEffect ? String(qEffect).toLowerCase() : null;
  
  const qSearch = (query.search === 'null' || query.search === 'undefined') ? null : query.search;
  const searchText = qSearch || null;
  
  const sortDir = query.sort?.toLowerCase() === 'asc' ? 1 : -1;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(1000, Math.max(10, parseInt(query.limit, 10) || 100));
  const skip = (page - 1) * limit;

  // ── Base match (uses indexes) ──────────────────────────────────────
  const match = { organizationId: orgId };

  if (branchId) match.branchId = toObjectId(branchId);

  const qStart = (query.startDate === 'null' || query.startDate === 'undefined') ? null : query.startDate;
  const qEnd = (query.endDate === 'null' || query.endDate === 'undefined') ? null : query.endDate;

  if (qStart || qEnd) {
    match.date = {};
    if (qStart) match.date.$gte = new Date(qStart);
    if (qEnd) {
      const end = new Date(qEnd);
      end.setHours(23, 59, 59, 999); // FIX #4
      match.date.$lte = end;
    }
  }

  if (wantedTypes?.length) match.referenceType = { $in: wantedTypes };
  if (wantedEffect === 'debit') match.debit = { $gt: 0 };
  if (wantedEffect === 'credit') match.credit = { $gt: 0 };
  if (partyId) match.$or = [{ customerId: partyId }, { supplierId: partyId }];

  // ── Aggregation pipeline ───────────────────────────────────────────
  const pipeline = [
    { $match: match },
    { $sort: { date: sortDir, _id: sortDir } },

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
          { description: regex },
          { referenceNumber: regex },
          { 'customer.name': regex },
          { 'supplier.companyName': regex },
        ],
      },
    });
  }

  // FIX #3: $facet gives correct count AND paginated data in one round-trip
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            date: 1,
            type: { $ifNull: ['$referenceType', 'manual'] },
            debit: 1,
            credit: 1,
            amount: { $add: ['$debit', '$credit'] },
            effect: { $cond: [{ $gt: ['$debit', 0] }, 'debit', 'credit'] },
            referenceId: '$referenceId',
            refNumber: '$referenceNumber',
            description: 1,
            partyId: { $ifNull: ['$customerId', '$supplierId'] },
            partyName: {
              $ifNull: [
                { $arrayElemAt: ['$customer.name', 0] },
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

  const [result] = await AccountEntry.aggregate(pipeline);
  const data = result?.data || [];
  const totalCount = result?.totalCount[0]?.count || 0;

  return { total: totalCount, page, limit, results: data };
}

module.exports = { fetchTransactionsAggregated };
