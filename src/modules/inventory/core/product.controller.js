const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const Product = require('./product.model');
const AccountEntry = require('../../accounting/core/accountEntry.model');
const Account = require('../../accounting/core/account.model');
const factory = require('../../../core/utils/handlerFactory');
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");
const Invoice = require('../../accounting/billing/invoice.model'); 

/* ======================================================
   HELPER: ATOMIC ACCOUNT GET/CREATE
   (Prevents duplicate key errors during parallel requests)
====================================================== */
async function getOrInitAccount(orgId, type, name, code, session) {
  // atomic find-or-create
  const account = await Account.findOneAndUpdate(
    { organizationId: orgId, code },
    {
      $setOnInsert: {
        organizationId: orgId,
        name,
        code,
        type,
        isGroup: false,
        isActive: true
      }
    },
    { upsert: true, new: true, session }
  );
  return account;
}

const slugify = (value) =>
  value.toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// const slugify = (value) =>
//   value.toString().trim().toLowerCase()
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/^-+|-+$/g, "");

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

    // --- CRITICAL FIX: Added 'ordered: true' ---
    const [product] = await Product.create([req.body], { session, ordered: true });

    /* ---------- OPENING STOCK ACCOUNTING (SAFE) ---------- */
    let totalStockValue = 0;
    if (product.inventory?.length) {
      const totalQty = product.inventory.reduce((a, b) => a + (b.quantity || 0), 0);
      totalStockValue = totalQty * (product.purchasePrice || 0);
    }

    if (totalStockValue > 0) {
      // Changed 'opening_stock' to 'journal' to satisfy enum validation
      const alreadyBooked = await AccountEntry.exists({
        organizationId: req.user.organizationId,
        referenceType: 'journal',
        referenceId: product._id
      }).session(session);

      if (!alreadyBooked) {
        const inventoryAcc = await getOrInitAccount(
          req.user.organizationId, 'asset', 'Inventory Asset', '1500', session
        );
        const equityAcc = await getOrInitAccount(
          req.user.organizationId, 'equity', 'Opening Balance Equity', '3000', session
        );

        // FIX: Added 'ordered: true' for AccountEntry creation too
        // FIX: Changed referenceType to 'journal'
        await AccountEntry.create([
          {
            organizationId: req.user.organizationId,
            branchId: req.user.branchId,
            accountId: inventoryAcc._id,
            date: new Date(),
            debit: totalStockValue,
            credit: 0,
            description: `Opening Stock: ${product.name}`,
            referenceType: 'journal',
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
            referenceType: 'journal',
            referenceId: product._id,
            createdBy: req.user._id
          }
        ], { session, ordered: true });
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
   3. STOCK ADJUSTMENT (GAIN / LOSS)
   - Uses 'journal' as referenceType to pass validation
   - Uses ordered: true to fix transaction error
====================================================== */
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { type, quantity, reason, branchId } = req.body;

  if (!['add', 'subtract'].includes(type)) return next(new AppError("Invalid type", 400));
  if (quantity <= 0) return next(new AppError("Quantity must be positive", 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const targetBranch = branchId || req.user.branchId;
    const adjustQty = type === 'add' ? quantity : -quantity;

    // -------------------------------------------------
    // STEP 1: ATOMIC INVENTORY UPDATE
    // -------------------------------------------------
    let product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organizationId,
        "inventory.branchId": targetBranch,
        // Guard: Prevent negative stock if subtracting
        ...(type === 'subtract' ? { "inventory.quantity": { $gte: quantity } } : {})
      },
      {
        $inc: { "inventory.$.quantity": adjustQty }
      },
      { new: true, session }
    );

    // Handle case: Branch Inventory does not exist yet
    if (!product) {
      // Check if product exists at all
      const productExists = await Product.findOne({ 
        _id: req.params.id, 
        organizationId: req.user.organizationId 
      }).session(session);

      if (!productExists) throw new AppError("Product not found", 404);

      // If subtracting from empty inventory -> Error
      if (type === 'subtract') {
        throw new AppError("Insufficient stock (Branch inventory empty)", 400);
      }

      // If adding, push new branch inventory
      product = await Product.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.user.organizationId },
        { 
          $push: { 
            inventory: { 
              branchId: targetBranch, 
              quantity: quantity, 
              reorderLevel: 10 
            } 
          } 
        },
        { new: true, session }
      );
    }

    // -------------------------------------------------
    // STEP 2: ACCOUNTING ENTRIES
    // -------------------------------------------------
    const costValue = quantity * (product.purchasePrice || 0);

    if (costValue > 0) {
      const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);

      if (type === 'subtract') {
        const lossAcc = await getOrInitAccount(req.user.organizationId, 'expense', 'Inventory Shrinkage', '5100', session);

        // FIXED: referenceType changed to 'journal'
        // FIXED: Added 'ordered: true'
        await AccountEntry.create([
          {
            organizationId: req.user.organizationId,
            branchId: targetBranch,
            accountId: lossAcc._id,
            date: new Date(),
            debit: costValue, 
            credit: 0,
            description: `Stock Loss: ${reason}`,
            referenceType: 'journal', // Changed from 'adjustment'
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
            referenceType: 'journal', // Changed from 'adjustment'
            referenceId: product._id,
            createdBy: req.user._id
          }
        ], { session, ordered: true }); // <--- CRITICAL FIX

      } else {
        const gainAcc = await getOrInitAccount(req.user.organizationId, 'other_income', 'Inventory Gain', '4900', session);

        await AccountEntry.create([
          {
            organizationId: req.user.organizationId,
            branchId: targetBranch,
            accountId: inventoryAcc._id,
            date: new Date(),
            debit: costValue,
            credit: 0,
            description: `Inventory Increase: ${product.name}`,
            referenceType: 'journal',
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
            referenceType: 'journal',
            referenceId: product._id,
            createdBy: req.user._id
          }
        ], { session, ordered: true }); // <--- CRITICAL FIX
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
   4. STOCK TRANSFER (INTER-BRANCH)
   - Moves stock from Branch A to Branch B
   - No financial GL entries (Move only)
====================================================== */
exports.transferStock = catchAsync(async (req, res, next) => {
  const { fromBranchId, toBranchId, quantity, description } = req.body;
  const productId = req.params.id;

  // Basic Validations
  if (!fromBranchId || !toBranchId) return next(new AppError("Source and Destination branches are required", 400));
  if (fromBranchId === toBranchId) return next(new AppError("Source and Destination cannot be the same", 400));
  if (quantity <= 0) return next(new AppError("Quantity must be positive", 400));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Decrement Source Branch
    const sourceUpdate = await Product.findOneAndUpdate(
      {
        _id: productId,
        organizationId: req.user.organizationId,
        inventory: {
          $elemMatch: {
            branchId: fromBranchId,
            quantity: { $gte: quantity } // Guard against negative stock
          }
        }
      },
      {
        $inc: { "inventory.$.quantity": -quantity }
      },
      { new: true, session }
    );

    if (!sourceUpdate) {
      throw new AppError("Transfer failed: Insufficient stock in source branch.", 400);
    }

    // 2. Increment Destination Branch
    let destUpdate = await Product.findOneAndUpdate(
      {
        _id: productId,
        organizationId: req.user.organizationId,
        "inventory.branchId": toBranchId
      },
      {
        $inc: { "inventory.$.quantity": quantity }
      },
      { new: true, session }
    );

    // 3. Handle Destination First Time Receipt
    if (!destUpdate) {
      destUpdate = await Product.findOneAndUpdate(
        { _id: productId, organizationId: req.user.organizationId },
        {
          $push: {
            inventory: {
              branchId: toBranchId,
              quantity: quantity,
              reorderLevel: 10
            }
          }
        },
        { new: true, session }
      );
    }

    await session.commitTransaction();
    res.status(200).json({ status: "success", message: "Stock transferred successfully" });

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
  const product = await Product.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!product) return next(new AppError("Product not found", 404));
  const totalStock = product.inventory.reduce((a, b) => a + b.quantity, 0);
  if (totalStock > 0) { return next(new AppError(`Cannot delete product with stock (${totalStock}). Write off first.`, 400)) }
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
  if (!req.files?.length) { return next(new AppError("Upload at least one image", 400)); }
  const folder = `products/${req.user.organizationId}`;
  const uploads = await Promise.all(req.files.map(f => imageUploadService.uploadImage(f.buffer, folder)));
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
exports.getProduct = factory.getOne(Product, [{ path: 'inventory.branchId', select: 'name' }]);


/* ======================================================
   BULK IMPORT PRODUCTS (With Per-Item Accounting)
====================================================== */
exports.bulkImportProducts = catchAsync(async (req, res, next) => {
  const products = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return next(new AppError("Provide an array of products", 400));
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validation: Ensure cost price exists if stock is present
    for (const p of products) {
      const qty = p.quantity || p.inventory?.reduce((a, i) => a + (i.quantity || 0), 0) || 0;
      if (qty > 0 && (!p.purchasePrice || p.purchasePrice <= 0)) {
        throw new AppError(`Purchase Price required for stock items: ${p.name}`, 400);
      }
    }

    // 2. Prepare Ledger Accounts (Once per transaction)
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, 'asset', 'Inventory Asset', '1500', session);
    const equityAcc = await getOrInitAccount(req.user.organizationId, 'equity', 'Opening Balance Equity', '3000', session);

    const BATCH_SIZE = 100;
    const createdProducts = [];
    const journalEntries = [];

    // 3. Process in Batches
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      // A. Map Data
      const mappedProducts = batch.map(p => ({
        ...p,
        organizationId: req.user.organizationId,
        slug: `${slugify(p.name)}-${nanoid(6)}`,
        // Normalize inventory structure
        inventory: p.inventory?.length
          ? p.inventory
          : (p.quantity ? [{ branchId: req.user.branchId, quantity: Number(p.quantity) }] : []),
        createdBy: req.user._id
      }));

      // B. Insert Products
      const batchResult = await Product.insertMany(mappedProducts, { session });
      createdProducts.push(...batchResult);

      // C. Build Journal Entries for THIS batch
      // (Crucial: We iterate the RESULT to get the generated _ids)
      batchResult.forEach(product => {
        const totalQty = product.inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const stockValue = totalQty * (product.purchasePrice || 0);

        if (stockValue > 0) {
          // DEBIT: Inventory Asset
          journalEntries.push({
            organizationId: req.user.organizationId,
            branchId: req.user.branchId,
            accountId: inventoryAcc._id,
            date: new Date(),
            debit: stockValue,
            credit: 0,
            description: `Opening Stock: ${product.name}`,
            referenceType: 'opening_stock',
            referenceId: product._id, // <--- LINKS LEDGER TO SPECIFIC PRODUCT
            createdBy: req.user._id
          });

          // CREDIT: Equity
          journalEntries.push({
            organizationId: req.user.organizationId,
            branchId: req.user.branchId,
            accountId: equityAcc._id,
            date: new Date(),
            debit: 0,
            credit: stockValue,
            description: `Opening Stock Equity: ${product.name}`,
            referenceType: 'opening_stock',
            referenceId: product._id,
            createdBy: req.user._id
          });
        }
      });
    }

    // 4. Insert All Journal Entries
    if (journalEntries.length > 0) {
      await AccountEntry.insertMany(journalEntries, { session });
    }

    await session.commitTransaction();

    res.status(201).json({
      status: "success",
      message: `Imported ${createdProducts.length} products successfully.`,
      data: {
        importedCount: createdProducts.length,
        journalEntriesCreated: journalEntries.length
      }
    });

  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

/* ======================================================
   BULK UPDATE PRODUCTS (Safe & Secured)
====================================================== */
// exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
//   const updates = req.body;
//   if (!Array.isArray(updates) || updates.length === 0) {
//     return next(new AppError("Provide an array of updates", 400));
//   }

//   // 1. Define Forbidden Fields (Financial integrity)
//   const forbiddenFields = [
//     'quantity', 'inventory', 'purchasePrice', 'costPrice',
//     'openingStock', 'organizationId', 'createdBy', '_id'
//   ];
//   const allowedFields = [
//     'name', 'description', 'sku', 'barcode', 'category',
//     'brand', 'unit', 'sellingPrice', 'minSellingPrice',
//     'taxRate', 'isActive', 'reorderLevel', 'images'
//   ];

//   const bulkOps = [];
//   for (const u of updates) {
//     if (!u._id || !u.update) {
//       return next(new AppError("Each item must have _id and update object", 400));
//     }

//     // Filter the update object to only contain allowed fields
//     const cleanUpdate = {};
//     Object.keys(u.update).forEach(key => {
//       if (forbiddenFields.includes(key)) {
//         // Optionally throw error, or just ignore. 
//         // Throwing error is safer to alert the frontend dev.
//         throw new AppError(`Field '${key}' cannot be updated in bulk. Use stock adjustment.`, 400);
//       }
//       if (allowedFields.includes(key)) {
//         cleanUpdate[key] = u.update[key];
//       }
//     });

//     if (Object.keys(cleanUpdate).length > 0) {
//       // If name is changing, we should probably update slug too
//       if (cleanUpdate.name) {
//         cleanUpdate.slug = `${slugify(cleanUpdate.name)}-${nanoid(6)}`;
//       }

//       bulkOps.push({
//         updateOne: {
//           filter: {
//             _id: u._id,
//             organizationId: req.user.organizationId
//           },
//           update: { $set: cleanUpdate } // Force $set to prevent operator injection
//         }
//       });
//     }
//   }

//   // 3. Execute
//   if (bulkOps.length > 0) {
//     const result = await Product.bulkWrite(bulkOps);

//     res.status(200).json({
//       status: "success",
//       message: "Bulk update completed",
//       data: {
//         matched: result.matchedCount,
//         modified: result.modifiedCount
//       }
//     });
//   } else {
//     res.status(200).json({
//       status: "success",
//       message: "No valid fields to update were found."
//     });
//   }
// });
/* ======================================================
   🔥 BULK UPDATE PRODUCTS (Fixed Security & Logic)
====================================================== */
exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
  const updates = req.body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return next(new AppError("Provide an array of updates", 400));
  }

  const forbiddenFields = [
    'quantity', 'inventory', 'purchasePrice', 'costPrice',
    'openingStock', 'organizationId', 'createdBy', '_id'
  ];
  const allowedFields = [
    'name', 'description', 'sku', 'barcode', 'hsnCode', 'categoryId',
    'brandId', 'unitId', 'sellingPrice', 'mrp',
    'taxRate', 'isActive', 'reorderLevel', 'images'
  ];

  const bulkOps = [];
  for (const u of updates) {
    if (!u._id || !u.update) {
      return next(new AppError("Each item must have _id and update object", 400));
    }

    const cleanUpdate = {};
    Object.keys(u.update).forEach(key => {
      if (forbiddenFields.includes(key)) {
        throw new AppError(`Field '${key}' cannot be updated in bulk. Use stock adjustment.`, 400);
      }
      if (allowedFields.includes(key)) {
        cleanUpdate[key] = u.update[key];
      }
    });

    if (Object.keys(cleanUpdate).length > 0) {
      if (cleanUpdate.name) {
        cleanUpdate.slug = `${slugify(cleanUpdate.name)}-${nanoid(6)}`;
      }

      bulkOps.push({
        updateOne: {
          // 🟢 SECURITY FIX: Force ObjectId casting and Org Check
          filter: { 
            _id: new mongoose.Types.ObjectId(u._id), 
            organizationId: new mongoose.Types.ObjectId(req.user.organizationId) 
          },
          update: { $set: cleanUpdate } 
        }
      });
    }
  }

  if (bulkOps.length > 0) {
    const result = await Product.bulkWrite(bulkOps);
    res.status(200).json({
      status: "success",
      message: "Bulk update completed",
      data: { matched: result.matchedCount, modified: result.modifiedCount }
    });
  } else {
    res.status(200).json({ status: "success", message: "No valid fields to update were found." });
  }
});

