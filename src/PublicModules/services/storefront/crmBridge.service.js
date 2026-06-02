'use strict';

/**
 * StorefrontCRMBridgeService
 * ─────────────────────────────────────────────
 * Single integration point between the Storefront channel and the CRM.
 *
 * ALL CRM record creation/cancellation triggered by storefront events
 * goes through this service. No controller should call CRM models directly.
 *
 * Principles:
 *   - CRM records are created at ORDER PLACEMENT (not at delivery).
 *   - Phone is MANDATORY for CRM customer creation. If missing, the order
 *     still succeeds but crmSyncStatus is set to 'pending_phone'.
 *   - Stock is deducted PER BRANCH (items grouped by branchId).
 *   - Invoice cancellation restores stock and reverses all journals.
 *   - All operations are fully transactional (MongoDB multi-document).
 *   - All methods are idempotent — safe to call multiple times.
 */

const mongoose = require('mongoose');

// ─── CRM Models ──────────────────────────────────────────────────────────────
const Customer = require('../../../modules/organization/core/customer.model');
const Invoice = require('../../../modules/accounting/billing/invoice.model');
const Sales = require('../../../modules/inventory/core/model/sales.model');
const Product = require('../../../modules/inventory/core/model/product.model');
// Note: Counter.model has a space before .js in the original filename
const Counter = require('../../../modules/inventory/core/model/Counter.model .js');

// ─── CRM Services ─────────────────────────────────────────────────────────────
const StockService = require('../../../modules/inventory/core/service/stock.service');
const JournalService = require('../../../modules/inventory/core/service/Journal.service');
const salesJournalService = require('../../../modules/inventory/core/service/salesJournal.service');
const Payment = require('../../../modules/accounting/payments/payment.model');
const Account = require('../../../modules/accounting/core/model/account.model');
const AccountEntry = require('../../../modules/accounting/core/model/accountEntry.model');

// ─── Utilities ────────────────────────────────────────────────────────────────
const AppError = require('../../../core/utils/api/appError');
const { runInTransaction } = require('../../../core/utils/db/runInTransaction');
const { resolvePrimaryBranchId, groupItemsByBranch } = require('../../utils/storefront/branchResolver');

// ─── Storefront Models ────────────────────────────────────────────────────────
const StorefrontCustomer = require('../../models/storefront/storefrontCustomer.model');

// Payment method mapping: Storefront enum → CRM enum
const PAYMENT_METHOD_MAP = {
  COD: 'cash',
  ONLINE: 'upi',
  CARD: 'card',
  UPI: 'upi',
  WALLET: 'upi',
  BANK_TRANSFER: 'bank',
};

class StorefrontCRMBridgeService {

