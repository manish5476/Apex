'use strict';

/**
 * PaymentService
 * ─────────────────────────────────────────────
 * All payment business logic lives here.
 * The controller is only responsible for:
 *   - Parsing / validating HTTP input
 *   - Calling service methods
 *   - Sending HTTP responses
 *
 * Key fixes vs original:
 *   FIX #1 — postPaymentLedger used insertMany without ordered:true inside a transaction
 *   FIX #2 — createPayment had no runInTransaction wrapper (used manual session)
 *   FIX #3 — handlePaymentReversal did not reverse EMI installment paidAt timestamp
 *   FIX #4 — paymentGatewayWebhook double-updated invoice (both here and in allocation service)
 *   FIX #5 — getAccount (local copy) — replaced with JournalService.getOrInitAccount
 *   FIX #6 — updatePayment only handled cancellation but returned success for any update
 */

const mongoose = require('mongoose');

const Payment = require('./payment.model');
const Invoice = require('../billing/invoice.model');
const Purchase = require('../../inventory/core/model/purchase.model');
const Customer = require('../../organization/core/customer.model');
const Supplier = require('../../organization/core/supplier.model');
const EMI = require('./emi.model');
const PendingReconciliation = require('../core/pendingReconciliationModel');

const JournalService = require('../core/journal.service');
const AccountEntry = require('../core/accountEntry.model');
const paymentAllocationService = require('./paymentAllocation.service');
const webhookService = require('../../../modules/webhook/webhook.service');
const { invalidateOpeningBalance } = require('../core/ledgerCache.service');
const AppError = require('../../../core/utils/api/appError');
const { runInTransaction } = require('../../../core/utils/db/runInTransaction');

class PaymentService {

  /* ============================================================
   * 1. CREATE PAYMENT
   * ============================================================ */
  static async createPayment(data, user) {
    const {
      type, amount, customerId, supplierId,
      invoiceId, purchaseId, paymentMethod,
      paymentDate, referenceNumber, transactionId,
    } = data;

    if (!['inflow', 'outflow'].includes(type)) throw new AppError('Invalid payment type', 400);
    if (!amount || amount <= 0) throw new AppError('Amount must be positive', 400);

    let payment;

    await runInTransaction(async (session) => {
      // Create payment document
      [payment] = await Payment.create([{
        organizationId: user.organizationId,
        branchId: user.branchId,
        type,
        amount,
        customerId: customerId || null,
        supplierId: supplierId || null,
        invoiceId: invoiceId || null,
        purchaseId: purchaseId || null,
        paymentMethod,
        paymentDate: paymentDate || new Date(),
        referenceNumber,
        transactionId,
        status: 'completed',
        createdBy: user._id,
      }], { session, ordered: true });

      // Post ledger entries
      await this._postPaymentLedger({ payment, session });

      // Update customer/supplier balance
      if (type === 'inflow' && customerId) {
        await Customer.findByIdAndUpdate(customerId, { $inc: { outstandingBalance: -amount } }, { session });
      }
      if (type === 'outflow' && supplierId) {
        await Supplier.findByIdAndUpdate(supplierId, { $inc: { outstandingBalance: -amount } }, { session });
      }

      // Update invoice
      if (type === 'inflow' && invoiceId) {
        const invoice = await Invoice.findById(invoiceId).session(session);
        if (invoice) {
          invoice.paidAmount = (invoice.paidAmount || 0) + amount;
          invoice.balanceAmount = Math.max(0, invoice.grandTotal - invoice.paidAmount);
          invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
          if (invoice.balanceAmount <= 0) invoice.status = 'paid';
          await invoice.save({ session });
        }
      }

      // Update purchase
      if (type === 'outflow' && purchaseId) {
        const purchase = await Purchase.findById(purchaseId).session(session);
        if (purchase) {
          purchase.paidAmount = (purchase.paidAmount || 0) + amount;
          purchase.balanceAmount = Math.max(0, purchase.grandTotal - purchase.paidAmount);
          purchase.paymentStatus = purchase.balanceAmount <= 0 ? 'paid' : 'partial';
          await purchase.save({ session });
        }
      }

    }, 3, { action: 'CREATE_PAYMENT', userId: user._id });

    await invalidateOpeningBalance(user.organizationId);
    webhookService.triggerEvent('payment.completed', payment, user.organizationId);

    return payment;
  }

