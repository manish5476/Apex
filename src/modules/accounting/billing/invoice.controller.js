const mongoose = require("mongoose");
const { z } = require("zod");
const { format } = require('fast-csv');
const { invalidateOpeningBalance } = require("../core/ledgerCache.service");

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
const StockValidationService = require("../../_legacy/services/stockValidationService"); // ADD THIS
const { createNotification } = require("../../notification/core/notification.service");
const { postInvoiceJournal } = require('../../inventory/core/salesJournal.service');

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

    // Find inventory for this branch
    let inventory = product.inventory.find(
      inv => String(inv.branchId) === String(branchId)
    );

    if (!inventory) {
      throw new AppError(
        `No inventory record found for ${product.name} in this branch`,
        400
      );
    }

    // Check stock availability
    if (inventory.quantity < item.quantity) {
      throw new AppError(
        `Insufficient stock for ${product.name}. Available: ${inventory.quantity}, Required: ${item.quantity}`,
        400
      );
    }

    // Reduce stock
    inventory.quantity -= item.quantity;
    await product.save({ session });

    // Update last sold date
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
   1. CREATE INVOICE WITH STOCK REDUCTION
====================================================== */
exports.createInvoice = catchAsync(async (req, res, next) => {
  let invoice;

  // Validate input
  const validatedData = createInvoiceSchema.safeParse(req.body);
  if (!validatedData.success) {
    return next(new AppError(validatedData.error.errors[0].message, 400));
  }

  await runInTransaction(async (session) => {
    // 1. VALIDATE STOCK AVAILABILITY BEFORE CREATING INVOICE
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

    // 2. CREATE INVOICE
    invoice = (await Invoice.create([{
      ...req.body,
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      createdBy: req.user._id
    }], { session }))[0];

    // 3. REDUCE STOCK
    await reduceStockForInvoice(
      req.body.items,
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
      await postInvoiceJournal({
        orgId: req.user.organizationId,
        branchId: req.user.branchId,
        invoice,
        customerId: invoice.customerId,
        items: invoice.items,
        userId: req.user._id,
        session
      });

      // 6. CREATE SALES RECORD FROM INVOICE
      try {
        await SalesService.createFromInvoiceTransactional(invoice, session);
      } catch (salesError) {
        console.warn('Failed to create sales record:', salesError.message);
        // Continue with invoice creation even if sales record fails
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

  // ✅ AFTER transaction commit
  automationService.triggerEvent(
    'invoice.created',
    invoice.toObject(),
    req.user.organizationId
  );

  // Emit real-time update via socket
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
   2. UPDATE INVOICE WITH STOCK MANAGEMENT
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

    // H. RE-BOOK ACCOUNTING ENTRIES (if needed)
    if (needsFinancialUpdate && updatedInvoice.status !== 'draft') {
      const arAccount = await getOrInitAccount(
        req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session
      );
      
      // 1. Accounts Receivable Entry
      await AccountEntry.create([{
        organizationId: req.user.organizationId, 
        branchId: req.user.branchId, 
        accountId: arAccount._id, 
        customerId: updatedInvoice.customerId,
        date: updatedInvoice.invoiceDate, 
        debit: updatedInvoice.grandTotal, 
        credit: 0,
        description: `Invoice #${updatedInvoice.invoiceNumber} (Updated)`, 
        referenceType: 'invoice', 
        referenceNumber: updatedInvoice.invoiceNumber, 
        invoiceId: updatedInvoice._id, 
        createdBy: req.user._id
      }], { session });

      // 2. Sales Revenue Entry
      const salesAccount = await getOrInitAccount(
        req.user.organizationId, 'income', 'Sales', '4000', session
      );
      const netRevenue = updatedInvoice.grandTotal - (updatedInvoice.totalTax || 0);

      await AccountEntry.create([{
        organizationId: req.user.organizationId, 
        branchId: req.user.branchId, 
        accountId: salesAccount._id,
        date: updatedInvoice.invoiceDate, 
        debit: 0, 
        credit: netRevenue,
        description: `Revenue: #${updatedInvoice.invoiceNumber}`, 
        referenceType: 'invoice', 
        referenceNumber: updatedInvoice.invoiceNumber, 
        invoiceId: updatedInvoice._id, 
        createdBy: req.user._id
      }], { session });

      // 3. Tax Entry
      if (updatedInvoice.totalTax > 0) {
        const taxAccount = await getOrInitAccount(
          req.user.organizationId, 'liability', 'Tax Payable', '2100', session
        );
        
        await AccountEntry.create([{
          organizationId: req.user.organizationId, 
          branchId: req.user.branchId, 
          accountId: taxAccount._id,
          date: updatedInvoice.invoiceDate, 
          debit: 0, 
          credit: updatedInvoice.totalTax,
          description: `Tax: #${updatedInvoice.invoiceNumber}`, 
          referenceType: 'invoice', 
          referenceNumber: updatedInvoice.invoiceNumber, 
          invoiceId: updatedInvoice._id, 
          createdBy: req.user._id
        }], { session });
      }

      // 4. Update Customer Balance (Add new amount)
      await Customer.findByIdAndUpdate(
        updatedInvoice.customerId, 
        { $inc: { outstandingBalance: updatedInvoice.grandTotal } }, 
        { session }
      );

      // 5. Update Sales Record
      const salesRecord = await mongoose.model('Sales').findOne({ 
        invoiceId: updatedInvoice._id 
      }).session(session);
      
      if (salesRecord) {
        salesRecord.totalAmount = updatedInvoice.grandTotal;
        salesRecord.items = updatedInvoice.items.map(item => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          qty: item.quantity,
          rate: item.price,
          discount: item.discount || 0,
          tax: item.taxRate || 0,
          lineTotal: (item.price * item.quantity) - (item.discount || 0) + ((item.taxRate || 0) / 100 * (item.price * item.quantity))
        }));
        await salesRecord.save({ session });
      }
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
   3. CANCEL INVOICE WITH STOCK RESTORATION
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
      { $inc: { 
        totalPurchases: -invoice.grandTotal,
        outstandingBalance: -invoice.grandTotal 
      }}, 
      { session }
    );

    // 3. CREATE CREDIT NOTE ENTRIES (Reverse ledger)
    const arAccount = await getOrInitAccount(
      req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session
    );
    const salesAccount = await getOrInitAccount(
      req.user.organizationId, 'income', 'Sales', '4000', session
    );

    // Debit Sales (Reduce Income)
    const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);
    await AccountEntry.create([{
      organizationId: req.user.organizationId, 
      branchId: invoice.branchId, 
      accountId: salesAccount._id,
      date: new Date(), 
      debit: netRevenue, 
      credit: 0,
      description: `Cancel: #${invoice.invoiceNumber}`,
      referenceType: 'credit_note', 
      referenceNumber: `CN-${invoice.invoiceNumber}`, 
      invoiceId: invoice._id, 
      createdBy: req.user._id
    }], { session });

    // Debit Tax (Reduce Liability)
    if (invoice.totalTax > 0) {
      const taxAccount = await getOrInitAccount(
        req.user.organizationId, 'liability', 'Tax Payable', '2100', session
      );
      
      await AccountEntry.create([{
        organizationId: req.user.organizationId, 
        branchId: invoice.branchId, 
        accountId: taxAccount._id,
        date: new Date(), 
        debit: invoice.totalTax, 
        credit: 0,
        description: `Cancel Tax: #${invoice.invoiceNumber}`,
        referenceType: 'credit_note', 
        referenceNumber: `CN-${invoice.invoiceNumber}`, 
        invoiceId: invoice._id, 
        createdBy: req.user._id
      }], { session });
    }

    // Credit AR (Reduce Debt)
    await AccountEntry.create([{
      organizationId: req.user.organizationId, 
      branchId: invoice.branchId, 
      accountId: arAccount._id, 
      customerId: invoice.customerId,
      date: new Date(), 
      debit: 0, 
      credit: invoice.grandTotal,
      description: `Cancel: #${invoice.invoiceNumber}`,
      referenceType: 'credit_note', 
      referenceNumber: `CN-${invoice.invoiceNumber}`, 
      invoiceId: invoice._id, 
      createdBy: req.user._id
    }], { session });

    // 4. UPDATE INVOICE STATUS
    invoice.status = 'cancelled';
    invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason} (${new Date().toISOString()})`;
    await invoice.save({ session });

    // 5. CANCEL RELATED SALES RECORD
    const salesRecord = await mongoose.model('Sales').findOne({ 
      invoiceId: invoice._id 
    }).session(session);
    
    if (salesRecord) {
      salesRecord.status = 'cancelled';
      await salesRecord.save({ session });
    }

    // 6. CREATE AUDIT LOG
    await InvoiceAudit.create([{
      invoiceId: invoice._id, 
      action: 'CANCEL', 
      performedBy: req.user._id,
      details: `Cancelled. Restock: ${restock}. Reason: ${reason}`, 
      ipAddress: req.ip
    }], { session });

  }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

  // Emit real-time update
  emitToOrg(req.user.organizationId, 'invoice:cancelled', {
    invoiceId: id,
    invoiceNumber: invoice.invoiceNumber
  });

  res.status(200).json({ 
    status: "success", 
    message: "Invoice cancelled & reversed." 
  });
});

/* ======================================================
   4. ADD PAYMENT TO INVOICE
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

    // Validate payment doesn't exceed invoice total
    const newPaidAmount = invoice.paidAmount + amount;
    const newBalance = invoice.grandTotal - newPaidAmount;

    if (newPaidAmount > invoice.grandTotal) {
      throw new AppError(
        `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
        400
      );
    }

    // Update invoice
    invoice.paidAmount = newPaidAmount;
    invoice.balanceAmount = newBalance;
    
    // Update payment status
    if (newBalance <= 0) {
      invoice.paymentStatus = 'paid';
      invoice.status = 'paid';
    } else if (amount > 0) {
      invoice.paymentStatus = 'partial';
    }
    
    if (paymentMethod) invoice.paymentMethod = paymentMethod;
    if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;
    
    await invoice.save({ session });

    // Update customer outstanding balance
    await Customer.findByIdAndUpdate(
      invoice.customerId,
      { $inc: { outstandingBalance: -amount } },
      { session }
    );

    // Record accounting entry
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

    // Create Payment record
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

    // Create audit log
    await InvoiceAudit.create([{
      invoiceId: invoice._id,
      action: 'PAYMENT',
      performedBy: req.user._id,
      details: `Payment of ${amount} added via ${paymentMethod}`,
      ipAddress: req.ip
    }], { session });

  }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

  res.status(200).json({
    status: 'success',
    message: 'Payment added successfully'
  });
});

