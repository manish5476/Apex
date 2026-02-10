const mongoose = require("mongoose");
const Purchase = require("./purchase.model");
const PurchaseReturn = require("./purchase.return.model");
const Supplier = require("../../organization/core/supplier.model");
const Payment = require("../../accounting/payments/payment.model"); // Fixed path
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
   HELPER: Get or Init Account
====================================================== */
async function getOrInitAccount(orgId, type, name, code, session) {
  let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!account) {
    try {
      account = (await Account.create([{
        organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0
      }], { session, ordered: true }))[0];
    } catch (err) {
      // Handle race condition
      if (err.code === 11000) account = await Account.findOne({ organizationId: orgId, code }).session(session);
      else throw err;
    }
  }
  return account;
}

async function updateStockAtomically(items, branchId, orgId, type = 'increment', session) {
  // Use Promise.all to run all updates in parallel (Performance Fix)
  await Promise.all(items.map(async (item) => {
    const adjustment = type === 'increment' ? item.quantity : -item.quantity;

    // 1. Prepare the Update (Increment logic)
    const updateOp = {
      $inc: { "inventory.$.quantity": adjustment }
    };

    // Update purchase price ONLY on increment (receiving goods)
    if (type === 'increment' && item.purchasePrice > 0) {
      updateOp.$set = { purchasePrice: item.purchasePrice };
    }

    // 2. Try to Update Existing Branch Inventory
    const result = await Product.findOneAndUpdate(
      {
        _id: item.productId,
        organizationId: orgId, // Tenancy Check
        "inventory.branchId": branchId
      },
      updateOp,
      {
        session,
        new: true,
        runValidators: true // CRITICAL: Prevents negative stock
      }
    );

    // 3. Fallback: If Product exists but Branch Inventory does not
    if (!result) {
      // Check if product actually exists (to avoid phantom updates)
      const productExists = await Product.exists({ _id: item.productId, organizationId: orgId }).session(session);
      if (!productExists) throw new AppError(`Product ${item.productId} not found`, 404);

      // Prepare the Push Operation
      const pushOp = {
        $push: {
          inventory: {
            branchId: branchId,
            quantity: type === 'increment' ? item.quantity : 0
          }
        }
      };

      // BUG FIX: Update price even if it's a new inventory entry
      if (type === 'increment' && item.purchasePrice > 0) {
        pushOp.$set = { purchasePrice: item.purchasePrice };
      }

      await Product.updateOne(
        { _id: item.productId, organizationId: orgId },
        pushOp,
        { session, runValidators: true }
      );
    }
  }));
}
/* ======================================================
   1. CREATE PURCHASE (Optimized)
====================================================== */
exports.createPurchase = catchAsync(async (req, res, next) => {
  const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;

  // 1. Parse Items
  let items = req.body.items;
  if (typeof items === "string") items = JSON.parse(items);
  if (!supplierId || !items?.length) return next(new AppError("Supplier and items are required", 400));

  // 2. Fetch Products efficiently (Batch Query)
  const productIds = items.map(i => i.productId);
  const products = await Product.find({
    _id: { $in: productIds },
    organizationId: req.user.organizationId
  }).select('name');

  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  // 3. Enrich & Calculate
  let subTotal = 0, totalTax = 0, totalDiscount = 0;

  const enrichedItems = items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

    const qty = Number(item.quantity);
    const price = Number(item.purchasePrice);
    const discount = Number(item.discount || 0);
    const taxRate = Number(item.taxRate || 0);

    const itemTotal = price * qty;
    const taxableAmount = itemTotal - discount;
    const taxAmount = (taxableAmount * taxRate) / 100;

    subTotal += itemTotal;
    totalDiscount += discount;
    totalTax += taxAmount;

    return {
      ...item,
      name: product.name, // Name from DB
      productId: item.productId,
      quantity: qty,
      purchasePrice: price,
      taxRate: taxRate,
      discount: discount
    };
  });

  const grandTotal = subTotal + totalTax - totalDiscount;
  const paidAmount = Number(req.body.paidAmount) || 0;

  // Determine Payment Status
  let paymentStatus = 'unpaid';
  if (paidAmount > 0) paymentStatus = paidAmount >= grandTotal ? 'paid' : 'partial';

  await runInTransaction(async (session) => {
    // 4. Handle File Uploads
    const attachedFiles = [];
    if (req.files?.length) {
      for (const f of req.files) {
        attachedFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
      }
    }

    // 5. Create Purchase
    const [purchase] = await Purchase.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      supplierId,
      invoiceNumber,
      purchaseDate: purchaseDate || new Date(),
      dueDate,
      items: enrichedItems,
      subTotal, totalTax, totalDiscount, grandTotal,
      paidAmount,
      balanceAmount: grandTotal - paidAmount,
      paymentStatus,
      status: status || "received",
      notes,
      attachedFiles,
      createdBy: req.user._id
    }], { session, ordered: true });

    // 6. Update Inventory
    await updateStockAtomically(enrichedItems, req.user.branchId, req.user.organizationId, 'increment', session);

    // 7. Update Supplier (Increase Liability by FULL amount)
    await Supplier.findByIdAndUpdate(
      supplierId,
      { $inc: { outstandingBalance: purchase.grandTotal } },
      { session }
    );
    // 8. Record Payment (If Initial Pay)
    // if (paidAmount > 0) {
    //     const payment = (await Payment.create([{
    //         organizationId: req.user.organizationId,
    //         branchId: req.user.branchId,
    //         type: 'outflow',
    //         supplierId: supplierId,
    //         purchaseId: purchase._id,
    //         paymentDate: purchase.purchaseDate,
    //         amount: paidAmount,
    //         paymentMethod: req.body.paymentMethod || 'cash',
    //         transactionMode: 'manual',
    //         status: 'completed',
    //         remarks: `Initial Payment for ${invoiceNumber}`,
    //         createdBy: req.user._id
    //     }], { session, ordered: true }))[0];
    if (paidAmount > 0) {
      const payment = (await Payment.create([{
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        type: 'outflow',
        supplierId: supplierId,
        purchaseId: purchase._id,
        paymentDate: purchase.purchaseDate,
        amount: paidAmount,
        paymentMethod: req.body.paymentMethod || 'cash',
        transactionMode: 'manual',
        status: 'completed',
        remarks: `Initial Payment for ${invoiceNumber}`,
        createdBy: req.user._id
      }], { session, ordered: true }))[0];

      // Decrease Supplier Liability for the payment
      await Supplier.findByIdAndUpdate(
        supplierId,
        { $inc: { outstandingBalance: -paidAmount } },
        { session }
      );
      // Accounting: Dr AP, Cr Asset
      const assetAccName = req.body.paymentMethod === 'bank' ? 'Bank' : 'Cash';
      const assetAccCode = req.body.paymentMethod === 'bank' ? '1002' : '1001';

      const assetAcc = await getOrInitAccount(req.user.organizationId, "asset", assetAccName, assetAccCode, session);
      const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

      await AccountEntry.create([
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          accountId: apAcc._id, // Dr AP
          debit: paidAmount, credit: 0,
          referenceType: "payment", referenceId: payment._id,
          supplierId, createdBy: req.user._id,
          description: `Payment for Purchase ${invoiceNumber}`
        },
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          accountId: assetAcc._id, // Cr Asset
          debit: 0, credit: paidAmount,
          referenceType: "payment", referenceId: payment._id,
          supplierId, createdBy: req.user._id,
          description: `Payment for Purchase ${invoiceNumber}`
        }
      ], { session, ordered: true });
    }

    // 9. Purchase Accounting: Dr Inventory, Cr AP
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, "asset", "Inventory Asset", "1500", session);
    const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: inventoryAcc._id, // Dr Inventory
        debit: purchase.grandTotal, credit: 0,
        referenceType: "purchase", referenceId: purchase._id,
        supplierId, createdBy: req.user._id, description: `Purchase: ${invoiceNumber}`
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id, // Cr AP
        debit: 0, credit: purchase.grandTotal,
        referenceType: "purchase", referenceId: purchase._id,
        supplierId, createdBy: req.user._id, description: `Bill: ${invoiceNumber}`
      }
    ], { session, ordered: true });

  }, 3, { action: "CREATE_PURCHASE", userId: req.user._id });

  res.status(201).json({ status: "success", message: "Purchase recorded successfully" });
});
/* ======================================================
   2. UPDATE PURCHASE (FULL REVERSAL + REBOOK)
====================================================== */
exports.updatePurchase = catchAsync(async (req, res, next) => {
  const updates = req.body;
  let updatedPurchase;

  // Handle files
  const newFiles = [];
  if (req.files?.length) {
    for (const f of req.files) newFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
  }

  await runInTransaction(async (session) => {
    const oldPurchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!oldPurchase) throw new AppError("Purchase not found", 404);
    if (oldPurchase.status === "cancelled") throw new AppError("Cancelled purchase cannot be edited", 400);

    if (newFiles.length) updates.attachedFiles = [...oldPurchase.attachedFiles, ...newFiles];

    // Non-financial updates
    const financialChange = updates.items || updates.tax || updates.discount;
    if (!financialChange) {
      updatedPurchase = await Purchase.findByIdAndUpdate(oldPurchase._id, updates, { new: true, session });
      return;
    }

    // A. REVERSE EVERYTHING
    // 1. Restore Stock (Take back what we bought)
    await updateStockAtomically(oldPurchase.items, oldPurchase.branchId, req.user.organizationId, 'decrement', session);

    // 2. Reverse Supplier Balance
    await Supplier.findByIdAndUpdate(
      oldPurchase.supplierId,
      { $inc: { outstandingBalance: -(oldPurchase.grandTotal - oldPurchase.paidAmount) } },
      { session }
    );

    // 3. Delete old Accounting (Simple approach: delete & recreate)
    // Note: Deleting payments related to this purchase might be dangerous if they were reconciled.
    // Ideally, block financial updates if payments exist, or handle gracefully.
    if (oldPurchase.paidAmount > 0) {
      throw new AppError("Cannot edit financial details of a purchase that has payments. Cancel and recreate.", 400);
    }

    await AccountEntry.deleteMany({
      referenceId: oldPurchase._id,
      referenceType: "purchase"
    }).session(session);

    // B. APPLY NEW CHANGES
    let newItems = updates.items;
    if (typeof newItems === 'string') newItems = JSON.parse(newItems);

    // Enrich
    const enrichedItems = await Promise.all(newItems.map(async (item) => {
      const product = await Product.findById(item.productId).select('name');
      return { ...item, name: product.name };
    }));

    // Save Purchase
    Object.assign(oldPurchase, updates, { items: enrichedItems });
    updatedPurchase = await oldPurchase.save({ session });

    // C. APPLY NEW STOCK
    await updateStockAtomically(enrichedItems, req.user.branchId, req.user.organizationId, 'increment', session);

    // D. UPDATE SUPPLIER
    await Supplier.findByIdAndUpdate(
      updatedPurchase.supplierId,
      { $inc: { outstandingBalance: updatedPurchase.grandTotal } }, // Assume unpaid for simplicity in edit
      { session }
    );

    // E. NEW ACCOUNTING
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, "asset", "Inventory Asset", "1500", session);
    const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

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
        supplierId: updatedPurchase.supplierId,
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
        description: `Bill Updated: ${updatedPurchase.invoiceNumber}`,
        referenceType: "purchase",
        referenceId: updatedPurchase._id,
        createdBy: req.user._id
      }
    ], { session, ordered: true });

  }, 3, { action: "UPDATE_PURCHASE", userId: req.user._id });

  res.status(200).json({ status: "success", data: { purchase: updatedPurchase } });
});

