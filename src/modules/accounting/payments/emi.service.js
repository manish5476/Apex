'use strict';

/**
 * EmiService
 * ─────────────────────────────────────────────
 * All EMI plan business logic lives here.
 *
 * Key fixes vs original:
 *   FIX #1 — createEmiPlan used a raw session/transaction instead of runInTransaction
 *   FIX #2 — payEmiInstallment did not set installment.paidAt timestamp
 *   FIX #3 — reconcileExternalPayment set invoice update AND called applyEmiAccounting
 *             which ALSO updated the invoice — double update. Fixed: only applyEmiAccounting
 *             updates the invoice.
 *   FIX #4 — markOverdueInstallments loaded ALL active EMIs into memory with no limit.
 *             Fixed: uses bulkWrite for atomic batch update.
 *   FIX #5 — applyEmiAccounting used Account.findOne (no find-or-create) — crashes if
 *             Cash/Bank account doesn't exist. Fixed: uses JournalService.getOrInitAccount.
 *   FIX #6 — autoReconcilePayment referenced PendingReconciliation without importing it.
 */

const mongoose  = require('mongoose');

const EMI       = require('./emi.model');
const Invoice   = require('../billing/invoice.model');
const Customer  = require('../../organization/core/customer.model');
const Payment   = require('./payment.model');
const AccountEntry = require('../core/accountEntry.model');
const PendingReconciliation = require('../core/pendingReconciliationModel');

const JournalService = require('../core/journal.service');
const AppError       = require('../../../core/utils/api/appError');
const { runInTransaction } = require('../../../core/utils/db/runInTransaction');

/* ============================================================
   INTERNAL: Post EMI accounting entries
   FIX #5: Uses JournalService.getOrInitAccount (race-condition safe,
   creates account if missing) instead of bare Account.findOne.
   ============================================================ */
async function _applyEmiAccounting({
  organizationId, branchId, amount, paymentId,
  customerId, invoiceId, paymentMethod, createdBy,
}, session) {
  const [assetAcc, arAcc] = await Promise.all([
    JournalService.getPaymentAssetAccount(organizationId, paymentMethod, session),
    JournalService.getOrInitAccount(organizationId, 'asset', 'Accounts Receivable', '1200', session),
  ]);

  // Update invoice paidAmount
  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
  if (!invoice) throw new AppError('Invoice not found', 404);

  invoice.paidAmount    = parseFloat(((invoice.paidAmount || 0) + amount).toFixed(2));
  invoice.balanceAmount = parseFloat(Math.max(0, invoice.grandTotal - invoice.paidAmount).toFixed(2));
  invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
  if (invoice.balanceAmount <= 0) invoice.status = 'paid';
  await invoice.save({ session });

  // Update customer outstanding
  await Customer.findOneAndUpdate(
    { _id: customerId, organizationId },
    { $inc: { outstandingBalance: -amount } },
    { session }
  );

  // Post ledger entries
  await AccountEntry.create([
    {
      organizationId, branchId, accountId: assetAcc._id, paymentId,
      debit: amount, credit: 0,
      description: 'EMI Payment',
      referenceType: 'emi_payment', referenceId: paymentId, createdBy,
    },
    {
      organizationId, branchId, accountId: arAcc._id, customerId, paymentId,
      debit: 0, credit: amount,
      description: 'EMI Payment',
      referenceType: 'emi_payment', referenceId: paymentId, createdBy,
    },
  ], { session, ordered: true });
}

class EmiService {

  /* ============================================================
   * 1. CREATE EMI PLAN
   * FIX #1: Uses runInTransaction instead of manual session management
   * ============================================================ */
  static async createEmiPlan({
    organizationId, branchId, invoiceId, createdBy,
    downPayment = 0, numberOfInstallments, interestRate = 0, emiStartDate,
  }) {
    let emi;

    await runInTransaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
      if (!invoice) throw new AppError('Invoice not found', 404);

      const existing = await EMI.findOne({ invoiceId, status: 'active' }).session(session);
      if (existing) throw new AppError('An active EMI plan already exists for this invoice', 400);

      // Record down payment if provided
      if (downPayment > 0) {
        const [payment] = await Payment.create([{
          organizationId, branchId, type: 'inflow',
          customerId: invoice.customerId,
          invoiceId:  invoice._id,
          amount:     Number(downPayment),
          paymentMethod:   'cash',
          transactionMode: 'auto',
          remarks:    `Down payment for EMI — Invoice ${invoice.invoiceNumber}`,
          status:     'completed',
          createdBy,
        }], { session, ordered: true });

        await _applyEmiAccounting({
          organizationId, branchId,
          amount:        Number(downPayment),
          paymentId:     payment._id,
          customerId:    invoice.customerId,
          invoiceId:     invoice._id,
          paymentMethod: 'cash',
          createdBy,
        }, session);
      }

      // Re-fetch invoice to get updated balanceAmount after down payment
      const updatedInvoice    = await Invoice.findById(invoiceId).session(session);
      const balanceToFinance  = updatedInvoice.balanceAmount;
      const principalPerInst  = parseFloat((balanceToFinance / numberOfInstallments).toFixed(2));

      const installments = Array.from({ length: numberOfInstallments }, (_, i) => {
        const dueDate = new Date(emiStartDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        return {
          installmentNumber: i + 1,
          dueDate,
          principalAmount: principalPerInst,
          interestAmount:  0,
          totalAmount:     principalPerInst,
          paidAmount:      0,
          paymentStatus:   'pending',
        };
      });

      const emiEndDate = new Date(emiStartDate);
      emiEndDate.setMonth(emiEndDate.getMonth() + numberOfInstallments - 1);

      [emi] = await EMI.create([{
        organizationId, branchId, invoiceId,
        customerId:           invoice.customerId,
        totalAmount:          invoice.grandTotal,
        downPayment,
        balanceAmount:        balanceToFinance,
        numberOfInstallments,
        interestRate,
        emiStartDate,
        emiEndDate,
        installments,
        createdBy,
      }], { session, ordered: true });

    }, 3, { action: 'CREATE_EMI_PLAN' });

