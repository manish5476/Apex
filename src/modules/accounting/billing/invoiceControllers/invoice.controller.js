// const mongoose = require("mongoose");
// const { z } = require("zod");
// const { format } = require('fast-csv');
// const { invalidateOpeningBalance } = require("../../core/ledgerCache.service");
// const ProfitCalculator = require('../utils/profitCalculator');

// const Invoice = require("../invoice.model");
// const Payment = require("../../payments/payment.model");
// const Product = require("../../../inventory/core/product.model");
// const Customer = require("../../../organization/core/customer.model");
// const AccountEntry = require('../../core/accountEntry.model');
// const Account = require('../../core/account.model');
// const Organization = require("../../../organization/core/organization.model");
// const InvoiceAudit = require('../invoiceAudit.model');

// const SalesService = require("../../../inventory/core/sales.service");
// const invoicePDFService = require("../../../_legacy/services/invoicePDFService");
// const StockValidationService = require("../../../_legacy/services/stockValidationService");
// const { createNotification } = require("../../../notification/core/notification.service");
// // CHANGED: Import the whole service to access reverseInvoiceJournal
// const salesJournalService = require('../../../inventory/core/salesJournal.service');

// const catchAsync = require("../../../../core/utils/catchAsync");
// const AppError = require("../../../../core/utils/appError");
// const factory = require("../../../../core/utils/handlerFactory");
// const { runInTransaction } = require("../../../../core/utils/runInTransaction");
// const { emitToOrg } = require("../../../../core/utils/_legacy/socket");
// const automationService = require('../../../_legacy/services/automationService');

// /* ======================================================
//    STOCK RESTORATION HELPER FUNCTION
// ====================================================== */
// async function restoreStockFromInvoice(items, branchId, organizationId, session) {
//   for (const item of items) {
//     await Product.findOneAndUpdate(
//       {
//         _id: item.productId,
//         organizationId,
//         "inventory.branchId": branchId
//       },
//       { $inc: { "inventory.$.quantity": item.quantity } },
//       { session }
//     );
//   }
// }

// const createInvoiceSchema = z.object({
//   customerId: z.string().min(1, "Customer ID is required"),
//   items: z.array(z.object({
//     productId: z.string().min(1, "Product ID is required"),
//     quantity: z.number().positive("Quantity must be positive"),
//     price: z.number().nonnegative("Price cannot be negative"), // Selling Price
    
//     // 🟢 ADDED: This will be populated by the backend, not the user
//     purchasePriceAtSale: z.number().nonnegative().optional(), 
    
//     tax: z.number().optional().default(0),
//     taxRate: z.number().optional().default(0),
//     discount: z.number().optional().default(0),
//     unit: z.string().optional().default('pcs'),
//     hsnCode: z.string().optional()
//   })).min(1, "Invoice must have at least one item"),

//   invoiceNumber: z.string().optional(),
//   invoiceDate: z.union([z.string(), z.date()]).optional(),
//   dueDate: z.union([z.string(), z.date()]).optional(),

//   paidAmount: z.coerce.number().min(0).optional().default(0),
//   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
//   referenceNumber: z.string().optional(),
//   paymentReference: z.string().optional(),
//   transactionId: z.string().optional(),

//   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
//   shippingCharges: z.coerce.number().min(0).optional().default(0),
//   notes: z.string().optional(),
//   roundOff: z.number().optional(),
//   gstType: z.string().optional(),
//   attachedFiles: z.array(z.string()).optional()
// });

// // --- HELPER: Get or Init Account ---
// async function getOrInitAccount(orgId, type, name, code, session) {
//   const query = Account.findOne({ organizationId: orgId, code });
//   if (session) query.session(session);
//   let account = await query;
//   if (!account) {
//     try {
//         const newAccounts = await Account.create([{ organizationId: orgId,  name,  code,  type,  isGroup: false,  cachedBalance: 0        }], { session }); 
//         account = newAccounts[0];
//     } catch (err) {
//         if (err.code === 11000) {
//             const retryQuery = Account.findOne({ organizationId: orgId, code });
//             if (session) retryQuery.session(session);
//             account = await retryQuery;
//         } else {
//             throw err;
//         }
//     }
//   }
//   return account;
// }

// async function createPaymentAccountingEntries({ invoice, payment, userId, session }) {
//   if (!payment || !payment.amount || payment.amount <= 0) {
//     console.warn('[ACCOUNTING] Skipping payment entries: Invalid amount');
//     return;
//   }
//   let accountName = 'Cash';
//   let accountCode = '1001';
//   switch (payment.paymentMethod) {
//     case 'bank':
//     case 'cheque':accountName = 'Bank';accountCode = '1002';      break;
//     case 'upi':accountName = 'UPI Receivables';accountCode = '1003'; break;
//     case 'card':accountName = 'Card Receivables';accountCode = '1004';
//       break;
//   }
//   const [assetAccount, arAccount] = await Promise.all([
//     getOrInitAccount(invoice.organizationId, 'asset', accountName, accountCode, session),
//     getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session)
//   ]);

//   // 3. Create Ledger Entries
//   // Dr Asset (Cash/Bank) -> Money coming in
//   await AccountEntry.create([{
//     organizationId: invoice.organizationId,
//     branchId: invoice.branchId,
//     accountId: assetAccount._id,
//     date: payment.paymentDate,
//     debit: payment.amount,
//     credit: 0,
//     description: `Payment for ${invoice.invoiceNumber}`,
//     referenceType: 'payment',
//     referenceId: invoice._id,
//     paymentId: payment._id,
//     createdBy: userId
//   }], { session });

//   // Cr Accounts Receivable -> Reducing what customer owes
//   await AccountEntry.create([{
//     organizationId: invoice.organizationId,
//     branchId: invoice.branchId,
//     accountId: arAccount._id,
//     customerId: invoice.customerId,
//     date: payment.paymentDate,
//     debit: 0,
//     credit: payment.amount,
//     description: `Payment applied to ${invoice.invoiceNumber}`,
//     referenceType: 'payment',
//     referenceId: invoice._id,
//     paymentId: payment._id,
//     createdBy: userId
//   }], { session });
// }

// // --- HELPER: Reduce Stock ---
// async function reduceStockForInvoice(items, branchId, organizationId, session) {
//   for (const item of items) {
//     const updateResult = await Product.findOneAndUpdate(
//       {  _id: item.productId,  organizationId: organizationId, "inventory.branchId": branchId, "inventory.quantity": { $gte: item.quantity }       },
//       { $inc: { "inventory.$.quantity": -item.quantity },$set: { lastSold: new Date() }      },
//       { session, new: true }
//     );
//     if (!updateResult) {
//        const product = await Product.findById(item.productId).session(session);
//        if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
//        const inv = product.inventory?.find(i => String(i.branchId) === String(branchId));
//        throw new AppError(`Insufficient stock for ${product.name}. Available: ${inv?.quantity || 0}`, 400);
//     }
//   }
// }

// /**
//  * @description Creates a new invoice, manages stock atomically, and handles initial payments/accounting.
//  * @architect_notes Resolved N+1 Problem, Atomic Stock Deduction, and Mathematical Integrity.
//  */

// exports.createInvoice = catchAsync(async (req, res, next) => {
//   // 1. Schema Validation
//   const validatedData = createInvoiceSchema.safeParse(req.body);
//   if (!validatedData.success) {
//     const errorMessage = validatedData.error.errors
//       .map(e => `${e.path.join('.')}: ${e.message}`)
//       .join(', ');
//     return next(new AppError(errorMessage, 400));
//   }

//   // 2. Resolve N+1 Problem: Bulk fetch all products once
//   const productIds = req.body.items.map(item => item.productId);
//   const products = await Product.find({
//     _id: { $in: productIds },
//     organizationId: req.user.organizationId
//   }).select('name sku inventory hsnCode category purchasePrice');

//   // 3. Enrich items and prepare snapshots
//   const enrichedItems = req.body.items.map(item => {
//     const product = products.find(p => p._id.toString() === item.productId);
//     if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

//     const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
    
//     // Preliminary check (final check happens atomically in the transaction)
//     if (!inv || inv.quantity < item.quantity) {
//       throw new AppError(`Insufficient stock for ${product.name}`, 400);
//     }

//     return {
//       ...item,
//       name: product.name,
//       hsnCode: product.hsnCode || product.sku || item.hsnCode || "",
//       unit: item.unit || 'pcs',
//       discount: item.discount || 0,
//       taxRate: item.taxRate || item.tax || 0,
//       // SNAPSHOT: Store current cost price to lock in profit margins
//       purchasePriceAtSale: product.purchasePrice || 0,
//       reminderSent: false,
//       overdueNoticeSent: false,
//       overdueCount: 0
//     };
//   });

//   // 4. Mathematical Calculations (Pure Functions)
//   const subtotal = enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//   const shippingCharges = req.body.shippingCharges || 0;
//   const inputDiscount = req.body.discount || 0;
  
//   const taxAmount = enrichedItems.reduce((sum, item) => {
//     const lineTotal = (item.price * item.quantity) - (item.discount || 0);
//     return sum + ((item.taxRate || 0) / 100 * lineTotal);
//   }, 0);

//   const roundOff = req.body.roundOff || 0;
//   const grandTotal = Math.round(subtotal + shippingCharges + taxAmount - inputDiscount + roundOff);
//   const paidAmount = req.body.paidAmount || 0;

//   if (paidAmount > grandTotal) {
//     return next(new AppError(`Paid amount (${paidAmount}) cannot exceed Grand Total (${grandTotal})`, 400));
//   }

//   const invoiceNumber = req.body.invoiceNumber || `INV-${Date.now()}`;

//   // 5. Atomic Transaction Execution
//   await runInTransaction(async (session) => {
//     // A. Status & Payment Logic
//     let paymentStatus = 'unpaid';
//     let status = req.body.status || 'issued';

//     if (paidAmount > 0) {
//       paymentStatus = paidAmount >= grandTotal ? 'paid' : 'partial';
//       if (paymentStatus === 'paid') status = 'paid';
//     }

//     // B. Create Invoice Document
//     const [invoice] = await Invoice.create([{
//       ...req.body,
//       invoiceNumber,
//       items: enrichedItems,
//       subTotal: subtotal,
//       grandTotal,
//       balanceAmount: grandTotal - paidAmount,
//       paidAmount,
//       paymentStatus,
//       status,
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       customerId: req.body.customerId,
//       createdBy: req.user._id,
//       paymentReference: req.body.paymentReference || req.body.referenceNumber,
//       transactionId: req.body.transactionId
//     }], { session });

//     // C. Atomic Stock Reduction (Prevents race conditions)
//     // This utilizes findOneAndUpdate with a quantity filter inside the transaction
//     await reduceStockForInvoice(req.body.items, req.user.branchId, req.user.organizationId, session);

