const mongoose = require("mongoose");
const Purchase = require("../models/purchaseModel");
const Supplier = require("../models/supplierModel");
const Product = require("../models/productModel");
const AccountEntry = require('../models/accountEntryModel'); // ✅ Added
const Account = require('../models/accountModel'); // ✅ Added
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const fileUploadService = require("../services/uploads/fileUploadService");
const cloudinary = require("cloudinary").v2;

// ... helper parseItemsField ...
function parseItemsField(items) {
  if (!items) return [];
  if (typeof items === "string") {
    try { return JSON.parse(items); }
    catch (err) { throw new AppError("Invalid items JSON format", 400); }
  }
  return items;
}

exports.createPurchase = catchAsync(async (req, res, next) => {
  const { supplierId, invoiceNumber, purchaseDate, dueDate, paidAmount, paymentMethod, notes, status } = req.body;
  const items = parseItemsField(req.body.items);
  if (!supplierId || items.length === 0) { return next(new AppError("Supplier and at least one item required.", 400)); }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // ... File upload logic ...
    const attachedFiles = [];
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        const url = await fileUploadService.uploadFile(f.buffer, "purchases");
        attachedFiles.push(url);
      }
    }

    // 1. Create Purchase Document
    const purchaseDocs = await Purchase.create([{
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        supplierId,
        invoiceNumber,
        purchaseDate,
        dueDate,
        items,
        paidAmount,
        paymentMethod,
        notes,
        status: status || "received",
        createdBy: req.user._id,
        attachedFiles
    }], { session });

    const purchase = purchaseDocs[0];

    // 2. Update Product Inventory
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

      let inventory = product.inventory.find(
        (inv) => inv.branchId.toString() === req.user.branchId.toString()
      );

      if (!inventory) {
        product.inventory.push({
          branchId: req.user.branchId,
          quantity: 0,
          reorderLevel: 10
        });
        inventory = product.inventory[product.inventory.length - 1];
      }

      inventory.quantity += Number(item.quantity);
      await product.save({ session });
    }

    // 3. Update Supplier Balance
    const totalDue = purchase.grandTotal - (paidAmount || 0);
    await Supplier.findByIdAndUpdate(
      supplierId,
      { $inc: { outstandingBalance: totalDue } },
      { session }
    );

    /* -----------------------------------------------
       4. ACCOUNTING ENTRIES (Double Entry)
       ----------------------------------------------- */
    // ✅ FETCH ACCOUNTS FIRST (Missing step in your code)
    const orgId = req.user.organizationId;
    const inventoryAccount = await Account.findOne({ organizationId: orgId, name: 'Inventory Asset' }).session(session);
    const apAccount = await Account.findOne({ organizationId: orgId, name: 'Accounts Payable' }).session(session);

    if (inventoryAccount && apAccount) {
        // DEBIT: Inventory Asset
        await AccountEntry.create([{
            organizationId: orgId,
            branchId: req.user.branchId,
            accountId: inventoryAccount._id,
            date: purchase.purchaseDate || new Date(),
            debit: purchase.grandTotal,
            credit: 0,
            description: `Purchase Inventory - ${invoiceNumber}`,
            referenceNumber: invoiceNumber,
            referenceType: 'purchase',
            referenceId: purchase._id,
            createdBy: req.user._id
        }], { session });

        // CREDIT: Accounts Payable (Tag Supplier)
        await AccountEntry.create([{
            organizationId: orgId,
            branchId: req.user.branchId,
            accountId: apAccount._id,
            supplierId: supplierId, // ✅ Link to Supplier
            date: purchase.purchaseDate || new Date(),
            debit: 0,
            credit: purchase.grandTotal,
            description: `Bill from Supplier - ${invoiceNumber}`,
            referenceNumber: invoiceNumber,
            referenceType: 'purchase',
            referenceId: purchase._id,
            createdBy: req.user._id
        }], { session });
    } else {
        console.warn("⚠️ Skipping Accounting: 'Inventory Asset' or 'Accounts Payable' account missing.");
    }

    await session.commitTransaction();
    return res.status(201).json({
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

// ... Rest of the controller (getAllPurchases, getPurchase, updatePurchase, etc.) ...
// (Keep the rest of your file exactly as it was)
exports.getAllPurchases = catchAsync(async (req, res, next) => {
  const purchases = await Purchase.find({
    organizationId: req.user.organizationId,
    isDeleted: false
  })
    .populate("supplierId", "companyName")
    .sort({ purchaseDate: -1 })
    .lean();

  res.status(200).json({ status: "success", results: purchases.length, data: { purchases } });
});

exports.getPurchase = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  })
    .populate("supplierId", "companyName contactPerson")
    .populate("items.productId", "name sku");

  if (!purchase) return next(new AppError("Purchase not found", 404));
  res.status(200).json({ status: "success", data: { purchase } });
});

