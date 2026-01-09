const mongoose = require("mongoose");
const { z } = require("zod");
const { format } = require('fast-csv');
const { invalidateOpeningBalance } = require("../core/ledgerCache.service");
const ProfitCalculator = require('./utils/profitCalculator');

const Invoice = require("./invoice.model");
const Payment = require("../payments/payment.model");
const Product = require("../../inventory/core/product.model");
const Customer = require("../../organization/core/customer.model");
const AccountEntry = require('../core/accountEntry.model');
const Account = require('../core/account.model');
const Organization = require("../../organization/core/organization.model");
const InvoiceAudit = require('./invoiceAudit.model');

const SalesService = require("../../inventory/core/sales.service");
const invoicePDFService = require("../../_legacy/services/invoicePDFService");
const StockValidationService = require("../../_legacy/services/stockValidationService");
const { createNotification } = require("../../notification/core/notification.service");
// CHANGED: Import the whole service to access reverseInvoiceJournal
const salesJournalService = require('../../inventory/core/salesJournal.service');

const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const factory = require("../../../core/utils/handlerFactory");
const { runInTransaction } = require("../../../core/utils/runInTransaction");
const { emitToOrg } = require("../../../core/utils/_legacy/socket");
const automationService = require('../../_legacy/services/automationService');

// --- HELPER: Ensure System Accounts Exist (Idempotent) ---
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

// 🛡️ Validation Schema
const createInvoiceSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  items: z.array(z.object({
    productId: z.string().min(1, "Product ID is required"),
    quantity: z.number().positive("Quantity must be positive"),
    price: z.number().nonnegative("Price cannot be negative"),
    tax: z.number().optional().default(0),
    discount: z.number().optional().default(0)
  })).min(1, "Invoice must have at least one item"),

  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),

  paidAmount: z.number().nonnegative().optional().default(0),
  paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
  status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
  shippingCharges: z.number().nonnegative().optional().default(0),
  notes: z.string().optional(),
  roundOff: z.number().optional(),
  gstType: z.string().optional()
});

/* ======================================================
   STOCK REDUCTION HELPER FUNCTION
====================================================== */
async function reduceStockForInvoice(items, branchId, organizationId, session) {
  for (const item of items) {
    const product = await Product.findOne({
      _id: item.productId,
      organizationId
    }).session(session);

    if (!product) {
      throw new AppError(`Product ${item.productId} not found`, 404);
    }

    let inventory = product.inventory.find(
      inv => String(inv.branchId) === String(branchId)
    );

    if (!inventory) {
      throw new AppError(
        `No inventory record found for ${product.name} in this branch`,
        400
      );
    }

    if (inventory.quantity < item.quantity) {
      throw new AppError(
        `Insufficient stock for ${product.name}. Available: ${inventory.quantity}, Required: ${item.quantity}`,
        400
      );
    }

    inventory.quantity -= item.quantity;
    await product.save({ session });

    product.lastSold = new Date();
    await product.save({ session });
  }
}

/* ======================================================
   STOCK RESTORATION HELPER FUNCTION
====================================================== */
async function restoreStockFromInvoice(items, branchId, organizationId, session) {
  for (const item of items) {
    await Product.findOneAndUpdate(
      {
        _id: item.productId,
        organizationId,
        "inventory.branchId": branchId
      },
      { $inc: { "inventory.$.quantity": item.quantity } },
      { session }
    );
  }
}

