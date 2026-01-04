const mongoose = require("mongoose");
const Purchase = require("./purchase.model");
const Supplier = require("../../organization/core/supplier.model");
const Product = require("../../inventory/core/product.model"); // Fixed path
const AccountEntry = require("../../accounting/core/accountEntry.model");
const Account = require("../../accounting/core/account.model");

const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const factory = require("../../../core/utils/handlerFactory");
const { runInTransaction } = require("../../../core/utils/runInTransaction");

const fileUploadService = require("../../_legacy/services/uploads/fileUploadService");
const cloudinary = require("cloudinary").v2;
const { invalidateOpeningBalance } = require("../../accounting/core/ledgerCache.service");

const StockValidationService = require('../../_legacy/services/stockValidationService'); // Ensure correct path

/* ======================================================
   ACCOUNT HELPER (IDEMPOTENT)
====================================================== */
async function getOrInitAccount(orgId, type, name, code, session) {
  let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!account) {
    account = await Account.create([{
      organizationId: orgId,
      name,
      code,
      type,
      isGroup: false,
      cachedBalance: 0
    }], { session });
    return account[0];
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

// Helper to populate product names in items
async function populateProductNames(items, organizationId, session) {
  const populatedItems = [];
  const productIds = items.map(item => item.productId).filter(Boolean);
  
  // Fetch all products at once for efficiency
  const products = await Product.find({
    _id: { $in: productIds },
    organizationId
  }).select('name _id').session(session);
  
  const productMap = {};
  products.forEach(product => {
    productMap[product._id.toString()] = product.name;
  });
  
  for (const item of items) {
    if (item.productId && !item.name) {
      const productName = productMap[item.productId.toString()];
      if (productName) {
        populatedItems.push({
          ...item,
          name: productName
        });
      } else {
        // If product not found, keep as is (will fail validation later)
        populatedItems.push(item);
      }
    } else {
      populatedItems.push(item);
    }
  }
  
  return populatedItems;
}

// Helper to validate all items exist and are active
async function validateItemsExist(items, organizationId, session) {
  const productIds = items.map(item => item.productId).filter(Boolean);
  
  const products = await Product.find({
    _id: { $in: productIds },
    organizationId,
    isActive: true
  }).select('_id').session(session);
  
  const foundIds = products.map(p => p._id.toString());
  
  for (const item of items) {
    if (!item.productId) {
      throw new AppError("Each item must have a productId", 400);
    }
    
    if (!foundIds.includes(item.productId.toString())) {
      throw new AppError(`Product ${item.productId} not found or inactive`, 404);
    }
  }
}

/* ======================================================
   1. CREATE PURCHASE
====================================================== */
exports.createPurchase = catchAsync(async (req, res, next) => {
  const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
  let items = parseItemsField(req.body.items);

  if (!supplierId || !items.length) {
    return next(new AppError("Supplier and items are required", 400));
  }

  await runInTransaction(async (session) => {
    /* ---------- VALIDATE ITEMS EXIST ---------- */
    await validateItemsExist(items, req.user.organizationId, session);
    
    /* ---------- FILE UPLOAD ---------- */
    const attachedFiles = [];
    if (req.files?.length) {
      for (const f of req.files) {
        attachedFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
      }
    }

    /* ---------- POPULATE PRODUCT NAMES ---------- */
    items = await populateProductNames(items, req.user.organizationId, session);

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
      if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

      let inventory = product.inventory.find(
        i => String(i.branchId) === String(req.user.branchId)
      );

      if (!inventory) {
        product.inventory.push({ 
          branchId: req.user.branchId, 
          quantity: 0,
          reorderLevel: product.reorderLevel || 10 
        });
        inventory = product.inventory.at(-1);
      }

      inventory.quantity += Number(item.quantity);

      // Update purchase price if provided (average or latest based on your preference)
      if (item.purchasePrice > 0) {
        // Option 1: Store as latest purchase price
        product.purchasePrice = item.purchasePrice;
        
        // Option 2: Calculate weighted average
        // const totalValue = (product.purchasePrice * inventory.quantity) + (item.purchasePrice * item.quantity);
        // const totalQuantity = inventory.quantity + item.quantity;
        // product.purchasePrice = totalValue / totalQuantity;
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

    // Dr Inventory, Cr Accounts Payable
    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: inventoryAcc._id,
        date: purchase.purchaseDate || new Date(),
        debit: purchase.grandTotal,
        credit: 0,
        description: `Purchase: ${invoiceNumber || 'No Invoice'}`,
        referenceType: "purchase",
        referenceId: purchase._id,
        createdBy: req.user._id,
        supplierId
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id,
        supplierId,
        date: purchase.purchaseDate || new Date(),
        debit: 0,
        credit: purchase.grandTotal,
        description: `Supplier Bill: ${invoiceNumber || 'No Invoice'}`,
        referenceType: "purchase",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session });
  }, 3, { action: "CREATE_PURCHASE", userId: req.user._id });

  res.status(201).json({ 
    status: "success", 
    message: "Purchase recorded successfully",
    data: { purchaseId: purchase?._id } // Add purchase ID in response
  });
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

    // Handle file attachments
    if (newFiles.length) {
      updates.attachedFiles = [...oldPurchase.attachedFiles, ...newFiles];
    }

    // Check if financial data is being modified
    const financialChange = updates.items || updates.tax || updates.discount;
    if (!financialChange) {
      // Non-financial update only
      updatedPurchase = await Purchase.findByIdAndUpdate(
        oldPurchase._id, 
        updates, 
        { new: true, session }
      );
      return;
    }

    /* ---------- VALIDATE STOCK AVAILABILITY FOR REVERSAL ---------- */
    const stockValidation = await StockValidationService.validatePurchaseCancellation(
      oldPurchase,
      session
    );
    
    if (!stockValidation.isValid) {
      throw new AppError(`Cannot update purchase: ${stockValidation.errors.join(', ')}`, 400);
    }

    /* ---------- REVERSE OLD INVENTORY ---------- */
    for (const item of oldPurchase.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) continue;
      
      const inv = product.inventory.find(
        i => String(i.branchId) === String(oldPurchase.branchId)
      );

      if (inv) {
        inv.quantity -= item.quantity;
        await product.save({ session });
      }
    }

    /* ---------- REVERSE SUPPLIER BALANCE ---------- */
    await Supplier.findByIdAndUpdate(
      oldPurchase.supplierId,
      { $inc: { outstandingBalance: -oldPurchase.grandTotal } },
      { session }
    );

    // Delete old accounting entries
    await AccountEntry.deleteMany({
      referenceId: oldPurchase._id,
      referenceType: { $in: ["purchase", "purchase_update"] }
    }).session(session);

    /* ---------- APPLY NEW CHANGES ---------- */
    let newItems = updates.items
      ? parseItemsField(updates.items)
      : oldPurchase.items;
    
    // Validate new items exist
    await validateItemsExist(newItems, req.user.organizationId, session);
    
    // Populate product names if missing
    newItems = await populateProductNames(newItems, req.user.organizationId, session);

    for (const item of newItems) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
      
      let inv = product.inventory.find(
        i => String(i.branchId) === String(oldPurchase.branchId)
      );

      if (!inv) {
        product.inventory.push({ 
          branchId: oldPurchase.branchId, 
          quantity: 0,
          reorderLevel: product.reorderLevel || 10 
        });
        inv = product.inventory.at(-1);
      }

      inv.quantity += Number(item.quantity);
      
      // Update purchase price if provided
      if (item.purchasePrice > 0) {
        product.purchasePrice = item.purchasePrice;
      }

      await product.save({ session });
    }

    /* ---------- UPDATE PURCHASE DOCUMENT ---------- */
    Object.assign(oldPurchase, updates, { items: newItems });
    
    // Recalculate totals if items changed
    if (updates.items) {
      oldPurchase.markModified('items');
    }
    
    updatedPurchase = await oldPurchase.save({ session });

    /* ---------- REBOOK SUPPLIER BALANCE ---------- */
    await Supplier.findByIdAndUpdate(
      updatedPurchase.supplierId,
      { $inc: { outstandingBalance: updatedPurchase.grandTotal } },
      { session }
    );

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
        date: updatedPurchase.purchaseDate || new Date(),
        debit: updatedPurchase.grandTotal,
        credit: 0,
        description: `Purchase Updated: ${updatedPurchase.invoiceNumber || 'No Invoice'}`,
        referenceType: "purchase_update",
        referenceId: updatedPurchase._id,
        createdBy: req.user._id,
        supplierId: updatedPurchase.supplierId
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id,
        supplierId: updatedPurchase.supplierId,
        date: updatedPurchase.purchaseDate || new Date(),
        debit: 0,
        credit: updatedPurchase.grandTotal,
        description: `Supplier Bill Updated: ${updatedPurchase.invoiceNumber || 'No Invoice'}`,
        referenceType: "purchase_update",
        referenceId: updatedPurchase._id,
        createdBy: req.user._id
      }
    ], { session });
  }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

  res.status(200).json({ 
    status: "success", 
    data: { purchase: updatedPurchase } 
  });
});