/* ======================================================
   7. PRODUCT HISTORY (Stock Card / Ledger)
   Aggregates movements from Invoices (Qty) and Ledger (Value)
====================================================== */
// exports.getProductHistory = catchAsync(async (req, res, next) => {
//   const productId = req.params.id;
//   const { startDate, endDate } = req.query;

//   // 1. Build Date Filter
//   const dateFilter = {};
//   if (startDate && endDate) {
//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     end.setHours(23, 59, 59, 999); // Include full end day
    
//     dateFilter.$gte = start;
//     dateFilter.$lte = end;
//   }

//   // 2. FETCH SALES (From Invoices)
//   // We find invoices containing this product that are NOT cancelled
//   const invoiceQuery = {
//     organizationId: req.user.organizationId,
//     "items.productId": productId,
//     status: { $ne: "cancelled" }
//   };
  
//   if (Object.keys(dateFilter).length) {
//     invoiceQuery.invoiceDate = dateFilter;
//   }

//   const invoices = await Invoice.find(invoiceQuery)
//     .populate("customerId", "name email") // Get customer name
//     .select("invoiceNumber invoiceDate items status customerId")
//     .sort({ invoiceDate: -1 })
//     .lean();

//   const salesHistory = invoices.map(inv => {
//     // Extract the specific line item for this product
//     const item = inv.items.find(i => i.productId.toString() === productId.toString());
    
