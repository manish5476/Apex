const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Product = require('../models/productModel');
const AccountEntry = require('../models/accountEntryModel'); 
const Account = require('../models/accountModel'); 
const factory = require('../utils/handlerFactory');
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const imageUploadService = require("../services/uploads/imageUploadService");
const { uploadMultipleImages } = require("../services/uploads");

// Helper
const slugify = (val) => val.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

exports.createProduct = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user._id;
    if (req.body.quantity && (!req.body.inventory || req.body.inventory.length === 0)) {
      req.body.inventory = [{ branchId: req.user.branchId, quantity: Number(req.body.quantity), reorderLevel: 10 }];
    }

    const productArr = await Product.create([req.body], { session });
    const product = productArr[0];

    // Opening Stock Accounting
    let totalStockValue = 0;
    if (product.inventory) totalStockValue = product.inventory.reduce((acc, i) => acc + (i.quantity * (product.purchasePrice || 0)), 0);

    if (totalStockValue > 0) {
      const inventoryAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Asset' }).session(session);
      const equityAcc = await Account.findOne({ organizationId: req.user.organizationId, $or: [{name: 'Opening Balance Equity'}, {name: 'Inventory Gain'}] }).session(session);
      
      if (!inventoryAcc || !equityAcc) throw new AppError('Critical: Missing Inventory or Equity accounts for opening stock.', 500);

      await AccountEntry.create([{
          organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
          date: new Date(), debit: totalStockValue, credit: 0, description: `Opening Stock: ${product.name}`,
          referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
      }, {
          organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: equityAcc._id,
          date: new Date(), debit: 0, credit: totalStockValue, description: `Opening Stock Equity: ${product.name}`,
          referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
      }], { session });
    }
    await session.commitTransaction();
    res.status(201).json({ status: 'success', data: { product } });
  } catch (err) { await session.abortTransaction(); next(err); } finally { session.endSession(); }
});

// 🔒 SECURE UPDATE (Blocks direct stock manipulation)
exports.updateProduct = catchAsync(async (req, res, next) => {
    if (req.body.inventory || req.body.quantity || req.body.stock) {
        return next(new AppError('Direct inventory updates forbidden. Use Adjust Stock or Purchase/Sales.', 400));
    }
    const product = await Product.findOneAndUpdate({ _id: req.params.id, organizationId: req.user.organizationId }, req.body, { new: true, runValidators: true });
    if (!product) return next(new AppError('No product found', 404));
    res.status(200).json({ status: 'success', data: { product } });
});

// Stock Adjustment (Gain/Loss)
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { type, quantity, reason, branchId } = req.body;
  if (!['add','subtract'].includes(type) || quantity <= 0) return next(new AppError("Invalid adjustment", 400));

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
    if (!product) throw new AppError("Product not found", 404);

    const bId = branchId || req.user.branchId;
    let inv = product.inventory.find(i => i.branchId.toString() === bId.toString());
    if (!inv) { product.inventory.push({ branchId: bId, quantity: 0 }); inv = product.inventory[product.inventory.length-1]; }

    inv.quantity = type === 'add' ? inv.quantity + quantity : inv.quantity - quantity;
    if (inv.quantity < 0) inv.quantity = 0;
    await product.save({ session });

    // Accounting
    const value = quantity * (product.purchasePrice || 0);
    if (value > 0) {
       const invAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Asset' }).session(session);
       const targetAcc = type === 'add' 
          ? await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Gain' }).session(session)
          : await Account.findOne({ organizationId: req.user.organizationId, $or:[{name: 'Inventory Shrinkage'}, {code:'5100'}] }).session(session);
       
       if (!invAcc || !targetAcc) throw new AppError('Critical: Missing Adjustment Accounts', 500);

       const dr = type === 'add' ? invAcc : targetAcc;
       const cr = type === 'add' ? targetAcc : invAcc;

       await AccountEntry.create([{
           organizationId: req.user.organizationId, branchId: bId, accountId: dr._id,
           date: new Date(), debit: value, credit: 0, description: `Stock Adj (${type}): ${product.name}`,
           referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
       }, {
           organizationId: req.user.organizationId, branchId: bId, accountId: cr._id,
           date: new Date(), debit: 0, credit: value, description: `Stock Adj (${type}): ${product.name}`,
           referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
       }], { session });
    }
    await session.commitTransaction();
    res.status(200).json({ status: "success", data: { product } });
  } catch (err) { await session.abortTransaction(); next(err); } finally { session.endSession(); }
});

