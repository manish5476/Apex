const emiService = require('../services/emiService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const EMI = require('../models/emiModel');

/* -------------------------------------------------------------
   Create EMI Plan
   -------------------------------------------------------------
   AUDIT: Validates that an invoice exists and isn't already 
   converted to EMI before proceeding.
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
    return next(new AppError('Missing required fields: invoiceId, numberOfInstallments, emiStartDate', 400));
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

/* -------------------------------------------------------------
   Get All EMIs
------------------------------------------------------------- */
const popOptions = [
  { 
    path: 'customerId', 
    select: 'name email phone avatar'
  },
  {
    path: 'invoiceId',
    select: 'invoiceNumber grandTotal balanceAmount'
  }
];
exports.getAllEmis = factory.getAll(EMI, popOptions);

/* -------------------------------------------------------------
   Get EMI by Invoice ID
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
   Get EMI by ID
------------------------------------------------------------- */
exports.getEmiById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const emi = await emiService.getEmiById(id, req.user.organizationId);

  if (!emi) return next(new AppError('EMI plan not found', 404));

  res.status(200).json({
    status: 'success',
    data: { emi },
  });
});

/* -------------------------------------------------------------
   Pay EMI Installment (The Critical Fix)
   -------------------------------------------------------------
   This now correctly triggers accounting entries via Service.
------------------------------------------------------------- */
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
    return next(new AppError('Required: emiId, installmentNumber, amount, paymentMethod', 400));
  }

  const result = await emiService.payEmiInstallment({
    emiId,
    installmentNumber,
    amount: Number(amount),
    paymentMethod,
    referenceNumber,
    remarks,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId, // Pass branch for accounting
    createdBy: req.user._id
  });

  res.status(200).json({
    status: 'success',
    message: 'Payment recorded, Ledger updated, and EMI installment marked paid.',
    data: result,
  });
});

/* -------------------------------------------------------------
   Delete EMI (Restricted)
------------------------------------------------------------- */
exports.deleteEmi = catchAsync(async (req, res, next) => {
  // Audit: Only allow delete if no payments have been made? 
  // For now, we allow soft delete if implemented, otherwise hard delete.
  const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  
  if (!emi) return next(new AppError("EMI not found", 404));

  // Safety: Don't delete active EMI with payments
  const hasPayments = emi.installments.some(i => i.paidAmount > 0);
  if (hasPayments) {
      return next(new AppError("Cannot delete EMI plan with processed payments. Please cancel instead.", 400));
  }

  await EMI.deleteOne({ _id: req.params.id });
  
  res.status(200).json({ status: "success", message: "EMI deleted" });
});

/* -------------------------------------------------------------
   History
------------------------------------------------------------- */
exports.getEmiHistory = catchAsync(async (req, res, next) => {
  const emi = await EMI.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!emi) return next(new AppError("EMI not found", 404));

  // Filter only paid/partial installments
  const history = emi.installments.filter(i => i.paidAmount > 0);

  res.status(200).json({ 
    status: "success", 
    results: history.length, 
    data: { history } 
  });
});





// const emiService = require('../services/emiService');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');
// const factory = require('../utils/handlerFactory');
// const EMI = require('../models/emiModel');

// /* -------------------------------------------------------------
//  * Create EMI Plan
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
//     return next(new AppError('Missing required fields', 400));
//   }

//   const emi = await emiService.createEmiPlan({
//     organizationId: req.user.organizationId,
//     branchId: req.user.branchId,
//     invoiceId,
//     createdBy: req.user._id,
//     downPayment,
//     numberOfInstallments,
//     interestRate,
//     emiStartDate,
//   });

//   res.status(201).json({
//     status: 'success',
//     message: 'EMI Plan created successfully',
//     data: { emi },
//   });
// });

// /* -------------------------------------------------------------
//  * Get All EMIs (with filters & pagination)
//  * Used for the EMI List View
// ------------------------------------------------------------- */
// const popOptions = [
//   { 
//     path: 'customerId', 
//     select: 'name email phone avatar'
//   },
// ];
// exports.getAllEmis = factory.getAll(EMI,popOptions);

// // exports.getAllEmis = catchAsync(async (req, res, next) => {
// //   const { page = 1, limit = 10, customerId, status, invoiceId, search } = req.query;
// //   const filter = { organizationId: req.user.organizationId };

// //   if (customerId) filter.customerId = customerId;
// //   if (status) filter.status = status;
// //   if (invoiceId) filter.invoiceId = invoiceId;
// //   if (search) filter.search = search;
// //   const options = {
// //     page: parseInt(page, 10),
// //     limit: parseInt(limit, 10),
// //     sortBy: 'createdAt:desc' // Show newest first
// //   };
// //   const result = await emiService.queryEmis(filter, options);
// //   res.status(200).json({
// //     status: 'success',
// //     results: result.totalResults,
// //     totalPages: result.totalPages,
// //     currentPage: result.page,
// //     data: result.results // The array of EMIs
// //   });
// // });

// /* -------------------------------------------------------------
//  * Get EMI by Invoice ID
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
//  * Get EMI by ID (Specific EMI Details)
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
//  * Mark an EMI installment as paid
// ------------------------------------------------------------- */
// exports.payEmiInstallment = catchAsync(async (req, res, next) => {
//   const {
//     emiId,
//     installmentNumber,
//     amount,
//     paymentMethod, // e.g. "cash"
//     referenceNumber, // e.g. "TXN-1234"
//     remarks
//   } = req.body;

//   if (!emiId || !installmentNumber || !amount || !paymentMethod) {
//     return next(new AppError('emiId, installmentNumber, amount, and paymentMethod are required', 400));
//   }

//   const result = await emiService.payEmiInstallment({
//     emiId,
//     installmentNumber,
//     amount,
//     paymentMethod,
//     referenceNumber,
//     remarks,
//     organizationId: req.user.organizationId,
//     createdBy: req.user._id
//   });

//   res.status(200).json({
//     status: 'success',
//     message: 'Payment recorded and EMI updated successfully',
//     data: result,
//   });
// });

// // DELETE /v1/emi/:id
// exports.deleteEmi = catchAsync(async (req, res, next) => {
//   const emi = await Emi.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!emi) return next(new AppError("EMI not found", 404));
//   res.status(200).json({ status: "success", message: "EMI deleted" });
// });

// // GET /v1/emi/:id/history
// exports.getEmiHistory = catchAsync(async (req, res, next) => {
//   const emi = await Emi.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!emi) return next(new AppError("EMI not found", 404));
//   // Assuming emi.payments is an array
//   res.status(200).json({ status: "success", results: emi.payments?.length || 0, data: { payments: emi.payments || [] } });
// });
