const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Product = require('../models/productModel');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const factory = require('../utils/handlerFactory');
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { uploadMultipleImages } = require("../services/uploads");
const imageUploadService = require("../services/uploads/imageUploadService");

/* --- HELPER: Ensure Account Exists --- */
async function getOrInitAccount(orgId, type, name, code, session) {
  let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!account) {
    account = await Account.create([{
      organizationId: orgId, name, code, type, isGroup: false, balance: 0
    }], { session });
    return account[0];
  }
  return account;
}

const slugify = (value) => value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ==========================================================
   1. CREATE PRODUCT (Handles Opening Stock Valuation)
========================================================== */
exports.createProduct = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user._id;

    // Handle Initial Quantity
    if (req.body.quantity && (!req.body.inventory || req.body.inventory.length === 0)) {
      req.body.inventory = [{
        branchId: req.user.branchId,
        quantity: Number(req.body.quantity),
        reorderLevel: req.body.reorderLevel || 10
      }];
    }

    const productArr = await Product.create([req.body], { session });
    const product = productArr[0];

    // ACCOUNTING: BOOK OPENING STOCK
    let totalStockValue = 0;
    if (product.inventory && product.inventory.length > 0) {
      const totalQty = product.inventory.reduce((acc, inv) => acc + (inv.quantity || 0), 0);
      totalStockValue = totalQty * (product.purchasePrice || 0);
    }

    if (totalStockValue > 0) {
      const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
      const equityAcc = await getOrInitAccount(req.user.organizationId, 'equity', 'Opening Balance Equity', '3000', session);

      // Dr Inventory Asset
      await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
        date: new Date(), debit: totalStockValue, credit: 0,
        description: `Opening Stock: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
      }], { session });

      // Cr Equity
      await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: equityAcc._id,
        date: new Date(), debit: 0, credit: totalStockValue,
        description: `Opening Stock Equity: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
      }], { session });
    }

    await session.commitTransaction();
    res.status(201).json({ status: 'success', data: { product } });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ==========================================================
   2. UPDATE PRODUCT (Locked)
========================================================== */
exports.updateProduct = catchAsync(async (req, res, next) => {
  if (req.body.quantity || req.body.inventory) {
      return next(new AppError("Cannot change Stock via Edit. Use 'Purchase' or 'Stock Adjustment'.", 400));
  }
  if (req.body.purchasePrice) {
      return next(new AppError("Cannot change Cost Price here. Create a new Purchase to update costs.", 400));
  }

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!product) return next(new AppError("Product not found", 404));
  res.status(200).json({ status: "success", data: { product } });
});

/* ==========================================================
   3. STOCK ADJUSTMENT (Gain/Loss Handling)
========================================================== */
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { type, quantity, reason, branchId } = req.body;
  if (!['add','subtract'].includes(type)) return next(new AppError("Invalid type", 400));
  if (quantity <= 0) return next(new AppError("Invalid quantity", 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
    if (!product) throw new AppError("Product not found", 404);

    const targetBranchId = branchId || req.user.branchId;
    let inventory = product.inventory.find(i => i.branchId.toString() === targetBranchId.toString());
    
    if (!inventory) {
        product.inventory.push({ branchId: targetBranchId, quantity: 0 });
        inventory = product.inventory[product.inventory.length - 1];
    }

    const oldStock = inventory.quantity;
    if (type === 'subtract' && oldStock < quantity) throw new AppError(`Insufficient stock. Current: ${oldStock}`, 400);

    inventory.quantity = type === 'add' ? oldStock + quantity : oldStock - quantity;
    await product.save({ session });

    // FINANCIAL IMPACT
    const costValue = quantity * (product.purchasePrice || 0);

    if (costValue > 0) {
      const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);

      if (type === 'subtract') {
         const shrinkageAcc = await getOrInitAccount(req.user.organizationId, 'expense', 'Inventory Shrinkage', '5100', session);
         await AccountEntry.create([{
             organizationId: req.user.organizationId, branchId: targetBranchId, accountId: shrinkageAcc._id, date: new Date(), debit: costValue, credit: 0, description: `Stock Loss: ${reason}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
         }, {
             organizationId: req.user.organizationId, branchId: targetBranchId, accountId: inventoryAcc._id, date: new Date(), debit: 0, credit: costValue, description: `Stock Reduction: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
         }], { session });
      } else {
         const gainAcc = await getOrInitAccount(req.user.organizationId, 'income', 'Inventory Gain', '4900', session);
         await AccountEntry.create([{
             organizationId: req.user.organizationId, branchId: targetBranchId, accountId: inventoryAcc._id, date: new Date(), debit: costValue, credit: 0, description: `Stock Increase: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
         }, {
             organizationId: req.user.organizationId, branchId: targetBranchId, accountId: gainAcc._id, date: new Date(), debit: 0, credit: costValue, description: `Stock Gain: ${reason}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
         }], { session });
      }
    }

    await session.commitTransaction();
    res.status(200).json({ status: "success", data: { product } });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ==========================================================
   4. DELETE PRODUCT (Safeguarded)
========================================================== */
exports.deleteProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!product) return next(new AppError("Product not found", 404));

  const totalStock = product.inventory.reduce((acc, item) => acc + item.quantity, 0);
  if (totalStock > 0) {
      return next(new AppError(`CANNOT DELETE: This product has ${totalStock} items in stock. Write off stock first.`, 400));
  }

  product.isDeleted = true;
  product.isActive = false;
  await product.save();
  res.status(200).json({ status: "success", message: "Product deleted." });
});