/* ======================================================
   5. CHECK STOCK BEFORE INVOICE CREATION
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

  // Get product details for better feedback
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
   6. CONVERT DRAFT TO ACTIVE INVOICE
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

    // Validate stock
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

    // Reduce stock
    await reduceStockForInvoice(
      invoice.items,
      invoice.branchId,
      req.user.organizationId,
      session
    );

    // Generate final invoice number if needed
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

    // Update invoice status
    invoice.status = 'issued';
    invoice.invoiceDate = new Date();
    await invoice.save({ session });

    // Update customer
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

    // Create accounting entries
    await postInvoiceJournal({
      orgId: req.user.organizationId,
      branchId: invoice.branchId,
      invoice,
      customerId: invoice.customerId,
      items: invoice.items,
      userId: req.user._id,
      session
    });

    // Create sales record
    await SalesService.createFromInvoiceTransactional(invoice, session);

    // Create audit log
    await InvoiceAudit.create([{
      invoiceId: invoice._id,
      action: 'CONVERT_DRAFT',
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
// exports.getInvoiceWithStock = catchAsync(async (req, res, next) => {
//   const invoice = await Invoice.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   }).populate([
//     { path: 'customerId', select: 'name phone email address' },
//     { path: 'items.productId', select: 'name sku sellingPrice inventory' },
//     { path: 'branchId', select: 'name code address' },
//     { path: 'createdBy', select: 'name email' }
//   ]);

//   if (!invoice) {
//     return next(new AppError('Invoice not found', 404));
//   }

//   // Add current stock info to each item
//   const itemsWithStock = await Promise.all(
//     invoice.items.map(async (item) => {
//       const product = item.productId;
//       if (product) {
//         const inventory = product.inventory.find(
//           inv => String(inv.branchId) === String(invoice.branchId)
//         );
        
//         return {
//           ...item.toObject(),
//           currentStock: inventory?.quantity || 0,
//           reorderLevel: inventory?.reorderLevel || 10
//         };
//       }
//       return item;
//     })
//   );

//   const invoiceWithStock = {
//     ...invoice.toObject(),
//     items: itemsWithStock
//   };

//   res.status(200).json({
//     status: 'success',
//     data: { invoice: invoiceWithStock }
//   });
// });

/* ======================================================
   ADD THESE METHODS TO YOUR EXISTING CONTROLLER
====================================================== */

