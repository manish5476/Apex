'use strict';


const EMI = require('./emi.model');
const EmiService = require('./emi.service');
const factory = require('../../../core/utils/api/handlerFactory');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const EMI_POPULATE = [
  { path: 'customerId', select: 'name email phone avatar billingAddress outstandingBalance' },
  { path: 'invoiceId', select: 'invoiceNumber grandTotal balanceAmount' },
];
/* ======================================================
   1. CREATE EMI PLAN
====================================================== */
exports.createEmiPlan = catchAsync(async (req, res, next) => {
  const { invoiceId, downPayment, numberOfInstallments, interestRate, emiStartDate } = req.body;

  if (!invoiceId || !numberOfInstallments || !emiStartDate) {
    return next(new AppError('invoiceId, numberOfInstallments and emiStartDate are required', 400));
  }

  const emi = await EmiService.createEmiPlan({
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    invoiceId,
    createdBy: req.user._id,
    downPayment: Number(downPayment) || 0,
    numberOfInstallments: Number(numberOfInstallments),
    interestRate: Number(interestRate) || 0,
    emiStartDate,
  });

  res.status(201).json({ status: 'success', message: 'EMI Plan created successfully', data: { emi } });
});

/* ======================================================
   2. GET ALL EMIs
====================================================== */
exports.getAllEmis = factory.getAll(EMI, { populate: EMI_POPULATE });

/* ======================================================
   3. GET EMI BY INVOICE ID
====================================================== */
exports.getEmiByInvoice = catchAsync(async (req, res, next) => {
  const emi = await EmiService.getEmiByInvoice(req.params.invoiceId, req.user.organizationId);
  if (!emi) return next(new AppError('No EMI plan found for this invoice', 404));
  res.status(200).json({ status: 'success', data: { emi } });
});

/* ======================================================
   4. GET EMI BY ID
====================================================== */
exports.getEmiById = catchAsync(async (req, res, next) => {
  const emi = await EmiService.getEmiById(req.params.id, req.user.organizationId);
  if (!emi) return next(new AppError('EMI plan not found', 404));
  res.status(200).json({ status: 'success', data: { emi } });
});

/* ======================================================
   5. PAY EMI INSTALLMENT
====================================================== */
exports.payEmiInstallment = catchAsync(async (req, res, next) => {
  const { emiId, installmentNumber, amount, paymentMethod, referenceNumber, remarks } = req.body;

  if (!emiId || !installmentNumber || !amount || !paymentMethod) {
    return next(new AppError('emiId, installmentNumber, amount and paymentMethod are required', 400));
  }

  const result = await EmiService.payEmiInstallment({
    emiId,
    installmentNumber,
    amount: Number(amount),
    paymentMethod,
    referenceNumber,
    remarks,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    createdBy: req.user._id,
  });

  res.status(200).json({
    status: 'success',
    message: 'Payment recorded. Ledger updated and installment marked paid.',
    data: result,
  });
});

/* ======================================================
   6. DELETE EMI (safe — only if no payments made)
====================================================== */
exports.deleteEmi = catchAsync(async (req, res, next) => {
  const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!emi) return next(new AppError('EMI not found', 404));

  const hasPayments = emi.installments.some(i => i.paidAmount > 0);
  if (hasPayments) {
    return next(new AppError('Cannot delete EMI with processed payments. Cancel instead.', 400));
  }

  await EMI.deleteOne({ _id: req.params.id });
  res.status(200).json({ status: 'success', message: 'EMI deleted' });
});

/* ======================================================
   7. EMI INSTALLMENT HISTORY
====================================================== */
exports.getEmiHistory = catchAsync(async (req, res, next) => {
  const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!emi) return next(new AppError('EMI not found', 404));

  const history = emi.installments.filter(i => i.paidAmount > 0);
  res.status(200).json({ status: 'success', results: history.length, data: { history } });
});

/* ======================================================
   8. EMI ANALYTICS
====================================================== */
// exports.getEmiAnalytics = catchAsync(async (req, res, next) => {
//   const analytics = await EmiService.getEmiAnalytics(req.user.organizationId);
//   res.status(200).json({ status: 'success', data: analytics });
// });
exports.getEmiAnalytics = catchAsync(async (req, res, next) => {
  // 1. Extract dates from the query
  const { startDate, endDate } = req.query;

  // 2. Pass them to the service
  const analytics = await EmiService.getEmiAnalytics(req.user.organizationId, { startDate, endDate });

  res.status(200).json({ status: 'success', data: analytics });
});
/* ======================================================
   9. EMI LEDGER REPORT
====================================================== */
exports.getEmiLedgerReport = catchAsync(async (req, res, next) => {
  const { fromDate, toDate } = req.query;
  const report = await EmiService.getEmiLedgerReconciliation({
    organizationId: req.user.organizationId,
    fromDate,
    toDate,
  });
  res.status(200).json({ status: 'success', results: report.length, data: report });
});

/* ======================================================
   10. MARK OVERDUE INSTALLMENTS (admin / cron)
====================================================== */
exports.markOverdueInstallments = catchAsync(async (req, res, next) => {
  const result = await EmiService.markOverdueInstallments();
  res.status(200).json({
    status: 'success',
    message: 'Overdue installments updated',
    data: result,
  });
});

/* ======================================================
   11. APPLY ADVANCE BALANCE TO INSTALLMENT
====================================================== */
exports.applyAdvanceBalance = catchAsync(async (req, res, next) => {
  const { emiId, installmentNumber } = req.body;
  if (!emiId || !installmentNumber) {
    return next(new AppError('emiId and installmentNumber are required', 400));
  }
  const result = await EmiService.applyAdvanceBalance(emiId, Number(installmentNumber));
  res.status(200).json({ status: 'success', data: result });
});