/* ======================================================
   3. CANCEL PURCHASE (RETURN TO SUPPLIER) - USING STOCKVALIDATIONSERVICE
====================================================== */
exports.cancelPurchase = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason || reason.trim().length < 3) {
    return next(new AppError("Cancellation reason is required (min 3 characters)", 400));
  }

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") throw new AppError("Already cancelled", 400);
    if (purchase.paidAmount > 0) {
      throw new AppError("Cannot cancel purchase with payments. Process refund first.", 400);
    }
    
    // Use StockValidationService to check if cancellation is possible
    const stockValidation = await StockValidationService.validatePurchaseCancellation(
      purchase,
      session
    );
    
    if (!stockValidation.isValid) {
      throw new AppError(`Cannot cancel purchase: ${stockValidation.errors.join(', ')}`, 400);
    }

    // Reduce inventory
    for (const item of purchase.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) continue;
      
      const inv = product.inventory.find(
        i => String(i.branchId) === String(purchase.branchId)
      );

      if (inv) {
        inv.quantity -= item.quantity;
        await product.save({ session });
      }
    }

    // Update supplier balance
    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: -purchase.grandTotal } },
      { session }
    );

    // Accounting entries for return
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
        description: `Purchase Cancelled: ${reason}`,
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
        description: `Inventory Returned: ${purchase.invoiceNumber || 'No Invoice'}`,
        referenceType: "purchase_return",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session });

    // Update purchase status
    purchase.status = "cancelled";
    purchase.paymentStatus = "paid"; // If cancelled, consider it settled
    purchase.paidAmount = 0;
    purchase.balanceAmount = 0;
    purchase.notes = `${purchase.notes || ""}\nCancelled on ${new Date().toLocaleString()}: ${reason}`;
    await purchase.save({ session });
  }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

  res.status(200).json({ 
    status: "success", 
    message: "Purchase cancelled successfully" 
  });
});

