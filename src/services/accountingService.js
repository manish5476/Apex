// src/services/accountingService.js
const mongoose = require('mongoose');
const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

/**
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
