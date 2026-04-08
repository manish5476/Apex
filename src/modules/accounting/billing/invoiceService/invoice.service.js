'use strict';

/**
 * InvoiceService
 * ─────────────────────────────────────────────
 * All invoice business logic lives here.
 * The controller is only responsible for:
 *   - Parsing / validating HTTP input
 *   - Calling service methods
 *   - Sending HTTP responses
 *
 * Double-deduction fix:
 *   Stock is reduced ONLY inside SalesService.createFromInvoiceTransactional.
 *   The invoice controller and this service NEVER call reduceStockForInvoice
 *   directly when creating an invoice — that was the source of the bug.
 *   The flow is:
 *     createInvoice → salesJournalService.postInvoiceJournal (revenue/AR)
 *                   → SalesService.createFromInvoiceTransactional
 *                       → StockService.decrement (stock, once, here only)
 *                       → JournalService.postCOGSJournal (COGS, once, here only)
 */

const mongoose = require('mongoose');
const { z } = require('zod');

// --- Models ---
const Invoice = require('../invoice.model');
const Payment = require('../../payments/payment.model');
const Product = require('../../../inventory/core/model/product.model');
const Customer = require('../../../organization/core/customer.model');
const AccountEntry = require('../../core/model/accountEntry.model');
const InvoiceAudit = require('../invoiceAudit.model');
const EMI = require('../../payments/emi.model');

// FIXED: Path to Counter.model (Note the space before .js from your find output)
const Counter = require('../../../inventory/core/model/Counter.model .js');

// --- Services ---
const SalesService = require('../../../inventory/core/service/sales.service');
const StockValidationService = require('../../../inventory/core/service/stockValidation.service');
const salesJournalService = require('../../../inventory/core/service/salesJournal.service');
const emiService = require('../../payments/emi.service');

// ADDED: Direct path to the actual Stock Service
const StockService = require('../../../inventory/core/service/stock.service');

// FIXED: Path to Journal Service (Note the capital 'J' from your find output)
const JournalService = require('../../../inventory/core/service/Journal.service');

// --- Core Utilities ---
const AppError = require('../../../../core/utils/api/appError');
const { runInTransaction } = require('../../../../core/utils/db/runInTransaction');
const { emitToOrg } = require('../../../../socketHandlers/socket');
const webhookService = require('../../../webhook/webhook.service');
// ─────────────────────────────────────────────
//  Zod validation schema
// ─────────────────────────────────────────────
const createInvoiceSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  items: z.array(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.coerce.number().positive('Quantity must be positive'),
    price: z.coerce.number().nonnegative('Price cannot be negative'),
    purchasePriceAtSale: z.coerce.number().nonnegative().optional(),
    tax: z.coerce.number().optional().default(0),
    taxRate: z.coerce.number().optional().default(0),
    discount: z.coerce.number().optional().default(0),
    unit: z.string().optional().default('pcs'),
    hsnCode: z.string().optional(),
  })).min(1, 'Invoice must have at least one item'),

  invoiceNumber: z.string().optional(),
  invoiceDate: z.union([z.string(), z.date()]).optional(),
  dueDate: z.union([z.string(), z.date()]).optional(),
  paidAmount: z.coerce.number().min(0).optional().default(0),
  paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
  referenceNumber: z.string().optional(),
  paymentReference: z.string().optional(),
  transactionId: z.string().optional(),
  status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
  shippingCharges: z.coerce.number().min(0).optional().default(0),
  notes: z.string().optional(),
  roundOff: z.coerce.number().optional(),
  gstType: z.string().optional(),
  attachedFiles: z.array(z.string()).optional(),
});

class InvoiceService {

  /* ============================================================
   * 1. CREATE INVOICE
   *
   * DOUBLE-DEDUCTION FIX:
   *   Stock is ONLY reduced inside SalesService.createFromInvoiceTransactional.
   *   We do NOT call reduceStockForInvoice here.
   *   salesJournalService.postInvoiceJournal → revenue/AR entries only.
   *   SalesService.createFromInvoiceTransactional → stock + COGS (once).
   * ============================================================ */
  static async createInvoice(rawBody, user) {
    // Validate
    const parsed = createInvoiceSchema.safeParse(rawBody);
    if (!parsed.success) {
      const msg = (parsed.error.issues ?? parsed.error.errors ?? []).map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(msg, 400);
    }

    const { items, ...invoiceData } = parsed.data;

    // Batch fetch products — fixes N+1
    const productIds = items.map(i => i.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      organizationId: user.organizationId,
    }).select('name sku inventory hsnCode purchasePrice');

    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    // Enrich items + preliminary stock check
    const enrichedItems = items.map(item => {
      const product = productMap.get(item.productId);
      if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

      const inv = product.inventory?.find(i => String(i.branchId) === String(user.branchId));
      if (!inv || inv.quantity < item.quantity) {
        throw new AppError(`Insufficient stock for "${product.name}"`, 400);
      }

      return {
        ...item,
        name: product.name,
        hsnCode: product.hsnCode || item.hsnCode || '',
        unit: item.unit || 'pcs',
        discount: item.discount || 0,
        taxRate: item.taxRate || item.tax || 0,
        // FIX: null when cost unknown — not 0 — preserves analytics null-guard
        purchasePriceAtSale: product.purchasePrice ?? null,
        reminderSent: false,
        overdueNoticeSent: false,
        overdueCount: 0,
      };
    });

    // Calculate totals
    const { subTotal, totalDiscount, totalTax, grandTotal } =
      this._calculateTotals(enrichedItems, invoiceData);

    const paidAmount = invoiceData.paidAmount || 0;
    if (paidAmount > grandTotal) {
      throw new AppError(`Paid amount (${paidAmount}) cannot exceed grand total (${grandTotal})`, 400);
    }

    let finalInvoice;

    await runInTransaction(async (session) => {
      // Determine status
      let paymentStatus = 'unpaid';
      let status = invoiceData.status || 'issued';
      if (paidAmount >= grandTotal && paidAmount > 0) { paymentStatus = 'paid'; status = 'paid'; }
      else if (paidAmount > 0) { paymentStatus = 'partial'; }

      // Atomic invoice number
      const invoiceNumber = invoiceData.invoiceNumber
        || (status === 'draft'
          ? `DRAFT-${Date.now()}`
          : await this._nextInvoiceNumber(user.organizationId, session));

      // Create invoice document
      const [invoice] = await Invoice.create([{
        ...invoiceData,
        invoiceNumber,
        items: enrichedItems,
        subTotal: parseFloat(subTotal.toFixed(2)),
        totalTax: parseFloat(totalTax.toFixed(2)),
        totalDiscount: parseFloat(totalDiscount.toFixed(2)),
        grandTotal,
        paidAmount,
        balanceAmount: parseFloat((grandTotal - paidAmount).toFixed(2)),
        paymentStatus,
        status,
        organizationId: user.organizationId,
        branchId: user.branchId,
        createdBy: user._id,
      }], { session, ordered: true });

      // Initial payment
      if (paidAmount > 0) {
        const [payment] = await Payment.create([{
          organizationId: user.organizationId,
          branchId: user.branchId,
          type: 'inflow',
          customerId: invoice.customerId,
          invoiceId: invoice._id,
          paymentDate: invoiceData.invoiceDate || new Date(),
          amount: paidAmount,
          paymentMethod: invoiceData.paymentMethod || 'cash',
          transactionMode: 'auto',
          referenceNumber: invoiceData.paymentReference || invoiceData.referenceNumber,
          transactionId: invoiceData.transactionId,
          remarks: `Auto-payment for ${invoice.invoiceNumber}`,
          status: 'completed',
          allocationStatus: 'fully_allocated',
          remainingAmount: 0,
          allocatedTo: [{ type: 'invoice', documentId: invoice._id, amount: paidAmount, allocatedAt: new Date() }],
          createdBy: user._id,
        }], { session, ordered: true });

        await this._postPaymentJournal({ invoice, payment, userId: user._id, session });
      }

      // Customer stats
      if (invoice.customerId) {
        await Customer.findByIdAndUpdate(
          invoice.customerId,
          {
            $inc: { totalPurchases: grandTotal, outstandingBalance: grandTotal - paidAmount },
            $set: { lastPurchaseDate: new Date() },
          },
          { session }
        );
      }

      // Revenue journal + stock + COGS (non-draft only)
      // DOUBLE-DEDUCTION FIX: stock is ONLY deducted inside createFromInvoiceTransactional
      if (invoice.status !== 'draft') {
        await salesJournalService.postInvoiceJournal({
          orgId: user.organizationId, branchId: user.branchId,
          invoice, customerId: invoice.customerId,
          items: invoice.items, userId: user._id, session,
        });

        // This is the ONLY place stock is deducted for invoice creation
        await SalesService.createFromInvoiceTransactional(invoice, session);
      }

      await this._createAudit({
        organizationId: user.organizationId,
        invoiceId: invoice._id, action: 'CREATE',
        performedBy: user._id,
        details: `Invoice ${invoice.invoiceNumber} created. Total: ${grandTotal}`,
        session,
      });

      finalInvoice = invoice;

    }, 3, { action: 'CREATE_INVOICE', userId: user._id });