/* ======================================================
   4. PARTIAL RETURN
====================================================== */
exports.partialReturn = catchAsync(async (req, res, next) => {
  const { items, reason } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("Items array is required for partial return", 400));
  }
  
  if (!reason || reason.trim().length < 3) {
    return next(new AppError("Return reason is required (min 3 characters)", 400));
  }

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") {
      throw new AppError("Cannot return items from cancelled purchase", 400);
    }

    // Validate return items exist in original purchase
    const returnTotal = { quantity: 0, amount: 0 };
    
    for (const returnItem of items) {
      const originalItem = purchase.items.find(
        item => item.productId.toString() === returnItem.productId
      );
      
      if (!originalItem) {
        throw new AppError(`Product ${returnItem.productId} not found in original purchase`, 400);
      }
      
      if (returnItem.quantity > originalItem.quantity) {
        throw new AppError(`Return quantity exceeds purchased quantity for product ${returnItem.productId}`, 400);
      }
      
      // Validate stock availability for return
      const availableStock = await StockValidationService.getAvailableStock(
        returnItem.productId,
        purchase.branchId,
        purchase.organizationId,
        session
      );
      
      if (availableStock < returnItem.quantity) {
        throw new AppError(`Insufficient stock available for return: Product ${returnItem.productId}`, 400);
      }
      
      // Reduce inventory
      const product = await Product.findById(returnItem.productId).session(session);
      const inv = product.inventory.find(
        i => String(i.branchId) === String(purchase.branchId)
      );
      
      if (inv) {
        inv.quantity -= returnItem.quantity;
        await product.save({ session });
      }
      
      // Calculate return amounts
      const itemTotal = returnItem.quantity * originalItem.purchasePrice;
      returnTotal.quantity += returnItem.quantity;
      returnTotal.amount += itemTotal;
      
      // Update original item quantity
      originalItem.quantity -= returnItem.quantity;
    }
    
    // Remove items with zero quantity
    purchase.items = purchase.items.filter(item => item.quantity > 0);
    
    // If all items are returned, cancel the entire purchase
    if (purchase.items.length === 0) {
      purchase.status = "cancelled";
      purchase.paymentStatus = "paid";
    }
    
    // Recalculate purchase totals (the pre-save hook will handle this)
    purchase.markModified('items');
    await purchase.save({ session });
    
    // Update supplier balance
    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: -returnTotal.amount } },
      { session }
    );
    
    // Accounting entries for partial return
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
        debit: returnTotal.amount,
        credit: 0,
        description: `Partial Return: ${reason}`,
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
        credit: returnTotal.amount,
        description: `Partial Inventory Return: ${purchase.invoiceNumber || 'No Invoice'}`,
        referenceType: "purchase_return",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session });
    
  }, 3, { action: "PARTIAL_RETURN", userId: req.user._id });

  res.status(200).json({ 
    status: "success", 
    message: "Partial return processed successfully" 
  });
});

