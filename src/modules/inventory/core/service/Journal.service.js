'use strict';

const Account     = require('../../../accounting/core/model/account.model');
const AccountEntry = require('../../../accounting/core/model/accountEntry.model');
const AppError     = require('../../../../core/utils/api/appError');

/**
 * JournalService
 * ─────────────────────────────────────────────
 * Single owner of ALL AccountEntry (double-entry ledger) writes.
 * Every debit/credit pair goes through here so the chart of accounts
 * stays consistent and the "getOrInitAccount" logic lives in one place.
 *
 * Account code conventions used across the system:
 *   1001  Cash
 *   1002  Bank
 *   1003  UPI Receivables
 *   1004  Card Receivables
 *   1200  Accounts Receivable (AR)
 *   1500  Inventory Asset
 *   2000  Accounts Payable (AP)
 *   3000  Opening Balance Equity
 *   4000  Sales Revenue
 *   4900  Inventory Gain
 *   5000  Cost of Goods Sold (COGS)
 *   5100  Inventory Shrinkage / Loss
 */
class JournalService {

  /* ============================================================
   * ACCOUNT HELPERS
   * ============================================================ */

  /**
   * Atomic find-or-create for a ledger account.
   * Uses findOneAndUpdate with $setOnInsert to prevent race conditions
   * when parallel requests try to create the same account code.
   */
  static async getOrInitAccount(orgId, type, name, code, session = null) {
    const opts = { upsert: true, new: true };
    if (session) opts.session = session;

    const account = await Account.findOneAndUpdate(
      { organizationId: orgId, code },
      {
        $setOnInsert: {
          organizationId: orgId,
          name,
          code,
          type,
          isGroup:    false,
          isActive:   true,
          cachedBalance: 0,
        },
      },
      opts
    );

    return account;
  }

  /**
   * Resolve the asset account (Cash / Bank / UPI / Card) from paymentMethod string.
   */
  static async getPaymentAssetAccount(orgId, paymentMethod, session = null) {
    const map = {
      cash:   { name: 'Cash',             code: '1001', type: 'asset' },
      bank:   { name: 'Bank',             code: '1002', type: 'asset' },
      cheque: { name: 'Bank',             code: '1002', type: 'asset' },
      upi:    { name: 'UPI Receivables',  code: '1003', type: 'asset' },
      card:   { name: 'Card Receivables', code: '1004', type: 'asset' },
    };
    const def = map[paymentMethod] || { name: 'Other Payment Account', code: '1009', type: 'asset' };
    return this.getOrInitAccount(orgId, def.type, def.name, def.code, session);
  }

  /* ============================================================
   * 1. PURCHASE JOURNAL
   *    Dr Inventory Asset  /  Cr Accounts Payable
   * ============================================================ */
  static async postPurchaseJournal({ orgId, branchId, purchase, supplierId, userId, session }) {
    const [inventoryAcc, apAcc] = await Promise.all([
      this.getOrInitAccount(orgId, 'asset',     'Inventory Asset',    '1500', session),
      this.getOrInitAccount(orgId, 'liability', 'Accounts Payable',   '2000', session),
    ]);

    await this._createEntries([
      {
        organizationId: orgId,
        branchId,
        accountId:     inventoryAcc._id,
        date:          purchase.purchaseDate || new Date(),
        debit:         purchase.grandTotal,
        credit:        0,
        description:   `Purchase: ${purchase.invoiceNumber}`,
        referenceType: 'purchase',
        referenceId:   purchase._id,
        supplierId,
        createdBy:     userId,
      },
      {
        organizationId: orgId,
        branchId,
        accountId:     apAcc._id,
        date:          purchase.purchaseDate || new Date(),
        debit:         0,
        credit:        purchase.grandTotal,
        description:   `Bill: ${purchase.invoiceNumber}`,
        referenceType: 'purchase',
        referenceId:   purchase._id,
        supplierId,
        createdBy:     userId,
      },
    ], session);
  }

  /* ============================================================
   * 2. PURCHASE REVERSAL JOURNAL (cancellation / full return)
   *    Dr Accounts Payable  /  Cr Inventory Asset
   * ============================================================ */
  static async reversePurchaseJournal({ orgId, branchId, purchase, supplierId, userId, session }) {
    const [inventoryAcc, apAcc] = await Promise.all([
      this.getOrInitAccount(orgId, 'asset',     'Inventory Asset',  '1500', session),
      this.getOrInitAccount(orgId, 'liability', 'Accounts Payable', '2000', session),
    ]);

    await this._createEntries([
      {
        organizationId: orgId,
        branchId,
        accountId:     apAcc._id,
        date:          new Date(),
        debit:         purchase.grandTotal,
        credit:        0,
        description:   `Purchase Cancelled: ${purchase.invoiceNumber}`,
        referenceType: 'purchase_return',
        referenceId:   purchase._id,
        supplierId,
        createdBy:     userId,
      },
      {
        organizationId: orgId,
        branchId,
        accountId:     inventoryAcc._id,
        date:          new Date(),
        debit:         0,
        credit:        purchase.grandTotal,
        description:   `Inventory Returned: ${purchase.invoiceNumber}`,
        referenceType: 'purchase_return',
        referenceId:   purchase._id,
        supplierId,
        createdBy:     userId,
      },
    ], session);
  }