/* ======================================================
   3. CANCEL PURCHASE
====================================================== */
// exports.cancelPurchase = catchAsync(async (req, res, next) => {
//   const { reason } = req.body;
//   if (!reason) return next(new AppError("Cancellation reason is required", 400));

//   await runInTransaction(async (session) => {
//     const purchase = await Purchase.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
//     if (!purchase) throw new AppError("Purchase not found", 404);
//     if (purchase.status === "cancelled") throw new AppError("Already cancelled", 400);
//     if (purchase.paidAmount > 0) throw new AppError("Cannot cancel purchase with payments. Refund first.", 400);

//     // 1. Reverse Stock
//     await updateStockAtomically(purchase.items, purchase.branchId, req.user.organizationId, 'decrement', session);

//     // 2. Update Supplier
//     await Supplier.findByIdAndUpdate(
//       purchase.supplierId,
//       { $inc: { outstandingBalance: -purchase.grandTotal } },
//       { session }
//     );

//     // 3. Accounting (Reversal)
//     const inventoryAcc = await getOrInitAccount(req.user.organizationId, "asset", "Inventory Asset", "1500", session);
//     const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

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
//     ], { session, ordered: true });

//     // 4. Update Status
//     purchase.status = "cancelled";
//     purchase.notes = `${purchase.notes || ""}\nCancelled: ${reason}`;
//     await purchase.save({ session });