//     // Guard: Should theoretically always find it due to query, but safe to check
//     if (!item) return null;

//     return {
//       _id: inv._id,
//       type: 'SALE',
//       date: inv.invoiceDate,
//       reference: inv.invoiceNumber,
//       party: inv.customerId?.name || 'Walk-in Customer',
//       quantity: -Math.abs(item.quantity), // Negative because it's stock OUT
//       unit: item.unit,
//       value: item.price * item.quantity, // Revenue
//       description: `Invoice generated`
//     };
//   }).filter(i => i !== null); // Remove any nulls


//   // 3. FETCH ADJUSTMENTS (From AccountEntry)
//   // Note: AccountEntry tracks VALUE ($), not QUANTITY. 
//   // We display it to show *when* adjustments happened, even if we can't show exact qty.
//   const entryQuery = {
//     organizationId: req.user.organizationId,
//     referenceId: productId,
//     referenceType: { $in: ['journal', 'adjustment', 'opening_stock'] }
//   };

//   if (Object.keys(dateFilter).length) {
//     entryQuery.date = dateFilter;
//   }

//   const adjustments = await AccountEntry.find(entryQuery)
//     .select('date description debit credit referenceType')
//     .sort({ date: -1 })
//     .lean();

//   const adjustmentHistory = adjustments.map(entry => {
//     // Heuristic: Debit to Inventory Asset usually means Add, Credit means Remove.
//     // However, AccountEntry is double-entry. We need to filter only the Inventory Asset side if we want to be precise,
//     // OR just show the entry generic.
//     // Simpler approach: Just show the event.
    
