const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Product = require('../models/productModel');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const factory = require('../utils/handlerFactory');
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const imageUploadService = require("../services/uploads/imageUploadService");

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
      isGroup: false
    }], { session });
    return created[0];
  }
  return account;
}

const slugify = (value) =>
  value.toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* ======================================================
   1. CREATE PRODUCT (OPENING STOCK — ONCE ONLY)
====================================================== */
exports.createProduct = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    req.body.organizationId = req.user.organizationId;
    req.body.createdBy = req.user._id;

    // Normalize inventory
    if (req.body.quantity && (!req.body.inventory || req.body.inventory.length === 0)) {
      req.body.inventory = [{
        branchId: req.user.branchId,
        quantity: Number(req.body.quantity),
        reorderLevel: req.body.reorderLevel || 10
      }];
    }

    const [product] = await Product.create([req.body], { session });

    /* ---------- OPENING STOCK ACCOUNTING (SAFE) ---------- */
    let totalStockValue = 0;
    if (product.inventory?.length) {
      const totalQty = product.inventory.reduce((a, b) => a + (b.quantity || 0), 0);
      totalStockValue = totalQty * (product.purchasePrice || 0);
    }

    if (totalStockValue > 0) {
      const alreadyBooked = await AccountEntry.exists({
        organizationId: req.user.organizationId,
        referenceType: 'opening_stock',
        referenceId: product._id
      }).session(session);

      if (!alreadyBooked) {
        const inventoryAcc = await getOrInitAccount(
          req.user.organizationId, 'asset', 'Inventory Asset', '1500', session
        );
        const equityAcc = await getOrInitAccount(
          req.user.organizationId, 'equity', 'Opening Balance Equity', '3000', session
        );

        await AccountEntry.create([
          {
            organizationId: req.user.organizationId,
            branchId: req.user.branchId,
            accountId: inventoryAcc._id,
            date: new Date(),
            debit: totalStockValue,
            credit: 0,
            description: `Opening Stock: ${product.name}`,
            referenceType: 'opening_stock',
            referenceId: product._id,
            createdBy: req.user._id
          },
          {
            organizationId: req.user.organizationId,
            branchId: req.user.branchId,
            accountId: equityAcc._id,
            date: new Date(),
            debit: 0,
            credit: totalStockValue,
            description: `Opening Stock Equity: ${product.name}`,
            referenceType: 'opening_stock',
            referenceId: product._id,
            createdBy: req.user._id
          }
        ], { session });
      }
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

/* ======================================================
   2. UPDATE PRODUCT (NO STOCK / COST MUTATION)
====================================================== */
exports.updateProduct = catchAsync(async (req, res, next) => {
  if (req.body.quantity || req.body.inventory) {
    return next(new AppError(
      "Stock cannot be changed here. Use Purchase or Stock Adjustment.", 400
    ));
  }

  if (req.body.purchasePrice) {
    return next(new AppError(
      "Cost price cannot be edited directly. Use purchase entries.", 400
    ));
  }

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!product) return next(new AppError("Product not found", 404));

  res.status(200).json({ status: "success", data: { product } });
});

