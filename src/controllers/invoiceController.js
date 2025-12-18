const mongoose = require("mongoose");
const { z } = require("zod");
const { format } = require('fast-csv');

const Invoice = require("../models/invoiceModel");
const Payment = require("../models/paymentModel");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel");
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel'); 
const Organization = require("../models/organizationModel");
const InvoiceAudit = require('../models/invoiceAuditModel');

const SalesService = require("../services/salesService");
const invoicePDFService = require("../services/invoicePDFService");
const { createNotification } = require("../services/notificationService");

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { runInTransaction } = require("../utils/runInTransaction");
const { emitToOrg } = require("../utils/socket");

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

/* ==========================================================================
   1. CREATE INVOICE (The Core Logic)
   ========================================================================== */
exports.createInvoice = catchAsync(async (req, res, next) => {
  // 1. Validation
  const validation = createInvoiceSchema.safeParse(req.body);
  if (!validation.success) return next(new AppError(validation.error.errors[0].message, 400));
  const body = validation.data;

  // Auto-Invoice Number
  if (!body.invoiceNumber) {
     const lastInvoice = await Invoice.findOne({ organizationId: req.user.organizationId }).sort({ createdAt: -1 });
     const lastNum = lastInvoice && lastInvoice.invoiceNumber ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0 : 0;
     body.invoiceNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`;
  }

  let newInvoice, salesDoc, newPayment;

  await runInTransaction(async (session) => {
    // ---------------------------------------------------------
    // A. INVENTORY & ITEMS (Deduct Stock)
    // ---------------------------------------------------------
    const enrichedItems = [];
    for (const item of body.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

      const branchInv = product.inventory.find(inv => String(inv.branchId) === String(req.user.branchId));
      if (!branchInv || branchInv.quantity < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}. Available: ${branchInv ? branchInv.quantity : 0}`, 400);
      }

      branchInv.quantity -= item.quantity;
      await product.save({ session });
      enrichedItems.push({ ...item, name: product.name, sku: product.sku });
    }

    // ---------------------------------------------------------
    // B. SAVE INVOICE
    // ---------------------------------------------------------
    const invoiceArr = await Invoice.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      ...body,
      items: enrichedItems, 
    }], { session });
    newInvoice = invoiceArr[0];

    // ---------------------------------------------------------
    // C. ACCOUNTING (Audit-Proof Logic)
    // ---------------------------------------------------------
    const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
    const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
    
    // 1. DEBIT AR (Total Customer Owes)
    await AccountEntry.create([{
      organizationId: req.user.organizationId, branchId: req.user.branchId,
      accountId: arAccount._id, customerId: body.customerId,
      date: newInvoice.invoiceDate, debit: newInvoice.grandTotal, credit: 0,
      description: `Invoice #${newInvoice.invoiceNumber}`,
      referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
      createdBy: req.user._id
    }], { session });

    // 2. CREDIT REVENUE (Strict Math: GrandTotal - Tax = Revenue)
    // ✅ FIX: Ensures ledger balances perfectly even with complex discounts
    const netRevenue = newInvoice.grandTotal - (newInvoice.totalTax || 0);
    
    await AccountEntry.create([{
      organizationId: req.user.organizationId, branchId: req.user.branchId,
      accountId: salesAccount._id,
      date: newInvoice.invoiceDate, debit: 0, credit: netRevenue,
      description: `Revenue #${newInvoice.invoiceNumber}`,
      referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
      createdBy: req.user._id
    }], { session });

    // 3. CREDIT TAX (Liability)
    if (newInvoice.totalTax > 0) {
        const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
        await AccountEntry.create([{
            organizationId: req.user.organizationId, branchId: req.user.branchId,
            accountId: taxAccount._id,
            date: newInvoice.invoiceDate, debit: 0, credit: newInvoice.totalTax,
            description: `Tax Collected #${newInvoice.invoiceNumber}`,
            referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
            createdBy: req.user._id
        }], { session });
    }

    // 4. Update Customer Balance
    await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: newInvoice.grandTotal } }, { session });

    // ---------------------------------------------------------
    // D. AUTO-PAYMENT (Immediate Payment)
    // ---------------------------------------------------------
    if (body.paidAmount > 0) {
        // Create Payment Record (Use Payment Controller Logic effectively)
        const paymentArr = await Payment.create([{
            organizationId: req.user.organizationId, branchId: req.user.branchId,
            type: 'inflow', customerId: body.customerId, invoiceId: newInvoice._id,
            amount: body.paidAmount, paymentMethod: body.paymentMethod,
            paymentDate: newInvoice.invoiceDate, referenceNumber: `INV-PAY-${newInvoice.invoiceNumber}`,
            status: 'completed', remarks: 'Paid at creation', createdBy: req.user._id
        }], { session });
        newPayment = paymentArr[0];

        // Reduce Customer Debt
        await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: -body.paidAmount } }, { session });

        // Ledger: Dr Cash / Cr AR
        const isCash = body.paymentMethod === 'cash';
        const bankAccount = await getOrInitAccount(req.user.organizationId, 'asset', isCash ? 'Cash' : 'Bank', isCash ? '1001' : '1002', session);

        // Debit Cash
        await AccountEntry.create([{
            organizationId: req.user.organizationId, branchId: req.user.branchId,
            accountId: bankAccount._id, paymentId: newPayment._id,
            date: newInvoice.invoiceDate, debit: body.paidAmount, credit: 0,
            description: `Pmt Recv: #${newInvoice.invoiceNumber}`, referenceType: 'payment', referenceId: newPayment._id, createdBy: req.user._id
        }], { session });

        // Credit AR
        await AccountEntry.create([{
            organizationId: req.user.organizationId, branchId: req.user.branchId,
            accountId: arAccount._id, customerId: body.customerId, paymentId: newPayment._id,
            date: newInvoice.invoiceDate, debit: 0, credit: body.paidAmount,
            description: `Pmt Recv: #${newInvoice.invoiceNumber}`, referenceType: 'payment', referenceId: newPayment._id, createdBy: req.user._id
        }], { session });
    }

    // ---------------------------------------------------------
    // E. AUDIT & SALES DOC
    // ---------------------------------------------------------
    salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);
    await InvoiceAudit.create([{
      invoiceId: newInvoice._id, action: 'CREATE', performedBy: req.user._id,
      details: `Invoice created. Total: ${newInvoice.grandTotal}`, ipAddress: req.ip
    }], { session });

  }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

  try { emitToOrg(req.user.organizationId, "newNotification", { title: "New Sale", message: `#${newInvoice.invoiceNumber}`, type: "success" }); } catch (e) {}

  res.status(201).json({ status: "success", data: { invoice: newInvoice, sales: salesDoc, payment: newPayment } });
});

/* ==========================================================================
   2. UPDATE INVOICE
   ========================================================================== */
exports.updateInvoice = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  let updatedInvoice;

  await runInTransaction(async (session) => {
    const oldInvoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
    if (!oldInvoice) throw new AppError('Invoice not found', 404);
    if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice', 400);

    // If Draft: Simple Update
    if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
       updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
       return;
    }

    // If Issued: REVERSE EVERYTHING Logic
    const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;
    if (needsFinancialUpdate) {
        // A. Reverse Inventory (Put items back on shelf)
        for (const item of oldInvoice.items) {
            await Product.findOneAndUpdate(
                { _id: item.productId, "inventory.branchId": oldInvoice.branchId },
                { $inc: { "inventory.$.quantity": item.quantity } }, 
                { session }
            );
        }
        // B. Reverse Financials (Wipe old entries)
        await AccountEntry.deleteMany({ referenceId: oldInvoice._id, referenceType: 'invoice' }, { session });
        await Customer.findByIdAndUpdate(oldInvoice.customerId, { $inc: { outstandingBalance: -oldInvoice.grandTotal } }, { session });

        // C. Apply New Inventory (Take items from shelf)
        const enrichedItems = [];
        const newItems = updates.items || oldInvoice.items;
        for (const item of newItems) {
            const product = await Product.findById(item.productId).session(session);
            const branchInv = product.inventory.find(inv => String(inv.branchId) === String(oldInvoice.branchId));
            if (!branchInv || branchInv.quantity < item.quantity) throw new AppError(`Insufficient stock: ${product.name}`, 400);
            
            branchInv.quantity -= item.quantity;
            await product.save({ session });
            enrichedItems.push({ ...item, name: product.name, sku: product.sku });
        }
        updates.items = enrichedItems;

        // D. Save & Re-Book
        Object.assign(oldInvoice, updates);
        updatedInvoice = await oldInvoice.save({ session }); // Recalculates Totals

        // Re-book AR
        const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
        await AccountEntry.create([{
            organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: updatedInvoice.customerId,
            date: updatedInvoice.invoiceDate, debit: updatedInvoice.grandTotal, credit: 0,
            description: `Invoice #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
        }], { session });

        // Re-book Sales
        const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
        const netRevenue = updatedInvoice.grandTotal - (updatedInvoice.totalTax || 0); // Strict Formula
        
        await AccountEntry.create([{
            organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
            date: updatedInvoice.invoiceDate, debit: 0, credit: netRevenue,
            description: `Rev: #${updatedInvoice.invoiceNumber}`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
        }], { session });

        // Re-book Tax
        if (updatedInvoice.totalTax > 0) {
            const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
            await AccountEntry.create([{
                organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: taxAccount._id,
                date: updatedInvoice.invoiceDate, debit: 0, credit: updatedInvoice.totalTax,
                description: `GST: #${updatedInvoice.invoiceNumber}`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
            }], { session });
        }

        await Customer.findByIdAndUpdate(updatedInvoice.customerId, { $inc: { outstandingBalance: updatedInvoice.grandTotal } }, { session });

        await InvoiceAudit.create([{
            invoiceId: updatedInvoice._id, action: 'UPDATE_FINANCIAL', performedBy: req.user._id,
            details: `Invoice updated. New Total: ${updatedInvoice.grandTotal}`, ipAddress: req.ip
        }], { session });
    } else {
        updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
    }
  }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

  res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
});

/* ==========================================================================
   3. CANCEL / RETURN INVOICE
   ========================================================================== */