  /* ============================================================
   * 1. ENSURE CRM CUSTOMER
   *
   * Find an existing CRM Customer matching by phone (primary) or
   * email (secondary). If none exists, create one.
   *
   * REQUIREMENT: phone is MANDATORY for CRM customer creation.
   * Returns null if the storefront customer has no phone.
   *
   * @param {string|ObjectId} organizationId
   * @param {Object}          sfCustomer   - StorefrontCustomer doc (plain or mongoose)
   * @param {Object}          [options]
   * @param {Object}          [options.shippingAddress] - Storefront address to map as billing/shipping
   * @returns {Promise<{crmCustomer: Object, created: boolean} | null>}
   * ============================================================ */
  async ensureCRMCustomer(organizationId, sfCustomer, options = {}) {
    const phone = sfCustomer.phone;
    const email = sfCustomer.email;

    // Phone is mandatory — return null to signal CRM sync not possible yet
    if (!phone) return null;

    // Build match query: phone first (unique), then email fallback
    const orConditions = [{ phone }];
    if (email) orConditions.push({ email });

    let crmCustomer = await Customer.findOne({
      organizationId,
      isDeleted: { $ne: true },
      $or: orConditions,
    });

    if (crmCustomer) {
      // Back-fill storefrontId and email if not already set
      let needsSave = false;
      if (!crmCustomer.storefrontId) {
        crmCustomer.storefrontId = sfCustomer._id;
        needsSave = true;
      }
      if (!crmCustomer.email && email) {
        crmCustomer.email = email;
        needsSave = true;
      }
      if (!crmCustomer.tags?.includes('storefront')) {
        crmCustomer.tags = [...new Set([...(crmCustomer.tags || []), 'storefront'])];
        needsSave = true;
      }
      if (needsSave) await crmCustomer.save();
      return { crmCustomer, created: false };
    }

    // Build name: prefer firstName + lastName, fallback to email or generic
    const fullName = [sfCustomer.firstName, sfCustomer.lastName]
      .filter(Boolean).join(' ').trim() || email || 'Storefront Customer';

    // Map storefront address → CRM address format
    let billingAddress, shippingAddress;
    if (options.shippingAddress) {
      const a = options.shippingAddress;
      const mapped = {
        street: [a.addressLine1, a.addressLine2, a.landmark].filter(Boolean).join(', '),
        city: a.city || '',
        state: a.state || '',
        zipCode: a.postalCode || '',
        country: a.country || 'India',
      };
      billingAddress = mapped;
      shippingAddress = mapped;
    }

    try {
      crmCustomer = await Customer.create({
        organizationId,
        type: 'individual',
        name: fullName,
        email: email || null,
        phone,
        avatar: sfCustomer.avatar || null,
        billingAddress,
        shippingAddress,
        source: 'storefront',
        customerType: 'online',
        storefrontId: sfCustomer._id,
        tags: ['storefront'],
        notes: `Auto-created from storefront order. SF Customer ID: ${sfCustomer._id}`,
      });
      return { crmCustomer, created: true };

    } catch (err) {
      if (err.code === 11000) {
        // Race condition — another request created it simultaneously
        crmCustomer = await Customer.findOne({
          organizationId,
          isDeleted: { $ne: true },
          $or: orConditions,
        });
        if (crmCustomer) return { crmCustomer, created: false };
      }
      throw err;
    }
  }