/* ==========================================================
   5. STANDARD UTILITIES (Search, Restore, Import, Images)
========================================================== */

// SEARCH
exports.searchProducts = catchAsync(async (req, res, next) => {
  const q = req.query.q?.trim() || "";
  const orgId = req.user.organizationId;
  const products = await Product.find({
    organizationId: orgId,
    $or: [
      { name: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
      { barcode: { $regex: q, $options: "i" } },
    ],
  }).limit(20);
  res.status(200).json({ status: "success", results: products.length, data: { products } });
});

// BULK IMPORT
exports.bulkImportProducts = catchAsync(async (req, res, next) => {
  const products = req.body;
  if (!Array.isArray(products) || products.length === 0) return next(new AppError("Provide an array of products.", 400));

  const orgId = req.user.organizationId;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const mapped = products.map((p) => {
      const baseSlug = slugify(p.name);
      return {
        ...p,
        organizationId: orgId,
        slug: `${baseSlug}-${nanoid(6)}`,
        sku: p.sku?.trim() || null,
        inventory: p.inventory || (p.quantity ? [{ branchId: req.user.branchId, quantity: p.quantity }] : [])
      };
    });

    const createdProducts = await Product.insertMany(mapped, { session });

    // Accounting for Bulk Import
    let totalImportValue = 0;
    createdProducts.forEach(p => {
      const qty = p.inventory?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0;
      totalImportValue += qty * (p.purchasePrice || 0);
    });

    if (totalImportValue > 0) {
      const inventoryAcc = await getOrInitAccount(orgId, 'asset', 'Inventory Asset', '1500', session);
      const equityAcc = await getOrInitAccount(orgId, 'equity', 'Opening Balance Equity', '3000', session);

      await AccountEntry.create([{
        organizationId: orgId, branchId: req.user.branchId, accountId: inventoryAcc._id,
        date: new Date(), debit: totalImportValue, credit: 0, description: `Bulk Import Stock`, referenceType: 'manual', createdBy: req.user._id
      }, {
        organizationId: orgId, branchId: req.user.branchId, accountId: equityAcc._id,
        date: new Date(), debit: 0, credit: totalImportValue, description: `Bulk Import Equity`, referenceType: 'manual', createdBy: req.user._id
      }], { session });
    }

    await session.commitTransaction();
    res.status(201).json({ status: "success", message: "Bulk product import completed" });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// BULK UPDATE
exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
  const updates = req.body; 
  if (!Array.isArray(updates) || updates.length === 0) return next(new AppError("Provide updates array", 400));
  const org = req.user.organizationId;
  const ops = updates.map(u => ({
    updateOne: { filter: { _id: u._id, organizationId: org }, update: u.update }
  }));
  await Product.bulkWrite(ops);
  res.status(200).json({ status: "success", message: "Bulk update applied." });
});

// UPLOAD IMAGES
exports.uploadProductImage = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next(new AppError("Please upload at least one image.", 400));
  const folder = `products/${req.user.organizationId}`;
  const uploadPromises = req.files.map(file => imageUploadService.uploadImage(file.buffer, folder));
  const uploadResults = await Promise.all(uploadPromises);
  const imageUrls = uploadResults.map(result => result.url);
  
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $push: { images: { $each: imageUrls, $position: 0 } } },
    { new: true }
  );
  if (!product) return next(new AppError("Product not found", 404));
  res.status(200).json({ status: "success", data: { product } });
});

