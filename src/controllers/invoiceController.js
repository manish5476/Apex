const Invoice = require("../models/invoiceModel");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel");
const Ledger = require("../models/ledgerModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const mongoose = require("mongoose");
const invoicePDFService = require("../services/invoicePDFService");

/* -------------------------------------------------------------
 * Create Invoice (Transactional)
------------------------------------------------------------- */
exports.createInvoice = catchAsync(async (req, res, next) => {
  const {
    customerId,
    items, // [{ productId, quantity, sellingPrice, taxRate, discount }]
    invoiceNumber,
    invoiceDate,
    dueDate,
    paidAmount,
    paymentStatus,
    notes,
    status,
    shippingCharges,
  } = req.body;

  if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
    return next(
      new AppError(
        "Please provide a valid customerId and at least one item.",
        400,
      ),
    );
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // --- STEP 1: Create Invoice Document ---
    const invoice = await Invoice.create(
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
      { session },
    );

    const newInvoice = invoice[0];

    // --- STEP 2: Reduce Inventory for Each Product ---
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product)
        throw new AppError(`Product not found: ${item.productId}`, 404);

      const branchInventory = product.inventory.find(
        (inv) => inv.branchId.toString() === req.user.branchId.toString(),
      );

      if (!branchInventory || branchInventory.quantity < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${product.name} at this branch.`,
          400,
        );
      }

      branchInventory.quantity -= item.quantity;
      await product.save({ session });
    }

    // --- STEP 3: Update Customer Outstanding Balance ---
    const totalDue = newInvoice.grandTotal - (paidAmount || 0);
    await Customer.findByIdAndUpdate(
      customerId,
      { $inc: { outstandingBalance: totalDue } },
      { session },
    );

    // --- STEP 4: Create Ledger Entry (Debit for Customer) ---
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
      { session },
    );

    // --- STEP 5: Commit Transaction ---
    await session.commitTransaction();

    res.status(201).json({
      status: "success",
      message: "Invoice created successfully!",
      data: { invoice: newInvoice },
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
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
