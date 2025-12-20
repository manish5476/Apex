const mongoose = require("mongoose");
const Purchase = require("../models/purchaseModel");
const Supplier = require("../models/supplierModel");
const Product = require("../models/productModel");
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require('../utils/handlerFactory');
const { runInTransaction } = require("../utils/runInTransaction");
const fileUploadService = require("../services/uploads/fileUploadService");
const cloudinary = require("cloudinary").v2;
const { invalidateOpeningBalance } = require("../services/ledgerCache");

async function getOrInitAccount(orgId, type, name, code, session) {
  let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!account) {
    account = await Account.create([{
      organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0
    }], { session });
    return account[0];
  }
  return account;
}

function parseItemsField(items) {
  if (!items) return [];
  if (typeof items === "string") {
    try { return JSON.parse(items); } catch (err) { throw new AppError("Invalid items JSON", 400); }
  }
  return items;
}

/* ==========================================================
   1. CREATE PURCHASE
========================================================== */
exports.createPurchase = catchAsync(async (req, res, next) => {
  const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
  const items = parseItemsField(req.body.items);

  if (!supplierId || items.length === 0) return next(new AppError("Supplier and items required.", 400));

  await runInTransaction(async (session) => {
    // File Uploads
    const attachedFiles = [];
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        const url = await fileUploadService.uploadFile(f.buffer, "purchases");
        attachedFiles.push(url);
      }
    }

    const purchaseDocs = await Purchase.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, supplierId,
        invoiceNumber, purchaseDate, dueDate, items, paidAmount: 0, paymentStatus: 'unpaid',
        notes, status: status || "received", createdBy: req.user._id, attachedFiles
    }], { session });
    const purchase = purchaseDocs[0];
await invalidateOpeningBalance(req.user.organizationId);

    // Stock & Supplier Debt
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      let inventory = product.inventory.find(inv => String(inv.branchId) === String(req.user.branchId));
      if (!inventory) {
        product.inventory.push({ branchId: req.user.branchId, quantity: 0 });
        inventory = product.inventory[product.inventory.length - 1];
      }
      inventory.quantity += Number(item.quantity);
      if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;
      await product.save({ session });
    }

    await Supplier.findByIdAndUpdate(supplierId, { $inc: { outstandingBalance: purchase.grandTotal } }, { session });

    // Accounting: Dr Inventory Asset, Cr Accounts Payable
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
    const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

    // Dr Inventory
    await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
        date: purchase.purchaseDate, debit: purchase.grandTotal, credit: 0,
        description: `Purchase Stock: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
    }], { session });

    // Cr AP
    await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: supplierId,
        date: purchase.purchaseDate, debit: 0, credit: purchase.grandTotal,
        description: `Bill from Supplier: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
    }], { session });

  }, 3, { action: "CREATE_PURCHASE", userId: req.user._id });

  res.status(201).json({ status: "success", message: "Purchase recorded" });
});