//     // D. Process Payment & Accounting (If applicable)
//     if (paidAmount > 0) {
//       const [payment] = await Payment.create([{
//         organizationId: req.user.organizationId,
//         branchId: req.user.branchId,
//         type: 'inflow',
//         customerId: invoice.customerId,
//         invoiceId: invoice._id,
//         paymentDate: req.body.invoiceDate || new Date(),
//         amount: paidAmount,
//         paymentMethod: req.body.paymentMethod || 'cash',
//         transactionMode: 'auto',
//         referenceNumber: req.body.paymentReference || req.body.referenceNumber,
//         transactionId: req.body.transactionId,
//         remarks: `Auto-payment for ${invoice.invoiceNumber}`,
//         status: 'completed',
//         allocationStatus: 'fully_allocated',
//         remainingAmount: 0,
//         allocatedTo: [{
//           type: 'invoice',
//           documentId: invoice._id,
//           amount: paidAmount,
//           allocatedAt: new Date()
//         }],
//         createdBy: req.user._id
//       }], { session });

//       // Generate Double-Entry Accounting Logs
//       await createPaymentAccountingEntries({
//         invoice,
//         payment,
//         userId: req.user._id,
//         session
//       });
//     }

//     // E. Update Customer Credit Profile
//     if (invoice.customerId) {
//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         {
//           $inc: {
//             totalPurchases: grandTotal,
//             outstandingBalance: grandTotal - paidAmount
//           },
//           $set: { lastPurchaseDate: new Date() }
//         },
//         { session }
//       );
//     }

//     // F. Post Revenue Recognition Journal (Sales Journal)
//     if (invoice.status !== 'draft') {
//       await salesJournalService.postInvoiceJournal({
//         orgId: req.user.organizationId,
//         branchId: req.user.branchId,
//         invoice,
//         customerId: invoice.customerId,
//         items: invoice.items,
//         userId: req.user._id,
//         session
//       });

//       // Synchronize with Analytics/Sales reporting service
//       await SalesService.createFromInvoiceTransactional(invoice, session);
//     }

//     // Attach to request for post-transaction hooks
//     req.invoice = invoice;

//   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

//   // 6. Post-Transaction Communication (Async)
//   const finalInvoice = req.invoice;
  
//   // Trigger Webhooks/Automation
//   automationService.triggerEvent('invoice.created', finalInvoice.toObject(), req.user.organizationId);
  
//   // Real-time Update via Socket.io
//   emitToOrg(req.user.organizationId, 'invoice:created', finalInvoice);

//   // 7. Success Response
//   res.status(201).json({
//     status: 'success',
//     data: finalInvoice
//   });
// });
// const mongoose = require('mongoose');
// const { z } = require('zod');

// // --- Models ---
// const Invoice = require('../../accounting/billing/invoice.model');
// const Product = require('../../inventory/core/product.model');
// const Account = require('../../accounting/core/account.model');
// const AccountEntry = require('../../accounting/core/accountEntry.model');
// const Payment = require('../../accounting/billing/payment.model');
// const Customer = require('../../organization/core/customer.model');

// // --- Services ---
// const SalesService = require('../../inventory/core/sales.service');
// const salesJournalService = require('../../accounting/journals/salesJournal.service');
// const automationService = require('../../../core/services/automation.service');
// const { emitToOrg } = require('../../../core/services/socket.service');

// // --- Utils ---
// const catchAsync = require('../../../core/utils/catchAsync');
// const AppError = require('../../../core/utils/appError');
// const runInTransaction = require('../../../core/utils/runInTransaction');




const mongoose = require("mongoose");
const { z } = require("zod");
const { format } = require('fast-csv');
const { invalidateOpeningBalance } = require("../../core/ledgerCache.service");
const ProfitCalculator = require('../utils/profitCalculator');

const Invoice = require("../invoice.model");
const Payment = require("../../payments/payment.model");
const Product = require("../../../inventory/core/product.model");
const Customer = require("../../../organization/core/customer.model");
const AccountEntry = require('../../core/accountEntry.model');
const Account = require('../../core/account.model');
const Organization = require("../../../organization/core/organization.model");
const InvoiceAudit = require('../invoiceAudit.model');

const SalesService = require("../../../inventory/core/sales.service");
const invoicePDFService = require("../../../_legacy/services/invoicePDFService");
const StockValidationService = require("../../../_legacy/services/stockValidationService");
const { createNotification } = require("../../../notification/core/notification.service");
// CHANGED: Import the whole service to access reverseInvoiceJournal
const salesJournalService = require('../../../inventory/core/salesJournal.service');

const catchAsync = require("../../../../core/utils/catchAsync");
const AppError = require("../../../../core/utils/appError");
const factory = require("../../../../core/utils/handlerFactory");
const { runInTransaction } = require("../../../../core/utils/runInTransaction");
const { emitToOrg } = require("../../../../core/utils/_legacy/socket");
const automationService = require('../../../_legacy/services/automationService');

// ==============================================================================
// 1. VALIDATION SCHEMA
// ==============================================================================
const createInvoiceSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  items: z.array(z.object({
    productId: z.string().min(1, "Product ID is required"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    price: z.coerce.number().nonnegative("Price cannot be negative"), // Selling Price
    
    // 🟢 ADDED: This will be populated by the backend, not the user
    purchasePriceAtSale: z.coerce.number().nonnegative().optional(), 
    
    tax: z.coerce.number().optional().default(0),
    taxRate: z.coerce.number().optional().default(0),
    discount: z.coerce.number().optional().default(0),
    unit: z.string().optional().default('pcs'),
    hsnCode: z.string().optional()
  })).min(1, "Invoice must have at least one item"),

  invoiceNumber: z.string().optional(),
  invoiceDate: z.union([z.string(), z.date()]).optional(),
  dueDate: z.union([z.string(), z.date()]).optional(),

  paidAmount: z.coerce.number().min(0).optional().default(0),
  paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
  referenceNumber: z.string().optional(),
  paymentReference: z.string().optional(),
  transactionId: z.string().optional(),

  status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
  shippingCharges: z.coerce.number().min(0).optional().default(0),
  notes: z.string().optional(),
  roundOff: z.coerce.number().optional(),
  gstType: z.string().optional(),
  attachedFiles: z.array(z.string()).optional()
});

// ==============================================================================
// 2. HELPER FUNCTIONS
// ==============================================================================

// --- Get or Init Ledger Account ---
async function getOrInitAccount(orgId, type, name, code, session) {
  const query = Account.findOne({ organizationId: orgId, code });
  if (session) query.session(session);
  let account = await query;
  if (!account) {
    try {
        const newAccounts = await Account.create([{ 
            organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0 
        }], { session }); 
        account = newAccounts[0];
    } catch (err) {
        if (err.code === 11000) {
            const retryQuery = Account.findOne({ organizationId: orgId, code });
            if (session) retryQuery.session(session);
            account = await retryQuery;
        } else {
            throw err;
        }
    }
  }
  return account;
}

// --- Create Payment Accounting Entries (Double Entry) ---
async function createPaymentAccountingEntries({ invoice, payment, userId, session }) {
  if (!payment || !payment.amount || payment.amount <= 0) {
    console.warn('[ACCOUNTING] Skipping payment entries: Invalid amount');
    return;
  }
  
  let accountName = 'Cash';
  let accountCode = '1001';
  
  switch (payment.paymentMethod) {
    case 'bank':
    case 'cheque': accountName = 'Bank'; accountCode = '1002'; break;
    case 'upi': accountName = 'UPI Receivables'; accountCode = '1003'; break;
    case 'card': accountName = 'Card Receivables'; accountCode = '1004'; break;
  }

  const [assetAccount, arAccount] = await Promise.all([
    getOrInitAccount(invoice.organizationId, 'asset', accountName, accountCode, session),
    getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session)
  ]);

  // 1. Dr Asset (Cash/Bank) -> Money coming in
  await AccountEntry.create([{
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    accountId: assetAccount._id,
    date: payment.paymentDate,
    debit: payment.amount,
    credit: 0,
    description: `Payment for ${invoice.invoiceNumber}`,
    referenceType: 'payment',
    referenceId: invoice._id,
    paymentId: payment._id,
    createdBy: userId
  }], { session });

  // 2. Cr Accounts Receivable -> Reducing what customer owes
  await AccountEntry.create([{
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    accountId: arAccount._id,
    customerId: invoice.customerId,
    date: payment.paymentDate,
    debit: 0,
    credit: payment.amount,
    description: `Payment applied to ${invoice.invoiceNumber}`,
    referenceType: 'payment',
    referenceId: invoice._id,
    paymentId: payment._id,
    createdBy: userId
  }], { session });
}

// --- Reduce Stock (Legacy/Standalone Helper) ---
// NOTE: Not used in createInvoice anymore to avoid race conditions with SalesService
async function reduceStockForInvoice(items, branchId, organizationId, session) {
  for (const item of items) {
    const updateResult = await Product.findOneAndUpdate(
      {  _id: item.productId,  organizationId: organizationId, "inventory.branchId": branchId, "inventory.quantity": { $gte: item.quantity }        },
      { $inc: { "inventory.$.quantity": -item.quantity }, $set: { lastSold: new Date() }       },
      { session, new: true }
    );
    if (!updateResult) {
       const product = await Product.findById(item.productId).session(session);
       if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
       const inv = product.inventory?.find(i => String(i.branchId) === String(branchId));
       throw new AppError(`Insufficient stock for ${product.name}. Available: ${inv?.quantity || 0}`, 400);
    }
  }
}

// ==============================================================================
// 3. CONTROLLER: CREATE INVOICE
// ==============================================================================

/**
 * @description Creates a new invoice, manages stock atomically, and handles initial payments/accounting.
 * @architect_notes Resolved N+1 Problem, Atomic Stock Deduction, and Mathematical Integrity.
 */