exports.cancelInvoice = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason, restock = true } = req.body;

  await runInTransaction(async (session) => {
    const invoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).populate('items.productId').session(session);
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

    // 1. Restock (Optional)
    if (restock) {
        for (const item of invoice.items) {
          if (item.productId) {
            await Product.findOneAndUpdate(
              { _id: item.productId, "inventory.branchId": invoice.branchId },
              { $inc: { "inventory.$.quantity": item.quantity } },
              { session }
            );
          }
        }
    }

    // 2. Reverse Customer Balance
    await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -invoice.grandTotal } }, { session });

    // 3. Create Credit Note (Reverses Ledger)
    const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
    const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
    
    // Dr Sales (Reduce Income)
    const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);
    await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
        date: new Date(), debit: netRevenue, credit: 0, 
        description: `Cancel: #${invoice.invoiceNumber}`,
        referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
    }], { session });

    // Dr Tax (Reduce Liability)
    if (invoice.totalTax > 0) {
        const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
        await AccountEntry.create([{
            organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: taxAccount._id,
            date: new Date(), debit: invoice.totalTax, credit: 0,
            description: `Cancel Tax: #${invoice.invoiceNumber}`,
            referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
        }], { session });
    }

    // Cr AR (Reduce Debt)
    await AccountEntry.create([{
        organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: invoice.customerId,
        date: new Date(), debit: 0, credit: invoice.grandTotal, 
        description: `Cancel: #${invoice.invoiceNumber}`,
        referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
    }], { session });

    invoice.status = 'cancelled';
    invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason}`;
    await invoice.save({ session });

    await InvoiceAudit.create([{
        invoiceId: invoice._id, action: 'CANCEL', performedBy: req.user._id,
        details: `Cancelled. Restock: ${restock}. Reason: ${reason}`, ipAddress: req.ip
    }], { session });

  }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

  res.status(200).json({ status: "success", message: "Invoice cancelled & reversed." });
});

// --- UTILS ---
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

// ✅ ADDED THIS MISSING FUNCTION
exports.profitSummary = catchAsync(async (req, res, next) => {
  res.status(200).json({ status: "success", data: {} }); // Placeholder for now
});

// ✅ ADDED THIS MISSING FUNCTION
exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
  const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId });
  res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
});

// ✅ ADDED THIS MISSING FUNCTION
exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
  const invoiceId = req.params.id;
  const history = await InvoiceAudit.find({ invoiceId }).sort({ createdAt: -1 });
  res.status(200).json({ status: "success", results: history.length, data: { history } });
});

exports.getAllInvoices = factory.getAll(Invoice);
exports.getInvoice = factory.getOne(Invoice, [{ path: "customerId" }, { path: "items.productId" }]);
exports.deleteInvoice = factory.deleteOne(Invoice); 


















// misson profit summary code 
// // const mongoose = require("mongoose");
// // const { z } = require("zod");
// // const { format } = require('fast-csv');

// // const Invoice = require("../models/invoiceModel");
// // const Payment = require("../models/paymentModel");
// // const Product = require("../models/productModel");
// // const Customer = require("../models/customerModel");
// // const AccountEntry = require('../models/accountEntryModel');
// // const Account = require('../models/accountModel'); 
// // const Organization = require("../models/organizationModel");
// // const InvoiceAudit = require('../models/invoiceAuditModel');

// // const SalesService = require("../services/salesService");
// // const invoicePDFService = require("../services/invoicePDFService");
// // const { createNotification } = require("../services/notificationService");

// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const factory = require("../utils/handlerFactory");
// // const { runInTransaction } = require("../utils/runInTransaction");
// // const { emitToOrg } = require("../utils/socket");

// // // --- HELPER: Ensure System Accounts Exist (Idempotent) ---
// // async function getOrInitAccount(orgId, type, name, code, session) {
// //   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
// //   if (!account) {
// //     account = await Account.create([{
// //       organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0
// //     }], { session });
// //     return account[0];
// //   }
// //   return account;
// // }

// // // 🛡️ Validation Schema
// // const createInvoiceSchema = z.object({
// //   customerId: z.string().min(1, "Customer ID is required"),
// //   items: z.array(z.object({
// //     productId: z.string().min(1, "Product ID is required"),
// //     quantity: z.number().positive("Quantity must be positive"),
// //     price: z.number().nonnegative("Price cannot be negative"),
// //     tax: z.number().optional().default(0),
// //     discount: z.number().optional().default(0)
// //   })).min(1, "Invoice must have at least one item"),
  
// //   invoiceNumber: z.string().optional(),
// //   invoiceDate: z.string().optional(),
// //   dueDate: z.string().optional(),
  
// //   paidAmount: z.number().nonnegative().optional().default(0),
// //   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
  
// //   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
// //   shippingCharges: z.number().nonnegative().optional().default(0),
// //   notes: z.string().optional(),
// //   roundOff: z.number().optional(),
// //   gstType: z.string().optional()
// // });

// // /* ==========================================================================
// //    1. CREATE INVOICE (The Core Logic)
// //    ========================================================================== */
// // exports.createInvoice = catchAsync(async (req, res, next) => {
// //   // 1. Validation
// //   const validation = createInvoiceSchema.safeParse(req.body);
// //   if (!validation.success) return next(new AppError(validation.error.errors[0].message, 400));
// //   const body = validation.data;

// //   // Auto-Invoice Number
// //   if (!body.invoiceNumber) {
// //      const lastInvoice = await Invoice.findOne({ organizationId: req.user.organizationId }).sort({ createdAt: -1 });
// //      const lastNum = lastInvoice && lastInvoice.invoiceNumber ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0 : 0;
// //      body.invoiceNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`;
// //   }

// //   let newInvoice, salesDoc, newPayment;

// //   await runInTransaction(async (session) => {
// //     // ---------------------------------------------------------
// //     // A. INVENTORY & ITEMS (Deduct Stock)
// //     // ---------------------------------------------------------
// //     const enrichedItems = [];
// //     for (const item of body.items) {
// //       const product = await Product.findById(item.productId).session(session);
// //       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

// //       const branchInv = product.inventory.find(inv => String(inv.branchId) === String(req.user.branchId));
// //       if (!branchInv || branchInv.quantity < item.quantity) {
// //         throw new AppError(`Insufficient stock for ${product.name}. Available: ${branchInv ? branchInv.quantity : 0}`, 400);
// //       }

// //       branchInv.quantity -= item.quantity;
// //       await product.save({ session });
// //       enrichedItems.push({ ...item, name: product.name, sku: product.sku });
// //     }

// //     // ---------------------------------------------------------
// //     // B. SAVE INVOICE
// //     // ---------------------------------------------------------
// //     const invoiceArr = await Invoice.create([{
// //       organizationId: req.user.organizationId,
// //       branchId: req.user.branchId,
// //       createdBy: req.user._id,
// //       ...body,
// //       items: enrichedItems, 
// //     }], { session });
// //     newInvoice = invoiceArr[0];

// //     // ---------------------------------------------------------
// //     // C. ACCOUNTING (Audit-Proof Logic)
// //     // ---------------------------------------------------------
// //     const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// //     const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
    
// //     // 1. DEBIT AR (Total Customer Owes)
// //     await AccountEntry.create([{
// //       organizationId: req.user.organizationId, branchId: req.user.branchId,
// //       accountId: arAccount._id, customerId: body.customerId,
// //       date: newInvoice.invoiceDate, debit: newInvoice.grandTotal, credit: 0,
// //       description: `Invoice #${newInvoice.invoiceNumber}`,
// //       referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// //       createdBy: req.user._id
// //     }], { session });

// //     // 2. CREDIT REVENUE (Strict Math: GrandTotal - Tax = Revenue)
// //     // ✅ FIX: Ensures ledger balances perfectly even with complex discounts
// //     const netRevenue = newInvoice.grandTotal - (newInvoice.totalTax || 0);
    
// //     await AccountEntry.create([{
// //       organizationId: req.user.organizationId, branchId: req.user.branchId,
// //       accountId: salesAccount._id,
// //       date: newInvoice.invoiceDate, debit: 0, credit: netRevenue,
// //       description: `Revenue #${newInvoice.invoiceNumber}`,
// //       referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// //       createdBy: req.user._id
// //     }], { session });

// //     // 3. CREDIT TAX (Liability)
// //     if (newInvoice.totalTax > 0) {
// //         const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
// //         await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// //             accountId: taxAccount._id,
// //             date: newInvoice.invoiceDate, debit: 0, credit: newInvoice.totalTax,
// //             description: `Tax Collected #${newInvoice.invoiceNumber}`,
// //             referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// //             createdBy: req.user._id
// //         }], { session });
// //     }

// //     // 4. Update Customer Balance
// //     await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: newInvoice.grandTotal } }, { session });

// //     // ---------------------------------------------------------
// //     // D. AUTO-PAYMENT (Immediate Payment)
// //     // ---------------------------------------------------------
// //     if (body.paidAmount > 0) {
// //         // Create Payment Record (Use Payment Controller Logic effectively)
// //         const paymentArr = await Payment.create([{
// //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// //             type: 'inflow', customerId: body.customerId, invoiceId: newInvoice._id,
// //             amount: body.paidAmount, paymentMethod: body.paymentMethod,
// //             paymentDate: newInvoice.invoiceDate, referenceNumber: `INV-PAY-${newInvoice.invoiceNumber}`,
// //             status: 'completed', remarks: 'Paid at creation', createdBy: req.user._id
// //         }], { session });
// //         newPayment = paymentArr[0];

// //         // Reduce Customer Debt
// //         await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: -body.paidAmount } }, { session });

// //         // Ledger: Dr Cash / Cr AR
// //         const isCash = body.paymentMethod === 'cash';
// //         const bankAccount = await getOrInitAccount(req.user.organizationId, 'asset', isCash ? 'Cash' : 'Bank', isCash ? '1001' : '1002', session);

// //         // Debit Cash
// //         await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// //             accountId: bankAccount._id, paymentId: newPayment._id,
// //             date: newInvoice.invoiceDate, debit: body.paidAmount, credit: 0,
// //             description: `Pmt Recv: #${newInvoice.invoiceNumber}`, referenceType: 'payment', referenceId: newPayment._id, createdBy: req.user._id
// //         }], { session });

// //         // Credit AR
// //         await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// //             accountId: arAccount._id, customerId: body.customerId, paymentId: newPayment._id,
// //             date: newInvoice.invoiceDate, debit: 0, credit: body.paidAmount,
// //             description: `Pmt Recv: #${newInvoice.invoiceNumber}`, referenceType: 'payment', referenceId: newPayment._id, createdBy: req.user._id
// //         }], { session });
// //     }