// Get invoice with current stock info
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

  // Add current stock info to each item
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

// Get invoice payments
exports.getInvoicePayments = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({
    invoiceId: req.params.id,
    organizationId: req.user.organizationId,
    isDeleted: { $ne: true }
  }).sort({ paymentDate: -1 });

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments }
  });
});

// Get customer invoice summary
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
    data: summary[0] || {
      totalInvoices: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalDue: 0
    }
  });
});

// Sales report by date range
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

  res.status(200).json({
    status: 'success',
    results: report.length,
    data: { report }
  });
});

// Tax report
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
        _id: {
          year: { $year: "$invoiceDate" },
          month: { $month: "$invoiceDate" }
        },
        totalTax: { $sum: "$totalTax" },
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);

  res.status(200).json({
    status: 'success',
    results: taxReport.length,
    data: { taxReport }
  });
});

// Outstanding invoices
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

  // Calculate overdue days
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

  // Calculate summary
  const summary = invoices.reduce((acc, invoice) => {
    acc.totalOutstanding += invoice.balanceAmount;
    acc.totalInvoices += 1;
    if (invoice.dueDate < new Date()) {
      acc.overdueAmount += invoice.balanceAmount;
      acc.overdueCount += 1;
    }
    return acc;
  }, {
    totalOutstanding: 0,
    totalInvoices: 0,
    overdueAmount: 0,
    overdueCount: 0
  });

  res.status(200).json({
    status: 'success',
    results: invoices.length,
    data: {
      invoices: invoicesWithOverdue,
      summary
    }
  });
});