exports.createInvoice = catchAsync(async (req, res, next) => {
  // 1. Schema Validation
  const validatedData = createInvoiceSchema.safeParse(req.body);
  if (!validatedData.success) {
    // Log error for debugging
    console.error("Zod Validation Error:", JSON.stringify(validatedData.error, null, 2));
    
    // Check if error exists to prevent crash
    const errors = validatedData.error?.errors || [];
    const errorMessage = errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') || "Invalid input data";
    return next(new AppError(errorMessage, 400));
  }

  // Use the validated/coerced data instead of raw req.body
  // This guarantees 'items' is an array and defaults are applied
  const { items, ...invoiceData } = validatedData.data;

  // 2. Resolve N+1 Problem: Bulk fetch all products once
  const productIds = items.map(item => item.productId);
  const products = await Product.find({
    _id: { $in: productIds },
    organizationId: req.user.organizationId
  }).select('name sku inventory hsnCode category purchasePrice');

  // 3. Enrich items and prepare snapshots
  const enrichedItems = items.map(item => {
    const product = products.find(p => p._id.toString() === item.productId);
    if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

    const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
    
    // Preliminary check (final check happens atomically in the transaction)
    if (!inv || inv.quantity < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name}`, 400);
    }

    return {
      ...item,
      name: product.name,
      hsnCode: product.hsnCode || product.sku || item.hsnCode || "",
      unit: item.unit || 'pcs',
      discount: item.discount || 0,
      taxRate: item.taxRate || item.tax || 0,
      // SNAPSHOT: Store current cost price to lock in profit margins
      purchasePriceAtSale: product.purchasePrice || 0,
      reminderSent: false,
      overdueNoticeSent: false,
      overdueCount: 0
    };
  });

  // 4. Mathematical Calculations (Pure Functions)
  const subtotal = enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shippingCharges = invoiceData.shippingCharges || 0;
  const inputDiscount = invoiceData.discount || 0;
  
  const taxAmount = enrichedItems.reduce((sum, item) => {
    const lineTotal = (item.price * item.quantity) - (item.discount || 0);
    return sum + ((item.taxRate || 0) / 100 * lineTotal);
  }, 0);

  const roundOff = invoiceData.roundOff || 0;
  const grandTotal = Math.round(subtotal + shippingCharges + taxAmount - inputDiscount + roundOff);
  const paidAmount = invoiceData.paidAmount || 0;

  if (paidAmount > grandTotal) {
    return next(new AppError(`Paid amount (${paidAmount}) cannot exceed Grand Total (${grandTotal})`, 400));
  }

  const invoiceNumber = invoiceData.invoiceNumber || `INV-${Date.now()}`;

  // 5. Atomic Transaction Execution
  await runInTransaction(async (session) => {
    // A. Status & Payment Logic
    let paymentStatus = 'unpaid';
    let status = invoiceData.status || 'issued';

    if (paidAmount > 0) {
      paymentStatus = paidAmount >= grandTotal ? 'paid' : 'partial';
      if (paymentStatus === 'paid') status = 'paid';
    }

    // B. Create Invoice Document
    const [invoice] = await Invoice.create([{
      ...invoiceData,
      invoiceNumber,
      items: enrichedItems,
      subTotal: subtotal,
      grandTotal,
      balanceAmount: grandTotal - paidAmount,
      paidAmount,
      paymentStatus,
      status,
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      customerId: invoiceData.customerId,
      createdBy: req.user._id,
      paymentReference: invoiceData.paymentReference || invoiceData.referenceNumber,
      transactionId: invoiceData.transactionId
    }], { session });

    // ❌ REMOVED: Stock reduction here caused Double Deduction logic error.
    // Stock is now reduced inside SalesService.createFromInvoiceTransactional below.

    // D. Process Payment & Accounting (If applicable)
    if (paidAmount > 0) {
      const [payment] = await Payment.create([{
        organizationId: req.user.organizationId,
        branchId: req.user.branchId,
        type: 'inflow',
        customerId: invoice.customerId,
        invoiceId: invoice._id,
        paymentDate: invoiceData.invoiceDate || new Date(),
        amount: paidAmount,
        paymentMethod: invoiceData.paymentMethod || 'cash',
        transactionMode: 'auto',
        referenceNumber: invoiceData.paymentReference || invoiceData.referenceNumber,
        transactionId: invoiceData.transactionId,
        remarks: `Auto-payment for ${invoice.invoiceNumber}`,
        status: 'completed',
        allocationStatus: 'fully_allocated',
        remainingAmount: 0,
        allocatedTo: [{
          type: 'invoice',
          documentId: invoice._id,
          amount: paidAmount,
          allocatedAt: new Date()
        }],
        createdBy: req.user._id
      }], { session });

      // Generate Double-Entry Accounting Logs
      await createPaymentAccountingEntries({
        invoice,
        payment,
        userId: req.user._id,
        session
      });
    }

    // E. Update Customer Credit Profile
    if (invoice.customerId) {
      await Customer.findByIdAndUpdate(
        invoice.customerId,
        {
          $inc: {
            totalPurchases: grandTotal,
            outstandingBalance: grandTotal - paidAmount
          },
          $set: { lastPurchaseDate: new Date() }
        },
        { session }
      );
    }

    // F. Post Revenue Recognition Journal (Sales Journal)
    if (invoice.status !== 'draft') {
      // 1. Post Accounting Entries
      await salesJournalService.postInvoiceJournal({
        orgId: req.user.organizationId,
        branchId: req.user.branchId,
        invoice,
        customerId: invoice.customerId,
        items: invoice.items,
        userId: req.user._id,
        session
      });

      // 2. Synchronize with Sales Service (Inventory Deduction + COGS + Stats)
      // ✅ This service handles the stock reduction safely
      await SalesService.createFromInvoiceTransactional(invoice, session);
    }

    // Attach to request for post-transaction hooks
    req.invoice = invoice;

  }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

  // 6. Post-Transaction Communication (Async)
  const finalInvoice = req.invoice;
  
  // Trigger Webhooks/Automation
  automationService.triggerEvent('invoice.created', finalInvoice.toObject(), req.user.organizationId);
  
  // Real-time Update via Socket.io
  emitToOrg(req.user.organizationId, 'invoice:created', finalInvoice);

  // 7. Success Response
  res.status(201).json({
    status: 'success',
    data: finalInvoice
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
   5. CHECK STOCK (No Changes Needed)
====================================================== */
exports.checkStock = catchAsync(async (req, res, next) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) { return next(new AppError('Items are required', 400));  }
  const validation = await StockValidationService.validateSale(items,req.user.branchId,req.user.organizationId  );

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
    if (!invoice) { throw new AppError('Draft invoice not found', 404);
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

exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).populate(['customerId', 'branchId']);
  if (!invoice) return next(new AppError('Invoice not found', 404));
  const buffer = await invoicePDFService.generateInvoicePDF(invoice);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=invoice_${invoice.invoiceNumber}.pdf` });
  res.send(buffer);
});


module.exports = exports;


// // --- VALIDATION SCHEMA ---
// const createInvoiceSchema = z.object({
//   customerId: z.string().min(1, "Customer ID is required"),
//   items: z.array(z.object({
//     productId: z.string().min(1, "Product ID is required"),
//     quantity: z.number().positive("Quantity must be positive"),
//     price: z.number().nonnegative("Price cannot be negative"),
//     tax: z.number().optional().default(0),
//     discount: z.number().optional().default(0),
//     hsnCode: z.string().optional()
//   })).min(1, "Invoice must have at least one item"),

//   invoiceNumber: z.string().optional(),
//   invoiceDate: z.union([z.string(), z.date()]).optional(),
//   dueDate: z.union([z.string(), z.date()]).optional(),

//   // Payment fields
//   paidAmount: z.coerce.number().min(0, "Paid amount cannot be negative").optional().default(0),
//   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
//   referenceNumber: z.string().optional(),
//   transactionId: z.string().optional(),

//   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
//   shippingCharges: z.coerce.number().min(0).optional().default(0),
//   notes: z.string().optional(),
//   roundOff: z.number().optional(),
//   gstType: z.string().optional(),
//   attachedFiles: z.array(z.string()).optional()
// });

// // --- HELPER: Get or Init Account ---
// async function getOrInitAccount(orgId, type, name, code, session) {
//   // Try to find existing account
//   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  
//   if (!account) {
//     try {
//         // Create if missing
//         const newAccounts = await Account.create([{
//             organizationId: orgId, 
//             name, 
//             code, 
//             type, 
//             isGroup: false, 
//             cachedBalance: 0
//         }], { session });
//         account = newAccounts[0];
//     } catch (err) {
//         // Handle race condition
//         if (err.code === 11000) {
//             account = await Account.findOne({ organizationId: orgId, code }).session(session);
//         } else {
//             throw err;
//         }
//     }
//   }
//   return account;
// }

// // --- HELPER: Create Payment Accounting Entries ---
// async function createPaymentAccountingEntries({ invoice, payment, userId, session }) {
//   if (!payment || !payment.amount || payment.amount <= 0) {
//     console.warn('[ACCOUNTING] Skipping payment entries: Invalid amount');
//     return;
//   }

//   // 1. Determine Asset Account (Cash/Bank)
//   let accountName = 'Cash';
//   let accountCode = '1001';

//   switch (payment.paymentMethod) {
//     case 'bank':
//     case 'cheque':
//       accountName = 'Bank';
//       accountCode = '1002';
//       break;
//     case 'upi':
//       accountName = 'UPI Receivables';
//       accountCode = '1003';
//       break;
//     case 'card':
//       accountName = 'Card Receivables';
//       accountCode = '1004';
//       break;
//   }

//   // 2. Get Accounts
//   const [assetAccount, arAccount] = await Promise.all([
//     getOrInitAccount(invoice.organizationId, 'asset', accountName, accountCode, session),
//     getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session)
//   ]);

//   // 3. Create Ledger Entries
//   // Dr Asset (Cash/Bank) -> Money coming in
//   await AccountEntry.create([{
//     organizationId: invoice.organizationId,
//     branchId: invoice.branchId,
//     accountId: assetAccount._id,
//     date: payment.paymentDate,
//     debit: payment.amount,
//     credit: 0,
//     description: `Payment for ${invoice.invoiceNumber}`,
//     referenceType: 'payment',
//     referenceId: invoice._id,
//     paymentId: payment._id,
//     createdBy: userId
//   }], { session });

//   // Cr Accounts Receivable -> Reducing what customer owes
//   await AccountEntry.create([{
//     organizationId: invoice.organizationId,
//     branchId: invoice.branchId,
//     accountId: arAccount._id,
//     customerId: invoice.customerId,
//     date: payment.paymentDate,
//     debit: 0,
//     credit: payment.amount,
//     description: `Payment applied to ${invoice.invoiceNumber}`,
//     referenceType: 'payment',
//     referenceId: invoice._id,
//     paymentId: payment._id,
//     createdBy: userId
//   }], { session });
// }

// // --- HELPER: Reduce Stock ---
// async function reduceStockForInvoice(items, branchId, organizationId, session) {
//   for (const item of items) {
//     const updateResult = await Product.findOneAndUpdate(
//       { 
//           _id: item.productId, 
//           organizationId: organizationId,
//           "inventory.branchId": branchId,
//           "inventory.quantity": { $gte: item.quantity } 
//       },
//       { 
//           $inc: { "inventory.$.quantity": -item.quantity },
//           $set: { lastSold: new Date() }
//       },
//       { session, new: true }
//     );

//     if (!updateResult) {
//        const product = await Product.findById(item.productId).session(session);
//        if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
//        const inv = product.inventory?.find(i => String(i.branchId) === String(branchId));
//        throw new AppError(`Insufficient stock for ${product.name}. Available: ${inv?.quantity || 0}`, 400);
//     }
//   }
// }


// // --- CONTROLLER: CREATE INVOICE ---
// exports.createInvoice = catchAsync(async (req, res, next) => {
//   // 1. Validation
//   const validatedData = createInvoiceSchema.safeParse(req.body);
//   if (!validatedData.success) {
//     const errorMessage = validatedData.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
//     return next(new AppError(errorMessage, 400));
//   }