/* ======================================================
   1. CREATE INVOICE WITH STOCK REDUCTION (FIXED)
====================================================== */
exports.createInvoice = catchAsync(async (req, res, next) => {
  let invoice;

  const validatedData = createInvoiceSchema.safeParse(req.body);
  if (!validatedData.success) {
    return next(new AppError(validatedData.error.errors[0].message, 400));
  }

  await runInTransaction(async (session) => {
    const stockValidation = await StockValidationService.validateSale(
      req.body.items,
      req.user.branchId,
      req.user.organizationId,
      session
    );

    if (!stockValidation.isValid) {
      throw new AppError(
        `Stock validation failed: ${stockValidation.errors.join(', ')}`,
        400
      );
    }

    // --- FIX START: Enrich Items with Name from DB ---
    // The frontend sends IDs/Prices but usually no names. We fetch them here.
    const enrichedItems = [];
    for (const item of req.body.items) {
      const product = await Product.findOne({
        _id: item.productId,
        organizationId: req.user.organizationId
      }).session(session);

      if (!product) {
        throw new AppError(`Product ${item.productId} not found`, 404);
      }

      enrichedItems.push({
        ...item,
        name: product.name, // MANDATORY FIELD
        hsnCode: product.sku || item.hsnCode || ""
      });
    }
    // --- FIX END ---

    // 2. CREATE INVOICE (Use enrichedItems instead of req.body.items)
    invoice = (await Invoice.create([{
      ...req.body,
      items: enrichedItems, // <--- Corrected here
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      createdBy: req.user._id
    }], { session }))[0];

    // 3. REDUCE STOCK
    await reduceStockForInvoice(
      req.body.items, // Original items array is fine for stock reduction logic
      req.user.branchId,
      req.user.organizationId,
      session
    );

    // 4. UPDATE CUSTOMER STATISTICS
    if (invoice.customerId) {
      await Customer.findByIdAndUpdate(
        invoice.customerId,
        {
          $inc: {
            totalPurchases: invoice.grandTotal,
            outstandingBalance: invoice.grandTotal - (invoice.paidAmount || 0)
          },
          lastPurchaseDate: new Date()
        },
        { session }
      );
    }

    // 5. POST ACCOUNTING JOURNAL ENTRIES (if not draft)
    if (invoice.status !== 'draft') {
      await salesJournalService.postInvoiceJournal({
        orgId: req.user.organizationId,
        branchId: req.user.branchId,
        invoice,
        customerId: invoice.customerId,
        items: invoice.items,
        userId: req.user._id,
        session
      });

      // 6. CREATE SALES RECORD
      try {
        await SalesService.createFromInvoiceTransactional(invoice, session);
      } catch (salesError) {
        console.warn('Failed to create sales record:', salesError.message);
      }
    }

    // 7. CREATE AUDIT LOG
    await InvoiceAudit.create([{
      invoiceId: invoice._id,
      action: 'CREATE',
      performedBy: req.user._id,
      details: `Invoice ${invoice.invoiceNumber} created with ${invoice.items.length} items`,
      ipAddress: req.ip
    }], { session });
  }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

  // Post-transaction actions
  automationService.triggerEvent(
    'invoice.created',
    invoice.toObject(),
    req.user.organizationId
  );

  emitToOrg(req.user.organizationId, 'invoice:created', {
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    amount: invoice.grandTotal
  });

  res.status(201).json({
    status: 'success',
    data: invoice
  });
});
/* ======================================================
   2. UPDATE INVOICE WITH STOCK MANAGEMENT (REFACTORED)
====================================================== */
exports.updateInvoice = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  let updatedInvoice;

  await runInTransaction(async (session) => {
    const oldInvoice = await Invoice.findOne({
      _id: id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!oldInvoice) throw new AppError('Invoice not found', 404);
    if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice', 400);

    // If Draft: Simple Update (no stock changes)
    if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
      updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });

      await InvoiceAudit.create([{
        invoiceId: oldInvoice._id,
        action: 'UPDATE_DRAFT',
        performedBy: req.user._id,
        details: 'Draft invoice updated',
        ipAddress: req.ip
      }], { session });

      return;
    }

    // If invoice has been issued and we're updating items: REVERSE EVERYTHING Logic
    const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;

    if (needsFinancialUpdate) {
      // A. RESTORE OLD STOCK (Put items back on shelf)
      await restoreStockFromInvoice(
        oldInvoice.items,
        oldInvoice.branchId,
        req.user.organizationId,
        session
      );

      // B. VALIDATE NEW STOCK AVAILABILITY
      if (updates.items) {
        const stockValidation = await StockValidationService.validateSale(
          updates.items,
          oldInvoice.branchId,
          req.user.organizationId,
          session
        );

        if (!stockValidation.isValid) {
          throw new AppError(
            `Stock validation failed: ${stockValidation.errors.join(', ')}`,
            400
          );
        }
      }

      // C. REDUCE NEW STOCK (Take items from shelf)
      const newItems = updates.items || oldInvoice.items;
      await reduceStockForInvoice(
        newItems,
        oldInvoice.branchId,
        req.user.organizationId,
        session
      );

      // D. ENRICH ITEMS WITH PRODUCT DETAILS
      const enrichedItems = [];
      for (const item of newItems) {
        const product = await Product.findById(item.productId).session(session);
        enrichedItems.push({
          ...item,
          name: product.name,
          sku: product.sku
        });
      }
      updates.items = enrichedItems;

      // E. DELETE OLD ACCOUNTING ENTRIES
      await AccountEntry.deleteMany({
        invoiceId: oldInvoice._id,
        referenceType: 'invoice'
      }, { session });

      // F. UPDATE CUSTOMER BALANCE (Remove old amount)
      await Customer.findByIdAndUpdate(
        oldInvoice.customerId,
        { $inc: { outstandingBalance: -oldInvoice.grandTotal } },
        { session }
      );
    }

    // G. SAVE UPDATED INVOICE (recalculates totals)
    Object.assign(oldInvoice, updates);
    updatedInvoice = await oldInvoice.save({ session });

    // H. RE-BOOK ACCOUNTING ENTRIES (REFACTORED: Uses Service)
    if (needsFinancialUpdate && updatedInvoice.status !== 'draft') {

      // 1. Post new Journal Entries via Service
      await salesJournalService.postInvoiceJournal({
        orgId: req.user.organizationId,
        branchId: req.user.branchId,
        invoice: updatedInvoice,
        customerId: updatedInvoice.customerId,
        items: updatedInvoice.items,
        userId: req.user._id,
        session
      });

      // 2. Update Customer Balance (Add new amount)
      await Customer.findByIdAndUpdate(
        updatedInvoice.customerId,
        { $inc: { outstandingBalance: updatedInvoice.grandTotal } },
        { session }
      );

      // 3. Update Sales Record via Service
      await SalesService.updateFromInvoiceTransactional(updatedInvoice, session);
    }

    // I. CREATE AUDIT LOG
    await InvoiceAudit.create([{
      invoiceId: updatedInvoice._id,
      action: needsFinancialUpdate ? 'UPDATE_FINANCIAL' : 'UPDATE_INFO',
      performedBy: req.user._id,
      details: needsFinancialUpdate
        ? `Invoice updated. New Total: ${updatedInvoice.grandTotal}`
        : 'Non-financial update applied',
      ipAddress: req.ip
    }], { session });

  }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

  res.status(200).json({
    status: "success",
    data: { invoice: updatedInvoice }
  });
});

