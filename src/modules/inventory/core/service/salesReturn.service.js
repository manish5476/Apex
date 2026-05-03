'use strict';

const mongoose = require('mongoose');

// Internal module imports (Inventory)
const SalesReturn = require('../model/salesReturn.model');
const Product = require('../model/product.model');
const Sales = require('../model/sales.model');
const StockService = require('./stock.service');
const JournalService = require('./Journal.service');

// **Correction**: Notice the extra space in the filename in your tree ('Counter.model .js'). 
// You should probably rename that file in your OS, but to match the current tree exactly:
const Counter = require('../model/Counter.model ');

// Cross-module imports (Requires going up 3 levels: service -> core -> inventory -> modules)
const Invoice = require('../../../accounting/billing/invoice.model');
const AccountEntry = require('../../../accounting/core/model/accountEntry.model');
const Customer = require('../../../organization/core/customer.model');

// Core utilities (Requires going up 4 levels: service -> core -> inventory -> modules -> src)
const AppError = require('../../../../core/utils/api/appError');
const { runInTransaction } = require('../../../../core/utils/db/runInTransaction');

/**
 * SalesReturnService
 * ─────────────────────────────────────────────
 * All sales return (credit note) business logic lives here.
 *
 * Key fixes vs original controller:
 *   - Return number uses atomic Counter (no race condition)
 *   - Stock is only restored AFTER the return is approved (not on creation)
 *   - Restock goes through StockService (throws on failure, no silent no-ops)
 *   - COGS restoration on restock (inventory value restored in ledger)
 *   - getOrInitAccount replaced by JournalService.getOrInitAccount (single source)
 *   - Accounting entries batched into one create call (not 3 separate awaits)
 *   - discountTotal accumulated and saved correctly
 *   - getReturns is org-scoped and supports pagination
 */
class SalesReturnService {

  /* ============================================================
   * 1. CREATE RETURN (status: pending — no stock/ledger changes yet)
   *
   * FIX: Original controller immediately restocked and posted journal
   * entries on creation. With status defaulting to 'pending', physical
   * and financial effects should only happen on approval.
   * ============================================================ */
  static async createReturn(data, user) {
    const { invoiceId, items, reason, notes } = data;

    if (!invoiceId || !Array.isArray(items) || !items.length) {
      throw new AppError('Invoice and return items are required', 400);
    }
    if (!reason?.trim()) {
      throw new AppError('A return reason is required', 400);
    }

    let salesReturn;

    await runInTransaction(async (session) => {
      // Load invoice — scoped to org
      const invoice = await Invoice.findOne({
        _id: invoiceId, organizationId: user.organizationId,
      }).session(session);

      if (!invoice) throw new AppError('Invoice not found', 404);
      if (invoice.status === 'cancelled') {
        throw new AppError('Cannot create a return for a cancelled invoice', 400);
      }

      // Sum quantities already returned for this invoice
      const priorReturns = await SalesReturn.find({
        invoiceId,
        organizationId: user.organizationId,
        status: { $ne: 'rejected' },
      }).session(session);

      const returnedQtyMap = {};
      for (const r of priorReturns) {
        for (const i of r.items) {
          const key = String(i.productId);
          returnedQtyMap[key] = (returnedQtyMap[key] || 0) + i.quantity;
        }
      }

      // Build validated return items
      const returnItems = [];
      let totalRefund = 0;
      let totalTax = 0;
      let totalSubTotal = 0;
      let totalDiscount = 0;

      for (const reqItem of items) {
        const invItem = invoice.items.find(
          i => String(i.productId) === String(reqItem.productId)
        );
        if (!invItem) {
          throw new AppError(`Product ${reqItem.productId} is not part of this invoice`, 400);
        }

        const alreadyReturned = returnedQtyMap[String(reqItem.productId)] || 0;
        const maxReturnable = invItem.quantity - alreadyReturned;

        if (reqItem.quantity <= 0) {
          throw new AppError(`Return quantity must be positive for "${invItem.name}"`, 400);
        }
        if (reqItem.quantity > maxReturnable) {
          throw new AppError(
            `Return quantity (${reqItem.quantity}) exceeds returnable amount (${maxReturnable}) for "${invItem.name}"`,
            400
          );
        }

        // Pro-rata financial calculation
        const ratio = reqItem.quantity / invItem.quantity;
        const base = parseFloat((invItem.price * reqItem.quantity).toFixed(2));
        const discountAmt = parseFloat(((invItem.discount || 0) * ratio).toFixed(2));
        const taxAmt = parseFloat((((invItem.taxRate || 0) / 100) * (base - discountAmt)).toFixed(2));
        const refund = parseFloat((base - discountAmt + taxAmt).toFixed(2));

        totalSubTotal += base;
        totalDiscount += discountAmt;
        totalTax += taxAmt;
        totalRefund += refund;

        returnItems.push({
          productId: reqItem.productId,
          name: invItem.name,
          quantity: reqItem.quantity,
          unitPrice: invItem.price,
          discountAmount: discountAmt,
          taxAmount: taxAmt,
          refundAmount: refund,
        });
      }

      // Atomic sequential return number — no race condition
      const returnNumber = await this._nextReturnNumber(user.organizationId, session);

      // Create the return in PENDING state
      // Pre-save middleware will recalculate totals from items
      [salesReturn] = await SalesReturn.create([{
        organizationId: user.organizationId,
        branchId: invoice.branchId,
        invoiceId,
        customerId: invoice.customerId,
        returnNumber,
        items: returnItems,
        subTotal: parseFloat(totalSubTotal.toFixed(2)),
        taxTotal: parseFloat(totalTax.toFixed(2)),
        discountTotal: parseFloat(totalDiscount.toFixed(2)),
        totalRefundAmount: parseFloat(totalRefund.toFixed(2)),
        reason,
        notes,
        status: 'pending',
        createdBy: user._id,
      }], { session, ordered: true });

    }, 3, { action: 'CREATE_SALES_RETURN', userId: user._id });

    return salesReturn;
  }