  /* ============================================================
   * 3. PARTIAL RETURN JOURNAL
   *    Dr Accounts Payable  /  Cr Inventory Asset
   * ============================================================ */
  static async postPartialReturnJournal({ orgId, branchId, purchase, returnAmount, supplierId, userId, session }) {
    const [inventoryAcc, apAcc] = await Promise.all([
      this.getOrInitAccount(orgId, 'asset',     'Inventory Asset',  '1500', session),
      this.getOrInitAccount(orgId, 'liability', 'Accounts Payable', '2000', session),
    ]);

    await this._createEntries([
      {
        organizationId: orgId,
        branchId,
        accountId:     apAcc._id,
        date:          new Date(),
        debit:         returnAmount,
        credit:        0,
        description:   `Partial Return: ${purchase.invoiceNumber}`,
        referenceType: 'purchase_return',
        referenceId:   purchase._id,
        supplierId,
        createdBy:     userId,
      },
      {
        organizationId: orgId,
        branchId,
        accountId:     inventoryAcc._id,
        date:          new Date(),
        debit:         0,
        credit:        returnAmount,
        description:   `Inventory Returned: ${purchase.invoiceNumber}`,
        referenceType: 'purchase_return',
        referenceId:   purchase._id,
        supplierId,
        createdBy:     userId,
      },
    ], session);
  }

  /* ============================================================
   * 4. PAYMENT JOURNAL (outflow — paying a supplier)
   *    Dr Accounts Payable  /  Cr Cash|Bank
   * ============================================================ */
  static async postSupplierPaymentJournal({ orgId, branchId, payment, supplierId, invoiceNumber, userId, session }) {
    const [assetAcc, apAcc] = await Promise.all([
      this.getPaymentAssetAccount(orgId, payment.paymentMethod, session),
      this.getOrInitAccount(orgId, 'liability', 'Accounts Payable', '2000', session),
    ]);

    await this._createEntries([
      {
        organizationId: orgId,
        branchId,
        accountId:     apAcc._id,
        date:          payment.paymentDate,
        debit:         payment.amount,
        credit:        0,
        description:   `Payment to Supplier: ${invoiceNumber}`,
        referenceType: 'payment',
        referenceId:   payment._id,
        supplierId,
        createdBy:     userId,
      },
      {
        organizationId: orgId,
        branchId,
        accountId:     assetAcc._id,
        date:          payment.paymentDate,
        debit:         0,
        credit:        payment.amount,
        description:   `Payment Outflow (Ref: ${payment.referenceNumber || 'N/A'})`,
        referenceType: 'payment',
        referenceId:   payment._id,
        supplierId,
        createdBy:     userId,
      },
    ], session);
  }

  /* ============================================================
   * 5. PAYMENT REVERSAL (delete a supplier payment)
   *    Dr Cash|Bank  /  Cr Accounts Payable
   * ============================================================ */
  static async reverseSupplierPaymentJournal({ orgId, payment, session }) {
    await AccountEntry.deleteMany({
      referenceId:   payment._id,
      referenceType: 'payment',
      organizationId: orgId,
    }).session(session);
  }

  /* ============================================================
   * 6. STOCK ADJUSTMENT JOURNAL
   *    Add:      Dr Inventory  /  Cr Inventory Gain
   *    Subtract: Dr Inventory Shrinkage  /  Cr Inventory
   * ============================================================ */
  static async postStockAdjustmentJournal({ orgId, branchId, product, quantity, type, reason, userId, session }) {
    const costValue = quantity * (product.purchasePrice || 0);
    if (costValue <= 0) return; // nothing to book

    const inventoryAcc = await this.getOrInitAccount(orgId, 'asset', 'Inventory Asset', '1500', session);

    if (type === 'add') {
      const gainAcc = await this.getOrInitAccount(orgId, 'other_income', 'Inventory Gain', '4900', session);
      await this._createEntries([
        {
          organizationId: orgId, branchId, accountId: inventoryAcc._id,
          date: new Date(), debit: costValue, credit: 0,
          description: `Inventory Increase: ${product.name}`,
          referenceType: 'journal', referenceId: product._id, createdBy: userId,
        },
        {
          organizationId: orgId, branchId, accountId: gainAcc._id,
          date: new Date(), debit: 0, credit: costValue,
          description: `Stock Gain: ${reason}`,
          referenceType: 'journal', referenceId: product._id, createdBy: userId,
        },
      ], session);
    } else {
      const lossAcc = await this.getOrInitAccount(orgId, 'expense', 'Inventory Shrinkage', '5100', session);
      await this._createEntries([
        {
          organizationId: orgId, branchId, accountId: lossAcc._id,
          date: new Date(), debit: costValue, credit: 0,
          description: `Stock Loss: ${reason}`,
          referenceType: 'journal', referenceId: product._id, createdBy: userId,
        },
        {
          organizationId: orgId, branchId, accountId: inventoryAcc._id,
          date: new Date(), debit: 0, credit: costValue,
          description: `Inventory Reduction: ${product.name}`,
          referenceType: 'journal', referenceId: product._id, createdBy: userId,
        },
      ], session);
    }
  }