/* ======================================================
   3. CANCEL INVOICE WITH STOCK RESTORATION (REFACTORED)
====================================================== */
exports.cancelInvoice = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason, restock = true } = req.body;

  await runInTransaction(async (session) => {
    const invoice = await Invoice.findOne({
      _id: id,
      organizationId: req.user.organizationId
    }).populate('items.productId').session(session);

    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

    // 1. RESTOCK ITEMS (if requested)
    if (restock) {
      await restoreStockFromInvoice(
        invoice.items,
        invoice.branchId,
        req.user.organizationId,
        session
      );
    }

    // 2. REVERSE CUSTOMER BALANCE
    await Customer.findByIdAndUpdate(
      invoice.customerId,
      {
        $inc: {
          totalPurchases: -invoice.grandTotal,
          outstandingBalance: -invoice.grandTotal
        }
      },
      { session }
    );

    // 3. CREATE CREDIT NOTE ENTRIES (REFACTORED: Uses Service)
    // This replaces ~30 lines of manual AccountEntry creation
    await salesJournalService.reverseInvoiceJournal({
      orgId: req.user.organizationId,
      branchId: invoice.branchId,
      invoice,
      userId: req.user._id,
      session
    });

    // 4. UPDATE INVOICE STATUS
    invoice.status = 'cancelled';
    invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason} (${new Date().toISOString()})`;
    await invoice.save({ session });

    // 5. CANCEL RELATED SALES RECORD (REFACTORED: Uses Service)
    await SalesService.updateFromInvoiceTransactional(invoice, session);

    // 6. CREATE AUDIT LOG
    // await InvoiceAudit.create([{
    //   invoiceId: invoice._id,
    //   action: 'CANCEL',
    //   performedBy: req.user._id,
    //   details: `Cancelled. Restock: ${restock}. Reason: ${reason}`,
    //   ipAddress: req.ip
    // }], { session });
    await InvoiceAudit.create([{
      invoiceId: invoice._id,
      action: 'STATUS_CHANGE',
      performedBy: req.user._id,
      details: `Cancelled. Restock: ${restock}. Reason: ${reason}`,
      ipAddress: req.ip
    }], { session });
  }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

  // Emit real-time update
  emitToOrg(req.user.organizationId, 'invoice:cancelled', {
    invoiceId: id,
    invoiceNumber: "Cancelled"
  });

  res.status(200).json({
    status: "success",
    message: "Invoice cancelled & reversed."
  });
});

/* ======================================================
   4. ADD PAYMENT TO INVOICE (No Changes Needed)
====================================================== */
// exports.addPayment = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body;

//   if (!amount || amount <= 0) {
//     return next(new AppError('Payment amount must be positive', 400));
//   }

//   await runInTransaction(async (session) => {
//     const invoice = await Invoice.findOne({
//       _id: id,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!invoice) throw new AppError('Invoice not found', 404);
//     if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to cancelled invoice', 400);

//     const newPaidAmount = invoice.paidAmount + amount;
//     const newBalance = invoice.grandTotal - newPaidAmount;

//     if (newPaidAmount > invoice.grandTotal) {
//       throw new AppError(
//         `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
//         400
//       );
//     }

//     invoice.paidAmount = newPaidAmount;
//     invoice.balanceAmount = newBalance;

//     if (newBalance <= 0) {
//       invoice.paymentStatus = 'paid';
//       invoice.status = 'paid';
//     } else if (amount > 0) {
//       invoice.paymentStatus = 'partial';
//     }

//     if (paymentMethod) invoice.paymentMethod = paymentMethod;
//     if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;

//     await invoice.save({ session });

//     await Customer.findByIdAndUpdate(
//       invoice.customerId,
//       { $inc: { outstandingBalance: -amount } },
//       { session }
//     );

//     const cashAccount = await getOrInitAccount(
//       req.user.organizationId, 'asset',
//       paymentMethod === 'cash' ? 'Cash' : 'Bank',
//       paymentMethod === 'cash' ? '1001' : '1002',
//       session
//     );

//     const arAccount = await getOrInitAccount(
//       req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session
//     );

//     // Dr Cash/Bank
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId,
//       branchId: invoice.branchId,
//       accountId: cashAccount._id,
//       date: new Date(),
//       debit: amount,
//       credit: 0,
//       description: `Payment for ${invoice.invoiceNumber}`,
//       referenceType: 'payment',
//       referenceId: invoice._id,
//       createdBy: req.user._id
//     }], { session });

//     // Cr Accounts Receivable
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId,
//       branchId: invoice.branchId,
//       accountId: arAccount._id,
//       customerId: invoice.customerId,
//       date: new Date(),
//       debit: 0,
//       credit: amount,
//       description: `Payment Received ${invoice.invoiceNumber}`,
//       referenceType: 'payment',
//       referenceId: invoice._id,
//       createdBy: req.user._id
//     }], { session });

//     await Payment.create([{
//       organizationId: req.user.organizationId,
//       branchId: invoice.branchId,
//       type: 'inflow',
//       amount,
//       customerId: invoice.customerId,
//       invoiceId: invoice._id,
//       paymentMethod,
//       referenceNumber,
//       transactionId,
//       status: 'completed',
//       createdBy: req.user._id
//     }], { session });

//     await InvoiceAudit.create([{
//       invoiceId: invoice._id,
//       action: 'PAYMENT',
//       performedBy: req.user._id,
//       details: `Payment of ${amount} added via ${paymentMethod}`,
//       ipAddress: req.ip
//     }], { session });

//   }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

//   res.status(200).json({
//     status: 'success',
//     message: 'Payment added successfully'
//   });
// });
/* ======================================================
   4. ADD PAYMENT TO INVOICE (FIXED AUDIT ACTION)
====================================================== */
exports.addPayment = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body;

  if (!amount || amount <= 0) {
    return next(new AppError('Payment amount must be positive', 400));
  }

  await runInTransaction(async (session) => {
    const invoice = await Invoice.findOne({
      _id: id,
      organizationId: req.user.organizationId
    }).session(session);

    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to cancelled invoice', 400);

    const newPaidAmount = invoice.paidAmount + amount;
    const newBalance = invoice.grandTotal - newPaidAmount;

    if (newPaidAmount > invoice.grandTotal) {
      throw new AppError(
        `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
        400
      );
    }

    invoice.paidAmount = newPaidAmount;
    invoice.balanceAmount = newBalance;

    if (newBalance <= 0) {
      invoice.paymentStatus = 'paid';
      invoice.status = 'paid';
    } else if (amount > 0) {
      invoice.paymentStatus = 'partial';
    }

    if (paymentMethod) invoice.paymentMethod = paymentMethod;
    if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;

    await invoice.save({ session });

    await Customer.findByIdAndUpdate(
      invoice.customerId,
      { $inc: { outstandingBalance: -amount } },
      { session }
    );

    const cashAccount = await getOrInitAccount(
      req.user.organizationId, 'asset',
      paymentMethod === 'cash' ? 'Cash' : 'Bank',
      paymentMethod === 'cash' ? '1001' : '1002',
      session
    );

    const arAccount = await getOrInitAccount(
      req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session
    );

    // Dr Cash/Bank
    await AccountEntry.create([{
      organizationId: req.user.organizationId,
      branchId: invoice.branchId,
      accountId: cashAccount._id,
      date: new Date(),
      debit: amount,
      credit: 0,
      description: `Payment for ${invoice.invoiceNumber}`,
      referenceType: 'payment',
      referenceId: invoice._id,
      createdBy: req.user._id
    }], { session });

    // Cr Accounts Receivable
    await AccountEntry.create([{
      organizationId: req.user.organizationId,
      branchId: invoice.branchId,
      accountId: arAccount._id,
      customerId: invoice.customerId,
      date: new Date(),
      debit: 0,
      credit: amount,
      description: `Payment Received ${invoice.invoiceNumber}`,
      referenceType: 'payment',
      referenceId: invoice._id,
      createdBy: req.user._id
    }], { session });

    await Payment.create([{
      organizationId: req.user.organizationId,
      branchId: invoice.branchId,
      type: 'inflow',
      amount,
      customerId: invoice.customerId,
      invoiceId: invoice._id,
      paymentMethod,
      referenceNumber,
      transactionId,
      status: 'completed',
      createdBy: req.user._id
    }], { session });

    // FIX: Use 'STATUS_CHANGE' instead of 'PAYMENT' if enum doesn't have 'PAYMENT'
    await InvoiceAudit.create([{
      invoiceId: invoice._id,
      action: 'STATUS_CHANGE', // Changed from 'PAYMENT'
      performedBy: req.user._id,
      details: `Payment of ${amount} added via ${paymentMethod}. Payment status changed to ${invoice.paymentStatus}`,
      ipAddress: req.ip
    }], { session });

  }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

  res.status(200).json({
    status: 'success',
    message: 'Payment added successfully'
  });
});
/* ======================================================
   5. CHECK STOCK (No Changes Needed)
====================================================== */
exports.checkStock = catchAsync(async (req, res, next) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError('Items are required', 400));
  }

  const validation = await StockValidationService.validateSale(
    items,
    req.user.branchId,
    req.user.organizationId
  );

  const detailedItems = [];
  for (const item of items) {
    const product = await Product.findOne({
      _id: item.productId,
      organizationId: req.user.organizationId
    });

    if (product) {
      const inventory = product.inventory.find(
        inv => String(inv.branchId) === String(req.user.branchId)
      );

      detailedItems.push({
        productId: item.productId,
        name: product.name,
        sku: product.sku,
        requestedQuantity: item.quantity,
        availableStock: inventory?.quantity || 0,
        price: product.sellingPrice,
        isAvailable: (inventory?.quantity || 0) >= item.quantity
      });
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      items: detailedItems
    }
  });
});

/* ======================================================
   6. CONVERT DRAFT TO ACTIVE INVOICE (Minor Refactor)
====================================================== */
exports.convertDraftToActive = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  await runInTransaction(async (session) => {
    const invoice = await Invoice.findOne({
      _id: id,
      organizationId: req.user.organizationId,
      status: 'draft'
    }).session(session);

    if (!invoice) {
      throw new AppError('Draft invoice not found', 404);
    }

    const stockValidation = await StockValidationService.validateSale(
      invoice.items,
      invoice.branchId,
      req.user.organizationId,
      session
    );

    if (!stockValidation.isValid) {
      throw new AppError(
        `Cannot convert draft: ${stockValidation.errors.join(', ')}`,
        400
      );
    }

    await reduceStockForInvoice(
      invoice.items,
      invoice.branchId,
      req.user.organizationId,
      session
    );

    if (invoice.invoiceNumber.startsWith('DRAFT')) {
      const lastInvoice = await Invoice.findOne({
        organizationId: req.user.organizationId,
        invoiceNumber: { $regex: /^INV-/ }
      }).sort({ createdAt: -1 }).session(session);

      let invoiceNumber;
      if (lastInvoice && lastInvoice.invoiceNumber) {
        const lastNum = parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0;
        invoiceNumber = `INV-${String(lastNum + 1).padStart(6, '0')}`;
      } else {
        invoiceNumber = `INV-000001`;
      }

      invoice.invoiceNumber = invoiceNumber;
    }

    invoice.status = 'issued';
    invoice.invoiceDate = new Date();
    await invoice.save({ session });

    await Customer.findByIdAndUpdate(
      invoice.customerId,
      {
        $inc: {
          totalPurchases: invoice.grandTotal,
          outstandingBalance: invoice.grandTotal
        },
        lastPurchaseDate: new Date()
      },
      { session }
    );

    // CHANGED: Use Service
    await salesJournalService.postInvoiceJournal({
      orgId: req.user.organizationId,
      branchId: invoice.branchId,
      invoice,
      customerId: invoice.customerId,
      items: invoice.items,
      userId: req.user._id,
      session
    });

    // CHANGED: Use Service
    await SalesService.createFromInvoiceTransactional(invoice, session);

    // await InvoiceAudit.create([{
    //   invoiceId: invoice._id,
    //   action: 'CONVERT_DRAFT',
    //   performedBy: req.user._id,
    //   details: `Draft converted to active invoice ${invoice.invoiceNumber}`,
    //   ipAddress: req.ip
    // }], { session });
    await InvoiceAudit.create([{
      invoiceId: invoice._id,
      action: 'STATUS_CHANGE',
      performedBy: req.user._id,
      details: `Draft converted to active invoice ${invoice.invoiceNumber}`,
      ipAddress: req.ip
    }], { session });
  }, 3, { action: "CONVERT_DRAFT", userId: req.user._id });

  res.status(200).json({
    status: 'success',
    message: 'Draft converted to active invoice'
  });
});

/* ======================================================
   7. GET INVOICE WITH STOCK INFO
====================================================== */
exports.getInvoiceWithStock = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  }).populate([
    { path: 'customerId', select: 'name phone email address' },
    { path: 'items.productId', select: 'name sku sellingPrice inventory' },
    { path: 'branchId', select: 'name code address' },
    { path: 'createdBy', select: 'name email' }
  ]);

  if (!invoice) {
    return next(new AppError('Invoice not found', 404));
  }

  const itemsWithStock = await Promise.all(
    invoice.items.map(async (item) => {
      if (item.productId) {
        const inventory = item.productId.inventory.find(
          inv => String(inv.branchId) === String(invoice.branchId)
        );

        return {
          ...item.toObject(),
          currentStock: inventory?.quantity || 0,
          reorderLevel: inventory?.reorderLevel || 10,
          willBeLow: inventory?.quantity - item.quantity < (inventory?.reorderLevel || 10)
        };
      }
      return item;
    })
  );

  const invoiceWithStock = {
    ...invoice.toObject(),
    items: itemsWithStock
  };

  res.status(200).json({
    status: 'success',
    data: { invoice: invoiceWithStock }
  });
});

// ... [Keep other Getters/Utility functions as they were] ...

exports.getInvoicePayments = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({
    invoiceId: req.params.id,
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true }
  }).sort({ paymentDate: -1 });

  res.status(200).json({ status: 'success', results: payments.length, data: { payments } });
});

exports.getCustomerInvoiceSummary = catchAsync(async (req, res, next) => {
  const summary = await Invoice.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        customerId: mongoose.Types.ObjectId(req.params.customerId),
        status: { $ne: 'cancelled' },
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalAmount: { $sum: '$grandTotal' },
        totalPaid: { $sum: '$paidAmount' },
        totalDue: { $sum: '$balanceAmount' }
      }
    }
  ]);
  res.status(200).json({
    status: 'success',
    data: summary[0] || { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 }
  });
});

exports.getSalesReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true }
  };

  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  let groupStage;
  if (groupBy === 'day') {
    groupStage = {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } },
        date: { $first: "$invoiceDate" },
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" },
        totalTax: { $sum: "$totalTax" }
      }
    };
  } else if (groupBy === 'month') {
    groupStage = {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
        month: { $first: { $month: "$invoiceDate" } },
        year: { $first: { $year: "$invoiceDate" } },
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" },
        totalTax: { $sum: "$totalTax" }
      }
    };
  } else {
    groupStage = {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" },
        totalTax: { $sum: "$totalTax" }
      }
    };
  }

  const report = await Invoice.aggregate([
    { $match: match },
    groupStage,
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({ status: 'success', results: report.length, data: { report } });
});

exports.getTaxReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true },
    totalTax: { $gt: 0 }
  };
  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }
  const taxReport = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: { year: { $year: "$invoiceDate" }, month: { $month: "$invoiceDate" } },
        totalTax: { $sum: "$totalTax" },
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);
  res.status(200).json({ status: 'success', results: taxReport.length, data: { taxReport } });
});

exports.getOutstandingInvoices = catchAsync(async (req, res, next) => {
  const { overdueOnly = false } = req.query;
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    balanceAmount: { $gt: 0 },
    isDeleted: { $ne: true }
  };
  if (overdueOnly) {
    match.dueDate = { $lt: new Date() };
  }
  const invoices = await Invoice.find(match)
    .populate('customerId', 'name phone email')
    .sort({ dueDate: 1 });

  const invoicesWithOverdue = invoices.map(invoice => {
    const invoiceObj = invoice.toObject();
    if (invoice.dueDate < new Date()) {
      const overdueDays = Math.ceil((new Date() - invoice.dueDate) / (1000 * 60 * 60 * 24));
      invoiceObj.overdueDays = overdueDays;
      invoiceObj.isOverdue = true;
    } else {
      invoiceObj.overdueDays = 0;
      invoiceObj.isOverdue = false;
    }
    return invoiceObj;
  });

  const summary = invoices.reduce((acc, invoice) => {
    acc.totalOutstanding += invoice.balanceAmount;
    acc.totalInvoices += 1;
    if (invoice.dueDate < new Date()) {
      acc.overdueAmount += invoice.balanceAmount;
      acc.overdueCount += 1;
    }
    return acc;
  }, { totalOutstanding: 0, totalInvoices: 0, overdueAmount: 0, overdueCount: 0 });

  res.status(200).json({ status: 'success', results: invoices.length, data: { invoices: invoicesWithOverdue, summary } });
});

exports.searchInvoices = catchAsync(async (req, res, next) => {
  const { query } = req.params;
  const { limit = 20 } = req.query;
  const invoices = await Invoice.find({
    organizationId: req.user.organizationId,
    $or: [
      { invoiceNumber: { $regex: query, $options: 'i' } },
      { 'customerId.name': { $regex: query, $options: 'i' } },
      { notes: { $regex: query, $options: 'i' } }
    ],
    isDeleted: { $ne: true }
  }).populate('customerId', 'name phone').limit(parseInt(limit)).sort({ invoiceDate: -1 });
  res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
});

exports.getLowStockWarnings = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  }).populate('items.productId');
  if (!invoice) return next(new AppError('Invoice not found', 404));
  const warnings = [];
  for (const item of invoice.items) {
    if (item.productId) {
      const inventory = item.productId.inventory.find(inv => String(inv.branchId) === String(invoice.branchId));
      if (inventory && inventory.reorderLevel && inventory.quantity < inventory.reorderLevel) {
        warnings.push({
          productId: item.productId._id,
          productName: item.productId.name,
          currentStock: inventory.quantity,
          reorderLevel: inventory.reorderLevel,
          message: `${item.productId.name} is below reorder level (${inventory.quantity} < ${inventory.reorderLevel})`
        });
      }
    }
  }
  res.status(200).json({ status: 'success', warnings, hasWarnings: warnings.length > 0 });
});

exports.getAllInvoices = factory.getAll(Invoice, {
  populate: [
    { path: 'customerId', select: 'name phone email' },
    { path: 'items.productId', select: 'name sku' },
    { path: 'branchId', select: 'name code' }
  ]
});

exports.getInvoice = factory.getOne(Invoice, {
  populate: [
    { path: 'customerId', select: 'name phone email address' },
    { path: 'items.productId', select: 'name sku sellingPrice' },
    { path: 'branchId', select: 'name code address' },
    { path: 'createdBy', select: 'name email' }
  ]
});

exports.deleteInvoice = factory.deleteOne(Invoice);

exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
  const { ids, status } = req.body;
  if (!ids) return next(new AppError("Ids required", 400));
  await Invoice.updateMany({ _id: { $in: ids }, organizationId: req.user.organizationId }, { $set: { status } });
  res.status(200).json({ status: "success", message: "Updated" });
});

exports.validateNumber = catchAsync(async (req, res, next) => {
  const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
  res.status(200).json({ status: "success", valid: !exists });
});

exports.exportInvoices = catchAsync(async (req, res, next) => {
  const docs = await Invoice.find({ organizationId: req.user.organizationId }).populate('customerId').lean();
  res.status(200).json({ status: "success", data: docs });
});


exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
  const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId, isDeleted: { $ne: true } }).populate('items.productId', 'name sku').sort({ invoiceDate: -1 });
  res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
});

exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
  const invoiceId = req.params.id;
  const history = await InvoiceAudit.find({ invoiceId }).sort({ createdAt: -1 }).populate('performedBy', 'name email');
  res.status(200).json({ status: "success", results: history.length, data: { history } });
});

exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).populate(['customerId', 'branchId']);
  if (!invoice) return next(new AppError('Invoice not found', 404));
  const buffer = await invoicePDFService.generateInvoicePDF(invoice);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=invoice_${invoice.invoiceNumber}.pdf` });
  res.send(buffer);
});

exports.sendInvoiceEmail = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).populate('customerId');
  if (!invoice) return next(new AppError('Invoice not found', 404));
  const customerEmail = invoice.customerId?.email;
  if (!customerEmail) return next(new AppError('Customer email not found', 400));
  await InvoiceAudit.create({
    invoiceId: invoice._id,
    action: 'EMAIL_SENT',
    performedBy: req.user._id,
    details: `Invoice emailed to ${customerEmail}`,
    ipAddress: req.ip
  });
  // await InvoiceAudit.create({ invoiceId: invoice._id, action: 'EMAIL_SENT', performedBy: req.user._id, details: `Invoice emailed to ${customerEmail}`, ipAddress: req.ip });
  res.status(200).json({ status: 'success', message: 'Invoice email sent successfully' });
});