//     let type = 'ADJUSTMENT';
//     if (entry.referenceType === 'opening_stock') type = 'OPENING STOCK';

//     return {
//       _id: entry._id,
//       type: type,
//       date: entry.date,
//       reference: 'Journal',
//       party: 'System / Admin',
//       quantity: null, // Ledger doesn't store qty in your schema
//       unit: '-',
//       value: entry.debit > 0 ? entry.debit : -entry.credit,
//       description: entry.description
//     };
//   });

//   // 4. MERGE & SORT
//   const fullHistory = [...salesHistory, ...adjustmentHistory]
//     .sort((a, b) => new Date(b.date) - new Date(a.date));

//   res.status(200).json({
//     status: 'success',
//     results: fullHistory.length,
//     data: { 
//       history: fullHistory 
//     }
//   });
// });

/* ======================================================
   🔥 7. PRODUCT HISTORY (Complete Stock Ledger)
====================================================== */
exports.getProductHistory = catchAsync(async (req, res, next) => {
  const productId = req.params.id;
  const orgId = req.user.organizationId;
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate && endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter.$gte = new Date(startDate);
    dateFilter.$lte = end;
  }

  // 1. FETCH SALES (OUT)
  const invoiceQuery = { organizationId: orgId, "items.productId": productId, status: { $ne: "cancelled" } };
  if (Object.keys(dateFilter).length) invoiceQuery.invoiceDate = dateFilter;
  
  const invoices = await Invoice.find(invoiceQuery).populate("customerId", "name").lean();
  const salesHistory = invoices.map(inv => {
    const item = inv.items.find(i => i.productId.toString() === productId.toString());
    if (!item) return null;
    return {
      _id: inv._id,
      type: 'SALE',
      date: inv.invoiceDate,
      reference: inv.invoiceNumber,
      party: inv.customerId?.name || 'Walk-in Customer',
      quantity: -Math.abs(item.quantity), // OUT
      value: item.price * item.quantity,
      description: 'Sale Invoice'
    };
  }).filter(Boolean);

  // 2. FETCH PURCHASES (IN) - 🟢 NEW
  const purchaseQuery = { organizationId: orgId, "items.productId": productId, status: { $ne: "cancelled" }, isDeleted: false };
  if (Object.keys(dateFilter).length) purchaseQuery.purchaseDate = dateFilter;

  const purchases = await Purchase.find(purchaseQuery).populate("supplierId", "companyName").lean();
  const purchaseHistory = purchases.map(pur => {
    const item = pur.items.find(i => i.productId.toString() === productId.toString());
    if (!item) return null;
    return {
      _id: pur._id,
      type: 'PURCHASE',
      date: pur.purchaseDate,
      reference: pur.invoiceNumber,
      party: pur.supplierId?.companyName || 'Unknown Supplier',
      quantity: Math.abs(item.quantity), // IN
      value: item.purchasePrice * item.quantity,
      description: 'Purchase Bill'
    };
  }).filter(Boolean);

  // 3. FETCH PURCHASE RETURNS (OUT) - 🟢 NEW
  const returnQuery = { organizationId: orgId, "items.productId": productId };
  if (Object.keys(dateFilter).length) returnQuery.returnDate = dateFilter;

  const returns = await PurchaseReturn.find(returnQuery).populate("supplierId", "companyName").lean();
  const returnHistory = returns.map(ret => {
    const item = ret.items.find(i => i.productId.toString() === productId.toString());
    if (!item) return null;
    return {
      _id: ret._id,
      type: 'PURCHASE_RETURN',
      date: ret.returnDate,
      reference: `Return to ${ret.supplierId?.companyName}`,
      party: ret.supplierId?.companyName,
      quantity: -Math.abs(item.quantity), // OUT
      value: item.returnPrice * item.quantity,
      description: ret.reason || 'Debit Note'
    };
  }).filter(Boolean);

  // 4. FETCH ADJUSTMENTS
  const entryQuery = { organizationId: orgId, referenceId: productId, referenceType: { $in: ['journal', 'opening_stock'] } };
  if (Object.keys(dateFilter).length) entryQuery.date = dateFilter;

  const adjustments = await AccountEntry.find(entryQuery).lean();
  const adjustmentHistory = adjustments.map(entry => {
    return {
      _id: entry._id,
      type: entry.referenceType === 'opening_stock' ? 'OPENING STOCK' : 'ADJUSTMENT',
      date: entry.date,
      reference: 'Journal',
      party: 'System Admin',
      quantity: null, // Ledger holds value, not qty
      value: entry.debit > 0 ? entry.debit : -entry.credit,
      description: entry.description
    };
  });

  // MERGE & SORT
  const fullHistory = [...salesHistory, ...purchaseHistory, ...returnHistory, ...adjustmentHistory]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.status(200).json({ status: 'success', results: fullHistory.length, data: { history: fullHistory } });
});