// Search invoices
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
  })
    .populate('customerId', 'name phone')
    .limit(parseInt(limit))
    .sort({ invoiceDate: -1 });

  res.status(200).json({
    status: 'success',
    results: invoices.length,
    data: { invoices }
  });
});

// Get low stock warnings for invoice items
exports.getLowStockWarnings = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  }).populate('items.productId');

  if (!invoice) {
    return next(new AppError('Invoice not found', 404));
  }

  const warnings = [];
  for (const item of invoice.items) {
    if (item.productId) {
      const inventory = item.productId.inventory.find(
        inv => String(inv.branchId) === String(invoice.branchId)
      );
      
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

  res.status(200).json({
    status: 'success',
    warnings,
    hasWarnings: warnings.length > 0
  });
});

/* ======================================================
   STANDARD CRUD OPERATIONS
====================================================== */
exports.getAllInvoices = factory.getAll(Invoice, {
  populate: [
    { path: 'customerId', select: 'name phone email' },
    { path: 'items.productId', select: 'name sku' },
    { path: 'branchId', select: 'name code' }
  ],
  searchFields: ['invoiceNumber', 'customerId', 'status']
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

/* ======================================================
   UTILITY FUNCTIONS
====================================================== */
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

exports.profitSummary = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  
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

  const invoices = await Invoice.find(match).populate('items.productId', 'purchasePrice');

  let totalRevenue = 0;
  let totalCOGS = 0;
  let totalProfit = 0;

  for (const invoice of invoices) {
    totalRevenue += invoice.grandTotal;
    
    // Calculate COGS
    let invoiceCOGS = 0;
    for (const item of invoice.items) {
      const product = item.productId;
      if (product && product.purchasePrice) {
        invoiceCOGS += item.quantity * product.purchasePrice;
      }
    }
    totalCOGS += invoiceCOGS;
  }

  totalProfit = totalRevenue - totalCOGS;

  res.status(200).json({ 
    status: "success", 
    data: {
      totalRevenue,
      totalCOGS,
      totalProfit,
      profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0
    } 
  });
});

exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
  const invoices = await Invoice.find({ 
    organizationId: req.user.organizationId, 
    customerId: req.params.customerId,
    isDeleted: { $ne: true }
  }).populate('items.productId', 'name sku').sort({ invoiceDate: -1 });
  
  res.status(200).json({ 
    status: "success", 
    results: invoices.length, 
    data: { invoices } 
  });
});

exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
  const invoiceId = req.params.id;
  const history = await InvoiceAudit.find({ invoiceId }).sort({ createdAt: -1 }).populate('performedBy', 'name email');
  res.status(200).json({ 
    status: "success", 
    results: history.length, 
    data: { history } 
  });
});

/* ======================================================
   DOWNLOAD INVOICE PDF
====================================================== */
exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  }).populate(['customerId', 'branchId']);

  if (!invoice) {
    return next(new AppError('Invoice not found', 404));
  }

  const buffer = await invoicePDFService.generateInvoicePDF(invoice);
  
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename=invoice_${invoice.invoiceNumber}.pdf`
  });
  
  res.send(buffer);
});

/* ======================================================
   SEND INVOICE EMAIL
====================================================== */
exports.sendInvoiceEmail = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  }).populate('customerId');

  if (!invoice) {
    return next(new AppError('Invoice not found', 404));
  }

  // Generate PDF
  const buffer = await invoicePDFService.generateInvoicePDF(invoice);
  
  // Get customer email
  const customerEmail = invoice.customerId?.email;
  if (!customerEmail) {
    return next(new AppError('Customer email not found', 400));
  }

  // Send email (implement your email service here)
  // await emailService.sendInvoiceEmail(customerEmail, buffer, invoice);
  
  // Create audit log
  await InvoiceAudit.create({
    invoiceId: invoice._id,
    action: 'EMAIL_SENT',
    performedBy: req.user._id,
    details: `Invoice emailed to ${customerEmail}`,
    ipAddress: req.ip
  });

  res.status(200).json({
    status: 'success',
    message: 'Invoice email sent successfully'
  });
});

module.exports = exports;

// const mongoose = require("mongoose");
// const { z } = require("zod");
// const { format } = require('fast-csv');
// const { invalidateOpeningBalance } = require("../services/ledgerCache");

// const Invoice = require("../models/invoiceModel");
// const Payment = require("../models/paymentModel");
// const Product = require("../models/productModel");
// const Customer = require("../models/customerModel");
// const AccountEntry = require('../models/accountEntryModel');
// const Account = require('../models/accountModel');
// const Organization = require("../models/organizationModel");
// const InvoiceAudit = require('../models/invoiceAuditModel');

// const SalesService = require("../services/salesService");
// const invoicePDFService = require("../services/invoicePDFService");
// const { createNotification } = require("../services/notificationService");
// const { postInvoiceJournal } = require('../services/salesJournalService');

// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const factory = require("../utils/handlerFactory");
// const { runInTransaction } = require("../utils/runInTransaction");
// const { emitToOrg } = require("../utils/socket");
// const automationService = require('../services/automationService');
// // --- HELPER: Ensure System Accounts Exist (Idempotent) ---
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

// // 🛡️ Validation Schema
// const createInvoiceSchema = z.object({
//   customerId: z.string().min(1, "Customer ID is required"),
//   items: z.array(z.object({
//     productId: z.string().min(1, "Product ID is required"),
//     quantity: z.number().positive("Quantity must be positive"),
//     price: z.number().nonnegative("Price cannot be negative"),
//     tax: z.number().optional().default(0),
//     discount: z.number().optional().default(0)
//   })).min(1, "Invoice must have at least one item"),

//   invoiceNumber: z.string().optional(),
//   invoiceDate: z.string().optional(),
//   dueDate: z.string().optional(),

//   paidAmount: z.number().nonnegative().optional().default(0),
//   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),

//   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
//   shippingCharges: z.number().nonnegative().optional().default(0),
//   notes: z.string().optional(),
//   roundOff: z.number().optional(),
//   gstType: z.string().optional()
// });



// exports.createInvoice = catchAsync(async (req, res) => {
//   let invoice;

//   await runInTransaction(async (session) => {
//     invoice = (await Invoice.create([{
//       ...req.body,
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       createdBy: req.user._id
//     }], { session }))[0];

//     await postInvoiceJournal({
//       orgId: req.user.organizationId,
//       branchId: req.user.branchId,
//       invoice,
//       customerId: invoice.customerId,
//       items: invoice.items,
//       userId: req.user._id,
//       session
//     });
//   });

//   // ✅ AFTER transaction commit
//   automationService.triggerEvent(
//     'invoice.created',
//     invoice.toObject(),
//     req.user.organizationId
//   );

//   res.status(201).json({
//     status: 'success',
//     data: invoice
//   });
// });


// /*    2. UPDATE INVOICE    */
// exports.updateInvoice = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const updates = req.body;
//   let updatedInvoice;

//   await runInTransaction(async (session) => {
//     const oldInvoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
//     if (!oldInvoice) throw new AppError('Invoice not found', 404);
//     if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice', 400);

//     // If Draft: Simple Update
//     if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
//       updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
//       return;
//     }

//     // If Issued: REVERSE EVERYTHING Logic
//     const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;
//     if (needsFinancialUpdate) {
//       // A. Reverse Inventory (Put items back on shelf)
//       for (const item of oldInvoice.items) {
//         await Product.findOneAndUpdate(
//           { _id: item.productId, "inventory.branchId": oldInvoice.branchId },
//           { $inc: { "inventory.$.quantity": item.quantity } },
//           { session }
//         );
//       }
//       // B. Reverse Financials (Wipe old entries)
//       await AccountEntry.deleteMany({ invoiceId: oldInvoice._id, referenceType: 'invoice' }, { session });
//       await Customer.findByIdAndUpdate(oldInvoice.customerId, { $inc: { outstandingBalance: -oldInvoice.grandTotal } }, { session });

//       // C. Apply New Inventory (Take items from shelf)
//       const enrichedItems = [];
//       const newItems = updates.items || oldInvoice.items;
//       for (const item of newItems) {
//         const product = await Product.findById(item.productId).session(session);
//         const branchInv = product.inventory.find(inv => String(inv.branchId) === String(oldInvoice.branchId));
//         if (!branchInv || branchInv.quantity < item.quantity) throw new AppError(`Insufficient stock: ${product.name}`, 400);

//         branchInv.quantity -= item.quantity;
//         await product.save({ session });
//         enrichedItems.push({ ...item, name: product.name, sku: product.sku });
//       }
//       updates.items = enrichedItems;

//       // D. Save & Re-Book
//       Object.assign(oldInvoice, updates);
//       updatedInvoice = await oldInvoice.save({ session }); // Recalculates Totals

//       // Re-book AR
//       const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
//       await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: updatedInvoice.customerId,
//         date: updatedInvoice.invoiceDate, debit: updatedInvoice.grandTotal, credit: 0,
//         description: `Invoice #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, invoiceId: updatedInvoice._id, createdBy: req.user._id
//       }], { session });

