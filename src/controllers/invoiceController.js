
// const Invoice = require("../models/invoiceModel");
// const Product = require("../models/productModel");
// const Customer = require("../models/customerModel");
// const Ledger = require('../models/ledgerModel');
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const mongoose = require("mongoose");
// const invoicePDFService = require("../services/invoicePDFService");
// const SalesService = require("../services/salesService");

// exports.createInvoice = catchAsync(async (req, res, next) => {
//   const {
//     customerId,
//     items,
//     invoiceNumber,
//     invoiceDate,
//     dueDate,
//     paidAmount,
//     paymentStatus,
//     notes,
//     status,
//     shippingCharges,
//   } = req.body;

//   if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
//     return next(new AppError("Invalid payload: customerId & items required.", 400));
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     /* -------------------------------------------------------------
//      * STEP 1 — Create Invoice
//     ------------------------------------------------------------- */
//     const invoiceArr = await Invoice.create(
//       [
//         {
//           organizationId: req.user.organizationId,
//           branchId: req.user.branchId,
//           customerId,
//           items,
//           invoiceNumber,
//           invoiceDate,
//           dueDate,
//           shippingCharges,
//           paidAmount,
//           paymentStatus,
//           notes,
//           status,
//           createdBy: req.user._id,
//         },
//       ],
//       { session }
//     );

//     const newInvoice = invoiceArr[0];

//     /* -------------------------------------------------------------
//      * STEP 2 — Reduce Stock
//     ------------------------------------------------------------- */
//     for (const item of items) {
//       const product = await Product.findById(item.productId).session(session);
//       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

//       const branchInventory = product.inventory.find(
//         (inv) => inv.branchId.toString() === req.user.branchId.toString()
//       );

//       if (!branchInventory || branchInventory.quantity < item.quantity) {
//         throw new AppError(`Insufficient stock for ${product.name}.`, 400);
//       }

//       branchInventory.quantity -= item.quantity;
//       await product.save({ session });
//     }

//     /* -------------------------------------------------------------
//      * STEP 3 — Update Customer Outstanding
//     ------------------------------------------------------------- */
//     const totalDue = newInvoice.grandTotal - (paidAmount || 0);

//     await Customer.findByIdAndUpdate(
//       customerId,
//       { $inc: { outstandingBalance: totalDue } },
//       { session }
//     );

//     /* -------------------------------------------------------------
//      * STEP 4 — Ledger Entry
//     ------------------------------------------------------------- */
//     await Ledger.create(
//       [
//         {
//           organizationId: req.user.organizationId,
//           branchId: req.user.branchId,
//           customerId,
//           invoiceId: newInvoice._id,
//           type: "debit",
//           amount: newInvoice.grandTotal,
//           description: `Invoice ${invoiceNumber || newInvoice._id} created`,
//           accountType: "customer",
//           createdBy: req.user._id,
//         },
//       ],
//       { session }
//     );

//     /* -------------------------------------------------------------
//      * STEP 5 — CREATE SALES (INSIDE THE SAME TRANSACTION)
//     ------------------------------------------------------------- */
//     const salesDoc = await SalesService.createFromInvoiceTransactional(
//       newInvoice,
//       session
//     );

//     /* -------------------------------------------------------------
//      * STEP 6 — Commit Transaction
//     ------------------------------------------------------------- */
//     await session.commitTransaction();

//     /* -------------------------------------------------------------
//      * STEP 7 — Journal Entries (AFTER COMMIT)
//     ------------------------------------------------------------- */
//     const orgId = req.user.organizationId;
//     const date = newInvoice.invoiceDate || newInvoice.createdAt || new Date();
//     const amt = Number(newInvoice.grandTotal || 0);

//     await postJournalEntries(
//       orgId,
//       date,
//       [
//         {
//           accountCode: "AR",
//           debit: amt,
//           description: `Invoice ${newInvoice.invoiceNumber}`,
//           referenceType: "invoice",
//           referenceId: newInvoice._id,
//         },
//         {
//           accountCode: "SALES",
//           credit: amt,
//           description: `Invoice ${newInvoice.invoiceNumber}`,
//           referenceType: "invoice",
//           referenceId: newInvoice._id,
//         },
//       ],
//       { updateBalances: true }
//     );

//     res.status(201).json({
//       status: "success",
//       message: "Invoice created successfully.",
//       data: {
//         invoice: newInvoice,
//         sales: salesDoc,
//       },
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });
const Invoice = require("../models/invoiceModel");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel");
const Ledger = require('../models/ledgerModel');
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");
const invoicePDFService = require("../services/invoicePDFService");
const SalesService = require("../services/salesService"); // FIXED CASING
const { runInTransaction } = require("../utils/runInTransaction"); // NEW import
const factory = require("../utils/handlerFactory");

