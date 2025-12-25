const mongoose = require("mongoose");
const Purchase = require("../models/purchaseModel");
const Supplier = require("../models/supplierModel");
const Product = require("../models/productModel");
const AccountEntry = require("../models/accountEntryModel");
const Account = require("../models/accountModel");

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { runInTransaction } = require("../utils/runInTransaction");

const fileUploadService = require("../services/uploads/fileUploadService");
const cloudinary = require("cloudinary").v2;
const { invalidateOpeningBalance } = require("../services/ledgerCache");

/* ======================================================
   ACCOUNT HELPER (IDEMPOTENT)
====================================================== */
async function getOrInitAccount(orgId, type, name, code, session) {
  let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!account) {
    const created = await Account.create([{
      organizationId: orgId,
      name,
      code,
      type,
      isGroup: false,
      cachedBalance: 0
    }], { session });
    return created[0];
  }
  return account;
}

/* ======================================================
   UTILS
====================================================== */
function parseItemsField(items) {
  if (!items) return [];
  if (typeof items === "string") {
    try {
      return JSON.parse(items);
    } catch {
      throw new AppError("Invalid items JSON", 400);
    }
  }
  return items;
}

/* ======================================================
   1. CREATE PURCHASE
====================================================== */
exports.createPurchase = catchAsync(async (req, res, next) => {
  const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
  const items = parseItemsField(req.body.items);

  if (!supplierId || !items.length) {
    return next(new AppError("Supplier and items are required", 400));
  }

  await runInTransaction(async (session) => {
    /* ---------- FILE UPLOAD ---------- */
    const attachedFiles = [];
    if (req.files?.length) {
      for (const f of req.files) {
        attachedFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
      }
    }

    /* ---------- CREATE PURCHASE ---------- */
    const [purchase] = await Purchase.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      supplierId,
      invoiceNumber,
      purchaseDate,
      dueDate,
      items,
      paidAmount: 0,
      paymentStatus: "unpaid",
      status: status || "received",
      notes,
      attachedFiles,
      createdBy: req.user._id
    }], { session });

    await invalidateOpeningBalance(req.user.organizationId);

    /* ---------- INVENTORY UPDATE ---------- */
    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw new AppError("Product not found", 404);

      let inventory = product.inventory.find(
        i => String(i.branchId) === String(req.user.branchId)
      );

      if (!inventory) {
        product.inventory.push({ branchId: req.user.branchId, quantity: 0 });
        inventory = product.inventory.at(-1);
      }

      inventory.quantity += Number(item.quantity);

      if (item.purchasePrice > 0) {
        product.purchasePrice = item.purchasePrice;
      }

      await product.save({ session });
    }

    /* ---------- SUPPLIER BALANCE ---------- */
    await Supplier.findByIdAndUpdate(
      supplierId,
      { $inc: { outstandingBalance: purchase.grandTotal } },
      { session }
    );

    /* ---------- ACCOUNTING ---------- */
    const inventoryAcc = await getOrInitAccount(
      req.user.organizationId, "asset", "Inventory Asset", "1500", session
    );
    const apAcc = await getOrInitAccount(
      req.user.organizationId, "liability", "Accounts Payable", "2000", session
    );

    // Dr Inventory
    // Cr Accounts Payable
    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: inventoryAcc._id,
        date: purchase.purchaseDate,
        debit: purchase.grandTotal,
        credit: 0,
        description: `Purchase: ${invoiceNumber}`,
        referenceType: "purchase",
        referenceId: purchase._id,
        createdBy: req.user._id
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id,
        supplierId,
        date: purchase.purchaseDate,
        debit: 0,
        credit: purchase.grandTotal,
        description: `Supplier Bill: ${invoiceNumber}`,
        referenceType: "purchase",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session });
  }, 3, { action: "CREATE_PURCHASE", userId: req.user._id });

  res.status(201).json({ status: "success", message: "Purchase recorded successfully" });
});