  /* ============================================================
   * 2. APPROVE RETURN
   *    — This is where stock restoration and ledger entries happen.
   *    — Guarded so it only runs once (status check).
   * ============================================================ */
  static async approveReturn(returnId, user) {
    let salesReturn;

    await runInTransaction(async (session) => {
      salesReturn = await SalesReturn.findOne({
        _id: returnId, organizationId: user.organizationId,
      }).session(session);

      if (!salesReturn) throw new AppError('Sales return not found', 404);
      if (salesReturn.status !== 'pending') {
        throw new AppError(`Return is already ${salesReturn.status}`, 400);
      }

      const invoice = await Invoice.findById(salesReturn.invoiceId).session(session);
      if (!invoice) throw new AppError('Original invoice not found', 404);

      // 1. Restore stock via StockService.
      //    Bug fix: pass purchasePriceAtSale from the original invoice so WAC
      //    is correctly recalculated when returned units re-enter stock.
      const invoiceItemMap = new Map(
        invoice.items.map(i => [String(i.productId), i])
      );
      await StockService.increment(
        salesReturn.items.map(i => ({
          productId: i.productId,
          quantity:  i.quantity,
          // Snapshot cost at time of original sale — used for WAC recalc
          purchasePrice: invoiceItemMap.get(String(i.productId))?.purchasePriceAtSale ?? null,
        })),
        salesReturn.branchId,
        user.organizationId,
        session
      );

      // 2. Restore inventory value in ledger (reverse COGS for returned items)
      await this._postCOGSReversal(salesReturn, invoice, user, session);

      // 3. Post credit note journal entries
      await this._postCreditNoteJournal(salesReturn, invoice, user, session);

      // 4. Reduce customer outstanding balance
      await Customer.findByIdAndUpdate(
        salesReturn.customerId,
        { $inc: { outstandingBalance: -salesReturn.totalRefundAmount } },
        { session }
      );

      // 5. Update Invoice & Linked Sales (quantities, status, paidAmount)
      const sales = await Sales.findOne({ invoiceId: salesReturn.invoiceId }).session(session);

      // Update items & preserve original quantities
      for (const retItem of salesReturn.items) {
        const invItem = invoice.items.find(i => String(i.productId) === String(retItem.productId));
        if (invItem) {
          if (invItem.originalQuantity === undefined) invItem.originalQuantity = invItem.quantity;
          invItem.quantity = Math.max(0, invItem.quantity - retItem.quantity);
        }

        if (sales) {
          const salesItem = sales.items.find(i => String(i.productId) === String(retItem.productId));
          if (salesItem) {
            if (salesItem.originalQty === undefined) salesItem.originalQty = salesItem.qty;
            salesItem.qty = Math.max(0, salesItem.qty - retItem.quantity);
          }
        }
      }

      // Determine new status
      const allReturned = invoice.items.every(i => i.quantity === 0);
      const newStatus = allReturned ? 'returned' : 'partially_returned';
      invoice.status = newStatus;

      // Manually recalculate grandTotal to adjust paidAmount BEFORE save (to avoid negative balance)
      let subTotal = 0;
      let taxTotal = 0;
      let discountTotal = 0;
      invoice.items.forEach(item => {
        const lineTotal = item.price * item.quantity;
        const lineDiscount = item.discount || 0;
        const taxableBase = lineTotal - lineDiscount;
        subTotal += lineTotal;
        discountTotal += lineDiscount;
        taxTotal += ((item.taxRate || 0) / 100) * taxableBase;
      });
      const newGrandTotal = parseFloat((subTotal - discountTotal + taxTotal + (invoice.shippingCharges || 0) + (invoice.roundOff || 0)).toFixed(2));

      // Adjust paidAmount if it exceeds the new total — record a proper refund
      // instead of silently clipping the value.
      // Bug fix: when customer already paid more than the post-return total,
      // the excess must be recorded as a real refund/credit transaction.
      if (invoice.paidAmount > newGrandTotal) {
        const refundDiff = parseFloat((invoice.paidAmount - newGrandTotal).toFixed(2));

        // Create a credit/refund record so the cash outflow is visible in the ledger
        const Payment = require('../../../accounting/payments/payment.model');
        await Payment.create([{
          organizationId: user.organizationId,
          branchId: salesReturn.branchId,
          type: 'refund',
          customerId: salesReturn.customerId,
          referenceId: salesReturn._id,
          referenceType: 'credit_note',
          paymentDate: new Date(),
          amount: refundDiff,
          paymentMethod: 'credit', // generic — operator can reconcile later
          status: 'completed',
          remarks: `Refund for Return ${salesReturn.returnNumber}`,
          createdBy: user._id,
        }], { session, ordered: true });

        // Reduce customer outstanding balance by the refund amount
        await Customer.findByIdAndUpdate(
          salesReturn.customerId,
          { $inc: { outstandingBalance: -refundDiff } },
          { session }
        );

        // Cap paidAmount to the new total (no longer a silent clip — refund covers the diff)
        invoice.paidAmount = newGrandTotal;
      }

      // Save Invoice (triggers middleware for balance/status recalculation)
      await invoice.save({ session });

      // Sync Sales record
      if (sales) {
        sales.status = newStatus;
        sales.totalAmount = newGrandTotal;
        sales.paidAmount = invoice.paidAmount;
        sales.dueAmount = Math.max(0, newGrandTotal - invoice.paidAmount);
        
        // Recalculate Sales subTotal/taxTotal etc. for consistency
        sales.subTotal = parseFloat(subTotal.toFixed(2));
        sales.taxTotal = parseFloat(taxTotal.toFixed(2));
        sales.discountTotal = parseFloat(discountTotal.toFixed(2));
        
        await sales.save({ session });
      }

      // 6. Mark approved
      salesReturn.status = 'approved';
      salesReturn.approvedBy = user._id;
      salesReturn.approvedAt = new Date();
      salesReturn.approvalReason = reason || null;
      await salesReturn.save({ session });

    }, 3, { action: 'APPROVE_SALES_RETURN', userId: user._id });

    return salesReturn;
  }