exports.updatePurchase = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return next(new AppError("Purchase not found", 404));

  const items = req.body.items ? parseItemsField(req.body.items) : purchase.items;
  const newFiles = [];
  if (req.files && req.files.length > 0) {
    for (const f of req.files) {
      const url = await fileUploadService.uploadFile(f.buffer, "purchases");
      newFiles.push(url);
    }
  }

  purchase.items = items;
  purchase.notes = req.body.notes || purchase.notes;
  purchase.attachedFiles.push(...newFiles);

  await purchase.save();
  res.status(200).json({ status: "success", message: "Purchase updated.", data: { purchase } });
});

exports.deleteAttachment = catchAsync(async (req, res, next) => {
  const { id, fileIndex } = req.params;
  const purchase = await Purchase.findById(id);
  if (!purchase) return next(new AppError("Purchase not found", 404));

  const url = purchase.attachedFiles[fileIndex];
  if (!url) return next(new AppError("File not found", 404));

  const publicId = url.split("/").pop().split(".")[0];
  try { await cloudinary.uploader.destroy(`purchases/${publicId}`); } catch (err) {}

  purchase.attachedFiles.splice(fileIndex, 1);
  await purchase.save();
  res.status(200).json({ status: "success", message: "Attachment removed.", data: { attachedFiles: purchase.attachedFiles } });
});

exports.deletePurchase = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return next(new AppError("Purchase not found", 404));
  purchase.isDeleted = true;
  await purchase.save();
  res.status(200).json({ status: "success", message: "Purchase deleted." });
});

/* ==========================================================
   CANCEL PURCHASE (Purchase Return)
   ----------------------------------------------------------
   1. Reverses Inventory (Deducts stock)
   2. Reverses Supplier Balance
   3. Creates Reversal Accounting Entries
========================================================== */
exports.cancelPurchase = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const purchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
    if (!purchase) throw new AppError("Purchase not found", 404);

    if (purchase.status === 'cancelled') {
        throw new AppError("Purchase is already cancelled", 400);
    }

    // 1. REVERSE INVENTORY (Check if we have enough stock to return)
    for (const item of purchase.items) {
      const product = await Product.findById(item.productId).session(session);
      if (product) {
        const inventory = product.inventory.find(
            inv => inv.branchId.toString() === purchase.branchId.toString()
        );
        
        if (inventory) {
            // Safety Check: Can't return what you don't have
            if (inventory.quantity < item.quantity) {
                throw new AppError(`Cannot cancel: Product '${product.name}' stock (${inventory.quantity}) is lower than purchase quantity (${item.quantity}). Items may have already been sold.`, 400);
            }
            inventory.quantity -= item.quantity;
            await product.save({ session });
        }
      }
    }

    // 2. REVERSE SUPPLIER BALANCE
    // We deduct the FULL grandTotal because we are cancelling the obligation to pay
    const outstandingReversal = purchase.grandTotal - (purchase.paidAmount || 0);
    
    // Note: If you already paid, you have a credit with the supplier. 
    // This logic assumes we reverse the *remaining* debt. 
    // Ideally, paidAmount remains as "Unused Credit" for the supplier.
    if (outstandingReversal > 0) {
        await Supplier.findByIdAndUpdate(
            purchase.supplierId,
            { $inc: { outstandingBalance: -outstandingReversal } },
            { session }
        );
    }

    // 3. REVERSAL ACCOUNTING ENTRIES (Debit AP, Credit Inventory)
    const orgId = req.user.organizationId;
    const inventoryAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Asset' }).session(session);
    const apAcc = await Account.findOne({ organizationId: orgId, name: 'Accounts Payable' }).session(session);

    if (inventoryAcc && apAcc) {
        // Debit AP (Decrease Liability)
        await AccountEntry.create([{
            organizationId: orgId,
            branchId: purchase.branchId,
            accountId: apAcc._id,
            supplierId: purchase.supplierId,
            date: new Date(),
            debit: purchase.grandTotal, // Reverse full amount
            credit: 0,
            description: `Purchase Cancelled: ${purchase.invoiceNumber} - ${reason || ''}`,
            referenceType: 'purchase',
            referenceId: purchase._id,
            createdBy: req.user._id
        }], { session });

        // Credit Inventory (Decrease Asset)
        await AccountEntry.create([{
            organizationId: orgId,
            branchId: purchase.branchId,
            accountId: inventoryAcc._id,
            date: new Date(),
            debit: 0,
            credit: purchase.grandTotal,
            description: `Stock Reversal: ${purchase.invoiceNumber}`,
            referenceType: 'purchase',
            referenceId: purchase._id,
            createdBy: req.user._id
        }], { session });
    }

    // 4. MARK AS CANCELLED
    purchase.status = 'cancelled';
    purchase.notes = `${purchase.notes || ''} \n[Cancelled on ${new Date().toLocaleDateString()}: ${reason}]`;
    await purchase.save({ session });

    await session.commitTransaction();
    res.status(200).json({ status: "success", message: "Purchase cancelled and accounting reversed." });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});
