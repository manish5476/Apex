// // src/services/accountService.js
// const mongoose = require('mongoose');
// const Account = require('../models/accountModel');
// const AccountEntry = require('../models/accountEntryModel');

// /**
//  * listAccountsWithBalance(orgId, filters)
//  * returns accounts with computed balance (sum debit - credit from AccountEntry unless account.balance exists)
//  */
// async function listAccountsWithBalance(organizationId, { type, search } = {}) {
//   const match = { organizationId: mongoose.Types.ObjectId(organizationId) };
//   if (type) match.type = type;
//   if (search) match.$or = [{ code: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }];

//   // fetch accounts
//   const accounts = await Account.find(match).lean();

//   if (accounts.length === 0) return [];

//   const ids = accounts.map(a => a._id);

//   // aggregate entries grouped by accountId
//   const ag = [
//     { $match: { organizationId: mongoose.Types.ObjectId(organizationId), accountId: { $in: ids } } },
//     { $group: { _id: '$accountId', totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
//   ];
//   const sums = await AccountEntry.collection.aggregate(ag).toArray();
//   const sumMap = sums.reduce((acc, s) => { acc[String(s._id)] = { debit: s.totalDebit || 0, credit: s.totalCredit || 0 }; return acc; }, {});

//   // attach balance: prefer denormalized account.balance when defined (not 0) otherwise compute
//   const out = accounts.map(a => {
//     const m = sumMap[String(a._id)] || { debit: 0, credit: 0 };
//     const computed = (m.debit || 0) - (m.credit || 0);
//     const useBalance = (typeof a.balance === 'number' && a.balance !== 0) ? a.balance : computed;
//     return { ...a, computedBalance: computed, balance: useBalance };
//   });

//   return out;
// }

// /**
//  * getAccountHierarchy(organizationId)
//  * returns accounts tree (parent-child)
//  */
// async function getAccountHierarchy(organizationId) {
//   const accounts = await Account.find({ organizationId: mongoose.Types.ObjectId(organizationId) }).lean();
//   const map = {};
//   accounts.forEach(a => { map[String(a._id)] = { ...a, children: [] }; });
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