//   }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

//   res.status(200).json({ status: "success", message: "Purchase cancelled successfully" });
// });
/* ======================================================
   3. CANCEL PURCHASE (With Stock Validation)
====================================================== */
exports.cancelPurchase = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  if (!reason) return next(new AppError("Cancellation reason is required", 400));

  await runInTransaction(async (session) => {
    // 1. Fetch Purchase
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") throw new AppError("Already cancelled", 400);

    // Check for payments
    if (purchase.paidAmount > 0) {
      throw new AppError("Cannot cancel purchase with payments. Please delete payments first.", 400);
    }

    // ============================================================
    // 2. CRITICAL SAFETY CHECK: Validate Stock Availability
    // ============================================================
    // If the status is 'received', it means we added stock previously.
    // We must ensure that stock still exists before removing it.
    if (purchase.status === 'received') {
      const productIds = purchase.items.map(i => i.productId);

      // Fetch current stock levels for these products
      const products = await Product.find({
        _id: { $in: productIds },
        organizationId: req.user.organizationId
      }).session(session);

      const productMap = new Map(products.map(p => [p._id.toString(), p]));

      for (const item of purchase.items) {
        const product = productMap.get(item.productId.toString());

        if (!product) {
          throw new AppError(`Cannot cancel: Product '${item.name}' no longer exists in system`, 400);
        }

        // Find stock for this specific branch
        const branchInventory = product.inventory?.find(
          inv => inv.branchId.toString() === purchase.branchId.toString()
        );

        const currentQty = branchInventory ? branchInventory.quantity : 0;

        // CHECK: Do we have enough to return?
        if (currentQty < item.quantity) {
          throw new AppError(
            `Cannot cancel purchase. Product '${item.name}' has insufficient stock. 
             Required to return: ${item.quantity}, Available: ${currentQty}. 
             (Items may have been sold or transferred)`,
            400
          );
        }
      }
    }
    // ============================================================

    // 3. Reverse Stock (Safe to proceed now)
    // Only decrement if status was 'received'. If 'draft', no stock was ever added.
    if (purchase.status === 'received') {
      await updateStockAtomically(purchase.items, purchase.branchId, req.user.organizationId, 'decrement', session);

      // 4. Reverse Supplier Balance
      await Supplier.findByIdAndUpdate(
        purchase.supplierId,
        { $inc: { outstandingBalance: -purchase.grandTotal } },
        { session }
      );

      // 5. Accounting (Reversal)
      const inventoryAcc = await getOrInitAccount(req.user.organizationId, "asset", "Inventory Asset", "1500", session);
      const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

      await AccountEntry.create([
        {
          organizationId: req.user.organizationId,
          branchId: req.user.branchId,
          accountId: apAcc._id, // Debit Liability (Reduce Debt)
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
          accountId: inventoryAcc._id, // Credit Asset (Reduce Inventory Value)
          date: new Date(),
          debit: 0,
          credit: purchase.grandTotal,
          description: `Inventory Returned: ${purchase.invoiceNumber}`,
          referenceType: "purchase_return",
          referenceId: purchase._id,
          createdBy: req.user._id
        }
      ], { session, ordered: true });
    }

    // 6. Update Status
    purchase.status = "cancelled";
    purchase.notes = `${purchase.notes || ""}\nCancelled on ${new Date().toLocaleDateString()}: ${reason}`;
    await purchase.save({ session });

  }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

  res.status(200).json({ status: "success", message: "Purchase cancelled successfully" });
});

