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
const paymentPDFService = require("../services/paymentPDFService");
const automationService = require('../services/automationService');
const { invalidateOpeningBalance } = require("../services/ledgerCache");

/* ==========================================================
   AUDIT CORE: Apply or Reverse Financial Effects
   ----------------------------------------------------------
   Logic: 
   1. Validates GL Accounts exist (Cash, Bank, AR, AP).
   2. Updates Denormalized Balances (Invoice/Customer).
   3. Writes Immutable Double-Entry Ledger Records.
   
   ⛔ SAFETY: This function throws an error if accounting 
   cannot be performed. NO SILENT FAILURES.
========================================================== */
async function applyPaymentEffects(payment, session, direction = 'apply') {
  const { 
    type, amount, organizationId, branchId, 
    customerId, supplierId, invoiceId, purchaseId, 
    _id, paymentMethod, referenceNumber, createdBy, paymentDate
  } = payment;

  const multiplier = direction === 'apply' ? 1 : -1;
  const isCash = paymentMethod === 'cash';

  // 1. Resolve Ledger Accounts (Robust Lookup: Code -> Name)
  // --------------------------------------------------------
  // Cash/Bank
  const bankQuery = isCash 
    ? { $or: [{ code: '1001' }, { name: 'Cash' }] }
    : { $or: [{ code: '1002' }, { name: 'Bank' }] };
    
  const bankAccount = await Account.findOne({ organizationId, ...bankQuery }).session(session);

  // Accounts Receivable (For Customers)
  const arAccount = await Account.findOne({ 
    organizationId, 
    $or: [{ code: '1200' }, { name: 'Accounts Receivable' }] 
  }).session(session);

  // Accounts Payable (For Suppliers)
  const apAccount = await Account.findOne({ 
    organizationId, 
    $or: [{ code: '2000' }, { name: 'Accounts Payable' }] 
  }).session(session);

  // 🔴 CRITICAL CHECK: Integrity Guard
  if (!bankAccount || !arAccount || !apAccount) {
    throw new AppError(
      `CRITICAL ACCOUNTING FAILURE: System cannot locate default ledger accounts (Cash/Bank, AR, AP). Transaction aborted to prevent financial data corruption. Please configure your Chart of Accounts.`,
      500
    );
  }

  const effectiveDate = paymentDate || new Date();

  // 2. Handle INFLOW (Customer Payment)
  // --------------------------------------------------------
  if (type === 'inflow') {
    // A. Update Invoice Status & Balance
    if (invoiceId) {
      const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
      if (invoice) {
        invoice.paidAmount = (invoice.paidAmount || 0) + amount * multiplier;
        invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;
        
        // Float Precision Safety
        invoice.balanceAmount = Math.round(invoice.balanceAmount * 100) / 100;

        if (invoice.balanceAmount <= 0) invoice.paymentStatus = 'paid';
        else if (invoice.paidAmount > 0) invoice.paymentStatus = 'partial';
        else invoice.paymentStatus = 'unpaid';
        
        await invoice.save({ session });
      }
    }

    // B. Update Customer Outstanding Balance
    if (customerId) {
      await Customer.findOneAndUpdate(
        { _id: customerId, organizationId },
        { $inc: { outstandingBalance: -amount * multiplier } },
        { session }
      );
    }

    // C. Write Ledger Entries (Double-Entry)
    // Apply:   Debit Bank/Cash, Credit AR
    // Reverse: Debit AR, Credit Bank/Cash
    const drAccount = direction === 'apply' ? bankAccount : arAccount;
    const crAccount = direction === 'apply' ? arAccount : bankAccount;
    
    const descPrefix = direction === 'apply' ? 'Payment Recv' : 'Reversal';

    // Debit Entry
    await AccountEntry.create([{
        organizationId, branchId,
        accountId: drAccount._id,
        customerId: direction === 'reverse' ? customerId : null, // Tag customer on AR debit
        paymentId: _id,
        date: effectiveDate,
        debit: amount,
        credit: 0,
        description: `${descPrefix}: ${referenceNumber || 'Cash'}`,
        referenceType: 'payment', referenceId: _id, createdBy
    }], { session });

    // Credit Entry
    await AccountEntry.create([{
        organizationId, branchId,
        accountId: crAccount._id,
        customerId: direction === 'apply' ? customerId : null, // Tag customer on AR credit
        paymentId: _id,
        date: effectiveDate,
        debit: 0,
        credit: amount,
        description: `${descPrefix}: ${referenceNumber || 'Cash'}`,
        referenceType: 'payment', referenceId: _id, createdBy
    }], { session });
  }

  // 3. Handle OUTFLOW (Supplier Payment)
  // --------------------------------------------------------
  if (type === 'outflow') {
    // A. Update Purchase Status & Balance
    if (purchaseId) {
      const purchase = await Purchase.findOne({ _id: purchaseId, organizationId }).session(session);
      if (purchase) {
        purchase.paidAmount = (purchase.paidAmount || 0) + amount * multiplier;
        purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;
        
        // Float Precision Safety
        purchase.balanceAmount = Math.round(purchase.balanceAmount * 100) / 100;

        if (purchase.balanceAmount <= 0) purchase.paymentStatus = 'paid';
        else if (purchase.paidAmount > 0) purchase.paymentStatus = 'partial';
        else purchase.paymentStatus = 'unpaid';
        
        await purchase.save({ session });
      }
    }

    // B. Update Supplier Outstanding Balance
    if (supplierId) {
      await Supplier.findOneAndUpdate(
        { _id: supplierId, organizationId },
        { $inc: { outstandingBalance: -amount * multiplier } },
        { session }
      );
    }

    // C. Write Ledger Entries (Double-Entry)
    // Apply:   Debit AP, Credit Bank/Cash
    // Reverse: Debit Bank/Cash, Credit AP
    const drAccount = direction === 'apply' ? apAccount : bankAccount;
    const crAccount = direction === 'apply' ? bankAccount : apAccount;
    
    const descPrefix = direction === 'apply' ? 'Payment Sent' : 'Reversal';

    // Debit Entry
    await AccountEntry.create([{
        organizationId, branchId,
        accountId: drAccount._id,
        supplierId: direction === 'apply' ? supplierId : null, // Tag supplier on AP debit
        paymentId: _id,
        date: effectiveDate,
        debit: amount,
        credit: 0,
        description: `${descPrefix}: ${referenceNumber || ''}`,
        referenceType: 'payment', referenceId: _id, createdBy
    }], { session });

    // Credit Entry
    await AccountEntry.create([{
        organizationId, branchId,
        accountId: crAccount._id,
        supplierId: direction === 'reverse' ? supplierId : null, // Tag supplier on AP credit
        paymentId: _id,
        date: effectiveDate,
        debit: 0,
        credit: amount,
        description: `${descPrefix}: ${referenceNumber || ''}`,
        referenceType: 'payment', referenceId: _id, createdBy
    }], { session });
  }
}