/* ======================================================
   8. LOW STOCK REPORT
   Finds products where Total Stock <= Reorder Level
====================================================== */
// exports.getLowStockProducts = catchAsync(async (req, res, next) => {
//   const products = await Product.find({
//     organizationId: req.user.organizationId,
//     isActive: true
//   }).lean();

//   // Filter in memory (easier than complex Mongo aggregation for computed virtuals)
//   const lowStockItems = products.filter(p => {
//     // Calculate total stock
//     const totalStock = p.inventory?.reduce((acc, item) => acc + (item.quantity || 0), 0) || 0;
    
//     // Determine reorder level (Max of branch levels or default)
//     const maxReorderLevel = p.inventory?.reduce((max, item) => Math.max(max, item.reorderLevel || 0), 0) || 10;
    
//     return totalStock <= maxReorderLevel;
//   }).map(p => ({
//     _id: p._id,
//     name: p.name,
//     sku: p.sku,
//     currentStock: p.inventory.reduce((a, b) => a + b.quantity, 0),
//     reorderLevel: p.inventory[0]?.reorderLevel || 10,
//     image: p.images?.[0] || null
//   }));

//   res.status(200).json({
//     status: 'success',
//     results: lowStockItems.length,
//     data: { products: lowStockItems }
//   });
// });
/* ======================================================
   🔥 8. LOW STOCK REPORT (High Performance Aggregation)
====================================================== */
exports.getLowStockProducts = catchAsync(async (req, res, next) => {
  const orgId = new mongoose.Types.ObjectId(req.user.organizationId);

  // 🟢 Use Aggregation to calculate totalStock dynamically and filter AT THE DATABASE LEVEL
  const lowStockItems = await Product.aggregate([
    { $match: { organizationId: orgId, isActive: true, isDeleted: false } },
    
    // Calculate total stock and max reorder level across branches
    { $addFields: {
        totalStockCalculated: { $sum: "$inventory.quantity" },
        maxReorderLevel: { 
          $cond: { 
            if: { $gt: [{ $size: "$inventory" }, 0] }, 
            then: { $max: "$inventory.reorderLevel" }, 
            else: 10 // Default fallback
          }
        }
    }},
    
    // Filter ONLY items where Stock <= Reorder Level
    { $match: {
        $expr: { $lte: ["$totalStockCalculated", "$maxReorderLevel"] }
    }},

    // Project only the fields needed for the UI
    { $project: {
        name: 1,
        sku: 1,
        barcode: 1,
        currentStock: "$totalStockCalculated",
        reorderLevel: "$maxReorderLevel",
        image: { $arrayElemAt: ["$images", 0] } // Grab first image
    }},
    
    { $sort: { currentStock: 1 } } // Sort by lowest stock first
  ]);

  res.status(200).json({
    status: 'success',
    results: lowStockItems.length,
    data: { products: lowStockItems }
  });
});