//   // 2. Pre-transaction: Enrich Items & Calc Totals
//   const enrichedItems = await Promise.all(req.body.items.map(async (item) => {
//     const product = await Product.findOne({ _id: item.productId, organizationId: req.user.organizationId }).select('name sku inventory');
//     if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
    
//     // Quick stock check
//     const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
//     if (!inv || inv.quantity < item.quantity) throw new AppError(`Insufficient stock for ${product.name}`, 400);

//     return { ...item, name: product.name, hsnCode: product.sku || item.hsnCode || "" };
//   }));

//   const subtotal = enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//   const shippingCharges = req.body.shippingCharges || 0;
//   const discount = req.body.discount || 0;
//   const tax = req.body.tax || 0;
//   const roundOff = req.body.roundOff || 0;
//   const grandTotal = Math.round(subtotal + shippingCharges + tax - discount + roundOff);
//   const paidAmount = req.body.paidAmount || 0;

//   if (paidAmount > grandTotal) return next(new AppError('Paid amount exceeds total', 400));

//   // 3. Pre-fetch AR Account (Optimization)
//   // Ensures account exists before transaction starts to avoid conflicts
//   await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200');

//   const invoiceNumber = req.body.invoiceNumber || `INV-${Date.now()}`; 

//   // 4. Transaction
//   await runInTransaction(async (session) => {
    
//     // Status Logic
//     let paymentStatus = 'unpaid';
//     let status = req.body.status || 'issued';
//     if (paidAmount > 0) {
//         if (paidAmount >= grandTotal) { paymentStatus = 'paid'; status = 'paid'; }
//         else { paymentStatus = 'partial'; }
//     }

//     // A. Create Invoice
//     const invoice = (await Invoice.create([{
//       ...req.body,
//       invoiceNumber,
//       items: enrichedItems,
//       subTotal: subtotal,
//       grandTotal,
//       balanceAmount: grandTotal - paidAmount,
//       paidAmount,
//       paymentStatus,
//       status,
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       createdBy: req.user._id
//     }], { session }))[0];

//     // B. Reduce Stock
//     await reduceStockForInvoice(req.body.items, req.user.branchId, req.user.organizationId, session);

//     // C. Process Payment (If Paid)
//     if (paidAmount > 0) {
//         // ⚠️ CRITICAL FIX: Extract [0] from create result
//         const payment = (await Payment.create([{
//             organizationId: req.user.organizationId,
//             branchId: req.user.branchId,
//             type: 'inflow',
//             customerId: invoice.customerId,
//             invoiceId: invoice._id,
//             paymentDate: req.body.invoiceDate || new Date(),
//             amount: paidAmount,
//             paymentMethod: req.body.paymentMethod || 'cash',
//             transactionMode: 'auto',
//             referenceNumber: req.body.referenceNumber,
//             transactionId: req.body.transactionId,
//             remarks: `Payment for ${invoice.invoiceNumber}`,
//             status: 'completed',
//             allocationStatus: 'fully_allocated',
//             remainingAmount: 0, 
//             allocatedTo: [{
//                 type: 'invoice',
//                 documentId: invoice._id,
//                 amount: paidAmount,
//                 allocatedAt: new Date()
//             }],
//             createdBy: req.user._id
//         }], { session }))[0]; // <--- THIS [0] IS KEY

//         // D. Create Payment Accounting Entries
//         await createPaymentAccountingEntries({
//             invoice,
//             payment, // Now passing a valid document, not an array
//             userId: req.user._id,
//             session
//         });
//     }

//     // E. Update Customer
//     if (invoice.customerId) {
//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         {
//           $inc: {
//             totalPurchases: grandTotal,
//             outstandingBalance: grandTotal - paidAmount
//           },
//           lastPurchaseDate: new Date()
//         },
//         { session }
//       );
//     }

//     // F. Post Invoice Journal (Revenue Recognition)
//     // Dr AR, Cr Sales
//     if (invoice.status !== 'draft') {
//       await salesJournalService.postInvoiceJournal({
//         orgId: req.user.organizationId,
//         branchId: req.user.branchId,
//         invoice,
//         customerId: invoice.customerId,
//         items: invoice.items,
//         userId: req.user._id,
//         session
//       });
//       await SalesService.createFromInvoiceTransactional(invoice, session);
//     }

//     // Store for response
//     req.invoice = invoice;

//   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

//   // 5. Post-Response
//   const finalInvoice = req.invoice;
//   automationService.triggerEvent('invoice.created', finalInvoice.toObject(), req.user.organizationId);
//   emitToOrg(req.user.organizationId, 'invoice:created', finalInvoice);

//   res.status(201).json({ status: 'success', data: finalInvoice });
// });





  // // 2. Pre-transaction: Enrich Items & Calc Totals (Reads OUTSIDE transaction to prevent WriteConflict)
  // const enrichedItems = await Promise.all(req.body.items.map(async (item) => {
  //   const product = await Product.findOne({ _id: item.productId, organizationId: req.user.organizationId }).select('name sku inventory hsnCode category');
  //   if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
    
  //   // Quick stock check
  //   const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
  //   if (!inv || inv.quantity < item.quantity) throw new AppError(`Insufficient stock for ${product.name}`, 400);

  //   return { 
  //       ...item, 
  //       name: product.name, 
  //       hsnCode: product.hsnCode || product.sku || item.hsnCode || "",
  //       unit: item.unit || 'pcs',
  //       discount: item.discount || 0,
  //       // Fix: Map either tax or taxRate to taxRate
  //       taxRate: item.taxRate || item.tax || 0,
  //       // Defaults for schema compliance
  //       reminderSent: false,
  //       overdueNoticeSent: false,
  //       overdueCount: 0
  //   };
  // }));


  
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

/* ======================================================
   1. CREATE INVOICE WITH STOCK REDUCTION (FIXED)
====================================================== */
// exports.createInvoice = catchAsync(async (req, res, next) => {
//   let invoice;

//   const validatedData = createInvoiceSchema.safeParse(req.body);
//   if (!validatedData.success) {
//     return next(new AppError(validatedData.error.errors[0].message, 400));
//   }

//   await runInTransaction(async (session) => {
//     const stockValidation = await StockValidationService.validateSale(
//       req.body.items,
//       req.user.branchId,
//       req.user.organizationId,
//       session
//     );

//     if (!stockValidation.isValid) {
//       throw new AppError(
//         `Stock validation failed: ${stockValidation.errors.join(', ')}`,
//         400
//       );
//     }

//     // --- FIX START: Enrich Items with Name from DB ---
//     // The frontend sends IDs/Prices but usually no names. We fetch them here.
//     const enrichedItems = [];
//     for (const item of req.body.items) {
//       const product = await Product.findOne({
//         _id: item.productId,
//         organizationId: req.user.organizationId
//       }).session(session);

//       if (!product) {
//         throw new AppError(`Product ${item.productId} not found`, 404);
//       }

//       enrichedItems.push({
//         ...item,
//         name: product.name, // MANDATORY FIELD
//         hsnCode: product.sku || item.hsnCode || ""
//       });
//     }
//     // --- FIX END ---

//     // 2. CREATE INVOICE (Use enrichedItems instead of req.body.items)
//     invoice = (await Invoice.create([{
//       ...req.body,
//       items: enrichedItems, // <--- Corrected here
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       createdBy: req.user._id
//     }], { session }))[0];

//     // 3. REDUCE STOCK
//     await reduceStockForInvoice(
//       req.body.items, // Original items array is fine for stock reduction logic
//       req.user.branchId,
//       req.user.organizationId,
//       session
//     );

//     // 4. UPDATE CUSTOMER STATISTICS
//     if (invoice.customerId) {
//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         {
//           $inc: {
//             totalPurchases: invoice.grandTotal,
//             outstandingBalance: invoice.grandTotal - (invoice.paidAmount || 0)
//           },
//           lastPurchaseDate: new Date()
//         },
//         { session }
//       );
//     }

//     // 5. POST ACCOUNTING JOURNAL ENTRIES (if not draft)
//     if (invoice.status !== 'draft') {
//       await salesJournalService.postInvoiceJournal({
//         orgId: req.user.organizationId,
//         branchId: req.user.branchId,
//         invoice,
//         customerId: invoice.customerId,
//         items: invoice.items,
//         userId: req.user._id,
//         session
//       });

//       // 6. CREATE SALES RECORD
//       try {
//         await SalesService.createFromInvoiceTransactional(invoice, session);
//       } catch (salesError) {
//         console.warn('Failed to create sales record:', salesError.message);
//       }
//     }

//     // 7. CREATE AUDIT LOG
//     await InvoiceAudit.create([{
//       invoiceId: invoice._id,
//       action: 'CREATE',
//       performedBy: req.user._id,
//       details: `Invoice ${invoice.invoiceNumber} created with ${invoice.items.length} items`,
//       ipAddress: req.ip
//     }], { session });
//   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

//   // Post-transaction actions
//   automationService.triggerEvent(
//     'invoice.created',
//     invoice.toObject(),
//     req.user.organizationId
//   );

//   emitToOrg(req.user.organizationId, 'invoice:created', {
//     invoiceId: invoice._id,
//     invoiceNumber: invoice.invoiceNumber,
//     customerId: invoice.customerId,
//     amount: invoice.grandTotal
//   });

//   res.status(201).json({
//     status: 'success',
//     data: invoice
//   });
// });


// const mongoose = require("mongoose");
// const { z } = require("zod");
// const { format } = require('fast-csv');
// const { invalidateOpeningBalance } = require("../../core/ledgerCache.service");
// const ProfitCalculator = require('../utils/profitCalculator');

// const Invoice = require("../invoice.model");
// const Payment = require("../../payments/payment.model");
// const Product = require("../../../inventory/core/product.model");
// const Customer = require("../../../organization/core/customer.model");
// const AccountEntry = require('../../core/accountEntry.model');
// const Account = require('../../core/account.model');
// const Organization = require("../../../organization/core/organization.model");
// const InvoiceAudit = require('../invoiceAudit.model');

// const SalesService = require("../../../inventory/core/sales.service");
// const invoicePDFService = require("../../../_legacy/services/invoicePDFService");
// const StockValidationService = require("../../../_legacy/services/stockValidationService");
// const { createNotification } = require("../../../notification/core/notification.service");
// // CHANGED: Import the whole service to access reverseInvoiceJournal
// const salesJournalService = require('../../../inventory/core/salesJournal.service');

// const catchAsync = require("../../../../core/utils/catchAsync");
// const AppError = require("../../../../core/utils/appError");
// const factory = require("../../../../core/utils/handlerFactory");
// const { runInTransaction } = require("../../../../core/utils/runInTransaction");
// const { emitToOrg } = require("../../../../core/utils/_legacy/socket");
// const automationService = require('../../../_legacy/services/automationService');

