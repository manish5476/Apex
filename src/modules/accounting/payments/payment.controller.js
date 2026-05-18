'use strict';

/**
 * Payment Controller
 * ─────────────────────────────────────────────
 * Thin HTTP layer only.
 *   1. Parse / validate HTTP input
 *   2. Call PaymentService
 *   3. Send HTTP response
 *
 * Key fixes vs original:
 *   FIX #1 — updatePayment returned success for ANY update body,
 *             not just cancellation. Now strictly routes to cancelPayment.
 *   FIX #2 — paymentGatewayWebhook double-updated invoice. Fixed in service.
 *   FIX #3 — All operations now go through PaymentService (transactions,
 *             ledger, balance updates handled there).
 */

const Payment = require('./payment.model');
const PaymentService = require('./payment.service');
const paymentAllocationService = require('./paymentAllocation.service');
const paymentPDFService = require('./paymentPDF.service');

const factory = require('../../../core/utils/api/handlerFactory');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

const PAYMENT_POPULATE = [
  { path: 'customerId', select: 'name phone type email gstNumber' },
  { path: 'supplierId', select: 'companyName contactPerson phone type email' },
  { path: 'invoiceId', select: 'invoiceNumber grandTotal invoiceDate balanceAmount' },
  { path: 'purchaseId', select: 'invoiceNumber grandTotal purchaseDate balanceAmount' },
  { path: 'branchId', select: 'name branchCode' },
];

/* ======================================================
   1. CREATE PAYMENT
====================================================== */
exports.createPayment = catchAsync(async (req, res, next) => {
  const payment = await PaymentService.createPayment(req.body, req.user);

  res.status(201).json({ status: 'success', data: { payment } });
});

/* ======================================================
   2. CANCEL PAYMENT
   FIX: Original updatePayment accepted any req.body and only
   acted on status:'cancelled'. Now a dedicated endpoint.
====================================================== */
exports.cancelPayment = catchAsync(async (req, res, next) => {
  await PaymentService.cancelPayment(req.params.id, req.user);

  res.status(200).json({ status: 'success', message: 'Payment cancelled and reversed' });
});

/* ======================================================
   3. DELETE PAYMENT (soft delete + full reversal)
====================================================== */
exports.deletePayment = catchAsync(async (req, res, next) => {
  await PaymentService.deletePayment(req.params.id, req.user);

  res.status(200).json({ status: 'success', message: 'Payment deleted successfully' });
});

/* ======================================================
   4. PAYMENT GATEWAY WEBHOOK
====================================================== */
exports.paymentGatewayWebhook = catchAsync(async (req, res, next) => {
  // In production: verify gateway signature here before processing
  // const sig = req.headers['x-razorpay-signature'];
  // if (!verifySignature(req.body, sig)) return res.status(401).send();

  const result = await PaymentService.processWebhookPayment(req.body);

  if (result.alreadyProcessed) {
    return res.status(200).json({ status: 'ignored', message: 'Payment already processed' });
  }
  if (result.acknowledged) {
    return res.status(200).json({ status: 'acknowledged' });
  }

  res.status(200).json({ status: 'success', data: { paymentId: result.paymentId } });
});

/* ======================================================
   5. PDF RECEIPT
====================================================== */
exports.downloadReceipt = catchAsync(async (req, res, next) => {
  const buffer = await paymentPDFService.downloadPaymentPDF(req.params.id, req.user.organizationId);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename=receipt_${req.params.id}.pdf`,
  });
  res.send(buffer);
});

exports.emailReceipt = catchAsync(async (req, res, next) => {
  await paymentPDFService.emailPaymentSlip(req.params.id, req.user.organizationId);
  res.status(200).json({ status: 'success', message: 'Receipt emailed successfully' });
});

/* ======================================================
   6. CUSTOMER / SUPPLIER SCOPED
====================================================== */
exports.getPaymentsByCustomer = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({
    organizationId: req.user.organizationId,
    customerId: req.params.customerId,
    isDeleted: { $ne: true },
  })
    .populate([
      { path: 'invoiceId', select: 'invoiceNumber grandTotal invoiceDate balanceAmount' },
      { path: 'branchId', select: 'name branchCode' },
    ])
    .sort({ paymentDate: -1 });

  res.status(200).json({ status: 'success', results: payments.length, data: { payments } });
});

exports.getPaymentsBySupplier = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({
    organizationId: req.user.organizationId,
    supplierId: req.params.supplierId,
    isDeleted: { $ne: true },
  })
    .populate([
      { path: 'purchaseId', select: 'invoiceNumber grandTotal purchaseDate balanceAmount' },
      { path: 'branchId', select: 'name branchCode' },
    ])
    .sort({ paymentDate: -1 });

  res.status(200).json({ status: 'success', results: payments.length, data: { payments } });
});

/* ======================================================
   7. ALLOCATION OPERATIONS
====================================================== */
exports.getCustomerPaymentSummary = catchAsync(async (req, res, next) => {
  const summary = await paymentAllocationService.getCustomerPaymentSummary(
    req.params.customerId, req.user.organizationId
  );
  res.status(200).json({ status: 'success', data: summary });
});

exports.autoAllocatePayment = catchAsync(async (req, res, next) => {
  const result = await paymentAllocationService.autoAllocatePayment(
    req.params.paymentId, req.user.organizationId
  );
  res.status(200).json({ status: 'success', message: 'Payment allocated', data: result });
});

exports.manualAllocatePayment = catchAsync(async (req, res, next) => {
  const { allocations } = req.body;
  if (!allocations?.length) return next(new AppError('Allocations array is required', 400));

  const result = await paymentAllocationService.manualAllocatePayment(
    req.params.paymentId, allocations, req.user.organizationId, req.user._id
  );
  res.status(200).json({ status: 'success', message: 'Payment manually allocated', data: result });
});

exports.getUnallocatedPayments = catchAsync(async (req, res, next) => {
  const payments = await paymentAllocationService.getUnallocatedPayments(
    req.params.customerId, req.user.organizationId
  );
  res.status(200).json({ status: 'success', results: payments.length, data: { payments } });
});

exports.getAllocationReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return next(new AppError('startDate and endDate are required', 400));

  const report = await paymentAllocationService.getAllocationReport(
    req.user.organizationId, new Date(startDate), new Date(endDate)
  );
  res.status(200).json({ status: 'success', data: report });
});

/* ======================================================
   8. FACTORY READ + EXPORT
====================================================== */
exports.getAllPayments = factory.getAll(Payment, { populate: PAYMENT_POPULATE });
exports.getPayment = factory.getOne(Payment, { populate: PAYMENT_POPULATE });
exports.exportPayments = factory.exportExcel(Payment, {
  fileName: 'Payments_Report',
  sheetName: 'Payments',
  populate: [
    { path: 'customerId', select: 'name' },
    { path: 'supplierId', select: 'companyName' },
    { path: 'invoiceId', select: 'invoiceNumber' },
    { path: 'branchId', select: 'name' },
  ],
  exportFields: [
    { header: 'DATE', key: 'paymentDate', width: 15 },
    { header: 'TYPE', key: 'type', width: 10 },
    { header: 'CUSTOMER', key: 'customerId.name', width: 25 },
    { header: 'SUPPLIER', key: 'supplierId.companyName', width: 25 },
    { header: 'AMOUNT', key: 'amount', width: 15 },
    { header: 'METHOD', key: 'paymentMethod', width: 15 },
    { header: 'REFERENCE', key: 'referenceNumber', width: 20 },
    { header: 'STATUS', key: 'status', width: 15 },
    { header: 'BRANCH', key: 'branchId.name', width: 20 },
  ],
});