    // Post-transaction side effects
    webhookService.triggerEvent('invoice.created', finalInvoice.toObject(), user.organizationId);
    emitToOrg(user.organizationId, 'invoice:created', finalInvoice);

    return finalInvoice;
  }

  /* ============================================================
   * 2. UPDATE INVOICE
   * ============================================================ */
  static async updateInvoice(invoiceId, updates, user) {
    let updatedInvoice;

    await runInTransaction(async (session) => {
      const old = await Invoice.findOne({
        _id: invoiceId, organizationId: user.organizationId,
      }).session(session);

      if (!old) throw new AppError('Invoice not found', 404);
      if (old.status === 'cancelled') throw new AppError('Cannot update a cancelled invoice', 400);

      const isDraftUpdate = old.status === 'draft' && (!updates.status || updates.status === 'draft');

      // Simple draft update — no stock changes
      if (isDraftUpdate) {
        updatedInvoice = await Invoice.findByIdAndUpdate(old._id, updates, { new: true, session });
        await this._createAudit({
          organizationId: user.organizationId,
          invoiceId: old._id, action: 'UPDATE_DRAFT',
          performedBy: user._id, details: 'Draft invoice updated', session,
        });
        return;
      }

      const hasFinancialChange = updates.items
        || updates.shippingCharges !== undefined
        || updates.discount !== undefined
        || updates.roundOff !== undefined;

      if (hasFinancialChange) {
        // Restore old stock
        await StockService.increment(
          old.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          old.branchId, user.organizationId, session
        );

        // Validate new stock
        if (updates.items) {
          const validation = await StockValidationService.validateSale(
            updates.items, old.branchId, user.organizationId, session
          );
          if (!validation.isValid) {
            throw new AppError(`Stock validation failed: ${validation.errors.join(', ')}`, 400);
          }
        }

        // Reduce new stock
        const newItems = updates.items || old.items;
        await StockService.decrement(
          newItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
          old.branchId, user.organizationId, session
        );

        // Batch enrich items — one Product.find not N+1
        if (updates.items) {
          const pIds = updates.items.map(i => i.productId);
          const prods = await Product.find({ _id: { $in: pIds } }).session(session).select('name sku purchasePrice');
          const pMap = new Map(prods.map(p => [p._id.toString(), p]));
          updates.items = updates.items.map(item => {
            const prod = pMap.get(String(item.productId));
            return { ...item, name: prod?.name, sku: prod?.sku, purchasePriceAtSale: prod?.purchasePrice ?? null };
          });
        }

        // Delete old revenue journal entries only — NOT payment entries
        await AccountEntry.deleteMany({
          referenceId: old._id,
          referenceType: 'invoice',
          organizationId: user.organizationId,
        }).session(session);

        await Customer.findByIdAndUpdate(
          old.customerId,
          { $inc: { outstandingBalance: -old.grandTotal } },
          { session }
        );
      }

      Object.assign(old, updates);
      updatedInvoice = await old.save({ session });

      if (hasFinancialChange && updatedInvoice.status !== 'draft') {
        await salesJournalService.postInvoiceJournal({
          orgId: user.organizationId, branchId: user.branchId,
          invoice: updatedInvoice, customerId: updatedInvoice.customerId,
          items: updatedInvoice.items, userId: user._id, session,
        });

        await Customer.findByIdAndUpdate(
          updatedInvoice.customerId,
          { $inc: { outstandingBalance: updatedInvoice.grandTotal } },
          { session }
        );

        await SalesService.updateFromInvoiceTransactional(updatedInvoice, session);
      }

      await this._createAudit({
        organizationId: user.organizationId,
        invoiceId: updatedInvoice._id,
        action: hasFinancialChange ? 'UPDATE_FINANCIAL' : 'UPDATE_INFO',
        performedBy: user._id,
        details: hasFinancialChange
          ? `Financial update. New total: ${updatedInvoice.grandTotal}`
          : 'Non-financial update',
        session,
      });

    }, 3, { action: 'UPDATE_INVOICE', userId: user._id });

    return updatedInvoice;
  }

  /* ============================================================
   * 3. CANCEL INVOICE
   * ============================================================ */
  static async cancelInvoice(invoiceId, { reason, restock = true, reverseFinancials = true }, user) {
    if (!reason?.trim()) throw new AppError('Cancellation reason is required', 400);

    await runInTransaction(async (session) => {
      const invoice = await Invoice.findOne({
        _id: invoiceId, organizationId: user.organizationId,
      }).populate('items.productId').session(session);

      if (!invoice) throw new AppError('Invoice not found', 404);
      if (invoice.status === 'cancelled') throw new AppError('Invoice already cancelled', 400);

      // Restore stock — StockService.increment throws on failure (no silent no-ops)
      if (restock) {
        await StockService.increment(
          invoice.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          invoice.branchId, user.organizationId, session
        );
      }

      if (reverseFinancials) {
        await Customer.findByIdAndUpdate(
          invoice.customerId,
          { $inc: { totalPurchases: -invoice.grandTotal, outstandingBalance: -invoice.grandTotal } },
          { session }
        );

        await salesJournalService.reverseInvoiceJournal({
          orgId: user.organizationId, branchId: invoice.branchId,
          invoice, userId: user._id, session,
        });
      }

      invoice.status = 'cancelled';
      invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason}`;
      await invoice.save({ session });

      // Update the linked Sales record status too
      await SalesService.updateFromInvoiceTransactional(invoice, session);

      await this._createAudit({
        organizationId: user.organizationId,
        invoiceId: invoice._id, action: 'CANCEL',
        performedBy: user._id,
        details: `Cancelled. Restock: ${restock}. FinancialsReversed: ${reverseFinancials}. Reason: ${reason}`,
        session,
      });

    }, 3, { action: 'CANCEL_INVOICE', userId: user._id });

    emitToOrg(user.organizationId, 'invoice:cancelled', { invoiceId });
  }

  /* ============================================================
   * 4. ADD PAYMENT
   * ============================================================ */
  static async addPayment(invoiceId, paymentData, user) {
    const { paymentMethod, referenceNumber, transactionId, notes } = paymentData;
    const amount = Number(paymentData.amount);

    if (!amount || amount <= 0 || isNaN(amount)) {
      throw new AppError('Payment amount must be a positive number', 400);
    }

    // PATH A: EMI exists
    const existingEmi = await EMI.findOne({ invoiceId, status: { $ne: 'cancelled' } });
    if (existingEmi) {
      await emiService.reconcileExternalPayment({
        organizationId: user.organizationId,
        branchId: user.branchId,
        invoiceId,
        amount,
        paymentMethod: paymentMethod || 'cash',
        referenceNumber,
        transactionId,
        remarks: notes || 'Payment added via Invoice Screen',
        createdBy: user._id,
      });
      return { emi: true };
    }

    // PATH B: Standard payment
    await runInTransaction(async (session) => {
      const invoice = await Invoice.findOne({
        _id: invoiceId, organizationId: user.organizationId,
      }).session(session);

      if (!invoice) throw new AppError('Invoice not found', 404);
      if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to a cancelled invoice', 400);
      if (invoice.status === 'paid') throw new AppError('Invoice is already fully paid', 400);

      const newPaid = parseFloat((invoice.paidAmount + amount).toFixed(2));
      if (newPaid > invoice.grandTotal + 0.01) {
        throw new AppError(
          `Payment exceeds balance. Maximum: ${parseFloat((invoice.grandTotal - invoice.paidAmount).toFixed(2))}`,
          400
        );
      }

      const [payment] = await Payment.create([{
        organizationId: user.organizationId,
        branchId: invoice.branchId,
        type: 'inflow',
        customerId: invoice.customerId,
        invoiceId: invoice._id,
        paymentDate: new Date(),
        amount,
        paymentMethod: paymentMethod || invoice.paymentMethod || 'cash',
        transactionMode: 'manual',
        referenceNumber,
        transactionId,
        remarks: notes || `Payment for Invoice #${invoice.invoiceNumber}`,
        status: 'completed',
        allocationStatus: 'fully_allocated',
        remainingAmount: 0,
        allocatedTo: [{ type: 'invoice', documentId: invoice._id, amount, allocatedAt: new Date() }],
        createdBy: user._id,
      }], { session, ordered: true });

      await this._postPaymentJournal({ invoice, payment, userId: user._id, session });

      await Customer.findByIdAndUpdate(
        invoice.customerId,
        { $inc: { outstandingBalance: -amount } },
        { session }
      );

      invoice.paidAmount = newPaid;
      invoice.balanceAmount = parseFloat((invoice.grandTotal - newPaid).toFixed(2));
      invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
      if (invoice.balanceAmount <= 0) invoice.status = 'paid';
      if (paymentMethod) invoice.paymentMethod = paymentMethod;
      if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;
      await invoice.save({ session });

      await this._createAudit({
        organizationId: user.organizationId,
        invoiceId: invoice._id, action: 'PAYMENT_ADDED',
        performedBy: user._id,
        details: `Payment of ${amount} added. Total paid: ${newPaid}`,
        session,
      });

    }, 3, { action: 'ADD_PAYMENT', userId: user._id });

    return { emi: false };
  }

  /* ============================================================
   * 5. CONVERT DRAFT TO ACTIVE
   * ============================================================ */
  static async convertDraftToActive(invoiceId, user) {
    await runInTransaction(async (session) => {
      const invoice = await Invoice.findOne({
        _id: invoiceId, organizationId: user.organizationId, status: 'draft',
      }).session(session);
      if (!invoice) throw new AppError('Draft invoice not found', 404);

      const validation = await StockValidationService.validateSale(
        invoice.items, invoice.branchId, user.organizationId, session
      );
      if (!validation.isValid) {
        throw new AppError(`Cannot convert: ${validation.errors.join(', ')}`, 400);
      }

      // FIX: Atomic invoice number — no race condition
      if (invoice.invoiceNumber.startsWith('DRAFT')) {
        invoice.invoiceNumber = await this._nextInvoiceNumber(user.organizationId, session);
      }

      invoice.status = 'issued';
      invoice.invoiceDate = new Date();
      await invoice.save({ session });

      await Customer.findByIdAndUpdate(
        invoice.customerId,
        {
          $inc: { totalPurchases: invoice.grandTotal, outstandingBalance: invoice.grandTotal },
          $set: { lastPurchaseDate: new Date() },
        },
        { session }
      );

      await salesJournalService.postInvoiceJournal({
        orgId: user.organizationId, branchId: invoice.branchId,
        invoice, customerId: invoice.customerId,
        items: invoice.items, userId: user._id, session,
      });

      // Stock deduction happens here — NOT before invoice.save
      await SalesService.createFromInvoiceTransactional(invoice, session);

      await this._createAudit({
        organizationId: user.organizationId,
        invoiceId: invoice._id, action: 'CONVERT_DRAFT',
        performedBy: user._id,
        details: `Draft converted to ${invoice.invoiceNumber}`,
        session,
      });

    }, 3, { action: 'CONVERT_DRAFT', userId: user._id });
  }

  /* ============================================================
   * 6. BULK CANCEL
   * ============================================================ */
  static async bulkCancelInvoices(ids, reason, user) {
    if (!ids?.length) throw new AppError('Invoice IDs array is required', 400);
    if (!reason?.trim()) throw new AppError('Reason is required', 400);

    await runInTransaction(async (session) => {
      for (const id of ids) {
        const invoice = await Invoice.findOne({
          _id: id, organizationId: user.organizationId,
        }).session(session);
        if (!invoice || invoice.status === 'cancelled') continue;

        // FIX: Throws on failure — was silent console.error
        await StockService.increment(
          invoice.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          invoice.branchId, user.organizationId, session
        );

        // FIX: Customer balance was missing in original bulkCancel
        await Customer.findByIdAndUpdate(
          invoice.customerId,
          { $inc: { totalPurchases: -invoice.grandTotal, outstandingBalance: -invoice.grandTotal } },
          { session }
        );

        await salesJournalService.reverseInvoiceJournal({
          orgId: user.organizationId, branchId: invoice.branchId,
          invoice, userId: user._id, session,
        });

        invoice.status = 'cancelled';
        invoice.notes = (invoice.notes || '') + `\nBulk cancelled: ${reason}`;
        await invoice.save({ session });

        await this._createAudit({
          organizationId: user.organizationId,
          invoiceId: invoice._id, action: 'CANCEL',
          performedBy: user._id, details: `Bulk cancel. Reason: ${reason}`,
          session,
        });
      }
    }, 3, { action: 'BULK_CANCEL_INVOICE', userId: user._id });
  }

  /* ============================================================
   * 7. CHECK STOCK
   * ============================================================ */
  static async checkStock(items, user) {
    const validation = await StockValidationService.validateSale(
      items, user.branchId, user.organizationId
    );

    // Batch fetch — one query not N+1
    const productIds = items.map(i => i.productId);
    const products = await Product.find({
      _id: { $in: productIds }, organizationId: user.organizationId,
    }).select('name sku sellingPrice inventory');
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const detailedItems = items.map(item => {
      const product = productMap.get(String(item.productId));
      const inv = product?.inventory?.find(i => String(i.branchId) === String(user.branchId));
      return {
        productId: item.productId,
        name: product?.name,
        sku: product?.sku,
        requestedQuantity: item.quantity,
        availableStock: inv?.quantity || 0,
        price: product?.sellingPrice,
        isAvailable: (inv?.quantity || 0) >= item.quantity,
      };
    });

    return { ...validation, items: detailedItems };
  }

  /* ============================================================
   * 8. SEARCH INVOICES
   * FIX: customerId.name regex never worked — ObjectId at rest
   * ============================================================ */
  static async searchInvoices(query, limit, user) {
    const Customer = require('../../../organization/core/customer.model');
    const matchingCustomers = await Customer.find({
      name: { $regex: query, $options: 'i' },
      organizationId: user.organizationId,
    }).select('_id');

    return Invoice.find({
      organizationId: user.organizationId,
      isDeleted: { $ne: true },
      $or: [
        { invoiceNumber: { $regex: query, $options: 'i' } },
        { notes: { $regex: query, $options: 'i' } },
        { customerId: { $in: matchingCustomers.map(c => c._id) } },
      ],
    })
      .populate('customerId', 'name phone')
      .sort({ invoiceDate: -1 })
      .limit(limit);
  }

  /* ============================================================
   * 9. GET INVOICE WITH STOCK
   * ============================================================ */
  static async getInvoiceWithStock(invoiceId, user) {
    const invoice = await Invoice.findOne({
      _id: invoiceId, organizationId: user.organizationId,
    }).populate([
      { path: 'customerId', select: 'name phone email address' },
      { path: 'items.productId', select: 'name sku sellingPrice inventory' },
      { path: 'branchId', select: 'name code address' },
      { path: 'createdBy', select: 'name email' },
    ]);
    if (!invoice) throw new AppError('Invoice not found', 404);

    const itemsWithStock = invoice.items.map(item => {
      const inv = item.productId?.inventory?.find(
        i => String(i.branchId) === String(invoice.branchId)
      );
      return {
        ...item.toObject(),
        currentStock: inv?.quantity || 0,
        reorderLevel: inv?.reorderLevel || 10,
        willBeLow: (inv?.quantity || 0) - item.quantity < (inv?.reorderLevel || 10),
      };
    });

    return { ...invoice.toObject(), items: itemsWithStock };
  }

  /* ============================================================
   * 10. LOW STOCK WARNINGS FOR AN INVOICE
   * ============================================================ */
  static async getLowStockWarnings(invoiceId, user) {
    const invoice = await Invoice.findOne({
      _id: invoiceId, organizationId: user.organizationId,
    }).populate('items.productId');
    if (!invoice) throw new AppError('Invoice not found', 404);

    return invoice.items
      .filter(item => item.productId)
      .flatMap(item => {
        const inv = item.productId.inventory?.find(
          i => String(i.branchId) === String(invoice.branchId)
        );
        if (inv?.reorderLevel && inv.quantity < inv.reorderLevel) {
          return [{
            productId: item.productId._id,
            productName: item.productId.name,
            currentStock: inv.quantity,
            reorderLevel: inv.reorderLevel,
            message: `${item.productId.name} is below reorder level (${inv.quantity} < ${inv.reorderLevel})`,
          }];
        }
        return [];
      });
  }

  /* ============================================================
   * 11. SEND EMAIL
   * ============================================================ */
  static async sendInvoiceEmail(invoiceId, user) {
    const invoice = await Invoice.findOne({
      _id: invoiceId, organizationId: user.organizationId,
    }).populate('customerId');
    if (!invoice) throw new AppError('Invoice not found', 404);

    const email = invoice.customerId?.email;
    if (!email) throw new AppError('Customer email not found', 400);

    await this._createAudit({
      organizationId: user.organizationId,
      invoiceId: invoice._id,
      action: 'EMAIL_SENT',
      performedBy: user._id,
      details: `Invoice emailed to ${email}`,
    });

    return email;
  }

  /* ============================================================
   * 12. AUDIT HISTORY
   * FIX: original had no organizationId scope
   * ============================================================ */
  static async getInvoiceHistory(invoiceId, user) {
    return InvoiceAudit.find({
      invoiceId: invoiceId,
      organizationId: user.organizationId,
    })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name email');
  }

  /* ============================================================
   * PRIVATE HELPERS
   * ============================================================ */

  static _calculateTotals(enrichedItems, invoiceData) {
    const subTotal = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const totalDiscount = enrichedItems.reduce((s, i) => s + (i.discount || 0), 0);
    const totalTax = enrichedItems.reduce((s, i) => {
      const base = i.price * i.quantity - (i.discount || 0);
      return s + ((i.taxRate || 0) / 100) * base;
    }, 0);
    const grandTotal = parseFloat((
      subTotal - totalDiscount + totalTax +
      (invoiceData.shippingCharges || 0) +
      (invoiceData.roundOff || 0)
    ).toFixed(2));
    return { subTotal, totalDiscount, totalTax, grandTotal };
  }

  /**
   * Atomic sequential invoice number — no race condition.
   */
  static async _nextInvoiceNumber(organizationId, session) {
    const counter = await Counter.findOneAndUpdate(
      { organizationId, type: 'invoice' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    return `INV-${String(counter.seq).padStart(6, '0')}`;
  }

  /**
   * Payment double-entry journal — batched into one AccountEntry.create.
   * Routed through JournalService to avoid copy-pasted getOrInitAccount.
   */
  static async _postPaymentJournal({ invoice, payment, userId, session }) {
    if (!payment?.amount || payment.amount <= 0) return;
    const [assetAcc, arAcc] = await Promise.all([
      JournalService.getPaymentAssetAccount(invoice.organizationId, payment.paymentMethod, session),
      JournalService.getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session),
    ]);
    const AccountEntry = require('../../core/model/accountEntry.model');
    await AccountEntry.create([
      {
        organizationId: invoice.organizationId, branchId: invoice.branchId,
        accountId: assetAcc._id, date: payment.paymentDate,
        debit: payment.amount, credit: 0,
        description: `Payment for ${invoice.invoiceNumber}`,
        referenceType: 'payment', referenceId: invoice._id,
        paymentId: payment._id, createdBy: userId,
      },
      {
        organizationId: invoice.organizationId, branchId: invoice.branchId,
        accountId: arAcc._id, customerId: invoice.customerId,
        date: payment.paymentDate, debit: 0, credit: payment.amount,
        description: `Payment applied to ${invoice.invoiceNumber}`,
        referenceType: 'payment', referenceId: invoice._id,
        paymentId: payment._id, createdBy: userId,
      },
    ], { session, ordered: true });
  }

  /**
   * Audit log — always includes organizationId.
   * FIX: every original audit call was missing organizationId.
   */
  static async _createAudit({ organizationId, invoiceId, action, performedBy, details, ipAddress, session }) {
    const opts = session ? { session } : {};
    await InvoiceAudit.create([{
      organizationId, invoiceId, action, performedBy,
      details, ipAddress: ipAddress || '',
    }], opts);
  }
}

