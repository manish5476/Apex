const mongoose = require('mongoose');
const Account = require('./account.model');
const AccountEntry = require('./accountEntry.model'); // ✅ Fixed Import

/**
 * listAccountsWithBalance(orgId, filters)
 * returns accounts with computed balance
 */
async function listAccountsWithBalance(organizationId, { type, search } = {}) {
  const match = { organizationId: new mongoose.Types.ObjectId(organizationId) }; // ✅ Safety: Ensure ObjectId
  if (type) match.type = type;
  if (search) match.$or = [{ code: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }];

  // 1. Fetch Accounts
  const accounts = await Account.find(match).lean();
  if (accounts.length === 0) return [];

  const ids = accounts.map(a => a._id);

  // 2. Aggregate Entries (Raw Sums)
  const ag = [
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), accountId: { $in: ids } } },
    { $group: { _id: '$accountId', totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
  ];
  
  // Use .aggregate() on the Model, not collection, for better stability
  const sums = await AccountEntry.aggregate(ag); 
  
  const sumMap = sums.reduce((acc, s) => { 
    acc[String(s._id)] = { debit: s.totalDebit || 0, credit: s.totalCredit || 0 }; 
    return acc; 
  }, {});

  // 3. Merge & Normalize
  const out = accounts.map(a => {
    const m = sumMap[String(a._id)] || { debit: 0, credit: 0 };
    
    // Raw Net (Debit - Credit)
    const rawNet = (m.debit || 0) - (m.credit || 0);

    // ✅ AUDIT FIX 1: Use 'cachedBalance' matching the Schema
    // ✅ AUDIT FIX 2: Handle Polarity (Normal Balance)
    // Assets/Expenses: Normal Balance is Debit (+)
    // Liab/Equity/Income: Normal Balance is Credit (-)
    // We convert everything to positive for display if it matches normal behavior
    
    let displayBalance = rawNet;
    if (['liability', 'equity', 'income'].includes(a.type)) {
        displayBalance = rawNet * -1;
    }

    const useCached = (typeof a.cachedBalance === 'number' && a.cachedBalance !== 0) 
        ? a.cachedBalance 
        : displayBalance;

    return { 
        ...a, 
        debitTotal: m.debit, 
        creditTotal: m.credit,
        rawBalance: rawNet,       // Mathematical (Dr - Cr)
        balance: useCached,       // Normalized for UI (Positive = Normal)
        computedBalance: displayBalance 
    };
  });

  return out;
}

/**
 * getAccountHierarchy(organizationId)
 */
async function getAccountHierarchy(organizationId) {
  const accounts = await Account.find({ organizationId }).lean();
  
  const map = {};
  accounts.forEach(a => { 
      map[String(a._id)] = { ...a, children: [] }; 
  });
  
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