/* ======================================================
   3. STOCK ADJUSTMENT (GAIN / LOSS ONLY)
====================================================== */
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { type, quantity, reason, branchId } = req.body;

  if (!['add', 'subtract'].includes(type)) {
    return next(new AppError("Invalid adjustment type", 400));
  }
  if (quantity <= 0) {
    return next(new AppError("Quantity must be positive", 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!product) throw new AppError("Product not found", 404);

    const targetBranch = branchId || req.user.branchId;
    let inventory = product.inventory.find(
      i => i.branchId.toString() === targetBranch.toString()
    );

    if (!inventory) {
      product.inventory.push({ branchId: targetBranch, quantity: 0 });
      inventory = product.inventory.at(-1);
    }

    if (type === 'subtract' && inventory.quantity < quantity) {
      throw new AppError("Insufficient stock", 400);
    }

    inventory.quantity += type === 'add' ? quantity : -quantity;
    await product.save({ session });

    const costValue = quantity * (product.purchasePrice || 0);
    if (costValue > 0) {
      const inventoryAcc = await getOrInitAccount(
        req.user.organizationId, 'asset', 'Inventory Asset', '1500', session
      );

      if (type === 'subtract') {
        const lossAcc = await getOrInitAccount(
          req.user.organizationId, 'expense', 'Inventory Shrinkage', '5100', session
        );

        await AccountEntry.create([
          {
            organizationId: req.user.organizationId,
            branchId: targetBranch,
            accountId: lossAcc._id,
            date: new Date(),
            debit: costValue,
            credit: 0,
            description: `Stock Loss: ${reason}`,
            referenceType: 'adjustment',
            referenceId: product._id,
            createdBy: req.user._id
          },
          {
            organizationId: req.user.organizationId,
            branchId: targetBranch,
            accountId: inventoryAcc._id,
            date: new Date(),
            debit: 0,
            credit: costValue,
            description: `Inventory Reduction: ${product.name}`,
            referenceType: 'adjustment',
            referenceId: product._id,
            createdBy: req.user._id
          }
        ], { session });
      } else {
        const gainAcc = await getOrInitAccount(
          req.user.organizationId, 'other_income', 'Inventory Gain', '4900', session
        );

        await AccountEntry.create([
          {
            organizationId: req.user.organizationId,
            branchId: targetBranch,
            accountId: inventoryAcc._id,
            date: new Date(),
            debit: costValue,
            credit: 0,
            description: `Inventory Increase: ${product.name}`,
            referenceType: 'adjustment',
            referenceId: product._id,
            createdBy: req.user._id
          },
          {
            organizationId: req.user.organizationId,
            branchId: targetBranch,
            accountId: gainAcc._id,
            date: new Date(),
            debit: 0,
            credit: costValue,
            description: `Stock Gain: ${reason}`,
            referenceType: 'adjustment',
            referenceId: product._id,
            createdBy: req.user._id
          }
        ], { session });
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

/* ======================================================
   4. DELETE PRODUCT (ONLY IF STOCK = 0)
====================================================== */
exports.deleteProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });

  if (!product) return next(new AppError("Product not found", 404));

  const totalStock = product.inventory.reduce((a, b) => a + b.quantity, 0);
  if (totalStock > 0) {
    return next(new AppError(
      `Cannot delete product with stock (${totalStock}). Write off first.`,
      400
    ));
  }

  product.isDeleted = true;
  product.isActive = false;
  await product.save();

  res.status(200).json({ status: "success", message: "Product deleted" });
});

/* ======================================================
   5. SEARCH / BULK / IMAGES / RESTORE
====================================================== */
exports.searchProducts = catchAsync(async (req, res) => {
  const q = req.query.q || '';
  const products = await Product.find({
    organizationId: req.user.organizationId,
    $or: [
      { name: new RegExp(q, 'i') },
      { sku: new RegExp(q, 'i') },
      { barcode: new RegExp(q, 'i') }
    ]
  }).limit(20);

  res.status(200).json({ status: "success", results: products.length, data: { products } });
});

exports.uploadProductImage = catchAsync(async (req, res, next) => {
  if (!req.files?.length) {
    return next(new AppError("Upload at least one image", 400));
  }

  const folder = `products/${req.user.organizationId}`;
  const uploads = await Promise.all(
    req.files.map(f => imageUploadService.uploadImage(f.buffer, folder))
  );

  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { $push: { images: { $each: uploads.map(u => u.url) } } },
    { new: true }
  );

  if (!product) return next(new AppError("Product not found", 404));

  res.status(200).json({ status: "success", data: { product } });
});

exports.restoreProduct = factory.restoreOne(Product);
exports.getAllProducts = factory.getAll(Product);
exports.getProduct = factory.getOne(Product, [
  { path: 'inventory.branchId', select: 'name' }
]);

/* ======================================================
   BULK IMPORT PRODUCTS (OPENING STOCK ONLY)
====================================================== */
exports.bulkImportProducts = catchAsync(async (req, res, next) => {
  const products = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    return next(new AppError("Provide an array of products", 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // HARD GUARD: price required
    products.forEach(p => {
      const qty =
        p.quantity ||
        p.inventory?.reduce((a, i) => a + (i.quantity || 0), 0) ||
        0;

      if (qty > 0 && (!p.purchasePrice || p.purchasePrice <= 0)) {
        throw new AppError(
          `purchasePrice required for bulk import: ${p.name}`,
          400
        );
      }
    });

    const mapped = products.map(p => ({
      ...p,
      organizationId: req.user.organizationId,
      slug: `${slugify(p.name)}-${nanoid(6)}`,
      inventory: p.inventory?.length
        ? p.inventory
        : p.quantity
        ? [{ branchId: req.user.branchId, quantity: p.quantity }]
        : [],
      createdBy: req.user._id
    }));

    const created = await Product.insertMany(mapped, { session });

    let totalValue = 0;
    created.forEach(p => {
      const qty = p.inventory.reduce((a, i) => a + (i.quantity || 0), 0);
      totalValue += qty * (p.purchasePrice || 0);
    });

    if (totalValue > 0) {
      const inventoryAcc = await getOrInitAccount(
        req.user.organizationId, 'asset', 'Inventory Asset', '1500', session
      );
      const equityAcc = await getOrInitAccount(
        req.user.organizationId, 'equity', 'Opening Balance Equity', '3000', session
      );

      await AccountEntry.create([
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          accountId: inventoryAcc._id,
          date: new Date(),
          debit: totalValue,
          credit: 0,
          description: "Bulk Import Opening Stock",
          referenceType: 'opening_stock',
          createdBy: req.user._id
        },
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          accountId: equityAcc._id,
          date: new Date(),
          debit: 0,
          credit: totalValue,
          description: "Bulk Import Equity",
          referenceType: 'opening_stock',
          createdBy: req.user._id
        }
      ], { session });
    }

    await session.commitTransaction();
    res.status(201).json({
      status: "success",
      message: "Bulk import completed"
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});
/* ======================================================
   BULK UPDATE PRODUCTS (NON-FINANCIAL ONLY)
====================================================== */
exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
  const updates = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return next(new AppError("Provide updates array", 400));
  }

  // 🔴 HARD BLOCK FINANCIAL / STOCK FIELDS
  const forbiddenFields = [
    'quantity',
    'inventory',
    'purchasePrice',
    'costPrice',
    'openingStock'
  ];

  for (const u of updates) {
    if (!u._id || !u.update) {
      return next(new AppError("Each update must include _id and update object", 400));
    }

    forbiddenFields.forEach(field => {
      if (field in u.update) {
        throw new AppError(
          `Bulk update cannot modify '${field}'. Use Purchase or Stock Adjustment.`,
          400
        );
      }
    });
  }

  const ops = updates.map(u => ({
    updateOne: {
      filter: {
        _id: u._id,
        organizationId: req.user.organizationId
      },
      update: u.update
    }
  }));

  await Product.bulkWrite(ops);

  res.status(200).json({
    status: "success",
    message: "Bulk update applied (non-financial fields only)"
  });
});
