/* ======================================================
   5. RECORD PAYMENT
====================================================== */
exports.recordPayment = catchAsync(async (req, res, next) => {
  const { amount, paymentMethod, date, reference, notes } = req.body;

  if (!amount || amount <= 0) {
    return next(new AppError("Valid payment amount is required", 400));
  }

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") {
      throw new AppError("Cannot record payment for cancelled purchase", 400);
    }

    const totalPaid = purchase.paidAmount + amount;
    
    if (totalPaid > purchase.grandTotal) {
      throw new AppError("Payment amount exceeds purchase total", 400);
    }

    // Update payment status
    purchase.paidAmount = totalPaid;
    purchase.balanceAmount = purchase.grandTotal - totalPaid;
    
    if (totalPaid === purchase.grandTotal) {
      purchase.paymentStatus = "paid";
    } else if (totalPaid > 0) {
      purchase.paymentStatus = "partial";
    } else {
      purchase.paymentStatus = "unpaid";
    }

    if (paymentMethod) purchase.paymentMethod = paymentMethod;
    purchase.notes = `${purchase.notes || ""}\nPayment recorded: ${amount} on ${new Date().toLocaleString()} ${reference ? `(Ref: ${reference})` : ''}${notes ? ` - ${notes}` : ''}`;
    
    await purchase.save({ session });

    // Accounting entry for payment
    let paymentAccount;
    switch(paymentMethod) {
      case 'cash':
        paymentAccount = await getOrInitAccount(
          req.user.organizationId, "asset", "Cash Account", "1000", session
        );
        break;
      case 'bank':
        paymentAccount = await getOrInitAccount(
          req.user.organizationId, "asset", "Bank Account", "1001", session
        );
        break;
      default:
        paymentAccount = await getOrInitAccount(
          req.user.organizationId, "asset", "Other Payment Account", "1009", session
        );
    }
    
    const apAcc = await getOrInitAccount(
      req.user.organizationId, "liability", "Accounts Payable", "2000", session
    );

    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: paymentAccount._id,
        date: date || new Date(),
        debit: amount,
        credit: 0,
        description: `Payment to Supplier for ${purchase.invoiceNumber || 'Purchase'}`,
        referenceType: "payment",
        referenceId: purchase._id,
        createdBy: req.user._id,
        supplierId: purchase.supplierId
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id,
        supplierId: purchase.supplierId,
        date: date || new Date(),
        debit: 0,
        credit: amount,
        description: `Payment Received ${reference ? `(Ref: ${reference})` : ''}`,
        referenceType: "payment",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session });
  });

  res.status(200).json({ 
    status: "success", 
    message: "Payment recorded successfully" 
  });
});

/* ======================================================
   6. ATTACHMENT DELETE
====================================================== */
exports.deleteAttachment = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return next(new AppError("Purchase not found", 404));

  const url = purchase.attachedFiles[req.params.fileIndex];
  if (!url) return next(new AppError("File not found", 404));

  const publicId = url.split("/").pop().split(".")[0];
  try { 
    await cloudinary.uploader.destroy(`purchases/${publicId}`); 
  } catch (err) {
    console.warn("Failed to delete from Cloudinary:", err.message);
  }

  purchase.attachedFiles.splice(req.params.fileIndex, 1);
  await purchase.save();

  res.status(200).json({ status: "success", message: "Attachment removed" });
});

/* ======================================================
   7. GET PURCHASE ANALYTICS
====================================================== */
exports.getPurchaseAnalytics = catchAsync(async (req, res, next) => {
  const { startDate, endDate, supplierId, status } = req.query;
  
  const match = {
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    isDeleted: false
  };
  
  if (startDate || endDate) {
    match.purchaseDate = {};
    if (startDate) match.purchaseDate.$gte = new Date(startDate);
    if (endDate) match.purchaseDate.$lte = new Date(endDate);
  }
  
  if (supplierId) match.supplierId = supplierId;
  if (status) match.status = status;
  
  const analytics = await Purchase.aggregate([
    { $match: match },
    { 
      $group: {
        _id: null,
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: "$grandTotal" },
        totalPaid: { $sum: "$paidAmount" },
        totalBalance: { $sum: "$balanceAmount" },
        avgPurchaseAmount: { $avg: "$grandTotal" }
      }
    },
    {
      $project: {
        _id: 0,
        totalPurchases: 1,
        totalAmount: 1,
        totalPaid: 1,
        totalBalance: 1,
        avgPurchaseAmount: { $round: ["$avgPurchaseAmount", 2] }
      }
    }
  ]);
  
  const statusCounts = await Purchase.aggregate([
    { $match: { organizationId: req.user.organizationId, branchId: req.user.branchId, isDeleted: false } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  
  const monthlyTrends = await Purchase.aggregate([
    { 
      $match: { 
        organizationId: req.user.organizationId, 
        branchId: req.user.branchId,
        purchaseDate: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) } // Last 6 months
      } 
    },
    {
      $group: {
        _id: { 
          year: { $year: "$purchaseDate" },
          month: { $month: "$purchaseDate" }
        },
        totalAmount: { $sum: "$grandTotal" },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);
  
  res.status(200).json({
    status: "success",
    data: {
      summary: analytics[0] || {},
      statusCounts,
      monthlyTrends
    }
  });
});

/* ======================================================
   8. READ-ONLY OPERATIONS
====================================================== */
exports.deletePurchase = () => {
  throw new AppError("Delete not allowed. Use cancel.", 403);
};

exports.getAllPurchases = factory.getAll(Purchase);
exports.getPurchase = factory.getOne(Purchase, {
  populate: [
    { path: 'items.productId', select: 'name sku category sellingPrice' },
    { path: 'supplierId', select: 'name companyName email phone address' },
    { path: 'createdBy', select: 'name email' },
    { path: 'approvedBy', select: 'name email' },
    { path: 'branchId', select: 'name code' }
  ]
});

/* ======================================================
   9. BULK PURCHASE UPDATE (STATUS, PAYMENT, ETC.)
====================================================== */
exports.bulkUpdatePurchases = catchAsync(async (req, res, next) => {
  const { ids, updates } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new AppError("IDs array is required", 400));
  }
  
  if (!updates || typeof updates !== 'object') {
    return next(new AppError("Updates object is required", 400));
  }
  
  // Prevent bulk updates on sensitive fields
  const forbiddenFields = ['items', 'grandTotal', 'paidAmount', 'balanceAmount', 'status'];
  for (const field of forbiddenFields) {
    if (field in updates) {
      return next(new AppError(`Cannot bulk update '${field}' field`, 400));
    }
  }
  
  const result = await Purchase.updateMany(
    {
      _id: { $in: ids },
      organizationId: req.user.organizationId
    },
    updates,
    { runValidators: true }
  );
  
  res.status(200).json({
    status: "success",
    message: `Updated ${result.modifiedCount} purchase(s)`,
    data: { modifiedCount: result.modifiedCount }
  });
});
// Add to your purchase.controller.js

/* ======================================================
   10. ADDITIONAL ATTACHMENTS
====================================================== */
exports.addAttachments = catchAsync(async (req, res, next) => {
  if (!req.files?.length) {
    return next(new AppError("No files uploaded", 400));
  }

  const purchase = await Purchase.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });

  if (!purchase) return next(new AppError("Purchase not found", 404));

  const newFiles = [];
  for (const f of req.files) {
    newFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
  }

  purchase.attachedFiles.push(...newFiles);
  await purchase.save();

  res.status(200).json({
    status: "success",
    message: `${newFiles.length} file(s) added`,
    data: { purchase }
  });
});

