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

/* ======================================================
   HELPER: Atomic Stock Update (Prevents WriteConflict)
====================================================== */
async function updateStockAtomically(items, branchId, orgId, type = 'increment', session) {
    for (const item of items) {
        const adjustment = type === 'increment' ? item.quantity : -item.quantity;
        
        const update = { $inc: { "inventory.$.quantity": adjustment } };
        
        // If purchasing, update the purchase price
        if (type === 'increment' && item.purchasePrice > 0) {
            update.$set = { purchasePrice: item.purchasePrice };
        }

        const result = await Product.findOneAndUpdate(
            { 
                _id: item.productId, 
                organizationId: orgId,
                "inventory.branchId": branchId 
            },
            update,
            { session, new: true }
        );

        // If product exists but inventory doc doesn't, we need to push it
        if (!result) {
            const product = await Product.findById(item.productId).session(session);
            if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
            
            // Add branch inventory if missing
            await Product.updateOne(
                { _id: item.productId },
                { 
                    $push: { 
                        inventory: { 
                            branchId: branchId, 
                            quantity: type === 'increment' ? item.quantity : 0 
                        } 
                    } 
                },
                { session }
            );
        }
    }
}

/* ======================================================
   1. CREATE PURCHASE
====================================================== */
exports.createPurchase = catchAsync(async (req, res, next) => {
  const { supplierId, invoiceNumber, purchaseDate, dueDate, notes, status } = req.body;
  
  // 1. Parse & Validate Items (Outside Transaction)
  let items = req.body.items;
  if (typeof items === "string") items = JSON.parse(items);
  if (!supplierId || !items?.length) return next(new AppError("Supplier and items are required", 400));

  // Enrich items & Calculate Totals logic
  let subTotal = 0;
  let totalTax = 0;
  let totalDiscount = 0;

  const enrichedItems = await Promise.all(items.map(async (item) => {
      const product = await Product.findById(item.productId).select('name');
      if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
      
      const qty = Number(item.quantity);
      const price = Number(item.purchasePrice);
      const discount = Number(item.discount || 0);
      const taxRate = Number(item.taxRate || 0);

      // Calculate totals for this item
      const itemTotal = price * qty;
      const taxableAmount = itemTotal - discount;
      const taxAmount = (taxableAmount * taxRate) / 100;

      subTotal += itemTotal;
      totalDiscount += discount;
      totalTax += taxAmount;

      return { 
          ...item, 
          name: product.name,
          productId: item.productId,
          quantity: qty,
          purchasePrice: price,
          taxRate: taxRate,
          discount: discount
      };
  }));

  const grandTotal = subTotal + totalTax - totalDiscount;
  const paidAmount = Number(req.body.paidAmount) || 0;

  // Determine correct Payment Status
  let paymentStatus = 'unpaid';
  if (paidAmount > 0) {
      if (paidAmount >= grandTotal) {
          paymentStatus = 'paid';
      } else {
          paymentStatus = 'partial';
      }
  }

  await runInTransaction(async (session) => {
    // 2. Handle File Uploads
    const attachedFiles = [];
    if (req.files?.length) {
      for (const f of req.files) {
        attachedFiles.push(await fileUploadService.uploadFile(f.buffer, "purchases"));
      }
    }

    // 3. Create Purchase Document
    const [purchase] = await Purchase.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      supplierId,
      invoiceNumber,
      purchaseDate: purchaseDate || new Date(),
      dueDate,
      items: enrichedItems,
      
      // Totals
      subTotal,
      totalTax,
      totalDiscount,
      grandTotal,

      // Payment Info
      paidAmount,
      balanceAmount: grandTotal - paidAmount,
      paymentStatus: paymentStatus,
      
      status: status || "received",
      notes,
      attachedFiles,
      createdBy: req.user._id
    }], { session, ordered: true });

    // 4. Update Inventory (Atomic)
    await updateStockAtomically(enrichedItems, req.user.branchId, req.user.organizationId, 'increment', session);

    // 5. Update Supplier Balance
    // Increase balance by (Grand Total - Paid Amount)
    await Supplier.findByIdAndUpdate(
      supplierId,
      { $inc: { outstandingBalance: purchase.grandTotal - paidAmount } },
      { session }
    );

    // 6. Record Payment (If any paid initially)
    if (paidAmount > 0) {
        const payment = (await Payment.create([{
            organizationId: req.user.organizationId,
            branchId: req.user.branchId,
            type: 'outflow', // Money leaving
            supplierId: supplierId,
            purchaseId: purchase._id,
            paymentDate: purchase.purchaseDate,
            amount: paidAmount,
            paymentMethod: req.body.paymentMethod || 'cash',
            transactionMode: 'manual',
            status: 'completed',
            remarks: `Payment for Purchase ${invoiceNumber}`,
            createdBy: req.user._id
        }], { session, ordered: true }))[0];

        // 7a. Payment Accounting (Dr AP, Cr Cash/Bank)
        const assetAccName = req.body.paymentMethod === 'bank' ? 'Bank' : 'Cash';
        const assetAccCode = req.body.paymentMethod === 'bank' ? '1002' : '1001';
        
        const assetAcc = await getOrInitAccount(req.user.organizationId, "asset", assetAccName, assetAccCode, session);
        const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

        await AccountEntry.create([
            {
                organizationId: req.user.organizationId,
                branchId: req.user.branchId,
                accountId: apAcc._id, // Dr AP (Liability decreases)
                debit: paidAmount,
                credit: 0,
                description: `Payment for Purchase ${invoiceNumber}`,
                referenceType: "payment",
                referenceId: payment._id,
                supplierId,
                createdBy: req.user._id
            },
            {
                organizationId: req.user.organizationId,
                branchId: req.user.branchId,
                accountId: assetAcc._id, // Cr Asset (Cash decreases)
                debit: 0,
                credit: paidAmount,
                description: `Payment for Purchase ${invoiceNumber}`,
                referenceType: "payment",
                referenceId: payment._id,
                supplierId,
                createdBy: req.user._id
            }
        ], { session, ordered: true });
    }

    // 7b. Purchase Accounting (Dr Inventory, Cr AP - Full Amount)
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, "asset", "Inventory Asset", "1500", session);
    const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: inventoryAcc._id, // Dr Inventory
        debit: purchase.grandTotal,
        credit: 0,
        description: `Purchase: ${invoiceNumber}`,
        referenceType: "purchase",
        referenceId: purchase._id,
        supplierId,
        createdBy: req.user._id
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id, // Cr AP
        debit: 0,
        credit: purchase.grandTotal,
        description: `Bill: ${invoiceNumber}`,
        referenceType: "purchase",
        referenceId: purchase._id,
        supplierId,
        createdBy: req.user._id
      }
    ], { session, ordered: true });

  }, 3, { action: "CREATE_PURCHASE", userId: req.user._id });

  res.status(201).json({ 
    status: "success", 
    message: "Purchase recorded successfully"
  });
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
exports.cancelPurchase = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  if (!reason) return next(new AppError("Cancellation reason is required", 400));

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).session(session);
    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") throw new AppError("Already cancelled", 400);
    if (purchase.paidAmount > 0) throw new AppError("Cannot cancel purchase with payments. Refund first.", 400);

    // 1. Reverse Stock
    await updateStockAtomically(purchase.items, purchase.branchId, req.user.organizationId, 'decrement', session);

    // 2. Update Supplier
    await Supplier.findByIdAndUpdate(
      purchase.supplierId,
      { $inc: { outstandingBalance: -purchase.grandTotal } },
      { session }
    );

    // 3. Accounting (Reversal)
    const inventoryAcc = await getOrInitAccount(req.user.organizationId, "asset", "Inventory Asset", "1500", session);
    const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

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
        description: `Inventory Returned: ${purchase.invoiceNumber}`,
        referenceType: "purchase_return",
        referenceId: purchase._id,
        createdBy: req.user._id
      }
    ], { session, ordered: true });

    // 4. Update Status
    purchase.status = "cancelled";
    purchase.notes = `${purchase.notes || ""}\nCancelled: ${reason}`;
    await purchase.save({ session });

  }, 3, { action: "CANCEL_PURCHASE", userId: req.user._id });

  res.status(200).json({ status: "success", message: "Purchase cancelled successfully" });
});

