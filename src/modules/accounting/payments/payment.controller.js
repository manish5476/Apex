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


exports.paymentGatewayWebhook = catchAsync(async (req, res, next) => {
  const {
    event, // 'payment.success', 'payment.failed', etc.
    transaction_id,
    invoice_id, // Your invoice number
    amount,
    currency,
    payment_method,
    timestamp,
    customer_email,
    metadata
  } = req.body;

  // Find organization by invoice number
  const invoice = await Invoice.findOne({
    invoiceNumber: invoice_id
  }).populate('organizationId');

  if (!invoice) {
    return res.status(404).json({
      status: 'error',
      message: 'Invoice not found'
    });
  }

  // if (event === 'payment.success') {
  //   try {
  //     const result = await emiService.autoReconcilePayment({
  //       organizationId: invoice.organizationId._id,
  //       branchId: invoice.branchId,
  //       invoiceId: invoice._id,
  //       amount: amount / 100, // Convert from paise to rupees
  //       paymentDate: new Date(timestamp * 1000),
  //       paymentMethod: mapPaymentMethod(payment_method),
  //       transactionId: transaction_id,
  //       gateway: 'razorpay', // or 'stripe', 'paypal', etc.
  //       createdBy: null // System user
  //     });

  //     return res.status(200).json({
  //       status: 'success',
  //       message: 'Payment reconciled successfully',
  //       data: result
  //     });

  //   } catch (error) {
  //     // Store for manual reconciliation
  // await PendingReconciliation.create({
  //   organizationId: invoice.organizationId._id,
  //   invoiceId: invoice._id,
  //   customerId: invoice.customerId,
  //   externalTransactionId: transaction_id,
  //   amount: amount / 100,
  //   paymentDate: new Date(timestamp * 1000),
  //   paymentMethod: mapPaymentMethod(payment_method),
  //   gateway: 'razorpay',
  //   rawData: req.body,
  //   status: 'pending',
  //   error: error.message
  // });

  //     return res.status(200).json({
  //       status: 'pending',
  //       message: 'Payment queued for manual reconciliation',
  //       transaction_id
  //     });
  //   }
  // }

  if (event === 'payment.success') {
    try {
      // 1. Create payment record
      const payment = await Payment.create({
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
      });

      // 2. Auto-allocate payment
      await paymentAllocationService.autoAllocatePayment(
        payment._id,
        invoice.organizationId._id
      );

      return res.status(200).json({
        status: 'success',
        message: 'Payment recorded and allocated',
        data: { paymentId: payment._id }
      });

    } catch (error) {
      // Store for manual reconciliation
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

      return res.status(200).json({
        status: 'pending',
        message: 'Payment queued for manual reconciliation',
        transaction_id
      });
    }
  }
  res.status(200).json({ status: 'acknowledged' });
});

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