/* ======================================================
   11. GET PAYMENT HISTORY
====================================================== */
exports.getPaymentHistory = catchAsync(async (req, res, next) => {
  const payments = await AccountEntry.find({
    referenceId: req.params.id,
    referenceType: "payment",
    organizationId: req.user.organizationId
  }).sort('-date').populate('accountId', 'name code');

  res.status(200).json({
    status: "success",
    results: payments.length,
    data: { payments }
  });
});

/* ======================================================
   12. DELETE PAYMENT
====================================================== */
exports.deletePayment = catchAsync(async (req, res, next) => {
  await runInTransaction(async (session) => {
    const payment = await AccountEntry.findOne({
      _id: req.params.paymentId,
      referenceId: req.params.id,
      referenceType: "payment",
      organizationId: req.user.organizationId
    }).session(session);

    if (!payment) throw new AppError("Payment not found", 404);

    const purchase = await Purchase.findById(req.params.id).session(session);
    if (!purchase) throw new AppError("Purchase not found", 404);

    // Reverse the payment
    purchase.paidAmount -= payment.credit;
    purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;

    // Update payment status
    if (purchase.paidAmount === 0) {
      purchase.paymentStatus = "unpaid";
    } else if (purchase.paidAmount < purchase.grandTotal) {
      purchase.paymentStatus = "partial";
    }

    await purchase.save({ session });
    await payment.deleteOne({ session });
  });

  res.status(200).json({
    status: "success",
    message: "Payment deleted successfully"
  });
});

/* ======================================================
   13. UPDATE STATUS
====================================================== */
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status, notes } = req.body;

  if (!['draft', 'received', 'cancelled', 'approved', 'pending'].includes(status)) {
    return next(new AppError("Invalid status", 400));
  }

  const purchase = await Purchase.findOneAndUpdate(
    {
      _id: req.params.id,
      organizationId: req.user.organizationId
    },
    {
      status,
      $push: {
        notes: notes ? `Status changed to ${status}: ${notes}` : `Status changed to ${status}`
      }
    },
    { new: true, runValidators: true }
  );

  if (!purchase) return next(new AppError("Purchase not found", 404));

  res.status(200).json({
    status: "success",
    data: { purchase }
  });
});

/* ======================================================
   14. GET PENDING PAYMENTS
====================================================== */
exports.getPendingPayments = catchAsync(async (req, res, next) => {
  const { days = 30 } = req.query;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

  const pendingPayments = await Purchase.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(req.user.organizationId),
        branchId: mongoose.Types.ObjectId(req.user.branchId),
        status: { $in: ['received', 'approved'] },
        paymentStatus: { $in: ['unpaid', 'partial'] },
        balanceAmount: { $gt: 0 },
        purchaseDate: { $gte: cutoffDate },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: "$supplierId",
        totalBalance: { $sum: "$balanceAmount" },
        purchaseCount: { $sum: 1 },
        oldestDueDate: { $min: "$dueDate" }
      }
    },
    {
      $lookup: {
        from: "suppliers",
        localField: "_id",
        foreignField: "_id",
        as: "supplier"
      }
    },
    { $unwind: "$supplier" },
    { $sort: { totalBalance: -1 } }
  ]);

  res.status(200).json({
    status: "success",
    results: pendingPayments.length,
    data: { pendingPayments }
  });
});

