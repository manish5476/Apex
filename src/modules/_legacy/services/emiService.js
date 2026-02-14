
const mongoose = require('mongoose');
const AppError = require('../../../core/utils/appError');

const EMI = require('../../accounting/payments/emi.model');
const Invoice = require('../../accounting/billing/invoice.model');
const Customer = require('../../organization/core/customer.model');
const Payment = require('../../accounting/payments/payment.model');
const Account = require('../../accounting/core/account.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');

/* ======================================================
   INTERNAL: APPLY EMI ACCOUNTING
====================================================== */
async function applyEmiAccounting({
  organizationId,
  branchId,
  amount,
  paymentId,
  customerId,
  invoiceId,
  paymentMethod,
  referenceNumber,
  createdBy
}, session) {

  const bankAccount = await Account.findOne({
    organizationId,
    code: paymentMethod === 'cash' ? '1001' : '1002'
  }).session(session);

  const arAccount = await Account.findOne({
    organizationId,
    code: '1200'
  }).session(session);

  if (!bankAccount || !arAccount) {
    throw new AppError('Missing Cash/Bank or AR account', 500);
  }

  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
  if (!invoice) throw new AppError('Invoice not found', 404);

  // Update invoice amounts
  invoice.paidAmount += amount;
  invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
  invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
  await invoice.save({ session });

  // Update customer outstanding
  await Customer.findOneAndUpdate(
    { _id: customerId, organizationId },
    { $inc: { outstandingBalance: -amount } },
    { session }
  );

  // Create ledger entries
  await AccountEntry.insertMany([
    {
      organizationId,
      branchId,
      accountId: bankAccount._id,
      paymentId,
      debit: amount,
      credit: 0,
      description: `EMI Payment`,
      referenceType: 'emi_payment',
      referenceId: paymentId,
      createdBy
    },
    {
      organizationId,
      branchId,
      accountId: arAccount._id,
      customerId,
      paymentId,
      debit: 0,
      credit: amount,
      description: `EMI Payment`,
      referenceType: 'emi_payment',
      referenceId: paymentId,
      createdBy
    }
  ], { session, ordered: true });
}

/* ======================================================
   CREATE EMI PLAN (WITH DOWN PAYMENT ACCOUNTING)
====================================================== */
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

//     // Down payment accounting
//     if (downPayment > 0) {
//       const cashAccount = await Account.findOne({ organizationId, code: '1001' }).session(session);
//       const arAccount = await Account.findOne({ organizationId, code: '1200' }).session(session);
//       if (!cashAccount || !arAccount) throw new AppError('Missing Cash or AR account', 500);

//       await AccountEntry.insertMany([
//         {
//           organizationId,
//           branchId,
//           accountId: cashAccount._id,
//           debit: downPayment,
//           credit: 0,
//           description: 'EMI Down Payment',
//           referenceType: 'emi_down_payment',
//           referenceId: invoiceId,
//           createdBy
//         },
//         {
//           organizationId,
//           branchId,
//           accountId: arAccount._id,
//           debit: 0,
//           credit: downPayment,
//           description: 'EMI Down Payment',
//           referenceType: 'emi_down_payment',
//           referenceId: invoiceId,
//           createdBy
//         }
//       ], { session, ordered: true });

//       invoice.paidAmount += downPayment;
//       invoice.balanceAmount = Math.round((invoice.grandTotal - invoice.paidAmount) * 100) / 100;
//       invoice.paymentStatus = invoice.balanceAmount <= 0 ? 'paid' : 'partial';
//       await invoice.save({ session });

//       await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -downPayment } }, { session });
//     }

//     // EMI calculation
//     const balanceAmount = invoice.balanceAmount;
//     const principalPerInstallment = Math.round((balanceAmount / numberOfInstallments) * 100) / 100;

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