// const mongoose = require("mongoose");
// const Purchase = require("../models/purchaseModel");
// const Supplier = require("../models/supplierModel");
// const Product = require("../models/productModel");
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const fileUploadService = require("../services/uploads/fileUploadService");
// const cloudinary = require("cloudinary").v2;

// /* -------------------------------------------------------
//  * HELPER — Parse Items (in case of multipart form)
//  ------------------------------------------------------- */
// function parseItemsField(items) {
//   if (!items) return [];
//   if (typeof items === "string") {
//     try { return JSON.parse(items); }
//     catch (err) { throw new AppError("Invalid items JSON format", 400); }
//   }
//   return items;
// }

// /* -------------------------------------------------------
//  * CREATE PURCHASE  (with file upload)
//  ------------------------------------------------------- */
// exports.createPurchase = catchAsync(async (req, res, next) => {
//   const { supplierId, invoiceNumber, purchaseDate, dueDate, paidAmount, paymentMethod, notes, status } = req.body;
//   const items = parseItemsField(req.body.items);
//   if (!supplierId || items.length === 0) { return next(new AppError("Supplier and at least one item required.", 400)); }
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     /* -----------------------------------------------
//      * Upload Files to Cloudinary (if any)
//      ----------------------------------------------- */
//     const attachedFiles = [];
//     if (req.files && req.files.length > 0) {
//       for (const f of req.files) {
//         const url = await fileUploadService.uploadFile(f.buffer, "purchases");
//         attachedFiles.push(url);
//       }
//     }

//     /* -----------------------------------------------
//      * Step 1 — Create Purchase Document
//      ----------------------------------------------- */
//     const purchaseDocs = await Purchase.create(
//       [
//         {
//           organizationId: req.user.organizationId,
//           branchId: req.user.branchId,
//           supplierId,
//           invoiceNumber,
//           purchaseDate,
//           dueDate,
//           items,
//           paidAmount,
//           paymentMethod,
//           notes,
//           status: status || "received",
//           createdBy: req.user._id,
//           attachedFiles
//         }
//       ],
//       { session }
//     );

//     const purchase = purchaseDocs[0];

//     /* -----------------------------------------------
//      * Step 2 — Update Product Inventory
//      ----------------------------------------------- */
//     for (const item of items) {
//       const product = await Product.findById(item.productId).session(session);
//       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

//       let inventory = product.inventory.find(
//         (inv) => inv.branchId.toString() === req.user.branchId.toString()
//       );

//       if (!inventory) {
//         product.inventory.push({
//           branchId: req.user.branchId,
//           quantity: 0,
//           reorderLevel: 10
//         });
//         inventory = product.inventory[product.inventory.length - 1];
//       }

//       inventory.quantity += item.quantity;
//       await product.save({ session });
//     }

//     /* -----------------------------------------------
//      * Step 3 — Update Supplier Balance
//      ----------------------------------------------- */
//     const totalDue = purchase.grandTotal - (paidAmount || 0);

//     await Supplier.findByIdAndUpdate(
//       supplierId,
//       { $inc: { outstandingBalance: totalDue } },
//       { session }
//     );