// const mongoose = require("mongoose");
// const Purchase = require("./purchase.model");
// const Supplier = require("../../organization/core/supplier.model");
// const Product = require("./product.model");
// const AccountEntry = require("../../accounting/core/accountEntry.model");
// const Account = require("../../accounting/core/account.model");

// const catchAsync = require("../../../core/utils/catchAsync");
// const AppError = require("../../../core/utils/appError");
// const factory = require("../../../core/utils/handlerFactory");
// const { runInTransaction } = require("../../../core/utils/runInTransaction");

// const fileUploadService = require("../../_legacy/services/uploads/fileUploadService");
// const cloudinary = require("cloudinary").v2;
// const { invalidateOpeningBalance } = require("../../accounting/core/ledgerCache.service");

// const StockValidationService = require('../../_legacy/services/stockValidationService');

// /* ======================================================
//    3. CANCEL PURCHASE (RETURN TO SUPPLIER) - ENHANCED
// ====================================================== */
// exports.cancelPurchase = catchAsync(async (req, res, next) => {
//   const { reason } = req.body;

//   await runInTransaction(async (session) => {
//     const purchase = await Purchase.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     }).populate('items.productId').session(session);

//     if (!purchase) throw new AppError("Purchase not found", 404);
//     if (purchase.status === "cancelled") throw new AppError("Already cancelled", 400);
    
//     // Enhanced stock validation
//     const stockValidation = await StockValidationService.validatePurchaseCancellation(
//       purchase,
//       session
//     );
    
//     if (!stockValidation.isValid) {
//       throw new AppError(stockValidation.errors.join(', '), 400);
//     }

//     // Reduce inventory
//     for (const item of purchase.items) {
//       const product = await Product.findById(item.productId).session(session);
//       const inv = product.inventory.find(
//         i => String(i.branchId) === String(purchase.branchId)
//       );

//       if (inv) {
//         inv.quantity -= item.quantity;
//         await product.save({ session });
//       }
//     }

//     // Update supplier balance
//     await Supplier.findByIdAndUpdate(
//       purchase.supplierId,
//       { $inc: { outstandingBalance: -purchase.grandTotal } },
//       { session }
//     );

//     // Accounting entries
//     const inventoryAcc = await getOrInitAccount(
//       req.user.organizationId, "asset", "Inventory Asset", "1500", session
//     );
//     const apAcc = await getOrInitAccount(
//       req.user.organizationId, "liability", "Accounts Payable", "2000", session
//     );

//     await AccountEntry.create([
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: apAcc._id,
//         supplierId: purchase.supplierId,
//         date: new Date(),
//         debit: purchase.grandTotal,
//         credit: 0,
//         description: `Purchase Cancelled: ${reason}`,
//         referenceType: "purchase_return",
//         referenceId: purchase._id,
//         createdBy: req.user._id
//       },
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: inventoryAcc._id,
//         date: new Date(),
//         debit: 0,
//         credit: purchase.grandTotal,
//         description: `Inventory Returned: ${purchase.invoiceNumber}`,
//         referenceType: "purchase_return",
//         referenceId: purchase._id,
//         createdBy: req.user._id
//       }
//     ], { session });

//     // Update purchase status
//     purchase.status = "cancelled";
//     purchase.notes = `${purchase.notes || ""}\nCancelled: ${reason}`;
//     await purchase.save({ session });
//   }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

//   res.status(200).json({ 
//     status: "success", 
//     message: "Purchase cancelled successfully" 
//   });
// });

// /* ======================================================
//    ACCOUNT HELPER (IDEMPOTENT)
// ====================================================== */
// async function getOrInitAccount(orgId, type, name, code, session) {
//   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
//   if (!account) {
//     const created = await Account.create([{
//       organizationId: orgId,
//       name,
//       code,
//       type,
//       isGroup: false,
//       cachedBalance: 0
//     }], { session });
//     return created[0];
//   }
//   return account;
// }

// /* ======================================================
//    UTILS
// ====================================================== */
// function parseItemsField(items) {
//   if (!items) return [];
//   if (typeof items === "string") {
//     try {
//       return JSON.parse(items);
//     } catch {
//       throw new AppError("Invalid items JSON", 400);
//     }
//   }
//   return items;
// }

// /* ======================================================
//    1. CREATE PURCHASE
// ====================================================== */
// exports.createPurchase = catchAsync(async (req, res, next) => {
//   const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
//   const items = parseItemsField(req.body.items);

//   if (!supplierId || !items.length) {
//     return next(new AppError("Supplier and items are required", 400));
//   }

//   await runInTransaction(async (session) => {
//     /* ---------- FILE UPLOAD ---------- */
//     const attachedFiles = [];
//     if (req.files?.length) {
//       for (const f of req.files) {
//         attachedFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
//       }
//     }