/* ==========================================================
   2. UPDATE PURCHASE (Audit Fixed)
========================================================== */
exports.updatePurchase = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  let updatedPurchase;

  // File Uploads
  const newFiles = [];
  if (req.files && req.files.length > 0) {
      for (const f of req.files) {
          const url = await fileUploadService.uploadFile(f.buffer, "purchases");
          newFiles.push(url);
      }
  }

  await runInTransaction(async (session) => {
    const oldPurchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
    if (!oldPurchase) throw new AppError('Purchase not found', 404);
    if (oldPurchase.status === 'cancelled') throw new AppError('Cannot update cancelled purchase', 400);

    // Append files
    if (newFiles.length > 0) {
        updates.attachedFiles = [...(oldPurchase.attachedFiles || []), ...newFiles];
    }

    const needsFinancialUpdate = updates.items || updates.tax || updates.discount;
    if (!needsFinancialUpdate) {
       updatedPurchase = await Purchase.findByIdAndUpdate(id, updates, { new: true, session });
       return;
    }

    // 🛑 REVERSE OLD INVENTORY (Safe Logic)
    for (const item of oldPurchase.items) {
        const product = await Product.findById(item.productId).session(session);
        const inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
        if (inventory) {
             // 🔴 SAFETY CHECK: Do not allow reversal if goods already sold
             if (inventory.quantity < item.quantity) {
                 throw new AppError(`Cannot update Purchase: Items for ${product.name} are already sold/consumed. Current Stock: ${inventory.quantity}, Reversal Need: ${item.quantity}`, 400);
             }
             inventory.quantity -= item.quantity;
             await product.save({ session });
        }
    }
    // Reverse Supplier Debt & Ledger
    await Supplier.findByIdAndUpdate(oldPurchase.supplierId, { $inc: { outstandingBalance: -oldPurchase.grandTotal } }, { session });
    await AccountEntry.deleteMany({ referenceId: oldPurchase._id, referenceType: 'purchase' }, { session });

    // APPLY NEW
    const newItems = updates.items ? parseItemsField(updates.items) : oldPurchase.items;
    for (const item of newItems) {
        const product = await Product.findById(item.productId).session(session);
        let inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
        if (!inventory) {
             product.inventory.push({ branchId: oldPurchase.branchId, quantity: 0 });
             inventory = product.inventory[product.inventory.length - 1];
        }
        inventory.quantity += Number(item.quantity);
        if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;
        await product.save({ session });
    }
    updates.items = newItems;

    Object.assign(oldPurchase, updates);
    updatedPurchase = await oldPurchase.save({ session });

    // RE-BOOK
    await Supplier.findByIdAndUpdate(updatedPurchase.supplierId, { $inc: { outstandingBalance: updatedPurchase.grandTotal } }, { session });
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
    const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

    await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
        date: updatedPurchase.purchaseDate, debit: updatedPurchase.grandTotal, credit: 0,
        description: `Purchase Stock: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
    }, {
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: updatedPurchase.supplierId,
        date: updatedPurchase.purchaseDate, debit: 0, credit: updatedPurchase.grandTotal,
        description: `Bill from Supplier: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
    }], { session });

  }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

  res.status(200).json({ status: "success", data: { purchase: updatedPurchase } });
});

/* ==========================================================
   3. CANCEL PURCHASE
========================================================== */
exports.cancelPurchase = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === 'cancelled') throw new AppError("Already cancelled", 400);

    // Reverse Inventory
    for (const item of purchase.items) {
      const product = await Product.findById(item.productId).session(session);
      const inventory = product.inventory.find(inv => String(inv.branchId) === String(purchase.branchId));
      if (inventory) {
        if (inventory.quantity < item.quantity) throw new AppError(`Cannot cancel: Stock for ${product.name} already sold.`, 400);
        inventory.quantity -= item.quantity;
        await product.save({ session });
      }
    }

    await Supplier.findByIdAndUpdate(purchase.supplierId, { $inc: { outstandingBalance: -purchase.grandTotal } }, { session });
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
    const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

    // Dr AP, Cr Inventory
    await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: purchase.supplierId,
        date: new Date(), debit: purchase.grandTotal, credit: 0, description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
    }, {
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
        date: new Date(), debit: 0, credit: purchase.grandTotal, description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
    }], { session });

    purchase.status = 'cancelled';
    purchase.notes = (purchase.notes || "") + `\nCancelled: ${reason}`;
    await purchase.save({ session });
  }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });
  res.status(200).json({ status: "success", message: "Purchase cancelled." });
});

/* ==========================================================
   4. DELETE ATTACHMENT & UTILS
========================================================== */
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
    return next(new AppError("SECURITY ALERT: Cannot delete purchase. Use 'Cancel / Return' instead.", 403));
});

exports.getAllPurchases = factory.getAll(Purchase);
exports.getPurchase = factory.getOne(Purchase, [{ path: "items.productId" }]);

// const mongoose = require("mongoose");
// const Purchase = require("../models/purchaseModel");
// const Supplier = require("../models/supplierModel");
// const Product = require("../models/productModel");
// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const factory = require('../utils/handlerFactory');
// const { runInTransaction } = require("../utils/runInTransaction");
// const fileUploadService = require("../services/uploads/fileUploadService");
// const cloudinary = require("cloudinary").v2;

// async function getOrInitAccount(orgId, type, name, code, session) {
//   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
//   if (!account) {
//     account = await Account.create([{
//       organizationId: orgId, name, code, type, isGroup: false, balance: 0
//     }], { session });
//     return account[0];
//   }
//   return account;
// }