exports.getAllProducts = factory.getAll(Product);
exports.getProduct = factory.getOne(Product);
exports.deleteProduct = factory.deleteOne(Product);
exports.uploadProductImages = catchAsync(async (req, res, next) => { /* ... (Keep existing image logic) ... */ });
// const mongoose = require('mongoose');
// const { nanoid } = require('nanoid');
// const Product = require('../models/productModel');
// const AccountEntry = require('../models/accountEntryModel'); 
// const Account = require('../models/accountModel'); 
// const factory = require('../utils/handlerFactory');
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const imageUploadService = require("../services/uploads/imageUploadService");
// const { uploadMultipleImages } = require("../services/uploads");

// /* ==========================================================
//    HELPERS
// ========================================================== */
// const slugify = (value) => {
//   return value
//     .toString()
//     .trim()
//     .toLowerCase()
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/^-+|-+$/g, "");
// };

// /* ==========================================================
//    1. CREATE PRODUCT (With Opening Stock Accounting)
//    ----------------------------------------------------------
//    Replaces generic factory.createOne to handle Asset Valuation
// ========================================================== */
// exports.createProduct = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Prepare Data
//     req.body.organizationId = req.user.organizationId;
//     req.body.createdBy = req.user._id;

//     // Handle simple "quantity" input by converting to inventory array structure
//     if (req.body.quantity && (!req.body.inventory || req.body.inventory.length === 0)) {
//       req.body.inventory = [{
//         branchId: req.user.branchId,
//         quantity: Number(req.body.quantity),
//         reorderLevel: req.body.reorderLevel || 10
//       }];
//     }

//     // 2. Create Product
//     const productArr = await Product.create([req.body], { session });
//     const product = productArr[0];

//     // 3. Calculate Opening Stock Value
//     let totalStockValue = 0;
//     if (product.inventory && product.inventory.length > 0) {
//       const totalQty = product.inventory.reduce((acc, inv) => acc + (inv.quantity || 0), 0);
//       // Asset Value = Quantity * Purchase Price
//       totalStockValue = totalQty * (product.purchasePrice || 0);
//     }

//     // 4. Create Accounting Entries (If value > 0)
//     if (totalStockValue > 0) {
//       const orgId = req.user.organizationId;
      
//       // Find Accounts
//       const inventoryAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Asset' }).session(session);
//       // Use 'Opening Balance Equity' or fallback to 'Inventory Gain'
//       let equityAcc = await Account.findOne({ organizationId: orgId, name: 'Opening Balance Equity' }).session(session);
//       if (!equityAcc) equityAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Gain' }).session(session);

//       // 🚨 FIX: FAIL IF ACCOUNTS MISSING
//       if (!inventoryAcc || !equityAcc) {
//          throw new AppError('Critical: Missing "Inventory Asset" or "Opening Balance Equity" account. Cannot record opening stock.', 500);
//       }

//       // DEBIT: Inventory Asset (Increase Asset)
//       await AccountEntry.create([{
//           organizationId: orgId,
//           branchId: req.user.branchId,
//           accountId: inventoryAcc._id,
//           date: new Date(),
//           debit: totalStockValue,
//           credit: 0,
//           description: `Opening Stock: ${product.name}`,
//           referenceType: 'manual',
//           referenceId: product._id,
//           referenceNumber: product.sku || 'OPENING-STOCK',
//           createdBy: req.user._id
//       }], { session });

