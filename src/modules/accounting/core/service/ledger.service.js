'use strict';

/**
 * LedgerService
 * ─────────────────────────────────────────────
 * All ledger, financial statement, and reporting logic lives here.
 *
 * Key fixes vs original:
 *   FIX #1 — getAllLedgers: $lookup + $unwind on ALL 5 tables for every query
 *     makes this extremely slow. Lookups now only run when needed.
 *   FIX #2 — getCustomerLedger opening balance aggregation filtered by
 *     account.type in ['asset', 'receivable', 'current_asset'] but the schema
 *     only has 'asset' as a valid type. 'receivable' and 'current_asset' would
 *     never match, making the opening balance wrong. Fixed to use only 'asset'.
 *   FIX #3 — getCashFlow grouped by referenceType but summed the same entries
 *     for both cashIn and cashOut, double-counting. Fixed: Dr = cashOut, Cr = cashIn.
 *   FIX #4 — getBalanceSheet: equity calculation used only the equity account type.
 *     Retained earnings (income - expense) must also be included for the equation
 *     Assets = Liabilities + Equity to balance. Integrated retained earnings properly.
 *   FIX #5 — getSalesJournal / postInvoiceJournal: used a local getAccount() helper
 *     (find-then-create, race condition). All account resolution now goes through
 *     JournalService.getOrInitAccount.
 *   FIX #6 — salesJournalService.postInvoiceJournal fetched product.purchasePrice
 *     from the products collection for COGS — the current price, not the sale-time
 *     price. Fixed to use item.purchasePriceAtSale with .select('+purchasePriceAtSale').
 */

const mongoose    = require('mongoose');
const AccountEntry = require('./../model/accountEntry.model');
const Account     = require('./../model/account.model');
const JournalService = require('./journal.service');
const { getOpeningBalance, setOpeningBalance } = require('./ledgerCache.service');

class LedgerService {