  /* ============================================================
   * 7. OPENING STOCK JOURNAL
   *    Dr Inventory Asset  /  Cr Opening Balance Equity
   * ============================================================ */
  static async postOpeningStockJournal({ orgId, branchId, product, stockValue, userId, session }) {
    if (stockValue <= 0) return;

    const [inventoryAcc, equityAcc] = await Promise.all([
      this.getOrInitAccount(orgId, 'asset',  'Inventory Asset',       '1500', session),
      this.getOrInitAccount(orgId, 'equity', 'Opening Balance Equity', '3000', session),
    ]);

    await this._createEntries([
      {
        organizationId: orgId, branchId, accountId: inventoryAcc._id,
        date: new Date(), debit: stockValue, credit: 0,
        description:   `Opening Stock: ${product.name}`,
        referenceType: 'opening_stock', referenceId: product._id, createdBy: userId,
      },
      {
        organizationId: orgId, branchId, accountId: equityAcc._id,
        date: new Date(), debit: 0, credit: stockValue,
        description:   `Opening Stock Equity: ${product.name}`,
        referenceType: 'opening_stock', referenceId: product._id, createdBy: userId,
      },
    ], session);
  }

  /* ============================================================
   * 8. COGS JOURNAL (sale created)
   *    Dr Cost of Goods Sold  /  Cr Inventory Asset
   * ============================================================ */
  static async postCOGSJournal({ orgId, branchId, sale, totalCogs, userId, session }) {
    if (totalCogs <= 0) return;

    const [cogsAcc, inventoryAcc] = await Promise.all([
      this.getOrInitAccount(orgId, 'expense', 'Cost of Goods Sold', '5000', session),
      this.getOrInitAccount(orgId, 'asset',   'Inventory Asset',    '1500', session),
    ]);

    await this._createEntries([
      {
        organizationId: orgId, branchId, accountId: cogsAcc._id,
        date:           new Date(), debit: totalCogs, credit: 0,
        description:    `COGS for Sale ${sale.invoiceNumber || sale._id}`,
        referenceType:  'journal', referenceId: sale._id, createdBy: userId,
      },
      {
        organizationId: orgId, branchId, accountId: inventoryAcc._id,
        date:           new Date(), debit: 0, credit: totalCogs,
        description:    `Inventory reduction for Sale ${sale.invoiceNumber || sale._id}`,
        referenceType:  'journal', referenceId: sale._id, createdBy: userId,
      },
    ], session);
  }

  /* ============================================================
   * 9. REVERSE COGS JOURNAL (sale cancelled)
   *    Dr Inventory Asset  /  Cr Cost of Goods Sold
   * ============================================================ */
  static async reverseCOGSJournal({ orgId, branchId, sale, totalCogs, userId, session }) {
    if (totalCogs <= 0) return;

    const [cogsAcc, inventoryAcc] = await Promise.all([
      this.getOrInitAccount(orgId, 'expense', 'Cost of Goods Sold', '5000', session),
      this.getOrInitAccount(orgId, 'asset',   'Inventory Asset',    '1500', session),
    ]);

    await this._createEntries([
      {
        organizationId: orgId, branchId, accountId: inventoryAcc._id,
        date:           new Date(), debit: totalCogs, credit: 0,
        description:    `Stock restored — Sale Cancelled ${sale.invoiceNumber || sale._id}`,
        referenceType:  'journal', referenceId: sale._id, createdBy: userId,
      },
      {
        organizationId: orgId, branchId, accountId: cogsAcc._id,
        date:           new Date(), debit: 0, credit: totalCogs,
        description:    `COGS reversed — Sale Cancelled ${sale.invoiceNumber || sale._id}`,
        referenceType:  'journal', referenceId: sale._id, createdBy: userId,
      },
    ], session);
  }

  /* ============================================================
   * 10. DELETE ENTRIES BY REFERENCE (used in update/cancel flows)
   * ============================================================ */
  static async deleteByReference({ orgId, referenceId, referenceType, session }) {
    await AccountEntry.deleteMany({
      organizationId: orgId,
      referenceId,
      referenceType,
    }).session(session);
  }

  /* ============================================================
   * PRIVATE: bulk insert with ordered: true
   * ============================================================ */
  static async _createEntries(entries, session) {
    const opts = { ordered: true };
    if (session) opts.session = session;
    await AccountEntry.create(entries, opts);
  }
}

module.exports = JournalService;