//       // CREDIT: Equity (Source of Capital)
//       await AccountEntry.create([{
//           organizationId: orgId,
//           branchId: req.user.branchId,
//           accountId: equityAcc._id,
//           date: new Date(),
//           debit: 0,
//           credit: totalStockValue,
//           description: `Opening Stock Equity: ${product.name}`,
//           referenceType: 'manual',
//           referenceId: product._id,
//           referenceNumber: product.sku || 'OPENING-STOCK',
//           createdBy: req.user._id
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
//    2. BULK IMPORT (With Accounting)
// ========================================================== */
// exports.bulkImportProducts = catchAsync(async (req, res, next) => {
//   const products = req.body;
//   if (!Array.isArray(products) || products.length === 0)
//     return next(new AppError("Provide an array of products.", 400));

//   const orgId = req.user.organizationId;
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Map Data & Generate Slugs
//     const mapped = products.map((p) => {
//       const baseSlug = slugify(p.name);
//       return {
//         ...p,
//         organizationId: orgId,
//         slug: `${baseSlug}-${nanoid(6)}`,
//         sku: p.sku?.trim() || null,
//         // Ensure inventory structure
//         inventory: p.inventory || (p.quantity ? [{ branchId: req.user.branchId, quantity: p.quantity }] : [])
//       };
//     });

//     // 2. Insert Products
//     const createdProducts = await Product.insertMany(mapped, { session });

//     // 3. Calculate Total Import Value
//     let totalImportValue = 0;
//     createdProducts.forEach(p => {
//       const qty = p.inventory?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0;
//       const val = qty * (p.purchasePrice || 0);
//       totalImportValue += val;
//     });

//     // 4. Post Single Journal Entry for Bulk Import
//     if (totalImportValue > 0) {
//       const inventoryAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Asset' }).session(session);
//       let equityAcc = await Account.findOne({ organizationId: orgId, name: 'Opening Balance Equity' }).session(session);
//       if (!equityAcc) equityAcc = await Account.findOne({ organizationId: orgId, name: 'Inventory Gain' }).session(session);

//       // 🚨 FIX: FAIL IF ACCOUNTS MISSING
//       if (!inventoryAcc || !equityAcc) {
//          throw new AppError('Critical: Missing accounts for Bulk Import. Ensure "Inventory Asset" and "Opening Balance Equity" exist.', 500);
//       }

//       // Debit Inventory
//       await AccountEntry.create([{
//           organizationId: orgId,
//           branchId: req.user.branchId,
//           accountId: inventoryAcc._id,
//           date: new Date(),
//           debit: totalImportValue,
//           credit: 0,
//           description: `Bulk Import Stock (${createdProducts.length} items)`,
//           referenceType: 'manual',
//           createdBy: req.user._id
//       }], { session });

//       // Credit Equity
//       await AccountEntry.create([{
//           organizationId: orgId,
//           branchId: req.user.branchId,
//           accountId: equityAcc._id,
//           date: new Date(),
//           debit: 0,
//           credit: totalImportValue,
//           description: `Bulk Import Equity`,
//           referenceType: 'manual',
//           createdBy: req.user._id
//       }], { session });
//     }

//     await session.commitTransaction();
//     res.status(201).json({ status: "success", message: "Bulk product import completed" });

//   } catch (err) {
//     await session.abortTransaction();
//     next(err);
//   } finally {
//     session.endSession();
//   }
// });

// /* ==========================================================
//    3. STOCK ADJUSTMENT (Gain/Loss Recording)
// ========================================================== */
// exports.adjustStock = catchAsync(async (req, res, next) => {
//   const { type, quantity, reason, branchId } = req.body;
  
//   if (!['add','subtract'].includes(type)) return next(new AppError("Invalid type", 400));
//   if (typeof quantity !== 'number' || quantity <= 0) return next(new AppError("Invalid quantity", 400));

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
//     if (!product) throw new AppError("Product not found", 404);

//     const targetBranchId = branchId || req.user.branchId;
//     let inventory = product.inventory.find(i => i.branchId.toString() === targetBranchId.toString());
    
//     if (!inventory) {
//       product.inventory.push({ branchId: targetBranchId, quantity: 0 });
//       inventory = product.inventory[product.inventory.length - 1];
//     }