// function parseItemsField(items) {
//   if (!items) return [];
//   if (typeof items === "string") {
//     try { return JSON.parse(items); } catch (err) { throw new AppError("Invalid items JSON", 400); }
//   }
//   return items;
// }

// /* ==========================================================
//    1. CREATE PURCHASE
// ========================================================== */
// exports.createPurchase = catchAsync(async (req, res, next) => {
//   const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
//   const items = parseItemsField(req.body.items);

//   if (!supplierId || items.length === 0) return next(new AppError("Supplier and items required.", 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // File Uploads
//     const attachedFiles = [];
//     if (req.files && req.files.length > 0) {
//       for (const f of req.files) {
//         const url = await fileUploadService.uploadFile(f.buffer, "purchases");
//         attachedFiles.push(url);
//       }
//     }

//     const purchaseDocs = await Purchase.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, supplierId,
//         invoiceNumber, purchaseDate, dueDate, items, paidAmount: 0, paymentStatus: 'unpaid',
//         notes, status: status || "received", createdBy: req.user._id, attachedFiles
//     }], { session });
//     const purchase = purchaseDocs[0];

//     // Stock & Supplier Debt
//     for (const item of items) {
//       const product = await Product.findById(item.productId).session(session);
//       let inventory = product.inventory.find(inv => String(inv.branchId) === String(req.user.branchId));
//       if (!inventory) {
//         product.inventory.push({ branchId: req.user.branchId, quantity: 0 });
//         inventory = product.inventory[product.inventory.length - 1];
//       }
//       inventory.quantity += Number(item.quantity);
//       if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;
//       await product.save({ session });
//     }

//     await Supplier.findByIdAndUpdate(supplierId, { $inc: { outstandingBalance: purchase.grandTotal } }, { session });

//     // Accounting
//     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

//     await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//         date: purchase.purchaseDate, debit: purchase.grandTotal, credit: 0,
//         description: `Purchase Stock: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }, {
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: supplierId,
//         date: purchase.purchaseDate, debit: 0, credit: purchase.grandTotal,
//         description: `Bill from Supplier: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }], { session });

//     await session.commitTransaction();
//     res.status(201).json({ status: "success", data: { purchase } });
//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* ==========================================================
//    2. UPDATE PURCHASE
// ========================================================== */
// exports.updatePurchase = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const updates = req.body;
//   let updatedPurchase;

//   // File Uploads
//   const newFiles = [];
//   if (req.files && req.files.length > 0) {
//       for (const f of req.files) {
//           const url = await fileUploadService.uploadFile(f.buffer, "purchases");
//           newFiles.push(url);
//       }
//   }

//   await runInTransaction(async (session) => {
//     const oldPurchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
//     if (!oldPurchase) throw new AppError('Purchase not found', 404);
//     if (oldPurchase.status === 'cancelled') throw new AppError('Cannot update cancelled purchase', 400);

//     // Append files
//     if (newFiles.length > 0) {
//         updates.attachedFiles = [...(oldPurchase.attachedFiles || []), ...newFiles];
//     }

//     const needsFinancialUpdate = updates.items || updates.tax || updates.discount;
//     if (!needsFinancialUpdate) {
//        updatedPurchase = await Purchase.findByIdAndUpdate(id, updates, { new: true, session });
//        return;
//     }

//     // REVERSE OLD
//     for (const item of oldPurchase.items) {
//         const product = await Product.findById(item.productId).session(session);
//         const inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
//         if (inventory) {
//              inventory.quantity -= item.quantity;
//              await product.save({ session });
//         }
//     }
//     await Supplier.findByIdAndUpdate(oldPurchase.supplierId, { $inc: { outstandingBalance: -oldPurchase.grandTotal } }, { session });
//     await AccountEntry.deleteMany({ referenceId: oldPurchase._id, referenceType: 'purchase' }, { session });

//     // APPLY NEW
//     const newItems = updates.items ? parseItemsField(updates.items) : oldPurchase.items;
//     for (const item of newItems) {
//         const product = await Product.findById(item.productId).session(session);
//         let inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
//         if (!inventory) {
//              product.inventory.push({ branchId: oldPurchase.branchId, quantity: 0 });
//              inventory = product.inventory[product.inventory.length - 1];
//         }
//         inventory.quantity += Number(item.quantity);
//         if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;
//         await product.save({ session });
//     }
//     updates.items = newItems;