// /* ======================================================
//    5. PARTIAL RETURN (Debit Note)
// ====================================================== */
exports.partialReturn = catchAsync(async (req, res, next) => {
  const { items, reason } = req.body;
  if (!items || !items.length || !reason) return next(new AppError("Items and reason required", 400));

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findById(req.params.id).session(session);
    if (!purchase) throw new AppError("Purchase not found", 404);

    let totalReturnAmount = 0;
    const returnItems = [];

    // 1. Calculate Refund/Return Totals
    for (const retItem of items) {
      const originalItem = purchase.items.find(i => String(i.productId) === retItem.productId);
      if (!originalItem || originalItem.quantity < retItem.quantity) {
        throw new AppError(`Invalid return quantity for product ${retItem.productId}`, 400);
      }

      // Calculate proportional value
      const itemBasePrice = originalItem.purchasePrice * retItem.quantity;
      const itemTax = (originalItem.taxRate / 100) * itemBasePrice;
      const itemTotal = itemBasePrice + itemTax;

      totalReturnAmount += itemTotal;
      returnItems.push({
        productId: retItem.productId,
        name: originalItem.name,
        quantity: retItem.quantity,
        returnPrice: originalItem.purchasePrice,
        total: itemTotal
      });

      // Reduce qty in purchase doc
      originalItem.quantity -= retItem.quantity;
    }

    // 2. Create Purchase Return Document (Audit Trail)
    await PurchaseReturn.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      purchaseId: purchase._id,
      supplierId: purchase.supplierId,
      items: returnItems,
      totalAmount: totalReturnAmount,
      reason: reason,
      createdBy: req.user._id
    }], { session, ordered: true });

    // 3. Remove Stock
    await updateStockAtomically(returnItems, purchase.branchId, req.user.organizationId, 'decrement', session);

    // 4. Reduce Supplier Balance
    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: -totalReturnAmount } },
      { session }
    );

    // 5. Accounting (Dr AP, Cr Inventory)
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, "asset", "Inventory Asset", "1500", session);
    const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id, // Dr AP (We owe less)
        debit: totalReturnAmount,
        credit: 0,
        description: `Partial Return: ${reason}`,
        referenceType: "purchase_return",
        referenceId: purchase._id,
        createdBy: req.user._id
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: inventoryAcc._id, // Cr Inventory (Stock reduced)
        debit: 0,
        credit: totalReturnAmount,
        description: `Inventory Returned: ${purchase.invoiceNumber}`,
        referenceType: "purchase_return",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session, ordered: true });

    // 6. Update Purchase Document
    purchase.grandTotal -= totalReturnAmount;
    purchase.balanceAmount -= totalReturnAmount;
    purchase.notes = (purchase.notes || "") + `\nPartial Return: -${totalReturnAmount} (${reason})`;

    // Filter out completely returned items
    purchase.items = purchase.items.filter(i => i.quantity > 0);

    if (purchase.items.length === 0) {
      purchase.status = 'cancelled'; // All items returned
    }

    await purchase.save({ session });

  }, 3, { action: "PARTIAL_RETURN", userId: req.user._id });

  res.status(200).json({ status: "success", message: "Partial return processed successfully" });
});

