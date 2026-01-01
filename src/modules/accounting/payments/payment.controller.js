const mongoose = require('mongoose');
const Payment = require('../models/paymentModel');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Customer = require('../models/customerModel');
const Supplier = require('../models/supplierModel');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const emiService = require('../services/emiService');
const paymentPDFService = require('../services/paymentPDFService');
const automationService = require('../services/automationService');
const { invalidateOpeningBalance } = require('../services/ledgerCache');

/* ======================================================
   ACCOUNT RESOLUTION (STRICT)
====================================================== */
async function getAccount(orgId, code, name, type, session) {
  let acc = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!acc) {
    acc = (await Account.create([{
      organizationId: orgId,
      code,
      name,
      type,
      isGroup: false
    }], { session }))[0];
  }
  return acc;
}

/* ======================================================
   LEDGER POSTING (ATOMIC)
====================================================== */
async function postPaymentLedger({ payment, session, reverse = false }) {
  const sign = reverse ? -1 : 1;
  const {
    organizationId,
    branchId,
    type,
    amount,
    customerId,
    supplierId,
    paymentMethod,
    _id,
    paymentDate,
    createdBy
  } = payment;

  const cash = await getAccount(
    organizationId,
    paymentMethod === 'cash' ? '1001' : '1002',
    paymentMethod === 'cash' ? 'Cash' : 'Bank',
    'asset',
    session
  );

  const ar = await getAccount(organizationId, '1200', 'Accounts Receivable', 'asset', session);
  const ap = await getAccount(organizationId, '2000', 'Accounts Payable', 'liability', session);

  const date = paymentDate || new Date();

  if (type === 'inflow') {
    await AccountEntry.insertMany([
      {
        organizationId,
        branchId,
        accountId: cash._id,
        debit: amount * sign,
        credit: 0,
        paymentId: _id,
        date,
        referenceType: 'payment',
        referenceId: _id,
        createdBy
      },
      {
        organizationId,
        branchId,
        accountId: ar._id,
        customerId,
        debit: 0,
        credit: amount * sign,
        paymentId: _id,
        date,
        referenceType: 'payment',
        referenceId: _id,
        createdBy
      }
    ], { session });
  }

  if (type === 'outflow') {
    await AccountEntry.insertMany([
      {
        organizationId,
        branchId,
        accountId: ap._id,
        supplierId,
        debit: amount * sign,
        credit: 0,
        paymentId: _id,
        date,
        referenceType: 'payment',
        referenceId: _id,
        createdBy
      },
      {
        organizationId,
        branchId,
        accountId: cash._id,
        debit: 0,
        credit: amount * sign,
        paymentId: _id,
        date,
        referenceType: 'payment',
        referenceId: _id,
        createdBy
      }
    ], { session });
  }
}

/* ======================================================
   CREATE PAYMENT
====================================================== */
exports.createPayment = catchAsync(async (req, res) => {
  const {
    type,
    amount,
    customerId,
    supplierId,
    invoiceId,
    purchaseId,
    paymentMethod,
    paymentDate,
    referenceNumber,
    transactionId
  } = req.body;

  if (!['inflow', 'outflow'].includes(type))
    throw new AppError('Invalid payment type', 400);

  if (amount <= 0)
    throw new AppError('Amount must be positive', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payment = (await Payment.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
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
      createdBy: req.user._id
    }], { session }))[0];

    await postPaymentLedger({ payment, session });

    if (type === 'inflow' && customerId) {
      await Customer.findByIdAndUpdate(
        customerId,
        { $inc: { outstandingBalance: -amount } },
        { session }
      );
    }

    if (type === 'outflow' && supplierId) {
      await Supplier.findByIdAndUpdate(
        supplierId,
        { $inc: { outstandingBalance: -amount } },
        { session }
      );
    }

    if (type === 'inflow' && invoiceId) {
      await Invoice.findByIdAndUpdate(
        invoiceId,
        { $inc: { paidAmount: amount } },
        { session }
      );
    }

    if (type === 'outflow' && purchaseId) {
      await Purchase.findByIdAndUpdate(
        purchaseId,
        { $inc: { paidAmount: amount } },
        { session }
      );
    }

    await session.commitTransaction();
    await invalidateOpeningBalance(req.user.organizationId);

    automationService.triggerEvent('payment.completed', payment, req.user.organizationId);

    res.status(201).json({ status: 'success', data: { payment } });
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
});

