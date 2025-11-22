// src/controllers/invoicePDFController.js
const invoicePDFService = require("../services/invoicePDFService");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

exports.downloadInvoicePDF = catchAsync(async (req, res, next) => {
  // FIXED: Calling 'downloadInvoicePDF' to match your Service file
  const buffer = await invoicePDFService.downloadInvoicePDF(
    req.params.id,
    req.user.organizationId,
  );

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf`,
    "Content-Length": buffer.length,
  });

  res.send(buffer);
});

exports.emailInvoice = catchAsync(async (req, res, next) => {
  // FIXED: Calling 'emailInvoice' to match your Service file
  await invoicePDFService.emailInvoice(
    req.params.id,
    req.user.organizationId,
  );
  res.status(200).json({
    status: "success",
    message: "Invoice emailed successfully.",
  });
});

// // src/controllers/invoicePDFController.js
// const invoicePDFService = require("../services/invoicePDFService");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");

// exports.downloadInvoicePDF = catchAsync(async (req, res, next) => {
//   const buffer = await invoicePDFService.generateInvoicePDF(
//     req.params.id,
//     req.user.organizationId,
//   );

//   res.set({
//     "Content-Type": "application/pdf",
//     "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf`,
//     "Content-Length": buffer.length,
//   });

//   res.send(buffer);
// });

// exports.emailInvoice = catchAsync(async (req, res, next) => {
//   await invoicePDFService.sendInvoiceEmail(
//     req.params.id,
//     req.user.organizationId,
//   );
//   res.status(200).json({
//     status: "success",
//     message: "Invoice emailed successfully.",
//   });
// });
