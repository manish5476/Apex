const mongoose = require("mongoose");
const Purchase = require("../models/purchaseModel");
const Product = require("../models/productModel");
const Supplier = require("../models/supplierModel");
const Ledger = require("../models/ledgerModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

/* -----------------------------------------------------------
 * Create a Purchase (Transactional)
 * --------------------------------------------------------- */
exports.createPurchase = catchAsync(async (req, res, next) => {
  const {
    supplierId,
    items,      // [{ productId, name, quantity, purchasePrice, taxRate, discount }]
    invoiceNumber,
    purchaseDate,
    dueDate,
    paidAmount,
    paymentMethod,
    notes,
    status
  } = req.body;

  if (!supplierId || !items || items.length === 0)
    return next(new AppError("Supplier and items are required.", 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // STEP 1: Create purchase
    const purchaseDocs = await Purchase.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      supplierId,
      items,
      invoiceNumber,
      purchaseDate,
      dueDate,
      paymentStatus: paidAmount > 0 ? (paidAmount >= req.body.grandTotal ? "paid" : "partial") : "unpaid",
      paidAmount,
      paymentMethod,
      notes,
      status: status || "received",
      createdBy: req.user._id
    }], { session });

    const purchase = purchaseDocs[0];

    // STEP 2 — Update inventory for each item
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product)
        throw new AppError(`Product not found: ${item.productId}`, 404);

      // find branch inventory
      let branchInventory = product.inventory.find(
        inv => inv.branchId.toString() === req.user.branchId.toString()
      );

      if (!branchInventory) {
        product.inventory.push({
          branchId: req.user.branchId,
          quantity: 0,
          reorderLevel: 10
        });
        branchInventory = product.inventory[product.inventory.length - 1];
      }

      branchInventory.quantity += item.quantity;

      await product.save({ session });
    }

    // STEP 3 — Supplier outstanding balance
    const totalDue = purchase.grandTotal - (paidAmount || 0);

    await Supplier.findByIdAndUpdate(
      supplierId,
      { $inc: { outstandingBalance: totalDue } },
      { session }
    );

    // STEP 4 — Ledger entry (credit supplier, debit purchases)
    await Ledger.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      supplierId,
      purchaseId: purchase._id,
      type: "credit",
      amount: purchase.grandTotal,
      description: `Purchase ${invoiceNumber || purchase._id} created`,
      accountType: "supplier",
      createdBy: req.user._id
    }], { session });

    await session.commitTransaction();

    res.status(201).json({
      status: "success",
      message: "Purchase created successfully.",
      data: { purchase }
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* -----------------------------------------------------------
 * Get All Purchases
 * --------------------------------------------------------- */
exports.getAllPurchases = catchAsync(async (req, res, next) => {
  const purchases = await Purchase.find({
    organizationId: req.user.organizationId,
    isDeleted: false
  }).sort({ purchaseDate: -1 });

  res.status(200).json({ status: "success", data: { purchases } });
});

/* -----------------------------------------------------------
 * Get Single Purchase
 * --------------------------------------------------------- */
exports.getPurchase = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
    isDeleted: false
  }).populate("supplierId", "companyName contactPerson phone");

  if (!purchase)
    return next(new AppError("Purchase not found.", 404));

  res.status(200).json({ status: "success", data: { purchase } });
});

/* -----------------------------------------------------------
 * Update Purchase (admin only normally)
 * --------------------------------------------------------- */
exports.updatePurchase = catchAsync(async (req, res, next) => {
  const updated = await Purchase.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    req.body,
    { new: true }
  );

  if (!updated)
    return next(new AppError("Purchase not found.", 404));

  res.status(200).json({ status: "success", data: { updated } });
});

/* -----------------------------------------------------------
 * Soft Delete Purchase
 * --------------------------------------------------------- */
exports.deletePurchase = catchAsync(async (req, res, next) => {
  const deleted = await Purchase.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { isDeleted: true },
    { new: true }
  );

  if (!deleted)
    return next(new AppError("Purchase not found.", 404));

  res.status(200).json({ status: "success", message: "Purchase deleted." });
});