  /* ============================================================
   * 2. CREATE ORDER CRM RECORDS
   *
   * Called at ORDER PLACEMENT. Creates:
   *   - CRM Invoice  (sequential number, source: 'storefront')
   *   - CRM Sales    (linked to invoice, source: 'storefront')
   *   - Stock        (decremented per branch from order item branchIds)
   *   - Journals     (revenue + COGS double-entry)
   *   - Payment      (if order is already paid)
   *
   * Idempotent: if crmInvoiceId already set on the order, returns early.
   *
   * @param {Object}          storefrontOrder - StorefrontOrder doc
   * @param {Object}          crmCustomer     - CRM Customer doc
   * @param {Object|null}     actor           - { _id } or null for system
   * @returns {Promise<{ invoice: Object, sale: Object }>}
   * ============================================================ */
  async createOrderCRMRecords(storefrontOrder, crmCustomer, actor = null, options = {}) {
    // Idempotency: already synced
    if (storefrontOrder.crmInvoiceId) {
      const existing = await Invoice.findById(storefrontOrder.crmInvoiceId).lean();
      const existingSale = await Sales.findOne({ invoiceId: storefrontOrder.crmInvoiceId }).lean();
      if (existing) return { invoice: existing, sale: existingSale };
    }

    if (!crmCustomer) {
      throw new AppError('Cannot create CRM records: CRM customer is required', 400);
    }

    const organizationId = storefrontOrder.organizationId;
    const actorId = actor?._id || null;

    // Resolve primary branch for accounting records
    const primaryBranchId = await resolvePrimaryBranchId(storefrontOrder);

    // Enrich items with purchasePriceAtSale from Product catalog
    // This is critical — NEVER hardcode 0, it corrupts profit analytics
    const productIds = storefrontOrder.items.map(i => i.productId).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds }, organizationId })
      .select('name sku purchasePrice inventory hsnCode');
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const totalOrderDiscount = storefrontOrder.totals?.discount || 0;
    const orderSubtotal = storefrontOrder.totals?.subtotal || 1; // avoid div by 0
    let remainingDiscount = totalOrderDiscount;

    // Build CRM invoice items and distribute global discount proportionally
    const invoiceItems = storefrontOrder.items.map((item, index) => {
      const product = productMap.get(item.productId?.toString());

      const lineTotal = item.unitPrice * item.quantity;
      let lineDiscount = 0;

      if (totalOrderDiscount > 0) {
        if (index === storefrontOrder.items.length - 1) {
          lineDiscount = remainingDiscount; // Assign remainder to last item
        } else {
          const ratio = lineTotal / orderSubtotal;
          lineDiscount = Number((totalOrderDiscount * ratio).toFixed(2));
          remainingDiscount -= lineDiscount;
        }
      }

      return {
        productId: item.productId,
        name: item.snapshot?.name || product?.name || 'Product',
        hsnCode: item.snapshot?.hsnCode || product?.hsnCode || '',
        quantity: item.quantity,
        originalQuantity: item.quantity,
        unit: 'pcs',
        price: item.unitPrice,
        discount: lineDiscount,
        // Storefront cart forces tax=0 currently. We must match it to prevent grandTotal mismatch.
        taxRate: 0,
        // Sourced from product catalog — never hardcoded. Null = cost unknown.
        purchasePriceAtSale: product?.purchasePrice ?? null,
      };
    });

    const crmPaymentMethod = PAYMENT_METHOD_MAP[storefrontOrder.paymentMethod] || 'cash';
    const grandTotal = storefrontOrder.totals?.grandTotal || 0;
    const paidAmount = storefrontOrder.paymentStatus === 'paid' ? grandTotal : 0;
    const addressToStr = (addr) => addr
      ? Object.values(addr).filter(v => typeof v === 'string' && v.trim()).join(', ')
      : '';

    let finalInvoice, finalSale;

    await runInTransaction(async (session) => {
      // ── Step 1: Sequential invoice number ───────────────────────────
      const counter = await Counter.findOneAndUpdate(
        { organizationId, type: 'invoice' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session }
      );
      const invoiceNumber = `INV-${String(counter.seq).padStart(6, '0')}`;

      // Derive payment/status
      const paymentStatus = paidAmount >= grandTotal && paidAmount > 0 ? 'paid'
        : paidAmount > 0 ? 'partial' : 'unpaid';
      const invoiceStatus = paymentStatus === 'paid' ? 'paid' : 'issued';

      // ── Step 2: Create CRM Invoice ───────────────────────────────────
      const [invoice] = await Invoice.create([{
        organizationId,
        branchId: primaryBranchId,
        customerId: crmCustomer._id,
        invoiceNumber,
        invoiceDate: storefrontOrder.createdAt || new Date(),
        status: invoiceStatus,
        source: 'storefront',
        storefrontOrderId: storefrontOrder._id,
        billingAddress: addressToStr(storefrontOrder.billingAddress),
        shippingAddress: addressToStr(storefrontOrder.shippingAddress),
        items: invoiceItems,
        shippingCharges: storefrontOrder.totals?.shipping || 0,
        paidAmount,
        paymentMethod: crmPaymentMethod,
        notes: `Storefront Order: ${storefrontOrder.orderNumber}`,
        createdBy: actorId,
      }], { session, ordered: true });

      // ── Step 3: Stock deduction per branch ─────────────────────────
      // Each product is deducted from its own branch, not a single combined branch
      if (!options.skipStockDeduction) {
        const branchGroups = groupItemsByBranch(storefrontOrder.items, primaryBranchId);
        for (const [branchId, items] of branchGroups) {
          await StockService.decrement(items, branchId, organizationId, session);
        }
      }

      // ── Step 4: Build Sales items with COGS data ───────────────────
      const salesItems = invoiceItems.map(i => {
        const qty = i.quantity;
        const rate = i.price;
        const discount = i.discount || 0;
        const taxRate = i.taxRate || 0;
        const lineTax = (taxRate / 100) * (qty * rate - discount);
        const lineTotal = parseFloat((qty * rate - discount + lineTax).toFixed(2));
        return {
          productId: i.productId,
          name: i.name,
          sku: i.hsnCode || '',
          qty,
          originalQty: qty,
          rate,
          discount,
          purchasePriceAtSale: i.purchasePriceAtSale,
          tax: lineTax,
          lineTotal: isNaN(lineTotal) ? 0 : lineTotal,
        };
      });

      // ── Step 5: Create CRM Sales record ────────────────────────────
      const [sale] = await Sales.create([{
        organizationId,
        branchId: primaryBranchId,
        invoiceId: invoice._id,
        invoiceNumber,
        customerId: crmCustomer._id,
        items: salesItems,
        subTotal: invoice.subTotal || 0,
        taxTotal: invoice.totalTax || 0,
        discountTotal: invoice.totalDiscount || 0,
        totalAmount: invoice.grandTotal || 0,
        paidAmount,
        dueAmount: (invoice.grandTotal || 0) - paidAmount,
        paymentStatus,
        status: 'active',
        source: 'storefront',
        storefrontOrderId: storefrontOrder._id,
        createdBy: actorId,
        meta: {
          source: 'storefront',
          orderNumber: storefrontOrder.orderNumber,
          orderRef: storefrontOrder._id,
        },
      }], { session, ordered: true });

      // Update invoice with saleId back-reference
      await Invoice.findByIdAndUpdate(invoice._id, { saleId: sale._id }, { session });

      // ── Step 6: Revenue journal (Debit AR / Credit Sales / Credit Tax) ──
      await salesJournalService.postInvoiceJournal({
        orgId: organizationId,
        branchId: primaryBranchId,
        invoice,
        customerId: crmCustomer._id,
        items: invoiceItems,
        userId: actorId,
        session,
      });

      // ── Step 7: COGS journal (Debit COGS / Credit Inventory) ───────
      let totalCogs = 0;
      for (const item of salesItems) {
        if (item.purchasePriceAtSale != null) {
          totalCogs += item.qty * item.purchasePriceAtSale;
        } else {
          console.warn(
            `[CRMBridge] Missing purchasePriceAtSale for product ${item.productId} ` +
            `in storefront order ${storefrontOrder.orderNumber}. COGS not booked for this item.`
          );
        }
      }
      if (totalCogs > 0) {
        await JournalService.postCOGSJournal({
          orgId: organizationId,
          branchId: primaryBranchId,
          sale,
          totalCogs,
          userId: actorId,
          session,
        });
      }

      // ── Step 8: Payment record (if already paid online) ──────────
      if (paidAmount > 0) {
        const assetAcc = await JournalService.getPaymentAssetAccount(organizationId, crmPaymentMethod, session);
        const arAcc = await JournalService.getOrInitAccount(organizationId, 'asset', 'Accounts Receivable', '1200', session);

        const [payment] = await Payment.create([{
          organizationId,
          branchId: primaryBranchId,
          type: 'inflow',
          customerId: crmCustomer._id,
          invoiceId: invoice._id,
          paymentDate: new Date(),
          amount: paidAmount,
          paymentMethod: crmPaymentMethod,
          transactionMode: 'auto',
          remarks: `Online payment for storefront order ${storefrontOrder.orderNumber}`,
          status: 'completed',
          allocationStatus: 'fully_allocated',
          remainingAmount: 0,
          allocatedTo: [{ type: 'invoice', documentId: invoice._id, amount: paidAmount, allocatedAt: new Date() }],
          createdBy: actorId,
        }], { session, ordered: true });

        // Payment journal: Debit Asset / Credit AR
        await AccountEntry.create([
          {
            organizationId, branchId: primaryBranchId,
            accountId: assetAcc._id, date: payment.paymentDate,
            debit: paidAmount, credit: 0,
            description: `Online payment: ${storefrontOrder.orderNumber}`,
            referenceType: 'payment', referenceId: invoice._id,
            paymentId: payment._id, createdBy: actorId,
          },
          {
            organizationId, branchId: primaryBranchId,
            accountId: arAcc._id, date: payment.paymentDate,
            debit: 0, credit: paidAmount,
            description: `AR cleared: ${storefrontOrder.orderNumber}`,
            referenceType: 'payment', referenceId: invoice._id,
            paymentId: payment._id, createdBy: actorId,
          },
        ], { session, ordered: true });
      }

      // ── Step 9: Update CRM Customer stats ────────────────────────
      await Customer.findByIdAndUpdate(
        crmCustomer._id,
        {
          $inc: {
            totalPurchases: invoice.grandTotal,
            outstandingBalance: (invoice.grandTotal - paidAmount),
            invoiceCount: 1
          },
          $set: { lastPurchaseDate: new Date() },
        },
        { session }
      );

      finalInvoice = invoice;
      finalSale = sale;
    }, 3, { action: 'SF_CREATE_CRM_RECORDS', orderNumber: storefrontOrder.orderNumber });

    return { invoice: finalInvoice, sale: finalSale };
  }

  /* ============================================================
   * 3. CANCEL ORDER CRM RECORDS
   *
   * Called when a storefront order is cancelled. Reverses:
   *   - Stock (incremented per branch back to original levels)
   *   - Revenue journal (credit note entries)
   *   - COGS journal (reversal entries)
   *   - Customer outstanding balance
   *   - Invoice status → 'cancelled'
   *   - Sales status   → 'cancelled'
   *
   * Safe to call multiple times — checks status before acting.
   *
   * @param {Object} storefrontOrder - StorefrontOrder with crmInvoiceId
   * @param {Object|null} actor
   * ============================================================ */
  async cancelOrderCRMRecords(storefrontOrder, actor = null) {
    const crmInvoiceId = storefrontOrder.crmInvoiceId;
    if (!crmInvoiceId) return; // Nothing to cancel

    const organizationId = storefrontOrder.organizationId;
    const actorId = actor?._id || null;

    await runInTransaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: crmInvoiceId, organizationId }).session(session);
      if (!invoice || invoice.status === 'cancelled') return;

      // ── Step 1: Restore stock per branch ─────────────────────────
      const primaryBranchId = invoice.branchId;
      const branchGroups = groupItemsByBranch(storefrontOrder.items, primaryBranchId);
      for (const [branchId, items] of branchGroups) {
        await StockService.increment(items, branchId, organizationId, session);
      }

      // ── Step 2: Reverse revenue journals ─────────────────────────
      // Use JournalService directly (salesJournalService.reverseInvoiceJournal
      // has a missing import bug in the original file — we bypass it)
      const [arAcc, salesAcc] = await Promise.all([
        JournalService.getOrInitAccount(organizationId, 'asset', 'Accounts Receivable', '1200', session),
        JournalService.getOrInitAccount(organizationId, 'income', 'Sales', '4000', session),
      ]);

      const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);
      const cnEntries = [
        {
          organizationId, branchId: primaryBranchId,
          accountId: salesAcc._id, date: new Date(),
          debit: netRevenue, credit: 0,
          description: `Cancel Revenue: ${invoice.invoiceNumber}`,
          referenceType: 'credit_note', referenceId: invoice._id, createdBy: actorId,
        },
        {
          organizationId, branchId: primaryBranchId,
          accountId: arAcc._id, date: new Date(),
          debit: 0, credit: invoice.grandTotal,
          description: `Cancel AR: ${invoice.invoiceNumber}`,
          referenceType: 'credit_note', referenceId: invoice._id, createdBy: actorId,
        },
      ];

      if (invoice.totalTax > 0) {
        const taxAcc = await JournalService.getOrInitAccount(organizationId, 'liability', 'Tax Payable', '2100', session);
        cnEntries.push({
          organizationId, branchId: primaryBranchId,
          accountId: taxAcc._id, date: new Date(),
          debit: invoice.totalTax, credit: 0,
          description: `Cancel Tax: ${invoice.invoiceNumber}`,
          referenceType: 'credit_note', referenceId: invoice._id, createdBy: actorId,
        });
      }
      await AccountEntry.create(cnEntries, { session, ordered: true });

      // ── Step 3: Reverse COGS ──────────────────────────────────────
      const sale = await Sales.findOne({ invoiceId: invoice._id }).session(session);
      if (sale) {
        let totalCogs = 0;
        for (const item of sale.items) {
          if (item.purchasePriceAtSale != null) totalCogs += item.qty * item.purchasePriceAtSale;
        }
        if (totalCogs > 0) {
          await JournalService.reverseCOGSJournal({
            orgId: organizationId,
            branchId: primaryBranchId,
            sale,
            totalCogs,
            userId: actorId,
            session,
          });
        }
        sale.status = 'cancelled';
        await sale.save({ session });
      }

      // ── Step 4: Reverse customer stats ───────────────────────────
      if (invoice.customerId) {
        await Customer.findByIdAndUpdate(
          invoice.customerId,
          {
            $inc: {
              totalPurchases: -invoice.grandTotal,
              outstandingBalance: -(invoice.grandTotal - (invoice.paidAmount || 0)),
            },
          },
          { session }
        );
      }

      // ── Step 5: Cancel invoice ─────────────────────────────────
      invoice.status = 'cancelled';
      invoice.notes = (invoice.notes || '') +
        `\nCancelled via storefront order: ${storefrontOrder.orderNumber}`;
      await invoice.save({ session });

    }, 3, { action: 'SF_CANCEL_CRM_RECORDS', orderNumber: storefrontOrder.orderNumber });
  }

  /* ============================================================
   * 4. SYNC STOREFRONT CUSTOMER → CRM
   *
   * Called after ensureCRMCustomer resolves. Updates the
   * StorefrontCustomer record to mark it as linked.
   *
   * @param {string|ObjectId} sfCustomerId
   * @param {Object}          crmCustomer
   * ============================================================ */
  async syncStorefrontCustomerLink(sfCustomerId, crmCustomer) {
    await StorefrontCustomer.findByIdAndUpdate(sfCustomerId, {
      $set: {
        linkedCustomerId: crmCustomer._id,
        convertedToMainCustomer: true,
        crmSyncedAt: new Date(),
      },
    });
  }

  /* ============================================================
   * 5. SYNC PAYMENT TO CRM
   *
   * Called when an existing Storefront Order is marked as 'paid'
   * after the CRM records were already created (e.g. COD or manual).
   *
   * @param {Object} storefrontOrder - StorefrontOrder with crmInvoiceId
   * @param {Object|null} actor
   * ============================================================ */
  async syncPaymentToCRM(storefrontOrder, actor = null) {
    if (!storefrontOrder.crmInvoiceId || storefrontOrder.paymentStatus !== 'paid') return;

    const organizationId = storefrontOrder.organizationId;
    const actorId = actor?._id || null;
    const grandTotal = storefrontOrder.totals?.grandTotal || 0;

    if (grandTotal <= 0) return;
    const crmPaymentMethod = PAYMENT_METHOD_MAP[storefrontOrder.paymentMethod] || 'cash';

    await runInTransaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: storefrontOrder.crmInvoiceId, organizationId }).session(session);
      if (!invoice || invoice.paidAmount >= grandTotal) return; // Already paid in CRM

      const amountToPay = grandTotal - (invoice.paidAmount || 0);

      const assetAcc = await JournalService.getPaymentAssetAccount(organizationId, crmPaymentMethod, session);
      const arAcc = await JournalService.getOrInitAccount(organizationId, 'asset', 'Accounts Receivable', '1200', session);

      const [payment] = await Payment.create([{
        organizationId,
        branchId: invoice.branchId,
        type: 'inflow',
        customerId: invoice.customerId,
        invoiceId: invoice._id,
        paymentDate: new Date(),
        amount: amountToPay,
        paymentMethod: crmPaymentMethod,
        transactionMode: 'auto',
        remarks: `Late payment collected for storefront order ${storefrontOrder.orderNumber}`,
        status: 'completed',
        allocationStatus: 'fully_allocated',
        remainingAmount: 0,
        allocatedTo: [{ type: 'invoice', documentId: invoice._id, amount: amountToPay, allocatedAt: new Date() }],
        createdBy: actorId,
      }], { session, ordered: true });

      await AccountEntry.create([
        {
          organizationId, branchId: invoice.branchId,
          accountId: assetAcc._id, date: payment.paymentDate,
          debit: amountToPay, credit: 0,
          description: `Payment collected: ${storefrontOrder.orderNumber}`,
          referenceType: 'payment', referenceId: invoice._id,
          paymentId: payment._id, createdBy: actorId,
        },
        {
          organizationId, branchId: invoice.branchId,
          accountId: arAcc._id, date: payment.paymentDate,
          debit: 0, credit: amountToPay,
          description: `AR cleared: ${storefrontOrder.orderNumber}`,
          referenceType: 'payment', referenceId: invoice._id,
          paymentId: payment._id, createdBy: actorId,
        },
      ], { session, ordered: true });

      // Update invoice
      invoice.paidAmount = grandTotal;
      invoice.paymentStatus = 'paid';
      invoice.status = 'paid';
      await invoice.save({ session });
      if (invoice.saleId) {
        await Sales.findByIdAndUpdate(invoice.saleId, { paidAmount: grandTotal, dueAmount: 0, paymentStatus: 'paid' }, { session });
      }
      if (invoice.customerId) {
        await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -amountToPay } }, { session });
      }

    }, 3, { action: 'SF_SYNC_PAYMENT', orderNumber: storefrontOrder.orderNumber });
  }
}

module.exports = new StorefrontCRMBridgeService();