//     /* ---------- CREATE PURCHASE ---------- */
//     const [purchase] = await Purchase.create([{
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       supplierId,
//       invoiceNumber,
//       purchaseDate,
//       dueDate,
//       items,
//       paidAmount: 0,
//       paymentStatus: "unpaid",
//       status: status || "received",
//       notes,
//       attachedFiles,
//       createdBy: req.user._id
//     }], { session });

//     await invalidateOpeningBalance(req.user.organizationId);

//     /* ---------- INVENTORY UPDATE ---------- */
//     for (const item of items) {
//       const product = await Product.findById(item.productId).session(session);
//       if (!product) throw new AppError("Product not found", 404);

//       let inventory = product.inventory.find(
//         i => String(i.branchId) === String(req.user.branchId)
//       );

//       if (!inventory) {
//         product.inventory.push({ branchId: req.user.branchId, quantity: 0 });
//         inventory = product.inventory.at(-1);
//       }

//       inventory.quantity += Number(item.quantity);

//       if (item.purchasePrice > 0) {
//         product.purchasePrice = item.purchasePrice;
//       }

//       await product.save({ session });
//     }

//     /* ---------- SUPPLIER BALANCE ---------- */
//     await Supplier.findByIdAndUpdate(
//       supplierId,
//       { $inc: { outstandingBalance: purchase.grandTotal } },
//       { session }
//     );

//     /* ---------- ACCOUNTING ---------- */
//     const inventoryAcc = await getOrInitAccount(
//       req.user.organizationId, "asset", "Inventory Asset", "1500", session
//     );
//     const apAcc = await getOrInitAccount(
//       req.user.organizationId, "liability", "Accounts Payable", "2000", session
//     );

//     // Dr Inventory
//     // Cr Accounts Payable
//     await AccountEntry.create([
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: inventoryAcc._id,
//         date: purchase.purchaseDate,
//         debit: purchase.grandTotal,
//         credit: 0,
//         description: `Purchase: ${invoiceNumber}`,
//         referenceType: "purchase",
//         referenceId: purchase._id,
//         createdBy: req.user._id
//       },
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: apAcc._id,
//         supplierId,
//         date: purchase.purchaseDate,
//         debit: 0,
//         credit: purchase.grandTotal,
//         description: `Supplier Bill: ${invoiceNumber}`,
//         referenceType: "purchase",
//         referenceId: purchase._id,
//         createdBy: req.user._id
//       }
//     ], { session });
//   }, 3, { action: "CREATE_PURCHASE", userId: req.user._id });

//   res.status(201).json({ status: "success", message: "Purchase recorded successfully" });
// });

// /* ======================================================
//    2. UPDATE PURCHASE (FULL REVERSAL + REBOOK)
// ====================================================== */
// exports.updatePurchase = catchAsync(async (req, res, next) => {
//   const updates = req.body;
//   let updatedPurchase;

//   const newFiles = [];
//   if (req.files?.length) {
//     for (const f of req.files) {
//       newFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
//     }
//   }

//   await runInTransaction(async (session) => {
//     const oldPurchase = await Purchase.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!oldPurchase) throw new AppError("Purchase not found", 404);
//     if (oldPurchase.status === "cancelled") {
//       throw new AppError("Cancelled purchase cannot be edited", 400);
//     }

//     if (newFiles.length) {
//       updates.attachedFiles = [...oldPurchase.attachedFiles, ...newFiles];
//     }

//     const financialChange = updates.items || updates.tax || updates.discount;
//     if (!financialChange) {
//       updatedPurchase = await Purchase.findByIdAndUpdate(
//         oldPurchase._id, updates, { new: true, session }
//       );
//       return;
//     }

//     /* ---------- REVERSE OLD INVENTORY ---------- */
//     for (const item of oldPurchase.items) {
//       const product = await Product.findById(item.productId).session(session);
//       const inv = product.inventory.find(
//         i => String(i.branchId) === String(oldPurchase.branchId)
//       );

//       if (!inv || inv.quantity < item.quantity) {
//         throw new AppError(
//           `Cannot update: Stock already consumed for ${product.name}`,
//           400
//         );
//       }

//       inv.quantity -= item.quantity;
//       await product.save({ session });
//     }

//     /* ---------- REVERSE LEDGER + SUPPLIER ---------- */
//     await Supplier.findByIdAndUpdate(
//       oldPurchase.supplierId,
//       { $inc: { outstandingBalance: -oldPurchase.grandTotal } },
//       { session }
//     );

//     await AccountEntry.deleteMany({
//       referenceId: oldPurchase._id,
//       referenceType: "purchase"
//     }).session(session);

//     /* ---------- APPLY NEW ---------- */
//     const newItems = updates.items
//       ? parseItemsField(updates.items)
//       : oldPurchase.items;

//     for (const item of newItems) {
//       const product = await Product.findById(item.productId).session(session);
//       let inv = product.inventory.find(
//         i => String(i.branchId) === String(oldPurchase.branchId)
//       );