// //     // ---------------------------------------------------------
// //     // E. AUDIT & SALES DOC
// //     // ---------------------------------------------------------
// //     salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);
// //     await InvoiceAudit.create([{
// //       invoiceId: newInvoice._id, action: 'CREATE', performedBy: req.user._id,
// //       details: `Invoice created. Total: ${newInvoice.grandTotal}`, ipAddress: req.ip
// //     }], { session });

// //   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

// //   try { emitToOrg(req.user.organizationId, "newNotification", { title: "New Sale", message: `#${newInvoice.invoiceNumber}`, type: "success" }); } catch (e) {}

// //   res.status(201).json({ status: "success", data: { invoice: newInvoice, sales: salesDoc, payment: newPayment } });
// // });

// // /* ==========================================================================
// //    2. UPDATE INVOICE
// //    ========================================================================== */
// // exports.updateInvoice = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   const updates = req.body;
// //   let updatedInvoice;

// //   await runInTransaction(async (session) => {
// //     const oldInvoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
// //     if (!oldInvoice) throw new AppError('Invoice not found', 404);
// //     if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice', 400);

// //     // If Draft: Simple Update
// //     if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
// //        updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
// //        return;
// //     }

// //     // If Issued: REVERSE EVERYTHING Logic
// //     const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;
// //     if (needsFinancialUpdate) {
// //         // A. Reverse Inventory (Put items back on shelf)
// //         for (const item of oldInvoice.items) {
// //             await Product.findOneAndUpdate(
// //                 { _id: item.productId, "inventory.branchId": oldInvoice.branchId },
// //                 { $inc: { "inventory.$.quantity": item.quantity } }, 
// //                 { session }
// //             );
// //         }
// //         // B. Reverse Financials (Wipe old entries)
// //         await AccountEntry.deleteMany({ referenceId: oldInvoice._id, referenceType: 'invoice' }, { session });
// //         await Customer.findByIdAndUpdate(oldInvoice.customerId, { $inc: { outstandingBalance: -oldInvoice.grandTotal } }, { session });

// //         // C. Apply New Inventory (Take items from shelf)
// //         const enrichedItems = [];
// //         const newItems = updates.items || oldInvoice.items;
// //         for (const item of newItems) {
// //             const product = await Product.findById(item.productId).session(session);
// //             const branchInv = product.inventory.find(inv => String(inv.branchId) === String(oldInvoice.branchId));
// //             if (!branchInv || branchInv.quantity < item.quantity) throw new AppError(`Insufficient stock: ${product.name}`, 400);
            
// //             branchInv.quantity -= item.quantity;
// //             await product.save({ session });
// //             enrichedItems.push({ ...item, name: product.name, sku: product.sku });
// //         }
// //         updates.items = enrichedItems;

// //         // D. Save & Re-Book
// //         Object.assign(oldInvoice, updates);
// //         updatedInvoice = await oldInvoice.save({ session }); // Recalculates Totals

// //         // Re-book AR
// //         const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// //         await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: updatedInvoice.customerId,
// //             date: updatedInvoice.invoiceDate, debit: updatedInvoice.grandTotal, credit: 0,
// //             description: `Invoice #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// //         }], { session });

// //         // Re-book Sales
// //         const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
// //         const netRevenue = updatedInvoice.grandTotal - (updatedInvoice.totalTax || 0); // Strict Formula
        
// //         await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
// //             date: updatedInvoice.invoiceDate, debit: 0, credit: netRevenue,
// //             description: `Rev: #${updatedInvoice.invoiceNumber}`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// //         }], { session });

// //         // Re-book Tax
// //         if (updatedInvoice.totalTax > 0) {
// //             const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
// //             await AccountEntry.create([{
// //                 organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: taxAccount._id,
// //                 date: updatedInvoice.invoiceDate, debit: 0, credit: updatedInvoice.totalTax,
// //                 description: `GST: #${updatedInvoice.invoiceNumber}`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// //             }], { session });
// //         }

// //         await Customer.findByIdAndUpdate(updatedInvoice.customerId, { $inc: { outstandingBalance: updatedInvoice.grandTotal } }, { session });

// //         await InvoiceAudit.create([{
// //             invoiceId: updatedInvoice._id, action: 'UPDATE_FINANCIAL', performedBy: req.user._id,
// //             details: `Invoice updated. New Total: ${updatedInvoice.grandTotal}`, ipAddress: req.ip
// //         }], { session });
// //     } else {
// //         updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
// //     }
// //   }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

// //   res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
// // });

// // /* ==========================================================================
// //    3. CANCEL / RETURN INVOICE
// //    ========================================================================== */
// // exports.cancelInvoice = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   const { reason, restock = true } = req.body;

// //   await runInTransaction(async (session) => {
// //     const invoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).populate('items.productId').session(session);
// //     if (!invoice) throw new AppError('Invoice not found', 404);
// //     if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

// //     // 1. Restock (Optional)
// //     if (restock) {
// //         for (const item of invoice.items) {
// //           if (item.productId) {
// //             await Product.findOneAndUpdate(
// //               { _id: item.productId, "inventory.branchId": invoice.branchId },
// //               { $inc: { "inventory.$.quantity": item.quantity } },
// //               { session }
// //             );
// //           }
// //         }
// //     }

// //     // 2. Reverse Customer Balance
// //     await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -invoice.grandTotal } }, { session });

// //     // 3. Create Credit Note (Reverses Ledger)
// //     const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// //     const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
    
// //     // Dr Sales (Reduce Income)
// //     const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);
// //     await AccountEntry.create([{
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
// //         date: new Date(), debit: netRevenue, credit: 0, 
// //         description: `Cancel: #${invoice.invoiceNumber}`,
// //         referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
// //     }], { session });

// //     // Dr Tax (Reduce Liability)
// //     // ✅ FIX: Separately reverses the tax liability
// //     if (invoice.totalTax > 0) {
// //         const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'Tax Payable', '2100', session);
// //         await AccountEntry.create([{
// //             organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: taxAccount._id,
// //             date: new Date(), debit: invoice.totalTax, credit: 0,
// //             description: `Cancel Tax: #${invoice.invoiceNumber}`,
// //             referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
// //         }], { session });
// //     }

// //     // Cr AR (Reduce Debt)
// //     await AccountEntry.create([{
// //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: invoice.customerId,
// //         date: new Date(), debit: 0, credit: invoice.grandTotal, 
// //         description: `Cancel: #${invoice.invoiceNumber}`,
// //         referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
// //     }], { session });

// //     invoice.status = 'cancelled';
// //     invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason}`;
// //     await invoice.save({ session });

// //     await InvoiceAudit.create([{
// //         invoiceId: invoice._id, action: 'CANCEL', performedBy: req.user._id,
// //         details: `Cancelled. Restock: ${restock}. Reason: ${reason}`, ipAddress: req.ip
// //     }], { session });

// //   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

// //   res.status(200).json({ status: "success", message: "Invoice cancelled & reversed." });
// // });

// // // --- UTILS ---
// // exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
// //   const { ids, status } = req.body;
// //   if (!ids) return next(new AppError("Ids required", 400));
// //   await Invoice.updateMany({ _id: { $in: ids }, organizationId: req.user.organizationId }, { $set: { status } });
// //   res.status(200).json({ status: "success", message: "Updated" });
// // });

// // exports.validateNumber = catchAsync(async (req, res, next) => {
// //   const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
// //   res.status(200).json({ status: "success", valid: !exists });
// // });

// // exports.exportInvoices = catchAsync(async (req, res, next) => {
// //   const docs = await Invoice.find({ organizationId: req.user.organizationId }).populate('customerId').lean();
// //   res.status(200).json({ status: "success", data: docs });
// // });

// // exports.getAllInvoices = factory.getAll(Invoice);
// // exports.getInvoice = factory.getOne(Invoice, [{ path: "customerId" }, { path: "items.productId" }]);
// // exports.deleteInvoice = factory.deleteOne(Invoice);
// // exports.downloadInvoice = catchAsync(async(req,res)=> {
// //     const buffer = await invoicePDFService.generateInvoicePDF(req.params.id, req.user.organizationId);
// //     res.type('pdf').send(buffer);
// // });

// // ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// // // const mongoose = require("mongoose");
// // // const { z } = require("zod");
// // // const { format } = require('fast-csv');

// // // const Invoice = require("../models/invoiceModel");
// // // const Payment = require("../models/paymentModel");
// // // const Product = require("../models/productModel");
// // // const Customer = require("../models/customerModel");
// // // const AccountEntry = require('../models/accountEntryModel');
// // // const Account = require('../models/accountModel'); 
// // // const Organization = require("../models/organizationModel");
// // // const InvoiceAudit = require('../models/invoiceAuditModel');

// // // const SalesService = require("../services/salesService");
// // // const invoicePDFService = require("../services/invoicePDFService");
// // // const { createNotification } = require("../services/notificationService");

// // // const catchAsync = require("../utils/catchAsync");
// // // const AppError = require("../utils/appError");
// // // const factory = require("../utils/handlerFactory");
// // // const { runInTransaction } = require("../utils/runInTransaction");
// // // const { emitToOrg } = require("../utils/socket");

// // // // --- HELPER: Ensure System Accounts Exist (Idempotent) ---
// // // // This ensures we always have a place to book the money.
// // // async function getOrInitAccount(orgId, type, name, code, session) {
// // //   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
// // //   if (!account) {
// // //     account = await Account.create([{
// // //       organizationId: orgId, name, code, type, isGroup: false, balance: 0
// // //     }], { session });
// // //     return account[0];
// // //   }
// // //   return account;
// // // }

// // // // 🛡️ Validation Schema
// // // const createInvoiceSchema = z.object({
// // //   customerId: z.string().min(1, "Customer ID is required"),
// // //   items: z.array(z.object({
// // //     productId: z.string().min(1, "Product ID is required"),
// // //     quantity: z.number().positive("Quantity must be positive"),
// // //     price: z.number().nonnegative("Price cannot be negative"),
// // //     tax: z.number().optional().default(0),
// // //     discount: z.number().optional().default(0)
// // //   })).min(1, "Invoice must have at least one item"),
  
// // //   invoiceNumber: z.string().optional(),
// // //   invoiceDate: z.string().optional(),
// // //   dueDate: z.string().optional(),
  