//     Object.assign(oldPurchase, updates);
//     updatedPurchase = await oldPurchase.save({ session });

//     // RE-BOOK
//     await Supplier.findByIdAndUpdate(updatedPurchase.supplierId, { $inc: { outstandingBalance: updatedPurchase.grandTotal } }, { session });
//     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

//     await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//         date: updatedPurchase.purchaseDate, debit: updatedPurchase.grandTotal, credit: 0,
//         description: `Purchase Stock: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
//     }, {
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: updatedPurchase.supplierId,
//         date: updatedPurchase.purchaseDate, debit: 0, credit: updatedPurchase.grandTotal,
//         description: `Bill from Supplier: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
//     }], { session });

//   }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

//   res.status(200).json({ status: "success", data: { purchase: updatedPurchase } });
// });

// /* ==========================================================
//    3. CANCEL PURCHASE
// ========================================================== */
// exports.cancelPurchase = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { reason } = req.body;
//   await runInTransaction(async (session) => {
//     const purchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
//     if (!purchase) throw new AppError("Purchase not found", 404);
//     if (purchase.status === 'cancelled') throw new AppError("Already cancelled", 400);

//     for (const item of purchase.items) {
//       const product = await Product.findById(item.productId).session(session);
//       const inventory = product.inventory.find(inv => String(inv.branchId) === String(purchase.branchId));
//       if (inventory) {
//         if (inventory.quantity < item.quantity) throw new AppError(`Insufficient stock for return: ${product.name}`, 400);
//         inventory.quantity -= item.quantity;
//         await product.save({ session });
//       }
//     }

//     await Supplier.findByIdAndUpdate(purchase.supplierId, { $inc: { outstandingBalance: -purchase.grandTotal } }, { session });
//     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

//     await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: purchase.supplierId,
//         date: new Date(), debit: purchase.grandTotal, credit: 0, description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }, {
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//         date: new Date(), debit: 0, credit: purchase.grandTotal, description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }], { session });

//     purchase.status = 'cancelled';
//     purchase.notes = (purchase.notes || "") + `\nCancelled: ${reason}`;
//     await purchase.save({ session });
//   }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });
//   res.status(200).json({ status: "success", message: "Purchase cancelled." });
// });

// /* ==========================================================
//    4. DELETE ATTACHMENT & PURCHASE
// ========================================================== */
// exports.deleteAttachment = catchAsync(async (req, res, next) => {
//   const { id, fileIndex } = req.params;
//   const purchase = await Purchase.findById(id);
//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   const url = purchase.attachedFiles[fileIndex];
//   if (!url) return next(new AppError("File not found", 404));

//   const publicId = url.split("/").pop().split(".")[0];
//   try { await cloudinary.uploader.destroy(`purchases/${publicId}`); } catch (err) {}

//   purchase.attachedFiles.splice(fileIndex, 1);
//   await purchase.save();
//   res.status(200).json({ status: "success", message: "Attachment removed.", data: { attachedFiles: purchase.attachedFiles } });
// });

// exports.deletePurchase = catchAsync(async (req, res, next) => {
//     return next(new AppError("SECURITY ALERT: Cannot delete purchase. Use 'Cancel / Return' instead.", 403));
// });

// exports.getAllPurchases = factory.getAll(Purchase);
// exports.getPurchase = factory.getOne(Purchase, [{ path: "items.productId" }]);

// // const mongoose = require("mongoose");
// // const Purchase = require("../models/purchaseModel");
// // const Supplier = require("../models/supplierModel");
// // const Product = require("../models/productModel");
// // const AccountEntry = require('../models/accountEntryModel');
// // const Account = require('../models/accountModel');
// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const factory = require('../utils/handlerFactory');
// // const { runInTransaction } = require("../utils/runInTransaction");

// // // Helper to init accounts
// // async function getOrInitAccount(orgId, type, name, code, session) {
// //   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
// //   if (!account) {
// //     account = await Account.create([{
// //       organizationId: orgId, name, code, type, isGroup: false, balance: 0
// //     }], { session });
// //     return account[0];
// //   }
// //   return account;
// // }