/* ==========================================================
   Create Payment (Transactional & Idempotent)
========================================================== */
exports.createPayment = catchAsync(async (req, res, next) => {
  const {
    type, amount, customerId, supplierId, invoiceId, purchaseId,
    paymentMethod, paymentDate, referenceNumber, transactionId,
    bankName, remarks, status,
  } = req.body;

  if (!type || !['inflow', 'outflow'].includes(type)) {
    return next(new AppError('Payment type must be inflow or outflow', 400));
  }
  if (!amount || amount <= 0) {
    return next(new AppError('Amount must be positive', 400));
  }

  // --- IDEMPOTENCY CHECK ---
  // Prevent double-charging due to network retries
  if (referenceNumber || transactionId) {
    const existing = await Payment.findOne({
      organizationId: req.user.organizationId,
      $or: [
        { referenceNumber: referenceNumber || null },
        { transactionId: transactionId || null },
      ],
    });
    if (existing) {
      return res.status(200).json({
        status: 'success',
        message: 'Duplicate payment detected — returning existing record.',
        data: { payment: existing },
      });
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Create Payment Record
    const paymentArr = await Payment.create(
      [
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          type,
          customerId: customerId || null,
          supplierId: supplierId || null,
          invoiceId: invoiceId || null,
          purchaseId: purchaseId || null,
          paymentDate: paymentDate || new Date(),
          referenceNumber,
          amount,
          paymentMethod,
          transactionMode: 'manual',
          transactionId,
          bankName,
          remarks,
          status: status || 'completed',
          createdBy: req.user._id,
        },
      ],
      { session }
    );

    const payment = paymentArr[0];

    // 2. Apply Financial Effects
    // Only apply if status is completed. Pending payments impact nothing yet.
    if (payment.status === 'completed') {
      await applyPaymentEffects(payment, session, 'apply');
      
      // 3. EMI Logic (Isolated Try-Catch)
      // If EMI service fails, we do NOT roll back the main payment.
      if (type === 'inflow' && invoiceId && customerId) {
          try {
            await emiService.applyPaymentToEmi({
              customerId,
              invoiceId,
              amount,
              paymentId: payment._id,
              organizationId: req.user.organizationId,
            });
          } catch (err) {
            console.error('⚠️ EMI Auto-Allocation Failed (Non-Critical):', err.message);
          }
      }
    }

    await session.commitTransaction();
automationService.triggerEvent('payment.received', payment, req.user.organizationId);

    res.status(201).json({
      status: 'success',
      message: 'Payment recorded successfully',
      data: { payment },
    });
    await invalidateOpeningBalance(req.user.organizationId);

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ==========================================================
   Update Payment (Status Transitions & Reversals)
========================================================== */
exports.updatePayment = catchAsync(async (req, res, next) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });

  if (!payment) {
    return next(new AppError('No payment found with that ID', 404));
  }

  const prevStatus = payment.status;
  const newStatus = req.body.status || payment.status;

  // Prevent editing locked fields on completed payments to ensure audit trail integrity
  if (prevStatus === 'completed' && req.body.amount && req.body.amount !== payment.amount) {
     return next(new AppError('Cannot change amount of a completed payment. Please void/cancel and recreate.', 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // --- Update fields ---
    Object.assign(payment, req.body);
    await payment.save({ session });

    // --- Handle Status State Machine ---
    if (prevStatus !== newStatus) {
      // Case 1: Pending -> Completed (Apply Money)
      if (prevStatus !== 'completed' && newStatus === 'completed') {
        await applyPaymentEffects(payment, session, 'apply');
      } 
      // Case 2: Completed -> Failed/Cancelled (Reverse Money)
      else if (prevStatus === 'completed' && (newStatus === 'failed' || newStatus === 'cancelled')) {
        await applyPaymentEffects(payment, session, 'reverse');
      }
      // Case 3: Failed/Cancelled -> Completed (Re-Apply Money)
      else if ((prevStatus === 'failed' || prevStatus === 'cancelled') && newStatus === 'completed') {
        await applyPaymentEffects(payment, session, 'apply');
      }
    }

    await session.commitTransaction();

    res.status(200).json({
      status: 'success',
      message: 'Payment updated successfully',
      data: { payment },
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ==========================================================
   Standard CRUD & Queries
========================================================== */
exports.getAllPayments = factory.getAll(Payment);
exports.getPayment = factory.getOne(Payment, ['customerId', 'supplierId', 'invoiceId', 'purchaseId']);
exports.deletePayment = factory.deleteOne(Payment); // Note: Soft delete is handled by Model middleware usually

exports.getPaymentsByCustomer = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const payments = await Payment.find({
    organizationId: req.user.organizationId,
    customerId,
    isDeleted: { $ne: true },
  }).sort({ paymentDate: -1 });

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments },
  });
});

exports.getPaymentsBySupplier = catchAsync(async (req, res, next) => {
  const { supplierId } = req.params;
  const payments = await Payment.find({
    organizationId: req.user.organizationId,
    supplierId,
    isDeleted: { $ne: true },
  }).sort({ paymentDate: -1 });

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments },
  });
});