// // //   // Payment Details
// // //   paidAmount: z.number().nonnegative().optional().default(0),
// // //   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
  
// // //   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
// // //   paymentStatus: z.enum(['paid', 'unpaid', 'partial']).optional().default('unpaid'),
// // //   shippingCharges: z.number().nonnegative().optional().default(0),
// // //   notes: z.string().optional(),
// // //   roundOff: z.number().optional(),
// // //   gstType: z.string().optional()
// // // });

// // // /* ==========================================================================
// // //    1. CREATE INVOICE (The Core Logic)
// // //    ========================================================================== */
// // // exports.createInvoice = catchAsync(async (req, res, next) => {
// // //   // 1. Validation
// // //   const validation = createInvoiceSchema.safeParse(req.body);
// // //   if (!validation.success) return next(new AppError(validation.error.errors[0].message, 400));
// // //   const body = validation.data;

// // //   // 🛑 PROTECTION 1: Credit Limit Check
// // //   if (body.customerId) {
// // //     const customer = await Customer.findById(body.customerId);
// // //     if (customer && customer.creditLimit > 0) {
// // //         // Calculate new balance: Current Debt + (New Invoice Total - Paid Now)
// // //         // Note: grandTotal isn't calculated yet, so we estimate using price*qty roughly or wait until save.
// // //         // For strict safety, we usually need the grandTotal. Let's rely on the transaction to fail if needed, 
// // //         // OR calculate a rough total here. A better way is to check AFTER invoice creation but BEFORE commit.
// // //         // For now, we will proceed and assume the user checks the dashboard. 
// // //         // (To be strictly safe, we would calculate total here manually).
// // //     }
// // //   }

// // //   // 🛑 PROTECTION 2: Auto-Invoice Number
// // //   if (!body.invoiceNumber) {
// // //      const lastInvoice = await Invoice.findOne({ organizationId: req.user.organizationId }).sort({ createdAt: -1 });
// // //      const lastNum = lastInvoice && lastInvoice.invoiceNumber ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0 : 0;
// // //      body.invoiceNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`;
// // //   }

// // //   let newInvoice, salesDoc, newPayment;

// // //   await runInTransaction(async (session) => {
// // //     // ---------------------------------------------------------
// // //     // A. INVENTORY & ITEMS (Deduct Stock)
// // //     // ---------------------------------------------------------
// // //     const enrichedItems = [];
// // //     for (const item of body.items) {
// // //       const product = await Product.findById(item.productId).session(session);
// // //       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

// // //       const branchInv = product.inventory.find(inv => String(inv.branchId) === String(req.user.branchId));
// // //       if (!branchInv || branchInv.quantity < item.quantity) {
// // //         throw new AppError(`Insufficient stock for ${product.name}`, 400);
// // //       }

// // //       branchInv.quantity -= item.quantity;
// // //       await product.save({ session });
// // //       enrichedItems.push({ ...item, name: product.name, sku: product.sku });
// // //     }

// // //     // ---------------------------------------------------------
// // //     // B. SAVE INVOICE (Calculates Totals via Model Middleware)
// // //     // ---------------------------------------------------------
// // //     const invoiceArr = await Invoice.create([{
// // //       organizationId: req.user.organizationId,
// // //       branchId: req.user.branchId,
// // //       createdBy: req.user._id,
// // //       ...body,
// // //       items: enrichedItems, 
// // //     }], { session });
// // //     newInvoice = invoiceArr[0];

// // //     // 🛑 CREDIT LIMIT CHECK (POST-CALCULATION)
// // //     const customer = await Customer.findById(body.customerId).session(session);
// // //     if (customer && customer.creditLimit > 0) {
// // //         const netDebtIncrease = newInvoice.grandTotal - body.paidAmount;
// // //         if ((customer.outstandingBalance + netDebtIncrease) > customer.creditLimit) {
// // //             throw new AppError(`Credit Limit Exceeded! Balance: ${customer.outstandingBalance}, New Bill adds: ${netDebtIncrease}`, 403);
// // //         }
// // //     }

// // //     // ---------------------------------------------------------
// // //     // C. ACCOUNTING (The "Split" Logic)
// // //     // ---------------------------------------------------------
// // //     const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// // //     const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
    
// // //     // 1. DEBIT AR (Total Amount Customer Owes)
// // //     await AccountEntry.create([{
// // //       organizationId: req.user.organizationId, branchId: req.user.branchId,
// // //       accountId: arAccount._id, customerId: body.customerId,
// // //       date: newInvoice.invoiceDate, debit: newInvoice.grandTotal, credit: 0,
// // //       description: `Invoice #${newInvoice.invoiceNumber}`,
// // //       referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// // //       createdBy: req.user._id
// // //     }], { session });

// // //     // 2. CREDIT SALES (Only the Revenue Part)
// // //     const netRevenue = newInvoice.subTotal - newInvoice.totalDiscount;
// // //     await AccountEntry.create([{
// // //       organizationId: req.user.organizationId, branchId: req.user.branchId,
// // //       accountId: salesAccount._id,
// // //       date: newInvoice.invoiceDate, debit: 0, credit: netRevenue,
// // //       description: `Sales Revenue #${newInvoice.invoiceNumber}`,
// // //       referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// // //       createdBy: req.user._id
// // //     }], { session });

// // //     // 3. CREDIT TAX (Liability Part) - Only if tax exists
// // //     if (newInvoice.totalTax > 0) {
// // //         const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'GST Output Tax', '2500', session);
// // //         await AccountEntry.create([{
// // //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// // //             accountId: taxAccount._id,
// // //             date: newInvoice.invoiceDate, debit: 0, credit: newInvoice.totalTax,
// // //             description: `GST Collected #${newInvoice.invoiceNumber}`,
// // //             referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// // //             createdBy: req.user._id
// // //         }], { session });
// // //     }

// // //     // 4. Update Customer Balance
// // //     await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: newInvoice.grandTotal } }, { session });

// // //     // ---------------------------------------------------------
// // //     // D. AUTO-PAYMENT (If user paid immediately)
// // //     // ---------------------------------------------------------
// // //     if (body.paidAmount > 0) {
// // //         // 1. Create Payment
// // //         const paymentArr = await Payment.create([{
// // //             organizationId: req.user.organizationId,
// // //             branchId: req.user.branchId,
// // //             type: 'inflow',
// // //             customerId: body.customerId,
// // //             invoiceId: newInvoice._id,
// // //             amount: body.paidAmount,
// // //             paymentMethod: body.paymentMethod,
// // //             paymentDate: newInvoice.invoiceDate,
// // //             referenceNumber: `INV-${newInvoice.invoiceNumber}`,
// // //             status: 'completed',
// // //             remarks: 'Paid at creation',
// // //             createdBy: req.user._id
// // //         }], { session });
// // //         newPayment = paymentArr[0];

// // //         // 2. Reduce Customer Debt
// // //         await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: -body.paidAmount } }, { session });

// // //         // 3. Ledger: Dr Cash / Cr AR
// // //         const isCash = body.paymentMethod === 'cash';
// // //         const bankAccount = await getOrInitAccount(req.user.organizationId, 'asset', isCash ? 'Cash in Hand' : 'Bank Account', isCash ? '1001' : '1002', session);

// // //         // Debit Cash
// // //         await AccountEntry.create([{
// // //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// // //             accountId: bankAccount._id, paymentId: newPayment._id,
// // //             date: newInvoice.invoiceDate, debit: body.paidAmount, credit: 0,
// // //             description: `Payment: ${newInvoice.invoiceNumber}`,
// // //             referenceType: 'payment', referenceNumber: newInvoice.invoiceNumber, referenceId: newPayment._id,
// // //             createdBy: req.user._id
// // //         }], { session });

// // //         // Credit AR
// // //         await AccountEntry.create([{
// // //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// // //             accountId: arAccount._id, customerId: body.customerId, paymentId: newPayment._id,
// // //             date: newInvoice.invoiceDate, debit: 0, credit: body.paidAmount,
// // //             description: `Payment: ${newInvoice.invoiceNumber}`,
// // //             referenceType: 'payment', referenceNumber: newInvoice.invoiceNumber, referenceId: newPayment._id,
// // //             createdBy: req.user._id
// // //         }], { session });
// // //     }

// // //     // ---------------------------------------------------------
// // //     // E. AUDIT & SALES DOC
// // //     // ---------------------------------------------------------
// // //     salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);
// // //     await InvoiceAudit.create([{
// // //       invoiceId: newInvoice._id, action: 'CREATE', performedBy: req.user._id,
// // //       details: `Invoice created. Total: ${newInvoice.grandTotal}`, ipAddress: req.ip
// // //     }], { session });

// // //   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

// // //   // Notifications
// // //   try { emitToOrg(req.user.organizationId, "newNotification", { title: "New Sale", message: `#${newInvoice.invoiceNumber}`, type: "success" }); } catch (e) {}

// // //   res.status(201).json({ status: "success", data: { invoice: newInvoice, sales: salesDoc, payment: newPayment } });
// // // });

// // // /* ==========================================================================
// // //    2. UPDATE INVOICE (Smart Reversal Logic)
// // //    ========================================================================== */
// // // exports.updateInvoice = catchAsync(async (req, res, next) => {
// // //   const { id } = req.params;
// // //   const updates = req.body;
// // //   let updatedInvoice;

// // //   await runInTransaction(async (session) => {
// // //     const oldInvoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
// // //     if (!oldInvoice) throw new AppError('Invoice not found', 404);
// // //     if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice', 400);

// // //     // If Draft: Simple Update
// // //     if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
// // //        updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
// // //        return;
// // //     }

// // //     // If Issued: REVERSE EVERYTHING
// // //     const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;
// // //     if (needsFinancialUpdate) {
// // //         // A. Reverse Inventory
// // //         for (const item of oldInvoice.items) {
// // //             await Product.findOneAndUpdate(
// // //                 { _id: item.productId, "inventory.branchId": oldInvoice.branchId },
// // //                 { $inc: { "inventory.$.quantity": item.quantity } }, 
// // //                 { session }
// // //             );
// // //         }
// // //         // B. Reverse Financials (Delete old entries for cleanliness on re-book)
// // //         await AccountEntry.deleteMany({ referenceId: oldInvoice._id, referenceType: 'invoice' }, { session });
// // //         await Customer.findByIdAndUpdate(oldInvoice.customerId, { $inc: { outstandingBalance: -oldInvoice.grandTotal } }, { session });