/* ======================================================
   5. RECORD PAYMENT
====================================================== */
// exports.recordPayment = catchAsync(async (req, res, next) => {
//   const { amount, paymentMethod, date, reference, notes } = req.body;

//   if (!amount || amount <= 0) {
//     return next(new AppError("Valid payment amount is required", 400));
//   }

//   await runInTransaction(async (session) => {
//     const purchase = await Purchase.findOne({
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!purchase) throw new AppError("Purchase not found", 404);
//     if (purchase.status === "cancelled") {
//       throw new AppError("Cannot record payment for cancelled purchase", 400);
//     }

//     const totalPaid = purchase.paidAmount + amount;

//     if (totalPaid > purchase.grandTotal) {
//       throw new AppError("Payment amount exceeds purchase total", 400);
//     }

//     // Update payment status
//     purchase.paidAmount = totalPaid;
//     purchase.balanceAmount = purchase.grandTotal - totalPaid;

//     if (totalPaid === purchase.grandTotal) {
//       purchase.paymentStatus = "paid";
//     } else if (totalPaid > 0) {
//       purchase.paymentStatus = "partial";
//     } else {
//       purchase.paymentStatus = "unpaid";
//     }

//     if (paymentMethod) purchase.paymentMethod = paymentMethod;
//     purchase.notes = `${purchase.notes || ""}\nPayment recorded: ${amount} on ${new Date().toLocaleString()} ${reference ? `(Ref: ${reference})` : ''}${notes ? ` - ${notes}` : ''}`;

//     await purchase.save({ session });

//     // Accounting entry for payment
//     let paymentAccount;
//     switch (paymentMethod) {
//       case 'cash':
//         paymentAccount = await getOrInitAccount(
//           req.user.organizationId, "asset", "Cash Account", "1000", session
//         );
//         break;
//       case 'bank':
//         paymentAccount = await getOrInitAccount(
//           req.user.organizationId, "asset", "Bank Account", "1001", session
//         );
//         break;
//       default:
//         paymentAccount = await getOrInitAccount(
//           req.user.organizationId, "asset", "Other Payment Account", "1009", session
//         );
//     }

//     const apAcc = await getOrInitAccount(
//       req.user.organizationId, "liability", "Accounts Payable", "2000", session
//     );

//     await AccountEntry.create([
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: paymentAccount._id,
//         date: date || new Date(),
//         debit: amount,
//         credit: 0,
//         description: `Payment to Supplier for ${purchase.invoiceNumber || 'Purchase'}`,
//         referenceType: "payment",
//         referenceId: purchase._id,
//         createdBy: req.user._id,
//         supplierId: purchase.supplierId
//       },
//       {
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         accountId: apAcc._id,
//         supplierId: purchase.supplierId,
//         date: date || new Date(),
//         debit: 0,
//         credit: amount,
//         description: `Payment Received ${reference ? `(Ref: ${reference})` : ''}`,
//         referenceType: "payment",
//         referenceId: purchase._id,
//         createdBy: req.user._id
//       }
//     ], { session });
//   });