module.exports = InvoiceService;


// 'use strict';

// /**
//  * InvoiceService
//  * ─────────────────────────────────────────────
//  * All invoice business logic lives here.
//  * The controller is only responsible for:
//  *   - Parsing / validating HTTP input
//  *   - Calling service methods
//  *   - Sending HTTP responses
//  *
//  * Double-deduction fix:
//  *   Stock is reduced ONLY inside SalesService.createFromInvoiceTransactional.
//  *   The invoice controller and this service NEVER call reduceStockForInvoice
//  *   directly when creating an invoice — that was the source of the bug.
//  *   The flow is:
//  *     createInvoice → salesJournalService.postInvoiceJournal (revenue/AR)
//  *                   → SalesService.createFromInvoiceTransactional
//  *                       → StockService.decrement (stock, once, here only)
//  *                       → JournalService.postCOGSJournal (COGS, once, here only)
//  */

// const mongoose = require('mongoose');
// const { z }    = require('zod');

// const Invoice      = require('../invoice.model');
// const Payment      = require('../../payments/payment.model');
// const Product      = require('../../../inventory/core/model/product.model');
// const Customer     = require('../../../organization/core/customer.model');
// const AccountEntry = require('../../core/model/accountEntry.model');
// const InvoiceAudit = require('../invoiceAudit.model');
// const EMI          = require('../../payments/emi.model');
// const Counter      = require('../../../../models/counter.model');