//     // 1. Update Stock Quantity
//     const oldStock = inventory.quantity;
//     inventory.quantity = type === 'add' ? oldStock + quantity : oldStock - quantity;
//     if (inventory.quantity < 0) inventory.quantity = 0; // Prevent negative stock
    
//     await product.save({ session });

//     // 2. Financial Entry (Cost Value)
//     const costValue = quantity * (product.purchasePrice || 0);

//     if (costValue > 0) {
//       const inventoryAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Asset' }).session(session);
//       const shrinkageAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Shrinkage' }).session(session) 
//                                || await Account.findOne({ organizationId: req.user.organizationId, code: '5100' }).session(session); // COGS fallback
//       const gainAcc = await Account.findOne({ organizationId: req.user.organizationId, name: 'Inventory Gain' }).session(session);

//       // 🚨 FIX: FAIL IF ACCOUNTS MISSING
//       if (!inventoryAcc) throw new AppError('Critical: "Inventory Asset" account missing.', 500);

//       if (type === 'subtract') {
//         if (!shrinkageAcc) throw new AppError('Critical: "Inventory Shrinkage" account missing. Cannot record loss.', 500);

//         // LOSS: Debit Expense, Credit Asset
//         await AccountEntry.create([{
//             organizationId: req.user.organizationId, branchId: targetBranchId,
//             accountId: shrinkageAcc._id, date: new Date(),
//             debit: costValue, credit: 0,
//             description: `Stock Loss: ${product.name} (${reason || 'Manual'})`,
//             referenceType: 'manual', referenceId: product._id,
//             createdBy: req.user._id
//         }, {
//             organizationId: req.user.organizationId, branchId: targetBranchId,
//             accountId: inventoryAcc._id, date: new Date(),
//             debit: 0, credit: costValue,
//             description: `Stock Reduction: ${product.name}`,
//             referenceType: 'manual', referenceId: product._id,
//             createdBy: req.user._id
//         }], { session });

//       } else if (type === 'add') {
//         if (!gainAcc) throw new AppError('Critical: "Inventory Gain" account missing. Cannot record gain.', 500);

//         // GAIN: Debit Asset, Credit Income
//         await AccountEntry.create([{
//             organizationId: req.user.organizationId, branchId: targetBranchId,
//             accountId: inventoryAcc._id, date: new Date(),
//             debit: costValue, credit: 0,
//             description: `Stock Increase: ${product.name}`,
//             referenceType: 'manual', referenceId: product._id,
//             createdBy: req.user._id
//         }, {
//             organizationId: req.user.organizationId, branchId: targetBranchId,
//             accountId: gainAcc._id, date: new Date(),
//             debit: 0, credit: costValue,
//             description: `Stock Gain: ${product.name} (${reason || 'Manual'})`,
//             referenceType: 'manual', referenceId: product._id,
//             createdBy: req.user._id
//         }], { session });
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
//    4. STANDARD CRUD & UTILS (Factory + Custom)
// ========================================================== */

// // READ
// exports.getAllProducts = factory.getAll(Product);
// exports.getProduct = factory.getOne(Product, [
//   { path: 'inventory.branchId', select: 'name' },
//   { path: 'defaultSupplierId', select: 'companyName' }
// ]);

// // SEARCH
// exports.searchProducts = catchAsync(async (req, res, next) => {
//   const q = req.query.q?.trim() || "";
//   const orgId = req.user.organizationId;
//   const products = await Product.find({
//     organizationId: orgId,
//     $or: [
//       { name: { $regex: q, $options: "i" } },
//       { sku: { $regex: q, $options: "i" } },
//       { barcode: { $regex: q, $options: "i" } },
//     ],
//   }).limit(20);
//   res.status(200).json({ status: "success", results: products.length, data: { products } });
// });

// /* ==========================================================
//    🚨 SECURE UPDATE: BLOCKS BACKDOOR INVENTORY CHANGES
//    ----------------------------------------------------------
//    This replaces the generic factory.updateOne
// ========================================================== */
// exports.updateProduct = catchAsync(async (req, res, next) => {
//     // 1. Security Check: Forbidden Fields
//     if (req.body.inventory || req.body.quantity || req.body.stock) {
//         return next(new AppError(
//             'Direct inventory updates are forbidden on this endpoint. Please use the "Stock Adjustment" feature or Purchase/Sales modules.', 
//             400
//         ));
//     }

