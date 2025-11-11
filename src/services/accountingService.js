<<<<<<< HEAD
// src/services/accountService.js
=======
// src/services/accountingService.js
>>>>>>> e9b25ad40e0445fb45883f37de0e63f61403ca9c
const mongoose = require('mongoose');
const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

/**
<<<<<<< HEAD
 * listAccountsWithBalance(orgId, filters)
 * returns accounts with computed balance (sum debit - credit from AccountEntry unless account.balance exists)
 */
async function listAccountsWithBalance(organizationId, { type, search } = {}) {
  const match = { organizationId: mongoose.Types.ObjectId(organizationId) };
  if (type) match.type = type;
  if (search) match.$or = [{ code: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }];

  // fetch accounts
  const accounts = await Account.find(match).lean();

  if (accounts.length === 0) return [];

  const ids = accounts.map(a => a._id);

  // aggregate entries grouped by accountId
  const ag = [
    { $match: { organizationId: mongoose.Types.ObjectId(organizationId), accountId: { $in: ids } } },
    { $group: { _id: '$accountId', totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
  ];
  const sums = await AccountEntry.collection.aggregate(ag).toArray();
  const sumMap = sums.reduce((acc, s) => { acc[String(s._id)] = { debit: s.totalDebit || 0, credit: s.totalCredit || 0 }; return acc; }, {});

  // attach balance: prefer denormalized account.balance when defined (not 0) otherwise compute
  const out = accounts.map(a => {
    const m = sumMap[String(a._id)] || { debit: 0, credit: 0 };
    const computed = (m.debit || 0) - (m.credit || 0);
    const useBalance = (typeof a.balance === 'number' && a.balance !== 0) ? a.balance : computed;
    return { ...a, computedBalance: computed, balance: useBalance };
  });

  return out;
}

/**
 * getAccountHierarchy(organizationId)
 * returns accounts tree (parent-child)
 */
async function getAccountHierarchy(organizationId) {
  const accounts = await Account.find({ organizationId: mongoose.Types.ObjectId(organizationId) }).lean();
  const map = {};
  accounts.forEach(a => { map[String(a._id)] = { ...a, children: [] }; });
  const roots = [];
  accounts.forEach(a => {
    if (a.parent && map[String(a.parent)]) {
      map[String(a.parent)].children.push(map[String(a._id)]);
    } else {
      roots.push(map[String(a._id)]);
    }
  });
  return roots;
}

module.exports = { listAccountsWithBalance, getAccountHierarchy };


// // src/services/accountingService.js
// const mongoose = require('mongoose');
// const Account = require('../models/accountModel');
// const AccountEntry = require('../models/accountEntryModel');

// /**
//  * postJournalEntries(organizationId, date, entries, opts)
//  * entries: [{ accountCode || accountId, debit, credit, description }]
//  * Ensures sum debit == sum credit, writes AccountEntry docs in a transaction, optionally updates account balances.
//  */
// async function postJournalEntries(organizationId, date, entries, opts = {}) {
//   if (!organizationId) throw new Error('organizationId required');
//   if (!Array.isArray(entries) || entries.length < 1) throw new Error('entries required');

//   const totalDebit = entries.reduce((s, e) => s + (Number(e.debit || 0)), 0);
//   const totalCredit = entries.reduce((s, e) => s + (Number(e.credit || 0)), 0);
//   if (Math.abs(totalDebit - totalCredit) > 1e-6) throw new Error('Unbalanced journal: debits != credits');

//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     // resolve accountIds where codes provided
//     const resolved = await Promise.all(entries.map(async e => {
//       if (e.accountId) return { ...e, accountId: e.accountId };
//       if (!e.accountCode) throw new Error('accountCode required for entry');
//       const acc = await Account.findOne({ organizationId, code: e.accountCode }).session(session);
//       if (!acc) throw new Error(`Account code not found: ${e.accountCode}`);
//       return { ...e, accountId: acc._id };
//     }));

//     const docs = resolved.map(e => ({
//       organizationId,
//       accountId: e.accountId,
//       referenceType: e.referenceType || null,
//       referenceId: e.referenceId || null,
//       date: date || new Date(),
//       debit: Number(e.debit || 0),
//       credit: Number(e.credit || 0),
//       description: e.description || ''
//     }));

//     const created = await AccountEntry.insertMany(docs, { session });

//     if (opts.updateBalances) {
//       // update account balances incrementally (denormalized)
//       for (const d of docs) {
//         const delta = (d.debit || 0) - (d.credit || 0);
//         await Account.updateOne({ _id: d.accountId }, { $inc: { balance: delta } }).session(session);
//       }
//     }

//     await session.commitTransaction();
//     session.endSession();
//     return created;
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     throw err;
//   }
// }

// module.exports = { postJournalEntries };
=======
 * postJournalEntries(organizationId, date, entries, opts)
 * entries: [{ accountCode || accountId, debit, credit, description }]
 * Ensures sum debit == sum credit, writes AccountEntry docs in a transaction, optionally updates account balances.
 */
async function postJournalEntries(organizationId, date, entries, opts = {}) {
  if (!organizationId) throw new Error('organizationId required');
  if (!Array.isArray(entries) || entries.length < 1) throw new Error('entries required');

  const totalDebit = entries.reduce((s, e) => s + (Number(e.debit || 0)), 0);
  const totalCredit = entries.reduce((s, e) => s + (Number(e.credit || 0)), 0);
  if (Math.abs(totalDebit - totalCredit) > 1e-6) throw new Error('Unbalanced journal: debits != credits');

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // resolve accountIds where codes provided
    const resolved = await Promise.all(entries.map(async e => {
      if (e.accountId) return { ...e, accountId: e.accountId };
      if (!e.accountCode) throw new Error('accountCode required for entry');
      const acc = await Account.findOne({ organizationId, code: e.accountCode }).session(session);
      if (!acc) throw new Error(`Account code not found: ${e.accountCode}`);
      return { ...e, accountId: acc._id };
    }));

    const docs = resolved.map(e => ({
      organizationId,
      accountId: e.accountId,
      referenceType: e.referenceType || null,
      referenceId: e.referenceId || null,
      date: date || new Date(),
      debit: Number(e.debit || 0),
      credit: Number(e.credit || 0),
      description: e.description || ''
    }));

    const created = await AccountEntry.insertMany(docs, { session });

    if (opts.updateBalances) {
      // update account balances incrementally (denormalized)
      for (const d of docs) {
        const delta = (d.debit || 0) - (d.credit || 0);
        await Account.updateOne({ _id: d.accountId }, { $inc: { balance: delta } }).session(session);
      }
    }

    await session.commitTransaction();
    session.endSession();
    return created;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

module.exports = { postJournalEntries };
>>>>>>> e9b25ad40e0445fb45883f37de0e63f61403ca9c
