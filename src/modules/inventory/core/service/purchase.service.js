'use strict';

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

// Internal module imports (Inventory - going up one level to the 'model' folder)
const Purchase = require('../model/purchase.model');
const PurchaseReturn = require('../model/purchase.return.model');
const Product = require('../model/product.model');
const Counter = require('../model/Counter.model '); // Notice the space matching your tree

// Cross-module imports (Requires going up 3 levels: service -> core -> inventory -> modules)
const Supplier = require('../../../organization/core/supplier.model');
const Payment = require('../../../accounting/payments/payment.model');

// Same folder imports (Inventory Services)
const StockService = require('./stock.service');
const JournalService = require('./Journal.service');

// Core utilities (Requires going up 4 levels: service -> core -> inventory -> modules -> src)
const AppError = require('../../../../core/utils/api/appError');
const { runInTransaction } = require('../../../../core/utils/db/runInTransaction');

/**
 * PurchaseService
 * ─────────────────────────────────────────────
 * All purchase business logic lives here.
 * The controller is only responsible for:
 *   - Parsing / validating HTTP input
 *   - Calling service methods
 *   - Sending HTTP responses
 */
class PurchaseService {

  /* ============================================================
   * 1. CREATE PURCHASE
   * ============================================================ */
  static async createPurchase(data, user) {
    const {
      supplierId, invoiceNumber, purchaseDate, dueDate,
      notes, status = 'received', paymentMethod = 'cash',
      paidAmount: rawPaid = 0, items: rawItems, files = [],
    } = data;

    // ── Enrich & calculate ──────────────────────────────────────
    const { enrichedItems, subTotal, totalTax, totalDiscount, grandTotal } =
      await this._enrichAndCalculate(rawItems, user.organizationId);

    const paidAmount = Number(rawPaid);
    if (paidAmount > grandTotal) {
      throw new AppError(
        `Paid amount (${paidAmount}) cannot exceed grand total (${grandTotal})`, 400
      );
    }

    let purchase;

    await runInTransaction(async (session) => {

      // ── Supplier snapshot ───────────────────────────────────
      const supplier = await Supplier.findById(supplierId).session(session).lean();
      if (!supplier) throw new AppError('Supplier not found', 404);

      const supplierSnapshot = {
        name: supplier.companyName || supplier.name,
        address: supplier.address,
        gstNumber: supplier.gstNumber,
        email: supplier.email,
      };

      // ── Determine payment status ────────────────────────────
      let paymentStatus = 'unpaid';
      if (paidAmount >= grandTotal) paymentStatus = 'paid';
      else if (paidAmount > 0) paymentStatus = 'partial';

      // ── Create Purchase document ────────────────────────────
      [purchase] = await Purchase.create([{
        organizationId: user.organizationId,
        branchId: user.branchId,
        supplierId,
        supplierSnapshot,
        invoiceNumber: invoiceNumber || await this._nextPurchaseNumber(user.organizationId, session),
        purchaseDate: purchaseDate || new Date(),
        dueDate,
        items: enrichedItems,
        subTotal,
        totalTax,
        totalDiscount,
        grandTotal,
        paidAmount,
        balanceAmount: parseFloat((grandTotal - paidAmount).toFixed(2)),
        paymentStatus,
        paymentMethod,
        status,
        notes,
        attachedFiles: files,
        createdBy: user._id,
      }], { session, ordered: true });

      // ── Stock (only if received) ────────────────────────────
      if (status === 'received') {
        await StockService.increment(enrichedItems, user.branchId, user.organizationId, session);
        await Supplier.findByIdAndUpdate(
          supplierId,
          { $inc: { outstandingBalance: grandTotal } },
          { session }
        );

        // ── Purchase journal ──────────────────────────────────
        await JournalService.postPurchaseJournal({
          orgId: user.organizationId, branchId: user.branchId,
          purchase, supplierId, userId: user._id, session,
        });
      }

      // ── Initial payment ─────────────────────────────────────
      if (paidAmount > 0 && status === 'received') {
        await this._recordPaymentInternal({
          orgId: user.organizationId,
          branchId: user.branchId,
          purchase,
          amount: paidAmount,
          paymentMethod,
          reference: data.referenceNumber,
          notes: `Initial Payment for ${purchase.invoiceNumber}`,
          userId: user._id,
          session,
          updatePurchase: false, // already set above
        });
      }

    }, 3, { action: 'CREATE_PURCHASE', userId: user._id });

    return purchase;
  }

  /* ============================================================
   * 2. UPDATE PURCHASE
   * ============================================================ */
  static async updatePurchase(purchaseId, data, user) {
    let updatedPurchase;

    await runInTransaction(async (session) => {
      const old = await Purchase.findOne({
        _id: purchaseId, organizationId: user.organizationId,
      }).session(session);

      if (!old) throw new AppError('Purchase not found', 404);
      if (old.status === 'cancelled') throw new AppError('Cancelled purchase cannot be edited', 400);

      const hasFinancialChange = data.items || data.discount !== undefined || data.tax !== undefined;

      // ── Non-financial update (notes, dueDate, etc.) ─────────
      if (!hasFinancialChange) {
        const SAFE_FIELDS = ['notes', 'dueDate', 'paymentMethod', 'attachedFiles', 'invoiceNumber'];
        const safeUpdate = {};
        for (const key of SAFE_FIELDS) {
          if (data[key] !== undefined) safeUpdate[key] = data[key];
        }
        updatedPurchase = await Purchase.findByIdAndUpdate(old._id, safeUpdate, { new: true, session });
        return;
      }

      // ── Financial update — require no payments ────────────── 
      if (old.paidAmount > 0) {
        throw new AppError(
          'Cannot edit financial details of a purchase that already has payments. ' +
          'Delete the payment first or cancel and recreate.', 400
        );
      }

      // ── A. Reverse old state ────────────────────────────────
      if (old.status === 'received') {
        await StockService.decrement(old.items, old.branchId, user.organizationId, session);
        await Supplier.findByIdAndUpdate(
          old.supplierId,
          { $inc: { outstandingBalance: -old.grandTotal } },
          { session }
        );
        await JournalService.deleteByReference({
          orgId: user.organizationId, referenceId: old._id,
          referenceType: 'purchase', session,
        });
      }

      // ── B. Enrich & calculate new items ─────────────────────
      const newRawItems = typeof data.items === 'string' ? JSON.parse(data.items) : data.items;
      const { enrichedItems, subTotal, totalTax, totalDiscount, grandTotal } =
        await this._enrichAndCalculate(newRawItems, user.organizationId, session);

      // ── C. Save updated purchase ────────────────────────────
      Object.assign(old, data, {
        items: enrichedItems,
        subTotal,
        totalTax,
        totalDiscount,
        grandTotal,
        balanceAmount: parseFloat(grandTotal.toFixed(2)),
        paymentStatus: 'unpaid',
        paidAmount: 0,
      });
      updatedPurchase = await old.save({ session });

      // ── D. Re-apply stock & accounting ──────────────────────
      if (updatedPurchase.status === 'received') {
        await StockService.increment(enrichedItems, user.branchId, user.organizationId, session);
        await Supplier.findByIdAndUpdate(
          updatedPurchase.supplierId,
          { $inc: { outstandingBalance: grandTotal } },
          { session }
        );
        await JournalService.postPurchaseJournal({
          orgId: user.organizationId, branchId: user.branchId,
          purchase: updatedPurchase, supplierId: updatedPurchase.supplierId,
          userId: user._id, session,
        });
      }

    }, 3, { action: 'UPDATE_PURCHASE', userId: user._id });

    return updatedPurchase;
  }