//   res.status(200).json({
//     status: "success",
//     message: "Payment recorded successfully"
//   });
// });
/* ======================================================
   5. RECORD PAYMENT (Fixed for Transaction Error)
====================================================== */
exports.recordPayment = catchAsync(async (req, res, next) => {
  const { amount, paymentMethod, date, reference, notes } = req.body;

  if (!amount || amount <= 0) {
    return next(new AppError("Valid payment amount is required", 400));
  }

  await runInTransaction(async (session) => {
    // 1. Fetch Purchase
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") {
      throw new AppError("Cannot record payment for cancelled purchase", 400);
    }

    const totalPaid = (purchase.paidAmount || 0) + amount;

    // Small floating point tolerance check
    if (totalPaid > (purchase.grandTotal + 0.1)) {
      throw new AppError(`Payment exceeds balance. Remaining: ${purchase.grandTotal - purchase.paidAmount}`, 400);
    }

    // 2. Create Payment Document
    // FIX: Added 'ordered: true' which is required when passing an array [] with a session
    const [payment] = await Payment.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      type: 'outflow',
      supplierId: purchase.supplierId,
      purchaseId: purchase._id,
      paymentDate: date || new Date(),
      amount: amount,
      paymentMethod: paymentMethod || 'cash',
      referenceNumber: reference,
      transactionMode: 'manual',
      status: 'completed',
      remarks: notes,
      createdBy: req.user._id
    }], { session, ordered: true }); // <--- THIS WAS MISSING

    // 3. Update Purchase Document
    purchase.paidAmount = totalPaid;
    purchase.balanceAmount = purchase.grandTotal - totalPaid;

    if (purchase.balanceAmount <= 0) {
      purchase.balanceAmount = 0;
      purchase.paymentStatus = "paid";
    } else {
      purchase.paymentStatus = "partial";
    }

    purchase.notes = `${purchase.notes || ""}\nPayment: ${amount} (Ref: ${reference || 'N/A'})`;
    await purchase.save({ session });

    // 4. Update Supplier Balance
    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: -amount } },
      { session }
    );

    // 5. Accounting Entries
    let assetAccountCode = "1009";
    let assetAccountName = "Other Payment Account";

    if (paymentMethod === 'cash') {
      assetAccountCode = "1001"; assetAccountName = "Cash Account";
    } else if (paymentMethod === 'bank') {
      assetAccountCode = "1002"; assetAccountName = "Bank Account";
    }

    const assetAcc = await getOrInitAccount(
      req.user.organizationId, "asset", assetAccountName, assetAccountCode, session
    );

    const apAcc = await getOrInitAccount(
      req.user.organizationId, "liability", "Accounts Payable", "2000", session
    );

    // FIX: Added 'ordered: true' here as well
    await AccountEntry.create([
      {
        // ENTRY 1: DEBIT AP (Liability Decreases)
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id,
        date: payment.paymentDate,
        debit: amount,
        credit: 0,
        description: `Payment to Supplier: ${purchase.invoiceNumber}`,
        referenceType: "payment",
        referenceId: payment._id,
        supplierId: purchase.supplierId,
        createdBy: req.user._id
      },
      {
        // ENTRY 2: CREDIT ASSET (Cash Decreases)
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: assetAcc._id,
        date: payment.paymentDate,
        debit: 0,
        credit: amount,
        description: `Payment Outflow (Ref: ${reference || 'N/A'})`,
        referenceType: "payment",
        referenceId: payment._id,
        supplierId: purchase.supplierId,
        createdBy: req.user._id
      }
    ], { session, ordered: true }); // <--- THIS WAS MISSING

  });

  res.status(200).json({
    status: "success",
    message: "Payment recorded successfully"
  });
});

/* ======================================================
   6. ATTACHMENT DELETE
====================================================== */
// exports.deleteAttachment = catchAsync(async (req, res, next) => {
//   const purchase = await Purchase.findById(req.params.id);
//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   const url = purchase.attachedFiles[req.params.fileIndex];
//   if (!url) return next(new AppError("File not found", 404));

//   const publicId = url.split("/").pop().split(".")[0];
//   try {
//     await cloudinary.uploader.destroy(`purchases/${publicId}`);
//   } catch (err) {
//     console.warn("Failed to delete from Cloudinary:", err.message);
//   }

//   purchase.attachedFiles.splice(req.params.fileIndex, 1);
//   await purchase.save();