//     // 2. Perform Safe Update
//     const product = await Product.findOneAndUpdate(
//         { _id: req.params.id, organizationId: req.user.organizationId },
//         req.body,
//         { new: true, runValidators: true }
//     );

//     if (!product) {
//         return next(new AppError('No product found with that ID', 404));
//     }

//     res.status(200).json({
//         status: 'success',
//         data: { product }
//     });
// });

// // BULK UPDATE (Also Secured - Filter update fields if necessary)
// exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
//   const updates = req.body; 
//   if (!Array.isArray(updates) || updates.length === 0) return next(new AppError("Provide updates array", 400));
  
//   const org = req.user.organizationId;
  
//   // Cleanse inputs
//   const safeOps = updates.map(u => {
//      // Remove dangerous fields from the update object
//      if (u.update) {
//          delete u.update.inventory;
//          delete u.update.quantity;
//          delete u.update.stock;
//      }
//      return {
//         updateOne: { filter: { _id: u._id, organizationId: org }, update: u.update }
//      };
//   });

//   await Product.bulkWrite(safeOps);
//   res.status(200).json({ status: "success", message: "Bulk update applied (Inventory fields ignored)." });
// });

// // DELETE / RESTORE
// exports.deleteProduct = factory.deleteOne(Product);
// exports.restoreProduct = factory.restoreOne(Product);

// // IMAGES
// exports.uploadProductImages = catchAsync(async (req, res, next) => {
//   if (!req.files || !req.files.length) return next(new AppError("Please upload product images", 400));
//   const buffers = req.files.map((f) => f.buffer);
//   const uploadResults = await uploadMultipleImages(buffers, "products");
//   res.status(200).json({ status: "success", data: { uploaded: uploadResults } });
// });

// exports.uploadProductImage = catchAsync(async (req, res, next) => {
//   if (!req.files || req.files.length === 0) return next(new AppError("Please upload at least one image.", 400));
//   const folder = `products/${req.user.organizationId}`;
//   const uploadPromises = req.files.map(file => imageUploadService.uploadImage(file.buffer, folder));
//   const uploadResults = await Promise.all(uploadPromises);
//   const imageUrls = uploadResults.map(result => result.url);
  
//   const product = await Product.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     { $push: { images: { $each: imageUrls, $position: 0 } } },
//     { new: true }
//   );
//   if (!product) return next(new AppError("Product not found", 404));
  
//   res.status(200).json({ status: "success", message: `${imageUrls.length} image(s) uploaded`, data: { product } });
// });
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











// // // const Product = require('../models/productModel');
// // // const factory = require('../utils/handlerFactory');
// // // const catchAsync = require("../utils/catchAsync");
// // // const imageUploadService = require("../services/uploads/imageUploadService");
// // // const { nanoid } = require('nanoid');

// // // const slugify = (value) => {
// // //     return value
// // //         .toString()
// // //         .trim()
// // //         .toLowerCase()
// // //         .replace(/[^a-z0-9]+/g, "-")
// // //         .replace(/^-+|-+$/g, "");
// // // };
// // // /**
// // //  * @desc    Create a new product
// // //  * @route   POST /api/v1/products
// // //  * @note    Factory's 'createOne' auto-adds orgId, createdBy
// // //  */
// // // exports.createProduct = factory.createOne(Product);

// // // /**
// // //  * @desc    Get all products for the organization
// // //  * @route   GET /api/v1/products
// // //  * @note    Factory's 'getAll' auto-filters by orgId
// // //  */
// // // exports.getAllProducts = factory.getAll(Product);

// // // /**
// // //  * @desc    Get a single product by ID
// // //  * @route   GET /api/v1/products/:id
// // //  * @note    Factory's 'getOne' auto-checks orgId
// // //  */
// // // exports.getProduct = factory.getOne(Product, [
// // //   { path: 'inventory.branchId', select: 'name' }, // Populate branch name in inventory
// // //   { path: 'defaultSupplierId', select: 'companyName' } // Populate supplier name
// // // ]);