// ------------------------------------------ Analytics ------------------------------------
// exports.profitSummary = catchAsync(async (req, res, next) => {
//   const { startDate, endDate } = req.query;
//   const match = {
//     organizationId: req.user.organizationId,
//     status: { $in: ['issued', 'paid'] },
//     isDeleted: { $ne: true }
//   };
//   if (startDate || endDate) {
//     match.invoiceDate = {};
//     if (startDate) match.invoiceDate.$gte = new Date(startDate);
//     if (endDate) match.invoiceDate.$lte = new Date(endDate);
//   }
//   const invoices = await Invoice.find(match).populate('items.productId', 'purchasePrice');
//   let totalRevenue = 0, totalCOGS = 0;
//   for (const invoice of invoices) {
//     totalRevenue += invoice.grandTotal;
//     for (const item of invoice.items) {
//       const product = item.productId;
//       if (product && product.purchasePrice) {
//         totalCOGS += item.quantity * product.purchasePrice;
//       }
//     }
//   }
//   const totalProfit = totalRevenue - totalCOGS;
//   res.status(200).json({ status: "success", data: { totalRevenue, totalCOGS, totalProfit, profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0 } });
// });
/* ======================================================
   PROFIT SUMMARY (Updated)
====================================================== */
exports.profitSummary = catchAsync(async (req, res, next) => {
  const { startDate, endDate, branchId } = req.query;
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true }
  };
  
  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  if (branchId && branchId !== 'all') {
    match.branchId = branchId;
  }

  const invoices = await Invoice.find(match)
    .populate({
      path: 'items.productId',
      select: 'name purchasePrice'
    })
    .lean();

  let totalRevenue = 0, totalCost = 0, totalProfit = 0;
  let productCounts = {};
  
  for (const invoice of invoices) {
    totalRevenue += invoice.grandTotal || 0;
    
    let invoiceCost = 0;
    for (const item of invoice.items) {
      if (item.productId) {
        const purchasePrice = item.productId.purchasePrice || 0;
        invoiceCost += purchasePrice * item.quantity;
        
        // Count products
        const productId = item.productId._id.toString();
        productCounts[productId] = (productCounts[productId] || 0) + item.quantity;
      }
    }
    
    totalCost += invoiceCost;
    totalProfit += (invoice.grandTotal - invoiceCost);
  }

  // Calculate additional metrics
  const uniqueProducts = Object.keys(productCounts).length;
  const averageProductPrice = totalRevenue > 0 ? totalRevenue / Object.values(productCounts).reduce((a, b) => a + b, 0) : 0;

  res.status(200).json({
    status: "success",
    data: {
      financials: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0,
        markup: totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : 0
      },
      metrics: {
        totalInvoices: invoices.length,
        uniqueProducts,
        averageRevenuePerInvoice: invoices.length > 0 ? (totalRevenue / invoices.length).toFixed(2) : 0,
        averageProfitPerInvoice: invoices.length > 0 ? (totalProfit / invoices.length).toFixed(2) : 0,
        averageProductPrice: averageProductPrice.toFixed(2)
      },
      period: {
        start: startDate || 'Beginning',
        end: endDate || 'Now'
      }
    }
  });
});
/* ======================================================
   COMPREHENSIVE PROFIT ANALYSIS
====================================================== */
exports.getProfitAnalysis = catchAsync(async (req, res, next) => {
  const { 
    startDate, 
    endDate, 
    groupBy = 'day',
    detailed = 'false',
    branchId 
  } = req.query;

  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true }
  };

  // Date filtering
  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  // Branch filtering
  if (branchId && branchId !== 'all') {
    match.branchId = branchId;
  }

  // Get invoices with product details
  const invoices = await Invoice.find(match)
    .populate({
      path: 'items.productId',
      select: 'name purchasePrice'
    })
    .populate('customerId', 'name')
    .populate('branchId', 'name')
    .sort({ invoiceDate: -1 });

  // Calculate profit using utility
  const profitData = await ProfitCalculator.calculateBulkProfit(invoices);

  // Time-based analysis
  const timeAnalysis = await ProfitCalculator.getProfitByPeriod(
    req.user.organizationId,
    startDate,
    endDate,
    groupBy
  );

  // Branch-wise profit (if multi-branch)
  const branchWiseProfit = {};
  if (req.user.branchId) {
    for (const invoice of invoices) {
      const branchName = invoice.branchId?.name || 'Unknown';
      if (!branchWiseProfit[branchName]) {
        branchWiseProfit[branchName] = {
          branchName,
          revenue: 0,
          cost: 0,
          profit: 0,
          invoiceCount: 0
        };
      }

      let invoiceCost = 0;
      for (const item of invoice.items) {
        if (item.productId) {
          const purchasePrice = item.productId.purchasePrice || 0;
          invoiceCost += purchasePrice * item.quantity;
        }
      }

      branchWiseProfit[branchName].revenue += invoice.grandTotal;
      branchWiseProfit[branchName].cost += invoiceCost;
      branchWiseProfit[branchName].profit += (invoice.grandTotal - invoiceCost);
      branchWiseProfit[branchName].invoiceCount += 1;
    }
  }

  // Top performing products
  const topProducts = profitData.productAnalysis
    .filter(p => p.totalProfit > 0)
    .sort((a, b) => b.totalProfit - a.totalProfit)
    .slice(0, 10);

  const worstProducts = profitData.productAnalysis
    .filter(p => p.totalProfit <= 0)
    .sort((a, b) => a.totalProfit - b.totalProfit)
    .slice(0, 10);

  // Response structure
  const response = {
    summary: {
      ...profitData.summary,
      totalInvoices: invoices.length,
      timePeriod: {
        start: startDate || 'Beginning',
        end: endDate || 'Now'
      }
    },
    timeAnalysis,
    productAnalysis: {
      totalProducts: profitData.productAnalysis.length,
      topPerforming: topProducts,
      worstPerforming: worstProducts,
      averageProfitMargin: profitData.productAnalysis.length > 0
        ? profitData.productAnalysis.reduce((sum, p) => sum + (p.profitMargin || 0), 0) / profitData.productAnalysis.length
        : 0
    },
    branchAnalysis: Object.values(branchWiseProfit)
  };

  // Add detailed invoice data if requested
  if (detailed === 'true') {
    const detailedInvoices = await Promise.all(
      invoices.map(async (invoice) => {
        const profit = await ProfitCalculator.calculateInvoiceProfit(invoice);
        
        return {
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          customerName: invoice.customerId?.name || 'Unknown',
          branchName: invoice.branchId?.name || 'Unknown',
          ...profit,
          paymentStatus: invoice.paymentStatus
        };
      })
    );
    
    response.detailedInvoices = detailedInvoices;
  }

  res.status(200).json({
    status: 'success',
    data: response
  });
});