// // //         // C. Apply New Inventory
// // //         const enrichedItems = [];
// // //         const newItems = updates.items || oldInvoice.items;
// // //         for (const item of newItems) {
// // //             const product = await Product.findById(item.productId).session(session);
// // //             const branchInv = product.inventory.find(inv => String(inv.branchId) === String(oldInvoice.branchId));
// // //             if (!branchInv || branchInv.quantity < item.quantity) throw new AppError(`Insufficient stock: ${product.name}`, 400);
            
// // //             branchInv.quantity -= item.quantity;
// // //             await product.save({ session });
// // //             enrichedItems.push({ ...item, name: product.name, sku: product.sku });
// // //         }
// // //         updates.items = enrichedItems;

// // //         // D. Save & Re-Book
// // //         Object.assign(oldInvoice, updates);
// // //         updatedInvoice = await oldInvoice.save({ session }); // Recalculates Totals

// // //         // Re-book AR
// // //         const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// // //         await AccountEntry.create([{
// // //             organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: updatedInvoice.customerId,
// // //             date: updatedInvoice.invoiceDate, debit: updatedInvoice.grandTotal, credit: 0,
// // //             description: `Invoice #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// // //         }], { session });

// // //         // Re-book Sales
// // //         const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
// // //         const netRevenue = updatedInvoice.subTotal - updatedInvoice.totalDiscount;
// // //         await AccountEntry.create([{
// // //             organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
// // //             date: updatedInvoice.invoiceDate, debit: 0, credit: netRevenue,
// // //             description: `Rev: #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// // //         }], { session });

// // //         // Re-book Tax (if any)
// // //         if (updatedInvoice.totalTax > 0) {
// // //             const taxAccount = await getOrInitAccount(req.user.organizationId, 'liability', 'GST Output Tax', '2500', session);
// // //             await AccountEntry.create([{
// // //                 organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: taxAccount._id,
// // //                 date: updatedInvoice.invoiceDate, debit: 0, credit: updatedInvoice.totalTax,
// // //                 description: `GST: #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// // //             }], { session });
// // //         }

// // //         await Customer.findByIdAndUpdate(updatedInvoice.customerId, { $inc: { outstandingBalance: updatedInvoice.grandTotal } }, { session });

// // //         // Audit
// // //         await InvoiceAudit.create([{
// // //             invoiceId: updatedInvoice._id, action: 'UPDATE_FINANCIAL', performedBy: req.user._id,
// // //             details: `Invoice updated. New Total: ${updatedInvoice.grandTotal}`, ipAddress: req.ip
// // //         }], { session });
// // //     } else {
// // //         updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
// // //     }
// // //   }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

// // //   res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
// // // });

// // // /* ==========================================================================
// // //    3. CANCEL / RETURN INVOICE (Credit Note)
// // //    ========================================================================== */
// // // exports.cancelInvoice = catchAsync(async (req, res, next) => {
// // //   const { id } = req.params;
// // //   const { reason, restock = true } = req.body;

// // //   await runInTransaction(async (session) => {
// // //     const invoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).populate('items.productId').session(session);
// // //     if (!invoice) throw new AppError('Invoice not found', 404);
// // //     if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

// // //     // 1. Restock (Optional)
// // //     if (restock) {
// // //         for (const item of invoice.items) {
// // //           if (item.productId) {
// // //             await Product.findOneAndUpdate(
// // //               { _id: item.productId, "inventory.branchId": invoice.branchId },
// // //               { $inc: { "inventory.$.quantity": item.quantity } },
// // //               { session }
// // //             );
// // //           }
// // //         }
// // //     }

// // //     // 2. Reverse Customer Balance
// // //     await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -invoice.grandTotal } }, { session });

// // //     // 3. Create Credit Note (Reverses Ledger)
// // //     const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// // //     const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);
    
// // //     // Dr Sales (Reduce Income)
// // //     await AccountEntry.create([{
// // //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
// // //         date: new Date(), debit: invoice.grandTotal, credit: 0, 
// // //         description: `Return/Cancel: #${invoice.invoiceNumber}`,
// // //         referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
// // //     }], { session });

// // //     // Cr AR (Reduce Debt)
// // //     await AccountEntry.create([{
// // //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: invoice.customerId,
// // //         date: new Date(), debit: 0, credit: invoice.grandTotal, 
// // //         description: `Return/Cancel: #${invoice.invoiceNumber}`,
// // //         referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
// // //     }], { session });

// // //     invoice.status = 'cancelled';
// // //     invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason}`;
// // //     await invoice.save({ session });

// // //     await InvoiceAudit.create([{
// // //         invoiceId: invoice._id, action: 'CANCEL', performedBy: req.user._id,
// // //         details: `Cancelled. Restock: ${restock}. Reason: ${reason}`, ipAddress: req.ip
// // //     }], { session });

// // //   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

// // //   res.status(200).json({ status: "success", message: "Invoice cancelled & reversed." });
// // // });

// // // // --- STANDARD UTILS ---
// // // exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
// // //   const { ids, status } = req.body;
// // //   if (!ids) return next(new AppError("Ids required", 400));
// // //   await Invoice.updateMany({ _id: { $in: ids }, organizationId: req.user.organizationId }, { $set: { status } });
// // //   res.status(200).json({ status: "success", message: "Updated" });
// // // });

// // // exports.validateNumber = catchAsync(async (req, res, next) => {
// // //   const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
// // //   res.status(200).json({ status: "success", valid: !exists });
// // // });

// // // exports.exportInvoices = catchAsync(async (req, res, next) => {
// // //   const docs = await Invoice.find({ organizationId: req.user.organizationId }).populate('customerId').lean();
// // //   res.status(200).json({ status: "success", data: docs });
// // // });

// // // exports.profitSummary = catchAsync(async (req, res, next) => {
// // //   res.status(200).json({ status: "success", data: {} });
// // // });

// // // exports.getAllInvoices = factory.getAll(Invoice);
// // // exports.getInvoice = factory.getOne(Invoice, [{ path: "customerId" }, { path: "items.productId" }]);
// // // exports.deleteInvoice = factory.deleteOne(Invoice);
// // // exports.getInvoicesByCustomer = catchAsync(async(req,res)=>res.json({status:'success'}));
// // // exports.downloadInvoice = catchAsync(async(req,res)=> {
// // //     const buffer = await invoicePDFService.generateInvoicePDF(req.params.id, req.user.organizationId);
// // //     res.type('pdf').send(buffer);
// // // });
// // // exports.emailInvoice = catchAsync(async(req,res)=>res.json({status:'success'}));
// // // exports.getInvoiceHistory = catchAsync(async(req,res)=>res.json({status:'success'}));


// // // // const mongoose = require("mongoose");
// // // // const { z } = require("zod");
// // // // const { format } = require('fast-csv');

// // // // const Invoice = require("../models/invoiceModel");
// // // // const Payment = require("../models/paymentModel"); // ✅ REQUIRED
// // // // const Product = require("../models/productModel");
// // // // const Customer = require("../models/customerModel");
// // // // const AccountEntry = require('../models/accountEntryModel');
// // // // const Account = require('../models/accountModel'); 
// // // // const Organization = require("../models/organizationModel");
// // // // const InvoiceAudit = require('../models/invoiceAuditModel');

// // // // const SalesService = require("../services/salesService");
// // // // const invoicePDFService = require("../services/invoicePDFService");
// // // // const { createNotification } = require("../services/notificationService");

// // // // const catchAsync = require("../utils/catchAsync");
// // // // const AppError = require("../utils/appError");
// // // // const factory = require("../utils/handlerFactory");
// // // // const { runInTransaction } = require("../utils/runInTransaction");
// // // // const { emitToOrg } = require("../utils/socket");

// // // // // --- HELPER: Ensure System Accounts Exist (Idempotent) ---
// // // // async function getOrInitAccount(orgId, type, name, code, session) {
// // // //   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
// // // //   if (!account) {
// // // //     account = await Account.create([{
// // // //       organizationId: orgId, name, code, type, isGroup: false, balance: 0
// // // //     }], { session });
// // // //     return account[0];
// // // //   }
// // // //   return account;
// // // // }

// // // // // 🛡️ Validation Schema
// // // // const createInvoiceSchema = z.object({
// // // //   customerId: z.string().min(1, "Customer ID is required"),
// // // //   items: z.array(z.object({
// // // //     productId: z.string().min(1, "Product ID is required"),
// // // //     quantity: z.number().positive(),
// // // //     price: z.number().nonnegative(),
// // // //     tax: z.number().optional().default(0),
// // // //     discount: z.number().optional().default(0)
// // // //   })).min(1, "Invoice must have at least one item"),
// // // //   invoiceNumber: z.string().optional(),
// // // //   invoiceDate: z.string().optional(),
// // // //   dueDate: z.string().optional(),
  
// // // //   // Payment Fields
// // // //   paidAmount: z.number().nonnegative().optional().default(0),
// // // //   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
  
// // // //   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
// // // //   paymentStatus: z.enum(['paid', 'unpaid', 'partial']).optional().default('unpaid'),
// // // //   shippingCharges: z.number().nonnegative().optional().default(0),
// // // //   notes: z.string().optional(),
// // // //   roundOff: z.number().optional(),
// // // //   gstType: z.string().optional()
// // // // });

// // // // /* ==========================================================================
// // // //    1. CREATE INVOICE (With Auto-Payment Logic)
// // // //    ========================================================================== */
// // // // exports.createInvoice = catchAsync(async (req, res, next) => {
// // // //   const validation = createInvoiceSchema.safeParse(req.body);
// // // //   if (!validation.success) return next(new AppError(validation.error.errors[0].message, 400));
// // // //   const body = validation.data;

// // // //   let newInvoice, salesDoc, newPayment;

// // // //   await runInTransaction(async (session) => {
// // // //     // ---------------------------------------------------------
// // // //     // STEP A: INVENTORY & ITEMS
// // // //     // ---------------------------------------------------------
// // // //     const enrichedItems = [];
// // // //     for (const item of body.items) {
// // // //       const product = await Product.findById(item.productId).session(session);
// // // //       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

// // // //       const branchInv = product.inventory.find(inv => String(inv.branchId) === String(req.user.branchId));
// // // //       if (!branchInv || branchInv.quantity < item.quantity) {
// // // //         throw new AppError(`Insufficient stock for ${product.name}`, 400);
// // // //       }