// const SalesService           = require('../../../inventory/core/service/sales.service');
// const StockValidationService = require('../../../inventory/core/service/stockValidation.service');
// const salesJournalService    = require('../../../inventory/core/service/salesJournal.service');
// const emiService             = require('../../payments/emiService');
// const StockService           = require('../../../../services/inventory/stockService');
// const JournalService         = require('../../../../services/accounting/journalService');

// const AppError           = require('../../../../core/utils/api/appError');
// const { runInTransaction } = require('../../../../core/utils/db/runInTransaction');
// const { emitToOrg }      = require('../../../../socketHandlers/socket');
// const webhookService  = require('../../../webhook/webhook.service');

// // ─────────────────────────────────────────────
// //  Zod validation schema
// // ─────────────────────────────────────────────
// const createInvoiceSchema = z.object({
//   customerId:      z.string().min(1, 'Customer ID is required'),
//   items: z.array(z.object({
//     productId:           z.string().min(1, 'Product ID is required'),
//     quantity:            z.coerce.number().positive('Quantity must be positive'),
//     price:               z.coerce.number().nonnegative('Price cannot be negative'),
//     purchasePriceAtSale: z.coerce.number().nonnegative().optional(),
//     tax:                 z.coerce.number().optional().default(0),
//     taxRate:             z.coerce.number().optional().default(0),
//     discount:            z.coerce.number().optional().default(0),
//     unit:                z.string().optional().default('pcs'),
//     hsnCode:             z.string().optional(),
//   })).min(1, 'Invoice must have at least one item'),