// /* ======================================================
//    STOCK RESTORATION HELPER FUNCTION
// ====================================================== */
// async function restoreStockFromInvoice(items, branchId, organizationId, session) {
//   for (const item of items) {
//     await Product.findOneAndUpdate(
//       {
//         _id: item.productId,
//         organizationId,
//         "inventory.branchId": branchId
//       },
//       { $inc: { "inventory.$.quantity": item.quantity } },
//       { session }
//     );
//   }
// }

// // // --- VALIDATION SCHEMA ---
// // const createInvoiceSchema = z.object({
// //   customerId: z.string().min(1, "Customer ID is required"),
// //   items: z.array(z.object({
// //     productId: z.string().min(1, "Product ID is required"),
// //     quantity: z.number().positive("Quantity must be positive"),
// //     price: z.number().nonnegative("Price cannot be negative"),
// //     // Allow 'tax' or 'taxRate'
// //     tax: z.number().optional().default(0),
// //     taxRate: z.number().optional().default(0),
// //     discount: z.number().optional().default(0),
// //     unit: z.string().optional().default('pcs'),
// //     hsnCode: z.string().optional()
// //   })).min(1, "Invoice must have at least one item"),

// //   invoiceNumber: z.string().optional(),
// //   invoiceDate: z.union([z.string(), z.date()]).optional(),
// //   dueDate: z.union([z.string(), z.date()]).optional(),

// //   // Payment fields
// //   paidAmount: z.coerce.number().min(0, "Paid amount cannot be negative").optional().default(0),
// //   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
// //   // Support both fields
// //   referenceNumber: z.string().optional(),
// //   paymentReference: z.string().optional(),
// //   transactionId: z.string().optional(),

// //   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
// //   shippingCharges: z.coerce.number().min(0).optional().default(0),
// //   notes: z.string().optional(),
// //   roundOff: z.number().optional(),
// //   gstType: z.string().optional(),
// //   attachedFiles: z.array(z.string()).optional()
// // });
// const createInvoiceSchema = z.object({
//   customerId: z.string().min(1, "Customer ID is required"),
//   items: z.array(z.object({
//     productId: z.string().min(1, "Product ID is required"),
//     quantity: z.number().positive("Quantity must be positive"),
//     price: z.number().nonnegative("Price cannot be negative"), // Selling Price
    
//     // 🟢 ADDED: This will be populated by the backend, not the user
//     purchasePriceAtSale: z.number().nonnegative().optional(), 
    
//     tax: z.number().optional().default(0),
//     taxRate: z.number().optional().default(0),
//     discount: z.number().optional().default(0),
//     unit: z.string().optional().default('pcs'),
//     hsnCode: z.string().optional()
//   })).min(1, "Invoice must have at least one item"),

//   invoiceNumber: z.string().optional(),
//   invoiceDate: z.union([z.string(), z.date()]).optional(),
//   dueDate: z.union([z.string(), z.date()]).optional(),

//   paidAmount: z.coerce.number().min(0).optional().default(0),
//   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
//   referenceNumber: z.string().optional(),
//   paymentReference: z.string().optional(),
//   transactionId: z.string().optional(),

//   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
//   shippingCharges: z.coerce.number().min(0).optional().default(0),
//   notes: z.string().optional(),
//   roundOff: z.number().optional(),
//   gstType: z.string().optional(),
//   attachedFiles: z.array(z.string()).optional()
// });
// // --- HELPER: Get or Init Account ---
// async function getOrInitAccount(orgId, type, name, code, session) {
//   // Try to find existing account (using session if provided)
//   const query = Account.findOne({ organizationId: orgId, code });
//   if (session) query.session(session);
  
//   let account = await query;
  
//   if (!account) {
//     try {
//         // Create if missing
//         const newAccounts = await Account.create([{
//             organizationId: orgId, 
//             name, 
//             code, 
//             type, 
//             isGroup: false, 
//             cachedBalance: 0
//         }], { session }); // Pass session if it exists, otherwise undefined is fine
//         account = newAccounts[0];
//     } catch (err) {
//         // Handle race condition
//         if (err.code === 11000) {
//             const retryQuery = Account.findOne({ organizationId: orgId, code });
//             if (session) retryQuery.session(session);
//             account = await retryQuery;
//         } else {
//             throw err;
//         }
//     }
//   }
//   return account;
// }

// // --- HELPER: Create Payment Accounting Entries ---
// async function createPaymentAccountingEntries({ invoice, payment, userId, session }) {
//   if (!payment || !payment.amount || payment.amount <= 0) {
//     console.warn('[ACCOUNTING] Skipping payment entries: Invalid amount');
//     return;
//   }

//   // 1. Determine Asset Account (Cash/Bank)
//   let accountName = 'Cash';
//   let accountCode = '1001';

//   switch (payment.paymentMethod) {
//     case 'bank':
//     case 'cheque':
//       accountName = 'Bank';
//       accountCode = '1002';
//       break;
//     case 'upi':
//       accountName = 'UPI Receivables';
//       accountCode = '1003';
//       break;
//     case 'card':
//       accountName = 'Card Receivables';
//       accountCode = '1004';
//       break;
//   }

//   // 2. Get Accounts (Passed session to ensure consistency inside transaction)
//   const [assetAccount, arAccount] = await Promise.all([
//     getOrInitAccount(invoice.organizationId, 'asset', accountName, accountCode, session),
//     getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session)
//   ]);

//   // 3. Create Ledger Entries
//   // Dr Asset (Cash/Bank) -> Money coming in
//   await AccountEntry.create([{
//     organizationId: invoice.organizationId,
//     branchId: invoice.branchId,
//     accountId: assetAccount._id,
//     date: payment.paymentDate,
//     debit: payment.amount,
//     credit: 0,
//     description: `Payment for ${invoice.invoiceNumber}`,
//     referenceType: 'payment',
//     referenceId: invoice._id,
//     paymentId: payment._id,
//     createdBy: userId
//   }], { session });

//   // Cr Accounts Receivable -> Reducing what customer owes
//   await AccountEntry.create([{
//     organizationId: invoice.organizationId,
//     branchId: invoice.branchId,
//     accountId: arAccount._id,
//     customerId: invoice.customerId,
//     date: payment.paymentDate,
//     debit: 0,
//     credit: payment.amount,
//     description: `Payment applied to ${invoice.invoiceNumber}`,
//     referenceType: 'payment',
//     referenceId: invoice._id,
//     paymentId: payment._id,
//     createdBy: userId
//   }], { session });
// }

// // --- HELPER: Reduce Stock ---
// async function reduceStockForInvoice(items, branchId, organizationId, session) {
//   for (const item of items) {
//     const updateResult = await Product.findOneAndUpdate(
//       { 
//           _id: item.productId, 
//           organizationId: organizationId,
//           "inventory.branchId": branchId,
//           "inventory.quantity": { $gte: item.quantity } 
//       },
//       { 
//           $inc: { "inventory.$.quantity": -item.quantity },
//           $set: { lastSold: new Date() }
//       },
//       { session, new: true }
//     );

//     if (!updateResult) {
//        const product = await Product.findById(item.productId).session(session);
//        if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
//        const inv = product.inventory?.find(i => String(i.branchId) === String(branchId));
//        throw new AppError(`Insufficient stock for ${product.name}. Available: ${inv?.quantity || 0}`, 400);
//     }
//   }
// }

// // --- CONTROLLER: CREATE INVOICE ---
// exports.createInvoice = catchAsync(async (req, res, next) => {
//   // 1. Validation
//   const validatedData = createInvoiceSchema.safeParse(req.body);
//   if (!validatedData.success) {
//     const errorMessage = validatedData.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
//     return next(new AppError(errorMessage, 400));
//   }

//   // // 2. Pre-transaction: Enrich Items & Calc Totals (Reads OUTSIDE transaction to prevent WriteConflict)
//   // const enrichedItems = await Promise.all(req.body.items.map(async (item) => {
//   //   const product = await Product.findOne({ _id: item.productId, organizationId: req.user.organizationId }).select('name sku inventory hsnCode category');
//   //   if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
    
//   //   // Quick stock check
//   //   const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
//   //   if (!inv || inv.quantity < item.quantity) throw new AppError(`Insufficient stock for ${product.name}`, 400);

//   //   return { 
//   //       ...item, 
//   //       name: product.name, 
//   //       hsnCode: product.hsnCode || product.sku || item.hsnCode || "",
//   //       unit: item.unit || 'pcs',
//   //       discount: item.discount || 0,
//   //       // Fix: Map either tax or taxRate to taxRate
//   //       taxRate: item.taxRate || item.tax || 0,
//   //       // Defaults for schema compliance
//   //       reminderSent: false,
//   //       overdueNoticeSent: false,
//   //       overdueCount: 0
//   //   };
//   // }));

// const enrichedItems = await Promise.all(req.body.items.map(async (item) => {
//   // 🟢 CORRECTION: Add 'purchasePrice' to the select string
//   const product = await Product.findOne({ 
//     _id: item.productId, 
//     organizationId: req.user.organizationId 
//   }).select('name sku inventory hsnCode category purchasePrice'); // Added purchasePrice
  
//   if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
  
//   const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
//   if (!inv || inv.quantity < item.quantity) throw new AppError(`Insufficient stock for ${product.name}`, 400);

//   return { 
//       ...item, 
//       name: product.name, 
//       hsnCode: product.hsnCode || product.sku || item.hsnCode || "",
//       unit: item.unit || 'pcs',
//       discount: item.discount || 0,
//       taxRate: item.taxRate || item.tax || 0,
      
//       // 🟢 THE KEY SNAPSHOT: Save the current cost price forever
//       purchasePriceAtSale: product.purchasePrice || 0, 
      
//       reminderSent: false,
//       overdueNoticeSent: false,
//       overdueCount: 0
//   };
// }));

//   const subtotal = enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
//   const shippingCharges = req.body.shippingCharges || 0;
//   const discount = req.body.discount || 0;
  
//   // Calc tax based on taxRate
//   const tax = enrichedItems.reduce((sum, item) => {
//       const lineTotal = item.price * item.quantity - (item.discount || 0);
//       return sum + ((item.taxRate || 0) / 100 * lineTotal);
//   }, 0);
  
//   const roundOff = req.body.roundOff || 0;
//   const grandTotal = Math.round(subtotal + shippingCharges + tax - discount + roundOff);
//   const paidAmount = req.body.paidAmount || 0;

//   if (paidAmount > grandTotal) return next(new AppError('Paid amount exceeds total', 400));

//   // 3. Pre-fetch AR Account (Optimization)
//   // Ensures account exists before transaction starts to avoid conflicts
//   await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200');

//   const invoiceNumber = req.body.invoiceNumber || `INV-${Date.now()}`; 

//   // 4. Transaction
//   await runInTransaction(async (session) => {
    
//     // Status Logic
//     let paymentStatus = 'unpaid';
//     let status = req.body.status || 'issued';
//     if (paidAmount > 0) {
//         if (paidAmount >= grandTotal) { paymentStatus = 'paid'; status = 'paid'; }
//         else { paymentStatus = 'partial'; }
//     }