// // function parseItemsField(items) {
// //   if (!items) return [];
// //   if (typeof items === "string") {
// //     try { return JSON.parse(items); } catch (err) { throw new AppError("Invalid items JSON", 400); }
// //   }
// //   return items;
// // }

// // /* ==========================================================
// //    1. CREATE PURCHASE (Accrual Only - No Payment)
// // ========================================================== */
// // exports.createPurchase = catchAsync(async (req, res, next) => {
// //   const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
// //   const items = parseItemsField(req.body.items);

// //   if (!supplierId || items.length === 0) return next(new AppError("Supplier and items required.", 400));

// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     // 1. Create Purchase Doc (Status: Unpaid)
// //     const purchaseDocs = await Purchase.create([{
// //         organizationId: req.user.organizationId,
// //         branchId: req.user.branchId,
// //         supplierId,
// //         invoiceNumber,
// //         purchaseDate,
// //         dueDate,
// //         items,
// //         paidAmount: 0, // Strict: Payments via PaymentController
// //         paymentStatus: 'unpaid',
// //         notes,
// //         status: status || "received",
// //         createdBy: req.user._id
// //     }], { session });
// //     const purchase = purchaseDocs[0];

// //     // 2. Stock In & Cost Update
// //     for (const item of items) {
// //       const product = await Product.findById(item.productId).session(session);
// //       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);
      
// //       let inventory = product.inventory.find(inv => String(inv.branchId) === String(req.user.branchId));
// //       if (!inventory) {
// //         product.inventory.push({ branchId: req.user.branchId, quantity: 0 });
// //         inventory = product.inventory[product.inventory.length - 1];
// //       }
// //       inventory.quantity += Number(item.quantity);

// //       // Update Cost Price
// //       if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;
      
// //       await product.save({ session });
// //     }

// //     // 3. Supplier Debt (Liability)
// //     await Supplier.findByIdAndUpdate(supplierId, { $inc: { outstandingBalance: purchase.grandTotal } }, { session });

// //     // 4. Accounting (Dr Inventory / Cr Accounts Payable)
// //     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
// //     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

// //     // Dr Inventory
// //     await AccountEntry.create([{
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
// //         date: purchase.purchaseDate, debit: purchase.grandTotal, credit: 0,
// //         description: `Purchase Stock: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
// //     }], { session });

// //     // Cr AP
// //     await AccountEntry.create([{
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: supplierId,
// //         date: purchase.purchaseDate, debit: 0, credit: purchase.grandTotal,
// //         description: `Bill from Supplier: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
// //     }], { session });

// //     await session.commitTransaction();
// //     res.status(201).json({ status: "success", data: { purchase } });

// //   } catch (err) {
// //     await session.abortTransaction();
// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });

// // /* ==========================================================
// //    2. UPDATE PURCHASE (Smart Reversal)
// // ========================================================== */
// // exports.updatePurchase = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   const updates = req.body;
// //   let updatedPurchase;

// //   await runInTransaction(async (session) => {
// //     const oldPurchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
// //     if (!oldPurchase) throw new AppError('Purchase not found', 404);
// //     if (oldPurchase.status === 'cancelled') throw new AppError('Cannot update cancelled purchase', 400);

// //     const needsFinancialUpdate = updates.items || updates.tax || updates.discount;
// //     if (!needsFinancialUpdate) {
// //        updatedPurchase = await Purchase.findByIdAndUpdate(id, updates, { new: true, session });
// //        return;
// //     }

// //     // A. REVERSE OLD
// //     for (const item of oldPurchase.items) {
// //         const product = await Product.findById(item.productId).session(session);
// //         const inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
// //         if (inventory) {
// //              inventory.quantity -= item.quantity;
// //              await product.save({ session });
// //         }
// //     }
// //     await Supplier.findByIdAndUpdate(oldPurchase.supplierId, { $inc: { outstandingBalance: -oldPurchase.grandTotal } }, { session });
// //     await AccountEntry.deleteMany({ referenceId: oldPurchase._id, referenceType: 'purchase' }, { session });