// // // //       branchInv.quantity -= item.quantity;
// // // //       await product.save({ session });
// // // //       enrichedItems.push({ ...item, name: product.name, sku: product.sku });
// // // //     }

// // // //     // ---------------------------------------------------------
// // // //     // STEP B: CREATE INVOICE
// // // //     // ---------------------------------------------------------
// // // //     const invoiceArr = await Invoice.create([{
// // // //       organizationId: req.user.organizationId,
// // // //       branchId: req.user.branchId,
// // // //       createdBy: req.user._id,
// // // //       ...body,
// // // //       items: enrichedItems, 
// // // //     }], { session });
// // // //     newInvoice = invoiceArr[0];

// // // //     // ---------------------------------------------------------
// // // //     // STEP C: ACCOUNTING - REVENUE (Accrual Basis)
// // // //     // ---------------------------------------------------------
// // // //     // 1. Establish the Full Debt (Debit AR)
// // // //     // 2. Recognize Full Revenue (Credit Sales)
    
// // // //     const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// // // //     const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);

// // // //     // Update Customer: Add FULL Amount to Outstanding
// // // //     await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: newInvoice.grandTotal } }, { session });

// // // //     // Ledger: Dr AR / Cr Sales
// // // //     await AccountEntry.create([{
// // // //       organizationId: req.user.organizationId, branchId: req.user.branchId,
// // // //       accountId: arAccount._id, customerId: body.customerId,
// // // //       date: newInvoice.invoiceDate, debit: newInvoice.grandTotal, credit: 0,
// // // //       description: `Invoice #${newInvoice.invoiceNumber}`,
// // // //       referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// // // //       createdBy: req.user._id
// // // //     }], { session });

// // // //     await AccountEntry.create([{
// // // //       organizationId: req.user.organizationId, branchId: req.user.branchId,
// // // //       accountId: salesAccount._id,
// // // //       date: newInvoice.invoiceDate, debit: 0, credit: newInvoice.grandTotal,
// // // //       description: `Rev: #${newInvoice.invoiceNumber}`,
// // // //       referenceType: 'invoice', referenceNumber: newInvoice.invoiceNumber, referenceId: newInvoice._id,
// // // //       createdBy: req.user._id
// // // //     }], { session });

// // // //     // ---------------------------------------------------------
// // // //     // STEP D: HANDLE IMMEDIATE PAYMENT (The Fix)
// // // //     // ---------------------------------------------------------
// // // //     if (body.paidAmount > 0) {
// // // //         // 1. Create Payment Record
// // // //         const paymentArr = await Payment.create([{
// // // //             organizationId: req.user.organizationId,
// // // //             branchId: req.user.branchId,
// // // //             type: 'inflow',
// // // //             customerId: body.customerId,
// // // //             invoiceId: newInvoice._id,
// // // //             amount: body.paidAmount,
// // // //             paymentMethod: body.paymentMethod,
// // // //             paymentDate: newInvoice.invoiceDate,
// // // //             referenceNumber: `INV-${newInvoice.invoiceNumber}`,
// // // //             status: 'completed',
// // // //             createdBy: req.user._id,
// // // //             remarks: 'Paid during invoice creation'
// // // //         }], { session });
// // // //         newPayment = paymentArr[0];

// // // //         // 2. Reduce Customer Balance (Pay off the debt we just created)
// // // //         await Customer.findByIdAndUpdate(body.customerId, { $inc: { outstandingBalance: -body.paidAmount } }, { session });

// // // //         // 3. Accounting: Dr Cash / Cr AR
// // // //         const isCash = body.paymentMethod === 'cash';
// // // //         const bankAccount = await getOrInitAccount(
// // // //             req.user.organizationId, 'asset', 
// // // //             isCash ? 'Cash in Hand' : 'Bank Account', 
// // // //             isCash ? '1001' : '1002', session
// // // //         );

// // // //         // Debit Cash (Money In)
// // // //         await AccountEntry.create([{
// // // //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// // // //             accountId: bankAccount._id, 
// // // //             paymentId: newPayment._id,
// // // //             date: newInvoice.invoiceDate, debit: body.paidAmount, credit: 0,
// // // //             description: `Payment: ${newInvoice.invoiceNumber}`,
// // // //             referenceType: 'payment', referenceNumber: newInvoice.invoiceNumber, referenceId: newPayment._id,
// // // //             createdBy: req.user._id
// // // //         }], { session });

// // // //         // Credit Accounts Receivable (Debt Reduced)
// // // //         await AccountEntry.create([{
// // // //             organizationId: req.user.organizationId, branchId: req.user.branchId,
// // // //             accountId: arAccount._id, customerId: body.customerId,
// // // //             paymentId: newPayment._id,
// // // //             date: newInvoice.invoiceDate, debit: 0, credit: body.paidAmount,
// // // //             description: `Payment: ${newInvoice.invoiceNumber}`,
// // // //             referenceType: 'payment', referenceNumber: newInvoice.invoiceNumber, referenceId: newPayment._id,
// // // //             createdBy: req.user._id
// // // //         }], { session });
// // // //     }

// // // //     // ---------------------------------------------------------
// // // //     // STEP E: AUDIT & SALES DOC
// // // //     // ---------------------------------------------------------
// // // //     salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);
// // // //     await InvoiceAudit.create([{
// // // //       invoiceId: newInvoice._id, action: 'CREATE', performedBy: req.user._id,
// // // //       details: `Invoice created. Amount: ${newInvoice.grandTotal}. Paid: ${body.paidAmount}`,
// // // //       ipAddress: req.ip
// // // //     }], { session });

// // // //   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

// // // //   // Notifications
// // // //   try { emitToOrg(req.user.organizationId, "newNotification", { title: "New Sale", message: `#${newInvoice.invoiceNumber}`, type: "success" }); } catch (e) {}

// // // //   res.status(201).json({ 
// // // //     status: "success", 
// // // //     data: { 
// // // //         invoice: newInvoice, 
// // // //         sales: salesDoc,
// // // //         payment: newPayment || null 
// // // //     } 
// // // //   });
// // // // });

// // // // /* ==========================================================================
// // // //    2. UPDATE INVOICE (Smart Update with Reversal)
// // // //    ========================================================================== */
// // // // exports.updateInvoice = catchAsync(async (req, res, next) => {
// // // //   const { id } = req.params;
// // // //   const updates = req.body;
// // // //   let updatedInvoice;

// // // //   await runInTransaction(async (session) => {
// // // //     const oldInvoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
// // // //     if (!oldInvoice) throw new AppError('Invoice not found', 404);
// // // //     if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice.', 400);

// // // //     // IF DRAFT: Simple update
// // // //     if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
// // // //        updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
// // // //        return;
// // // //     }

// // // //     // IF ISSUED/PAID: Full Financial Reversal & Re-book
// // // //     const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;

// // // //     if (needsFinancialUpdate) {
// // // //         // A. REVERSE INVENTORY
// // // //         for (const item of oldInvoice.items) {
// // // //             await Product.findOneAndUpdate(
// // // //                 { _id: item.productId, "inventory.branchId": oldInvoice.branchId },
// // // //                 { $inc: { "inventory.$.quantity": item.quantity } }, 
// // // //                 { session }
// // // //             );
// // // //         }

// // // //         // B. REVERSE FINANCIALS (Delete Old Ledger Entries for this invoice)
// // // //         await AccountEntry.deleteMany({ referenceId: oldInvoice._id, referenceType: 'invoice' }, { session });
// // // //         await Customer.findByIdAndUpdate(oldInvoice.customerId, { $inc: { outstandingBalance: -oldInvoice.grandTotal } }, { session });

// // // //         // C. APPLY NEW INVENTORY
// // // //         const newItems = updates.items || oldInvoice.items;
// // // //         const enrichedItems = [];
// // // //         for (const item of newItems) {
// // // //             const product = await Product.findById(item.productId).session(session);
// // // //             if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);
            
// // // //             const branchInv = product.inventory.find(inv => String(inv.branchId) === String(oldInvoice.branchId));
// // // //             if (!branchInv || branchInv.quantity < item.quantity) throw new AppError(`Insufficient stock for ${product.name}`, 400);

// // // //             branchInv.quantity -= item.quantity;
// // // //             await product.save({ session });
// // // //             enrichedItems.push({ ...item, name: product.name, sku: product.sku });
// // // //         }
// // // //         updates.items = enrichedItems;

// // // //         // D. SAVE NEW INVOICE
// // // //         Object.assign(oldInvoice, updates);
// // // //         updatedInvoice = await oldInvoice.save({ session });

// // // //         // E. RE-BOOK LEDGER
// // // //         const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// // // //         const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);

// // // //         await AccountEntry.create([{
// // // //             organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: updatedInvoice.customerId,
// // // //             date: updatedInvoice.invoiceDate, debit: updatedInvoice.grandTotal, credit: 0,
// // // //             description: `Invoice #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// // // //         }, {
// // // //             organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
// // // //             date: updatedInvoice.invoiceDate, debit: 0, credit: updatedInvoice.grandTotal,
// // // //             description: `Rev: #${updatedInvoice.invoiceNumber} (Updated)`, referenceType: 'invoice', referenceNumber: updatedInvoice.invoiceNumber, referenceId: updatedInvoice._id, createdBy: req.user._id
// // // //         }], { session });

// // // //         await Customer.findByIdAndUpdate(updatedInvoice.customerId, { $inc: { outstandingBalance: updatedInvoice.grandTotal } }, { session });

// // // //         // Audit
// // // //         await InvoiceAudit.create([{
// // // //             invoiceId: updatedInvoice._id, action: 'UPDATE_FINANCIAL', performedBy: req.user._id,
// // // //             details: `Updated financials. New Total: ${updatedInvoice.grandTotal}`, ipAddress: req.ip
// // // //         }], { session });
// // // //     } else {
// // // //         updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });
// // // //     }
// // // //   }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

// // // //   res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
// // // // });

// // // // /* ==========================================================================
// // // //    3. CANCEL INVOICE (Return Logic)
// // // //    ========================================================================== */
// // // // exports.cancelInvoice = catchAsync(async (req, res, next) => {
// // // //   const { id } = req.params;
// // // //   const { reason, restock = true } = req.body;

// // // //   await runInTransaction(async (session) => {
// // // //     const invoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).populate('items.productId').session(session);
// // // //     if (!invoice) throw new AppError('Invoice not found', 404);
// // // //     if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