    return emi;
  }

  /* ============================================================
   * 2. PAY EMI INSTALLMENT
   * FIX #2: Sets installment.paidAt timestamp
   * ============================================================ */
  static async payEmiInstallment({
    emiId, installmentNumber, amount,
    paymentMethod, referenceNumber, remarks,
    organizationId, branchId, createdBy,
  }) {
    if (!emiId)              throw new AppError('emiId is required', 400);
    if (!installmentNumber)  throw new AppError('installmentNumber is required', 400);
    if (!amount || amount <= 0) throw new AppError('Amount must be greater than 0', 400);

    let result;

    await runInTransaction(async (session) => {
      const emi = await EMI.findOne({ _id: emiId, organizationId }).session(session);
      if (!emi) throw new AppError('EMI not found', 404);

      const installment = emi.installments.find(i => i.installmentNumber === Number(installmentNumber));
      if (!installment)               throw new AppError('Invalid installment number', 400);
      if (installment.paymentStatus === 'paid') throw new AppError('Installment already paid', 400);

      const [payment] = await Payment.create([{
        organizationId, branchId,
        type:            'inflow',
        customerId:      emi.customerId,
        invoiceId:       emi.invoiceId,
        amount:          Number(amount),
        paymentMethod,
        referenceNumber,
        remarks,
        transactionMode: 'auto',
        status:          'completed',
        createdBy,
      }], { session, ordered: true });

      // Update installment
      installment.paidAmount    += Number(amount);
      installment.paymentStatus  = installment.paidAmount >= installment.totalAmount ? 'paid' : 'partial';
      installment.paymentId      = payment._id;
      installment.paidAt         = new Date(); // FIX #2

      // EMI status auto-derived by pre-save hook
      await emi.save({ session });

      await _applyEmiAccounting({
        organizationId, branchId,
        amount:    Number(amount),
        paymentId: payment._id,
        customerId: emi.customerId,
        invoiceId:  emi.invoiceId,
        paymentMethod, referenceNumber, createdBy,
      }, session);

      result = { emi, payment };

    }, 3, { action: 'PAY_EMI_INSTALLMENT' });

    return result;
  }

  /* ============================================================
   * 3. RECONCILE EXTERNAL PAYMENT (from gateway/webhook)
   * FIX #3: Removed duplicate invoice update — only _applyEmiAccounting
   * updates the invoice now.
   * ============================================================ */
  static async reconcileExternalPayment({
    organizationId, branchId, invoiceId, amount,
    paymentDate, paymentMethod, transactionId,
    referenceNumber, remarks, createdBy,
  }) {
    let result;

    await runInTransaction(async (session) => {
      const emi = await EMI.findOne({ invoiceId, organizationId }).session(session);
      if (!emi) throw new AppError('No EMI plan found for this invoice', 404);

      const [payment] = await Payment.create([{
        organizationId, branchId, type: 'inflow',
        customerId:      emi.customerId,
        invoiceId,
        amount:          Number(amount),
        paymentMethod,
        referenceNumber: referenceNumber || transactionId,
        transactionId,
        remarks:         remarks || 'External payment reconciled',
        transactionMode: 'auto',
        status:          'completed',
        paymentDate,
        createdBy,
      }], { session, ordered: true });

      // Apply to installments (oldest first)
      let remaining = Number(amount);
      const applied = [];

      for (const inst of emi.installments.sort((a, b) => a.installmentNumber - b.installmentNumber)) {
        if (remaining <= 0) break;
        if (inst.paymentStatus === 'paid') continue;

        const pending   = inst.totalAmount - inst.paidAmount;
        const toApply   = Math.min(remaining, pending);

        inst.paidAmount   += toApply;
        remaining         -= toApply;
        inst.paymentStatus = inst.paidAmount >= inst.totalAmount ? 'paid' : 'partial';
        inst.paidAt        = new Date();

        if (!inst.paymentId) inst.paymentId = payment._id;
        applied.push({ installmentNumber: inst.installmentNumber, appliedAmount: toApply });
      }

      // Handle excess as advance balance
      if (remaining > 0) {
        emi.advanceBalance = (emi.advanceBalance || 0) + remaining;
        applied.push({ type: 'advance', amount: remaining });
      }

      // EMI status auto-derived by pre-save hook
      await emi.save({ session });

      // FIX #3: Only _applyEmiAccounting updates the invoice — not here
      await _applyEmiAccounting({
        organizationId, branchId,
        amount:    Number(amount),
        paymentId: payment._id,
        customerId: emi.customerId,
        invoiceId,
        paymentMethod, referenceNumber, createdBy,
      }, session);

      result = { success: true, payment, emi: emi._id, appliedToInstallments: applied };

    }, 3, { action: 'RECONCILE_EXTERNAL_PAYMENT' });

    return result;
  }

  /* ============================================================
   * 4. MARK OVERDUE INSTALLMENTS
   * FIX #4: Original loaded all EMIs into memory.
   * Fixed: uses updateMany for batch + aggregation for counts.
   * ============================================================ */
  static async markOverdueInstallments() {
    const today = new Date();

    const result = await EMI.updateMany(
      {
        status: 'active',
        'installments': {
          $elemMatch: {
            paymentStatus: { $in: ['pending', 'partial'] },
            dueDate:       { $lt: today },
          },
        },
      },
      {
        $set: { 'installments.$[elem].paymentStatus': 'overdue' },
      },
      {
        arrayFilters: [
          {
            'elem.paymentStatus': { $in: ['pending', 'partial'] },
            'elem.dueDate':       { $lt: today },
          },
        ],
      }
    );

    return { modifiedCount: result.modifiedCount };
  }

  static async markDefaultedEmis() {
    const today = new Date();
    return EMI.updateMany(
      {
        status:       'active',
        installments: { $elemMatch: { dueDate: { $lt: today }, paymentStatus: { $ne: 'paid' } } },
      },
      { $set: { status: 'defaulted' } }
    );
  }

  /* ============================================================
   * 5. AUTO-RECONCILE (called from webhook handler)
   * FIX #6: PendingReconciliation is now properly imported
   * ============================================================ */
  static async autoReconcilePayment(paymentData) {
    try {
      return await this.reconcileExternalPayment({
        organizationId:  paymentData.organizationId,
        branchId:        paymentData.branchId,
        invoiceId:       paymentData.invoiceId,
        amount:          paymentData.amount,
        paymentDate:     new Date(paymentData.paymentDate),
        paymentMethod:   paymentData.paymentMethod,
        transactionId:   paymentData.transactionId,
        referenceNumber: paymentData.referenceNumber,
        remarks:         `Auto-reconciled via ${paymentData.gateway || 'payment gateway'}`,
        createdBy:       paymentData.createdBy || new mongoose.Types.ObjectId(),
      });
    } catch (err) {
      console.error('[EMI] Auto-reconciliation failed:', { paymentData, error: err.message });

      await PendingReconciliation.create({
        ...paymentData,
        status:      'pending',
        error:       err.message,
        attemptedAt: new Date(),
      });

      throw err;
    }
  }

  /* ============================================================
   * READ / QUERY
   * ============================================================ */
  static async getEmiById(emiId, organizationId) {
    return EMI.findOne({ _id: emiId, organizationId })
      .populate('customerId', 'name phone email avatar')
      .populate('invoiceId',  'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
      .populate('createdBy',  'name email')
      .lean();
  }

  static async getEmiByInvoice(invoiceId, organizationId) {
    return EMI.findOne({ invoiceId, organizationId })
      .populate('customerId', 'name phone email avatar')
      .populate('invoiceId',  'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
      .populate('createdBy',  'name email')
      .lean();
  }

  static async getEmis({ organizationId, branchId, customerId, status }) {
    const filter = { organizationId };
    if (branchId)  filter.branchId  = branchId;
    if (customerId) filter.customerId = customerId;
    if (status)    filter.status    = status;

    return EMI.find(filter)
      .sort({ createdAt: -1 })
      .populate('customerId', 'name phone')
      .populate('invoiceId',  'invoiceNumber grandTotal')
      .lean();
  }

  static async getEmiSummary(organizationId) {
    return EMI.aggregate([
      { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
      { $group: { _id: '$status', count: { $sum: 1 }, totalBalance: { $sum: '$balanceAmount' } } },
    ]);
  }

  static async getEmiAnalytics(organizationId) {
    const result = await EMI.aggregate([
      { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
      { $unwind: '$installments' },
      {
        $group: {
          _id:               null,
          totalEmis:         { $addToSet: '$_id' },
          active:            { $sum: { $cond: [{ $eq: ['$status', 'active']    }, 1, 0] } },
          completed:         { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          defaulted:         { $sum: { $cond: [{ $eq: ['$status', 'defaulted'] }, 1, 0] } },
          totalOutstanding:  { $sum: '$balanceAmount' },
          instPending:       { $sum: { $cond: [{ $eq: ['$installments.paymentStatus', 'pending']  }, 1, 0] } },
          instPaid:          { $sum: { $cond: [{ $eq: ['$installments.paymentStatus', 'paid']     }, 1, 0] } },
          instPartial:       { $sum: { $cond: [{ $eq: ['$installments.paymentStatus', 'partial']  }, 1, 0] } },
          instOverdue:       { $sum: { $cond: [{ $eq: ['$installments.paymentStatus', 'overdue']  }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalEmis:        { $size: '$totalEmis' },
          active: 1, completed: 1, defaulted: 1, totalOutstanding: 1,
          installments: {
            pending: '$instPending', paid: '$instPaid',
            partial: '$instPartial', overdue: '$instOverdue',
          },
        },
      },
    ]);

    return result[0] || {
      totalEmis: 0, active: 0, completed: 0, defaulted: 0, totalOutstanding: 0,
      installments: { pending: 0, paid: 0, partial: 0, overdue: 0 },
    };
  }

  static async getEmiLedgerReconciliation({ organizationId, fromDate, toDate }) {
    const match = { organizationId, referenceType: 'emi_payment' };
    if (fromDate && toDate) match.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };

    const AccountEntry = require('../../core/accountEntry.model');
    return AccountEntry.find(match)
      .populate('accountId', 'name code')
      .populate('paymentId', 'amount paymentMethod')
      .sort({ createdAt: -1 });
  }

  static async applyAdvanceBalance(emiId, installmentNumber) {
    const emi = await EMI.findById(emiId);
    if (!emi?.advanceBalance || emi.advanceBalance <= 0) {
      return { success: false, message: 'No advance balance available' };
    }

    const inst = emi.installments.find(i => i.installmentNumber === installmentNumber);
    if (!inst || inst.paymentStatus === 'paid') {
      return { success: false, message: 'Invalid installment' };
    }

    const pending   = inst.totalAmount - inst.paidAmount;
    const toApply   = Math.min(emi.advanceBalance, pending);

    inst.paidAmount      += toApply;
    emi.advanceBalance   -= toApply;
    inst.paymentStatus    = inst.paidAmount >= inst.totalAmount ? 'paid' : 'partial';
    if (inst.paymentStatus === 'paid') inst.paidAt = new Date();

    await emi.save();

    return {
      success:           true,
      amountApplied:     toApply,
      remainingAdvance:  emi.advanceBalance,
      installmentStatus: inst.paymentStatus,
    };
  }
}

module.exports = EmiService;

// const mongoose = require('mongoose');
// const AppError = require('../../../core/utils/api/appError');

// const EMI = require('./emi.model');
// const Invoice = require('../billing/invoice.model');
// const Customer = require('../../organization/core/customer.model');
// const Payment = require('./payment.model');
// const Account = require('../core/account.model');
// const AccountEntry = require('../core/accountEntry.model');

// /* ======================================================
//    INTERNAL: APPLY EMI ACCOUNTING
// ====================================================== */
// async function applyEmiAccounting({
//   organizationId,
//   branchId,
//   amount,
//   paymentId,
//   customerId,
//   invoiceId,
//   paymentMethod,
//   referenceNumber,
//   createdBy
// }, session) {

//   const bankAccount = await Account.findOne({
//     organizationId,
//     code: paymentMethod === 'cash' ? '1001' : '1002'
//   }).session(session);

//   const arAccount = await Account.findOne({
//     organizationId,
//     code: '1200'
//   }).session(session);

//   if (!bankAccount || !arAccount) {
//     throw new AppError('Missing Cash/Bank or AR account', 500);
//   }

//   const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
//   if (!invoice) throw new AppError('Invoice not found', 404);

//   // Update invoice amounts
//   invoice.paidAmount += amount;
//   invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
//   invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
//   await invoice.save({ session });

//   // Update customer outstanding
//   await Customer.findOneAndUpdate(
//     { _id: customerId, organizationId },
//     { $inc: { outstandingBalance: -amount } },
//     { session }
//   );

//   // Create ledger entries
//   await AccountEntry.insertMany([
//     {
//       organizationId,
//       branchId,
//       accountId: bankAccount._id,
//       paymentId,
//       debit: amount,
//       credit: 0,
//       description: `EMI Payment`,
//       referenceType: 'emi_payment',
//       referenceId: paymentId,
//       createdBy
//     },
//     {
//       organizationId,
//       branchId,
//       accountId: arAccount._id,
//       customerId,
//       paymentId,
//       debit: 0,
//       credit: amount,
//       description: `EMI Payment`,
//       referenceType: 'emi_payment',
//       referenceId: paymentId,
//       createdBy
//     }
//   ], { session, ordered: true });
// }

// /* ======================================================
//    CREATE EMI PLAN (WITH DOWN PAYMENT ACCOUNTING)
// ====================================================== */
// // exports.createEmiPlan = async ({
// //   organizationId,
// //   branchId,
// //   invoiceId,
// //   createdBy,
// //   downPayment = 0,
// //   numberOfInstallments,
// //   interestRate = 0,
// //   emiStartDate
// // }) => {
// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
// //     if (!invoice) throw new AppError('Invoice not found', 404);

// //     const existing = await EMI.findOne({ invoiceId }).session(session);
// //     if (existing) throw new AppError('EMI already exists for this invoice', 400);

// //     // Down payment accounting
// //     if (downPayment > 0) {
// //       const cashAccount = await Account.findOne({ organizationId, code: '1001' }).session(session);
// //       const arAccount = await Account.findOne({ organizationId, code: '1200' }).session(session);
// //       if (!cashAccount || !arAccount) throw new AppError('Missing Cash or AR account', 500);

// //       await AccountEntry.insertMany([
// //         {
// //           organizationId,
// //           branchId,
// //           accountId: cashAccount._id,
// //           debit: downPayment,
// //           credit: 0,
// //           description: 'EMI Down Payment',
// //           referenceType: 'emi_down_payment',
// //           referenceId: invoiceId,
// //           createdBy
// //         },
// //         {
// //           organizationId,
// //           branchId,
// //           accountId: arAccount._id,
// //           debit: 0,
// //           credit: downPayment,
// //           description: 'EMI Down Payment',
// //           referenceType: 'emi_down_payment',
// //           referenceId: invoiceId,
// //           createdBy
// //         }
// //       ], { session, ordered: true });

// //       invoice.paidAmount += downPayment;
// //       invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
// //       invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
// //       await invoice.save({ session });

// //       await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -downPayment } }, { session });
// //     }

// //     // EMI calculation
// //     const balanceAmount = invoice.balanceAmount;
// //     const principalPerInstallment = Math.round((balanceAmount / numberOfInstallments) * 100) / 100;

// //     const installments = Array.from({ length: numberOfInstallments }).map((_, i) => {
// //       const dueDate = new Date(emiStartDate);
// //       dueDate.setMonth(dueDate.getMonth() + i);
// //       return {
// //         installmentNumber: i + 1,
// //         dueDate,
// //         principalAmount: principalPerInstallment,
// //         interestAmount: 0,
// //         totalAmount: principalPerInstallment,
// //         paidAmount: 0,
// //         paymentStatus: 'pending'
// //       };
// //     });

// //     const emiEndDate = new Date(emiStartDate);
// //     emiEndDate.setMonth(emiEndDate.getMonth() + numberOfInstallments - 1);

// //     const [emi] = await EMI.create([{
// //       organizationId,
// //       branchId,
// //       invoiceId,
// //       customerId: invoice.customerId,
// //       totalAmount: invoice.grandTotal,
// //       downPayment,
// //       balanceAmount,
// //       numberOfInstallments,
// //       interestRate,
// //       emiStartDate,
// //       emiEndDate,
// //       installments,
// //       createdBy
// //     }], { session });

// //     await session.commitTransaction();
// //     return emi;

// //   } catch (err) {
// //     await session.abortTransaction();
// //     throw err;
// //   } finally {
// //     session.endSession();
// //   }
// // };
// /* ======================================================
//    CREATE EMI PLAN (WITH DOWN PAYMENT RECORDING)
// ====================================================== */
// exports.createEmiPlan = async ({
//   organizationId,
//   branchId,
//   invoiceId,
//   createdBy,
//   downPayment = 0,
//   numberOfInstallments,
//   interestRate = 0,
//   emiStartDate
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
//     if (!invoice) throw new AppError('Invoice not found', 404);

//     const existing = await EMI.findOne({ invoiceId }).session(session);
//     if (existing) throw new AppError('EMI already exists for this invoice', 400);

//     let downPaymentRecord = null;

//     // 1. Create a Payment Record for the Down Payment
//     if (downPayment > 0) {
//       const [payment] = await Payment.create([{
//         organizationId,
//         branchId,
//         type: 'inflow',
//         customerId: invoice.customerId,
//         invoiceId: invoice._id,
//         amount: Number(downPayment),
//         paymentMethod: 'cash', // Default for downpayment, can be made dynamic
//         transactionMode: 'auto',
//         remarks: `Down payment for EMI - Invoice ${invoice.invoiceNumber}`,
//         status: 'completed',
//         createdBy
//       }], { session });

//       downPaymentRecord = payment;

//       // 2. Apply Accounting for Down Payment (Updates Ledger, Invoice, and Customer)
//       await applyEmiAccounting({
//         organizationId,
//         branchId,
//         amount: Number(downPayment),
//         paymentId: payment._id,
//         customerId: invoice.customerId,
//         invoiceId: invoice._id,
//         paymentMethod: 'cash',
//         referenceNumber: 'DOWN-PAYMENT',
//         createdBy,
//         isDownPayment: true // Custom flag if you want to change description in ledger
//       }, session);
//     }

//     // 3. Re-fetch invoice or use calculated balance after accounting updates it
//     // Note: applyEmiAccounting already updates invoice.paidAmount and balanceAmount
//     const updatedInvoice = await Invoice.findById(invoiceId).session(session);
//     const balanceToFinance = updatedInvoice.balanceAmount;

//     // 4. EMI Installment Calculation
//     const principalPerInstallment = Math.round((balanceToFinance / numberOfInstallments) * 100) / 100;

//     const installments = Array.from({ length: numberOfInstallments }).map((_, i) => {
//       const dueDate = new Date(emiStartDate);
//       dueDate.setMonth(dueDate.getMonth() + i);
//       return {
//         installmentNumber: i + 1,
//         dueDate,
//         principalAmount: principalPerInstallment,
//         interestAmount: 0,
//         totalAmount: principalPerInstallment,
//         paidAmount: 0,
//         paymentStatus: 'pending'
//       };
//     });

//     const emiEndDate = new Date(emiStartDate);
//     emiEndDate.setMonth(emiEndDate.getMonth() + numberOfInstallments - 1);

//     // 5. Create the EMI Document
//     const [emi] = await EMI.create([{
//       organizationId,
//       branchId,
//       invoiceId,
//       customerId: invoice.customerId,
//       totalAmount: invoice.grandTotal,
//       downPayment,
//       balanceAmount: balanceToFinance,
//       numberOfInstallments,
//       interestRate,
//       emiStartDate,
//       emiEndDate,
//       installments,
//       createdBy
//     }], { session });

//     await session.commitTransaction();
//     return emi;

//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };
// /* ======================================================
//    PAY EMI INSTALLMENT
// ====================================================== */
// exports.payEmiInstallment = async ({
//   emiId,
//   installmentNumber,
//   amount,
//   paymentMethod,
//   referenceNumber,
//   remarks,
//   organizationId,
//   branchId,
//   createdBy
// }) => {

//   // 🔐 HARD VALIDATION (prevents silent failures)
//   if (!organizationId) throw new AppError('organizationId missing', 500);
//   if (!emiId) throw new AppError('emiId required', 400);
//   if (!installmentNumber) throw new AppError('installmentNumber required', 400);
//   if (!amount || amount <= 0) throw new AppError('Amount must be > 0', 400);

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const emi = await EMI.findOne({
//       _id: emiId,
//       organizationId
//     }).session(session);

//     if (!emi) throw new AppError('EMI not found', 404);

//     const installment = emi.installments.find(
//       i => i.installmentNumber === Number(installmentNumber)
//     );

//     if (!installment) throw new AppError('Invalid installment', 400);
//     if (installment.paymentStatus === 'paid') {
//       throw new AppError('Installment already paid', 400);
//     }

//     /* ----------------------------------------
//        CREATE PAYMENT (SCHEMA-ALIGNED)
//     ---------------------------------------- */
//     const [payment] = await Payment.create(
//       [
//         {
//           organizationId,
//           branchId,
//           type: 'inflow',                // ✅ REQUIRED
//           customerId: emi.customerId,
//           invoiceId: emi.invoiceId,
//           amount: Number(amount),        // ✅ REQUIRED
//           paymentMethod,
//           referenceNumber,
//           remarks,
//           transactionMode: 'auto',
//           status: 'completed',
//           createdBy
//         }
//       ],
//       { session, ordered: true }
//     );

//     /* ----------------------------------------
//        UPDATE INSTALLMENT
//     ---------------------------------------- */
//     installment.paidAmount += Number(amount);

//     installment.paymentStatus =
//       installment.paidAmount >= installment.totalAmount
//         ? 'paid'
//         : 'partial';

//     installment.paymentId = payment._id;

//     /* ----------------------------------------
//        UPDATE EMI STATUS
//     ---------------------------------------- */
//     if (emi.installments.every(i => i.paymentStatus === 'paid')) {
//       emi.status = 'completed';
//     }

//     await emi.save({ session });

//     /* ----------------------------------------
//        ACCOUNTING ENTRIES
//     ---------------------------------------- */
//     await applyEmiAccounting({
//       organizationId,
//       branchId,
//       amount: Number(amount),
//       paymentId: payment._id,
//       customerId: emi.customerId,
//       invoiceId: emi.invoiceId,
//       paymentMethod,
//       referenceNumber,
//       createdBy
//     }, session);

//     await session.commitTransaction();

//     return { emi, payment };

//   } catch (err) {
//     await session.abortTransaction();
//     throw err;
//   } finally {
//     session.endSession();
//   }
// };

// /* ======================================================
//    FETCH EMI
// ====================================================== */
// exports.getEmiById = async (emiId, organizationId) => {
//   return EMI.findOne({ _id: emiId, organizationId })
//     .populate('customerId', 'name phone email avatar')
//     .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
//     .populate('createdBy', 'name email')
//     .lean();
// };

// exports.getEmiByInvoice = async (invoiceId, organizationId) => {
//   return EMI.findOne({ invoiceId, organizationId })
//     .populate('customerId', 'name phone email avatar')
//     .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
//     .populate('createdBy', 'name email')
//     .lean();
// };

// /* ======================================================
//    LIST & FILTER EMIs
// ====================================================== */
// exports.getEmis = async ({ organizationId, branchId, customerId, status }) => {
//   const filter = { organizationId };
//   if (branchId) filter.branchId = branchId;
//   if (customerId) filter.customerId = customerId;
//   if (status) filter.status = status;

//   return EMI.find(filter)
//     .sort({ createdAt: -1 })
//     .populate('customerId', 'name phone')
//     .populate('invoiceId', 'invoiceNumber grandTotal')
//     .lean();
// };

// /* ======================================================
//    EMI DASHBOARD ANALYTICS
// ====================================================== */
// exports.getEmiSummary = async (organizationId) => {
//   return EMI.aggregate([
//     { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
//     { $group: { _id: '$status', count: { $sum: 1 }, totalBalance: { $sum: '$balanceAmount' } } }
//   ]);
// };

// exports.getEmiAnalytics = async (organizationId) => {
//   const emis = await EMI.find({ organizationId });
//   const stats = {
//     totalEmis: emis.length,
//     active: 0,
//     completed: 0,
//     defaulted: 0,
//     totalOutstanding: 0,
//     installments: { pending: 0, paid: 0, partial: 0, overdue: 0 }
//   };

//   for (const emi of emis) {
//     stats[emi.status]++;
//     stats.totalOutstanding += emi.balanceAmount;
//     emi.installments.forEach(i => stats.installments[i.paymentStatus]++);
//   }

//   return stats;
// };

// /* ======================================================
//    MARK OVERDUE & DEFAULTED EMIs
// ====================================================== */
// exports.markOverdueInstallments = async () => {
//   const today = new Date();
//   const emis = await EMI.find({ status: 'active', 'installments.paymentStatus': { $in: ['pending', 'partial'] } });

//   for (const emi of emis) {
//     let updated = false;
//     emi.installments.forEach(inst => {
//       if (inst.paymentStatus !== 'paid' && inst.dueDate < today) {
//         inst.paymentStatus = 'overdue';
//         updated = true;
//       }
//     });
//     if (updated) await emi.save();
//   }

//   return { updatedEmis: emis.length };
// };

// exports.markDefaultedEmis = async () => {
//   const today = new Date();
//   return EMI.updateMany(
//     {
//       status: 'active',
//       installments: { $elemMatch: { dueDate: { $lt: today }, paymentStatus: { $ne: 'paid' } } }
//     },
//     { $set: { status: 'defaulted' } }
//   );
// };

// /* ======================================================
//    EMI LEDGER RECONCILIATION
// ====================================================== */
// exports.getEmiLedgerReconciliation = async ({ organizationId, fromDate, toDate }) => {
//   const match = { organizationId, referenceType: 'emi_payment' };
//   if (fromDate && toDate) match.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };

//   return AccountEntry.find(match)
//     .populate('accountId', 'name code')
//     .populate('paymentId', 'amount paymentMethod')
//     .sort({ createdAt: -1 });
// };

// // services/emiService.js - Add these methods

// /* ======================================================
//    RECONCILE EXTERNAL PAYMENT WITH EMI
// ====================================================== */
// // exports.reconcileExternalPayment = async ({
// //   organizationId,
// //   branchId,
// //   invoiceId,
// //   amount,
// //   paymentDate,
// //   paymentMethod,
// //   transactionId,
// //   referenceNumber,
// //   remarks,
// //   createdBy
// // }) => {
// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     // 1. Find the EMI for this invoice
// //     const emi = await EMI.findOne({ invoiceId, organizationId }).session(session);
// //     if (!emi) {
// //       throw new AppError('No EMI plan found for this invoice', 404);
// //     }

// //     // 2. Create payment record
// //     const [payment] = await Payment.create([{
// //       organizationId,
// //       branchId,
// //       type: 'inflow',
// //       customerId: emi.customerId,
// //       invoiceId,
// //       amount: Number(amount),
// //       paymentMethod,
// //       referenceNumber: referenceNumber || transactionId,
// //       transactionId,
// //       remarks: remarks || 'External payment reconciled',
// //       transactionMode: 'auto',
// //       status: 'completed',
// //       paymentDate,
// //       createdBy
// //     }], { session });

// //     // 3. Apply payment to installments (oldest first)
// //     let remainingAmount = Number(amount);
// //     const updatedInstallments = [];
    
// //     for (const installment of emi.installments.sort((a, b) => a.installmentNumber - b.installmentNumber)) {
// //       if (remainingAmount <= 0) break;
      
// //       if (installment.paymentStatus !== 'paid') {
// //         const pendingAmount = installment.totalAmount - installment.paidAmount;
// //         const amountToApply = Math.min(remainingAmount, pendingAmount);
        
// //         installment.paidAmount += amountToApply;
// //         remainingAmount -= amountToApply;
        
// //         installment.paymentStatus = 
// //           installment.paidAmount >= installment.totalAmount ? 'paid' : 'partial';
        
// //         if (amountToApply > 0 && !installment.paymentId) {
// //           installment.paymentId = payment._id;
// //         }
        
// //         updatedInstallments.push({
// //           installmentNumber: installment.installmentNumber,
// //           appliedAmount: amountToApply
// //         });
// //       }
// //     }

// //     // 4. Handle any excess payment
// //     if (remainingAmount > 0) {
// //       // Option 1: Create prepayment/advance
// //       emi.advanceBalance = (emi.advanceBalance || 0) + remainingAmount;
// //       updatedInstallments.push({
// //         type: 'advance',
// //         amount: remainingAmount
// //       });
// //     }

// //     // 5. Update EMI status
// //     if (emi.installments.every(i => i.paymentStatus === 'paid')) {
// //       emi.status = 'completed';
// //     }

// //     await emi.save({ session });

// //     // 6. Update invoice payment status
// //     const invoice = await Invoice.findById(invoiceId).session(session);
// //     if (invoice) {
// //       invoice.paidAmount += Number(amount);
// //       invoice.balanceAmount = Math.max(0, invoice.grandTotal - invoice.paidAmount);
// //       invoice.paymentStatus = 
// //         invoice.balanceAmount <= 0 ? 'paid' : 
// //         invoice.paidAmount > 0 ? 'partial' : 'unpaid';
// //       await invoice.save({ session });
// //     }

// //     // 7. Apply accounting entries
// //     await applyEmiAccounting({
// //       organizationId,
// //       branchId,
// //       amount: Number(amount),
// //       paymentId: payment._id,
// //       customerId: emi.customerId,
// //       invoiceId,
// //       paymentMethod,
// //       referenceNumber,
// //       createdBy
// //     }, session);

// //     await session.commitTransaction();

// //     return {
// //       success: true,
// //       payment,
// //       emi: emi._id,
// //       appliedToInstallments: updatedInstallments,
// //       remainingAdvance: emi.advanceBalance || 0,
// //       message: `Payment of ₹${amount} reconciled successfully`
// //     };

// //   } catch (error) {
// //     await session.abortTransaction();
// //     throw error;
// //   } finally {
// //     session.endSession();
// //   }
// // };
// /* ======================================================
//    RECONCILE EXTERNAL PAYMENT (Corrected)
// ====================================================== */
// exports.reconcileExternalPayment = async ({
//   organizationId,
//   branchId,
//   invoiceId,
//   amount,
//   paymentDate,
//   paymentMethod,
//   transactionId,
//   referenceNumber,
//   remarks,
//   createdBy
// }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Find the EMI for this invoice
//     const emi = await EMI.findOne({ invoiceId, organizationId }).session(session);
//     if (!emi) {
//       throw new AppError('No EMI plan found for this invoice', 404);
//     }

//     // 2. Create payment record
//     const [payment] = await Payment.create([{
//       organizationId,
//       branchId,
//       type: 'inflow',
//       customerId: emi.customerId,
//       invoiceId,
//       amount: Number(amount),
//       paymentMethod,
//       referenceNumber: referenceNumber || transactionId,
//       transactionId,
//       remarks: remarks || 'External payment reconciled',
//       transactionMode: 'auto',
//       status: 'completed',
//       paymentDate,
//       createdBy
//     }], { session });

//     // 3. Apply payment to installments (oldest first)
//     let remainingAmount = Number(amount);
//     const updatedInstallments = [];
    
//     for (const installment of emi.installments.sort((a, b) => a.installmentNumber - b.installmentNumber)) {
//       if (remainingAmount <= 0) break;
      
//       if (installment.paymentStatus !== 'paid') {
//         const pendingAmount = installment.totalAmount - installment.paidAmount;
//         const amountToApply = Math.min(remainingAmount, pendingAmount);
        
//         installment.paidAmount += amountToApply;
//         remainingAmount -= amountToApply;
        
//         installment.paymentStatus = 
//           installment.paidAmount >= installment.totalAmount ? 'paid' : 'partial';
        
//         if (amountToApply > 0 && !installment.paymentId) {
//           installment.paymentId = payment._id;
//         }
        
//         updatedInstallments.push({
//           installmentNumber: installment.installmentNumber,
//           appliedAmount: amountToApply
//         });
//       }
//     }

//     // 4. Handle any excess payment (Advance)
//     if (remainingAmount > 0) {
//       emi.advanceBalance = (emi.advanceBalance || 0) + remainingAmount;
//       updatedInstallments.push({
//         type: 'advance',
//         amount: remainingAmount
//       });
//     }

//     // 5. Update EMI status
//     if (emi.installments.every(i => i.paymentStatus === 'paid')) {
//       emi.status = 'completed';
//     }

//     await emi.save({ session });

//     // ⚠️ CRITICAL CHANGE: 
//     // We REMOVED the invoice update logic here because applyEmiAccounting does it.

//     // 6. Apply accounting entries (Updates Invoice + Ledger + Customer Balance)
//     await applyEmiAccounting({
//       organizationId,
//       branchId,
//       amount: Number(amount),
//       paymentId: payment._id,
//       customerId: emi.customerId,
//       invoiceId,
//       paymentMethod,
//       referenceNumber,
//       createdBy
//     }, session);

//     await session.commitTransaction();

//     return {
//       success: true,
//       payment,
//       emi: emi._id,
//       appliedToInstallments: updatedInstallments,
//       message: `Payment of ₹${amount} reconciled successfully`
//     };

//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// };
// /* ======================================================
//    AUTO-RECONCILE PAYMENTS WEBHOOK
// ====================================================== */
// exports.autoReconcilePayment = async (paymentData) => {
//   // This would be called from a webhook when payment gateway confirms payment
//   try {
//     const result = await exports.reconcileExternalPayment({
//       organizationId: paymentData.organizationId,
//       branchId: paymentData.branchId,
//       invoiceId: paymentData.invoiceId,
//       amount: paymentData.amount,
//       paymentDate: new Date(paymentData.paymentDate),
//       paymentMethod: paymentData.paymentMethod,
//       transactionId: paymentData.transactionId,
//       referenceNumber: paymentData.referenceNumber,
//       remarks: `Auto-reconciled via ${paymentData.gateway || 'payment gateway'}`,
//       createdBy: paymentData.createdBy || new mongoose.Types.ObjectId() // System user
//     });
    
//     return result;
//   } catch (error) {
//     // Log for manual reconciliation
//     console.error('Auto-reconciliation failed:', {
//       paymentData,
//       error: error.message
//     });
    
//     // Create pending reconciliation record
//     await PendingReconciliation.create({
//       ...paymentData,
//       status: 'pending',
//       error: error.message,
//       attemptedAt: new Date()
//     });
    
//     throw error;
//   }
// };

// // Add this method to emiService.js
// exports.applyAdvanceBalance = async (emiId, installmentNumber) => {
//   const emi = await EMI.findById(emiId);
  
//   if (!emi || !emi.advanceBalance || emi.advanceBalance <= 0) {
//     return { success: false, message: 'No advance balance available' };
//   }

//   const installment = emi.installments.find(i => i.installmentNumber === installmentNumber);
//   if (!installment || installment.paymentStatus === 'paid') {
//     return { success: false, message: 'Invalid installment' };
//   }

//   const pendingAmount = installment.totalAmount - installment.paidAmount;
//   const amountToApply = Math.min(emi.advanceBalance, pendingAmount);

//   installment.paidAmount += amountToApply;
//   emi.advanceBalance -= amountToApply;

//   installment.paymentStatus = 
//     installment.paidAmount >= installment.totalAmount ? 'paid' : 'partial';

//   if (emi.installments.every(i => i.paymentStatus === 'paid')) {
//     emi.status = 'completed';
//   }

//   await emi.save();

//   return {
//     success: true,
//     amountApplied: amountToApply,
//     remainingAdvance: emi.advanceBalance,
//     installmentStatus: installment.paymentStatus
//   };
// };