//     const [emi] = await EMI.create([{
//       organizationId,
//       branchId,
//       invoiceId,
//       customerId: invoice.customerId,
//       totalAmount: invoice.grandTotal,
//       downPayment,
//       balanceAmount,
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
/* ======================================================
   CREATE EMI PLAN (WITH DOWN PAYMENT RECORDING)
====================================================== */
exports.createEmiPlan = async ({
  organizationId,
  branchId,
  invoiceId,
  createdBy,
  downPayment = 0,
  numberOfInstallments,
  interestRate = 0,
  emiStartDate
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
    if (!invoice) throw new AppError('Invoice not found', 404);

    const existing = await EMI.findOne({ invoiceId }).session(session);
    if (existing) throw new AppError('EMI already exists for this invoice', 400);

    let downPaymentRecord = null;

    // 1. Create a Payment Record for the Down Payment
    if (downPayment > 0) {
      const [payment] = await Payment.create([{
        organizationId,
        branchId,
        type: 'inflow',
        customerId: invoice.customerId,
        invoiceId: invoice._id,
        amount: Number(downPayment),
        paymentMethod: 'cash', // Default for downpayment, can be made dynamic
        transactionMode: 'auto',
        remarks: `Down payment for EMI - Invoice ${invoice.invoiceNumber}`,
        status: 'completed',
        createdBy
      }], { session });

      downPaymentRecord = payment;

      // 2. Apply Accounting for Down Payment (Updates Ledger, Invoice, and Customer)
      await applyEmiAccounting({
        organizationId,
        branchId,
        amount: Number(downPayment),
        paymentId: payment._id,
        customerId: invoice.customerId,
        invoiceId: invoice._id,
        paymentMethod: 'cash',
        referenceNumber: 'DOWN-PAYMENT',
        createdBy,
        isDownPayment: true // Custom flag if you want to change description in ledger
      }, session);
    }

    // 3. Re-fetch invoice or use calculated balance after accounting updates it
    // Note: applyEmiAccounting already updates invoice.paidAmount and balanceAmount
    const updatedInvoice = await Invoice.findById(invoiceId).session(session);
    const balanceToFinance = updatedInvoice.balanceAmount;

    // 4. EMI Installment Calculation
    const principalPerInstallment = Math.round((balanceToFinance / numberOfInstallments) * 100) / 100;

    const installments = Array.from({ length: numberOfInstallments }).map((_, i) => {
      const dueDate = new Date(emiStartDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      return {
        installmentNumber: i + 1,
        dueDate,
        principalAmount: principalPerInstallment,
        interestAmount: 0,
        totalAmount: principalPerInstallment,
        paidAmount: 0,
        paymentStatus: 'pending'
      };
    });

    const emiEndDate = new Date(emiStartDate);
    emiEndDate.setMonth(emiEndDate.getMonth() + numberOfInstallments - 1);

    // 5. Create the EMI Document
    const [emi] = await EMI.create([{
      organizationId,
      branchId,
      invoiceId,
      customerId: invoice.customerId,
      totalAmount: invoice.grandTotal,
      downPayment,
      balanceAmount: balanceToFinance,
      numberOfInstallments,
      interestRate,
      emiStartDate,
      emiEndDate,
      installments,
      createdBy
    }], { session });

    await session.commitTransaction();
    return emi;

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
/* ======================================================
   PAY EMI INSTALLMENT
====================================================== */
exports.payEmiInstallment = async ({
  emiId,
  installmentNumber,
  amount,
  paymentMethod,
  referenceNumber,
  remarks,
  organizationId,
  branchId,
  createdBy
}) => {

  // 🔐 HARD VALIDATION (prevents silent failures)
  if (!organizationId) throw new AppError('organizationId missing', 500);
  if (!emiId) throw new AppError('emiId required', 400);
  if (!installmentNumber) throw new AppError('installmentNumber required', 400);
  if (!amount || amount <= 0) throw new AppError('Amount must be > 0', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const emi = await EMI.findOne({
      _id: emiId,
      organizationId
    }).session(session);

    if (!emi) throw new AppError('EMI not found', 404);

    const installment = emi.installments.find(
      i => i.installmentNumber === Number(installmentNumber)
    );

    if (!installment) throw new AppError('Invalid installment', 400);
    if (installment.paymentStatus === 'paid') {
      throw new AppError('Installment already paid', 400);
    }

    /* ----------------------------------------
       CREATE PAYMENT (SCHEMA-ALIGNED)
    ---------------------------------------- */
    const [payment] = await Payment.create(
      [
        {
          organizationId,
          branchId,
          type: 'inflow',                // ✅ REQUIRED
          customerId: emi.customerId,
          invoiceId: emi.invoiceId,
          amount: Number(amount),        // ✅ REQUIRED
          paymentMethod,
          referenceNumber,
          remarks,
          transactionMode: 'auto',
          status: 'completed',
          createdBy
        }
      ],
      { session, ordered: true }
    );

    /* ----------------------------------------
       UPDATE INSTALLMENT
    ---------------------------------------- */
    installment.paidAmount += Number(amount);

    installment.paymentStatus =
      installment.paidAmount >= installment.totalAmount
        ? 'paid'
        : 'partial';

    installment.paymentId = payment._id;

    /* ----------------------------------------
       UPDATE EMI STATUS
    ---------------------------------------- */
    if (emi.installments.every(i => i.paymentStatus === 'paid')) {
      emi.status = 'completed';
    }

    await emi.save({ session });

    /* ----------------------------------------
       ACCOUNTING ENTRIES
    ---------------------------------------- */
    await applyEmiAccounting({
      organizationId,
      branchId,
      amount: Number(amount),
      paymentId: payment._id,
      customerId: emi.customerId,
      invoiceId: emi.invoiceId,
      paymentMethod,
      referenceNumber,
      createdBy
    }, session);

    await session.commitTransaction();

    return { emi, payment };

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/* ======================================================
   FETCH EMI
====================================================== */
exports.getEmiById = async (emiId, organizationId) => {
  return EMI.findOne({ _id: emiId, organizationId })
    .populate('customerId', 'name phone email avatar')
    .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
    .populate('createdBy', 'name email')
    .lean();
};

exports.getEmiByInvoice = async (invoiceId, organizationId) => {
  return EMI.findOne({ invoiceId, organizationId })
    .populate('customerId', 'name phone email avatar')
    .populate('invoiceId', 'invoiceNumber grandTotal paidAmount balanceAmount paymentStatus')
    .populate('createdBy', 'name email')
    .lean();
};

/* ======================================================
   LIST & FILTER EMIs
====================================================== */
exports.getEmis = async ({ organizationId, branchId, customerId, status }) => {
  const filter = { organizationId };
  if (branchId) filter.branchId = branchId;
  if (customerId) filter.customerId = customerId;
  if (status) filter.status = status;

  return EMI.find(filter)
    .sort({ createdAt: -1 })
    .populate('customerId', 'name phone')
    .populate('invoiceId', 'invoiceNumber grandTotal')
    .lean();
};

/* ======================================================
   EMI DASHBOARD ANALYTICS
====================================================== */
exports.getEmiSummary = async (organizationId) => {
  return EMI.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
    { $group: { _id: '$status', count: { $sum: 1 }, totalBalance: { $sum: '$balanceAmount' } } }
  ]);
};

exports.getEmiAnalytics = async (organizationId) => {
  const emis = await EMI.find({ organizationId });
  const stats = {
    totalEmis: emis.length,
    active: 0,
    completed: 0,
    defaulted: 0,
    totalOutstanding: 0,
    installments: { pending: 0, paid: 0, partial: 0, overdue: 0 }
  };

  for (const emi of emis) {
    stats[emi.status]++;
    stats.totalOutstanding += emi.balanceAmount;
    emi.installments.forEach(i => stats.installments[i.paymentStatus]++);
  }

  return stats;
};

/* ======================================================
   MARK OVERDUE & DEFAULTED EMIs
====================================================== */
exports.markOverdueInstallments = async () => {
  const today = new Date();
  const emis = await EMI.find({ status: 'active', 'installments.paymentStatus': { $in: ['pending', 'partial'] } });

  for (const emi of emis) {
    let updated = false;
    emi.installments.forEach(inst => {
      if (inst.paymentStatus !== 'paid' && inst.dueDate < today) {
        inst.paymentStatus = 'overdue';
        updated = true;
      }
    });
    if (updated) await emi.save();
  }

  return { updatedEmis: emis.length };
};

exports.markDefaultedEmis = async () => {
  const today = new Date();
  return EMI.updateMany(
    {
      status: 'active',
      installments: { $elemMatch: { dueDate: { $lt: today }, paymentStatus: { $ne: 'paid' } } }
    },
    { $set: { status: 'defaulted' } }
  );
};

/* ======================================================
   EMI LEDGER RECONCILIATION
====================================================== */
exports.getEmiLedgerReconciliation = async ({ organizationId, fromDate, toDate }) => {
  const match = { organizationId, referenceType: 'emi_payment' };
  if (fromDate && toDate) match.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };

  return AccountEntry.find(match)
    .populate('accountId', 'name code')
    .populate('paymentId', 'amount paymentMethod')
    .sort({ createdAt: -1 });
};

// services/emiService.js - Add these methods

/* ======================================================
   RECONCILE EXTERNAL PAYMENT WITH EMI
====================================================== */
exports.reconcileExternalPayment = async ({
  organizationId,
  branchId,
  invoiceId,
  amount,
  paymentDate,
  paymentMethod,
  transactionId,
  referenceNumber,
  remarks,
  createdBy
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Find the EMI for this invoice
    const emi = await EMI.findOne({ invoiceId, organizationId }).session(session);
    if (!emi) {
      throw new AppError('No EMI plan found for this invoice', 404);
    }

    // 2. Create payment record
    const [payment] = await Payment.create([{
      organizationId,
      branchId,
      type: 'inflow',
      customerId: emi.customerId,
      invoiceId,
      amount: Number(amount),
      paymentMethod,
      referenceNumber: referenceNumber || transactionId,
      transactionId,
      remarks: remarks || 'External payment reconciled',
      transactionMode: 'auto',
      status: 'completed',
      paymentDate,
      createdBy
    }], { session });

    // 3. Apply payment to installments (oldest first)
    let remainingAmount = Number(amount);
    const updatedInstallments = [];
    
    for (const installment of emi.installments.sort((a, b) => a.installmentNumber - b.installmentNumber)) {
      if (remainingAmount <= 0) break;
      
      if (installment.paymentStatus !== 'paid') {
        const pendingAmount = installment.totalAmount - installment.paidAmount;
        const amountToApply = Math.min(remainingAmount, pendingAmount);
        
        installment.paidAmount += amountToApply;
        remainingAmount -= amountToApply;
        
        installment.paymentStatus = 
          installment.paidAmount >= installment.totalAmount ? 'paid' : 'partial';
        
        if (amountToApply > 0 && !installment.paymentId) {
          installment.paymentId = payment._id;
        }
        
        updatedInstallments.push({
          installmentNumber: installment.installmentNumber,
          appliedAmount: amountToApply
        });
      }
    }

    // 4. Handle any excess payment
    if (remainingAmount > 0) {
      // Option 1: Create prepayment/advance
      emi.advanceBalance = (emi.advanceBalance || 0) + remainingAmount;
      updatedInstallments.push({
        type: 'advance',
        amount: remainingAmount
      });
    }

    // 5. Update EMI status
    if (emi.installments.every(i => i.paymentStatus === 'paid')) {
      emi.status = 'completed';
    }

    await emi.save({ session });

    // 6. Update invoice payment status
    const invoice = await Invoice.findById(invoiceId).session(session);
    if (invoice) {
      invoice.paidAmount += Number(amount);
      invoice.balanceAmount = Math.max(0, invoice.grandTotal - invoice.paidAmount);
      invoice.paymentStatus = 
        invoice.balanceAmount <= 0 ? 'paid' : 
        invoice.paidAmount > 0 ? 'partial' : 'unpaid';
      await invoice.save({ session });
    }

    // 7. Apply accounting entries
    await applyEmiAccounting({
      organizationId,
      branchId,
      amount: Number(amount),
      paymentId: payment._id,
      customerId: emi.customerId,
      invoiceId,
      paymentMethod,
      referenceNumber,
      createdBy
    }, session);

    await session.commitTransaction();

    return {
      success: true,
      payment,
      emi: emi._id,
      appliedToInstallments: updatedInstallments,
      remainingAdvance: emi.advanceBalance || 0,
      message: `Payment of ₹${amount} reconciled successfully`
    };

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/* ======================================================
   AUTO-RECONCILE PAYMENTS WEBHOOK
====================================================== */
exports.autoReconcilePayment = async (paymentData) => {
  // This would be called from a webhook when payment gateway confirms payment
  try {
    const result = await exports.reconcileExternalPayment({
      organizationId: paymentData.organizationId,
      branchId: paymentData.branchId,
      invoiceId: paymentData.invoiceId,
      amount: paymentData.amount,
      paymentDate: new Date(paymentData.paymentDate),
      paymentMethod: paymentData.paymentMethod,
      transactionId: paymentData.transactionId,
      referenceNumber: paymentData.referenceNumber,
      remarks: `Auto-reconciled via ${paymentData.gateway || 'payment gateway'}`,
      createdBy: paymentData.createdBy || new mongoose.Types.ObjectId() // System user
    });
    
    return result;
  } catch (error) {
    // Log for manual reconciliation
    console.error('Auto-reconciliation failed:', {
      paymentData,
      error: error.message
    });
    
    // Create pending reconciliation record
    await PendingReconciliation.create({
      ...paymentData,
      status: 'pending',
      error: error.message,
      attemptedAt: new Date()
    });
    
    throw error;
  }
};

// Add this method to emiService.js
exports.applyAdvanceBalance = async (emiId, installmentNumber) => {
  const emi = await EMI.findById(emiId);
  
  if (!emi || !emi.advanceBalance || emi.advanceBalance <= 0) {
    return { success: false, message: 'No advance balance available' };
  }

  const installment = emi.installments.find(i => i.installmentNumber === installmentNumber);
  if (!installment || installment.paymentStatus === 'paid') {
    return { success: false, message: 'Invalid installment' };
  }

  const pendingAmount = installment.totalAmount - installment.paidAmount;
  const amountToApply = Math.min(emi.advanceBalance, pendingAmount);

  installment.paidAmount += amountToApply;
  emi.advanceBalance -= amountToApply;

  installment.paymentStatus = 
    installment.paidAmount >= installment.totalAmount ? 'paid' : 'partial';

  if (emi.installments.every(i => i.paymentStatus === 'paid')) {
    emi.status = 'completed';
  }

  await emi.save();

  return {
    success: true,
    amountApplied: amountToApply,
    remainingAdvance: emi.advanceBalance,
    installmentStatus: installment.paymentStatus
  };
};
