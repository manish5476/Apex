const mongoose = require('mongoose');
const Payment = require('../models/paymentModel');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Customer = require('../models/customerModel');
const Supplier = require('../models/supplierModel');
  const Ledger = require('../models/ledgerModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const emiService = require('../services/emiService'); // top of file
const paymentPDFService = require("../services/paymentPDFService");

/* ==========================================================
   Utility: Apply or Reverse Balances
   ----------------------------------------------------------
   Used internally by createPayment() and updatePayment()
========================================================== */
async function applyPaymentEffects(payment, session, direction = 'apply') {
  const { type, amount, organizationId, branchId, customerId, supplierId, invoiceId, purchaseId, _id } = payment;
  const multiplier = direction === 'apply' ? 1 : -1; // reverse if needed

  // --------------- INFLOW (Customer Payment) ---------------
  if (type === 'inflow') {
    if (invoiceId) {
      const invoice = await Invoice.findOne({ _id: invoiceId, organizationId }).session(session);
      if (!invoice) throw new AppError('Invoice not found', 404);

      invoice.paidAmount = (invoice.paidAmount || 0) + amount * multiplier;
      invoice.balanceAmount = invoice.grandTotal - invoice.paidAmount;
      if (invoice.balanceAmount <= 0) invoice.paymentStatus = 'paid';
      else if (invoice.paidAmount > 0) invoice.paymentStatus = 'partial';
      else invoice.paymentStatus = 'unpaid';
      await invoice.save({ session });
    }

    // Update customer balance
    await Customer.findOneAndUpdate(
      { _id: customerId, organizationId },
      { $inc: { outstandingBalance: -amount * multiplier } },
      { session }
    );

    // Create or reverse ledger
    await Ledger.create(
      [
        {
          organizationId,
          branchId,
          customerId,
          paymentId: _id,
          type: direction === 'apply' ? 'credit' : 'debit',
          amount,
          description:
            direction === 'apply'
              ? `Payment received${invoiceId ? ' for Invoice ' + invoiceId : ''}`
              : `Payment reversal${invoiceId ? ' for Invoice ' + invoiceId : ''}`,
          accountType: 'customer',
          createdBy: payment.createdBy,
        },
      ],
      { session }
    );
  }

  // --------------- OUTFLOW (Supplier Payment) ---------------
  if (type === 'outflow') {
    if (purchaseId) {
      const purchase = await Purchase.findOne({ _id: purchaseId, organizationId }).session(session);
      if (!purchase) throw new AppError('Purchase not found', 404);

      purchase.paidAmount = (purchase.paidAmount || 0) + amount * multiplier;
      purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;
      if (purchase.balanceAmount <= 0) purchase.paymentStatus = 'paid';
      else if (purchase.paidAmount > 0) purchase.paymentStatus = 'partial';
      else purchase.paymentStatus = 'unpaid';
      await purchase.save({ session });
    }

    await Supplier.findOneAndUpdate(
      { _id: supplierId, organizationId },
      { $inc: { outstandingBalance: -amount * multiplier } },
      { session }
    );

    await Ledger.create(
      [
        {
          organizationId,
          branchId,
          supplierId,
          paymentId: _id,
          type: direction === 'apply' ? 'debit' : 'credit',
          amount,
          description:
            direction === 'apply'
              ? `Payment made to supplier${purchaseId ? ' for Purchase ' + purchaseId : ''}`
              : `Payment reversal${purchaseId ? ' for Purchase ' + purchaseId : ''}`,
          accountType: 'supplier',
          createdBy: payment.createdBy,
        },
      ],
      { session }
    );
  }
}

/* ==========================================================
   Create Payment (with idempotency + effects)
========================================================== */
exports.createPayment = catchAsync(async (req, res, next) => {
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
    transactionId,
    bankName,
    remarks,
    status,
  } = req.body;

  if (!type || !['inflow', 'outflow'].includes(type)) {
    return next(new AppError('Payment type must be inflow or outflow', 400));
  }
  if (!amount || amount <= 0) {
    return next(new AppError('Amount must be positive', 400));
  }

  // --- IDEMPOTENCY CHECK ---
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

  // After session.commitTransaction(), before sending response
if (type === 'inflow' && invoiceId && customerId) {
  try {
    const emiUpdated = await emiService.applyPaymentToEmi({
      customerId,
      invoiceId,
      amount,
      paymentId: payment._id,
      organizationId: req.user.organizationId,
    });

    if (emiUpdated) {
      console.log(`EMI updated automatically for invoice ${invoiceId}`);
    }
  } catch (err) {
    console.error('Error applying payment to EMI:', err.message);
  }
}


  try {
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
          paymentDate: paymentDate || Date.now(),
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

    if (payment.status === 'completed') {
      await applyPaymentEffects(payment, session, 'apply');
    }

    await session.commitTransaction();

    res.status(201).json({
      status: 'success',
      message: 'Payment recorded successfully',
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
   Update Payment (status transition + reversal logic)
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

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // --- Update basic fields ---
    Object.assign(payment, req.body);
    await payment.save({ session });

    // --- Handle status transitions ---
    if (prevStatus !== newStatus) {
      if (prevStatus !== 'completed' && newStatus === 'completed') {
        // Apply effects
        await applyPaymentEffects(payment, session, 'apply');
      } else if (prevStatus === 'completed' && newStatus === 'failed') {
        // Reverse effects
        await applyPaymentEffects(payment, session, 'reverse');
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
   Simple CRUD (Factory)
========================================================== */
exports.getAllPayments = factory.getAll(Payment);
exports.getPayment = factory.getOne(Payment,['customerId','organizationId','branchId']);
exports.deletePayment = factory.deleteOne(Payment);

/* ==========================================================
   Convenience Queries
========================================================== */
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