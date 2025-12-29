const emiService = require('../services/emiService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const EMI = require('../models/emiModel');

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

// ✅ Refactoring Highlights

// All routes wrapped with catchAsync to handle errors.

// payEmiInstallment fully integrated with service and ledger.

// getAllEmis now correctly uses populate.

// Delete safety checks prevent accidental deletion of EMIs with payments.

// Analytics and ledger endpoints fully aligned with the refactored service.

// Consistent responses and HTTP status codes for all endpoints.

// const emiService = require('../services/emiService');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const EMI = require('../models/emiModel');

// /* -------------------------------------------------------------
//    Create EMI Plan
//    -------------------------------------------------------------
//    AUDIT: Validates that an invoice exists and isn't already 
//    converted to EMI before proceeding.
// ------------------------------------------------------------- */
// exports.createEmiPlan = catchAsync(async (req, res, next) => {
//   const {
//     invoiceId,
//     downPayment,
//     numberOfInstallments,
//     interestRate,
//     emiStartDate,
//   } = req.body;

//   if (!invoiceId || !numberOfInstallments || !emiStartDate) {
//     return next(new AppError('Missing required fields: invoiceId, numberOfInstallments, emiStartDate', 400));
//   }

//   const emi = await emiService.createEmiPlan({
//     organizationId: req.user.organizationId,
//     branchId: req.user.branchId,
//     invoiceId,
//     createdBy: req.user._id,
//     downPayment: Number(downPayment) || 0,
//     numberOfInstallments: Number(numberOfInstallments),
//     interestRate: Number(interestRate) || 0,
//     emiStartDate,
//   });

//   res.status(201).json({
//     status: 'success',
//     message: 'EMI Plan created successfully',
//     data: { emi },
//   });
// });

// /* -------------------------------------------------------------
//    Get All EMIs
// ------------------------------------------------------------- */
// // const popOptions = [
// //   { 
// //     path: 'customerId', 
// //     select: 'name email phone avatar'
// //   },
// //   {
// //     path: 'invoiceId',
// //     select: 'invoiceNumber grandTotal balanceAmount'
// //   }
// // ];
// // const popOptions = [
// //   { 
// //     path: 'customerId', 
// //     // Updated to include address, tax info, and balance based on your new Schema
// //     select: 'name email phone avatar billingAddress gstNumber panNumber type outstandingBalance'
// //   },
// //   {
// //     path: 'invoiceId',
// //     select: 'invoiceNumber grandTotal balanceAmount'
// //   }
// // ];
// // exports.getAllEmis = factory.getAll(EMI, popOptions);
// const popOptions = [
//   { 
//     path: 'customerId', 
//     select: 'name email phone avatar billingAddress gstNumber panNumber type outstandingBalance'
//   },
//   {
//     path: 'invoiceId',
//     select: 'invoiceNumber grandTotal balanceAmount'
//   }
// ];

// // WRONG WAY (What caused the issue):
// // exports.getAllEmis = factory.getAll(EMI, popOptions);

// // CORRECT WAY (Wrap it in an object):
// exports.getAllEmis = factory.getAll(EMI, { populate: popOptions });
// /* -------------------------------------------------------------
//    Get EMI by Invoice ID
// ------------------------------------------------------------- */
// exports.getEmiByInvoice = catchAsync(async (req, res, next) => {
//   const { invoiceId } = req.params;
//   const emi = await emiService.getEmiByInvoice(invoiceId, req.user.organizationId);

//   if (!emi) return next(new AppError('No EMI plan found for this invoice', 404));

//   res.status(200).json({
//     status: 'success',
//     data: { emi },
//   });
// });

// /* -------------------------------------------------------------
//    Get EMI by ID
// ------------------------------------------------------------- */
// exports.getEmiById = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const emi = await emiService.getEmiById(id, req.user.organizationId);

//   if (!emi) return next(new AppError('EMI plan not found', 404));

//   res.status(200).json({
//     status: 'success',
//     data: { emi },
//   });
// });

// /* -------------------------------------------------------------
//    Pay EMI Installment (The Critical Fix)
//    -------------------------------------------------------------
//    This now correctly triggers accounting entries via Service.
// ------------------------------------------------------------- */
// exports.payEmiInstallment = catchAsync(async (req, res, next) => {
//   const {
//     emiId,
//     installmentNumber,
//     amount,
//     paymentMethod,
//     referenceNumber,
//     remarks
//   } = req.body;

//   if (!emiId || !installmentNumber || !amount || !paymentMethod) {
//     return next(new AppError('Required: emiId, installmentNumber, amount, paymentMethod', 400));
//   }

//   const result = await emiService.payEmiInstallment({
//     emiId,
//     installmentNumber,
//     amount: Number(amount),
//     paymentMethod,
//     referenceNumber,
//     remarks,
//     organizationId: req.user.organizationId,
//     branchId: req.user.branchId, // Pass branch for accounting
//     createdBy: req.user._id
//   });

//   res.status(200).json({
//     status: 'success',
//     message: 'Payment recorded, Ledger updated, and EMI installment marked paid.',
//     data: result,
//   });
// });

// /* -------------------------------------------------------------
//    Delete EMI (Restricted)
// ------------------------------------------------------------- */
// exports.deleteEmi = catchAsync(async (req, res, next) => {
//   // Audit: Only allow delete if no payments have been made? 
//   // For now, we allow soft delete if implemented, otherwise hard delete.
//   const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  
//   if (!emi) return next(new AppError("EMI not found", 404));

//   // Safety: Don't delete active EMI with payments
//   const hasPayments = emi.installments.some(i => i.paidAmount > 0);
//   if (hasPayments) {
//       return next(new AppError("Cannot delete EMI plan with processed payments. Please cancel instead.", 400));
//   }

//   await EMI.deleteOne({ _id: req.params.id });
  
//   res.status(200).json({ status: "success", message: "EMI deleted" });
// });

// /* -------------------------------------------------------------
//    History
// ------------------------------------------------------------- */
// exports.getEmiHistory = catchAsync(async (req, res, next) => {
//   const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!emi) return next(new AppError("EMI not found", 404));

//   // Filter only paid/partial installments
//   const history = emi.installments.filter(i => i.paidAmount > 0);

//   res.status(200).json({ 
//     status: "success", 
//     results: history.length, 
//     data: { history } 
//   });
// });

// exports.getEmiAnalytics = catchAsync(async (req, res) => {
//   const analytics = await emiService.getEmiAnalytics(req.user.organizationId);

//   res.status(200).json({
//     status: 'success',
//     data: analytics
//   });
// });
// exports.getEmiLedgerReport = catchAsync(async (req, res) => {
//   const { fromDate, toDate } = req.query;

//   const report = await emiService.getEmiLedgerReconciliation({
//     organizationId: req.user.organizationId,
//     fromDate,
//     toDate
//   });

//   res.status(200).json({
//     status: 'success',
//     results: report.length,
//     data: report
//   });
// });

// exports.markOverdueInstallments = catchAsync(async (req, res) => {
//   const result = await emiService.markOverdueInstallments();

//   res.status(200).json({
//     status: 'success',
//     message: 'Overdue EMI installments updated successfully',
//     data: result
//   });
// });
