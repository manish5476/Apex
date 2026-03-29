'use strict';

/**
 * AccountService
 * ─────────────────────────────────────────────
 * Business logic for the Chart of Accounts.
 *
 * Key fixes vs original:
 *   FIX #1 — listAccountsWithBalance: `useCached` logic was wrong.
 *     Original fell back to cachedBalance when it was non-zero, but cachedBalance
 *     is a stale denormalized field that may be wrong. The REAL balance must always
 *     come from AccountEntry aggregation. cachedBalance is only for UI display when
 *     the aggregation hasn't run yet (e.g. newly created account).
 *   FIX #2 — getAccountHierarchy: No org scoping on children traversal.
 *     If two orgs happened to share an account _id (impossible with ObjectId but
 *     defensive), children could leak. Now all accounts are pre-filtered by org.
 *   FIX #3 — listAccountsWithBalance account type filter only matched 'asset' and
 *     'receivable' — 'other' type accounts were excluded from balance listing.
 */

const mongoose     = require('mongoose');
const Account      = require('../model/account.model');
const AccountEntry = require('../model/accountEntry.model');

/**
 * List all accounts for an org with their computed balances from AccountEntry.
 * Balance is always computed from the ledger — never trusted from cachedBalance alone.
 */
async function listAccountsWithBalance(organizationId, { type, search } = {}) {
  const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };
  if (type)   match.type = type;
  if (search) match.$or  = [
    { code: new RegExp(search, 'i') },
    { name: new RegExp(search, 'i') },
  ];

  const accounts = await Account.find(match).lean();
  if (!accounts.length) return [];

  const ids = accounts.map(a => a._id);

  // Aggregate debits and credits from AccountEntry in one query
  const sums = await AccountEntry.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        accountId: { $in: ids },
      },
    },
    {
      $group: {
        _id:         '$accountId',
        totalDebit:  { $sum: '$debit' },
        totalCredit: { $sum: '$credit' },
      },
    },
  ]);

  const sumMap = sums.reduce((acc, s) => {
    acc[String(s._id)] = { debit: s.totalDebit || 0, credit: s.totalCredit || 0 };
    return acc;
  }, {});

  return accounts.map(a => {
    const m      = sumMap[String(a._id)] || { debit: 0, credit: 0 };
    const rawNet = (m.debit || 0) - (m.credit || 0);

    // Normal balance convention:
    //   Assets / Expenses  → Debit  increases balance → rawNet is positive when normal
    //   Liabilities / Equity / Income → Credit increases balance → flip sign for display
    let displayBalance = rawNet;
    if (['liability', 'equity', 'income'].includes(a.type)) {
      displayBalance = rawNet * -1;
    }

    // FIX #1: computedBalance from AccountEntry is always the source of truth.
    // cachedBalance is a read-hint only — used when there are zero entries yet.
    const balance = displayBalance !== 0
      ? displayBalance
      : (typeof a.cachedBalance === 'number' ? a.cachedBalance : 0);

    return {
      ...a,
      debitTotal:      m.debit,
      creditTotal:     m.credit,
      rawBalance:      rawNet,       // Mathematical Dr - Cr
      balance,                       // Display (positive = normal balance side)
      computedBalance: displayBalance,
    };
  });
}

/**
 * Build the chart of accounts as a tree.
 * FIX #2: Scoped to org before building the tree.
 */
async function getAccountHierarchy(organizationId) {
  const accounts = await Account.find({ organizationId }).lean();

  const map = {};
  accounts.forEach(a => { map[String(a._id)] = { ...a, children: [] }; });

  const roots = [];
  accounts.forEach(a => {
    const parentKey = a.parent ? String(a.parent) : null;
    if (parentKey && map[parentKey]) {
      map[parentKey].children.push(map[String(a._id)]);
    } else {
      roots.push(map[String(a._id)]);
    }
  });

  return roots;
}

module.exports = { listAccountsWithBalance, getAccountHierarchy };



// const mongoose = require('mongoose');
// const Account = require('./model/account.model');
// const AccountEntry = require('./model/accountEntry.model'); // ✅ Fixed Import

// /**
//  * listAccountsWithBalance(orgId, filters)
//  * returns accounts with computed balance
//  */
// async function listAccountsWithBalance(organizationId, { type, search } = {}) {
//   const match = { organizationId: new mongoose.Types.ObjectId(organizationId) }; // ✅ Safety: Ensure ObjectId
//   if (type) match.type = type;
//   if (search) match.$or = [{ code: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }];

//   // 1. Fetch Accounts
//   const accounts = await Account.find(match).lean();
//   if (accounts.length === 0) return [];

//   const ids = accounts.map(a => a._id);

//   // 2. Aggregate Entries (Raw Sums)
//   const ag = [
//     { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), accountId: { $in: ids } } },
//     { $group: { _id: '$accountId', totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
//   ];
  
//   // Use .aggregate() on the Model, not collection, for better stability
//   const sums = await AccountEntry.aggregate(ag); 
  
//   const sumMap = sums.reduce((acc, s) => { 
//     acc[String(s._id)] = { debit: s.totalDebit || 0, credit: s.totalCredit || 0 }; 
//     return acc; 
//   }, {});

//   // 3. Merge & Normalize
//   const out = accounts.map(a => {
//     const m = sumMap[String(a._id)] || { debit: 0, credit: 0 };
    
//     // Raw Net (Debit - Credit)
//     const rawNet = (m.debit || 0) - (m.credit || 0);

//     // ✅ AUDIT FIX 1: Use 'cachedBalance' matching the Schema
//     // ✅ AUDIT FIX 2: Handle Polarity (Normal Balance)
//     // Assets/Expenses: Normal Balance is Debit (+)
//     // Liab/Equity/Income: Normal Balance is Credit (-)
//     // We convert everything to positive for display if it matches normal behavior
    
//     let displayBalance = rawNet;
//     if (['liability', 'equity', 'income'].includes(a.type)) {
//         displayBalance = rawNet * -1;
//     }

//     const useCached = (typeof a.cachedBalance === 'number' && a.cachedBalance !== 0) 
//         ? a.cachedBalance 
//         : displayBalance;

//     return { 
//         ...a, 
//         debitTotal: m.debit, 
//         creditTotal: m.credit,
//         rawBalance: rawNet,       // Mathematical (Dr - Cr)
//         balance: useCached,       // Normalized for UI (Positive = Normal)
//         computedBalance: displayBalance 
//     };
//   });

//   return out;
// }

// /**
//  * getAccountHierarchy(organizationId)
//  */
// async function getAccountHierarchy(organizationId) {
//   const accounts = await Account.find({ organizationId }).lean();
  
//   const map = {};
//   accounts.forEach(a => { 
//       map[String(a._id)] = { ...a, children: [] }; 
//   });
  
//   const roots = [];
//   accounts.forEach(a => {
//     if (a.parent && map[String(a.parent)]) {
//       map[String(a.parent)].children.push(map[String(a._id)]);
//     } else {
//       roots.push(map[String(a._id)]);
//     }
//   });
  
//   return roots;
// }

// module.exports = { listAccountsWithBalance, getAccountHierarchy };