// // // /**
// // //  * @desc    Update a product
// // //  * @route   PATCH /api/v1/products/:id
// // //  * @note    Factory's 'updateOne' auto-checks orgId
// // //  */
// // // exports.updateProduct = factory.updateOne(Product);

// // // /**
// // //  * @desc    Delete a product (soft delete)
// // //  * @route   DELETE /api/v1/products/:id
// // //  * @note    Factory's 'deleteOne' auto-checks orgId and handles soft delete
// // //  */
// // // exports.deleteProduct = factory.deleteOne(Product);

// // // /**
// // //  * @desc    Restore a soft-deleted product
// // //  * @route   PATCH /api/v1/products/:id/restore
// // //  */
// // // exports.restoreProduct = factory.restoreOne(Product);

// // // const { uploadMultipleImages } = require("../services/uploads");
// // // exports.uploadProductImages = catchAsync(async (req, res, next) => {
// // //   if (!req.files || !req.files.length)
// // //     return next(new AppError("Please upload product images", 400));
// // //   const buffers = req.files.map((f) => f.buffer);
// // //   const uploadResults = await uploadMultipleImages(buffers, "products");
// // //   res.status(200).json({
// // //     status: "success",
// // //     data: { uploaded: uploadResults },
// // //   });
// // // });


// // // // ======================================================
// // // // SEARCH PRODUCTS
// // // // GET /products/search?q=term
// // // // ======================================================
// // // exports.searchProducts = catchAsync(async (req, res, next) => {
// // //   const q = req.query.q?.trim() || "";
// // //   const orgId = req.user.organizationId;

// // //   const products = await Product.find({
// // //     organizationId: orgId,
// // //     $or: [
// // //       { name: { $regex: q, $options: "i" } },
// // //       { sku: { $regex: q, $options: "i" } },
// // //       { barcode: { $regex: q, $options: "i" } },
// // //     ],
// // //   }).limit(20);

// // //   res.status(200).json({
// // //     status: "success",
// // //     results: products.length,
// // //     data: { products },
// // //   });
// // // });

// // // // ======================================================
// // // // BULK IMPORT PRODUCTS
// // // // POST /products/bulk-import
// // // // ======================================================
// // // exports.bulkImportProducts = catchAsync(async (req, res, next) => {
// // //   const products = req.body;

// // //   if (!Array.isArray(products) || products.length === 0)
// // //     return next(new AppError("Provide an array of products.", 400));

// // //   const orgId = req.user.organizationId;

// // //   // Manually generate slugs here because insertMany skips the model middleware
// // //   const mapped = products.map((p) => {
// // //     const baseSlug = slugify(p.name);
// // //     return {
// // //       ...p,
// // //       organizationId: orgId,
// // //       slug: `${baseSlug}-${nanoid(6)}`,
// // //       sku: p.sku?.trim() || null
// // //     };
// // //   });
// // //   await Product.insertMany(mapped);
// // //   res.status(201).json({
// // //     status: "success",
// // //     message: "Bulk product import completed",
// // //   });
// // // });

// // // // ======================================================
// // // // PRODUCT IMAGE UPLOAD
// // // // PATCH /products/:id/upload
// // // // ======================================================
// // // exports.uploadProductImage = catchAsync(async (req, res, next) => {
// // //   // 1. Check for 'req.files' (Plural)
// // //   if (!req.files || req.files.length === 0) {
// // //     return next(new AppError("Please upload at least one image.", 400));
// // //   }

// // //   const folder = `products/${req.user.organizationId}`;

// // //   // 2. Upload ALL files in parallel
// // //   const uploadPromises = req.files.map(file => 
// // //     imageUploadService.uploadImage(file.buffer, folder)
// // //   );

// // //   const uploadResults = await Promise.all(uploadPromises);

// // //   // 3. Extract URLs
// // //   const imageUrls = uploadResults.map(result => result.url);