// RESTORE
exports.restoreProduct = factory.restoreOne(Product);
exports.getAllProducts = factory.getAll(Product);
exports.getProduct = factory.getOne(Product, [{ path: 'inventory.branchId', select: 'name' }, { path: 'defaultSupplierId', select: 'companyName' }]);

// const mongoose = require('mongoose');
// const Product = require('../models/productModel');
// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');
// const factory = require('../utils/handlerFactory');
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const { uploadMultipleImages } = require("../services/uploads");

// /* --- HELPER: Ensure Account Exists --- */
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

// /* ==========================================================
//    1. CREATE PRODUCT (Handles Opening Stock Valuation)
// ========================================================== */
// exports.createProduct = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     req.body.organizationId = req.user.organizationId;
//     req.body.createdBy = req.user._id;

//     // Handle Initial Quantity logic
//     if (req.body.quantity && (!req.body.inventory || req.body.inventory.length === 0)) {
//       req.body.inventory = [{
//         branchId: req.user.branchId,
//         quantity: Number(req.body.quantity),
//         reorderLevel: req.body.reorderLevel || 10
//       }];
//     }

//     const productArr = await Product.create([req.body], { session });
//     const product = productArr[0];

//     // ACCOUNTING: BOOK OPENING STOCK (Equity Injection)
//     let totalStockValue = 0;
//     if (product.inventory && product.inventory.length > 0) {
//       const totalQty = product.inventory.reduce((acc, inv) => acc + (inv.quantity || 0), 0);
//       totalStockValue = totalQty * (product.purchasePrice || 0);
//     }

//     if (totalStockValue > 0) {
//       const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//       const equityAcc = await getOrInitAccount(req.user.organizationId, 'equity', 'Opening Balance Equity', '3000', session);

//       // Dr Inventory Asset (Asset increases)
//       await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//         date: new Date(), debit: totalStockValue, credit: 0,
//         description: `Opening Stock: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//       }], { session });

//       // Cr Equity (Owner's Capital increases)
//       await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: equityAcc._id,
//         date: new Date(), debit: 0, credit: totalStockValue,
//         description: `Opening Stock Equity: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//       }], { session });
//     }

//     await session.commitTransaction();
//     res.status(201).json({ status: 'success', data: { product } });

//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* ==========================================================
//    2. UPDATE PRODUCT (Locked)
//    ----------------------------------------------------------
//    Blocks changing Stock/Cost via Edit to preserve Accounting.
// ========================================================== */
// exports.updateProduct = catchAsync(async (req, res, next) => {
//   // 🛑 BLOCK DANGEROUS FIELDS
//   if (req.body.quantity || req.body.inventory) {
//       return next(new AppError("Cannot change Stock via Edit. Use 'Purchase' or 'Stock Adjustment'.", 400));
//   }
//   if (req.body.purchasePrice) {
//       return next(new AppError("Cannot change Cost Price here. Create a new Purchase to update costs.", 400));
//   }

//   const product = await Product.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     req.body,
//     { new: true, runValidators: true }
//   );

//   if (!product) return next(new AppError("Product not found", 404));

//   res.status(200).json({ status: "success", data: { product } });
// });

// /* ==========================================================
//    3. STOCK ADJUSTMENT (Gain/Loss Handling)
// ========================================================== */
// exports.adjustStock = catchAsync(async (req, res, next) => {
//   const { type, quantity, reason, branchId } = req.body;
//   if (!['add','subtract'].includes(type)) return next(new AppError("Invalid type", 400));
//   if (quantity <= 0) return next(new AppError("Invalid quantity", 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
//     if (!product) throw new AppError("Product not found", 404);