//     // A. Create Invoice
//     const invoice = (await Invoice.create([{
//       ...req.body,
//       invoiceNumber,
//       items: enrichedItems,
//       subTotal: subtotal,
//       grandTotal,
//       balanceAmount: grandTotal - paidAmount,
//       paidAmount,
//       paymentStatus,
//       status,
//       // References
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       customerId: req.body.customerId,
//       createdBy: req.user._id,
      
//       // Map payment reference if exists
//       paymentReference: req.body.paymentReference || req.body.referenceNumber,
//       transactionId: req.body.transactionId
//     }], { session }))[0];

//     // B. Reduce Stock
//     await reduceStockForInvoice(req.body.items, req.user.branchId, req.user.organizationId, session);

//     // C. Process Payment (If Paid)
//     if (paidAmount > 0) {
//         // ⚠️ CRITICAL FIX: Extract [0] from create result
//         const payment = (await Payment.create([{
//             organizationId: req.user.organizationId,
//             branchId: req.user.branchId,
//             type: 'inflow',
//             customerId: invoice.customerId,
//             invoiceId: invoice._id,
//             paymentDate: req.body.invoiceDate || new Date(),
//             amount: paidAmount,
//             paymentMethod: req.body.paymentMethod || 'cash',
//             transactionMode: 'auto',
//             // Fix: Use the correct reference field
//             referenceNumber: req.body.paymentReference || req.body.referenceNumber,
//             transactionId: req.body.transactionId,
//             remarks: `Payment for ${invoice.invoiceNumber}`,
//             status: 'completed',
//             allocationStatus: 'fully_allocated',
//             remainingAmount: 0, 
//             allocatedTo: [{
//                 type: 'invoice',
//                 documentId: invoice._id,
//                 amount: paidAmount,
//                 allocatedAt: new Date()
//             }],
//             createdBy: req.user._id
//         }], { session }))[0]; // <--- THIS [0] IS KEY

//         // D. Create Payment Accounting Entries
//         await createPaymentAccountingEntries({
//             invoice,
//             payment, // Now passing a valid document, not an array
//             userId: req.user._id,
//             session
//         });
//     }

//     // E. Update Customer
//     if (invoice.customerId) {
//       await Customer.findByIdAndUpdate(
//         invoice.customerId,
//         {
//           $inc: {
//             totalPurchases: grandTotal,
//             outstandingBalance: grandTotal - paidAmount
//           },
//           lastPurchaseDate: new Date()
//         },
//         { session }
//       );
//     }

//     // F. Post Invoice Journal (Revenue Recognition)
//     // Dr AR, Cr Sales
//     if (invoice.status !== 'draft') {
//       await salesJournalService.postInvoiceJournal({
//         orgId: req.user.organizationId,
//         branchId: req.user.branchId,
//         invoice,
//         customerId: invoice.customerId,
//         items: invoice.items,
//         userId: req.user._id,
//         session
//       });
//       await SalesService.createFromInvoiceTransactional(invoice, session);
//     }

//     // Store for response
//     req.invoice = invoice;

//   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

//   // 5. Post-Response
//   const finalInvoice = req.invoice;
//   automationService.triggerEvent('invoice.created', finalInvoice.toObject(), req.user.organizationId);
//   emitToOrg(req.user.organizationId, 'invoice:created', finalInvoice);

//   res.status(201).json({ status: 'success', data: finalInvoice });
// });

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

// /* ======================================================
//    1. CREATE INVOICE WITH STOCK REDUCTION (FIXED)
// ====================================================== */
// // exports.createInvoice = catchAsync(async (req, res, next) => {
// //   let invoice;

// //   const validatedData = createInvoiceSchema.safeParse(req.body);
// //   if (!validatedData.success) {
// //     return next(new AppError(validatedData.error.errors[0].message, 400));
// //   }

// //   await runInTransaction(async (session) => {
// //     const stockValidation = await StockValidationService.validateSale(
// //       req.body.items,
// //       req.user.branchId,
// //       req.user.organizationId,
// //       session
// //     );

// //     if (!stockValidation.isValid) {
// //       throw new AppError(
// //         `Stock validation failed: ${stockValidation.errors.join(', ')}`,
// //         400
// //       );
// //     }

// //     // --- FIX START: Enrich Items with Name from DB ---
// //     // The frontend sends IDs/Prices but usually no names. We fetch them here.
// //     const enrichedItems = [];
// //     for (const item of req.body.items) {
// //       const product = await Product.findOne({
// //         _id: item.productId,
// //         organizationId: req.user.organizationId
// //       }).session(session);

// //       if (!product) {
// //         throw new AppError(`Product ${item.productId} not found`, 404);
// //       }

// //       enrichedItems.push({
// //         ...item,
// //         name: product.name, // MANDATORY FIELD
// //         hsnCode: product.sku || item.hsnCode || ""
// //       });
// //     }
// //     // --- FIX END ---

// //     // 2. CREATE INVOICE (Use enrichedItems instead of req.body.items)
// //     invoice = (await Invoice.create([{
// //       ...req.body,
// //       items: enrichedItems, // <--- Corrected here
// //       organizationId: req.user.organizationId,
// //       branchId: req.user.branchId,
// //       createdBy: req.user._id
// //     }], { session }))[0];

// //     // 3. REDUCE STOCK
// //     await reduceStockForInvoice(
// //       req.body.items, // Original items array is fine for stock reduction logic
// //       req.user.branchId,
// //       req.user.organizationId,
// //       session
// //     );

// //     // 4. UPDATE CUSTOMER STATISTICS
// //     if (invoice.customerId) {
// //       await Customer.findByIdAndUpdate(
// //         invoice.customerId,
// //         {
// //           $inc: {
// //             totalPurchases: invoice.grandTotal,
// //             outstandingBalance: invoice.grandTotal - (invoice.paidAmount || 0)
// //           },
// //           lastPurchaseDate: new Date()
// //         },
// //         { session }
// //       );
// //     }

// //     // 5. POST ACCOUNTING JOURNAL ENTRIES (if not draft)
// //     if (invoice.status !== 'draft') {
// //       await salesJournalService.postInvoiceJournal({
// //         orgId: req.user.organizationId,
// //         branchId: req.user.branchId,
// //         invoice,
// //         customerId: invoice.customerId,
// //         items: invoice.items,
// //         userId: req.user._id,
// //         session
// //       });

// //       // 6. CREATE SALES RECORD
// //       try {
// //         await SalesService.createFromInvoiceTransactional(invoice, session);
// //       } catch (salesError) {
// //         console.warn('Failed to create sales record:', salesError.message);
// //       }
// //     }

// //     // 7. CREATE AUDIT LOG
// //     await InvoiceAudit.create([{
// //       invoiceId: invoice._id,
// //       action: 'CREATE',
// //       performedBy: req.user._id,
// //       details: `Invoice ${invoice.invoiceNumber} created with ${invoice.items.length} items`,
// //       ipAddress: req.ip
// //     }], { session });
// //   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

// //   // Post-transaction actions
// //   automationService.triggerEvent(
// //     'invoice.created',
// //     invoice.toObject(),
// //     req.user.organizationId
// //   );

// //   emitToOrg(req.user.organizationId, 'invoice:created', {
// //     invoiceId: invoice._id,
// //     invoiceNumber: invoice.invoiceNumber,
// //     customerId: invoice.customerId,
// //     amount: invoice.grandTotal
// //   });

// //   res.status(201).json({
// //     status: 'success',
// //     data: invoice
// //   });
// // });

// /* ======================================================
//    2. UPDATE INVOICE WITH STOCK MANAGEMENT (REFACTORED)
// ====================================================== */
// exports.updateInvoice = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const updates = req.body;
//   let updatedInvoice;

//   await runInTransaction(async (session) => {
//     const oldInvoice = await Invoice.findOne({
//       _id: id,
//       organizationId: req.user.organizationId
//     }).session(session);

//     if (!oldInvoice) throw new AppError('Invoice not found', 404);
//     if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice', 400);

//     // If Draft: Simple Update (no stock changes)
//     if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
//       updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });

//       await InvoiceAudit.create([{
//         invoiceId: oldInvoice._id,
//         action: 'UPDATE_DRAFT',
//         performedBy: req.user._id,
//         details: 'Draft invoice updated',
//         ipAddress: req.ip
//       }], { session });

//       return;
//     }

//     // If invoice has been issued and we're updating items: REVERSE EVERYTHING Logic
//     const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;

//     if (needsFinancialUpdate) {
//       // A. RESTORE OLD STOCK (Put items back on shelf)
//       await restoreStockFromInvoice(
//         oldInvoice.items,
//         oldInvoice.branchId,
//         req.user.organizationId,
//         session
//       );

//       // B. VALIDATE NEW STOCK AVAILABILITY
//       if (updates.items) {
//         const stockValidation = await StockValidationService.validateSale(
//           updates.items,
//           oldInvoice.branchId,
//           req.user.organizationId,
//           session
//         );

//         if (!stockValidation.isValid) {
//           throw new AppError(
//             `Stock validation failed: ${stockValidation.errors.join(', ')}`,
//             400
//           );
//         }
//       }

//       // C. REDUCE NEW STOCK (Take items from shelf)
//       const newItems = updates.items || oldInvoice.items;
//       await reduceStockForInvoice(
//         newItems,
//         oldInvoice.branchId,
//         req.user.organizationId,
//         session
//       );

//       // D. ENRICH ITEMS WITH PRODUCT DETAILS
//       const enrichedItems = [];
//       for (const item of newItems) {
//         const product = await Product.findById(item.productId).session(session);
//         enrichedItems.push({
//           ...item,
//           name: product.name,
//           sku: product.sku
//         });
//       }
//       updates.items = enrichedItems;

//       // E. DELETE OLD ACCOUNTING ENTRIES
//       await AccountEntry.deleteMany({
//         invoiceId: oldInvoice._id,
//         referenceType: 'invoice'
//       }, { session });

//       // F. UPDATE CUSTOMER BALANCE (Remove old amount)
//       await Customer.findByIdAndUpdate(
//         oldInvoice.customerId,
//         { $inc: { outstandingBalance: -oldInvoice.grandTotal } },
//         { session }
//       );
//     }

//     // G. SAVE UPDATED INVOICE (recalculates totals)
//     Object.assign(oldInvoice, updates);
//     updatedInvoice = await oldInvoice.save({ session });

//     // H. RE-BOOK ACCOUNTING ENTRIES (REFACTORED: Uses Service)
//     if (needsFinancialUpdate && updatedInvoice.status !== 'draft') {

//       // 1. Post new Journal Entries via Service
//       await salesJournalService.postInvoiceJournal({
//         orgId: req.user.organizationId,
//         branchId: req.user.branchId,
//         invoice: updatedInvoice,
//         customerId: updatedInvoice.customerId,
//         items: updatedInvoice.items,
//         userId: req.user._id,
//         session
//       });