// // //   // 4. Push ALL new URLs to the images array
// // //   const product = await Product.findOneAndUpdate(
// // //     { _id: req.params.id, organizationId: req.user.organizationId },
// // //     { 
// // //       $push: { 
// // //         images: { 
// // //           $each: imageUrls, 
// // //           $position: 0 // Add to the top of the list
// // //         } 
// // //       } 
// // //     },
// // //     { new: true }
// // //   );

// // //   if (!product) return next(new AppError("Product not found", 404));

// // //   res.status(200).json({
// // //     status: "success",
// // //     message: `${imageUrls.length} image(s) uploaded successfully`,
// // //     data: { product },
// // //   });
// // // });



// // // // POST /v1/products/bulk-update
// // // exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
// // //   const updates = req.body; // expect [{ _id, update: { field: value } }, ...]
// // //   if (!Array.isArray(updates) || updates.length === 0) return next(new AppError("Provide updates array", 400));
// // //   const org = req.user.organizationId;

// // //   const ops = updates.map(u => ({
// // //     updateOne: {
// // //       filter: { _id: u._id, organizationId: org },
// // //       update: u.update
// // //     }
// // //   }));

// // //   await Product.bulkWrite(ops);
// // //   res.status(200).json({ status: "success", message: "Bulk update applied." });
// // // });

// // // // POST /v1/products/:id/stock-adjust
// // // exports.adjustStock = catchAsync(async (req, res, next) => {
// // //   const { type, quantity, reason } = req.body;
// // //   if (!['add','subtract'].includes(type)) return next(new AppError("Invalid type", 400));
// // //   if (typeof quantity !== 'number' || quantity <= 0) return next(new AppError("Invalid quantity", 400));

// // //   const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
// // //   if (!product) return next(new AppError("Product not found", 404));

// // //   product.stock = type === 'add' ? product.stock + quantity : product.stock - quantity;
// // //   if (product.stock < 0) product.stock = 0;
// // //   await product.save();

// // //   // Optionally create StockAdjustment log model
// // //   res.status(200).json({ status: "success", data: { product } });
// // // });


// // // // exports.uploadProductImage = catchAsync(async (req, res, next) => {
// // // //   if (!req.file || !req.file.buffer) {
// // // //     return next(new AppError("Please upload an image file.", 400));
// // // //   }

// // // //   const folder = `products/${req.user.organizationId}`;
  
// // // //   // 1. Upload to Cloudinary/S3
// // // //   const uploadResult = await imageUploadService.uploadImage(req.file.buffer, folder);

// // // //   // 2. Update Database
// // // //   // We use $push with $position: 0 to add the new image to the FRONT of the array
// // // //   const product = await Product.findOneAndUpdate(
// // // //     { _id: req.params.id, organizationId: req.user.organizationId },
// // // //     { 
// // // //       $push: { 
// // // //         images: { 
// // // //           $each: [uploadResult.url], // Extract .url
// // // //           $position: 0               // Prepend (Make it the main image)
// // // //         } 
// // // //       } 
// // // //     },
// // // //     { new: true }
// // // //   );

// // // //   if (!product) return next(new AppError("Product not found", 404));

// // // //   res.status(200).json({
// // // //     status: "success",
// // // //     message: "Product image uploaded successfully",
// // // //     data: { product },
// // // //   });
// // // // });

// // // // exports.uploadProductImage = catchAsync(async (req, res, next) => {
// // // //   if (!req.file || !req.file.buffer)
// // // //     return next(new AppError("Please upload an image file.", 400));
// // // //   const folder = `products/${req.user.organizationId}`;
// // // //   const imageUrl = await imageUploadService.uploadImage(
// // // //     req.file.buffer,
// // // //     folder
// // // //   );
// // // //   const product = await Product.findOneAndUpdate(
// // // //     { _id: req.params.id, organizationId: req.user.organizationId },
// // // //     { photo: imageUrl },
// // // //     { new: true }
// // // //   );
// // // //   if (!product) return next(new AppError("Product not found", 404));
// // // //   res.status(200).json({
// // // //     status: "success",
// // // //     message: "Product image uploaded successfully",
// // // //     data: { product },
// // // //   });
// // // // });