//     const targetBranchId = branchId || req.user.branchId;
//     let inventory = product.inventory.find(i => i.branchId.toString() === targetBranchId.toString());
    
//     if (!inventory) {
//         product.inventory.push({ branchId: targetBranchId, quantity: 0 });
//         inventory = product.inventory[product.inventory.length - 1];
//     }

//     const oldStock = inventory.quantity;
//     if (type === 'subtract' && oldStock < quantity) throw new AppError(`Insufficient stock. Current: ${oldStock}`, 400);

//     inventory.quantity = type === 'add' ? oldStock + quantity : oldStock - quantity;
//     await product.save({ session });

//     // FINANCIAL IMPACT
//     const costValue = quantity * (product.purchasePrice || 0);

//     if (costValue > 0) {
//       const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);

//       if (type === 'subtract') {
//          // Loss (Shrinkage)
//          const shrinkageAcc = await getOrInitAccount(req.user.organizationId, 'expense', 'Inventory Shrinkage', '5100', session);
//          await AccountEntry.create([{
//              organizationId: req.user.organizationId, branchId: targetBranchId, accountId: shrinkageAcc._id, date: new Date(), debit: costValue, credit: 0, description: `Stock Loss: ${reason}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//          }, {
//              organizationId: req.user.organizationId, branchId: targetBranchId, accountId: inventoryAcc._id, date: new Date(), debit: 0, credit: costValue, description: `Stock Reduction: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//          }], { session });

//       } else {
//          // Gain (Found Stock)
//          const gainAcc = await getOrInitAccount(req.user.organizationId, 'income', 'Inventory Gain', '4900', session);
//          await AccountEntry.create([{
//              organizationId: req.user.organizationId, branchId: targetBranchId, accountId: inventoryAcc._id, date: new Date(), debit: costValue, credit: 0, description: `Stock Increase: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//          }, {
//              organizationId: req.user.organizationId, branchId: targetBranchId, accountId: gainAcc._id, date: new Date(), debit: 0, credit: costValue, description: `Stock Gain: ${reason}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//          }], { session });
//       }
//     }

//     await session.commitTransaction();
//     res.status(200).json({ status: "success", data: { product } });
//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* ==========================================================
//    4. DELETE PRODUCT (Safeguarded)
// ========================================================== */
// exports.deleteProduct = catchAsync(async (req, res, next) => {
//   const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!product) return next(new AppError("Product not found", 404));

//   // Check if stock exists
//   const totalStock = product.inventory.reduce((acc, item) => acc + item.quantity, 0);
//   if (totalStock > 0) {
//       return next(new AppError(
//           `CANNOT DELETE: This product has ${totalStock} items in stock. \n` +
//           "-> You must write off the stock using 'Stock Adjustment' first.",
//           400
//       ));
//   }

//   product.isDeleted = true;
//   product.isActive = false;
//   await product.save();

//   res.status(200).json({ status: "success", message: "Product deleted." });
// });

// // Standard Exports
// exports.getAllProducts = factory.getAll(Product);
// exports.getProduct = factory.getOne(Product);
// exports.bulkImportProducts = catchAsync(async(req,res)=>res.json({status:'success'})); // Add full logic if needed
// exports.uploadProductImage = catchAsync(async(req,res)=>res.json({status:'success'})); // Add full logic if needed

// // ----------------------------------------------------------------------------------------------------------------------------------------
// // const mongoose = require('mongoose');
// // const { nanoid } = require('nanoid');
// // const Product = require('../models/productModel');
// // const AccountEntry = require('../models/accountEntryModel'); // ✅ Financial Records
// // const Account = require('../models/accountModel'); // ✅ Chart of Accounts
// // const factory = require('../utils/handlerFactory');
// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const imageUploadService = require("../services/uploads/imageUploadService");
// // const { uploadMultipleImages } = require("../services/uploads");

// // /* ==========================================================
// //    HELPERS
// // ========================================================== */
// // const slugify = (value) => {
// //   return value
// //     .toString()
// //     .trim()
// //     .toLowerCase()
// //     .replace(/[^a-z0-9]+/g, "-")
// //     .replace(/^-+|-+$/g, "");
// // };