//   invoiceNumber:    z.string().optional(),
//   invoiceDate:      z.union([z.string(), z.date()]).optional(),
//   dueDate:          z.union([z.string(), z.date()]).optional(),
//   paidAmount:       z.coerce.number().min(0).optional().default(0),
//   paymentMethod:    z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
//   referenceNumber:  z.string().optional(),
//   paymentReference: z.string().optional(),
//   transactionId:    z.string().optional(),
//   status:           z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
//   shippingCharges:  z.coerce.number().min(0).optional().default(0),
//   notes:            z.string().optional(),
//   roundOff:         z.coerce.number().optional(),
//   gstType:          z.string().optional(),
//   attachedFiles:    z.array(z.string()).optional(),
// });

// class InvoiceService {

//   /* ============================================================
//    * 1. CREATE INVOICE
//    *
//    * DOUBLE-DEDUCTION FIX:
//    *   Stock is ONLY reduced inside SalesService.createFromInvoiceTransactional.
//    *   We do NOT call reduceStockForInvoice here.
//    *   salesJournalService.postInvoiceJournal → revenue/AR entries only.
//    *   SalesService.createFromInvoiceTransactional → stock + COGS (once).
//    * ============================================================ */
//   static async createInvoice(rawBody, user) {
//     // Validate
//     const parsed = createInvoiceSchema.safeParse(rawBody);
//     if (!parsed.success) {
//       const msg = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
//       throw new AppError(msg, 400);
//     }

//     const { items, ...invoiceData } = parsed.data;

//     // Batch fetch products — fixes N+1
//     const productIds = items.map(i => i.productId);
//     const products   = await Product.find({
//       _id: { $in: productIds },
//       organizationId: user.organizationId,
//     }).select('name sku inventory hsnCode purchasePrice');

//     const productMap = new Map(products.map(p => [p._id.toString(), p]));

//     // Enrich items + preliminary stock check
//     const enrichedItems = items.map(item => {
//       const product = productMap.get(item.productId);
//       if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

//       const inv = product.inventory?.find(i => String(i.branchId) === String(user.branchId));
//       if (!inv || inv.quantity < item.quantity) {
//         throw new AppError(`Insufficient stock for "${product.name}"`, 400);
//       }

//       return {
//         ...item,
//         name:     product.name,
//         hsnCode:  product.hsnCode || item.hsnCode || '',
//         unit:     item.unit || 'pcs',
//         discount: item.discount || 0,
//         taxRate:  item.taxRate  || item.tax || 0,
//         // FIX: null when cost unknown — not 0 — preserves analytics null-guard
//         purchasePriceAtSale: product.purchasePrice ?? null,
//         reminderSent:      false,
//         overdueNoticeSent: false,
//         overdueCount:      0,
//       };
//     });

//     // Calculate totals
//     const { subTotal, totalDiscount, totalTax, grandTotal } =
//       this._calculateTotals(enrichedItems, invoiceData);

//     const paidAmount = invoiceData.paidAmount || 0;
//     if (paidAmount > grandTotal) {
//       throw new AppError(`Paid amount (${paidAmount}) cannot exceed grand total (${grandTotal})`, 400);
//     }

//     let finalInvoice;

//     await runInTransaction(async (session) => {
//       // Determine status
//       let paymentStatus = 'unpaid';
//       let status        = invoiceData.status || 'issued';
//       if (paidAmount >= grandTotal && paidAmount > 0) { paymentStatus = 'paid'; status = 'paid'; }
//       else if (paidAmount > 0)                        { paymentStatus = 'partial'; }

//       // Atomic invoice number
//       const invoiceNumber = invoiceData.invoiceNumber
//         || (status === 'draft'
//           ? `DRAFT-${Date.now()}`
//           : await this._nextInvoiceNumber(user.organizationId, session));

//       // Create invoice document
//       const [invoice] = await Invoice.create([{
//         ...invoiceData,
//         invoiceNumber,
//         items:         enrichedItems,
//         subTotal:      parseFloat(subTotal.toFixed(2)),
//         totalTax:      parseFloat(totalTax.toFixed(2)),
//         totalDiscount: parseFloat(totalDiscount.toFixed(2)),
//         grandTotal,
//         paidAmount,
//         balanceAmount: parseFloat((grandTotal - paidAmount).toFixed(2)),
//         paymentStatus,
//         status,
//         organizationId: user.organizationId,
//         branchId:       user.branchId,
//         createdBy:      user._id,
//       }], { session, ordered: true });

//       // Initial payment
//       if (paidAmount > 0) {
//         const [payment] = await Payment.create([{
//           organizationId:  user.organizationId,
//           branchId:        user.branchId,
//           type:            'inflow',
//           customerId:      invoice.customerId,
//           invoiceId:       invoice._id,
//           paymentDate:     invoiceData.invoiceDate || new Date(),
//           amount:          paidAmount,
//           paymentMethod:   invoiceData.paymentMethod || 'cash',
//           transactionMode: 'auto',
//           referenceNumber: invoiceData.paymentReference || invoiceData.referenceNumber,
//           transactionId:   invoiceData.transactionId,
//           remarks:         `Auto-payment for ${invoice.invoiceNumber}`,
//           status:          'completed',
//           allocationStatus: 'fully_allocated',
//           remainingAmount: 0,
//           allocatedTo: [{ type: 'invoice', documentId: invoice._id, amount: paidAmount, allocatedAt: new Date() }],
//           createdBy:       user._id,
//         }], { session, ordered: true });

//         await this._postPaymentJournal({ invoice, payment, userId: user._id, session });
//       }

//       // Customer stats
//       if (invoice.customerId) {
//         await Customer.findByIdAndUpdate(
//           invoice.customerId,
//           {
//             $inc: { totalPurchases: grandTotal, outstandingBalance: grandTotal - paidAmount },
//             $set: { lastPurchaseDate: new Date() },
//           },
//           { session }
//         );
//       }

