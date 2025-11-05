const emiService = require('../services/emiService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/* -------------------------------------------------------------
 * Create EMI Plan
------------------------------------------------------------- */
exports.createEmiPlan = catchAsync(async (req, res, next) => {
  const {
    invoiceId,
    downPayment,
    numberOfInstallments,
    interestRate,
    emiStartDate,
  } = req.body;

  if (!invoiceId || !numberOfInstallments || !emiStartDate) {
    return next(new AppError('Missing required fields', 400));
  }

  const emi = await emiService.createEmiPlan({
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    invoiceId,
    createdBy: req.user._id,
    downPayment,
    numberOfInstallments,
    interestRate,
    emiStartDate,
  });

  res.status(201).json({
    status: 'success',
    message: 'EMI Plan created successfully',
    data: { emi },
  });
});

/* -------------------------------------------------------------
 * Get EMI by Invoice ID
------------------------------------------------------------- */
exports.getEmiByInvoice = catchAsync(async (req, res, next) => {
  const { invoiceId } = req.params;
  const emi = await emiService.getEmiByInvoice(invoiceId, req.user.organizationId);

  if (!emi) return next(new AppError('No EMI plan found for this invoice', 404));

  res.status(200).json({
    status: 'success',
    data: { emi },
  });
});

/* -------------------------------------------------------------
 * Mark an EMI installment as paid
------------------------------------------------------------- */
exports.payEmiInstallment = catchAsync(async (req, res, next) => {
  const { emiId, installmentNumber, amount, paymentId } = req.body;

  if (!emiId || !installmentNumber || !amount) {
    return next(new AppError('emiId, installmentNumber, and amount are required', 400));
  }

  const emi = await emiService.payEmiInstallment({
    emiId,
    installmentNumber,
    amount,
    paymentId,
  });

  res.status(200).json({
    status: 'success',
    message: 'EMI installment updated successfully',
    data: { emi },
  });
});