// // /* ==========================================================
// //    1. CREATE PRODUCT (With Opening Stock Accounting)
// //    ----------------------------------------------------------
// //    Replaces generic factory.createOne to handle Asset Valuation
// // ========================================================== */
// // exports.createProduct = catchAsync(async (req, res, next) => {
// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     // 1. Prepare Data
// //     req.body.organizationId = req.user.organizationId;
// //     req.body.createdBy = req.user._id;

// //     // Handle simple "quantity" input by converting to inventory array structure
// //     if (req.body.quantity && (!req.body.inventory || req.body.inventory.length === 0)) {
// //       req.body.inventory = [{
// //         branchId: req.user.branchId,
// //         quantity: Number(req.body.quantity),
// //         reorderLevel: req.body.reorderLevel || 10
// //       }];
// //     }

// //     // 2. Create Product
// //     const productArr = await Product.create([req.body], { session });
// //     const product = productArr[0];

// //     // 3. Calculate Opening Stock Value
// //     let totalStockValue = 0;
// //     if (product.inventory && product.inventory.length > 0) {
// //       const totalQty = product.inventory.reduce((acc, inv) => acc + (inv.quantity || 0), 0);
// //       // Asset Value = Quantity * Purchase Price
// //       totalStockValue = totalQty * (product.purchasePrice || 0);
// //     }

// //     // 4. Create Accounting Entries (If value > 0)
// //     if (totalStockValue > 0) {
// //       const orgId = req.user.organizationId;
      
// //       // Find Accounts
// //       const inventoryAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Asset' }).session(session);
// //       // Use 'Opening Balance Equity' or fallback to 'Inventory Gain'
// //       let equityAcc = await Account.findOne({ organizationId: orgId, name: 'Opening Balance Equity' }).session(session);
// //       if (!equityAcc) equityAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Gain' }).session(session);

// //       if (inventoryAcc && equityAcc) {
// //         // DEBIT: Inventory Asset (Increase Asset)
// //         await AccountEntry.create([{
// //           organizationId: orgId,
// //           branchId: req.user.branchId,
// //           accountId: inventoryAcc._id,
// //           date: new Date(),
// //           debit: totalStockValue,
// //           credit: 0,
// //           description: `Opening Stock: ${product.name}`,
// //           referenceType: 'manual',
// //           referenceId: product._id,
// //           referenceNumber: product.sku || 'OPENING-STOCK',
// //           createdBy: req.user._id
// //         }], { session });

// //         // CREDIT: Equity (Source of Capital)
// //         await AccountEntry.create([{
// //           organizationId: orgId,
// //           branchId: req.user.branchId,
// //           accountId: equityAcc._id,
// //           date: new Date(),
// //           debit: 0,
// //           credit: totalStockValue,
// //           description: `Opening Stock Equity: ${product.name}`,
// //           referenceType: 'manual',
// //           referenceId: product._id,
// //           referenceNumber: product.sku || 'OPENING-STOCK',
// //           createdBy: req.user._id
// //         }], { session });
// //       } else {
// //         console.warn('⚠️ Skipped Opening Stock Journal: "Inventory Asset" or "Equity" account missing.');
// //       }
// //     }

// //     await session.commitTransaction();
// //     res.status(201).json({ status: 'success', data: { product } });

// //   } catch (err) {
// //     await session.abortTransaction();
// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });

// // /* ==========================================================
// //    2. BULK IMPORT (With Accounting)
// // ========================================================== */
// // exports.bulkImportProducts = catchAsync(async (req, res, next) => {
// //   const products = req.body;
// //   if (!Array.isArray(products) || products.length === 0)
// //     return next(new AppError("Provide an array of products.", 400));

// //   const orgId = req.user.organizationId;
// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     // 1. Map Data & Generate Slugs
// //     const mapped = products.map((p) => {
// //       const baseSlug = slugify(p.name);
// //       return {
// //         ...p,
// //         organizationId: orgId,
// //         slug: `${baseSlug}-${nanoid(6)}`,
// //         sku: p.sku?.trim() || null,
// //         // Ensure inventory structure
// //         inventory: p.inventory || (p.quantity ? [{ branchId: req.user.branchId, quantity: p.quantity }] : [])
// //       };
// //     });

// //     // 2. Insert Products
// //     const createdProducts = await Product.insertMany(mapped, { session });