/* ======================================================
   2. UPDATE PURCHASE (FULL REVERSAL + REBOOK)
====================================================== */
exports.updatePurchase = catchAsync(async (req, res, next) => {
  const updates = req.body;
  let updatedPurchase;

  const newFiles = [];
  if (req.files?.length) {
    for (const f of req.files) {
      newFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
    }
  }

  await runInTransaction(async (session) => {
    const oldPurchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!oldPurchase) throw new AppError("Purchase not found", 404);
    if (oldPurchase.status === "cancelled") {
      throw new AppError("Cancelled purchase cannot be edited", 400);
    }

    if (newFiles.length) {
      updates.attachedFiles = [...oldPurchase.attachedFiles, ...newFiles];
    }

    const financialChange = updates.items || updates.tax || updates.discount;
    if (!financialChange) {
      updatedPurchase = await Purchase.findByIdAndUpdate(
        oldPurchase._id, updates, { new: true, session }
      );
      return;
    }

    /* ---------- REVERSE OLD INVENTORY ---------- */
    for (const item of oldPurchase.items) {
      const product = await Product.findById(item.productId).session(session);
      const inv = product.inventory.find(
        i => String(i.branchId) === String(oldPurchase.branchId)
      );

      if (!inv || inv.quantity < item.quantity) {
        throw new AppError(
          `Cannot update: Stock already consumed for ${product.name}`,
          400
        );
      }

      inv.quantity -= item.quantity;
      await product.save({ session });
    }

    /* ---------- REVERSE LEDGER + SUPPLIER ---------- */
    await Supplier.findByIdAndUpdate(
      oldPurchase.supplierId,
      { $inc: { outstandingBalance: -oldPurchase.grandTotal } },
      { session }
    );

    await AccountEntry.deleteMany({
      referenceId: oldPurchase._id,
      referenceType: "purchase"
    }).session(session);

    /* ---------- APPLY NEW ---------- */
    const newItems = updates.items
      ? parseItemsField(updates.items)
      : oldPurchase.items;

    for (const item of newItems) {
      const product = await Product.findById(item.productId).session(session);
      let inv = product.inventory.find(
        i => String(i.branchId) === String(oldPurchase.branchId)
      );

      if (!inv) {
        product.inventory.push({ branchId: oldPurchase.branchId, quantity: 0 });
        inv = product.inventory.at(-1);
      }

      inv.quantity += Number(item.quantity);
      if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;

      await product.save({ session });
    }

    Object.assign(oldPurchase, updates, { items: newItems });
    updatedPurchase = await oldPurchase.save({ session });

    /* ---------- REBOOK LEDGER ---------- */
    const inventoryAcc = await getOrInitAccount(
      req.user.organizationId, "asset", "Inventory Asset", "1500", session
    );
    const apAcc = await getOrInitAccount(
      req.user.organizationId, "liability", "Accounts Payable", "2000", session
    );

    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: inventoryAcc._id,
        date: updatedPurchase.purchaseDate,
        debit: updatedPurchase.grandTotal,
        credit: 0,
        description: `Purchase Updated: ${updatedPurchase.invoiceNumber}`,
        referenceType: "purchase",
        referenceId: updatedPurchase._id,
        createdBy: req.user._id
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id,
        supplierId: updatedPurchase.supplierId,
        date: updatedPurchase.purchaseDate,
        debit: 0,
        credit: updatedPurchase.grandTotal,
        description: `Supplier Bill Updated`,
        referenceType: "purchase",
        referenceId: updatedPurchase._id,
        createdBy: req.user._id
      }
    ], { session });
  }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

  res.status(200).json({ status: "success", data: { purchase: updatedPurchase } });
});

/* ======================================================
   3. CANCEL PURCHASE (RETURN TO SUPPLIER)
====================================================== */
exports.cancelPurchase = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") throw new AppError("Already cancelled", 400);

    for (const item of purchase.items) {
      const product = await Product.findById(item.productId).session(session);
      const inv = product.inventory.find(
        i => String(i.branchId) === String(purchase.branchId)
      );

      if (!inv || inv.quantity < item.quantity) {
        throw new AppError(`Stock already consumed: ${product.name}`, 400);
      }

      inv.quantity -= item.quantity;
      await product.save({ session });
    }

    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: -purchase.grandTotal } },
      { session }
    );

    const inventoryAcc = await getOrInitAccount(
      req.user.organizationId, "asset", "Inventory Asset", "1500", session
    );
    const apAcc = await getOrInitAccount(
      req.user.organizationId, "liability", "Accounts Payable", "2000", session
    );

    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id,
        supplierId: purchase.supplierId,
        date: new Date(),
        debit: purchase.grandTotal,
        credit: 0,
        description: `Purchase Cancelled`,
        referenceType: "purchase_return",
        referenceId: purchase._id,
        createdBy: req.user._id
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: inventoryAcc._id,
        date: new Date(),
        debit: 0,
        credit: purchase.grandTotal,
        description: `Inventory Returned`,
        referenceType: "purchase_return",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session });

    purchase.status = "cancelled";
    purchase.notes = `${purchase.notes || ""}\nCancelled: ${reason}`;
    await purchase.save({ session });
  }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

  res.status(200).json({ status: "success", message: "Purchase cancelled" });
});

/* ======================================================
   4. ATTACHMENT DELETE
====================================================== */
exports.deleteAttachment = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return next(new AppError("Purchase not found", 404));

  const url = purchase.attachedFiles[req.params.fileIndex];
  if (!url) return next(new AppError("File not found", 404));

  const publicId = url.split("/").pop().split(".")[0];
  try { await cloudinary.uploader.destroy(`purchases/${publicId}`); } catch {}

  purchase.attachedFiles.splice(req.params.fileIndex, 1);
  await purchase.save();

  res.status(200).json({ status: "success", message: "Attachment removed" });
});