// //     // B. APPLY NEW
// //     const newItems = updates.items ? parseItemsField(updates.items) : oldPurchase.items;
// //     for (const item of newItems) {
// //         const product = await Product.findById(item.productId).session(session);
// //         let inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
// //         if (!inventory) {
// //              product.inventory.push({ branchId: oldPurchase.branchId, quantity: 0 });
// //              inventory = product.inventory[product.inventory.length - 1];
// //         }
// //         inventory.quantity += Number(item.quantity);
// //         if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;
// //         await product.save({ session });
// //     }
// //     updates.items = newItems;

// //     Object.assign(oldPurchase, updates);
// //     updatedPurchase = await oldPurchase.save({ session });

// //     // C. RE-BOOK LEDGER
// //     await Supplier.findByIdAndUpdate(updatedPurchase.supplierId, { $inc: { outstandingBalance: updatedPurchase.grandTotal } }, { session });

// //     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
// //     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

// //     // Dr Inventory
// //     await AccountEntry.create([{
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
// //         date: updatedPurchase.purchaseDate, debit: updatedPurchase.grandTotal, credit: 0,
// //         description: `Purchase Stock: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
// //     }], { session });

// //     // Cr AP
// //     await AccountEntry.create([{
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: updatedPurchase.supplierId,
// //         date: updatedPurchase.purchaseDate, debit: 0, credit: updatedPurchase.grandTotal,
// //         description: `Bill from Supplier: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
// //     }], { session });

// //   }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

// //   res.status(200).json({ status: "success", data: { purchase: updatedPurchase } });
// // });

// // /* ==========================================================
// //    3. CANCEL PURCHASE (Return to Vendor)
// // ========================================================== */
// // exports.cancelPurchase = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   const { reason } = req.body;

// //   await runInTransaction(async (session) => {
// //     const purchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
// //     if (!purchase) throw new AppError("Purchase not found", 404);
// //     if (purchase.status === 'cancelled') throw new AppError("Already cancelled", 400);

// //     // 1. Deduct Stock
// //     for (const item of purchase.items) {
// //       const product = await Product.findById(item.productId).session(session);
// //       const inventory = product.inventory.find(inv => String(inv.branchId) === String(purchase.branchId));
// //       if (inventory) {
// //         if (inventory.quantity < item.quantity) {
// //              throw new AppError(`Cannot return ${product.name}: Insufficient stock.`, 400);
// //         }
// //         inventory.quantity -= item.quantity;
// //         await product.save({ session });
// //       }
// //     }

// //     // 2. Reverse Supplier Debt
// //     await Supplier.findByIdAndUpdate(purchase.supplierId, { $inc: { outstandingBalance: -purchase.grandTotal } }, { session });

// //     // 3. Reverse Ledger (Dr AP / Cr Inventory)
// //     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
// //     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

// //     await AccountEntry.create([{
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: purchase.supplierId,
// //         date: new Date(), debit: purchase.grandTotal, credit: 0,
// //         description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
// //     }, {
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
// //         date: new Date(), debit: 0, credit: purchase.grandTotal,
// //         description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
// //     }], { session });

// //     purchase.status = 'cancelled';
// //     purchase.notes = (purchase.notes || "") + `\nCancelled: ${reason}`;
// //     await purchase.save({ session });
// //   }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

// //   res.status(200).json({ status: "success", message: "Purchase returned/cancelled." });
// // });

// // /* ==========================================================
// //    4. DELETE PURCHASE (Strictly Blocked)
// // ========================================================== */
// // exports.deletePurchase = catchAsync(async (req, res, next) => {
// //     return next(new AppError(
// //         "SECURITY ALERT: You cannot delete a Purchase Record. Use 'Cancel / Return' instead.",
// //         403
// //     ));
// // });

// // exports.getAllPurchases = factory.getAll(Purchase);
// // exports.getPurchase = factory.getOne(Purchase, [{ path: "items.productId" }]);

// // // const mongoose = require("mongoose");
// // // const Purchase = require("../models/purchaseModel");
// // // const Supplier = require("../models/supplierModel");
// // // const Product = require("../models/productModel");
// // // const AccountEntry = require('../models/accountEntryModel'); // ✅ Added
// // // const Account = require('../models/accountModel'); // ✅ Added
// // // const catchAsync = require("../utils/catchAsync");
// // // const AppError = require("../utils/appError");
// // // const fileUploadService = require("../services/uploads/fileUploadService");
// // // const cloudinary = require("cloudinary").v2;