//       if (!inv) {
//         product.inventory.push({ branchId: oldPurchase.branchId, quantity: 0 });
//         inv = product.inventory.at(-1);
//       }

//       inv.quantity += Number(item.quantity);
//       if (item.purchasePrice > 0) product.purchasePrice = item.purchasePrice;

//       await product.save({ session });
//     }

//     Object.assign(oldPurchase, updates, { items: newItems });
//     updatedPurchase = await oldPurchase.save({ session });

//     /* ---------- REBOOK LEDGER ---------- */
//     const inventoryAcc = await getOrInitAccount(
//       req.user.organizationId, "asset", "Inventory Asset", "1500", session
//     );
//     const apAcc = await getOrInitAccount(
//       req.user.organizationId, "liability", "Accounts Payable", "2000", session
//     );

//     await AccountEntry.create([
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: inventoryAcc._id,
//         date: updatedPurchase.purchaseDate,
//         debit: updatedPurchase.grandTotal,
//         credit: 0,
//         description: `Purchase Updated: ${updatedPurchase.invoiceNumber}`,
//         referenceType: "purchase",
//         referenceId: updatedPurchase._id,
//         createdBy: req.user._id
//       },
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: apAcc._id,
//         supplierId: updatedPurchase.supplierId,
//         date: updatedPurchase.purchaseDate,
//         debit: 0,
//         credit: updatedPurchase.grandTotal,
//         description: `Supplier Bill Updated`,
//         referenceType: "purchase",
//         referenceId: updatedPurchase._id,
//         createdBy: req.user._id
//       }
//     ], { session });
//   }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

//   res.status(200).json({ status: "success", data: { purchase: updatedPurchase } });
// });

// // 
// /* ======================================================
//    4. ATTACHMENT DELETE
// ====================================================== */
// exports.deleteAttachment = catchAsync(async (req, res, next) => {
//   const purchase = await Purchase.findById(req.params.id);
//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   const url = purchase.attachedFiles[req.params.fileIndex];
//   if (!url) return next(new AppError("File not found", 404));

//   const publicId = url.split("/").pop().split(".")[0];
//   try { await cloudinary.uploader.destroy(`purchases/${publicId}`); } catch {}

//   purchase.attachedFiles.splice(req.params.fileIndex, 1);
//   await purchase.save();

//   res.status(200).json({ status: "success", message: "Attachment removed" });
// });

// /* ======================================================
//    5. READ-ONLY
// ====================================================== */
// exports.deletePurchase = () => {
//   throw new AppError("Delete not allowed. Use cancel.", 403);
// };

// exports.getAllPurchases = factory.getAll(Purchase);
// exports.getPurchase = factory.getOne(Purchase, {
//   populate: [
//     { path: 'items.productId' },
//     { path: 'supplierId' }
//   ]
// });


/* ======================================================
//    3. CANCEL PURCHASE (RETURN TO SUPPLIER)
// ====================================================== */
// exports.cancelPurchase = catchAsync(async (req, res, next) => {
//   const { reason } = req.body;

//   await runInTransaction(async (session) => {
//     const purchase = await Purchase.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!purchase) throw new AppError("Purchase not found", 404);
//     if (purchase.status === "cancelled") throw new AppError("Already cancelled", 400);

//     for (const item of purchase.items) {
//       const product = await Product.findById(item.productId).session(session);
//       const inv = product.inventory.find(
//         i => String(i.branchId) === String(purchase.branchId)
//       );

//       if (!inv || inv.quantity < item.quantity) {
//         throw new AppError(`Stock already consumed: ${product.name}`, 400);
//       }

//       inv.quantity -= item.quantity;
//       await product.save({ session });
//     }

//     await Supplier.findByIdAndUpdate(
//       purchase.supplierId,
//       { $inc: { outstandingBalance: -purchase.grandTotal } },
//       { session }
//     );

//     const inventoryAcc = await getOrInitAccount(
//       req.user.organizationId, "asset", "Inventory Asset", "1500", session
//     );
//     const apAcc = await getOrInitAccount(
//       req.user.organizationId, "liability", "Accounts Payable", "2000", session
//     );

//     await AccountEntry.create([
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: apAcc._id,
//         supplierId: purchase.supplierId,
//         date: new Date(),
//         debit: purchase.grandTotal,
//         credit: 0,
//         description: `Purchase Cancelled`,
//         referenceType: "purchase_return",
//         referenceId: purchase._id,
//         createdBy: req.user._id
//       },
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: inventoryAcc._id,
//         date: new Date(),
//         debit: 0,
//         credit: purchase.grandTotal,
//         description: `Inventory Returned`,
//         referenceType: "purchase_return",
//         referenceId: purchase._id,
//         createdBy: req.user._id
//       }
//     ], { session });

//     purchase.status = "cancelled";
//     purchase.notes = `${purchase.notes || ""}\nCancelled: ${reason}`;
//     await purchase.save({ session });
//   }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

//   res.status(200).json({ status: "success", message: "Purchase cancelled" });
// });
