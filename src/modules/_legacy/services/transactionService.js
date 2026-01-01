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