/* ==========================================================
   Documents & Receipts
========================================================== */
exports.downloadReceipt = catchAsync(async (req, res, next) => {
  const buffer = await paymentPDFService.downloadPaymentPDF(req.params.id, req.user.organizationId);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename=receipt_${req.params.id}.pdf`,
  });
  res.send(buffer);
});

exports.emailReceipt = catchAsync(async (req, res, next) => {
  await paymentPDFService.emailPaymentSlip(req.params.id, req.user.organizationId);
  res.status(200).json({ status: "success", message: "Receipt emailed successfully" });
});

// const mongoose = require('mongoose');
// const Payment = require('../models/paymentModel');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Customer = require('../models/customerModel');
// const Supplier = require('../models/supplierModel');
// const AccountEntry = require('../models/accountEntryModel'); // ✅ Added
// const Account = require('../models/accountModel'); // ✅ Added
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const emiService = require('../services/emiService');
// const paymentPDFService = require("../services/paymentPDFService");

// /* ==========================================================
//    Utility: Apply or Reverse Balances & Accounting Entries
//    ----------------------------------------------------------
//    Used internally by createPayment() and updatePayment()
// ========================================================== */
// async function applyPaymentEffects(payment, session, direction = 'apply') {
//   const { type, amount, organizationId, branchId, customerId, supplierId, invoiceId, purchaseId, _id, paymentMethod, referenceNumber } = payment;
//   const multiplier = direction === 'apply' ? 1 : -1; // reverse if needed

//   // 1. Resolve Accounts (Cash/Bank vs AR/AP)
//   // --------------------------------------------------------
//   // Logic: If payment is Cash -> Use 'Cash in Hand'. Else -> Use 'Bank'.
//   const isCash = paymentMethod === 'cash';
//   const bankAccount = await Account.findOne({ 
//     organizationId, 
//     $or: [
//         { name: isCash ? 'Cash' : 'Bank' }, 
//         { code: isCash ? '1001' : '1002' } // Example codes
//     ]
//   }).session(session);

//   const arAccount = await Account.findOne({ organizationId, name: 'Accounts Receivable' }).session(session);
//   const apAccount = await Account.findOne({ organizationId, name: 'Accounts Payable' }).session(session);

//   // Fallback to avoid crashes if accounts missing (Safety)
//   if (!bankAccount || !arAccount || !apAccount) {
//     console.warn("Accounting Warning: Default accounts (Cash, AR, AP) not found. Skipping GL entries.");
//   }

//   // 2. Handle INFLOW (Customer Payment)
//   // --------------------------------------------------------
//   if (type === 'inflow') {
//     // A. Update Invoice & Customer (Denormalized Data)
//     if (invoiceId) {
//       const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
//       if (invoice) {
//         invoice.paidAmount = (invoice.paidAmount || 0) + amount * multiplier;
//         invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;
//         if (invoice.balanceAmount <= 0) invoice.paymentStatus = 'paid';
//         else if (invoice.paidAmount > 0) invoice.paymentStatus = 'partial';
//         else invoice.paymentStatus = 'unpaid';
//         await invoice.save({ session });
//       }
//     }

//     // Update customer outstanding
//     await Customer.findOneAndUpdate(
//       { _id: customerId, organizationId },
//       { $inc: { outstandingBalance: -amount * multiplier } },
//       { session }
//     );

//     // B. Create Accounting Entries (The Fix)
//     if (bankAccount && arAccount) {
//         // Logic:
//         // Apply: Dr Cash, Cr Accounts Receivable
//         // Reverse: Dr Accounts Receivable, Cr Cash
        
//         const drAccount = direction === 'apply' ? bankAccount : arAccount;
//         const crAccount = direction === 'apply' ? arAccount : bankAccount;

//         // Debit Entry
//         await AccountEntry.create([{
//             organizationId, branchId,
//             accountId: drAccount._id,
//             customerId: direction === 'reverse' ? customerId : null, // If reversing, we debit AR (tag customer)
//             paymentId: _id,
//             date: payment.paymentDate || new Date(),
//             debit: amount,
//             credit: 0,
//             description: direction === 'apply' ? `Payment Recv: ${referenceNumber || 'Cash'}` : `Payment Reversal: ${referenceNumber}`,
//             referenceType: 'payment',
//             referenceId: _id,
//             createdBy: payment.createdBy
//         }], { session });

//         // Credit Entry
//         await AccountEntry.create([{
//             organizationId, branchId,
//             accountId: crAccount._id,
//             customerId: direction === 'apply' ? customerId : null, // If applying, we credit AR (tag customer)
//             paymentId: _id,
//             date: payment.paymentDate || new Date(),
//             debit: 0,
//             credit: amount,
//             description: direction === 'apply' ? `Payment Recv: ${referenceNumber || 'Cash'}` : `Payment Reversal: ${referenceNumber}`,
//             referenceType: 'payment',
//             referenceId: _id,
//             createdBy: payment.createdBy
//         }], { session });
//     }
//   }

//   // 3. Handle OUTFLOW (Supplier Payment)
//   // --------------------------------------------------------
//   if (type === 'outflow') {
//     // A. Update Purchase & Supplier (Denormalized Data)
//     if (purchaseId) {
//       const purchase = await Purchase.findOne({ _id: purchaseId, organizationId }).session(session);
//       if (purchase) {
//         purchase.paidAmount = (purchase.paidAmount || 0) + amount * multiplier;
//         purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;
//         if (purchase.balanceAmount <= 0) purchase.paymentStatus = 'paid';
//         else if (purchase.paidAmount > 0) purchase.paymentStatus = 'partial';
//         else purchase.paymentStatus = 'unpaid';
//         await purchase.save({ session });
//       }
//     }

//     await Supplier.findOneAndUpdate(
//       { _id: supplierId, organizationId },
//       { $inc: { outstandingBalance: -amount * multiplier } },
//       { session }
//     );

//     // B. Create Accounting Entries (The Fix)
//     if (bankAccount && apAccount) {
//         // Logic:
//         // Apply: Dr Accounts Payable, Cr Cash
//         // Reverse: Dr Cash, Cr Accounts Payable
        
//         const drAccount = direction === 'apply' ? apAccount : bankAccount;
//         const crAccount = direction === 'apply' ? bankAccount : apAccount;

//         // Debit Entry
//         await AccountEntry.create([{
//             organizationId, branchId,
//             accountId: drAccount._id,
//             supplierId: direction === 'apply' ? supplierId : null, // If applying, we debit AP (tag supplier)
//             paymentId: _id,
//             date: payment.paymentDate || new Date(),
//             debit: amount,
//             credit: 0,
//             description: direction === 'apply' ? `Paid Supplier: ${referenceNumber}` : `Payment Reversal`,
//             referenceType: 'payment',
//             referenceId: _id,
//             createdBy: payment.createdBy
//         }], { session });

//         // Credit Entry
//         await AccountEntry.create([{
//             organizationId, branchId,
//             accountId: crAccount._id,
//             supplierId: direction === 'reverse' ? supplierId : null, // If reversing, we credit AP (tag supplier)
//             paymentId: _id,
//             date: payment.paymentDate || new Date(),
//             debit: 0,
//             credit: amount,
//             description: direction === 'apply' ? `Paid Supplier: ${referenceNumber}` : `Payment Reversal`,
//             referenceType: 'payment',
//             referenceId: _id,
//             createdBy: payment.createdBy
//         }], { session });
//     }
//   }
// }

// /* ==========================================================
//    Create Payment (with idempotency + effects)
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
//           paymentDate: paymentDate || Date.now(),
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

//     // 2. Apply Financial Effects (Balances + GL Entries)
//     if (payment.status === 'completed') {
//       await applyPaymentEffects(payment, session, 'apply');
      
//       // EMI Auto-update logic (Only for Inflow)
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
//             console.error('Error applying payment to EMI:', err.message);
//             // We don't abort transaction for EMI failure as it's a secondary service
//           }
//       }
//     }

//     await session.commitTransaction();

//     res.status(201).json({
//       status: 'success',
//       message: 'Payment recorded successfully',
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
//    Update Payment (status transition + reversal logic)
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

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // --- Update basic fields ---
//     Object.assign(payment, req.body);
//     await payment.save({ session });

//     // --- Handle status transitions ---
//     if (prevStatus !== newStatus) {
//       if (prevStatus !== 'completed' && newStatus === 'completed') {
//         // Apply effects
//         await applyPaymentEffects(payment, session, 'apply');
//       } else if (prevStatus === 'completed' && newStatus === 'failed') {
//         // Reverse effects
//         await applyPaymentEffects(payment, session, 'reverse');
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
//    Simple CRUD (Factory)
// ========================================================== */
// exports.getAllPayments = factory.getAll(Payment);
// exports.getPayment = factory.getOne(Payment,['customerId','organizationId','branchId']);
// exports.deletePayment = factory.deleteOne(Payment);

// /* ==========================================================
//    Convenience Queries
// ========================================================== */
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