//   res.status(200).json({ status: "success", message: "Attachment removed" });
// });
/* ======================================================
   6. ATTACHMENT DELETE (Updated for Object Schema)
====================================================== */
exports.deleteAttachment = catchAsync(async (req, res, next) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return next(new AppError("Purchase not found", 404));

  // Access the specific file object
  const fileObj = purchase.attachedFiles[req.params.fileIndex];
  if (!fileObj) return next(new AppError("File not found", 404));

  // Use public_id directly if available, else extract from URL
  const publicId = fileObj.public_id || fileObj.url.split("/").pop().split(".")[0];

  try {
    if (publicId) {
      await cloudinary.uploader.destroy(publicId); // Use the stored public_id
    }
  } catch (err) {
    console.warn("Failed to delete from Cloudinary:", err.message);
  }

  // Remove from array
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

exports.getAllPurchases = factory.getAll(Purchase, {
  populate: [
    { path: 'items.productId', select: 'name sku category sellingPrice' },
    { path: 'supplierId', select: 'name companyName email phone address' },
    { path: 'createdBy', select: 'name email' },
    { path: 'approvedBy', select: 'name email' },
    { path: 'branchId', select: 'name code' }
  ]
});

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
/* ======================================================
   10. ADDITIONAL ATTACHMENTS (Updated)
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
    // 1. Get the full object from Cloudinary/Service
    const uploadResult = await fileUploadService.uploadFile(f.buffer, "purchases");

    // 2. Push the result (Schema now accepts this object)
    newFiles.push(uploadResult);
  }

  // 3. Push to Mongoose Array
  purchase.attachedFiles.push(...newFiles);

  await purchase.save(); // <--- This failed before, now it will pass

  res.status(200).json({
    status: "success",
    message: `${newFiles.length} file(s) added`,
    data: { purchase }
  });
});
// exports.addAttachments = catchAsync(async (req, res, next) => {
//   if (!req.files?.length) {
//     return next(new AppError("No files uploaded", 400));
//   }

//   const purchase = await Purchase.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   });

//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   const newFiles = [];
//   for (const f of req.files) {
//     newFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
//   }

//   purchase.attachedFiles.push(...newFiles);
//   await purchase.save();

//   res.status(200).json({
//     status: "success",
//     message: `${newFiles.length} file(s) added`,
//     data: { purchase }
//   });
// });
/* ======================================================
   11. GET PAYMENT HISTORY
====================================================== */
// exports.getPaymentHistory = catchAsync(async (req, res, next) => {
//   const payments = await AccountEntry.find({
//     referenceId: req.params.id,
//     referenceType: "payment",
//     organizationId: req.user.organizationId
//   }).sort('-date').populate('accountId', 'name code');

//   res.status(200).json({
//     status: "success",
//     results: payments.length,
//     data: { payments }
//   });
// });

/* ======================================================
   11. GET PAYMENT HISTORY (Fixed)
====================================================== */
exports.getPaymentHistory = catchAsync(async (req, res, next) => {
  // Query the PAYMENT collection, not the Ledger
  // This is where we stored the clean payment details linked to this purchase
  const payments = await Payment.find({
    purchaseId: req.params.id, // Link to the Purchase
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true } // Ensure we don't show deleted ones
  })
    .sort({ paymentDate: -1 }) // Newest first
    .select('paymentDate amount paymentMethod referenceNumber status remarks _id');

  res.status(200).json({
    status: "success",
    results: payments.length,
    data: { payments }
  });
});
/* ======================================================
   12. DELETE PAYMENT (Corrected)
====================================================== */
// exports.deletePayment = catchAsync(async (req, res, next) => {
//   await runInTransaction(async (session) => {
//     const payment = await Payment.findOne({
//       _id: req.params.paymentId, purchaseId: req.params.id, organizationId: req.user.organizationId
//     }).session(session);
//     if (!payment) throw new AppError("Payment record not found", 404);
//     const purchase = await Purchase.findById(req.params.id).session(session);
//     if (!purchase) throw new AppError("Purchase not found", 404);
//     // 2. Reverse the payment impact on Purchase
//     purchase.paidAmount -= payment.amount; // Use payment amount, not ledger credit (safer)
//     purchase.balanceAmount = purchase.grandTotal - purchase.paidAmount;
//     // Update payment status
//     if (purchase.paidAmount <= 0) {
//       purchase.paidAmount = 0;
//       purchase.paymentStatus = "unpaid";
//     } else {
//       purchase.paymentStatus = "partial";
//     }
//     await purchase.save({ session });

//     // 3. Restore Supplier Balance (They are owed money again)
//     await Supplier.findByIdAndUpdate(
//       purchase.supplierId,
//       { $inc: { outstandingBalance: payment.amount } },
//       { session }
//     );

//     // 4. Delete Accounting Entries
//     await AccountEntry.deleteMany({
//       referenceId: payment._id,
//       referenceType: "payment"
//     }).session(session);

//     // 5. Delete the Payment Document itself
//     await payment.deleteOne({ session });

//   }, 3, { action: "DELETE_PAYMENT", userId: req.user._id });

//   res.status(200).json({
//     status: "success",
//     message: "Payment deleted successfully"
//   });
// });
/* ======================================================
   12. DELETE PAYMENT (Final Polish)
====================================================== */
exports.deletePayment = catchAsync(async (req, res, next) => {
  await runInTransaction(async (session) => {
    // 1. Find Payment & Purchase
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      purchaseId: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!payment) throw new AppError("Payment record not found", 404);

    const purchase = await Purchase.findById(req.params.id).session(session);
    if (!purchase) throw new AppError("Purchase not found", 404);

    // 2. Reverse the payment impact on Purchase (WITH ROUNDING SAFETY)
    // Javascript math can be buggy (e.g., 100 - 33.33 = 66.670000001)
    const newPaidAmount = (purchase.paidAmount || 0) - payment.amount;

    // Round to 2 decimal places and ensure it doesn't go below zero
    purchase.paidAmount = Math.max(0, Math.round(newPaidAmount * 100) / 100);

    // Recalculate balance
    purchase.balanceAmount = Math.round((purchase.grandTotal - purchase.paidAmount) * 100) / 100;

    // Update payment status
    if (purchase.paidAmount <= 0) {
      purchase.paymentStatus = "unpaid";
    } else {
      purchase.paymentStatus = "partial";
    }

    // Save (Middleware will run, but our manual calculation above ensures safety)
    await purchase.save({ session });

    // 3. Restore Supplier Balance (They are owed money again)
    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: payment.amount } },
      { session }
    );

    // 4. Delete Accounting Entries
    await AccountEntry.deleteMany({
      referenceId: payment._id,
      referenceType: "payment"
    }).session(session);

    // 5. Delete the Payment Document itself
    await payment.deleteOne({ session });

  }, 3, { action: "DELETE_PAYMENT", userId: req.user._id });

  res.status(200).json({
    status: "success",
    message: "Payment deleted successfully"
  });
});