  /* ============================================================
   * 3. CANCEL PURCHASE
   * ============================================================ */
  static async cancelPurchase(purchaseId, reason, user) {
    await runInTransaction(async (session) => {
      const purchase = await Purchase.findOne({
        _id: purchaseId, organizationId: user.organizationId,
      }).session(session);

      if (!purchase) throw new AppError('Purchase not found', 404);
      if (purchase.status === 'cancelled') throw new AppError('Already cancelled', 400);
      if (purchase.paidAmount > 0) {
        throw new AppError(
          'Cannot cancel a purchase with recorded payments. Delete payments first.', 400
        );
      }

      // ── Validate current stock is sufficient to reverse ─────
      if (purchase.status === 'received') {
        await StockService.validateAvailability(
          purchase.items, purchase.branchId, user.organizationId, session
        );

        await StockService.decrement(purchase.items, purchase.branchId, user.organizationId, session);

        await Supplier.findByIdAndUpdate(
          purchase.supplierId,
          { $inc: { outstandingBalance: -purchase.grandTotal } },
          { session }
        );

        await JournalService.reversePurchaseJournal({
          orgId: user.organizationId, branchId: purchase.branchId,
          purchase, supplierId: purchase.supplierId, userId: user._id, session,
        });
      }

      purchase.status = 'cancelled';
      purchase.notes = `${purchase.notes || ''}\nCancelled on ${new Date().toLocaleDateString()}: ${reason}`;
      await purchase.save({ session });

    }, 3, { action: 'CANCEL_PURCHASE', userId: user._id });
  }

  /* ============================================================
   * 4. UPDATE STATUS  (draft → received, received → cancelled)
   * ============================================================ */
  static async updateStatus(purchaseId, newStatus, notes, user) {
    const VALID = ['draft', 'received', 'cancelled'];
    if (!VALID.includes(newStatus)) {
      throw new AppError(`Invalid status. Must be one of: ${VALID.join(', ')}`, 400);
    }

    await runInTransaction(async (session) => {
      const purchase = await Purchase.findOne({
        _id: purchaseId, organizationId: user.organizationId,
      }).session(session);

      if (!purchase) throw new AppError('Purchase not found', 404);
      if (purchase.status === newStatus) return;

      const from = purchase.status;
      const to = newStatus;

      // draft → received
      if (from === 'draft' && to === 'received') {
        await StockService.increment(purchase.items, purchase.branchId, user.organizationId, session);
        await Supplier.findByIdAndUpdate(
          purchase.supplierId,
          { $inc: { outstandingBalance: purchase.grandTotal } },
          { session }
        );
        await JournalService.postPurchaseJournal({
          orgId: user.organizationId, branchId: purchase.branchId,
          purchase, supplierId: purchase.supplierId, userId: user._id, session,
        });
      }

      // received → cancelled
      else if (from === 'received' && to === 'cancelled') {
        if (purchase.paidAmount > 0) {
          throw new AppError('Cannot cancel a purchase that has payments.', 400);
        }
        await StockService.validateAvailability(
          purchase.items, purchase.branchId, user.organizationId, session
        );
        await StockService.decrement(purchase.items, purchase.branchId, user.organizationId, session);
        await Supplier.findByIdAndUpdate(
          purchase.supplierId,
          { $inc: { outstandingBalance: -purchase.grandTotal } },
          { session }
        );
        await JournalService.reversePurchaseJournal({
          orgId: user.organizationId, branchId: purchase.branchId,
          purchase, supplierId: purchase.supplierId, userId: user._id, session,
        });
      }

      purchase.status = to;
      if (notes) {
        purchase.notes = `${purchase.notes || ''}\nStatus: ${to} — ${notes}`;
      }
      await purchase.save({ session });

    }, 3, { action: 'UPDATE_STATUS', userId: user._id });
  }

  /* ============================================================
   * 5. RECORD PAYMENT
   * ============================================================ */
  static async recordPayment(purchaseId, paymentData, user) {
    const { amount: rawAmount, paymentMethod = 'cash', date, reference, notes } = paymentData;
    const amount = Number(rawAmount);

    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new AppError('Valid payment amount is required', 400);
    }