// //     // 3. Calculate Total Import Value
// //     let totalImportValue = 0;
// //     createdProducts.forEach(p => {
// //       const qty = p.inventory?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0;
// //       const val = qty * (p.purchasePrice || 0);
// //       totalImportValue += val;
// //     });

// //     // 4. Post Single Journal Entry for Bulk Import
// //     if (totalImportValue > 0) {
// //       const inventoryAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Asset' }).session(session);
// //       let equityAcc = await Account.findOne({ organizationId: orgId, name: 'Opening Balance Equity' }).session(session);
// //       if (!equityAcc) equityAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Gain' }).session(session);

// //       if (inventoryAcc && equityAcc) {
// //         // Debit Inventory
// //         await AccountEntry.create([{
// //           organizationId: orgId,
// //           branchId: req.user.branchId,
// //           accountId: inventoryAcc._id,
// //           date: new Date(),
// //           debit: totalImportValue,
// //           credit: 0,
// //           description: `Bulk Import Stock (${createdProducts.length} items)`,
// //           referenceType: 'manual',
// //           createdBy: req.user._id
// //         }], { session });

// //         // Credit Equity
// //         await AccountEntry.create([{
// //           organizationId: orgId,
// //           branchId: req.user.branchId,
// //           accountId: equityAcc._id,
// //           date: new Date(),
// //           debit: 0,
// //           credit: totalImportValue,
// //           description: `Bulk Import Equity`,
// //           referenceType: 'manual',
// //           createdBy: req.user._id
// //         }], { session });
// //       }
// //     }

// //     await session.commitTransaction();
// //     res.status(201).json({ status: "success", message: "Bulk product import completed" });

// //   } catch (err) {
// //     await session.abortTransaction();
// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });

// // /* ==========================================================
// //    3. STOCK ADJUSTMENT (Gain/Loss Recording)
// // ========================================================== */
// // exports.adjustStock = catchAsync(async (req, res, next) => {
// //   const { type, quantity, reason, branchId } = req.body;
  
// //   if (!['add','subtract'].includes(type)) return next(new AppError("Invalid type", 400));
// //   if (typeof quantity !== 'number' || quantity <= 0) return next(new AppError("Invalid quantity", 400));

// //   const session = await mongoose.startSession();
// //   session.startTransaction();

// //   try {
// //     const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
// //     if (!product) throw new AppError("Product not found", 404);

// //     const targetBranchId = branchId || req.user.branchId;
// //     let inventory = product.inventory.find(i => i.branchId.toString() === targetBranchId.toString());
    
// //     if (!inventory) {
// //       product.inventory.push({ branchId: targetBranchId, quantity: 0 });
// //       inventory = product.inventory[product.inventory.length - 1];
// //     }

// //     // 1. Update Stock Quantity
// //     const oldStock = inventory.quantity;
// //     inventory.quantity = type === 'add' ? oldStock + quantity : oldStock - quantity;
// //     if (inventory.quantity < 0) inventory.quantity = 0; // Prevent negative stock
    
// //     await product.save({ session });

// //     // 2. Financial Entry (Cost Value)
// //     const costValue = quantity * (product.purchasePrice || 0);

// //     if (costValue > 0) {
// //       const inventoryAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Asset' }).session(session);
// //       const shrinkageAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Shrinkage' }).session(session) 
// //                         || await Account.findOne({ organizationId: req.user.organizationId, code: '5100' }).session(session); // COGS fallback
// //       const gainAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Gain' }).session(session);