/* ======================================================
   REAL-TIME PROFIT DASHBOARD
====================================================== */
exports.getProfitDashboard = catchAsync(async (req, res, next) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  // Today's profit
  const todayInvoices = await Invoice.find({
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true },
    invoiceDate: { $gte: today, $lte: now }
  }).populate('items.productId', 'purchasePrice').lean();

  // This month's profit
  const monthInvoices = await Invoice.find({
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true },
    invoiceDate: { $gte: monthStart, $lte: now }
  }).populate('items.productId', 'purchasePrice').lean();

  // This year's profit
  const yearInvoices = await Invoice.find({
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true },
    invoiceDate: { $gte: yearStart, $lte: now }
  }).populate('items.productId', 'purchasePrice').lean();

  // Helper function to calculate profit
  const calculateProfit = (invoices) => {
    let revenue = 0;
    let cost = 0;
    
    for (const invoice of invoices) {
      revenue += invoice.grandTotal || 0;
      
      for (const item of invoice.items) {
        if (item.productId) {
          cost += (item.productId.purchasePrice || 0) * item.quantity;
        }
      }
    }
    
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    
    return { revenue, cost, profit, margin };
  };

  const todayProfit = calculateProfit(todayInvoices);
  const monthProfit = calculateProfit(monthInvoices);
  const yearProfit = calculateProfit(yearInvoices);

  // Get top 5 products by profit this month
  const productProfits = {};
  for (const invoice of monthInvoices) {
    for (const item of invoice.items) {
      if (item.productId) {
        const productId = item.productId._id.toString();
        const productName = item.name;
        const purchasePrice = item.productId.purchasePrice || 0;
        const revenue = item.price * item.quantity;
        const cost = purchasePrice * item.quantity;
        const profit = revenue - cost;
        
        if (!productProfits[productId]) {
          productProfits[productId] = {
            productId,
            productName,
            revenue: 0,
            cost: 0,
            profit: 0,
            quantity: 0
          };
        }
        
        productProfits[productId].revenue += revenue;
        productProfits[productId].cost += cost;
        productProfits[productId].profit += profit;
        productProfits[productId].quantity += item.quantity;
      }
    }
  }

  const topProducts = Object.values(productProfits)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
    .map(p => ({
      ...p,
      profitMargin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      profitPerUnit: p.quantity > 0 ? p.profit / p.quantity : 0
    }));

  res.status(200).json({
    status: 'success',
    data: {
      today: {
        ...todayProfit,
        invoiceCount: todayInvoices.length
      },
      thisMonth: {
        ...monthProfit,
        invoiceCount: monthInvoices.length,
        averageDailyProfit: monthProfit.profit / (now.getDate() || 1)
      },
      thisYear: {
        ...yearProfit,
        invoiceCount: yearInvoices.length,
        averageMonthlyProfit: yearProfit.profit / (now.getMonth() + 1)
      },
      topProducts,
      metrics: {
        conversionRate: 'N/A', // Could be calculated if you have lead data
        averageOrderValue: monthInvoices.length > 0 ? monthProfit.revenue / monthInvoices.length : 0,
        profitPerInvoice: monthInvoices.length > 0 ? monthProfit.profit / monthInvoices.length : 0
      }
    }
  });
});