exports.createInvoice = catchAsync(async (req, res, next) => {
  const {
    customerId,
    items,
    invoiceNumber,
    invoiceDate,
    dueDate,
    paidAmount,
    paymentStatus,
    notes,
    status,
    shippingCharges,
  } = req.body;

  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("customerId and items[] required.", 400));
  }

  let newInvoice, salesDoc;

  /* -------------------------------------------------------------
   * EXECUTE ENTIRE WORKFLOW INSIDE SAFE RETRY TRANSACTION
  ------------------------------------------------------------- */
  await runInTransaction(async (session) => {

    /* -------------------------------------------------------------
     * STEP 1 — Create Invoice
    ------------------------------------------------------------- */
    const invoiceArr = await Invoice.create(
      [
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          customerId,
          items,
          invoiceNumber,
          invoiceDate,
          dueDate,
          shippingCharges,
          paidAmount,
          paymentStatus,
          notes,
          status,
          createdBy: req.user._id,
        },
      ],
      { session }
    );

    newInvoice = invoiceArr[0];

    /* -------------------------------------------------------------
     * STEP 2 — Reduce Inventory
    ------------------------------------------------------------- */
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

      const branchInv = product.inventory.find(
        (inv) => inv.branchId.toString() === req.user.branchId.toString()
      );

      if (!branchInv || branchInv.quantity < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`, 400);
      }

      branchInv.quantity -= item.quantity;
      await product.save({ session });
    }

    /* -------------------------------------------------------------
     * STEP 3 — Update Customer Outstanding
    ------------------------------------------------------------- */
    const totalDue = newInvoice.grandTotal - (paidAmount || 0);

    await Customer.findByIdAndUpdate(
      customerId,
      { $inc: { outstandingBalance: totalDue } },
      { session }
    );

    /* -------------------------------------------------------------
     * STEP 4 — Ledger Entry
    ------------------------------------------------------------- */
    await Ledger.create(
      [
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          customerId,
          invoiceId: newInvoice._id,
          type: "debit",
          amount: newInvoice.grandTotal,
          description: `Invoice ${invoiceNumber || newInvoice._id} created`,
          accountType: "customer",
          createdBy: req.user._id,
        },
      ],
      { session }
    );

    /* -------------------------------------------------------------
     * STEP 5 — Sales Record (inside transaction)
    ------------------------------------------------------------- */
    salesDoc = await SalesService.createFromInvoiceTransactional(
      newInvoice,
      session
    );
  }, 3, {
    action: "CREATE_INVOICE",
    customerId,
    branchId: req.user.branchId,
    userId: req.user._id,
  });

  /* -------------------------------------------------------------
   * STEP 6 — Journal Entries (AFTER TRANSACTION)
  ------------------------------------------------------------- */
  try {
    const orgId = req.user.organizationId;
    const date = newInvoice.invoiceDate || newInvoice.createdAt || new Date();
    const amt = Number(newInvoice.grandTotal || 0);

    await postJournalEntries(
      orgId,
      date,
      [
        {
          accountCode: "AR",
          debit: amt,
          description: `Invoice ${newInvoice.invoiceNumber}`,
          referenceType: "invoice",
          referenceId: newInvoice._id,
        },
        {
          accountCode: "SALES",
          credit: amt,
          description: `Invoice ${newInvoice.invoiceNumber}`,
          referenceType: "invoice",
          referenceId: newInvoice._id,
        },
      ],
      { updateBalances: true }
    );
  } catch (err) {
    console.log("Journal entry failed after commit:", err.message);
  }

  /* -------------------------------------------------------------
   * STEP 7 — RESPONSE
  ------------------------------------------------------------- */
  return res.status(201).json({
    status: "success",
    message: "Invoice created successfully",
    data: { invoice: newInvoice, sales: salesDoc },
  });
});

/* -------------------------------------------------------------
 * Get All Invoices (Organization Scoped)
------------------------------------------------------------- */
exports.getAllInvoices = factory.getAll(Invoice);

/* -------------------------------------------------------------
 * Get One Invoice (With Populations)
------------------------------------------------------------- */
exports.getInvoice = factory.getOne(Invoice, [
  { path: "customerId", select: "name phone email" },
  { path: "items.productId", select: "name sku brand category" },
]);

/* -------------------------------------------------------------
 * Update Invoice (Admin Only)
------------------------------------------------------------- */
exports.updateInvoice = factory.updateOne(Invoice);

/* -------------------------------------------------------------
 * Delete Invoice (Soft Delete Supported)
------------------------------------------------------------- */
exports.deleteInvoice = factory.deleteOne(Invoice);

/* -------------------------------------------------------------
 * Get Invoices by Customer
------------------------------------------------------------- */
exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;

  const invoices = await Invoice.find({
    organizationId: req.user.organizationId,
    customerId,
    isDeleted: { $ne: true },
  });

  res.status(200).json({
    status: "success",
    results: invoices.length,
    data: { invoices },
  });
});

exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const pdfBuffer = await invoicePDFService.generateInvoicePDF(
    req.params.id,
    req.user.organizationId,
  );
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf`,
  });
  res.send(pdfBuffer);
});

exports.emailInvoice = catchAsync(async (req, res, next) => {
  await invoicePDFService.sendInvoiceEmail(
    req.params.id,
    req.user.organizationId,
  );
  res
    .status(200)
    .json({ status: "success", message: "Invoice emailed successfully." });
});