// const mongoose = require('mongoose');
// const { nanoid } = require('nanoid');
// const Product = require('../models/productModel');
// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');
// const factory = require('../utils/handlerFactory');
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const { uploadMultipleImages } = require("../services/uploads");
// const imageUploadService = require("../services/uploads/imageUploadService");

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

// const slugify = (value) => value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// /*   1. CREATE PRODUCT (Handles Opening Stock Valuation)*/
// exports.createProduct = catchAsync(async (req, res, next) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     req.body.organizationId = req.user.organizationId;
//     req.body.createdBy = req.user._id;

//     // Handle Initial Quantity
//     if (req.body.quantity && (!req.body.inventory || req.body.inventory.length === 0)) {
//       req.body.inventory = [{
//         branchId: req.user.branchId,
//         quantity: Number(req.body.quantity),
//         reorderLevel: req.body.reorderLevel || 10
//       }];
//     }

//     const productArr = await Product.create([req.body], { session });
//     const product = productArr[0];

//     // ACCOUNTING: BOOK OPENING STOCK
//     let totalStockValue = 0;
//     if (product.inventory && product.inventory.length > 0) {
//       const totalQty = product.inventory.reduce((acc, inv) => acc + (inv.quantity || 0), 0);
//       totalStockValue = totalQty * (product.purchasePrice || 0);
//     }

//     if (totalStockValue > 0) {
//       const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
//       const equityAcc = await getOrInitAccount(req.user.organizationId, 'equity', 'Opening Balance Equity', '3000', session);

//       // Dr Inventory Asset
//       await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//         date: new Date(), debit: totalStockValue, credit: 0,
//         description: `Opening Stock: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//       }], { session });

//       // Cr Equity
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

// /*   2. UPDATE PRODUCT (Locked)*/
// exports.updateProduct = catchAsync(async (req, res, next) => {
//   if (req.body.quantity || req.body.inventory) {
//     return next(new AppError("Cannot change Stock via Edit. Use 'Purchase' or 'Stock Adjustment'.", 400));
//   }
//   if (req.body.purchasePrice) {
//     return next(new AppError("Cannot change Cost Price here. Create a new Purchase to update costs.", 400));
//   }

//   const product = await Product.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     req.body,
//     { new: true, runValidators: true }
//   );

//   if (!product) return next(new AppError("Product not found", 404));
//   res.status(200).json({ status: "success", data: { product } });
// });

// /*   3. STOCK ADJUSTMENT (Gain/Loss Handling)*/
// exports.adjustStock = catchAsync(async (req, res, next) => {
//   const { type, quantity, reason, branchId } = req.body;
//   if (!['add', 'subtract'].includes(type)) return next(new AppError("Invalid type", 400));
//   if (quantity <= 0) return next(new AppError("Invalid quantity", 400));

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

//     const oldStock = inventory.quantity;
//     if (type === 'subtract' && oldStock < quantity) throw new AppError(`Insufficient stock. Current: ${oldStock}`, 400);

//     inventory.quantity = type === 'add' ? oldStock + quantity : oldStock - quantity;
//     await product.save({ session });

//     // FINANCIAL IMPACT
//     const costValue = quantity * (product.purchasePrice || 0);