/* ======================================================
   5. READ-ONLY
====================================================== */
exports.deletePurchase = () => {
  throw new AppError("Delete not allowed. Use cancel.", 403);
};

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
// const { invalidateOpeningBalance } = require("../services/ledgerCache");

// async function getOrInitAccount(orgId, type, name, code, session) {
//   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
//   if (!account) {
//     account = await Account.create([{
//       organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0
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

// /*   1. CREATE PURCHASE*/
// exports.createPurchase = catchAsync(async (req, res, next) => {
//   const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
//   const items = parseItemsField(req.body.items);

//   if (!supplierId || items.length === 0) return next(new AppError("Supplier and items required.", 400));

//   await runInTransaction(async (session) => {
//     // File Uploads
//     const attachedFiles = [];
//     if (req.files && req.files.length > 0) {
//       for (const f of req.files) {
//         const url = await fileUploadService.uploadFile(f.buffer, "purchases");
//         attachedFiles.push(url);
//       }
//     }

//     const purchaseDocs = await Purchase.create([{
//       organizationId: req.user.organizationId, branchId: req.user.branchId, supplierId,
//       invoiceNumber, purchaseDate, dueDate, items, paidAmount: 0, paymentStatus: 'unpaid',
//       notes, status: status || "received", createdBy: req.user._id, attachedFiles
//     }], { session });
//     const purchase = purchaseDocs[0];
//     await invalidateOpeningBalance(req.user.organizationId);

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

//     // Accounting: Dr Inventory Asset, Cr Accounts Payable
//     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

//     // Dr Inventory
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//       date: purchase.purchaseDate, debit: purchase.grandTotal, credit: 0,
//       description: `Purchase Stock: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }], { session });

//     // Cr AP
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: supplierId,
//       date: purchase.purchaseDate, debit: 0, credit: purchase.grandTotal,
//       description: `Bill from Supplier: ${invoiceNumber}`, referenceType: 'purchase', referenceNumber: invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }], { session });

//   }, 3, { action: "CREATE_PURCHASE", userId: req.user._id });

//   res.status(201).json({ status: "success", message: "Purchase recorded" });
// });

// /*   2. UPDATE PURCHASE (Audit Fixed)*/
// exports.updatePurchase = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const updates = req.body;
//   let updatedPurchase;

//   // File Uploads
//   const newFiles = [];
//   if (req.files && req.files.length > 0) {
//     for (const f of req.files) {
//       const url = await fileUploadService.uploadFile(f.buffer, "purchases");
//       newFiles.push(url);
//     }
//   }

//   await runInTransaction(async (session) => {
//     const oldPurchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
//     if (!oldPurchase) throw new AppError('Purchase not found', 404);
//     if (oldPurchase.status === 'cancelled') throw new AppError('Cannot update cancelled purchase', 400);

//     // Append files
//     if (newFiles.length > 0) {
//       updates.attachedFiles = [...(oldPurchase.attachedFiles || []), ...newFiles];
//     }

//     const needsFinancialUpdate = updates.items || updates.tax || updates.discount;
//     if (!needsFinancialUpdate) {
//       updatedPurchase = await Purchase.findByIdAndUpdate(id, updates, { new: true, session });
//       return;
//     }

//     // 🛑 REVERSE OLD INVENTORY (Safe Logic)
//     for (const item of oldPurchase.items) {
//       const product = await Product.findById(item.productId).session(session);
//       const inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
//       if (inventory) {
//         // 🔴 SAFETY CHECK: Do not allow reversal if goods already sold
//         if (inventory.quantity < item.quantity) {
//           throw new AppError(`Cannot update Purchase: Items for ${product.name} are already sold/consumed. Current Stock: ${inventory.quantity}, Reversal Need: ${item.quantity}`, 400);
//         }
//         inventory.quantity -= item.quantity;
//         await product.save({ session });
//       }
//     }
//     // Reverse Supplier Debt & Ledger
//     await Supplier.findByIdAndUpdate(oldPurchase.supplierId, { $inc: { outstandingBalance: -oldPurchase.grandTotal } }, { session });
//     await AccountEntry.deleteMany({ referenceId: oldPurchase._id, referenceType: 'purchase' }, { session });