//       // Revenue journal + stock + COGS (non-draft only)
//       // DOUBLE-DEDUCTION FIX: stock is ONLY deducted inside createFromInvoiceTransactional
//       if (invoice.status !== 'draft') {
//         await salesJournalService.postInvoiceJournal({
//           orgId: user.organizationId, branchId: user.branchId,
//           invoice, customerId: invoice.customerId,
//           items: invoice.items, userId: user._id, session,
//         });

//         // This is the ONLY place stock is deducted for invoice creation
//         await SalesService.createFromInvoiceTransactional(invoice, session);
//       }

//       await this._createAudit({
//         organizationId: user.organizationId,
//         invoiceId: invoice._id, action: 'CREATE',
//         performedBy: user._id,
//         details: `Invoice ${invoice.invoiceNumber} created. Total: ${grandTotal}`,
//         session,
//       });

//       finalInvoice = invoice;

//     }, 3, { action: 'CREATE_INVOICE', userId: user._id });

//     // Post-transaction side effects
//     webhookService.triggerEvent('invoice.created', finalInvoice.toObject(), user.organizationId);
//     emitToOrg(user.organizationId, 'invoice:created', finalInvoice);

//     return finalInvoice;
//   }

//   /* ============================================================
//    * 2. UPDATE INVOICE
//    * ============================================================ */
//   static async updateInvoice(invoiceId, updates, user) {
//     let updatedInvoice;

//     await runInTransaction(async (session) => {
//       const old = await Invoice.findOne({
//         _id: invoiceId, organizationId: user.organizationId,
//       }).session(session);

//       if (!old)                       throw new AppError('Invoice not found', 404);
//       if (old.status === 'cancelled') throw new AppError('Cannot update a cancelled invoice', 400);

//       const isDraftUpdate = old.status === 'draft' && (!updates.status || updates.status === 'draft');

//       // Simple draft update — no stock changes
//       if (isDraftUpdate) {
//         updatedInvoice = await Invoice.findByIdAndUpdate(old._id, updates, { new: true, session });
//         await this._createAudit({
//           organizationId: user.organizationId,
//           invoiceId: old._id, action: 'UPDATE_DRAFT',
//           performedBy: user._id, details: 'Draft invoice updated', session,
//         });
//         return;
//       }

//       const hasFinancialChange = updates.items
//         || updates.shippingCharges !== undefined
//         || updates.discount       !== undefined
//         || updates.roundOff       !== undefined;

//       if (hasFinancialChange) {
//         // Restore old stock
//         await StockService.increment(
//           old.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
//           old.branchId, user.organizationId, session
//         );

//         // Validate new stock
//         if (updates.items) {
//           const validation = await StockValidationService.validateSale(
//             updates.items, old.branchId, user.organizationId, session
//           );
//           if (!validation.isValid) {
//             throw new AppError(`Stock validation failed: ${validation.errors.join(', ')}`, 400);
//           }
//         }

//         // Reduce new stock
//         const newItems = updates.items || old.items;
//         await StockService.decrement(
//           newItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
//           old.branchId, user.organizationId, session
//         );

//         // Batch enrich items — one Product.find not N+1
//         if (updates.items) {
//           const pIds   = updates.items.map(i => i.productId);
//           const prods  = await Product.find({ _id: { $in: pIds } }).session(session).select('name sku purchasePrice');
//           const pMap   = new Map(prods.map(p => [p._id.toString(), p]));
//           updates.items = updates.items.map(item => {
//             const prod = pMap.get(String(item.productId));
//             return { ...item, name: prod?.name, sku: prod?.sku, purchasePriceAtSale: prod?.purchasePrice ?? null };
//           });
//         }

//         // Delete old revenue journal entries only — NOT payment entries
//         await AccountEntry.deleteMany({
//           referenceId:    old._id,
//           referenceType:  'invoice',
//           organizationId: user.organizationId,
//         }).session(session);

//         await Customer.findByIdAndUpdate(
//           old.customerId,
//           { $inc: { outstandingBalance: -old.grandTotal } },
//           { session }
//         );
//       }

//       Object.assign(old, updates);
//       updatedInvoice = await old.save({ session });

//       if (hasFinancialChange && updatedInvoice.status !== 'draft') {
//         await salesJournalService.postInvoiceJournal({
//           orgId: user.organizationId, branchId: user.branchId,
//           invoice: updatedInvoice, customerId: updatedInvoice.customerId,
//           items: updatedInvoice.items, userId: user._id, session,
//         });

//         await Customer.findByIdAndUpdate(
//           updatedInvoice.customerId,
//           { $inc: { outstandingBalance: updatedInvoice.grandTotal } },
//           { session }
//         );

//         await SalesService.updateFromInvoiceTransactional(updatedInvoice, session);
//       }

//       await this._createAudit({
//         organizationId: user.organizationId,
//         invoiceId: updatedInvoice._id,
//         action: hasFinancialChange ? 'UPDATE_FINANCIAL' : 'UPDATE_INFO',
//         performedBy: user._id,
//         details: hasFinancialChange
//           ? `Financial update. New total: ${updatedInvoice.grandTotal}`
//           : 'Non-financial update',
//         session,
//       });

//     }, 3, { action: 'UPDATE_INVOICE', userId: user._id });

//     return updatedInvoice;
//   }

//   /* ============================================================
//    * 3. CANCEL INVOICE
//    * ============================================================ */
//   static async cancelInvoice(invoiceId, { reason, restock = true, reverseFinancials = true }, user) {
//     if (!reason?.trim()) throw new AppError('Cancellation reason is required', 400);

//     await runInTransaction(async (session) => {
//       const invoice = await Invoice.findOne({
//         _id: invoiceId, organizationId: user.organizationId,
//       }).populate('items.productId').session(session);

//       if (!invoice)                      throw new AppError('Invoice not found', 404);
//       if (invoice.status === 'cancelled') throw new AppError('Invoice already cancelled', 400);

//       // Restore stock — StockService.increment throws on failure (no silent no-ops)
//       if (restock) {
//         await StockService.increment(
//           invoice.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
//           invoice.branchId, user.organizationId, session
//         );
//       }

//       if (reverseFinancials) {
//         await Customer.findByIdAndUpdate(
//           invoice.customerId,
//           { $inc: { totalPurchases: -invoice.grandTotal, outstandingBalance: -invoice.grandTotal } },
//           { session }
//         );

//         await salesJournalService.reverseInvoiceJournal({
//           orgId: user.organizationId, branchId: invoice.branchId,
//           invoice, userId: user._id, session,
//         });
//       }

//       invoice.status = 'cancelled';
//       invoice.notes  = (invoice.notes || '') + `\nCancelled: ${reason}`;
//       await invoice.save({ session });

//       // Update the linked Sales record status too
//       await SalesService.updateFromInvoiceTransactional(invoice, session);

//       await this._createAudit({
//         organizationId: user.organizationId,
//         invoiceId: invoice._id, action: 'CANCEL',
//         performedBy: user._id,
//         details: `Cancelled. Restock: ${restock}. FinancialsReversed: ${reverseFinancials}. Reason: ${reason}`,
//         session,
//       });

//     }, 3, { action: 'CANCEL_INVOICE', userId: user._id });

//     emitToOrg(user.organizationId, 'invoice:cancelled', { invoiceId });
//   }

//   /* ============================================================
//    * 4. ADD PAYMENT
//    * ============================================================ */
//   static async addPayment(invoiceId, paymentData, user) {
//     const { paymentMethod, referenceNumber, transactionId, notes } = paymentData;
//     const amount = Number(paymentData.amount);