//     /* -----------------------------------------------
//      * Step 4 — Ledger Entry
//      ----------------------------------------------- */
//     // DEBIT: Inventory Asset
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       accountId: inventoryAccount._id,
//       date: purchase.purchaseDate,
//       debit: purchase.grandTotal,
//       credit: 0,
//       description: `Purchase Inventory - ${invoiceNumber}`,
//       referenceNumber: invoiceNumber,
//       referenceType: 'purchase',
//       referenceId: purchase._id
//     }], { session });

//     // CREDIT: Accounts Payable
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       accountId: apAccount._id,
//       supplierId: supplierId,
//       date: purchase.purchaseDate,
//       debit: 0,
//       credit: purchase.grandTotal,
//       description: `Bill from ${invoiceNumber}`,
//       referenceNumber: invoiceNumber,
//       referenceType: 'purchase',
//       referenceId: purchase._id
//     }], { session });

//     await session.commitTransaction();
//     return res.status(201).json({
//       status: "success",
//       message: "Purchase created successfully.",
//       data: { purchase }
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* -------------------------------------------------------
//  * GET ALL PURCHASES
//  ------------------------------------------------------- */
// exports.getAllPurchases = catchAsync(async (req, res, next) => {
//   const purchases = await Purchase.find({
//     organizationId: req.user.organizationId,
//     isDeleted: false
//   })
//     .populate("supplierId", "companyName")
//     .sort({ purchaseDate: -1 })
//     .lean();

//   res.status(200).json({
//     status: "success",
//     results: purchases.length,
//     data: { purchases }
//   });
// });

// /* -------------------------------------------------------
//  * GET ONE PURCHASE
//  ------------------------------------------------------- */
// exports.getPurchase = catchAsync(async (req, res, next) => {
//   const purchase = await Purchase.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   })
//     .populate("supplierId", "companyName contactPerson")
//     .populate("items.productId", "name sku");

//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   res.status(200).json({
//     status: "success",
//     data: { purchase }
//   });
// });

// /* -------------------------------------------------------
//  * UPDATE PURCHASE — append new files
//  ------------------------------------------------------- */
// exports.updatePurchase = catchAsync(async (req, res, next) => {
//   const purchase = await Purchase.findById(req.params.id);
//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   const items = req.body.items ? parseItemsField(req.body.items) : purchase.items;

//   /* File Uploads (append to existing) */
//   const newFiles = [];

//   if (req.files && req.files.length > 0) {
//     for (const f of req.files) {
//       const url = await fileUploadService.uploadFile(f.buffer, "purchases");
//       newFiles.push(url);
//     }
//   }

//   purchase.items = items;
//   purchase.notes = req.body.notes || purchase.notes;
//   purchase.attachedFiles.push(...newFiles);

//   await purchase.save();

//   res.status(200).json({
//     status: "success",
//     message: "Purchase updated.",
//     data: { purchase }
//   });
// });

// /* -------------------------------------------------------
//  * DELETE A SINGLE ATTACHED FILE
//  ------------------------------------------------------- */
// exports.deleteAttachment = catchAsync(async (req, res, next) => {
//   const { id, fileIndex } = req.params;

//   const purchase = await Purchase.findById(id);
//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   const url = purchase.attachedFiles[fileIndex];
//   if (!url) return next(new AppError("File not found", 404));

//   // Extract public_id from cloudinary URL
//   const publicId = url.split("/").pop().split(".")[0];

//   try {
//     await cloudinary.uploader.destroy(`purchases/${publicId}`);
//   } catch (err) {
//     console.warn("Cloudinary deletion failed:", err.message);
//   }

//   purchase.attachedFiles.splice(fileIndex, 1);
//   await purchase.save();

//   res.status(200).json({
//     status: "success",
//     message: "Attachment removed.",
//     data: { attachedFiles: purchase.attachedFiles }
//   });
// });

// /* -------------------------------------------------------
//  * SOFT DELETE PURCHASE
//  ------------------------------------------------------- */
// exports.deletePurchase = catchAsync(async (req, res, next) => {
//   const purchase = await Purchase.findById(req.params.id);
//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   purchase.isDeleted = true;
//   await purchase.save();

//   res.status(200).json({
//     status: "success",
//     message: "Purchase deleted."
//   });
// });