//     // APPLY NEW
//     const newItems = updates.items ? parseItemsField(updates.items) : oldPurchase.items;
//     for (const item of newItems) {
//       const product = await Product.findById(item.productId).session(session);
//       let inventory = product.inventory.find(inv => String(inv.branchId) === String(oldPurchase.branchId));
//       if (!inventory) {
//         product.inventory.push({ branchId: oldPurchase.branchId, quantity: 0 });
//         inventory = product.inventory[product.inventory.length - 1];
//       }
//       inventory.quantity += Number(item.quantity);
//       if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;
//       await product.save({ session });
//     }
//     updates.items = newItems;

//     Object.assign(oldPurchase, updates);
//     updatedPurchase = await oldPurchase.save({ session });

//     // RE-BOOK
//     await Supplier.findByIdAndUpdate(updatedPurchase.supplierId, { $inc: { outstandingBalance: updatedPurchase.grandTotal } }, { session });
//     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

//     await AccountEntry.create([{
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//       date: updatedPurchase.purchaseDate, debit: updatedPurchase.grandTotal, credit: 0,
//       description: `Purchase Stock: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
//     }, {
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: updatedPurchase.supplierId,
//       date: updatedPurchase.purchaseDate, debit: 0, credit: updatedPurchase.grandTotal,
//       description: `Bill from Supplier: ${updatedPurchase.invoiceNumber} (Updated)`, referenceType: 'purchase', referenceNumber: updatedPurchase.invoiceNumber, referenceId: updatedPurchase._id, createdBy: req.user._id
//     }], { session });

//   }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

//   res.status(200).json({ status: "success", data: { purchase: updatedPurchase } });
// });

// /*   3. CANCEL PURCHASE*/
// exports.cancelPurchase = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { reason } = req.body;

//   await runInTransaction(async (session) => {
//     const purchase = await Purchase.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
//     if (!purchase) throw new AppError("Purchase not found", 404);
//     if (purchase.status === 'cancelled') throw new AppError("Already cancelled", 400);

//     // Reverse Inventory
//     for (const item of purchase.items) {
//       const product = await Product.findById(item.productId).session(session);
//       const inventory = product.inventory.find(inv => String(inv.branchId) === String(purchase.branchId));
//       if (inventory) {
//         if (inventory.quantity < item.quantity) throw new AppError(`Cannot cancel: Stock for ${product.name} already sold.`, 400);
//         inventory.quantity -= item.quantity;
//         await product.save({ session });
//       }
//     }

//     await Supplier.findByIdAndUpdate(purchase.supplierId, { $inc: { outstandingBalance: -purchase.grandTotal } }, { session });
//     const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//     const apAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Accounts Payable', '2000', session);

//     // Dr AP, Cr Inventory
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: apAccount._id, supplierId: purchase.supplierId,
//       date: new Date(), debit: purchase.grandTotal, credit: 0, description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }, {
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//       date: new Date(), debit: 0, credit: purchase.grandTotal, description: `Return: ${purchase.invoiceNumber}`, referenceType: 'purchase_return', referenceNumber: purchase.invoiceNumber, referenceId: purchase._id, createdBy: req.user._id
//     }], { session });

//     purchase.status = 'cancelled';
//     purchase.notes = (purchase.notes || "") + `\nCancelled: ${reason}`;
//     await purchase.save({ session });
//   }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });
//   res.status(200).json({ status: "success", message: "Purchase cancelled." });
// });

// /*   4. DELETE ATTACHMENT & UTILS*/
// exports.deleteAttachment = catchAsync(async (req, res, next) => {
//   const { id, fileIndex } = req.params;
//   const purchase = await Purchase.findById(id);
//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   const url = purchase.attachedFiles[fileIndex];
//   if (!url) return next(new AppError("File not found", 404));

//   const publicId = url.split("/").pop().split(".")[0];
//   try { await cloudinary.uploader.destroy(`purchases/${publicId}`); } catch (err) { }

//   purchase.attachedFiles.splice(fileIndex, 1);
//   await purchase.save();
//   res.status(200).json({ status: "success", message: "Attachment removed.", data: { attachedFiles: purchase.attachedFiles } });
// });

// exports.deletePurchase = catchAsync(async (req, res, next) => {
//   return next(new AppError("SECURITY ALERT: Cannot delete purchase. Use 'Cancel / Return' instead.", 403));
// });
// exports.getAllPurchases = factory.getAll(Purchase, {
//   searchFields: [
//     'invoiceNumber',
//     'status',
//     'paymentStatus',
//     'paymentMethod',
//     'notes',
//     'items.name'
//   ],
//   populate: [
//     {
//       path: 'supplierId',
//       select: `
//         companyName
//         contactPerson
//         email
//         phone
//         altPhone
//         openingBalance
//         outstandingBalance
//       `
//     },
//     {
//       path: 'branchId',
//       select: 'name'
//     }
//   ]
// });

// exports.getPurchase = factory.getOne(Purchase, [{ path: "items.productId" }]);