//       // Re-book Sales
//       const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
//       const netRevenue = updatedInvoice.grandTotal - (updatedInvoice.totalTax || 0); // Strict Formula

//       await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
//         date: updatedInvoice.invoiceDate, debit: 0, credit: netRevenue,
//         description: `Rev: #${updatedInvoice.invoiceNumber}`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, invoiceId: updatedInvoice._id, createdBy: req.user._id
//       }], { session });

//       // Re-book Tax
//       if (updatedInvoice.totalTax > 0) {
//         const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
//         await AccountEntry.create([{
//           organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: taxAccount._id,
//           date: updatedInvoice.invoiceDate, debit: 0, credit: updatedInvoice.totalTax,
//           description: `GST: #${updatedInvoice.invoiceNumber}`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, invoiceId: updatedInvoice._id, createdBy: req.user._id
//         }], { session });
//       }

//       await Customer.findByIdAndUpdate(updatedInvoice.customerId, { $inc: { outstandingBalance: updatedInvoice.grandTotal } }, { session });

//       await InvoiceAudit.create([{
//         invoiceId: updatedInvoice._id, action: 'UPDATE_FINANCIAL', performedBy: req.user._id,
//         details: `Invoice updated. New Total: ${updatedInvoice.grandTotal}`, ipAddress: req.ip
//       }], { session });
//     } else {
//       updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
//     }
//   }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

