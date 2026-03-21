const emiService = require('./emiService');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');
const factory = require('../../../core/utils/api/handlerFactory');
const EMI = require('./emi.model');

/* ======================================================
   CREATE EMI PLAN
====================================================== */
exports.createEmiPlan = catchAsync(async (req, res, next) => {
  const {
    invoiceId,
    downPayment,
    numberOfInstallments,
    interestRate,
    emiStartDate,
  } = req.body;

  if (!invoiceId || !numberOfInstallments || !emiStartDate) {
    return next(new AppError(
      'Missing required fields: invoiceId, numberOfInstallments, emiStartDate',
      400
    ));
  }

  const emi = await emiService.createEmiPlan({
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    invoiceId,
    createdBy: req.user._id,
    downPayment: Number(downPayment) || 0,
    numberOfInstallments: Number(numberOfInstallments),
    interestRate: Number(interestRate) || 0,
    emiStartDate,
  });

  res.status(201).json({
    status: 'success',
    message: 'EMI Plan created successfully',
    data: { emi },
  });
});

/* ======================================================
   GET ALL EMIs
====================================================== */
const popOptions = [
  { 
    path: 'customerId', 
    select: 'name email phone avatar billingAddress gstNumber panNumber type outstandingBalance'
  },
  {
    path: 'invoiceId',
    select: 'invoiceNumber grandTotal balanceAmount'
  }
];

exports.getAllEmis = factory.getAll(EMI, { populate: popOptions });

/* ======================================================
   GET EMI BY INVOICE ID
====================================================== */
exports.getEmiByInvoice = catchAsync(async (req, res, next) => {
  const { invoiceId } = req.params;
  const emi = await emiService.getEmiByInvoice(invoiceId, req.user.organizationId);

  if (!emi) return next(new AppError('No EMI plan found for this invoice', 404));

  res.status(200).json({
    status: 'success',
    data: { emi },
  });
});

/* ======================================================
   GET EMI BY ID
====================================================== */
exports.getEmiById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const emi = await emiService.getEmiById(id, req.user.organizationId);

  if (!emi) return next(new AppError('EMI plan not found', 404));

  res.status(200).json({
    status: 'success',
    data: { emi },
  });
});

/* ======================================================
   PAY EMI INSTALLMENT
====================================================== */
exports.payEmiInstallment = catchAsync(async (req, res, next) => {
  const {
    emiId,
    installmentNumber,
    amount,
    paymentMethod,
    referenceNumber,
    remarks
  } = req.body;

  if (!emiId || !installmentNumber || !amount || !paymentMethod) {
    return next(new AppError(
      'Required: emiId, installmentNumber, amount, paymentMethod',
      400
    ));
  }

  const result = await emiService.payEmiInstallment({
    emiId,
    installmentNumber,
    amount: Number(amount),
    paymentMethod,
    referenceNumber,
    remarks,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    createdBy: req.user._id
  });

  res.status(200).json({
    status: 'success',
    message: 'Payment recorded, Ledger updated, and EMI installment marked paid.',
    data: result,
  });
});

/* ======================================================
   DELETE EMI (SAFE)
====================================================== */
exports.deleteEmi = catchAsync(async (req, res, next) => {
  const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!emi) return next(new AppError("EMI not found", 404));

  const hasPayments = emi.installments.some(i => i.paidAmount > 0);
  if (hasPayments) {
    return next(new AppError(
      "Cannot delete EMI plan with processed payments. Please cancel instead.",
      400
    ));
  }

  await EMI.deleteOne({ _id: req.params.id });
  res.status(200).json({ status: "success", message: "EMI deleted" });
});

/* ======================================================
   EMI INSTALLMENT HISTORY
====================================================== */
exports.getEmiHistory = catchAsync(async (req, res, next) => {
  const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!emi) return next(new AppError("EMI not found", 404));

  const history = emi.installments.filter(i => i.paidAmount > 0);
  res.status(200).json({ 
    status: "success", 
    results: history.length, 
    data: { history } 
  });
});

/* ======================================================
   EMI ANALYTICS
====================================================== */
exports.getEmiAnalytics = catchAsync(async (req, res) => {
  const analytics = await emiService.getEmiAnalytics(req.user.organizationId);
  res.status(200).json({ status: 'success', data: analytics });
});

/* ======================================================
   EMI LEDGER REPORT
====================================================== */
exports.getEmiLedgerReport = catchAsync(async (req, res) => {
  const { fromDate, toDate } = req.query;
  const report = await emiService.getEmiLedgerReconciliation({
    organizationId: req.user.organizationId,
    fromDate,
    toDate
  });

  res.status(200).json({
    status: 'success',
    results: report.length,
    data: report
  });
});

/* ======================================================
   MARK OVERDUE INSTALLMENTS
====================================================== */
exports.markOverdueInstallments = catchAsync(async (req, res) => {
  const result = await emiService.markOverdueInstallments();
  res.status(200).json({
    status: 'success',
    message: 'Overdue EMI installments updated successfully',
    data: result
  });
});