//       // 2. Update Customer Balance (Add new amount)
//       await Customer.findByIdAndUpdate(
//         updatedInvoice.customerId,
//         { $inc: { outstandingBalance: updatedInvoice.grandTotal } },
//         { session }
//       );

//       // 3. Update Sales Record via Service
//       await SalesService.updateFromInvoiceTransactional(updatedInvoice, session);
//     }

//     // I. CREATE AUDIT LOG
//     await InvoiceAudit.create([{
//       invoiceId: updatedInvoice._id,
//       action: needsFinancialUpdate ? 'UPDATE_FINANCIAL' : 'UPDATE_INFO',
//       performedBy: req.user._id,
//       details: needsFinancialUpdate
//         ? `Invoice updated. New Total: ${updatedInvoice.grandTotal}`
//         : 'Non-financial update applied',
//       ipAddress: req.ip
//     }], { session });

//   }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

//   res.status(200).json({
//     status: "success",
//     data: { invoice: updatedInvoice }
//   });
// });

// /* ======================================================
//    3. CANCEL INVOICE WITH STOCK RESTORATION (REFACTORED)
// ====================================================== */
// exports.cancelInvoice = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { reason, restock = true } = req.body;

//   await runInTransaction(async (session) => {
//     const invoice = await Invoice.findOne({
//       _id: id,
//       organizationId: req.user.organizationId
//     }).populate('items.productId').session(session);

//     if (!invoice) throw new AppError('Invoice not found', 404);
//     if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

//     // 1. RESTOCK ITEMS (if requested)
//     if (restock) {
//       await restoreStockFromInvoice(
//         invoice.items,
//         invoice.branchId,
//         req.user.organizationId,
//         session
//       );
//     }

//     // 2. REVERSE CUSTOMER BALANCE
//     await Customer.findByIdAndUpdate(
//       invoice.customerId,
//       {
//         $inc: {
//           totalPurchases: -invoice.grandTotal,
//           outstandingBalance: -invoice.grandTotal
//         }
//       },
//       { session }
//     );

//     // 3. CREATE CREDIT NOTE ENTRIES (REFACTORED: Uses Service)
//     // This replaces ~30 lines of manual AccountEntry creation
//     await salesJournalService.reverseInvoiceJournal({
//       orgId: req.user.organizationId,
//       branchId: invoice.branchId,
//       invoice,
//       userId: req.user._id,
//       session
//     });

//     // 4. UPDATE INVOICE STATUS
//     invoice.status = 'cancelled';
//     invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason} (${new Date().toISOString()})`;
//     await invoice.save({ session });

//     // 5. CANCEL RELATED SALES RECORD (REFACTORED: Uses Service)
//     await SalesService.updateFromInvoiceTransactional(invoice, session);

//     // 6. CREATE AUDIT LOG
//     // await InvoiceAudit.create([{
//     //   invoiceId: invoice._id,
//     //   action: 'CANCEL',
//     //   performedBy: req.user._id,
//     //   details: `Cancelled. Restock: ${restock}. Reason: ${reason}`,
//     //   ipAddress: req.ip
//     // }], { session });
//     await InvoiceAudit.create([{
//       invoiceId: invoice._id,
//       action: 'STATUS_CHANGE',
//       performedBy: req.user._id,
//       details: `Cancelled. Restock: ${restock}. Reason: ${reason}`,
//       ipAddress: req.ip
//     }], { session });
//   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

//   // Emit real-time update
//   emitToOrg(req.user.organizationId, 'invoice:cancelled', {
//     invoiceId: id,
//     invoiceNumber: "Cancelled"
//   });

//   res.status(200).json({
//     status: "success",
//     message: "Invoice cancelled & reversed."
//   });
// });

// /* ======================================================
//    5. CHECK STOCK (No Changes Needed)
// ====================================================== */

// exports.checkStock = catchAsync(async (req, res, next) => {
//   const { items } = req.body;

//   if (!items || !Array.isArray(items) || items.length === 0) {
//     return next(new AppError('Items are required', 400));
//   }

//   const validation = await StockValidationService.validateSale(
//     items,
//     req.user.branchId,
//     req.user.organizationId
//   );

//   const detailedItems = [];
//   for (const item of items) {
//     const product = await Product.findOne({
//       _id: item.productId,
//       organizationId: req.user.organizationId
//     });

//     if (product) {
//       const inventory = product.inventory.find(
//         inv => String(inv.branchId) === String(req.user.branchId)
//       );

//       detailedItems.push({
//         productId: item.productId,
//         name: product.name,
//         sku: product.sku,
//         requestedQuantity: item.quantity,
//         availableStock: inventory?.quantity || 0,
//         price: product.sellingPrice,
//         isAvailable: (inventory?.quantity || 0) >= item.quantity
//       });
//     }
//   }

//   res.status(200).json({
//     status: 'success',
//     data: {
//       isValid: validation.isValid,
//       errors: validation.errors,
//       warnings: validation.warnings,
//       items: detailedItems
//     }
//   });
// });

// /* ======================================================
//    6. CONVERT DRAFT TO ACTIVE INVOICE (Minor Refactor)
// ====================================================== */
// exports.convertDraftToActive = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   await runInTransaction(async (session) => {
//     const invoice = await Invoice.findOne({
//       _id: id,
//       organizationId: req.user.organizationId,
//       status: 'draft'
//     }).session(session);
//     if (!invoice) { throw new AppError('Draft invoice not found', 404);
//     }

//     const stockValidation = await StockValidationService.validateSale(
//       invoice.items,
//       invoice.branchId,
//       req.user.organizationId,
//       session
//     );

//     if (!stockValidation.isValid) {
//       throw new AppError(
//         `Cannot convert draft: ${stockValidation.errors.join(', ')}`,
//         400
//       );
//     }

//     await reduceStockForInvoice(
//       invoice.items,
//       invoice.branchId,
//       req.user.organizationId,
//       session
//     );

//     if (invoice.invoiceNumber.startsWith('DRAFT')) {
//       const lastInvoice = await Invoice.findOne({
//         organizationId: req.user.organizationId,
//         invoiceNumber: { $regex: /^INV-/ }
//       }).sort({ createdAt: -1 }).session(session);

//       let invoiceNumber;
//       if (lastInvoice && lastInvoice.invoiceNumber) {
//         const lastNum = parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0;
//         invoiceNumber = `INV-${String(lastNum + 1).padStart(6, '0')}`;
//       } else {
//         invoiceNumber = `INV-000001`;
//       }

//       invoice.invoiceNumber = invoiceNumber;
//     }

//     invoice.status = 'issued';
//     invoice.invoiceDate = new Date();
//     await invoice.save({ session });

//     await Customer.findByIdAndUpdate(
//       invoice.customerId,
//       {
//         $inc: {
//           totalPurchases: invoice.grandTotal,
//           outstandingBalance: invoice.grandTotal
//         },
//         lastPurchaseDate: new Date()
//       },
//       { session }
//     );

//     // CHANGED: Use Service
//     await salesJournalService.postInvoiceJournal({
//       orgId: req.user.organizationId,
//       branchId: invoice.branchId,
//       invoice,
//       customerId: invoice.customerId,
//       items: invoice.items,
//       userId: req.user._id,
//       session
//     });

//     // CHANGED: Use Service
//     await SalesService.createFromInvoiceTransactional(invoice, session);
//     await InvoiceAudit.create([{
//       invoiceId: invoice._id,
//       action: 'STATUS_CHANGE',
//       performedBy: req.user._id,
//       details: `Draft converted to active invoice ${invoice.invoiceNumber}`,
//       ipAddress: req.ip
//     }], { session });
//   }, 3, { action: "CONVERT_DRAFT", userId: req.user._id });

//   res.status(200).json({
//     status: 'success',
//     message: 'Draft converted to active invoice'
//   });
// });

// /* ======================================================
//    7. GET INVOICE WITH STOCK INFO
// ====================================================== */
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

//   const itemsWithStock = await Promise.all(
//     invoice.items.map(async (item) => {
//       if (item.productId) {
//         const inventory = item.productId.inventory.find(
//           inv => String(inv.branchId) === String(invoice.branchId)
//         );

//         return {
//           ...item.toObject(),
//           currentStock: inventory?.quantity || 0,
//           reorderLevel: inventory?.reorderLevel || 10,
//           willBeLow: inventory?.quantity - item.quantity < (inventory?.reorderLevel || 10)
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

// exports.searchInvoices = catchAsync(async (req, res, next) => {
//   const { query } = req.params;
//   const { limit = 20 } = req.query;
//   const invoices = await Invoice.find({
//     organizationId: req.user.organizationId,
//     $or: [
//       { invoiceNumber: { $regex: query, $options: 'i' } },
//       { 'customerId.name': { $regex: query, $options: 'i' } },
//       { notes: { $regex: query, $options: 'i' } }
//     ],
//     isDeleted: { $ne: true }
//   }).populate('customerId', 'name phone').limit(parseInt(limit)).sort({ invoiceDate: -1 });
//   res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
// });

// exports.getLowStockWarnings = catchAsync(async (req, res, next) => {
//   const invoice = await Invoice.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId
//   }).populate('items.productId');
//   if (!invoice) return next(new AppError('Invoice not found', 404));
//   const warnings = [];
//   for (const item of invoice.items) {
//     if (item.productId) {
//       const inventory = item.productId.inventory.find(inv => String(inv.branchId) === String(invoice.branchId));
//       if (inventory && inventory.reorderLevel && inventory.quantity < inventory.reorderLevel) {
//         warnings.push({
//           productId: item.productId._id,
//           productName: item.productId.name,
//           currentStock: inventory.quantity,
//           reorderLevel: inventory.reorderLevel,
//           message: `${item.productId.name} is below reorder level (${inventory.quantity} < ${inventory.reorderLevel})`
//         });
//       }
//     }
//   }
//   res.status(200).json({ status: 'success', warnings, hasWarnings: warnings.length > 0 });
// });

// exports.getAllInvoices = factory.getAll(Invoice, {
//   populate: [
//     { path: 'customerId', select: 'name phone email' },
//     { path: 'items.productId', select: 'name sku' },
//     { path: 'branchId', select: 'name code' }
//   ]
// });

// exports.getInvoice = factory.getOne(Invoice, {
//   populate: [
//     { path: 'customerId', select: 'name phone email address' },
//     { path: 'items.productId', select: 'name sku sellingPrice' },
//     { path: 'branchId', select: 'name code address' },
//     { path: 'createdBy', select: 'name email' }
//   ]
// });

// exports.deleteInvoice = factory.deleteOne(Invoice);

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


// exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
//   const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId, isDeleted: { $ne: true } }).populate('items.productId', 'name sku').sort({ invoiceDate: -1 });
//   res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
// });

// exports.downloadInvoice = catchAsync(async (req, res, next) => {
//   const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).populate(['customerId', 'branchId']);
//   if (!invoice) return next(new AppError('Invoice not found', 404));
//   const buffer = await invoicePDFService.generateInvoicePDF(invoice);
//   res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=invoice_${invoice.invoiceNumber}.pdf` });
//   res.send(buffer);
// });