//     if (costValue > 0) {
//       const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);

//       if (type === 'subtract') {
//         const shrinkageAcc = await getOrInitAccount(req.user.organizationId, 'expense', 'Inventory Shrinkage', '5100', session);
//         await AccountEntry.create([{
//           organizationId: req.user.organizationId, branchId: targetBranchId, accountId: shrinkageAcc._id, date: new Date(), debit: costValue, credit: 0, description: `Stock Loss: ${reason}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//         }, {
//           organizationId: req.user.organizationId, branchId: targetBranchId, accountId: inventoryAcc._id, date: new Date(), debit: 0, credit: costValue, description: `Stock Reduction: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//         }], { session });
//       } else {
//         const gainAcc = await getOrInitAccount(req.user.organizationId, 'income', 'Inventory Gain', '4900', session);
//         await AccountEntry.create([{
//           organizationId: req.user.organizationId, branchId: targetBranchId, accountId: inventoryAcc._id, date: new Date(), debit: costValue, credit: 0, description: `Stock Increase: ${product.name}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
//         }, {
//           organizationId: req.user.organizationId, branchId: targetBranchId, accountId: gainAcc._id, date: new Date(), debit: 0, credit: costValue, description: `Stock Gain: ${reason}`, referenceType: 'manual', referenceId: product._id, createdBy: req.user._id
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

// /*   4. DELETE PRODUCT (Safeguarded)*/
// exports.deleteProduct = catchAsync(async (req, res, next) => {
//   const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
//   if (!product) return next(new AppError("Product not found", 404));

//   const totalStock = product.inventory.reduce((acc, item) => acc + item.quantity, 0);
//   if (totalStock > 0) {
//     return next(new AppError(`CANNOT DELETE: This product has ${totalStock} items in stock. Write off stock first.`, 400));
//   }

//   product.isDeleted = true;
//   product.isActive = false;
//   await product.save();
//   res.status(200).json({ status: "success", message: "Product deleted." });
// });

// /*   5. STANDARD UTILITIES (Search, Restore, Import, Images)*/

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

// // BULK IMPORT
// exports.bulkImportProducts = catchAsync(async (req, res, next) => {
//   const products = req.body;
//   if (!Array.isArray(products) || products.length === 0) return next(new AppError("Provide an array of products.", 400));

//   const orgId = req.user.organizationId;
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const mapped = products.map((p) => {
//       const baseSlug = slugify(p.name);
//       return {
//         ...p,
//         organizationId: orgId,
//         slug: `${baseSlug}-${nanoid(6)}`,
//         sku: p.sku?.trim() || null,
//         inventory: p.inventory || (p.quantity ? [{ branchId: req.user.branchId, quantity: p.quantity }] : [])
//       };
//     });

//     const createdProducts = await Product.insertMany(mapped, { session });

//     // Accounting for Bulk Import
//     let totalImportValue = 0;
//     createdProducts.forEach(p => {
//       const qty = p.inventory?.reduce((acc, i) => acc + (i.quantity || 0), 0) || 0;
//       totalImportValue += qty * (p.purchasePrice || 0);
//     });

//     if (totalImportValue > 0) {
//       const inventoryAcc = await getOrInitAccount(orgId, 'asset', 'Inventory Asset', '1500', session);
//       const equityAcc = await getOrInitAccount(orgId, 'equity', 'Opening Balance Equity', '3000', session);

//       await AccountEntry.create([{
//         organizationId: orgId, branchId: req.user.branchId, accountId: inventoryAcc._id,
//         date: new Date(), debit: totalImportValue, credit: 0, description: `Bulk Import Stock`, referenceType: 'manual', createdBy: req.user._id
//       }, {
//         organizationId: orgId, branchId: req.user.branchId, accountId: equityAcc._id,
//         date: new Date(), debit: 0, credit: totalImportValue, description: `Bulk Import Equity`, referenceType: 'manual', createdBy: req.user._id
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

// // BULK UPDATE
// exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
//   const updates = req.body;
//   if (!Array.isArray(updates) || updates.length === 0) return next(new AppError("Provide updates array", 400));
//   const org = req.user.organizationId;
//   const ops = updates.map(u => ({
//     updateOne: { filter: { _id: u._id, organizationId: org }, update: u.update }
//   }));
//   await Product.bulkWrite(ops);
//   res.status(200).json({ status: "success", message: "Bulk update applied." });
// });

// // UPLOAD IMAGES
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
//   res.status(200).json({ status: "success", data: { product } });
// });

// // RESTORE
// exports.restoreProduct = factory.restoreOne(Product);
// exports.getAllProducts = factory.getAll(Product);
// exports.getProduct = factory.getOne(Product, [{ path: 'inventory.branchId', select: 'name' }, { path: 'defaultSupplierId', select: 'companyName' }]);