// // // //     // 1. RESTOCK
// // // //     if (restock) {
// // // //         for (const item of invoice.items) {
// // // //           if (item.productId) {
// // // //             await Product.findOneAndUpdate(
// // // //               { _id: item.productId, "inventory.branchId": invoice.branchId },
// // // //               { $inc: { "inventory.$.quantity": item.quantity } },
// // // //               { session }
// // // //             );
// // // //           }
// // // //         }
// // // //     }

// // // //     // 2. REVERSE CUSTOMER BALANCE
// // // //     await Customer.findByIdAndUpdate(invoice.customerId, { $inc: { outstandingBalance: -invoice.grandTotal } }, { session });

// // // //     // 3. CREDIT NOTE LEDGER (Reverse Revenue)
// // // //     const arAccount = await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200', session);
// // // //     const salesAccount = await getOrInitAccount(req.user.organizationId, 'income', 'Sales', '4000', session);

// // // //     // Dr Sales / Cr AR
// // // //     await AccountEntry.create([{
// // // //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: salesAccount._id,
// // // //         date: new Date(), debit: invoice.grandTotal, credit: 0, description: `Cancel: #${invoice.invoiceNumber}`,
// // // //         referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
// // // //     }, {
// // // //         organizationId: req.user.organizationId, branchId: req.user.branchId, accountId: arAccount._id, customerId: invoice.customerId,
// // // //         date: new Date(), debit: 0, credit: invoice.grandTotal, description: `Cancel: #${invoice.invoiceNumber}`,
// // // //         referenceType: 'credit_note', referenceNumber: `CN-${invoice.invoiceNumber}`, referenceId: invoice._id, createdBy: req.user._id
// // // //     }], { session });

// // // //     // 4. IMPORTANT: If there were payments attached, we don't auto-refund them here.
// // // //     // The "Cash" stays in the company unless we explicitly process a "Refund" via Payment Controller.
// // // //     // However, the customer will now have a NEGATIVE balance (Credit) which is correct.

// // // //     invoice.status = 'cancelled';
// // // //     invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason}`;
// // // //     await invoice.save({ session });

// // // //     await InvoiceAudit.create([{
// // // //         invoiceId: invoice._id, action: 'CANCEL', performedBy: req.user._id,
// // // //         details: `Invoice cancelled. Restock: ${restock}. Reason: ${reason}`, ipAddress: req.ip
// // // //     }], { session });

// // // //   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

// // // //   res.status(200).json({ status: "success", message: "Invoice cancelled successfully." });
// // // // });

// // // // // --- Exports ---
// // // // exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
// // // //   const { ids, status } = req.body;
// // // //   await Invoice.updateMany({ _id: { $in: ids } }, { $set: { status } });
// // // //   res.status(200).json({ status: "success", message: "Updated" });
// // // // });
// // // // exports.validateNumber = catchAsync(async (req, res, next) => {
// // // //   const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
// // // //   res.status(200).json({ status: "success", valid: !exists });
// // // // });
// // // // exports.exportInvoices = catchAsync(async (req, res, next) => {
// // // //   const docs = await Invoice.find({ organizationId: req.user.organizationId }).populate('customerId').lean();
// // // //   res.status(200).json({ status: "success", data: docs });
// // // // });
// // // // exports.profitSummary = catchAsync(async (req, res, next) => {
// // // //   res.status(200).json({ status: "success", data: {} });
// // // // });
// // // // exports.getAllInvoices = factory.getAll(Invoice);
// // // // exports.getInvoice = factory.getOne(Invoice, [{ path: "customerId" }, { path: "items.productId" }]);
// // // // exports.deleteInvoice = factory.deleteOne(Invoice);
// // // // exports.getInvoicesByCustomer = catchAsync(async(req,res)=>res.json({status:'success'}));
// // // // exports.downloadInvoice = catchAsync(async(req,res)=>res.send('PDF'));
// // // // exports.emailInvoice = catchAsync(async(req,res)=>res.json({status:'success'}));
// // // // exports.getInvoiceHistory = catchAsync(async(req,res)=>res.json({status:'success'}));

// // // // // const mongoose = require("mongoose");
// // // // // const { z } = require("zod");
// // // // // const { format } = require('fast-csv');

// // // // // const Invoice = require("../models/invoiceModel");
// // // // // const Product = require("../models/productModel");
// // // // // const Customer = require("../models/customerModel");
// // // // // const AccountEntry = require('../models/accountEntryModel');
// // // // // const Account = require('../models/accountModel'); 
// // // // // const Organization = require("../models/organizationModel");
// // // // // const InvoiceAudit = require('../models/invoiceAuditModel');

// // // // // const SalesService = require("../services/salesService");
// // // // // const invoicePDFService = require("../services/invoicePDFService");
// // // // // const { createNotification } = require("../services/notificationService");

// // // // // const catchAsync = require("../utils/catchAsync");
// // // // // const AppError = require("../utils/appError");
// // // // // const factory = require("../utils/handlerFactory");
// // // // // const { runInTransaction } = require("../utils/runInTransaction");
// // // // // const { emitToOrg } = require("../utils/socket");

// // // // // // 🛡️ 1. Validation Schema
// // // // // // 🛡️ 1. Validation Schema
// // // // // const createInvoiceSchema = z.object({
// // // // //   customerId: z.string().min(1, "Customer ID is required"),
// // // // //   items: z.array(z.object({
// // // // //     productId: z.string().min(1, "Product ID is required"),
// // // // //     quantity: z.number().positive("Quantity must be positive"),
// // // // //     price: z.number().nonnegative("Price cannot be negative"),
// // // // //     tax: z.number().optional().default(0), // Can be mapped to taxRate
// // // // //     discount: z.number().optional().default(0)
// // // // //   })).min(1, "Invoice must have at least one item"),
// // // // //   invoiceNumber: z.string().optional(),
// // // // //   invoiceDate: z.string().optional(),
// // // // //   dueDate: z.string().optional(),
// // // // //   paidAmount: z.number().nonnegative().optional().default(0),
  
// // // // //   // ✅ FIXED: Matched to Mongoose Model ('issued' instead of 'sent')
// // // // //   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
  
// // // // //   paymentStatus: z.enum(['paid', 'unpaid', 'partial']).optional().default('unpaid'),
// // // // //   shippingCharges: z.number().nonnegative().optional().default(0),
// // // // //   notes: z.string().optional(),
  
// // // // //   // Optional: Add other fields if your frontend sends them
// // // // //   roundOff: z.number().optional(),
// // // // //   gstType: z.string().optional()
// // // // // });
// // // // // /* -------------------------------------------------------------
// // // // //  * CREATE INVOICE (Transactional & Validated)
// // // // // ------------------------------------------------------------- */
// // // // // exports.createInvoice = catchAsync(async (req, res, next) => {
// // // // //   // Validate
// // // // //   const validation = createInvoiceSchema.safeParse(req.body);
// // // // //   if (!validation.success) {
// // // // //     return next(new AppError(validation.error.errors[0].message, 400));
// // // // //   }
// // // // //   const body = validation.data;

// // // // //   let newInvoice, salesDoc;

// // // // //   await runInTransaction(async (session) => {
// // // // //     // ---------------------------------------------------------
// // // // //     // 1. PRE-PROCESS ITEMS (Fetch Names & Manage Inventory)
// // // // //     // ---------------------------------------------------------
// // // // //     const enrichedItems = [];

// // // // //     // We loop through items FIRST to populate names and check stock
// // // // //     for (const item of body.items) {
// // // // //       const product = await Product.findById(item.productId).session(session);

// // // // //       if (!product) {
// // // // //         throw new AppError(`Product not found: ${item.productId}`, 404);
// // // // //       }

// // // // //       // Inventory Check
// // // // //       const branchInv = product.inventory.find(
// // // // //         (inv) => inv.branchId.toString() === req.user.branchId.toString()
// // // // //       );

// // // // //       if (!branchInv || branchInv.quantity < item.quantity) {
// // // // //         throw new AppError(`Insufficient stock for ${product.name}`, 400);
// // // // //       }

// // // // //       // Deduct Stock
// // // // //       branchInv.quantity -= item.quantity;
// // // // //       await product.save({ session });

// // // // //       // Populate the 'name' field required by Invoice Model
// // // // //       enrichedItems.push({
// // // // //         ...item,
// // // // //         name: product.name,
// // // // //         sku: product.sku
// // // // //       });
// // // // //     }

// // // // //     // ---------------------------------------------------------
// // // // //     // 2. Create Invoice
// // // // //     // ---------------------------------------------------------
// // // // //     const invoiceArr = await Invoice.create([{
// // // // //       organizationId: req.user.organizationId,
// // // // //       branchId: req.user.branchId,
// // // // //       createdBy: req.user._id,
// // // // //       ...body,
// // // // //       items: enrichedItems, 
// // // // //     }], { session });

// // // // //     newInvoice = invoiceArr[0];

// // // // //     // ---------------------------------------------------------
// // // // //     // 3. Update Customer Outstanding
// // // // //     // ---------------------------------------------------------
// // // // //     const totalDue = newInvoice.grandTotal - (body.paidAmount || 0);
// // // // //     if (totalDue !== 0) {
// // // // //       await Customer.findByIdAndUpdate(
// // // // //         body.customerId,
// // // // //         { $inc: { outstandingBalance: totalDue } },
// // // // //         { session }
// // // // //       );
// // // // //     }

// // // // //     // ---------------------------------------------------------
// // // // //     // 4. Accounting Entries (Double Entry System)
// // // // //     //    Replaces both 'Ledger' and old 'AccountEntry' logic
// // // // //     // ---------------------------------------------------------
    
// // // // //     // Find actual Account IDs 
// // // // //     // (Ideally cached or fetched from Organization Settings)
// // // // //     const arAccount = await Account.findOne({
// // // // //       organizationId: req.user.organizationId,
// // // // //       $or: [{ code: '1200' }, { name: 'Accounts Receivable' }] 
// // // // //     }).session(session);

// // // // //     const salesAccount = await Account.findOne({
// // // // //       organizationId: req.user.organizationId,
// // // // //       $or: [{ code: '4000' }, { name: 'Sales' }] 
// // // // //     }).session(session);

