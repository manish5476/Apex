const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Product = require('./product.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');
const Account = require('../../accounting/core/account.model');
const factory = require('../../../core/utils/handlerFactory');
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");

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