// // // // ... helper parseItemsField ...
// // // function parseItemsField(items) {
// // //   if (!items) return [];
// // //   if (typeof items === "string") {
// // //     try { return JSON.parse(items); }
// // //     catch (err) { throw new AppError("Invalid items JSON format", 400); }
// // //   }
// // //   return items;
// // // }

// // // exports.createPurchase = catchAsync(async (req, res, next) => {
// // //   const { supplierId, invoiceNumber, purchaseDate, dueDate, paidAmount, paymentMethod, notes, status } = req.body;
// // //   const items = parseItemsField(req.body.items);
// // //   if (!supplierId || items.length === 0) { return next(new AppError("Supplier and at least one item required.", 400)); }
  
// // //   const session = await mongoose.startSession();
// // //   session.startTransaction();
  
// // //   try {
// // //     // ... File upload logic ...
// // //     const attachedFiles = [];
// // //     if (req.files && req.files.length > 0) {
// // //       for (const f of req.files) {
// // //         const url = await fileUploadService.uploadFile(f.buffer, "purchases");
// // //         attachedFiles.push(url);
// // //       }
// // //     }

// // //     // 1. Create Purchase Document
// // //     const purchaseDocs = await Purchase.create([{
// // //         organizationId: req.user.organizationId,
// // //         branchId: req.user.branchId,
// // //         supplierId,
// // //         invoiceNumber,
// // //         purchaseDate,
// // //         dueDate,
// // //         items,
// // //         paidAmount,
// // //         paymentMethod,
// // //         notes,
// // //         status: status || "received",
// // //         createdBy: req.user._id,
// // //         attachedFiles
// // //     }], { session });

// // //     const purchase = purchaseDocs[0];

// // //     // 2. Update Product Inventory
// // //     for (const item of items) {
// // //       const product = await Product.findById(item.productId).session(session);
// // //       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

// // //       let inventory = product.inventory.find(
// // //         (inv) => inv.branchId.toString() === req.user.branchId.toString()
// // //       );

// // //       if (!inventory) {
// // //         product.inventory.push({
// // //           branchId: req.user.branchId,
// // //           quantity: 0,
// // //           reorderLevel: 10
// // //         });
// // //         inventory = product.inventory[product.inventory.length - 1];
// // //       }

// // //       inventory.quantity += Number(item.quantity);
// // //       await product.save({ session });
// // //     }

// // //     // 3. Update Supplier Balance
// // //     const totalDue = purchase.grandTotal - (paidAmount || 0);
// // //     await Supplier.findByIdAndUpdate(
// // //       supplierId,
// // //       { $inc: { outstandingBalance: totalDue } },
// // //       { session }
// // //     );

// // //     /* -----------------------------------------------
// // //        4. ACCOUNTING ENTRIES (Double Entry)
// // //        ----------------------------------------------- */
// // //     // ✅ FETCH ACCOUNTS FIRST (Missing step in your code)
// // //     const orgId = req.user.organizationId;
// // //     const inventoryAccount = await Account.findOne({ organizationId: orgId, name: 'Inventory Asset' }).session(session);
// // //     const apAccount = await Account.findOne({ organizationId: orgId, name: 'Accounts Payable' }).session(session);

// // //     if (inventoryAccount && apAccount) {
// // //         // DEBIT: Inventory Asset
// // //         await AccountEntry.create([{
// // //             organizationId: orgId,
// // //             branchId: req.user.branchId,
// // //             accountId: inventoryAccount._id,
// // //             date: purchase.purchaseDate || new Date(),
// // //             debit: purchase.grandTotal,
// // //             credit: 0,
// // //             description: `Purchase Inventory - ${invoiceNumber}`,
// // //             referenceNumber: invoiceNumber,
// // //             referenceType: 'purchase',
// // //             referenceId: purchase._id,
// // //             createdBy: req.user._id
// // //         }], { session });