//     if (!amount || amount <= 0 || isNaN(amount)) {
//       throw new AppError('Payment amount must be a positive number', 400);
//     }

//     // PATH A: EMI exists
//     const existingEmi = await EMI.findOne({ invoiceId, status: { $ne: 'cancelled' } });
//     if (existingEmi) {
//       await emiService.reconcileExternalPayment({
//         organizationId: user.organizationId,
//         branchId:       user.branchId,
//         invoiceId,
//         amount,
//         paymentMethod:  paymentMethod || 'cash',
//         referenceNumber,
//         transactionId,
//         remarks:        notes || 'Payment added via Invoice Screen',
//         createdBy:      user._id,
//       });
//       return { emi: true };
//     }

//     // PATH B: Standard payment
//     await runInTransaction(async (session) => {
//       const invoice = await Invoice.findOne({
//         _id: invoiceId, organizationId: user.organizationId,
//       }).session(session);

//       if (!invoice)                       throw new AppError('Invoice not found', 404);
//       if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to a cancelled invoice', 400);
//       if (invoice.status === 'paid')      throw new AppError('Invoice is already fully paid', 400);

//       const newPaid = parseFloat((invoice.paidAmount + amount).toFixed(2));
//       if (newPaid > invoice.grandTotal + 0.01) {
//         throw new AppError(
//           `Payment exceeds balance. Maximum: ${parseFloat((invoice.grandTotal - invoice.paidAmount).toFixed(2))}`,
//           400
//         );
//       }

//       const [payment] = await Payment.create([{
//         organizationId:  user.organizationId,
//         branchId:        invoice.branchId,
//         type:            'inflow',
//         customerId:      invoice.customerId,
//         invoiceId:       invoice._id,
//         paymentDate:     new Date(),
//         amount,
//         paymentMethod:   paymentMethod || invoice.paymentMethod || 'cash',
//         transactionMode: 'manual',
//         referenceNumber,
//         transactionId,
//         remarks:         notes || `Payment for Invoice #${invoice.invoiceNumber}`,
//         status:          'completed',
//         allocationStatus: 'fully_allocated',
//         remainingAmount: 0,
//         allocatedTo: [{ type: 'invoice', documentId: invoice._id, amount, allocatedAt: new Date() }],
//         createdBy:       user._id,
//       }], { session, ordered: true });

//       await this._postPaymentJournal({ invoice, payment, userId: user._id, session });

//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         { $inc: { outstandingBalance: -amount } },
//         { session }
//       );

//       invoice.paidAmount    = newPaid;
//       invoice.balanceAmount = parseFloat((invoice.grandTotal - newPaid).toFixed(2));
//       invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
//       if (invoice.balanceAmount <= 0) invoice.status = 'paid';
//       if (paymentMethod) invoice.paymentMethod = paymentMethod;
//       if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;
//       await invoice.save({ session });

//       await this._createAudit({
//         organizationId: user.organizationId,
//         invoiceId: invoice._id, action: 'PAYMENT_ADDED',
//         performedBy: user._id,
//         details: `Payment of ${amount} added. Total paid: ${newPaid}`,
//         session,
//       });

//     }, 3, { action: 'ADD_PAYMENT', userId: user._id });

//     return { emi: false };
//   }

//   /* ============================================================
//    * 5. CONVERT DRAFT TO ACTIVE
//    * ============================================================ */
//   static async convertDraftToActive(invoiceId, user) {
//     await runInTransaction(async (session) => {
//       const invoice = await Invoice.findOne({
//         _id: invoiceId, organizationId: user.organizationId, status: 'draft',
//       }).session(session);
//       if (!invoice) throw new AppError('Draft invoice not found', 404);

//       const validation = await StockValidationService.validateSale(
//         invoice.items, invoice.branchId, user.organizationId, session
//       );
//       if (!validation.isValid) {
//         throw new AppError(`Cannot convert: ${validation.errors.join(', ')}`, 400);
//       }

//       // FIX: Atomic invoice number — no race condition
//       if (invoice.invoiceNumber.startsWith('DRAFT')) {
//         invoice.invoiceNumber = await this._nextInvoiceNumber(user.organizationId, session);
//       }

//       invoice.status      = 'issued';
//       invoice.invoiceDate = new Date();
//       await invoice.save({ session });

//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         {
//           $inc: { totalPurchases: invoice.grandTotal, outstandingBalance: invoice.grandTotal },
//           $set: { lastPurchaseDate: new Date() },
//         },
//         { session }
//       );

//       await salesJournalService.postInvoiceJournal({
//         orgId: user.organizationId, branchId: invoice.branchId,
//         invoice, customerId: invoice.customerId,
//         items: invoice.items, userId: user._id, session,
//       });

//       // Stock deduction happens here — NOT before invoice.save
//       await SalesService.createFromInvoiceTransactional(invoice, session);

//       await this._createAudit({
//         organizationId: user.organizationId,
//         invoiceId: invoice._id, action: 'CONVERT_DRAFT',
//         performedBy: user._id,
//         details: `Draft converted to ${invoice.invoiceNumber}`,
//         session,
//       });

//     }, 3, { action: 'CONVERT_DRAFT', userId: user._id });
//   }

//   /* ============================================================
//    * 6. BULK CANCEL
//    * ============================================================ */
//   static async bulkCancelInvoices(ids, reason, user) {
//     if (!ids?.length)   throw new AppError('Invoice IDs array is required', 400);
//     if (!reason?.trim()) throw new AppError('Reason is required', 400);

//     await runInTransaction(async (session) => {
//       for (const id of ids) {
//         const invoice = await Invoice.findOne({
//           _id: id, organizationId: user.organizationId,
//         }).session(session);
//         if (!invoice || invoice.status === 'cancelled') continue;

//         // FIX: Throws on failure — was silent console.error
//         await StockService.increment(
//           invoice.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
//           invoice.branchId, user.organizationId, session
//         );

//         // FIX: Customer balance was missing in original bulkCancel
//         await Customer.findByIdAndUpdate(
//           invoice.customerId,
//           { $inc: { totalPurchases: -invoice.grandTotal, outstandingBalance: -invoice.grandTotal } },
//           { session }
//         );

//         await salesJournalService.reverseInvoiceJournal({
//           orgId: user.organizationId, branchId: invoice.branchId,
//           invoice, userId: user._id, session,
//         });

//         invoice.status = 'cancelled';
//         invoice.notes  = (invoice.notes || '') + `\nBulk cancelled: ${reason}`;
//         await invoice.save({ session });

//         await this._createAudit({
//           organizationId: user.organizationId,
//           invoiceId: invoice._id, action: 'CANCEL',
//           performedBy: user._id, details: `Bulk cancel. Reason: ${reason}`,
//           session,
//         });
//       }
//     }, 3, { action: 'BULK_CANCEL_INVOICE', userId: user._id });
//   }

//   /* ============================================================
//    * 7. CHECK STOCK
//    * ============================================================ */
//   static async checkStock(items, user) {
//     const validation = await StockValidationService.validateSale(
//       items, user.branchId, user.organizationId
//     );

//     // Batch fetch — one query not N+1
//     const productIds = items.map(i => i.productId);
//     const products   = await Product.find({
//       _id: { $in: productIds }, organizationId: user.organizationId,
//     }).select('name sku sellingPrice inventory');
//     const productMap = new Map(products.map(p => [p._id.toString(), p]));

