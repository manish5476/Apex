const mongoose = require('mongoose');
const Payment = require('./payment.model');
const Invoice = require('../billing/invoice.model');
const Purchase = require('../../inventory/core/purchase.model');
const Customer = require('../../organization/core/customer.model');
const Supplier = require('../../organization/core/supplier.model');
const AccountEntry = require('../core/accountEntry.model');
const Account = require('../core/account.model');
const catchAsync = require('../../../core/utils/catchAsync');
const AppError = require('../../../core/utils/appError');
const factory = require('../../../core/utils/handlerFactory');
const emiService = require('../../_legacy/services/emiService');
const paymentPDFService = require('./paymentPDF.service');
const automationService = require('../../_legacy/services/automationService');
const { invalidateOpeningBalance } = require('../core/ledgerCache.service');
const PendingReconciliation = require('../../_legacy/models/pendingReconciliationModel');
const paymentAllocationService = require('./paymentAllocation.service');

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
  const { organizationId, branchId, type, amount, customerId, supplierId, paymentMethod, _id, paymentDate, createdBy } = payment;
  const cash = await getAccount(organizationId, paymentMethod === 'cash' ? '1001' : '1002', paymentMethod === 'cash' ? 'Cash' : 'Bank', 'asset', session);

  const ar = await getAccount(organizationId, '1200', 'Accounts Receivable', 'asset', session);
  const ap = await getAccount(organizationId, '2000', 'Accounts Payable', 'liability', session);

  const date = paymentDate || new Date();

  if (type === 'inflow') {
    await AccountEntry.insertMany([
      {
        organizationId, branchId, accountId: cash._id, debit: amount * sign, credit: 0, paymentId: _id, date, referenceType: 'payment', referenceId: _id, createdBy
      },
      {
        organizationId, branchId, accountId: ar._id, customerId, debit: 0, credit: amount * sign, paymentId: _id, date, referenceType: 'payment', referenceId: _id, createdBy
      }
    ], { session });
  }

  if (type === 'outflow') {
    await AccountEntry.insertMany([
      {
        organizationId, branchId, accountId: ap._id, supplierId, debit: amount * sign, credit: 0,
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
  const { type, amount, customerId, supplierId, invoiceId, purchaseId, paymentMethod, paymentDate, referenceNumber, transactionId } = req.body;

  if (!['inflow', 'outflow'].includes(type)) throw new AppError('Invalid payment type', 400);
  if (amount <= 0) throw new AppError('Amount must be positive', 400);
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

    // 5. FIX: Update Invoice Correctly (Same logic as Purchase)
    if (type === 'inflow' && invoiceId) {
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (invoice) {
        invoice.paidAmount = (invoice.paidAmount || 0) + amount;
        invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;

        if (invoice.balanceAmount <= 0) {
          invoice.balanceAmount = 0;
          invoice.paymentStatus = 'paid';
        } else {
          invoice.paymentStatus = 'partial';
        }
        await invoice.save({ session });
      }
    }

    // if (type === 'inflow' && invoiceId) {
    //   await Invoice.findByIdAndUpdate(
    //     invoiceId,
    //     { $inc: { paidAmount: amount } },
    //     { session }
    //   );
    // }

    // 4. FIX: Update Purchase Correctly
    if (type === 'outflow' && purchaseId) {
      const purchase = await Purchase.findById(purchaseId).session(session);
      if (purchase) {
        purchase.paidAmount = (purchase.paidAmount || 0) + amount;

        // Recalculate Balance
        purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;

        // Update Status
        if (purchase.balanceAmount <= 0) {
          purchase.balanceAmount = 0; // Prevent negative
          purchase.paymentStatus = 'paid';
        } else {
          purchase.paymentStatus = 'partial';
        }

        await purchase.save({ session }); // Triggers your pre-save middleware
      }
    }

    // if (type === 'outflow' && purchaseId) {
    //   await Purchase.findByIdAndUpdate(
    //     purchaseId,
    //     { $inc: { paidAmount: amount } },
    //     { session }
    //   );
    // }

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
// exports.updatePayment = catchAsync(async (req, res) => {
//   const payment = await Payment.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!payment) throw new AppError('Payment not found', 404);
//   if (payment.status === 'completed' && req.body.status === 'cancelled') {
//     const session = await mongoose.startSession();
//     session.startTransaction();
//     try {
//       await postPaymentLedger({ payment, session, reverse: true });
//       if (payment.type === 'inflow' && payment.customerId) {
//         await Customer.findByIdAndUpdate(
//           payment.customerId,
//           { $inc: { outstandingBalance: payment.amount } },
//           { session }
//         );
//       }

//       if (payment.type === 'outflow' && payment.supplierId) {
//         await Supplier.findByIdAndUpdate(
//           payment.supplierId,
//           { $inc: { outstandingBalance: payment.amount } },
//           { session }
//         );
//       }

//       payment.status = 'cancelled';
//       await payment.save({ session });

//       await session.commitTransaction();
//     } catch (e) {
//       await session.abortTransaction();
//       throw e;
//     } finally {
//       session.endSession();
//     }
//   }

//   res.json({ status: 'success' });
// });
/* ======================================================
   UPDATE PAYMENT (REVERSAL SAFE & SYNCED)
====================================================== */
exports.updatePayment = catchAsync(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });

  if (!payment) throw new AppError('Payment not found', 404);

  // Only proceed if we are cancelling a completed payment
  if (payment.status === 'completed' && req.body.status === 'cancelled') {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Reverse Ledger Entries (Existing Logic)
      await postPaymentLedger({ payment, session, reverse: true });

      // 2. Reverse Customer Balance (Existing Logic)
      if (payment.type === 'inflow' && payment.customerId) {
        await Customer.findByIdAndUpdate(
          payment.customerId,
          { $inc: { outstandingBalance: payment.amount } },
          { session }
        );
      }

      // 3. Reverse Supplier Balance (Existing Logic)
      if (payment.type === 'outflow' && payment.supplierId) {
        await Supplier.findByIdAndUpdate(
          payment.supplierId,
          { $inc: { outstandingBalance: payment.amount } },
          { session }
        );
      }

      // ============================================================
      // 4. [NEW] Reverse Impact on INVOICE (Customer Payment)
      // ============================================================
      if (payment.invoiceId) {
        const invoice = await Invoice.findById(payment.invoiceId).session(session);
        if (invoice) {
          // Decrease paid amount
          invoice.paidAmount = (invoice.paidAmount || 0) - payment.amount;

          // Prevent negative floating point errors
          if (invoice.paidAmount < 0) invoice.paidAmount = 0;

          // Recalculate Balance
          invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;

          // Revert Status
          if (invoice.paidAmount === 0) {
            invoice.paymentStatus = 'unpaid';
          } else {
            invoice.paymentStatus = 'partial';
          }

          await invoice.save({ session });
        }
      }

      // ============================================================
      // 5. [NEW] Reverse Impact on PURCHASE (Supplier Payment)
      // ============================================================
      if (payment.purchaseId) {
        const purchase = await Purchase.findById(payment.purchaseId).session(session);
        if (purchase) {
          // Decrease paid amount
          purchase.paidAmount = (purchase.paidAmount || 0) - payment.amount;

          // Prevent negative floating point errors
          if (purchase.paidAmount < 0) purchase.paidAmount = 0;

          // Recalculate Balance
          purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;

          // Revert Status
          if (purchase.paidAmount === 0) {
            purchase.paymentStatus = 'unpaid';
          } else {
            purchase.paymentStatus = 'partial';
          }

          await purchase.save({ session });
        }
      }
      // ============================================================

      // 6. Mark Payment as Cancelled
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

  res.json({ status: 'success', message: 'Payment cancelled and related documents updated' });
});
/* ======================================================
   READ / EXPORT
====================================================== */
exports.getAllPayments = factory.getAll(Payment, {
  populate: [
    { 
      path: 'customerId', 
      select: 'name phone type email gstNumber' 
    },
    { 
      path: 'invoiceId', 
      select: 'invoiceNumber grandTotal invoiceDate balanceAmount' 
    },
    { 
      path: 'branchId', 
      select: 'name branchCode' 
    }
  ]
});

exports.getPayment = factory.getOne(Payment);
exports.deletePayment = factory.deleteOne(Payment);

exports.downloadReceipt = catchAsync(async (req, res) => {
  const buffer = await paymentPDFService.downloadPaymentPDF(req.params.id, req.user.organizationIds);
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


exports.paymentGatewayWebhook = catchAsync(async (req, res, next) => {
  const {
    event,
    transaction_id,
    invoice_id,
    amount,
    payment_method,
    timestamp
  } = req.body;

  // 1. SECURITY: Verify Signature (CRITICAL in production)
  // const signature = req.headers['x-razorpay-signature'];
  // if (!verifySignature(req.body, signature)) return res.status(401).send();

  // 2. Find Organization/Invoice
  const invoice = await Invoice.findOne({ invoiceNumber: invoice_id }).populate('organizationId');
  if (!invoice) return res.status(404).json({ status: 'error', message: 'Invoice not found' });

  // 3. IDEMPOTENCY CHECK (Prevents Double Billing)
  // Webhooks retry on failure. If we already processed this ID, ignore it.
  const existingPayment = await Payment.findOne({
    transactionId: transaction_id,
    organizationId: invoice.organizationId._id
  });

  if (existingPayment) {
    return res.status(200).json({ status: 'ignored', message: 'Payment already processed' });
  }

  if (event === 'payment.success') {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 4. Create Payment Record
      const payment = (await Payment.create([{
        organizationId: invoice.organizationId._id,
        branchId: invoice.branchId,
        type: 'inflow',
        amount: amount / 100,
        customerId: invoice.customerId,
        invoiceId: invoice._id,
        paymentMethod: mapPaymentMethod(payment_method),
        transactionId: transaction_id,
        paymentDate: new Date(timestamp * 1000),
        referenceNumber: transaction_id,
        status: 'completed',
        transactionMode: 'auto',
        createdBy: null
      }], { session }))[0];

      // 5. MISSING LINK: Post to Ledger (Cash vs AR)
      await postPaymentLedger({ payment, session });

      // 6. MISSING LINK: Update Customer Outstanding Balance
      await Customer.findByIdAndUpdate(
        invoice.customerId,
        { $inc: { outstandingBalance: -(amount / 100) } },
        { session }
      );

      await session.commitTransaction();

      // 7. Auto-allocate (Outside transaction to prevent locking issues)
      // Note: Ensure your allocation service handles the Invoice Update (paidAmount/status)
      try {
        await paymentAllocationService.autoAllocatePayment(
          payment._id,
          invoice.organizationId._id
        );
      } catch (allocError) {
        console.error("Auto-allocation failed, but payment recorded:", allocError);
        // Don't fail the webhook response; payment is secure, just allocation failed.
      }

      return res.status(200).json({
        status: 'success',
        message: 'Payment recorded, ledger posted, and allocated',
        data: { paymentId: payment._id }
      });

    } catch (error) {
      await session.abortTransaction();

      // Fallback: Create Pending Reconciliation Record
      await PendingReconciliation.create({
        organizationId: invoice.organizationId._id,
        invoiceId: invoice._id,
        customerId: invoice.customerId,
        externalTransactionId: transaction_id,
        amount: amount / 100,
        paymentDate: new Date(timestamp * 1000),
        paymentMethod: mapPaymentMethod(payment_method),
        gateway: 'razorpay',
        rawData: req.body,
        status: 'pending',
        error: error.message
      });

      return res.status(200).json({ status: 'pending', message: 'Queued for manual review' });
    } finally {
      session.endSession();
    }
  }

  res.status(200).json({ status: 'acknowledged' });
});

// exports.paymentGatewayWebhook = catchAsync(async (req, res, next) => {
//   const {
//     event, // 'payment.success', 'payment.failed', etc.
//     transaction_id,
//     invoice_id, // Your invoice number
//     amount,
//     currency,
//     payment_method,
//     timestamp,
//     customer_email,
//     metadata
//   } = req.body;

//   // Find organization by invoice number
//   const invoice = await Invoice.findOne({
//     invoiceNumber: invoice_id
//   }).populate('organizationId');

//   if (!invoice) {
//     return res.status(404).json({
//       status: 'error',
//       message: 'Invoice not found'
//     });
//   }

//   // if (event === 'payment.success') {
//   //   try {
//   //     const result = await emiService.autoReconcilePayment({
//   //       organizationId: invoice.organizationId._id,
//   //       branchId: invoice.branchId,
//   //       invoiceId: invoice._id,
//   //       amount: amount / 100, // Convert from paise to rupees
//   //       paymentDate: new Date(timestamp * 1000),
//   //       paymentMethod: mapPaymentMethod(payment_method),
//   //       transactionId: transaction_id,
//   //       gateway: 'razorpay', // or 'stripe', 'paypal', etc.
//   //       createdBy: null // System user
//   //     });

//   //     return res.status(200).json({
//   //       status: 'success',
//   //       message: 'Payment reconciled successfully',
//   //       data: result
//   //     });

//   //   } catch (error) {
//   //     // Store for manual reconciliation
//   // await PendingReconciliation.create({
//   //   organizationId: invoice.organizationId._id,
//   //   invoiceId: invoice._id,
//   //   customerId: invoice.customerId,
//   //   externalTransactionId: transaction_id,
//   //   amount: amount / 100,
//   //   paymentDate: new Date(timestamp * 1000),
//   //   paymentMethod: mapPaymentMethod(payment_method),
//   //   gateway: 'razorpay',
//   //   rawData: req.body,
//   //   status: 'pending',
//   //   error: error.message
//   // });

//   //     return res.status(200).json({
//   //       status: 'pending',
//   //       message: 'Payment queued for manual reconciliation',
//   //       transaction_id
//   //     });
//   //   }
//   // }

//   if (event === 'payment.success') {
//     try {
//       // 1. Create payment record
//       const payment = await Payment.create({
//         organizationId: invoice.organizationId._id,
//         branchId: invoice.branchId,
//         type: 'inflow',
//         amount: amount / 100,
//         customerId: invoice.customerId,
//         invoiceId: invoice._id,
//         paymentMethod: mapPaymentMethod(payment_method),
//         transactionId: transaction_id,
//         paymentDate: new Date(timestamp * 1000),
//         referenceNumber: transaction_id,
//         status: 'completed',
//         transactionMode: 'auto',
//         createdBy: null
//       });

//       // 2. Auto-allocate payment
//       await paymentAllocationService.autoAllocatePayment(
//         payment._id,
//         invoice.organizationId._id
//       );

//       return res.status(200).json({
//         status: 'success',
//         message: 'Payment recorded and allocated',
//         data: { paymentId: payment._id }
//       });

//     } catch (error) {
//       // Store for manual reconciliation
//       await PendingReconciliation.create({
//         organizationId: invoice.organizationId._id,
//         invoiceId: invoice._id,
//         customerId: invoice.customerId,
//         externalTransactionId: transaction_id,
//         amount: amount / 100,
//         paymentDate: new Date(timestamp * 1000),
//         paymentMethod: mapPaymentMethod(payment_method),
//         gateway: 'razorpay',
//         rawData: req.body,
//         status: 'pending',
//         error: error.message
//       });

//       return res.status(200).json({
//         status: 'pending',
//         message: 'Payment queued for manual reconciliation',
//         transaction_id
//       });
//     }
//   }
//   res.status(200).json({ status: 'acknowledged' });
// });

function mapPaymentMethod(gatewayMethod) {
  const mapping = {
    'card': 'credit',
    'netbanking': 'bank',
    'upi': 'upi',
    'wallet': 'other',
    'cash': 'cash'
  };
  return mapping[gatewayMethod] || 'other';
}


/* ======================================================
   GET CUSTOMER PAYMENT SUMMARY
====================================================== */
exports.getCustomerPaymentSummary = catchAsync(async (req, res) => {
  const { customerId } = req.params;

  const summary = await paymentAllocationService.getCustomerPaymentSummary(
    customerId,
    req.user.organizationId
  );

  res.status(200).json({
    status: 'success',
    data: summary
  });
});

/* ======================================================
   AUTO-ALLOCATE PAYMENT
====================================================== */
exports.autoAllocatePayment = catchAsync(async (req, res) => {
  const { paymentId } = req.params;

  const result = await paymentAllocationService.autoAllocatePayment(
    paymentId,
    req.user.organizationId
  );

  res.status(200).json({
    status: 'success',
    message: 'Payment allocated successfully',
    data: result
  });
});

/* ======================================================
   MANUAL ALLOCATE PAYMENT
====================================================== */
exports.manualAllocatePayment = catchAsync(async (req, res) => {
  const { paymentId } = req.params;
  const { allocations } = req.body;

  const result = await paymentAllocationService.manualAllocatePayment(
    paymentId,
    allocations,
    req.user.organizationId,
    req.user._id
  );

  res.status(200).json({
    status: 'success',
    message: 'Payment manually allocated',
    data: result
  });
});

/* ======================================================
   GET UNALLOCATED PAYMENTS
====================================================== */
exports.getUnallocatedPayments = catchAsync(async (req, res) => {
  const { customerId } = req.params;

  const payments = await paymentAllocationService.getUnallocatedPayments(
    customerId,
    req.user.organizationId
  );

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments }
  });
});

/* ======================================================
   GET ALLOCATION REPORT
====================================================== */
exports.getAllocationReport = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const report = await paymentAllocationService.getAllocationReport(
    req.user.organizationId,
    new Date(startDate),
    new Date(endDate)
  );

  res.status(200).json({
    status: 'success',
    data: report
  });
});