/* ======================================================
   13. UPDATE STATUS
====================================================== */
// exports.updateStatus = catchAsync(async (req, res, next) => {
//   const { status, notes } = req.body;

//   if (!['draft', 'received', 'cancelled', 'approved', 'pending'].includes(status)) {
//     return next(new AppError("Invalid status", 400));
//   }

//   const purchase = await Purchase.findOneAndUpdate(
//     {
//       _id: req.params.id,
//       organizationId: req.user.organizationId
//     },
//     {
//       status,
//       $push: {
//         notes: notes ? `Status changed to ${status}: ${notes}` : `Status changed to ${status}`
//       }
//     },
//     { new: true, runValidators: true }
//   );

//   if (!purchase) return next(new AppError("Purchase not found", 404));

//   res.status(200).json({
//     status: "success",
//     data: { purchase }
//   });
// });
/* ======================================================
   13. UPDATE STATUS (With Stock Logic)
====================================================== */
exports.updateStatus = catchAsync(async (req, res, next) => {
  const { status, notes } = req.body;
  const validStatuses = ['draft', 'received', 'cancelled']; // removed 'approved'/pending if not used

  if (!validStatuses.includes(status)) {
    return next(new AppError("Invalid status", 400));
  }

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === status) return; // No change

    // LOGIC: Handle Stock Movements based on transition
    // 1. DRAFT -> RECEIVED (Add Stock)
    if (purchase.status === 'draft' && status === 'received') {
      await updateStockAtomically(purchase.items, purchase.branchId, req.user.organizationId, 'increment', session);

      // Also update Supplier Balance (Liability increases now)
      await Supplier.findByIdAndUpdate(
        purchase.supplierId,
        { $inc: { outstandingBalance: purchase.grandTotal } },
        { session }
      );
    }

    // 2. RECEIVED -> CANCELLED (Remove Stock)
    else if (purchase.status === 'received' && status === 'cancelled') {
      // Validate stock exists before removing (Prevent negative stock)
      // (You should add the validation loop here)
      await updateStockAtomically(purchase.items, purchase.branchId, req.user.organizationId, 'decrement', session);

      await Supplier.findByIdAndUpdate(
        purchase.supplierId,
        { $inc: { outstandingBalance: -purchase.grandTotal } },
        { session }
      );
    }

    // 3. DRAFT -> CANCELLED (No Stock Action needed)

    // Update the doc
    purchase.status = status;
    purchase.notes = notes ? `${purchase.notes || ""}\nStatus: ${status} - ${notes}` : purchase.notes;

    await purchase.save({ session });

  }, 3, { action: "UPDATE_STATUS", userId: req.user._id });

  res.status(200).json({ status: "success", message: `Status updated to ${status}` });
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

exports.getAllReturns = catchAsync(async (req, res, next) => {
  const { supplierId, startDate, endDate, purchaseId } = req.query;

  const filter = {
    organizationId: req.user.organizationId,
    branchId: req.user.branchId
  };

  if (supplierId) filter.supplierId = supplierId;
  if (purchaseId) filter.purchaseId = purchaseId;

  if (startDate || endDate) {
    filter.returnDate = {};
    if (startDate) filter.returnDate.$gte = new Date(startDate);
    if (endDate) filter.returnDate.$lte = new Date(endDate);
  }

  // Execute query with sorting
  const returns = await PurchaseReturn.find(filter)
    .sort({ returnDate: -1 })
    .populate('supplierId', 'companyName email phone')
    .populate('purchaseId', 'invoiceNumber grandTotal status')
    .populate('createdBy', 'name');

  res.status(200).json({
    status: 'success',
    results: returns.length,
    data: { returns }
  });
});

/* ======================================================
   2. GET RETURN DETAILS
====================================================== */
/* ======================================================
   12. GET RETURN DETAILS (Manual Populate)
====================================================== */
exports.getReturnById = catchAsync(async (req, res, next) => {
  const returnRecord = await PurchaseReturn.findById(req.params.id)
    .populate({
      path: 'purchaseId',
      select: 'invoiceNumber purchaseDate grandTotal' 
    })
    .populate({
      path: 'supplierId',
      select: 'companyName email phone address city state zipCode'
    })
    .populate({
      path: 'createdBy',
      select: 'name email'
    })
    .populate({
      path: 'items.productId', // Also populate product details inside items
      select: 'name sku'
    });

  if (!returnRecord) {
    return next(new AppError('No return record found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { data: returnRecord }
  });
});