//     const detailedItems = items.map(item => {
//       const product = productMap.get(String(item.productId));
//       const inv     = product?.inventory?.find(i => String(i.branchId) === String(user.branchId));
//       return {
//         productId:         item.productId,
//         name:              product?.name,
//         sku:               product?.sku,
//         requestedQuantity: item.quantity,
//         availableStock:    inv?.quantity || 0,
//         price:             product?.sellingPrice,
//         isAvailable:       (inv?.quantity || 0) >= item.quantity,
//       };
//     });

//     return { ...validation, items: detailedItems };
//   }

//   /* ============================================================
//    * 8. SEARCH INVOICES
//    * FIX: customerId.name regex never worked — ObjectId at rest
//    * ============================================================ */
//   static async searchInvoices(query, limit, user) {
//     const Customer = require('../../../organization/core/customer.model');
//     const matchingCustomers = await Customer.find({
//       name:           { $regex: query, $options: 'i' },
//       organizationId: user.organizationId,
//     }).select('_id');

//     return Invoice.find({
//       organizationId: user.organizationId,
//       isDeleted:      { $ne: true },
//       $or: [
//         { invoiceNumber: { $regex: query, $options: 'i' } },
//         { notes:         { $regex: query, $options: 'i' } },
//         { customerId:    { $in: matchingCustomers.map(c => c._id) } },
//       ],
//     })
//       .populate('customerId', 'name phone')
//       .sort({ invoiceDate: -1 })
//       .limit(limit);
//   }

//   /* ============================================================
//    * 9. GET INVOICE WITH STOCK
//    * ============================================================ */
//   static async getInvoiceWithStock(invoiceId, user) {
//     const invoice = await Invoice.findOne({
//       _id: invoiceId, organizationId: user.organizationId,
//     }).populate([
//       { path: 'customerId',      select: 'name phone email address' },
//       { path: 'items.productId', select: 'name sku sellingPrice inventory' },
//       { path: 'branchId',        select: 'name code address' },
//       { path: 'createdBy',       select: 'name email' },
//     ]);
//     if (!invoice) throw new AppError('Invoice not found', 404);

//     const itemsWithStock = invoice.items.map(item => {
//       const inv = item.productId?.inventory?.find(
//         i => String(i.branchId) === String(invoice.branchId)
//       );
//       return {
//         ...item.toObject(),
//         currentStock: inv?.quantity || 0,
//         reorderLevel: inv?.reorderLevel || 10,
//         willBeLow:    (inv?.quantity || 0) - item.quantity < (inv?.reorderLevel || 10),
//       };
//     });

//     return { ...invoice.toObject(), items: itemsWithStock };
//   }

//   /* ============================================================
//    * 10. LOW STOCK WARNINGS FOR AN INVOICE
//    * ============================================================ */
//   static async getLowStockWarnings(invoiceId, user) {
//     const invoice = await Invoice.findOne({
//       _id: invoiceId, organizationId: user.organizationId,
//     }).populate('items.productId');
//     if (!invoice) throw new AppError('Invoice not found', 404);

//     return invoice.items
//       .filter(item => item.productId)
//       .flatMap(item => {
//         const inv = item.productId.inventory?.find(
//           i => String(i.branchId) === String(invoice.branchId)
//         );
//         if (inv?.reorderLevel && inv.quantity < inv.reorderLevel) {
//           return [{
//             productId:    item.productId._id,
//             productName:  item.productId.name,
//             currentStock: inv.quantity,
//             reorderLevel: inv.reorderLevel,
//             message:      `${item.productId.name} is below reorder level (${inv.quantity} < ${inv.reorderLevel})`,
//           }];
//         }
//         return [];
//       });
//   }

//   /* ============================================================
//    * 11. SEND EMAIL
//    * ============================================================ */
//   static async sendInvoiceEmail(invoiceId, user) {
//     const invoice = await Invoice.findOne({
//       _id: invoiceId, organizationId: user.organizationId,
//     }).populate('customerId');
//     if (!invoice) throw new AppError('Invoice not found', 404);

//     const email = invoice.customerId?.email;
//     if (!email) throw new AppError('Customer email not found', 400);

//     await this._createAudit({
//       organizationId: user.organizationId,
//       invoiceId:      invoice._id,
//       action:         'EMAIL_SENT',
//       performedBy:    user._id,
//       details:        `Invoice emailed to ${email}`,
//     });

//     return email;
//   }

//   /* ============================================================
//    * 12. AUDIT HISTORY
//    * FIX: original had no organizationId scope
//    * ============================================================ */
//   static async getInvoiceHistory(invoiceId, user) {
//     return InvoiceAudit.find({
//       invoiceId:      invoiceId,
//       organizationId: user.organizationId,
//     })
//       .sort({ createdAt: -1 })
//       .populate('performedBy', 'name email');
//   }

//   /* ============================================================
//    * PRIVATE HELPERS
//    * ============================================================ */

//   static _calculateTotals(enrichedItems, invoiceData) {
//     const subTotal      = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0);
//     const totalDiscount = enrichedItems.reduce((s, i) => s + (i.discount || 0), 0);
//     const totalTax      = enrichedItems.reduce((s, i) => {
//       const base = i.price * i.quantity - (i.discount || 0);
//       return s + ((i.taxRate || 0) / 100) * base;
//     }, 0);
//     const grandTotal = parseFloat((
//       subTotal - totalDiscount + totalTax +
//       (invoiceData.shippingCharges || 0) +
//       (invoiceData.roundOff || 0)
//     ).toFixed(2));
//     return { subTotal, totalDiscount, totalTax, grandTotal };
//   }

//   /**
//    * Atomic sequential invoice number — no race condition.
//    */
//   static async _nextInvoiceNumber(organizationId, session) {
//     const counter = await Counter.findOneAndUpdate(
//       { organizationId, type: 'invoice' },
//       { $inc: { seq: 1 } },
//       { new: true, upsert: true, session }
//     );
//     return `INV-${String(counter.seq).padStart(6, '0')}`;
//   }

//   /**
//    * Payment double-entry journal — batched into one AccountEntry.create.
//    * Routed through JournalService to avoid copy-pasted getOrInitAccount.
//    */
//   static async _postPaymentJournal({ invoice, payment, userId, session }) {
//     if (!payment?.amount || payment.amount <= 0) return;
//     const [assetAcc, arAcc] = await Promise.all([
//       JournalService.getPaymentAssetAccount(invoice.organizationId, payment.paymentMethod, session),
//       JournalService.getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session),
//     ]);
//     const AccountEntry = require('../../core/model/accountEntry.model');
//     await AccountEntry.create([
//       {
//         organizationId: invoice.organizationId, branchId: invoice.branchId,
//         accountId: assetAcc._id, date: payment.paymentDate,
//         debit: payment.amount, credit: 0,
//         description: `Payment for ${invoice.invoiceNumber}`,
//         referenceType: 'payment', referenceId: invoice._id,
//         paymentId: payment._id, createdBy: userId,
//       },
//       {
//         organizationId: invoice.organizationId, branchId: invoice.branchId,
//         accountId: arAcc._id, customerId: invoice.customerId,
//         date: payment.paymentDate, debit: 0, credit: payment.amount,
//         description: `Payment applied to ${invoice.invoiceNumber}`,
//         referenceType: 'payment', referenceId: invoice._id,
//         paymentId: payment._id, createdBy: userId,
//       },
//     ], { session, ordered: true });
//   }

//   /**
//    * Audit log — always includes organizationId.
//    * FIX: every original audit call was missing organizationId.
//    */
//   static async _createAudit({ organizationId, invoiceId, action, performedBy, details, ipAddress, session }) {
//     const opts = session ? { session } : {};
//     await InvoiceAudit.create([{
//       organizationId, invoiceId, action, performedBy,
//       details, ipAddress: ipAddress || '',
//     }], opts);
//   }
// }

// module.exports = InvoiceService;