  /* ============================================================
   * 2. CANCEL PAYMENT
   * ============================================================ */
  static async cancelPayment(paymentId, user) {
    const payment = await Payment.findOne({
      _id: paymentId, organizationId: user.organizationId,
    });
    if (!payment) throw new AppError('Payment not found', 404);
    if (payment.status !== 'completed') {
      throw new AppError('Only completed payments can be cancelled', 400);
    }

    await runInTransaction(async (session) => {
      await this._reversePayment(payment, session);
      payment.status = 'cancelled';
      payment.updatedBy = user._id;
      await payment.save({ session });
    }, 3, { action: 'CANCEL_PAYMENT', userId: user._id });
  }

  /* ============================================================
   * 3. DELETE PAYMENT (soft delete + reversal)
   * ============================================================ */
  static async deletePayment(paymentId, user) {
    const payment = await Payment.findOne({
      _id: paymentId, organizationId: user.organizationId,
    });
    if (!payment) throw new AppError('Payment not found', 404);

    await runInTransaction(async (session) => {
      await this._reversePayment(payment, session);
      payment.isDeleted = true;
      payment.status = 'cancelled';
      payment.updatedBy = user._id;
      await payment.save({ session });
    }, 3, { action: 'DELETE_PAYMENT', userId: user._id });
  }

  /* ============================================================
   * 4. WEBHOOK PAYMENT (from payment gateway)
   * ============================================================ */
  static async processWebhookPayment(webhookBody) {
    const { event, transaction_id, invoice_id, amount, payment_method, timestamp } = webhookBody;

    // Find invoice by invoiceNumber (webhook sends invoice_id as the number)
    const invoice = await Invoice.findOne({ invoiceNumber: invoice_id }).populate('organizationId');
    if (!invoice) throw new AppError('Invoice not found', 404);

    // Idempotency check — never double-process the same transaction
    const existing = await Payment.findOne({
      transactionId: transaction_id,
      organizationId: invoice.organizationId._id,
    });
    if (existing) return { alreadyProcessed: true, paymentId: existing._id };

    if (event !== 'payment.success') return { acknowledged: true };

    let payment;

    await runInTransaction(async (session) => {
      [payment] = await Payment.create([{
        organizationId: invoice.organizationId._id,
        branchId: invoice.branchId,
        type: 'inflow',
        amount: amount / 100,
        customerId: invoice.customerId,
        invoiceId: invoice._id,
        paymentMethod: this._mapGatewayMethod(payment_method),
        transactionId: transaction_id,
        paymentDate: new Date(timestamp * 1000),
        referenceNumber: transaction_id,
        status: 'completed',
        transactionMode: 'auto',
        createdBy: null,
      }], { session, ordered: true });

      await this._postPaymentLedger({ payment, session });

      await Customer.findByIdAndUpdate(
        invoice.customerId,
        { $inc: { outstandingBalance: -(amount / 100) } },
        { session }
      );

    }, 3, { action: 'WEBHOOK_PAYMENT' });

    // Auto-allocate outside transaction to prevent locking
    try {
      await paymentAllocationService.autoAllocatePayment(payment._id, invoice.organizationId._id);
    } catch (err) {
      console.error('[PAYMENT] Auto-allocation failed after webhook:', err.message);
    }

    return { success: true, paymentId: payment._id };
  }

  /* ============================================================
   * PRIVATE: Post double-entry ledger entries
   *
   * FIX #1: Original used insertMany without ordered:true inside a
   * transaction. With ordered:true, if either entry fails the whole
   * batch fails cleanly and the transaction rolls back.
   * FIX #5: Routes through JournalService.getOrInitAccount
   * instead of the local getAccount copy.
   * ============================================================ */
  static async _postPaymentLedger({ payment, session, reverse = false }) {
    const sign = reverse ? -1 : 1;
    const {
      organizationId, branchId, type, amount,
      customerId, supplierId, paymentMethod,
      _id, paymentDate, createdBy,
    } = payment;

    const assetAcc = await JournalService.getPaymentAssetAccount(organizationId, paymentMethod, session);
    const arAcc = await JournalService.getOrInitAccount(organizationId, 'asset', 'Accounts Receivable', '1200', session);
    const apAcc = await JournalService.getOrInitAccount(organizationId, 'liability', 'Accounts Payable', '2000', session);

    const date = paymentDate || new Date();

    if (type === 'inflow') {
      // Dr Cash/Bank, Cr AR
      await AccountEntry.create([
        {
          organizationId, branchId, accountId: assetAcc._id,
          debit: amount * sign, credit: 0,
          paymentId: _id, date, referenceType: 'payment', referenceId: _id, createdBy,
        },
        {
          organizationId, branchId, accountId: arAcc._id, customerId,
          debit: 0, credit: amount * sign,
          paymentId: _id, date, referenceType: 'payment', referenceId: _id, createdBy,
        },
      ], { session, ordered: true });
    }

    if (type === 'outflow') {
      // Dr AP, Cr Cash/Bank
      await AccountEntry.create([
        {
          organizationId, branchId, accountId: apAcc._id, supplierId,
          debit: amount * sign, credit: 0,
          paymentId: _id, date, referenceType: 'payment', referenceId: _id, createdBy,
        },
        {
          organizationId, branchId, accountId: assetAcc._id,
          debit: 0, credit: amount * sign,
          paymentId: _id, date, referenceType: 'payment', referenceId: _id, createdBy,
        },
      ], { session, ordered: true });
    }
  }