// // // // //     if (arAccount && salesAccount) {
// // // // //       // ✅ DEBIT: Accounts Receivable (Asset increases)
// // // // //       // We tag 'customerId' here so this single entry acts as the Customer Ledger
// // // // //       await AccountEntry.create([{
// // // // //         organizationId: req.user.organizationId,
// // // // //         branchId: req.user.branchId,
// // // // //         accountId: arAccount._id, 
// // // // //         customerId: body.customerId, // <--- CRITICAL: Links to Customer Statement
// // // // //         date: newInvoice.invoiceDate,
// // // // //         debit: newInvoice.grandTotal,
// // // // //         credit: 0,
// // // // //         description: `Invoice #${newInvoice.invoiceNumber}`,
// // // // //         referenceType: 'invoice',
// // // // //         referenceNumber: newInvoice.invoiceNumber, // Searchable
// // // // //         referenceId: newInvoice._id,
// // // // //         createdBy: req.user._id
// // // // //       }], { session });

// // // // //       // ✅ CREDIT: Sales (Income increases)
// // // // //       await AccountEntry.create([{
// // // // //         organizationId: req.user.organizationId,
// // // // //         branchId: req.user.branchId,
// // // // //         accountId: salesAccount._id,
// // // // //         date: newInvoice.invoiceDate,
// // // // //         debit: 0,
// // // // //         credit: newInvoice.grandTotal,
// // // // //         description: `Revenue - Inv #${newInvoice.invoiceNumber}`,
// // // // //         referenceType: 'invoice',
// // // // //         referenceNumber: newInvoice.invoiceNumber,
// // // // //         referenceId: newInvoice._id,
// // // // //         createdBy: req.user._id
// // // // //       }], { session });
// // // // //     } else {
// // // // //       console.warn("Skipping Accounting Entries: 'Sales' or 'Accounts Receivable' account not found.");
// // // // //       // Optional: throw new AppError('System Accounts missing. Please contact admin.', 500);
// // // // //     }

// // // // //     // ---------------------------------------------------------
// // // // //     // 5. Sales Record & Audit
// // // // //     // ---------------------------------------------------------
// // // // //     salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);

// // // // //     await InvoiceAudit.create([{
// // // // //       invoiceId: newInvoice._id,
// // // // //       action: 'CREATE',
// // // // //       performedBy: req.user._id,
// // // // //       details: `Invoice #${newInvoice.invoiceNumber} created. Total: ${newInvoice.grandTotal}`,
// // // // //       ipAddress: req.ip
// // // // //     }], { session });

// // // // //   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

// // // // //   // ---------------------------------------------------------
// // // // //   // 6. Notifications
// // // // //   // ---------------------------------------------------------
// // // // //   try {
// // // // //     emitToOrg(req.user.organizationId, "newNotification", {
// // // // //       title: "New Sale",
// // // // //       message: `Invoice #${newInvoice.invoiceNumber} for ₹${newInvoice.grandTotal}`,
// // // // //       type: "success"
// // // // //     });

// // // // //     const org = await Organization.findById(req.user.organizationId).select('owner');
// // // // //     if (org && org.owner) {
// // // // //       createNotification(req.user.organizationId, org.owner, "INVOICE_CREATED", "New Sale", `Invoice generated by ${req.user.name}`, req.app.get("io"));
// // // // //     }
// // // // //   } catch (e) { console.error("Notification failed", e.message); }

// // // // //   res.status(201).json({ status: "success", data: { invoice: newInvoice, sales: salesDoc } });
// // // // // });

// // // // // /* -------------------------------------------------------------
// // // // //  * BULK STATUS UPDATE
// // // // // ------------------------------------------------------------- */
// // // // // exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
// // // // //   const { ids, status } = req.body;
// // // // //   if (!ids || !Array.isArray(ids)) return next(new AppError("ids array required", 400));

// // // // //   const result = await Invoice.updateMany(
// // // // //     { _id: { $in: ids }, organizationId: req.user.organizationId },
// // // // //     { $set: { status: status, paymentStatus: status === 'paid' ? 'paid' : 'unpaid' } }
// // // // //   );

// // // // //   res.status(200).json({ status: "success", message: `Updated ${result.modifiedCount} invoices.` });
// // // // // });

// // // // // /* -------------------------------------------------------------
// // // // //  * VALIDATE INVOICE NUMBER
// // // // // ------------------------------------------------------------- */
// // // // // exports.validateNumber = catchAsync(async (req, res, next) => {
// // // // //   const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
// // // // //   res.status(200).json({ status: "success", valid: !exists });
// // // // // });

// // // // // /* -------------------------------------------------------------
// // // // //  * EXPORT INVOICES (CSV/JSON)
// // // // // ------------------------------------------------------------- */
// // // // // exports.exportInvoices = catchAsync(async (req, res, next) => {
// // // // //   const { format: fileFormat = 'csv', start, end } = req.query;
// // // // //   const filter = { organizationId: req.user.organizationId };

// // // // //   if (start || end) {
// // // // //     filter.invoiceDate = {};
// // // // //     if (start) filter.invoiceDate.$gte = new Date(start);
// // // // //     if (end) filter.invoiceDate.$lte = new Date(end);
// // // // //   }

// // // // //   const docs = await Invoice.find(filter)
// // // // //     .populate('customerId', 'name phone email')
// // // // //     .sort({ invoiceDate: -1 })
// // // // //     .lean();

// // // // //   if (fileFormat === 'csv') {
// // // // //     res.setHeader('Content-Disposition', `attachment; filename=invoices_${new Date().toISOString().slice(0, 10)}.csv`);
// // // // //     res.setHeader('Content-Type', 'text/csv');

// // // // //     const csvStream = format({ headers: true });
// // // // //     csvStream.pipe(res);

// // // // //     docs.forEach(doc => {
// // // // //       csvStream.write({
// // // // //         'Date': doc.invoiceDate ? new Date(doc.invoiceDate).toLocaleDateString() : '-',
// // // // //         'Invoice No': doc.invoiceNumber,
// // // // //         'Customer Name': doc.customerId?.name || 'Walk-in',
// // // // //         'Customer Phone': doc.customerId?.phone || '-',
// // // // //         'Total Amount': doc.grandTotal || 0,
// // // // //         'Paid Amount': doc.paidAmount || 0,
// // // // //         'Balance': doc.balanceAmount || 0,
// // // // //         'Status': doc.status,
// // // // //         'Payment Status': doc.paymentStatus,
// // // // //         'Items Summary': doc.items ? doc.items.map(i => `${i.name} (x${i.quantity})`).join(', ') : ''
// // // // //       });
// // // // //     });

// // // // //     csvStream.end();
// // // // //     return;
// // // // //   }

// // // // //   res.status(200).json({ status: 'success', results: docs.length, data: { invoices: docs } });
// // // // // });

// // // // // /* -------------------------------------------------------------
// // // // //  * PROFIT SUMMARY
// // // // // ------------------------------------------------------------- */
// // // // // exports.profitSummary = catchAsync(async (req, res, next) => {
// // // // //   const { start, end } = req.query;
// // // // //   const match = { organizationId: req.user.organizationId };
// // // // //   if (start) match.createdAt = { ...match.createdAt, $gte: new Date(start) };
// // // // //   if (end) match.createdAt = { ...match.createdAt, $lte: new Date(end) };

// // // // //   const agg = await Invoice.aggregate([
// // // // //     { $match: match },
// // // // //     { $group: { _id: null, totalRevenue: { $sum: "$total" }, totalCost: { $sum: "$cost" }, count: { $sum: 1 } } }
// // // // //   ]);

// // // // //   const summary = agg[0] || { totalRevenue: 0, totalCost: 0, count: 0, profit: 0 };
// // // // //   summary.profit = summary.totalRevenue - summary.totalCost;
// // // // //   res.status(200).json({ status: "success", data: { summary } });
// // // // // });

// // // // // /* -------------------------------------------------------------
// // // // //  * STANDARD CRUD & PDF
// // // // // ------------------------------------------------------------- */
// // // // // exports.getAllInvoices = factory.getAll(Invoice);

// // // // // exports.getInvoice = factory.getOne(Invoice, [
// // // // //   { path: "customerId", select: "name phone email" },
// // // // //   { path: "items.productId", select: "name sku brand category" }
// // // // // ]);

// // // // // exports.updateInvoice = catchAsync(async (req, res, next) => {
// // // // //   const invoice = await Invoice.findById(req.params.id);
// // // // //   if (!invoice) return next(new AppError("Invoice not found", 404));

// // // // //   const updates = req.body;

// // // // //   if (updates.status && updates.status !== invoice.status) {
// // // // //     await InvoiceAudit.create({
// // // // //       invoiceId: invoice._id,
// // // // //       action: 'STATUS_CHANGE',
// // // // //       performedBy: req.user._id,
// // // // //       details: `Status changed from ${invoice.status} to ${updates.status}`,
// // // // //       meta: { old: invoice.status, new: updates.status },
// // // // //       ipAddress: req.ip
// // // // //     });
// // // // //   } else {
// // // // //     await InvoiceAudit.create({
// // // // //       invoiceId: invoice._id,
// // // // //       action: 'UPDATE',
// // // // //       performedBy: req.user._id,
// // // // //       details: `Invoice details updated`,
// // // // //       meta: { updates },
// // // // //       ipAddress: req.ip
// // // // //     });
// // // // //   }

// // // // //   const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

// // // // //   res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
// // // // // });

// // // // // exports.deleteInvoice = factory.deleteOne(Invoice);

// // // // // exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
// // // // //   const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId });
// // // // //   res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
// // // // // });

// // // // // exports.downloadInvoice = catchAsync(async (req, res, next) => {
// // // // //   const pdfBuffer = await invoicePDFService.generateInvoicePDF(req.params.id, req.user.organizationId);
// // // // //   res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf` });
// // // // //   res.send(pdfBuffer);
// // // // // });

// // // // // exports.emailInvoice = catchAsync(async (req, res, next) => {
// // // // //   await invoicePDFService.sendInvoiceEmail(req.params.id, req.user.organizationId);
// // // // //   res.status(200).json({ status: "success", message: "Emailed successfully." });
// // // // // });

// // // // // exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
// // // // //   const invoiceId = req.params.id;
// // // // //   const history = await InvoiceAudit.find({ invoiceId })
// // // // //     .populate('performedBy', 'name email')
// // // // //     .sort({ createdAt: -1 });

// // // // //   res.status(200).json({
// // // // //     status: "success",
// // // // //     results: history.length,
// // // // //     data: { history }
// // // // //   });
// // // // // });