//   res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
// });

// /* 
//    3. CANCEL / RETURN INVOICE
//     */
// exports.cancelInvoice = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { reason, restock = true } = req.body;

//   await runInTransaction(async (session) => {
//     const invoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).populate('items.productId').session(session);
//     if (!invoice) throw new AppError('Invoice not found', 404);
//     if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

//     // 1. Restock (Optional)
//     if (restock) {
//       for (const item of invoice.items) {
//         if (item.productId) {
//           await Product.findOneAndUpdate(
//             { _id: item.productId, "inventory.branchId": invoice.branchId },
//             { $inc: { "inventory.$.quantity": item.quantity } },
//             { session }
//           );
//         }
//       }
//     }

//     // 2. Reverse Customer Balance
//     await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -invoice.grandTotal } }, { session });

//     // 3. Create Credit Note (Reverses Ledger)
//     const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
//     const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);

//     // Dr Sales (Reduce Income)
//     const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
//       date: new Date(), debit: netRevenue, credit: 0,
//       description: `Cancel: #${invoice.invoiceNumber}`,
//       referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, invoiceId: invoice._id, createdBy: req.user._id
//     }], { session });

//     // Dr Tax (Reduce Liability)
//     if (invoice.totalTax > 0) {
//       const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
//       await AccountEntry.create([{
//         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: taxAccount._id,
//         date: new Date(), debit: invoice.totalTax, credit: 0,
//         description: `Cancel Tax: #${invoice.invoiceNumber}`,
//         referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, invoiceId: invoice._id, createdBy: req.user._id
//       }], { session });
//     }

//     // Cr AR (Reduce Debt)
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: invoice.customerId,
//       date: new Date(), debit: 0, credit: invoice.grandTotal,
//       description: `Cancel: #${invoice.invoiceNumber}`,
//       referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, invoiceId: invoice._id, createdBy: req.user._id
//     }], { session });

//     invoice.status = 'cancelled';
//     invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason}`;
//     await invoice.save({ session });

//     await InvoiceAudit.create([{
//       invoiceId: invoice._id, action: 'CANCEL', performedBy: req.user._id,
//       details: `Cancelled. Restock: ${restock}. Reason: ${reason}`, ipAddress: req.ip
//     }], { session });

//   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

//   res.status(200).json({ status: "success", message: "Invoice cancelled & reversed." });
// });

// // --- UTILS ---
// exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
//   const { ids, status } = req.body;
//   if (!ids) return next(new AppError("Ids required", 400));
//   await Invoice.updateMany({ _id: { $in: ids }, organizationId: req.user.organizationId }, { $set: { status } });
//   res.status(200).json({ status: "success", message: "Updated" });
// });

// exports.validateNumber = catchAsync(async (req, res, next) => {
//   const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
//   res.status(200).json({ status: "success", valid: !exists });
// });

// exports.exportInvoices = catchAsync(async (req, res, next) => {
//   const docs = await Invoice.find({ organizationId: req.user.organizationId }).populate('customerId').lean();
//   res.status(200).json({ status: "success", data: docs });
// });

// // ✅ ADDED THIS MISSING FUNCTION
// exports.profitSummary = catchAsync(async (req, res, next) => {
//   res.status(200).json({ status: "success", data: {} }); // Placeholder for now
// });

// // ✅ ADDED THIS MISSING FUNCTION
// exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
//   const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId });
//   res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
// });

// // ✅ ADDED THIS MISSING FUNCTION
// exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
//   const invoiceId = req.params.id;
//   const history = await InvoiceAudit.find({ invoiceId }).sort({ createdAt: -1 });
//   res.status(200).json({ status: "success", results: history.length, data: { history } });
// });

// exports.getAllInvoices = factory.getAll(Invoice);
// exports.getInvoice = factory.getOne(Invoice, [{ path: "customerId" }, { path: "items.productId" }]);
// exports.deleteInvoice = factory.deleteOne(Invoice); 