// //       if (inventoryAcc) {
// //         if (type === 'subtract' && shrinkageAcc) {
// //           // LOSS: Debit Expense, Credit Asset
// //           await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: targetBranchId,
// //             accountId: shrinkageAcc._id, date: new Date(),
// //             debit: costValue, credit: 0,
// //             description: `Stock Loss: ${product.name} (${reason || 'Manual'})`,
// //             referenceType: 'manual', referenceId: product._id,
// //             createdBy: req.user._id
// //           }, {
// //             organizationId: req.user.organizationId, branchId: targetBranchId,
// //             accountId: inventoryAcc._id, date: new Date(),
// //             debit: 0, credit: costValue,
// //             description: `Stock Reduction: ${product.name}`,
// //             referenceType: 'manual', referenceId: product._id,
// //             createdBy: req.user._id
// //           }], { session });
// //         } else if (type === 'add' && gainAcc) {
// //           // GAIN: Debit Asset, Credit Income
// //           await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: targetBranchId,
// //             accountId: inventoryAcc._id, date: new Date(),
// //             debit: costValue, credit: 0,
// //             description: `Stock Increase: ${product.name}`,
// //             referenceType: 'manual', referenceId: product._id,
// //             createdBy: req.user._id
// //           }, {
// //             organizationId: req.user.organizationId, branchId: targetBranchId,
// //             accountId: gainAcc._id, date: new Date(),
// //             debit: 0, credit: costValue,
// //             description: `Stock Gain: ${product.name} (${reason || 'Manual'})`,
// //             referenceType: 'manual', referenceId: product._id,
// //             createdBy: req.user._id
// //           }], { session });
// //         }
// //       }
// //     }

// //     await session.commitTransaction();
// //     res.status(200).json({ status: "success", data: { product } });

// //   } catch (err) {
// //     await session.abortTransaction();
// //     next(err);
// //   } finally {
// //     session.endSession();
// //   }
// // });

// // /* ==========================================================
// //    4. STANDARD CRUD & UTILS (Factory + Custom)
// // ========================================================== */

// // // READ
// // exports.getAllProducts = factory.getAll(Product);
// // exports.getProduct = factory.getOne(Product, [
// //   { path: 'inventory.branchId', select: 'name' },
// //   { path: 'defaultSupplierId', select: 'companyName' }
// // ]);

// // // SEARCH
// // exports.searchProducts = catchAsync(async (req, res, next) => {
// //   const q = req.query.q?.trim() || "";
// //   const orgId = req.user.organizationId;
// //   const products = await Product.find({
// //     organizationId: orgId,
// //     $or: [
// //       { name: { $regex: q, $options: "i" } },
// //       { sku: { $regex: q, $options: "i" } },
// //       { barcode: { $regex: q, $options: "i" } },
// //     ],
// //   }).limit(20);
// //   res.status(200).json({ status: "success", results: products.length, data: { products } });
// // });

// // // UPDATE
// // exports.updateProduct = factory.updateOne(Product); // Note: Simple updates don't trigger accounting unless you add logic here

// // exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
// //   const updates = req.body; 
// //   if (!Array.isArray(updates) || updates.length === 0) return next(new AppError("Provide updates array", 400));
// //   const org = req.user.organizationId;
// //   const ops = updates.map(u => ({
// //     updateOne: { filter: { _id: u._id, organizationId: org }, update: u.update }
// //   }));
// //   await Product.bulkWrite(ops);
// //   res.status(200).json({ status: "success", message: "Bulk update applied." });
// // });

// // // DELETE / RESTORE
// // exports.deleteProduct = factory.deleteOne(Product);
// // exports.restoreProduct = factory.restoreOne(Product);

// // // IMAGES
// // exports.uploadProductImages = catchAsync(async (req, res, next) => {
// //   if (!req.files || !req.files.length) return next(new AppError("Please upload product images", 400));
// //   const buffers = req.files.map((f) => f.buffer);
// //   const uploadResults = await uploadMultipleImages(buffers, "products");
// //   res.status(200).json({ status: "success", data: { uploaded: uploadResults } });
// // });

// // exports.uploadProductImage = catchAsync(async (req, res, next) => {
// //   if (!req.files || req.files.length === 0) return next(new AppError("Please upload at least one image.", 400));
// //   const folder = `products/${req.user.organizationId}`;
// //   const uploadPromises = req.files.map(file => imageUploadService.uploadImage(file.buffer, folder));
// //   const uploadResults = await Promise.all(uploadPromises);
// //   const imageUrls = uploadResults.map(result => result.url);
  
// //   const product = await Product.findOneAndUpdate(
// //     { _id: req.params.id, organizationId: req.user.organizationId },
// //     { $push: { images: { $each: imageUrls, $position: 0 } } },
// //     { new: true }
// //   );
// //   if (!product) return next(new AppError("Product not found", 404));
  
// //   res.status(200).json({ status: "success", message: `${imageUrls.length} image(s) uploaded`, data: { product } });
// // });