// // //         // CREDIT: Accounts Payable (Tag Supplier)
// // //         await AccountEntry.create([{
// // //             organizationId: orgId,
// // //             branchId: req.user.branchId,
// // //             accountId: apAccount._id,
// // //             supplierId: supplierId, // ✅ Link to Supplier
// // //             date: purchase.purchaseDate || new Date(),
// // //             debit: 0,
// // //             credit: purchase.grandTotal,
// // //             description: `Bill from Supplier - ${invoiceNumber}`,
// // //             referenceNumber: invoiceNumber,
// // //             referenceType: 'purchase',
// // //             referenceId: purchase._id,
// // //             createdBy: req.user._id
// // //         }], { session });
// // //     } else {
// // //         console.warn("⚠️ Skipping Accounting: 'Inventory Asset' or 'Accounts Payable' account missing.");
// // //     }

// // //     await session.commitTransaction();
// // //     return res.status(201).json({
// // //       status: "success",
// // //       message: "Purchase created successfully.",
// // //       data: { purchase }
// // //     });
// // //   } catch (err) {
// // //     await session.abortTransaction();
// // //     next(err);
// // //   } finally {
// // //     session.endSession();
// // //   }
// // // });

// // // // ... Rest of the controller (getAllPurchases, getPurchase, updatePurchase, etc.) ...
// // // // (Keep the rest of your file exactly as it was)
// // // exports.getAllPurchases = catchAsync(async (req, res, next) => {
// // //   const purchases = await Purchase.find({
// // //     organizationId: req.user.organizationId,
// // //     isDeleted: false
// // //   })
// // //     .populate("supplierId", "companyName")
// // //     .sort({ purchaseDate: -1 })
// // //     .lean();

// // //   res.status(200).json({ status: "success", results: purchases.length, data: { purchases } });
// // // });

// // // exports.getPurchase = catchAsync(async (req, res, next) => {
// // //   const purchase = await Purchase.findOne({
// // //     _id: req.params.id,
// // //     organizationId: req.user.organizationId
// // //   })
// // //     .populate("supplierId", "companyName contactPerson")
// // //     .populate("items.productId", "name sku");

// // //   if (!purchase) return next(new AppError("Purchase not found", 404));
// // //   res.status(200).json({ status: "success", data: { purchase } });
// // // });

// // // exports.updatePurchase = catchAsync(async (req, res, next) => {
// // //   const purchase = await Purchase.findById(req.params.id);
// // //   if (!purchase) return next(new AppError("Purchase not found", 404));

// // //   const items = req.body.items ? parseItemsField(req.body.items) : purchase.items;
// // //   const newFiles = [];
// // //   if (req.files && req.files.length > 0) {
// // //     for (const f of req.files) {
// // //       const url = await fileUploadService.uploadFile(f.buffer, "purchases");
// // //       newFiles.push(url);
// // //     }
// // //   }

// // //   purchase.items = items;
// // //   purchase.notes = req.body.notes || purchase.notes;
// // //   purchase.attachedFiles.push(...newFiles);

// // //   await purchase.save();
// // //   res.status(200).json({ status: "success", message: "Purchase updated.", data: { purchase } });
// // // });

// // // exports.deleteAttachment = catchAsync(async (req, res, next) => {
// // //   const { id, fileIndex } = req.params;
// // //   const purchase = await Purchase.findById(id);
// // //   if (!purchase) return next(new AppError("Purchase not found", 404));

// // //   const url = purchase.attachedFiles[fileIndex];
// // //   if (!url) return next(new AppError("File not found", 404));

// // //   const publicId = url.split("/").pop().split(".")[0];
// // //   try { await cloudinary.uploader.destroy(`purchases/${publicId}`); } catch (err) {}

// // //   purchase.attachedFiles.splice(fileIndex, 1);
// // //   await purchase.save();
// // //   res.status(200).json({ status: "success", message: "Attachment removed.", data: { attachedFiles: purchase.attachedFiles } });
// // // });

// // // exports.deletePurchase = catchAsync(async (req, res, next) => {
// // //   const purchase = await Purchase.findById(req.params.id);
// // //   if (!purchase) return next(new AppError("Purchase not found", 404));
// // //   purchase.isDeleted = true;
// // //   await purchase.save();
// // //   res.status(200).json({ status: "success", message: "Purchase deleted." });
// // // });