  /* ============================================================
   * PRIVATE: Reverse all financial effects of a payment
   * Used by cancelPayment and deletePayment
   * ============================================================ */
  static async _reversePayment(payment, session) {
    // 1. Reverse ledger
    await this._postPaymentLedger({ payment, session, reverse: true });

    // 2. Reverse customer/supplier balance
    if (payment.type === 'inflow' && payment.customerId) {
      await Customer.findByIdAndUpdate(
        payment.customerId,
        { $inc: { outstandingBalance: payment.amount } },
        { session }
      );
    } else if (payment.type === 'outflow' && payment.supplierId) {
      await Supplier.findByIdAndUpdate(
        payment.supplierId,
        { $inc: { outstandingBalance: payment.amount } },
        { session }
      );
    }

    // 3. Build allocation targets — prefer allocatedTo array, fall back to top-level links
    const targets = payment.allocatedTo?.length > 0
      ? [...payment.allocatedTo]
      : [];

    if (payment.invoiceId && !targets.find(t => String(t.documentId) === String(payment.invoiceId))) {
      targets.push({ type: 'invoice', documentId: payment.invoiceId, amount: payment.amount });
    }
    if (payment.purchaseId && !targets.find(t => String(t.documentId) === String(payment.purchaseId))) {
      targets.push({ type: 'purchase', documentId: payment.purchaseId, amount: payment.amount });
    }

    // 4. Reverse each allocation
    for (const target of targets) {
      if (target.type === 'invoice') {
        const invoice = await Invoice.findById(target.documentId).session(session);
        if (invoice) {
          invoice.paidAmount = Math.max(0, (invoice.paidAmount || 0) - target.amount);
          invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;
          invoice.paymentStatus = invoice.paidAmount === 0 ? 'unpaid' : 'partial';
          if (invoice.status === 'paid') invoice.status = 'issued';
          await invoice.save({ session });
        }
      } else if (target.type === 'purchase') {
        const purchase = await Purchase.findById(target.documentId).session(session);
        if (purchase) {
          purchase.paidAmount = Math.max(0, (purchase.paidAmount || 0) - target.amount);
          purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;
          purchase.paymentStatus = purchase.paidAmount === 0 ? 'unpaid' : 'partial';
          await purchase.save({ session });
        }
      } else if (target.type === 'emi') {
        const emiId = target.emiId || target.documentId;
        const emi = await EMI.findById(emiId).session(session);
        if (emi) {
          const inst = emi.installments.find(i => i.installmentNumber === target.installmentNumber);
          if (inst) {
            inst.paidAmount = Math.max(0, (inst.paidAmount || 0) - target.amount);
            inst.paymentStatus = inst.dueDate < new Date() ? 'overdue' : 'pending';
            inst.paymentId = null;
            inst.paidAt = null; // FIX #3: clear paidAt on reversal
            await emi.save({ session });
          }
        }
      } else if (target.type === 'advance' && payment.customerId) {
        await Customer.findByIdAndUpdate(
          payment.customerId,
          { $inc: { advanceBalance: -target.amount } },
          { session }
        );
      }
    }
  }

  static _mapGatewayMethod(method) {
    const map = { card: 'credit', netbanking: 'bank', upi: 'upi', wallet: 'other', cash: 'cash' };
    return map[method] || 'other';
  }
}

module.exports = PaymentService;