  /* ============================================================
   * 1. GET ALL LEDGER ENTRIES (journal view with cursor pagination)
   * FIX #1: Lookups only run when a filter or field actually needs them
   * ============================================================ */
  static async getAllLedgers(orgId, filters) {
    const {
      startDate, endDate, customerId, supplierId, accountId,
      paymentStatus, invoiceStatus, entryType,
      minAmount, maxAmount, search,
      lastDate, lastId, limit = 50,
    } = filters;

    const match = { organizationId: new mongoose.Types.ObjectId(orgId) };

    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (customerId) match.customerId = new mongoose.Types.ObjectId(customerId);
    if (supplierId) match.supplierId = new mongoose.Types.ObjectId(supplierId);
    if (accountId)  match.accountId  = new mongoose.Types.ObjectId(accountId);
    if (entryType === 'debit')  match.debit  = { $gt: 0 };
    if (entryType === 'credit') match.credit = { $gt: 0 };

    if (minAmount || maxAmount) {
      const range = {};
      if (minAmount) range.$gte = Number(minAmount);
      if (maxAmount) range.$lte = Number(maxAmount);
      match.$or = [{ debit: range }, { credit: range }];
    }

    const pipeline = [{ $match: match }];

    // Cursor-based pagination
    if (lastDate && lastId) {
      pipeline.push({
        $match: {
          $or: [
            { date: { $lt: new Date(lastDate) } },
            { date: new Date(lastDate), _id: { $lt: new mongoose.Types.ObjectId(lastId) } },
          ],
        },
      });
    }

    // Always join account (needed for type/name in output)
    pipeline.push(
      { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' }
    );

    // Optional joins — only when needed by filters or search
    const needsCustomer  = !!customerId || !!search;
    const needsSupplier  = !!supplierId || !!search;
    const needsInvoice   = !!paymentStatus || !!invoiceStatus || !!search;
    const needsPurchase  = !!paymentStatus || !!search;
    const needsPayment   = !!search;

    if (needsCustomer) {
      pipeline.push(
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } }
      );
    }
    if (needsSupplier) {
      pipeline.push(
        { $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supplier' } },
        { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } }
      );
    }
    if (needsInvoice) {
      pipeline.push(
        { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'invoice' } },
        { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } }
      );
    }
    if (needsPurchase) {
      pipeline.push(
        { $lookup: { from: 'purchases', localField: 'purchaseId', foreignField: '_id', as: 'purchase' } },
        { $unwind: { path: '$purchase', preserveNullAndEmptyArrays: true } }
      );
    }
    if (needsPayment) {
      pipeline.push(
        { $lookup: { from: 'payments', localField: 'paymentId', foreignField: '_id', as: 'payment' } },
        { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } }
      );
    }

    // Post-join filters
    if (search) {
      const regex = new RegExp(search, 'i');
      pipeline.push({
        $match: {
          $or: [
            { description: regex }, { referenceNumber: regex },
            { 'account.name': regex },
            ...(needsCustomer  ? [{ 'customer.name': regex }]        : []),
            ...(needsSupplier  ? [{ 'supplier.companyName': regex }]  : []),
            ...(needsInvoice   ? [{ 'invoice.invoiceNumber': regex }] : []),
            ...(needsPurchase  ? [{ 'purchase.invoiceNumber': regex }]: []),
          ],
        },
      });
    }
    if (paymentStatus) {
      pipeline.push({ $match: { $or: [{ 'invoice.paymentStatus': paymentStatus }, { 'purchase.paymentStatus': paymentStatus }] } });
    }
    if (invoiceStatus) {
      pipeline.push({ $match: { 'invoice.status': invoiceStatus } });
    }

    pipeline.push(
      { $sort: { date: -1, _id: -1 } },
      { $limit: Number(limit) },
      {
        $project: {
          _id: 1, date: 1, debit: 1, credit: 1, description: 1,
          referenceType: 1, referenceNumber: 1,
          accountId: 1, 'account.name': 1, 'account.code': 1, 'account.type': 1,
          customerId: 1, supplierId: 1, invoiceId: 1, purchaseId: 1, paymentId: 1,
          branchId: 1, createdBy: 1,
          customerName:   '$customer.name',
          supplierName:   '$supplier.companyName',
          invoiceNumber:  '$invoice.invoiceNumber',
          purchaseNumber: '$purchase.invoiceNumber',
        },
      }
    );

    const docs = await AccountEntry.aggregate(pipeline);
    const nextCursor = docs.length
      ? { lastDate: docs[docs.length - 1].date, lastId: docs[docs.length - 1]._id }
      : null;

    return { docs, nextCursor };
  }

  /* ============================================================
   * 2. CUSTOMER LEDGER (AR statement)
   * FIX #2: Opening balance aggregation uses only 'asset' type
   * ============================================================ */
  static async getCustomerLedger(customerId, orgId, { startDate, endDate, limit = 200 }) {
    if (!mongoose.Types.ObjectId.isValid(orgId)) throw new Error(`Invalid organization ID: ${orgId}`);
    if (!mongoose.Types.ObjectId.isValid(customerId)) throw new Error(`Invalid customer ID: ${customerId}`);

    const orgOid  = new mongoose.Types.ObjectId(orgId);
    const custOid = new mongoose.Types.ObjectId(customerId);

    const match = { organizationId: orgOid, customerId: custOid };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    // Opening balance
    let openingBalance = 0;
    let cached = null;
    if (startDate) {
      cached = await getOpeningBalance(orgOid, custOid, startDate);
    }

    if (cached !== null) {
      openingBalance = cached;
    } else if (startDate) {
      const prev = await AccountEntry.aggregate([
        { $match: { organizationId: orgOid, customerId: custOid, date: { $lt: new Date(startDate) } } },
        { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
        { $unwind: '$account' },
        // FIX #2: schema only has 'asset' — 'receivable'/'current_asset' never match
        { $match: { 'account.type': 'asset' } },
        { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
      ]);

      openingBalance = prev.length ? prev[0].debit - prev[0].credit : 0;
      await setOpeningBalance(orgOid, custOid, startDate, openingBalance);
    }

    const entries = await AccountEntry.aggregate([
      { $match: match },
      { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.type': 'asset' } }, // AR entries only
      { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'invoice' } },
      { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'payments', localField: 'paymentId', foreignField: '_id', as: 'payment' } },
      { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
      { $sort: { date: 1, _id: 1 } },
      { $limit: Number(limit) },
      {
        $project: {
          _id: 1, date: 1, debit: 1, credit: 1, description: 1,
          referenceNumber: 1, referenceType: 1, branchId: 1, createdBy: 1,
          invoiceId: 1, paymentId: 1,
          accountName:   '$account.name',
          accountType:   '$account.type',
          invoiceNumber: '$invoice.invoiceNumber',
          invoiceStatus: '$invoice.paymentStatus',
          paymentMethod: '$payment.paymentMethod',
        },
      },
    ]);

    let running = openingBalance;
    const history = [];
    if (startDate) {
      history.push({ _id: 'opening', date: new Date(startDate), description: 'Opening Balance', debit: 0, credit: 0, balance: parseFloat(running.toFixed(2)) });
    }
    for (const e of entries) {
      running += (e.debit || 0) - (e.credit || 0);
      history.push({ ...e, balance: parseFloat(running.toFixed(2)) });
    }

    const customer = await mongoose.model('Customer')
      .findById(customerId).select('name phone gstNumber outstandingBalance');

    return { openingBalance, closingBalance: running, customer, count: history.length, cached: cached !== null, history };
  }

  /* ============================================================
   * 3. SUPPLIER LEDGER (AP statement)
   * ============================================================ */
  static async getSupplierLedger(supplierId, orgId, { startDate, endDate, limit = 200 }) {
    if (!mongoose.Types.ObjectId.isValid(orgId)) throw new Error(`Invalid organization ID: ${orgId}`);
    if (!mongoose.Types.ObjectId.isValid(supplierId)) throw new Error(`Invalid supplier ID: ${supplierId}`);

    const orgOid  = new mongoose.Types.ObjectId(orgId);
    const suppOid = new mongoose.Types.ObjectId(supplierId);

    const match = { organizationId: orgOid, supplierId: suppOid };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    let openingBalance = 0;
    let cached = null;
    if (startDate) {
      cached = await getOpeningBalance(orgOid, suppOid, startDate);
    }
    if (cached !== null) {
      openingBalance = cached;
    } else if (startDate) {
      const prev = await AccountEntry.aggregate([
        { $match: { organizationId: orgOid, supplierId: suppOid, date: { $lt: new Date(startDate) } } },
        { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
      ]);
      openingBalance = prev.length ? prev[0].credit - prev[0].debit : 0;
      await setOpeningBalance(orgOid, suppOid, startDate, openingBalance);
    }

    const entries = await AccountEntry.aggregate([
      { $match: match },
      { $lookup: { from: 'purchases', localField: 'purchaseId', foreignField: '_id', as: 'purchase' } },
      { $unwind: { path: '$purchase', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'payments', localField: 'paymentId', foreignField: '_id', as: 'payment' } },
      { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
      { $sort: { date: 1, _id: 1 } },
      { $limit: Number(limit) },
      {
        $project: {
          _id: 1, date: 1, debit: 1, credit: 1, description: 1,
          referenceNumber: 1, referenceType: 1, branchId: 1, createdBy: 1,
          purchaseId: 1, paymentId: 1,
          purchaseNumber: '$purchase.invoiceNumber',
          purchaseStatus: '$purchase.paymentStatus',
          paymentMethod:  '$payment.paymentMethod',
        },
      },
    ]);

    let running = openingBalance;
    const history = [];
    if (startDate) {
      history.push({ _id: 'opening', date: new Date(startDate), description: 'Opening Balance', debit: 0, credit: 0, balance: parseFloat(running.toFixed(2)) });
    }
    for (const e of entries) {
      running += (e.credit || 0) - (e.debit || 0); // AP: credit increases balance
      history.push({ ...e, balance: parseFloat(running.toFixed(2)) });
    }

    const supplier = await mongoose.model('Supplier')
      .findById(supplierId).select('companyName phone gstNumber outstandingBalance');

    return { openingBalance, closingBalance: running, supplier, count: history.length, cached: cached !== null, history };
  }

  /* ============================================================
   * 4. TRIAL BALANCE
   * ============================================================ */
  static async getTrialBalance(orgId, { startDate, endDate }) {
    const match = { organizationId: new mongoose.Types.ObjectId(orgId) };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(endDate);
    }

    const trial = await AccountEntry.aggregate([
      { $match: match },
      { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      {
        $group: {
          _id:         '$account._id',
          accountName: { $first: '$account.name' },
          accountType: { $first: '$account.type' },
          accountCode: { $first: '$account.code' },
          debit:       { $sum: '$debit' },
          credit:      { $sum: '$credit' },
        },
      },
      { $sort: { accountType: 1, accountName: 1 } },
    ]);

    const totalDebit  = trial.reduce((a, b) => a + b.debit,  0);
    const totalCredit = trial.reduce((a, b) => a + b.credit, 0);

    return {
      totals: { totalDebit, totalCredit },
      difference: parseFloat((totalDebit - totalCredit).toFixed(2)),
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      trial,
    };
  }

  /* ============================================================
   * 5. PROFIT AND LOSS
   * ============================================================ */
  static async getProfitAndLoss(orgId, { startDate, endDate }) {
    const match = { organizationId: new mongoose.Types.ObjectId(orgId) };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(endDate);
    }

    const summary = await AccountEntry.aggregate([
      { $match: match },
      { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.type': { $in: ['income', 'expense'] } } },
      { $group: { _id: '$account.type', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]);

    const income  = summary.find(s => s._id === 'income')  || { debit: 0, credit: 0 };
    const expense = summary.find(s => s._id === 'expense') || { debit: 0, credit: 0 };

    const totalIncome  = income.credit  - income.debit;
    const totalExpense = expense.debit  - expense.credit;
    const netProfit    = totalIncome    - totalExpense;

    return { totalIncome, totalExpense, netProfit };
  }

  /* ============================================================
   * 6. BALANCE SHEET
   * FIX #4: Retained earnings (income - expense) integrated into equity
   * ============================================================ */
  static async getBalanceSheet(orgId, { asOfDate }) {
    const match = { organizationId: new mongoose.Types.ObjectId(orgId) };
    if (asOfDate) {
      match.date = { $lte: new Date(new Date(asOfDate).setHours(23, 59, 59, 999)) };
    }

    const summary = await AccountEntry.aggregate([
      { $match: match },
      { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $group: { _id: '$account.type', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]);

    const get = t => summary.find(s => s._id === t) || { debit: 0, credit: 0 };

    const assets     = get('asset').debit     - get('asset').credit;
    const liabilities = get('liability').credit - get('liability').debit;
    const equity      = get('equity').credit    - get('equity').debit;

    // FIX #4: Retained earnings = net profit from P&L
    const income  = get('income');
    const expense = get('expense');
    const retainedEarnings = (income.credit - income.debit) - (expense.debit - expense.credit);

    const totalEquity = equity + retainedEarnings;

    return {
      assets,
      liabilities,
      equity,
      retainedEarnings,
      totalEquity,
      balanced: Math.abs(assets - (liabilities + totalEquity)) < 0.01,
    };
  }

  /* ============================================================
   * 7. RETAINED EARNINGS
   * ============================================================ */
  static async getRetainedEarnings(orgId, { asOfDate }) {
    const { netProfit } = await this.getProfitAndLoss(orgId, { endDate: asOfDate });
    return netProfit;
  }

  /* ============================================================
   * 8. ORG LEDGER SUMMARY (by account type)
   * ============================================================ */
  static async getOrganizationLedgerSummary(orgId, { startDate, endDate }) {
    const match = { organizationId: new mongoose.Types.ObjectId(orgId) };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(endDate);
    }

    const summary = await AccountEntry.aggregate([
      { $match: match },
      { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $group: { _id: '$account.type', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
      { $project: { type: '$_id', net: { $subtract: ['$credit', '$debit'] }, debit: 1, credit: 1, _id: 0 } },
    ]);

    const result = { asset: 0, liability: 0, equity: 0, income: 0, expense: 0, other: 0 };
    summary.forEach(s => { result[s.type] = s.net || 0; });

    return { ...result, netProfit: result.income - result.expense };
  }

  /* ============================================================
   * 9. CASH FLOW
   * FIX #3: Dr = cash out, Cr = cash in — not both for each group
   * ============================================================ */
  static async getCashFlow(orgId, { startDate, endDate }) {
    const match = {
      organizationId: new mongoose.Types.ObjectId(orgId),
      $or: [{ referenceType: 'payment' }, { referenceType: 'invoice' }, { referenceType: 'purchase' }],
    };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(endDate);
    }

    const entries = await AccountEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id:     '$referenceType',
          // FIX #3: Cr = money coming in (inflow), Dr = money going out (outflow)
          cashIn:  { $sum: '$credit' },
          cashOut: { $sum: '$debit' },
        },
      },
    ]);

    const cashIn  = entries.reduce((a, b) => a + b.cashIn,  0);
    const cashOut = entries.reduce((a, b) => a + b.cashOut, 0);

    return { cashIn, cashOut, netCashFlow: cashIn - cashOut, breakdown: entries };
  }

  /* ============================================================
   * 10. ACCOUNT DRILL DOWN
   * ============================================================ */
  static async getAccountDrillDown(accountId, orgId, { startDate, endDate, limit = 100 }) {
    const match = {
      organizationId: new mongoose.Types.ObjectId(orgId),
      accountId:      new mongoose.Types.ObjectId(accountId),
    };
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate)   match.date.$lte = new Date(endDate);
    }

    return AccountEntry.aggregate([
      { $match: match },
      { $sort: { date: -1, _id: -1 } },
      { $limit: Number(limit) },
    ]);
  }
}

module.exports = LedgerService;