/* ======================================================
   4. RECORD PAYMENT (After Purchase)
====================================================== */
exports.recordPayment = catchAsync(async (req, res, next) => {
  const { amount, paymentMethod, date, reference, notes } = req.body;
  if (!amount || amount <= 0) return next(new AppError("Valid payment amount is required", 400));

  await runInTransaction(async (session) => {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!purchase) throw new AppError("Purchase not found", 404);
    if (purchase.status === "cancelled") throw new AppError("Cannot record payment for cancelled purchase", 400);

    const totalPaid = purchase.paidAmount + amount;
    if (totalPaid > purchase.grandTotal) throw new AppError("Payment exceeds purchase total", 400);

    // 1. Update Purchase
    purchase.paidAmount = totalPaid;
    purchase.balanceAmount = purchase.grandTotal - totalPaid;
    purchase.paymentStatus = totalPaid === purchase.grandTotal ? "paid" : "partial";
    if (paymentMethod) purchase.paymentMethod = paymentMethod;
    await purchase.save({ session });

    // 2. Create Payment Document (Outflow)
    const payment = (await Payment.create([{
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        type: 'outflow',
        supplierId: purchase.supplierId,
        purchaseId: purchase._id,
        paymentDate: date || new Date(),
        amount: amount,
        paymentMethod: paymentMethod || 'cash',
        transactionMode: 'manual',
        referenceNumber: reference,
        remarks: notes || `Payment for Purchase ${purchase.invoiceNumber}`,
        status: 'completed',
        createdBy: req.user._id
    }], { session, ordered: true }))[0];

    // 3. Update Supplier Balance
    await Supplier.findByIdAndUpdate(
        purchase.supplierId,
        { $inc: { outstandingBalance: -amount } },
        { session }
    );

    // 4. Accounting (Dr AP, Cr Cash/Bank)
    const accountName = paymentMethod === 'bank' ? "Bank" : "Cash";
    const accountCode = paymentMethod === 'bank' ? "1002" : "1001";
    
    const paymentAccount = await getOrInitAccount(req.user.organizationId, "asset", accountName, accountCode, session);
    const apAcc = await getOrInitAccount(req.user.organizationId, "liability", "Accounts Payable", "2000", session);

    await AccountEntry.create([
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: apAcc._id, // Dr AP
        date: date || new Date(),
        debit: amount,
        credit: 0,
        description: `Payment to Supplier for ${purchase.invoiceNumber}`,
        referenceType: "payment",
        referenceId: payment._id,
        supplierId: purchase.supplierId,
        createdBy: req.user._id
      },
      {
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        accountId: paymentAccount._id, // Cr Cash
        date: date || new Date(),
        debit: 0,
        credit: amount,
        description: `Payment Out: ${reference || ''}`,
        referenceType: "payment",
        referenceId: payment._id,
        supplierId: purchase.supplierId,
        createdBy: req.user._id
      }
    ], { session, ordered: true });

  }, 3, { action: "RECORD_PURCHASE_PAYMENT", userId: req.user._id });

  res.status(200).json({ status: "success", message: "Payment recorded successfully" });
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
    switch (paymentMethod) {
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
exports.getReturnById = factory.getOne(PurchaseReturn, {
  path: 'purchaseId supplierId createdBy',
  select: 'invoiceNumber companyName name email'
});