    await runInTransaction(async (session) => {
      const purchase = await Purchase.findOne({
        _id: purchaseId, organizationId: user.organizationId,
      }).session(session);

      if (!purchase) throw new AppError('Purchase not found', 404);
      if (purchase.status === 'cancelled') throw new AppError('Cannot pay a cancelled purchase', 400);

      const newTotal = parseFloat(((purchase.paidAmount || 0) + amount).toFixed(2));
      if (newTotal > purchase.grandTotal + 0.01) {
        throw new AppError(
          `Payment of ${amount} exceeds remaining balance of ${purchase.grandTotal - purchase.paidAmount}`,
          400
        );
      }

      await this._recordPaymentInternal({
        orgId: user.organizationId, branchId: user.branchId,
        purchase, amount, paymentMethod,
        reference, notes, userId: user._id,
        date: date || new Date(),
        session,
        updatePurchase: true,
      });

    }, 3, { action: 'RECORD_PAYMENT', userId: user._id });
  }

  /* ============================================================
   * 6. DELETE PAYMENT
   * ============================================================ */
  static async deletePayment(purchaseId, paymentId, user) {
    await runInTransaction(async (session) => {
      const payment = await (require('../../../../accounting/payments/payment.model'))
        .findOne({ _id: paymentId, purchaseId, organizationId: user.organizationId })
        .session(session);

      if (!payment) throw new AppError('Payment not found', 404);

      const purchase = await Purchase.findById(purchaseId).session(session);
      if (!purchase) throw new AppError('Purchase not found', 404);

      // Reverse purchase document
      const newPaid = Math.max(0, Math.round((purchase.paidAmount - payment.amount) * 100) / 100);
      const newBalance = Math.round((purchase.grandTotal - newPaid) * 100) / 100;

      purchase.paidAmount = newPaid;
      purchase.balanceAmount = newBalance;
      purchase.paymentStatus = newPaid <= 0 ? 'unpaid' : 'partial';
      purchase.notes = `${purchase.notes || ''}\nPayment of ${payment.amount} deleted`;
      await purchase.save({ session });

      // Restore supplier balance
      await Supplier.findByIdAndUpdate(
        purchase.supplierId,
        { $inc: { outstandingBalance: payment.amount } },
        { session }
      );

      // Delete ledger entries
      await JournalService.reverseSupplierPaymentJournal({
        orgId: user.organizationId, payment, session,
      });

      // Delete payment doc
      await payment.deleteOne({ session });

    }, 3, { action: 'DELETE_PAYMENT', userId: user._id });
  }

  /* ============================================================
   * 7. PARTIAL RETURN
   * ============================================================ */
  static async partialReturn(purchaseId, { items: retItems, reason }, user) {
    if (!retItems?.length) {
      throw new AppError('A valid array of items is required', 400);
    }
    if (!reason?.trim()) {
      throw new AppError('A return reason is required for the audit trail', 400);
    }

    await runInTransaction(async (session) => {
      const purchase = await Purchase.findById(purchaseId).session(session);
      if (!purchase) throw new AppError('Purchase not found', 404);

      let totalReturnAmount = 0;
      const returnItems = [];

      for (const retItem of retItems) {
        // A. Validate against original invoice
        const original = purchase.items.find(
          i => String(i.productId) === String(retItem.productId)
        );
        if (!original || original.quantity < retItem.quantity) {
          throw new AppError(
            `Return quantity for product ${retItem.productId} exceeds purchased amount`, 400
          );
        }

        // B. Validate physical stock at branch
        const available = await StockService.getAvailable(
          retItem.productId, purchase.branchId, user.organizationId, session
        );
        if (available < retItem.quantity) {
          throw new AppError(
            `Cannot return ${retItem.quantity} units of "${original.name}". ` +
            `Current branch stock is only ${available}. Items may have been sold.`, 400
          );
        }

        // C. Financial value (proportional)
        const itemBase = original.purchasePrice * retItem.quantity;
        const itemTax = ((original.taxRate || 0) / 100) * itemBase;
        const itemTotal = parseFloat((itemBase + itemTax).toFixed(2));

        totalReturnAmount += itemTotal;
        returnItems.push({
          productId: retItem.productId,
          name: original.name,
          quantity: retItem.quantity,
          returnPrice: original.purchasePrice,
          total: itemTotal,
        });
      }

      // D. Create return record
      await PurchaseReturn.create([{
        organizationId: user.organizationId,
        branchId: user.branchId,
        purchaseId: purchase._id,
        supplierId: purchase.supplierId,
        items: returnItems,
        totalAmount: parseFloat(totalReturnAmount.toFixed(2)),
        reason,
        createdBy: user._id,
      }], { session, ordered: true });

      // E. Remove stock
      await StockService.decrement(returnItems, purchase.branchId, user.organizationId, session);

      // F. Reduce supplier balance
      await Supplier.findByIdAndUpdate(
        purchase.supplierId,
        { $inc: { outstandingBalance: -totalReturnAmount } },
        { session }
      );

      // G. Accounting
      await JournalService.postPartialReturnJournal({
        orgId: user.organizationId, branchId: user.branchId,
        purchase, returnAmount: totalReturnAmount,
        supplierId: purchase.supplierId, userId: user._id, session,
      });

      // H. Update purchase totals (do NOT mutate original quantities)
      purchase.grandTotal = parseFloat((purchase.grandTotal - totalReturnAmount).toFixed(2));
      purchase.balanceAmount = parseFloat((purchase.grandTotal - purchase.paidAmount).toFixed(2));
      purchase.notes = `${purchase.notes || ''}\nPartial Return: -${totalReturnAmount} (${reason})`;

      if (purchase.grandTotal <= 0) purchase.status = 'cancelled';

      await purchase.save({ session });

    }, 3, { action: 'PARTIAL_RETURN', userId: user._id });
  }

  /* ============================================================
   * 8. BULK UPDATE (safe fields only)
   * ============================================================ */
  static async bulkUpdate(ids, updates, user) {
    const BLOCKED = ['items', 'grandTotal', 'paidAmount', 'balanceAmount', 'status', 'organizationId'];
    for (const field of BLOCKED) {
      if (field in updates) {
        throw new AppError(`Cannot bulk update field: '${field}'`, 400);
      }
    }

    const result = await Purchase.updateMany(
      { _id: { $in: ids }, organizationId: user.organizationId },
      updates,
      { runValidators: true }
    );

    return { modifiedCount: result.modifiedCount };
  }

  /* ============================================================
   * 9. GET ANALYTICS
   * ============================================================ */
  static async getAnalytics(filters, user) {
    const match = {
      organizationId: new mongoose.Types.ObjectId(user.organizationId),
      branchId: new mongoose.Types.ObjectId(user.branchId),
      isDeleted: false,
    };

    if (filters.startDate || filters.endDate) {
      match.purchaseDate = {};
      if (filters.startDate) match.purchaseDate.$gte = new Date(filters.startDate);
      if (filters.endDate) match.purchaseDate.$lte = new Date(filters.endDate);
    }
    if (filters.supplierId) match.supplierId = new mongoose.Types.ObjectId(filters.supplierId);
    if (filters.status) match.status = filters.status;

    const [summary, statusCounts, monthlyTrends] = await Promise.all([
      Purchase.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: 1 },
            totalAmount: { $sum: '$grandTotal' },
            totalPaid: { $sum: '$paidAmount' },
            totalBalance: { $sum: '$balanceAmount' },
            avgPurchaseAmount: { $avg: '$grandTotal' },
          },
        },
        {
          $project: {
            _id: 0, totalPurchases: 1, totalAmount: 1,
            totalPaid: 1, totalBalance: 1,
            avgPurchaseAmount: { $round: ['$avgPurchaseAmount', 2] },
          },
        },
      ]),

      Purchase.aggregate([
        { $match: { organizationId: match.organizationId, branchId: match.branchId, isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      Purchase.aggregate([
        {
          $match: {
            organizationId: match.organizationId,
            branchId: match.branchId,
            purchaseDate: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { year: { $year: '$purchaseDate' }, month: { $month: '$purchaseDate' } },
            totalAmount: { $sum: '$grandTotal' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    return { summary: summary[0] || {}, statusCounts, monthlyTrends };
  }

  /* ============================================================
   * 10. GET PENDING PAYMENTS (AP dashboard)
   * ============================================================ */
  static async getPendingPayments(days = 30, user) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(days));

    return Purchase.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(user.organizationId),
          branchId: new mongoose.Types.ObjectId(user.branchId),
          status: { $in: ['received'] },
          paymentStatus: { $in: ['unpaid', 'partial'] },
          balanceAmount: { $gt: 0 },
          purchaseDate: { $gte: cutoff },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$supplierId',
          totalBalance: { $sum: '$balanceAmount' },
          purchaseCount: { $sum: 1 },
          oldestDueDate: { $min: '$dueDate' },
        },
      },
      {
        $lookup: {
          from: 'suppliers', localField: '_id',
          foreignField: '_id', as: 'supplier',
        },
      },
      { $unwind: '$supplier' },
      { $sort: { totalBalance: -1 } },
    ]);
  }

  /* ============================================================
   * PRIVATE HELPERS
   * ============================================================ */

  /**
   * Batch-fetch products, validate they exist, enrich items with
   * product names, and compute invoice totals in one pass.
   */
  static async _enrichAndCalculate(rawItems, organizationId, session = null) {
    const items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;

    const productIds = items.map(i => i.productId);
    const query = Product.find({
      _id: { $in: productIds }, organizationId,
    }).select('name');
    if (session) query.session(session);

    const products = await query;
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    let subTotal = 0, totalTax = 0, totalDiscount = 0;

    const enrichedItems = items.map(item => {
      const product = productMap.get(String(item.productId));
      if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

      const qty = Number(item.quantity);
      const price = Number(item.purchasePrice);
      const discount = Number(item.discount || 0);
      const taxRate = Number(item.taxRate || 0);

      const lineTotal = price * qty;
      const taxableBase = lineTotal - discount;
      const taxAmount = (taxableBase * taxRate) / 100;

      subTotal += lineTotal;
      totalDiscount += discount;
      totalTax += taxAmount;

      return {
        ...item,
        name: product.name,
        quantity: qty,
        purchasePrice: price,
        discount,
        taxRate,
      };
    });

    const grand = parseFloat((subTotal - totalDiscount + totalTax).toFixed(2));
    if (grand < 0) throw new AppError('Grand total cannot be negative', 400);

    return {
      enrichedItems,
      subTotal: parseFloat(subTotal.toFixed(2)),
      totalTax: parseFloat(totalTax.toFixed(2)),
      totalDiscount: parseFloat(totalDiscount.toFixed(2)),
      grandTotal: grand,
    };
  }

  /**
   * Internal payment recorder — shared by createPurchase and recordPayment.
   * When updatePurchase=true it also updates the purchase document's paidAmount.
   */
  static async _recordPaymentInternal({
    orgId, branchId, purchase, amount, paymentMethod,
    reference, notes, userId, date, session,
    updatePurchase = true,
  }) {
    const Payment = require('../../../../accounting/payments/payment.model');

    const [payment] = await Payment.create([{
      organizationId: orgId,
      branchId,
      type: 'outflow',
      supplierId: purchase.supplierId,
      purchaseId: purchase._id,
      paymentDate: date || new Date(),
      amount,
      paymentMethod,
      referenceNumber: reference,
      transactionMode: 'manual',
      status: 'completed',
      remarks: notes || `Payment for ${purchase.invoiceNumber}`,
      createdBy: userId,
    }], { session, ordered: true });

    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: -amount } },
      { session }
    );

    await JournalService.postSupplierPaymentJournal({
      orgId, branchId, payment,
      supplierId: purchase.supplierId,
      invoiceNumber: purchase.invoiceNumber,
      userId,
      session,
    });

    if (updatePurchase) {
      const newPaid = parseFloat(((purchase.paidAmount || 0) + amount).toFixed(2));
      const newBalance = parseFloat((purchase.grandTotal - newPaid).toFixed(2));

      purchase.paidAmount = newPaid;
      purchase.balanceAmount = Math.max(0, newBalance);
      purchase.paymentStatus =
        newBalance <= 0 ? 'paid'
          : newPaid > 0 ? 'partial'
            : 'unpaid';
      purchase.notes = `${purchase.notes || ''}\nPayment: ${amount} (Ref: ${reference || 'N/A'})`;
      await purchase.save({ session });
    }

    return payment;
  }

  /**
   * Atomic sequential purchase number generator.
   * Uses a Counter collection to avoid race conditions.
   */
  static async _nextPurchaseNumber(organizationId, session) {
    const counter = await Counter.findOneAndUpdate(
      { organizationId, type: 'purchase' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    return `PO-${String(counter.seq).padStart(6, '0')}`;
  }
}

module.exports = PurchaseService;


// 'use strict';

// const mongoose = require('mongoose');
// const { nanoid } = require('nanoid');

// // Internal module imports (Inventory - going up one level to the 'model' folder)
// const Purchase = require('../model/purchase.model');
// const PurchaseReturn = require('../model/purchase.return.model');
// const Product = require('../model/product.model');
// const Counter = require('../model/Counter.model '); // Maintained the space before .js from your tree

// // Same folder imports (Inventory Services)
// const StockService = require('./stock.service');
// const JournalService = require('./Journal.service');

// // Cross-module imports (Requires going up 3 levels: service -> core -> inventory -> modules)
// const Supplier = require('../../../organization/core/supplier.model');
// const Payment = require('../../../accounting/payments/payment.model');

// // Core utilities (Requires going up 4 levels: service -> core -> inventory -> modules -> src)
// const AppError = require('../../../../core/utils/api/appError');
// const { runInTransaction } = require('../../../../core/utils/db/runInTransaction');

// /**
//  * PurchaseService
//  * ─────────────────────────────────────────────
//  * All purchase business logic lives here.
//  * The controller is only responsible for:
//  *   - Parsing / validating HTTP input
//  *   - Calling service methods
//  *   - Sending HTTP responses
//  */
// class PurchaseService {

//   /* ============================================================
//    * 1. CREATE PURCHASE
//    * ============================================================ */
//   static async createPurchase(data, user) {
//     const {
//       supplierId, invoiceNumber, purchaseDate, dueDate,
//       notes, status = 'received', paymentMethod = 'cash',
//       paidAmount: rawPaid = 0, items: rawItems, files = [],
//     } = data;

//     // ── Enrich & calculate ──────────────────────────────────────
//     const { enrichedItems, subTotal, totalTax, totalDiscount, grandTotal } =
//       await this._enrichAndCalculate(rawItems, user.organizationId);

//     const paidAmount = Number(rawPaid);
//     if (paidAmount > grandTotal) {
//       throw new AppError(
//         `Paid amount (${paidAmount}) cannot exceed grand total (${grandTotal})`, 400
//       );
//     }

//     let purchase;

//     await runInTransaction(async (session) => {

//       // ── Supplier snapshot ───────────────────────────────────
//       const supplier = await Supplier.findById(supplierId).session(session).lean();
//       if (!supplier) throw new AppError('Supplier not found', 404);

//       const supplierSnapshot = {
//         name: supplier.companyName || supplier.name,
//         address: supplier.address,
//         gstNumber: supplier.gstNumber,
//         email: supplier.email,
//       };

//       // ── Determine payment status ────────────────────────────
//       let paymentStatus = 'unpaid';
//       if (paidAmount >= grandTotal) paymentStatus = 'paid';
//       else if (paidAmount > 0) paymentStatus = 'partial';

//       // ── Create Purchase document ────────────────────────────
//       [purchase] = await Purchase.create([{
//         organizationId: user.organizationId,
//         branchId: user.branchId,
//         supplierId,
//         supplierSnapshot,
//         invoiceNumber: invoiceNumber || await this._nextPurchaseNumber(user.organizationId, session),
//         purchaseDate: purchaseDate || new Date(),
//         dueDate,
//         items: enrichedItems,
//         subTotal,
//         totalTax,
//         totalDiscount,
//         grandTotal,
//         paidAmount,
//         balanceAmount: parseFloat((grandTotal - paidAmount).toFixed(2)),
//         paymentStatus,
//         paymentMethod,
//         status,
//         notes,
//         attachedFiles: files,
//         createdBy: user._id,
//       }], { session, ordered: true });

//       // ── Stock (only if received) ────────────────────────────
//       if (status === 'received') {
//         await StockService.increment(enrichedItems, user.branchId, user.organizationId, session);
//         await Supplier.findByIdAndUpdate(
//           supplierId,
//           { $inc: { outstandingBalance: grandTotal } },
//           { session }
//         );

//         // ── Purchase journal ──────────────────────────────────
//         await JournalService.postPurchaseJournal({
//           orgId: user.organizationId, branchId: user.branchId,
//           purchase, supplierId, userId: user._id, session,
//         });
//       }

//       // ── Initial payment ─────────────────────────────────────
//       if (paidAmount > 0 && status === 'received') {
//         await this._recordPaymentInternal({
//           orgId: user.organizationId,
//           branchId: user.branchId,
//           purchase,
//           amount: paidAmount,
//           paymentMethod,
//           reference: data.referenceNumber,
//           notes: `Initial Payment for ${purchase.invoiceNumber}`,
//           userId: user._id,
//           session,
//           updatePurchase: false, // already set above
//         });
//       }

//     }, 3, { action: 'CREATE_PURCHASE', userId: user._id });

//     return purchase;
//   }

//   /* ============================================================
//    * 2. UPDATE PURCHASE
//    * ============================================================ */
//   static async updatePurchase(purchaseId, data, user) {
//     let updatedPurchase;

//     await runInTransaction(async (session) => {
//       const old = await Purchase.findOne({
//         _id: purchaseId, organizationId: user.organizationId,
//       }).session(session);

//       if (!old) throw new AppError('Purchase not found', 404);
//       if (old.status === 'cancelled') throw new AppError('Cancelled purchase cannot be edited', 400);

//       const hasFinancialChange = data.items || data.discount !== undefined || data.tax !== undefined;

//       // ── Non-financial update (notes, dueDate, etc.) ─────────
//       if (!hasFinancialChange) {
//         const SAFE_FIELDS = ['notes', 'dueDate', 'paymentMethod', 'attachedFiles', 'invoiceNumber'];
//         const safeUpdate = {};
//         for (const key of SAFE_FIELDS) {
//           if (data[key] !== undefined) safeUpdate[key] = data[key];
//         }
//         updatedPurchase = await Purchase.findByIdAndUpdate(old._id, safeUpdate, { new: true, session });
//         return;
//       }

//       // ── Financial update — require no payments ──────────────
//       if (old.paidAmount > 0) {
//         throw new AppError(
//           'Cannot edit financial details of a purchase that already has payments. ' +
//           'Delete the payment first or cancel and recreate.', 400
//         );
//       }

//       // ── A. Reverse old state ────────────────────────────────
//       if (old.status === 'received') {
//         await StockService.decrement(old.items, old.branchId, user.organizationId, session);
//         await Supplier.findByIdAndUpdate(
//           old.supplierId,
//           { $inc: { outstandingBalance: -old.grandTotal } },
//           { session }
//         );
//         await JournalService.deleteByReference({
//           orgId: user.organizationId, referenceId: old._id,
//           referenceType: 'purchase', session,
//         });
//       }

//       // ── B. Enrich & calculate new items ─────────────────────
//       const newRawItems = typeof data.items === 'string' ? JSON.parse(data.items) : data.items;
//       const { enrichedItems, subTotal, totalTax, totalDiscount, grandTotal } =
//         await this._enrichAndCalculate(newRawItems, user.organizationId, session);

//       // ── C. Save updated purchase ────────────────────────────
//       Object.assign(old, data, {
//         items: enrichedItems,
//         subTotal,
//         totalTax,
//         totalDiscount,
//         grandTotal,
//         balanceAmount: parseFloat(grandTotal.toFixed(2)),
//         paymentStatus: 'unpaid',
//         paidAmount: 0,
//       });
//       updatedPurchase = await old.save({ session });

//       // ── D. Re-apply stock & accounting ──────────────────────
//       if (updatedPurchase.status === 'received') {
//         await StockService.increment(enrichedItems, user.branchId, user.organizationId, session);
//         await Supplier.findByIdAndUpdate(
//           updatedPurchase.supplierId,
//           { $inc: { outstandingBalance: grandTotal } },
//           { session }
//         );
//         await JournalService.postPurchaseJournal({
//           orgId: user.organizationId, branchId: user.branchId,
//           purchase: updatedPurchase, supplierId: updatedPurchase.supplierId,
//           userId: user._id, session,
//         });
//       }

//     }, 3, { action: 'UPDATE_PURCHASE', userId: user._id });

//     return updatedPurchase;
//   }

//   /* ============================================================
//    * 3. CANCEL PURCHASE
//    * ============================================================ */
//   static async cancelPurchase(purchaseId, reason, user) {
//     await runInTransaction(async (session) => {
//       const purchase = await Purchase.findOne({
//         _id: purchaseId, organizationId: user.organizationId,
//       }).session(session);

//       if (!purchase) throw new AppError('Purchase not found', 404);
//       if (purchase.status === 'cancelled') throw new AppError('Already cancelled', 400);
//       if (purchase.paidAmount > 0) {
//         throw new AppError(
//           'Cannot cancel a purchase with recorded payments. Delete payments first.', 400
//         );
//       }

//       // ── Validate current stock is sufficient to reverse ─────
//       if (purchase.status === 'received') {
//         await StockService.validateAvailability(
//           purchase.items, purchase.branchId, user.organizationId, session
//         );

//         await StockService.decrement(purchase.items, purchase.branchId, user.organizationId, session);

//         await Supplier.findByIdAndUpdate(
//           purchase.supplierId,
//           { $inc: { outstandingBalance: -purchase.grandTotal } },
//           { session }
//         );

//         await JournalService.reversePurchaseJournal({
//           orgId: user.organizationId, branchId: purchase.branchId,
//           purchase, supplierId: purchase.supplierId, userId: user._id, session,
//         });
//       }

//       purchase.status = 'cancelled';
//       purchase.notes = `${purchase.notes || ''}\nCancelled on ${new Date().toLocaleDateString()}: ${reason}`;
//       await purchase.save({ session });

//     }, 3, { action: 'CANCEL_PURCHASE', userId: user._id });
//   }

//   /* ============================================================
//    * 4. UPDATE STATUS  (draft → received, received → cancelled)
//    * ============================================================ */
//   static async updateStatus(purchaseId, newStatus, notes, user) {
//     const VALID = ['draft', 'received', 'cancelled'];
//     if (!VALID.includes(newStatus)) {
//       throw new AppError(`Invalid status. Must be one of: ${VALID.join(', ')}`, 400);
//     }

//     await runInTransaction(async (session) => {
//       const purchase = await Purchase.findOne({
//         _id: purchaseId, organizationId: user.organizationId,
//       }).session(session);

//       if (!purchase) throw new AppError('Purchase not found', 404);
//       if (purchase.status === newStatus) return;

//       const from = purchase.status;
//       const to = newStatus;

//       // draft → received
//       if (from === 'draft' && to === 'received') {
//         await StockService.increment(purchase.items, purchase.branchId, user.organizationId, session);
//         await Supplier.findByIdAndUpdate(
//           purchase.supplierId,
//           { $inc: { outstandingBalance: purchase.grandTotal } },
//           { session }
//         );
//         await JournalService.postPurchaseJournal({
//           orgId: user.organizationId, branchId: purchase.branchId,
//           purchase, supplierId: purchase.supplierId, userId: user._id, session,
//         });
//       }

//       // received → cancelled
//       else if (from === 'received' && to === 'cancelled') {
//         if (purchase.paidAmount > 0) {
//           throw new AppError('Cannot cancel a purchase that has payments.', 400);
//         }
//         await StockService.validateAvailability(
//           purchase.items, purchase.branchId, user.organizationId, session
//         );
//         await StockService.decrement(purchase.items, purchase.branchId, user.organizationId, session);
//         await Supplier.findByIdAndUpdate(
//           purchase.supplierId,
//           { $inc: { outstandingBalance: -purchase.grandTotal } },
//           { session }
//         );
//         await JournalService.reversePurchaseJournal({
//           orgId: user.organizationId, branchId: purchase.branchId,
//           purchase, supplierId: purchase.supplierId, userId: user._id, session,
//         });
//       }

//       purchase.status = to;
//       if (notes) {
//         purchase.notes = `${purchase.notes || ''}\nStatus: ${to} — ${notes}`;
//       }
//       await purchase.save({ session });

//     }, 3, { action: 'UPDATE_STATUS', userId: user._id });
//   }

//   /* ============================================================
//    * 5. RECORD PAYMENT
//    * ============================================================ */
//   static async recordPayment(purchaseId, paymentData, user) {
//     const { amount: rawAmount, paymentMethod = 'cash', date, reference, notes } = paymentData;
//     const amount = Number(rawAmount);

//     if (!amount || amount <= 0 || isNaN(amount)) {
//       throw new AppError('Valid payment amount is required', 400);
//     }

//     await runInTransaction(async (session) => {
//       const purchase = await Purchase.findOne({
//         _id: purchaseId, organizationId: user.organizationId,
//       }).session(session);

//       if (!purchase) throw new AppError('Purchase not found', 404);
//       if (purchase.status === 'cancelled') throw new AppError('Cannot pay a cancelled purchase', 400);

//       const newTotal = parseFloat(((purchase.paidAmount || 0) + amount).toFixed(2));
//       if (newTotal > purchase.grandTotal + 0.01) {
//         throw new AppError(
//           `Payment of ${amount} exceeds remaining balance of ${purchase.grandTotal - purchase.paidAmount}`,
//           400
//         );
//       }

//       await this._recordPaymentInternal({
//         orgId: user.organizationId, branchId: user.branchId,
//         purchase, amount, paymentMethod,
//         reference, notes, userId: user._id,
//         date: date || new Date(),
//         session,
//         updatePurchase: true,
//       });

//     }, 3, { action: 'RECORD_PAYMENT', userId: user._id });
//   }

//   /* ============================================================
//    * 6. DELETE PAYMENT
//    * ============================================================ */
//   static async deletePayment(purchaseId, paymentId, user) {
//     await runInTransaction(async (session) => {
//       const payment = await (require('../../modules/accounting/payments/payment.model'))
//         .findOne({ _id: paymentId, purchaseId, organizationId: user.organizationId })
//         .session(session);

//       if (!payment) throw new AppError('Payment not found', 404);

//       const purchase = await Purchase.findById(purchaseId).session(session);
//       if (!purchase) throw new AppError('Purchase not found', 404);

//       // Reverse purchase document
//       const newPaid = Math.max(0, Math.round((purchase.paidAmount - payment.amount) * 100) / 100);
//       const newBalance = Math.round((purchase.grandTotal - newPaid) * 100) / 100;

//       purchase.paidAmount = newPaid;
//       purchase.balanceAmount = newBalance;
//       purchase.paymentStatus = newPaid <= 0 ? 'unpaid' : 'partial';
//       purchase.notes = `${purchase.notes || ''}\nPayment of ${payment.amount} deleted`;
//       await purchase.save({ session });

//       // Restore supplier balance
//       await Supplier.findByIdAndUpdate(
//         purchase.supplierId,
//         { $inc: { outstandingBalance: payment.amount } },
//         { session }
//       );

//       // Delete ledger entries
//       await JournalService.reverseSupplierPaymentJournal({
//         orgId: user.organizationId, payment, session,
//       });

//       // Delete payment doc
//       await payment.deleteOne({ session });

//     }, 3, { action: 'DELETE_PAYMENT', userId: user._id });
//   }

//   /* ============================================================
//    * 7. PARTIAL RETURN
//    * ============================================================ */
//   static async partialReturn(purchaseId, { items: retItems, reason }, user) {
//     if (!retItems?.length) {
//       throw new AppError('A valid array of items is required', 400);
//     }
//     if (!reason?.trim()) {
//       throw new AppError('A return reason is required for the audit trail', 400);
//     }

//     await runInTransaction(async (session) => {
//       const purchase = await Purchase.findById(purchaseId).session(session);
//       if (!purchase) throw new AppError('Purchase not found', 404);

//       let totalReturnAmount = 0;
//       const returnItems = [];

//       for (const retItem of retItems) {
//         // A. Validate against original invoice
//         const original = purchase.items.find(
//           i => String(i.productId) === String(retItem.productId)
//         );
//         if (!original || original.quantity < retItem.quantity) {
//           throw new AppError(
//             `Return quantity for product ${retItem.productId} exceeds purchased amount`, 400
//           );
//         }

//         // B. Validate physical stock at branch
//         const available = await StockService.getAvailable(
//           retItem.productId, purchase.branchId, user.organizationId, session
//         );
//         if (available < retItem.quantity) {
//           throw new AppError(
//             `Cannot return ${retItem.quantity} units of "${original.name}". ` +
//             `Current branch stock is only ${available}. Items may have been sold.`, 400
//           );
//         }

//         // C. Financial value (proportional)
//         const itemBase = original.purchasePrice * retItem.quantity;
//         const itemTax = ((original.taxRate || 0) / 100) * itemBase;
//         const itemTotal = parseFloat((itemBase + itemTax).toFixed(2));

//         totalReturnAmount += itemTotal;
//         returnItems.push({
//           productId: retItem.productId,
//           name: original.name,
//           quantity: retItem.quantity,
//           returnPrice: original.purchasePrice,
//           total: itemTotal,
//         });
//       }

//       // D. Create return record
//       await PurchaseReturn.create([{
//         organizationId: user.organizationId,
//         branchId: user.branchId,
//         purchaseId: purchase._id,
//         supplierId: purchase.supplierId,
//         items: returnItems,
//         totalAmount: parseFloat(totalReturnAmount.toFixed(2)),
//         reason,
//         createdBy: user._id,
//       }], { session, ordered: true });

//       // E. Remove stock
//       await StockService.decrement(returnItems, purchase.branchId, user.organizationId, session);

//       // F. Reduce supplier balance
//       await Supplier.findByIdAndUpdate(
//         purchase.supplierId,
//         { $inc: { outstandingBalance: -totalReturnAmount } },
//         { session }
//       );

//       // G. Accounting
//       await JournalService.postPartialReturnJournal({
//         orgId: user.organizationId, branchId: user.branchId,
//         purchase, returnAmount: totalReturnAmount,
//         supplierId: purchase.supplierId, userId: user._id, session,
//       });

//       // H. Update purchase totals (do NOT mutate original quantities)
//       purchase.grandTotal = parseFloat((purchase.grandTotal - totalReturnAmount).toFixed(2));
//       purchase.balanceAmount = parseFloat((purchase.grandTotal - purchase.paidAmount).toFixed(2));
//       purchase.notes = `${purchase.notes || ''}\nPartial Return: -${totalReturnAmount} (${reason})`;

//       if (purchase.grandTotal <= 0) purchase.status = 'cancelled';

//       await purchase.save({ session });

//     }, 3, { action: 'PARTIAL_RETURN', userId: user._id });
//   }

//   /* ============================================================
//    * 8. BULK UPDATE (safe fields only)
//    * ============================================================ */
//   static async bulkUpdate(ids, updates, user) {
//     const BLOCKED = ['items', 'grandTotal', 'paidAmount', 'balanceAmount', 'status', 'organizationId'];
//     for (const field of BLOCKED) {
//       if (field in updates) {
//         throw new AppError(`Cannot bulk update field: '${field}'`, 400);
//       }
//     }

//     const result = await Purchase.updateMany(
//       { _id: { $in: ids }, organizationId: user.organizationId },
//       updates,
//       { runValidators: true }
//     );

//     return { modifiedCount: result.modifiedCount };
//   }

//   /* ============================================================
//    * 9. GET ANALYTICS
//    * ============================================================ */
//   static async getAnalytics(filters, user) {
//     const match = {
//       organizationId: new mongoose.Types.ObjectId(user.organizationId),
//       branchId: new mongoose.Types.ObjectId(user.branchId),
//       isDeleted: false,
//     };

//     if (filters.startDate || filters.endDate) {
//       match.purchaseDate = {};
//       if (filters.startDate) match.purchaseDate.$gte = new Date(filters.startDate);
//       if (filters.endDate) match.purchaseDate.$lte = new Date(filters.endDate);
//     }
//     if (filters.supplierId) match.supplierId = new mongoose.Types.ObjectId(filters.supplierId);
//     if (filters.status) match.status = filters.status;

//     const [summary, statusCounts, monthlyTrends] = await Promise.all([
//       Purchase.aggregate([
//         { $match: match },
//         {
//           $group: {
//             _id: null,
//             totalPurchases: { $sum: 1 },
//             totalAmount: { $sum: '$grandTotal' },
//             totalPaid: { $sum: '$paidAmount' },
//             totalBalance: { $sum: '$balanceAmount' },
//             avgPurchaseAmount: { $avg: '$grandTotal' },
//           },
//         },
//         {
//           $project: {
//             _id: 0, totalPurchases: 1, totalAmount: 1,
//             totalPaid: 1, totalBalance: 1,
//             avgPurchaseAmount: { $round: ['$avgPurchaseAmount', 2] },
//           },
//         },
//       ]),

//       Purchase.aggregate([
//         { $match: { organizationId: match.organizationId, branchId: match.branchId, isDeleted: false } },
//         { $group: { _id: '$status', count: { $sum: 1 } } },
//       ]),

//       Purchase.aggregate([
//         {
//           $match: {
//             organizationId: match.organizationId,
//             branchId: match.branchId,
//             purchaseDate: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) },
//           },
//         },
//         {
//           $group: {
//             _id: { year: { $year: '$purchaseDate' }, month: { $month: '$purchaseDate' } },
//             totalAmount: { $sum: '$grandTotal' },
//             count: { $sum: 1 },
//           },
//         },
//         { $sort: { '_id.year': 1, '_id.month': 1 } },
//       ]),
//     ]);

//     return { summary: summary[0] || {}, statusCounts, monthlyTrends };
//   }

//   /* ============================================================
//    * 10. GET PENDING PAYMENTS (AP dashboard)
//    * ============================================================ */
//   static async getPendingPayments(days = 30, user) {
//     const cutoff = new Date();
//     cutoff.setDate(cutoff.getDate() - parseInt(days));

//     return Purchase.aggregate([
//       {
//         $match: {
//           organizationId: new mongoose.Types.ObjectId(user.organizationId),
//           branchId: new mongoose.Types.ObjectId(user.branchId),
//           status: { $in: ['received'] },
//           paymentStatus: { $in: ['unpaid', 'partial'] },
//           balanceAmount: { $gt: 0 },
//           purchaseDate: { $gte: cutoff },
//           isDeleted: false,
//         },
//       },
//       {
//         $group: {
//           _id: '$supplierId',
//           totalBalance: { $sum: '$balanceAmount' },
//           purchaseCount: { $sum: 1 },
//           oldestDueDate: { $min: '$dueDate' },
//         },
//       },
//       {
//         $lookup: {
//           from: 'suppliers', localField: '_id',
//           foreignField: '_id', as: 'supplier',
//         },
//       },
//       { $unwind: '$supplier' },
//       { $sort: { totalBalance: -1 } },
//     ]);
//   }

//   /* ============================================================
//    * PRIVATE HELPERS
//    * ============================================================ */

//   /**
//    * Batch-fetch products, validate they exist, enrich items with
//    * product names, and compute invoice totals in one pass.
//    */
//   static async _enrichAndCalculate(rawItems, organizationId, session = null) {
//     const items = typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems;

//     const productIds = items.map(i => i.productId);
//     const query = Product.find({
//       _id: { $in: productIds }, organizationId,
//     }).select('name');
//     if (session) query.session(session);

//     const products = await query;
//     const productMap = new Map(products.map(p => [p._id.toString(), p]));

//     let subTotal = 0, totalTax = 0, totalDiscount = 0;

//     const enrichedItems = items.map(item => {
//       const product = productMap.get(String(item.productId));
//       if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

//       const qty = Number(item.quantity);
//       const price = Number(item.purchasePrice);
//       const discount = Number(item.discount || 0);
//       const taxRate = Number(item.taxRate || 0);

//       const lineTotal = price * qty;
//       const taxableBase = lineTotal - discount;
//       const taxAmount = (taxableBase * taxRate) / 100;

//       subTotal += lineTotal;
//       totalDiscount += discount;
//       totalTax += taxAmount;

//       return {
//         ...item,
//         name: product.name,
//         quantity: qty,
//         purchasePrice: price,
//         discount,
//         taxRate,
//       };
//     });

//     const grand = parseFloat((subTotal - totalDiscount + totalTax).toFixed(2));
//     if (grand < 0) throw new AppError('Grand total cannot be negative', 400);

//     return {
//       enrichedItems,
//       subTotal: parseFloat(subTotal.toFixed(2)),
//       totalTax: parseFloat(totalTax.toFixed(2)),
//       totalDiscount: parseFloat(totalDiscount.toFixed(2)),
//       grandTotal: grand,
//     };
//   }

//   /**
//    * Internal payment recorder — shared by createPurchase and recordPayment.
//    * When updatePurchase=true it also updates the purchase document's paidAmount.
//    */
//   static async _recordPaymentInternal({
//     orgId, branchId, purchase, amount, paymentMethod,
//     reference, notes, userId, date, session,
//     updatePurchase = true,
//   }) {
//     const Payment = require('../../modules/accounting/payments/payment.model');

//     const [payment] = await Payment.create([{
//       organizationId: orgId,
//       branchId,
//       type: 'outflow',
//       supplierId: purchase.supplierId,
//       purchaseId: purchase._id,
//       paymentDate: date || new Date(),
//       amount,
//       paymentMethod,
//       referenceNumber: reference,
//       transactionMode: 'manual',
//       status: 'completed',
//       remarks: notes || `Payment for ${purchase.invoiceNumber}`,
//       createdBy: userId,
//     }], { session, ordered: true });

//     await Supplier.findByIdAndUpdate(
//       purchase.supplierId,
//       { $inc: { outstandingBalance: -amount } },
//       { session }
//     );

//     await JournalService.postSupplierPaymentJournal({
//       orgId, branchId, payment,
//       supplierId: purchase.supplierId,
//       invoiceNumber: purchase.invoiceNumber,
//       userId,
//       session,
//     });

//     if (updatePurchase) {
//       const newPaid = parseFloat(((purchase.paidAmount || 0) + amount).toFixed(2));
//       const newBalance = parseFloat((purchase.grandTotal - newPaid).toFixed(2));

//       purchase.paidAmount = newPaid;
//       purchase.balanceAmount = Math.max(0, newBalance);
//       purchase.paymentStatus =
//         newBalance <= 0 ? 'paid'
//           : newPaid > 0 ? 'partial'
//             : 'unpaid';
//       purchase.notes = `${purchase.notes || ''}\nPayment: ${amount} (Ref: ${reference || 'N/A'})`;
//       await purchase.save({ session });
//     }

//     return payment;
//   }

//   /**
//    * Atomic sequential purchase number generator.
//    * Uses a Counter collection to avoid race conditions.
//    */
//   static async _nextPurchaseNumber(organizationId, session) {
//     const counter = await Counter.findOneAndUpdate(
//       { organizationId, type: 'purchase' },
//       { $inc: { seq: 1 } },
//       { new: true, upsert: true, session }
//     );
//     return `PO-${String(counter.seq).padStart(6, '0')}`;
//   }
// }

// module.exports = PurchaseService;