/* ======================================================
   PRODUCT-SPECIFIC PROFIT ANALYSIS
====================================================== */
exports.getProductProfitAnalysis = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true },
    'items.productId': productId
  };

  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  // Get invoices containing this product
  const invoices = await Invoice.find(match)
    .populate({
      path: 'items.productId',
      match: { _id: productId },
      select: 'name purchasePrice'
    })
    .populate('customerId', 'name')
    .sort({ invoiceDate: -1 });

  // Filter to only get items for this specific product
  const productInvoices = invoices.map(invoice => {
    const productItems = invoice.items.filter(item => 
      item.productId && item.productId._id.toString() === productId
    );
    
    return {
      ...invoice.toObject(),
      items: productItems
    };
  }).filter(invoice => invoice.items.length > 0);

  // Calculate product-specific profit
  let totalRevenue = 0;
  let totalCost = 0;
  let totalQuantity = 0;
  const salesByMonth = {};
  const salesByCustomer = {};

  for (const invoice of productInvoices) {
    for (const item of invoice.items) {
      if (item.productId && item.productId._id.toString() === productId) {
        const purchasePrice = item.productId.purchasePrice || 0;
        const revenue = item.price * item.quantity;
        const cost = purchasePrice * item.quantity;
        
        totalRevenue += revenue;
        totalCost += cost;
        totalQuantity += item.quantity;

        // Monthly aggregation
        const invoiceDate = new Date(invoice.invoiceDate);
        const monthKey = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (!salesByMonth[monthKey]) {
          salesByMonth[monthKey] = {
            month: monthKey,
            revenue: 0,
            cost: 0,
            profit: 0,
            quantity: 0
          };
        }
        
        salesByMonth[monthKey].revenue += revenue;
        salesByMonth[monthKey].cost += cost;
        salesByMonth[monthKey].profit += (revenue - cost);
        salesByMonth[monthKey].quantity += item.quantity;

        // Customer aggregation
        const customerId = invoice.customerId?._id?.toString() || 'unknown';
        const customerName = invoice.customerId?.name || 'Unknown';
        
        if (!salesByCustomer[customerId]) {
          salesByCustomer[customerId] = {
            customerId,
            customerName,
            revenue: 0,
            cost: 0,
            profit: 0,
            quantity: 0
          };
        }
        
        salesByCustomer[customerId].revenue += revenue;
        salesByCustomer[customerId].cost += cost;
        salesByCustomer[customerId].profit += (revenue - cost);
        salesByCustomer[customerId].quantity += item.quantity;
      }
    }
  }

  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const averageSellingPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0;
  const averageCostPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;
  const profitPerUnit = totalQuantity > 0 ? totalProfit / totalQuantity : 0;

  // Get product details
  const product = await Product.findById(productId).lean();

  res.status(200).json({
    status: 'success',
    data: {
      product: {
        _id: productId,
        name: product?.name || 'Unknown Product',
        purchasePrice: product?.purchasePrice || 0,
        sellingPrice: product?.sellingPrice || 0
      },
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin,
        totalQuantity,
        averageSellingPrice,
        averageCostPrice,
        profitPerUnit,
        totalInvoices: productInvoices.length
      },
      timeAnalysis: Object.values(salesByMonth).sort((a, b) => a.month.localeCompare(b.month)),
      customerAnalysis: Object.values(salesByCustomer)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10),
      recentSales: productInvoices.slice(0, 10).map(invoice => ({
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        quantity: invoice.items.reduce((sum, item) => sum + item.quantity, 0),
        revenue: invoice.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        profit: invoice.items.reduce((sum, item) => {
          const purchasePrice = item.productId?.purchasePrice || 0;
          return sum + ((item.price - purchasePrice) * item.quantity);
        }, 0)
      }))
    }
  });
});
module.exports = exports;