/* ======================================================
   UPDATE PAYMENT (REVERSAL SAFE)
====================================================== */
exports.updatePayment = catchAsync(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });

  if (!payment) throw new AppError('Payment not found', 404);

  if (payment.status === 'completed' && req.body.status === 'cancelled') {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await postPaymentLedger({ payment, session, reverse: true });

      if (payment.type === 'inflow' && payment.customerId) {
        await Customer.findByIdAndUpdate(
          payment.customerId,
          { $inc: { outstandingBalance: payment.amount } },
          { session }
        );
      }

      if (payment.type === 'outflow' && payment.supplierId) {
        await Supplier.findByIdAndUpdate(
          payment.supplierId,
          { $inc: { outstandingBalance: payment.amount } },
          { session }
        );
      }

      payment.status = 'cancelled';
      await payment.save({ session });

      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }

  res.json({ status: 'success' });
});

/* ======================================================
   READ / EXPORT
====================================================== */
exports.getAllPayments = factory.getAll(Payment);
exports.getPayment = factory.getOne(Payment);
exports.deletePayment = factory.deleteOne(Payment);

exports.downloadReceipt = catchAsync(async (req, res) => {
  const buffer = await paymentPDFService.downloadPaymentPDF(
    req.params.id,
    req.user.organizationId
  );
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename=receipt_${req.params.id}.pdf`
  });
  res.send(buffer);
});

/* ======================================================
   GET PAYMENTS BY CUSTOMER
====================================================== */
exports.getPaymentsByCustomer = catchAsync(async (req, res) => {
  const payments = await Payment.find({
    organizationId: req.user.organizationId,
    customerId: req.params.customerId,
    isDeleted: { $ne: true }
  }).sort({ paymentDate: -1 });

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments }
  });
});

/* ======================================================
   GET PAYMENTS BY SUPPLIER
====================================================== */
exports.getPaymentsBySupplier = catchAsync(async (req, res) => {
  const payments = await Payment.find({
    organizationId: req.user.organizationId,
    supplierId: req.params.supplierId,
    isDeleted: { $ne: true }
  }).sort({ paymentDate: -1 });

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments }
  });
});

/* ======================================================
   EMAIL RECEIPT
====================================================== */
exports.emailReceipt = catchAsync(async (req, res) => {
  await paymentPDFService.emailPaymentSlip(
    req.params.id,
    req.user.organizationId
  );

  res.status(200).json({
    status: 'success',
    message: 'Receipt emailed successfully'
  });
});



// const mongoose = require('mongoose');
// const Payment = require('../models/paymentModel');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Customer = require('../models/customerModel');
// const Supplier = require('../models/supplierModel');
// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const emiService = require('../services/emiService');
// const paymentPDFService = require("../services/paymentPDFService");
// const automationService = require('../services/automationService');
// const { invalidateOpeningBalance } = require("../services/ledgerCache");

// async function applyPaymentEffects(payment, session, direction = 'apply') {
//   const { 
//     type, amount, organizationId, branchId, 
//     customerId, supplierId, invoiceId, purchaseId, 
//     _id, paymentMethod, referenceNumber, createdBy, paymentDate
//   } = payment;

//   const multiplier = direction === 'apply' ? 1 : -1;
//   const isCash = paymentMethod === 'cash';
//   const bankQuery = isCash 
//     ? { $or: [{ code: '1001' }, { name: 'Cash' }] }
//     : { $or: [{ code: '1002' }, { name: 'Bank' }] }; 
//   const bankAccount = await Account.findOne({ organizationId, ...bankQuery }).session(session);
//   const arAccount = await Account.findOne({ 
//     organizationId, 
//     $or: [{ code: '1200' }, { name: 'Accounts Receivable' }] 
//   }).session(session);

//   // Accounts Payable (For Suppliers)
//   const apAccount = await Account.findOne({ 
//     organizationId, 
//     $or: [{ code: '2000' }, { name: 'Accounts Payable' }] 
//   }).session(session);

//   // 🔴 CRITICAL CHECK: Integrity Guard
//   if (!bankAccount || !arAccount || !apAccount) {
//     throw new AppError(
//       `CRITICAL ACCOUNTING FAILURE: System cannot locate default ledger accounts (Cash/Bank, AR, AP). Transaction aborted to prevent financial data corruption. Please configure your Chart of Accounts.`,
//       500
//     );
//   }
//   const effectiveDate = paymentDate || new Date();
//   // --------------------------------------------------------
//   if (type === 'inflow') {
//     // A. Update Invoice Status & Balance
//     if (invoiceId) {
//       const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
//       if (invoice) {
//         invoice.paidAmount = (invoice.paidAmount || 0) + amount * multiplier;
//         invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;
//         // Float Precision Safety
//         invoice.balanceAmount = Math.round(invoice.balanceAmount * 100) / 100;
//         if (invoice.balanceAmount <= 0) invoice.paymentStatus = 'paid';
//         else if (invoice.paidAmount > 0) invoice.paymentStatus = 'partial';
//         else invoice.paymentStatus = 'unpaid';
//         await invoice.save({ session });
//       }
//     }

//     // B. Update Customer Outstanding Balance
//     if (customerId) {
//       await Customer.findOneAndUpdate(
//         { _id: customerId, organizationId },
//         { $inc: { outstandingBalance: -amount * multiplier } },
//         { session }
//       );
//     }
//     const drAccount = direction === 'apply' ? bankAccount : arAccount;
//     const crAccount = direction === 'apply' ? arAccount : bankAccount;
//     const descPrefix = direction === 'apply' ? 'Payment Recv' : 'Reversal';
//     // Debit Entry
//     await AccountEntry.create([{
//         organizationId, branchId,
//         accountId: drAccount._id,
//         customerId: direction === 'reverse' ? customerId : null, // Tag customer on AR debit
//         paymentId: _id,
//         date: effectiveDate,
//         debit: amount,
//         credit: 0,
//         description: `${descPrefix}: ${referenceNumber || 'Cash'}`,
//         referenceType: 'payment', referenceId: _id, createdBy
//     }], { session });

//     // Credit Entry
//     await AccountEntry.create([{
//         organizationId, branchId,
//         accountId: crAccount._id,
//         customerId: direction === 'apply' ? customerId : null, // Tag customer on AR credit
//         paymentId: _id,
//         date: effectiveDate,
//         debit: 0,
//         credit: amount,
//         description: `${descPrefix}: ${referenceNumber || 'Cash'}`,
//         referenceType: 'payment', referenceId: _id, createdBy
//     }], { session });
//   }

//   // 3. Handle OUTFLOW (Supplier Payment)
//   // --------------------------------------------------------
//   if (type === 'outflow') {
//     // A. Update Purchase Status & Balance
//     if (purchaseId) {
//       const purchase = await Purchase.findOne({ _id: purchaseId, organizationId }).session(session);
//       if (purchase) {
//         purchase.paidAmount = (purchase.paidAmount || 0) + amount * multiplier;
//         purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;
        
//         // Float Precision Safety
//         purchase.balanceAmount = Math.round(purchase.balanceAmount * 100) / 100;

//         if (purchase.balanceAmount <= 0) purchase.paymentStatus = 'paid';
//         else if (purchase.paidAmount > 0) purchase.paymentStatus = 'partial';
//         else purchase.paymentStatus = 'unpaid';
        
//         await purchase.save({ session });
//       }
//     }

//     // B. Update Supplier Outstanding Balance
//     if (supplierId) {
//       await Supplier.findOneAndUpdate(
//         { _id: supplierId, organizationId },
//         { $inc: { outstandingBalance: -amount * multiplier } },
//         { session }
//       );
//     }

//     // C. Write Ledger Entries (Double-Entry)
//     // Apply:   Debit AP, Credit Bank/Cash
//     // Reverse: Debit Bank/Cash, Credit AP
//     const drAccount = direction === 'apply' ? apAccount : bankAccount;
//     const crAccount = direction === 'apply' ? bankAccount : apAccount;
    
//     const descPrefix = direction === 'apply' ? 'Payment Sent' : 'Reversal';

//     // Debit Entry
//     await AccountEntry.create([{
//         organizationId, branchId,
//         accountId: drAccount._id,
//         supplierId: direction === 'apply' ? supplierId : null, // Tag supplier on AP debit
//         paymentId: _id,
//         date: effectiveDate,
//         debit: amount,
//         credit: 0,
//         description: `${descPrefix}: ${referenceNumber || ''}`,
//         referenceType: 'payment', referenceId: _id, createdBy
//     }], { session });

//     // Credit Entry
//     await AccountEntry.create([{
//         organizationId, branchId,
//         accountId: crAccount._id,
//         supplierId: direction === 'reverse' ? supplierId : null, // Tag supplier on AP credit
//         paymentId: _id,
//         date: effectiveDate,
//         debit: 0,
//         credit: amount,
//         description: `${descPrefix}: ${referenceNumber || ''}`,
//         referenceType: 'payment', referenceId: _id, createdBy
//     }], { session });
//   }
// }

// /* ==========================================================
//    Create Payment (Transactional & Idempotent)
// ========================================================== */
// exports.createPayment = catchAsync(async (req, res, next) => {
//   const {
//     type, amount, customerId, supplierId, invoiceId, purchaseId,
//     paymentMethod, paymentDate, referenceNumber, transactionId,
//     bankName, remarks, status,
//   } = req.body;

//   if (!type || !['inflow', 'outflow'].includes(type)) {
//     return next(new AppError('Payment type must be inflow or outflow', 400));
//   }
//   if (!amount || amount <= 0) {
//     return next(new AppError('Amount must be positive', 400));
//   }

//   // --- IDEMPOTENCY CHECK ---
//   // Prevent double-charging due to network retries
//   if (referenceNumber || transactionId) {
//     const existing = await Payment.findOne({
//       organizationId: req.user.organizationId,
//       $or: [
//         { referenceNumber: referenceNumber || null },
//         { transactionId: transactionId || null },
//       ],
//     });
//     if (existing) {
//       return res.status(200).json({
//         status: 'success',
//         message: 'Duplicate payment detected — returning existing record.',
//         data: { payment: existing },
//       });
//     }
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Create Payment Record
//     const paymentArr = await Payment.create(
//       [
//         {
//           organizationId: req.user.organizationId,
//           branchId: req.user.branchId,
//           type,
//           customerId: customerId || null,
//           supplierId: supplierId || null,
//           invoiceId: invoiceId || null,
//           purchaseId: purchaseId || null,
//           paymentDate: paymentDate || new Date(),
//           referenceNumber,
//           amount,
//           paymentMethod,
//           transactionMode: 'manual',
//           transactionId,
//           bankName,
//           remarks,
//           status: status || 'completed',
//           createdBy: req.user._id,
//         },
//       ],
//       { session }
//     );

//     const payment = paymentArr[0];

//     // 2. Apply Financial Effects
//     // Only apply if status is completed. Pending payments impact nothing yet.
//     if (payment.status === 'completed') {
//       await applyPaymentEffects(payment, session, 'apply');
      
//       // 3. EMI Logic (Isolated Try-Catch)
//       // If EMI service fails, we do NOT roll back the main payment.
//       if (type === 'inflow' && invoiceId && customerId) {
//           try {
//             await emiService.applyPaymentToEmi({
//               customerId,
//               invoiceId,
//               amount,
//               paymentId: payment._id,
//               organizationId: req.user.organizationId,
//             });
//           } catch (err) {
//             console.error('⚠️ EMI Auto-Allocation Failed (Non-Critical):', err.message);
//           }
//       }
//     }

//     await session.commitTransaction();
// automationService.triggerEvent('payment.received', payment, req.user.organizationId);

//     res.status(201).json({
//       status: 'success',
//       message: 'Payment recorded successfully',
//       data: { payment },
//     });
//     await invalidateOpeningBalance(req.user.organizationId);

//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* ==========================================================
//    Update Payment (Status Transitions & Reversals)
// ========================================================== */
// exports.updatePayment = catchAsync(async (req, res, next) => {
//   const payment = await Payment.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId,
//   });

//   if (!payment) {
//     return next(new AppError('No payment found with that ID', 404));
//   }

//   const prevStatus = payment.status;
//   const newStatus = req.body.status || payment.status;

//   // Prevent editing locked fields on completed payments to ensure audit trail integrity
//   if (prevStatus === 'completed' && req.body.amount && req.body.amount !== payment.amount) {
//      return next(new AppError('Cannot change amount of a completed payment. Please void/cancel and recreate.', 400));
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // --- Update fields ---
//     Object.assign(payment, req.body);
//     await payment.save({ session });

//     // --- Handle Status State Machine ---
//     if (prevStatus !== newStatus) {
//       // Case 1: Pending -> Completed (Apply Money)
//       if (prevStatus !== 'completed' && newStatus === 'completed') {
//         await applyPaymentEffects(payment, session, 'apply');
//       } 
//       // Case 2: Completed -> Failed/Cancelled (Reverse Money)
//       else if (prevStatus === 'completed' && (newStatus === 'failed' || newStatus === 'cancelled')) {
//         await applyPaymentEffects(payment, session, 'reverse');
//       }
//       // Case 3: Failed/Cancelled -> Completed (Re-Apply Money)
//       else if ((prevStatus === 'failed' || prevStatus === 'cancelled') && newStatus === 'completed') {
//         await applyPaymentEffects(payment, session, 'apply');
//       }
//     }

//     await session.commitTransaction();

//     res.status(200).json({
//       status: 'success',
//       message: 'Payment updated successfully',
//       data: { payment },
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* ==========================================================
//    Standard CRUD & Queries
// ========================================================== */
// exports.getAllPayments = factory.getAll(Payment);
// exports.getPayment = factory.getOne(Payment, ['customerId', 'supplierId', 'invoiceId', 'purchaseId']);
// exports.deletePayment = factory.deleteOne(Payment); // Note: Soft delete is handled by Model middleware usually

// exports.getPaymentsByCustomer = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;
//   const payments = await Payment.find({
//     organizationId: req.user.organizationId,
//     customerId,
//     isDeleted: { $ne: true },
//   }).sort({ paymentDate: -1 });

//   res.status(200).json({
//     status: 'success',
//     results: payments.length,
//     data: { payments },
//   });
// });

// exports.getPaymentsBySupplier = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;
//   const payments = await Payment.find({
//     organizationId: req.user.organizationId,
//     supplierId,
//     isDeleted: { $ne: true },
//   }).sort({ paymentDate: -1 });

//   res.status(200).json({
//     status: 'success',
//     results: payments.length,
//     data: { payments },
//   });
// });

// /* ==========================================================
//    Documents & Receipts
// ========================================================== */
// exports.downloadReceipt = catchAsync(async (req, res, next) => {
//   const buffer = await paymentPDFService.downloadPaymentPDF(req.params.id, req.user.organizationId);
//   res.set({
//     "Content-Type": "application/pdf",
//     "Content-Disposition": `inline; filename=receipt_${req.params.id}.pdf`,
//   });
//   res.send(buffer);
// });

// exports.emailReceipt = catchAsync(async (req, res, next) => {
//   await paymentPDFService.emailPaymentSlip(req.params.id, req.user.organizationId);
//   res.status(200).json({ status: "success", message: "Receipt emailed successfully" });
// });