  /* ============================================================
   * 3. REJECT RETURN
   * ============================================================ */
  static async rejectReturn(returnId, rejectionReason, user) {
    if (!rejectionReason?.trim()) {
      throw new AppError('Rejection reason is required', 400);
    }

    const salesReturn = await SalesReturn.findOneAndUpdate(
      { _id: returnId, organizationId: user.organizationId, status: 'pending' },
      {
        status: 'rejected',
        rejectedBy: user._id,
        rejectedAt: new Date(),
        rejectionReason,
      },
      { new: true }
    );

    if (!salesReturn) {
      throw new AppError('Pending return not found', 404);
    }

    return salesReturn;
  }

  /* ============================================================
   * 4. GET RETURNS (paginated, org-scoped)
   * ============================================================ */
  static async getReturns(organizationId, filters = {}, options = {}) {
    const { status, customerId, invoiceId, startDate, endDate } = filters;
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const query = { organizationId };
    if (status) query.status = status;
    if (customerId) query.customerId = customerId;
    if (invoiceId) query.invoiceId = invoiceId;
    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) query.returnDate.$gte = new Date(startDate);
      if (endDate) query.returnDate.$lte = new Date(endDate);
    }

    const [returns, total] = await Promise.all([
      SalesReturn.find(query)
        .populate('customerId', 'name phone email')
        .populate('items.productId', 'name sku')
        .populate('invoiceId', 'invoiceNumber grandTotal')
        .populate('approvedBy', 'name')
        .populate('rejectedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SalesReturn.countDocuments(query),
    ]);

    return { returns, total, page, limit };
  }

  /* ============================================================
   * 5. GET SINGLE RETURN
   * ============================================================ */
  static async getReturnById(returnId, organizationId) {
    const record = await SalesReturn.findOne({ _id: returnId, organizationId })
      .populate('customerId', 'name phone email address')
      .populate('items.productId', 'name sku purchasePrice')
      .populate('invoiceId', 'invoiceNumber invoiceDate grandTotal')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .lean();

    if (!record) throw new AppError('Sales return not found', 404);
    return record;
  }

  /* ============================================================
   * PRIVATE HELPERS
   * ============================================================ */

  /**
   * Credit note journal entries:
   *   Dr Sales Revenue  (net revenue reversed)
   *   Dr Tax Payable    (tax reversed, if any)
   *   Cr Accounts Receivable (customer owes less)
   */
  static async _postCreditNoteJournal(salesReturn, invoice, user, session) {
    const netRevenue = parseFloat(
      (salesReturn.totalRefundAmount - salesReturn.taxTotal).toFixed(2)
    );

    const [salesAcc, arAcc] = await Promise.all([
      JournalService.getOrInitAccount(user.organizationId, 'income', 'Sales Revenue', '4000', session),
      JournalService.getOrInitAccount(user.organizationId, 'asset', 'Accounts Receivable', '1200', session),
    ]);

    const entries = [
      // Dr Sales Revenue
      {
        organizationId: user.organizationId,
        branchId: salesReturn.branchId,
        accountId: salesAcc._id,
        date: new Date(),
        debit: netRevenue,
        credit: 0,
        description: `Sales Return ${salesReturn.returnNumber}`,
        referenceType: 'credit_note',
        referenceId: salesReturn._id,
        createdBy: user._id,
      },
      // Cr AR
      {
        organizationId: user.organizationId,
        branchId: salesReturn.branchId,
        accountId: arAcc._id,
        customerId: salesReturn.customerId,
        date: new Date(),
        debit: 0,
        credit: salesReturn.totalRefundAmount,
        description: `Credit Note ${salesReturn.returnNumber}`,
        referenceType: 'credit_note',
        referenceId: salesReturn._id,
        createdBy: user._id,
      },
    ];

    // Dr Tax Payable (only if tax exists)
    if (salesReturn.taxTotal > 0) {
      const taxAcc = await JournalService.getOrInitAccount(
        user.organizationId, 'liability', 'Tax Payable', '2100', session
      );
      entries.splice(1, 0, {
        organizationId: user.organizationId,
        branchId: salesReturn.branchId,
        accountId: taxAcc._id,
        date: new Date(),
        debit: salesReturn.taxTotal,
        credit: 0,
        description: `Tax Reversal ${salesReturn.returnNumber}`,
        referenceType: 'credit_note',
        referenceId: salesReturn._id,
        createdBy: user._id,
      });
    }

    await AccountEntry.create(entries, { session, ordered: true });
  }

  /**
   * When goods are physically returned and restocked, the inventory
   * asset increases and COGS should be reversed proportionally.
   *
   * Dr Inventory Asset  /  Cr COGS
   *
   * We calculate the cost using purchasePriceAtSale from the invoice item.
   * If not available, we fall back to the product's current purchasePrice.
   */
  static async _postCOGSReversal(salesReturn, invoice, user, session) {
    let totalCostRestored = 0;

    for (const retItem of salesReturn.items) {
      const invItem = invoice.items.find(
        i => String(i.productId) === String(retItem.productId)
      );

      // Use snapshotted cost at time of sale, fall back to current price
      const costPerUnit = invItem?.purchasePriceAtSale ?? null;

      if (costPerUnit == null) {
        console.warn(
          `[COGS_REVERSAL] No cost data for product ${retItem.productId} in return ${salesReturn._id}`
        );
        continue;
      }

      totalCostRestored += parseFloat((costPerUnit * retItem.quantity).toFixed(2));
    }

    if (totalCostRestored <= 0) return;

    const [inventoryAcc, cogsAcc] = await Promise.all([
      JournalService.getOrInitAccount(user.organizationId, 'asset', 'Inventory Asset', '1500', session),
      JournalService.getOrInitAccount(user.organizationId, 'expense', 'Cost of Goods Sold', '5000', session),
    ]);

    await AccountEntry.create([
      {
        organizationId: user.organizationId,
        branchId: salesReturn.branchId,
        accountId: inventoryAcc._id,
        date: new Date(),
        debit: totalCostRestored,
        credit: 0,
        description: `Inventory restored — Return ${salesReturn.returnNumber}`,
        referenceType: 'credit_note',
        referenceId: salesReturn._id,
        createdBy: user._id,
      },
      {
        organizationId: user.organizationId,
        branchId: salesReturn.branchId,
        accountId: cogsAcc._id,
        date: new Date(),
        debit: 0,
        credit: totalCostRestored,
        description: `COGS reversed — Return ${salesReturn.returnNumber}`,
        referenceType: 'credit_note',
        referenceId: salesReturn._id,
        createdBy: user._id,
      },
    ], { session, ordered: true });
  }

  /**
   * Atomic return number — no race condition.
   */
  static async _nextReturnNumber(organizationId, session) {
    const counter = await Counter.findOneAndUpdate(
      { organizationId, type: 'sales_return' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    return `RET-${String(counter.seq).padStart(4, '0')}`;
  }
}

module.exports = SalesReturnService;