// module.exports = exports;


// // // --- VALIDATION SCHEMA ---
// // const createInvoiceSchema = z.object({
// //   customerId: z.string().min(1, "Customer ID is required"),
// //   items: z.array(z.object({
// //     productId: z.string().min(1, "Product ID is required"),
// //     quantity: z.number().positive("Quantity must be positive"),
// //     price: z.number().nonnegative("Price cannot be negative"),
// //     tax: z.number().optional().default(0),
// //     discount: z.number().optional().default(0),
// //     hsnCode: z.string().optional()
// //   })).min(1, "Invoice must have at least one item"),

// //   invoiceNumber: z.string().optional(),
// //   invoiceDate: z.union([z.string(), z.date()]).optional(),
// //   dueDate: z.union([z.string(), z.date()]).optional(),

// //   // Payment fields
// //   paidAmount: z.coerce.number().min(0, "Paid amount cannot be negative").optional().default(0),
// //   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
// //   referenceNumber: z.string().optional(),
// //   transactionId: z.string().optional(),

// //   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
// //   shippingCharges: z.coerce.number().min(0).optional().default(0),
// //   notes: z.string().optional(),
// //   roundOff: z.number().optional(),
// //   gstType: z.string().optional(),
// //   attachedFiles: z.array(z.string()).optional()
// // });

// // // --- HELPER: Get or Init Account ---
// // async function getOrInitAccount(orgId, type, name, code, session) {
// //   // Try to find existing account
// //   let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  
// //   if (!account) {
// //     try {
// //         // Create if missing
// //         const newAccounts = await Account.create([{
// //             organizationId: orgId, 
// //             name, 
// //             code, 
// //             type, 
// //             isGroup: false, 
// //             cachedBalance: 0
// //         }], { session });
// //         account = newAccounts[0];
// //     } catch (err) {
// //         // Handle race condition
// //         if (err.code === 11000) {
// //             account = await Account.findOne({ organizationId: orgId, code }).session(session);
// //         } else {
// //             throw err;
// //         }
// //     }
// //   }
// //   return account;
// // }

// // // --- HELPER: Create Payment Accounting Entries ---
// // async function createPaymentAccountingEntries({ invoice, payment, userId, session }) {
// //   if (!payment || !payment.amount || payment.amount <= 0) {
// //     console.warn('[ACCOUNTING] Skipping payment entries: Invalid amount');
// //     return;
// //   }

// //   // 1. Determine Asset Account (Cash/Bank)
// //   let accountName = 'Cash';
// //   let accountCode = '1001';

// //   switch (payment.paymentMethod) {
// //     case 'bank':
// //     case 'cheque':
// //       accountName = 'Bank';
// //       accountCode = '1002';
// //       break;
// //     case 'upi':
// //       accountName = 'UPI Receivables';
// //       accountCode = '1003';
// //       break;
// //     case 'card':
// //       accountName = 'Card Receivables';
// //       accountCode = '1004';
// //       break;
// //   }

// //   // 2. Get Accounts
// //   const [assetAccount, arAccount] = await Promise.all([
// //     getOrInitAccount(invoice.organizationId, 'asset', accountName, accountCode, session),
// //     getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session)
// //   ]);

// //   // 3. Create Ledger Entries
// //   // Dr Asset (Cash/Bank) -> Money coming in
// //   await AccountEntry.create([{
// //     organizationId: invoice.organizationId,
// //     branchId: invoice.branchId,
// //     accountId: assetAccount._id,
// //     date: payment.paymentDate,
// //     debit: payment.amount,
// //     credit: 0,
// //     description: `Payment for ${invoice.invoiceNumber}`,
// //     referenceType: 'payment',
// //     referenceId: invoice._id,
// //     paymentId: payment._id,
// //     createdBy: userId
// //   }], { session });

// //   // Cr Accounts Receivable -> Reducing what customer owes
// //   await AccountEntry.create([{
// //     organizationId: invoice.organizationId,
// //     branchId: invoice.branchId,
// //     accountId: arAccount._id,
// //     customerId: invoice.customerId,
// //     date: payment.paymentDate,
// //     debit: 0,
// //     credit: payment.amount,
// //     description: `Payment applied to ${invoice.invoiceNumber}`,
// //     referenceType: 'payment',
// //     referenceId: invoice._id,
// //     paymentId: payment._id,
// //     createdBy: userId
// //   }], { session });
// // }

// // // --- HELPER: Reduce Stock ---
// // async function reduceStockForInvoice(items, branchId, organizationId, session) {
// //   for (const item of items) {
// //     const updateResult = await Product.findOneAndUpdate(
// //       { 
// //           _id: item.productId, 
// //           organizationId: organizationId,
// //           "inventory.branchId": branchId,
// //           "inventory.quantity": { $gte: item.quantity } 
// //       },
// //       { 
// //           $inc: { "inventory.$.quantity": -item.quantity },
// //           $set: { lastSold: new Date() }
// //       },
// //       { session, new: true }
// //     );

// //     if (!updateResult) {
// //        const product = await Product.findById(item.productId).session(session);
// //        if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
// //        const inv = product.inventory?.find(i => String(i.branchId) === String(branchId));
// //        throw new AppError(`Insufficient stock for ${product.name}. Available: ${inv?.quantity || 0}`, 400);
// //     }
// //   }
// // }


// // // --- CONTROLLER: CREATE INVOICE ---
// // exports.createInvoice = catchAsync(async (req, res, next) => {
// //   // 1. Validation
// //   const validatedData = createInvoiceSchema.safeParse(req.body);
// //   if (!validatedData.success) {
// //     const errorMessage = validatedData.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
// //     return next(new AppError(errorMessage, 400));
// //   }

// //   // 2. Pre-transaction: Enrich Items & Calc Totals
// //   const enrichedItems = await Promise.all(req.body.items.map(async (item) => {
// //     const product = await Product.findOne({ _id: item.productId, organizationId: req.user.organizationId }).select('name sku inventory');
// //     if (!product) throw new AppError(`Product ${item.productId} not found`, 404);
    
// //     // Quick stock check
// //     const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
// //     if (!inv || inv.quantity < item.quantity) throw new AppError(`Insufficient stock for ${product.name}`, 400);

// //     return { ...item, name: product.name, hsnCode: product.sku || item.hsnCode || "" };
// //   }));

// //   const subtotal = enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
// //   const shippingCharges = req.body.shippingCharges || 0;
// //   const discount = req.body.discount || 0;
// //   const tax = req.body.tax || 0;
// //   const roundOff = req.body.roundOff || 0;
// //   const grandTotal = Math.round(subtotal + shippingCharges + tax - discount + roundOff);
// //   const paidAmount = req.body.paidAmount || 0;

// //   if (paidAmount > grandTotal) return next(new AppError('Paid amount exceeds total', 400));

// //   // 3. Pre-fetch AR Account (Optimization)
// //   // Ensures account exists before transaction starts to avoid conflicts
// //   await getOrInitAccount(req.user.organizationId, 'asset', 'Accounts Receivable', '1200');

// //   const invoiceNumber = req.body.invoiceNumber || `INV-${Date.now()}`; 

// //   // 4. Transaction
// //   await runInTransaction(async (session) => {
    
// //     // Status Logic
// //     let paymentStatus = 'unpaid';
// //     let status = req.body.status || 'issued';
// //     if (paidAmount > 0) {
// //         if (paidAmount >= grandTotal) { paymentStatus = 'paid'; status = 'paid'; }
// //         else { paymentStatus = 'partial'; }
// //     }

// //     // A. Create Invoice
// //     const invoice = (await Invoice.create([{
// //       ...req.body,
// //       invoiceNumber,
// //       items: enrichedItems,
// //       subTotal: subtotal,
// //       grandTotal,
// //       balanceAmount: grandTotal - paidAmount,
// //       paidAmount,
// //       paymentStatus,
// //       status,
// //       organizationId: req.user.organizationId,
// //       branchId: req.user.branchId,
// //       createdBy: req.user._id
// //     }], { session }))[0];

// //     // B. Reduce Stock
// //     await reduceStockForInvoice(req.body.items, req.user.branchId, req.user.organizationId, session);

// //     // C. Process Payment (If Paid)
// //     if (paidAmount > 0) {
// //         // ⚠️ CRITICAL FIX: Extract [0] from create result
// //         const payment = (await Payment.create([{
// //             organizationId: req.user.organizationId,
// //             branchId: req.user.branchId,
// //             type: 'inflow',
// //             customerId: invoice.customerId,
// //             invoiceId: invoice._id,
// //             paymentDate: req.body.invoiceDate || new Date(),
// //             amount: paidAmount,
// //             paymentMethod: req.body.paymentMethod || 'cash',
// //             transactionMode: 'auto',
// //             referenceNumber: req.body.referenceNumber,
// //             transactionId: req.body.transactionId,
// //             remarks: `Payment for ${invoice.invoiceNumber}`,
// //             status: 'completed',
// //             allocationStatus: 'fully_allocated',
// //             remainingAmount: 0, 
// //             allocatedTo: [{
// //                 type: 'invoice',
// //                 documentId: invoice._id,
// //                 amount: paidAmount,
// //                 allocatedAt: new Date()
// //             }],
// //             createdBy: req.user._id
// //         }], { session }))[0]; // <--- THIS [0] IS KEY

// //         // D. Create Payment Accounting Entries
// //         await createPaymentAccountingEntries({
// //             invoice,
// //             payment, // Now passing a valid document, not an array
// //             userId: req.user._id,
// //             session
// //         });
// //     }

// //     // E. Update Customer
// //     if (invoice.customerId) {
// //       await Customer.findByIdAndUpdate(
// //         invoice.customerId,
// //         {
// //           $inc: {
// //             totalPurchases: grandTotal,
// //             outstandingBalance: grandTotal - paidAmount
// //           },
// //           lastPurchaseDate: new Date()
// //         },
// //         { session }
// //       );
// //     }

// //     // F. Post Invoice Journal (Revenue Recognition)
// //     // Dr AR, Cr Sales
// //     if (invoice.status !== 'draft') {
// //       await salesJournalService.postInvoiceJournal({
// //         orgId: req.user.organizationId,
// //         branchId: req.user.branchId,
// //         invoice,
// //         customerId: invoice.customerId,
// //         items: invoice.items,
// //         userId: req.user._id,
// //         session
// //       });
// //       await SalesService.createFromInvoiceTransactional(invoice, session);
// //     }

// //     // Store for response
// //     req.invoice = invoice;

// //   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

// //   // 5. Post-Response
// //   const finalInvoice = req.invoice;
// //   automationService.triggerEvent('invoice.created', finalInvoice.toObject(), req.user.organizationId);
// //   emitToOrg(req.user.organizationId, 'invoice:created', finalInvoice);

// //   res.status(201).json({ status: 'success', data: finalInvoice });
// // });

