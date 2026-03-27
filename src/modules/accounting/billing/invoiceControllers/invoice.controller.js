'use strict';

/**
 * Invoice Controller
 * ─────────────────────────────────────────────
 * Thin HTTP layer only.
 *   1. Parse / validate HTTP input
 *   2. Call InvoiceService
 *   3. Send HTTP response
 *
 * NO business logic, NO accounting, NO stock mutations here.
 */

const Invoice           = require('../invoice.model');
const Payment           = require('../../payments/payment.model');
const InvoiceService    = require('../invoiceService/invoice.service');
const invoicePDFService = require('../invoiceService/invoicePDFService');

const factory    = require('../../../../core/utils/api/handlerFactory');
const catchAsync = require('../../../../core/utils/api/catchAsync');
const AppError   = require('../../../../core/utils/api/appError');

const INVOICE_POPULATE = [
  { path: 'customerId',      select: 'name phone email address' },
  { path: 'items.productId', select: 'name sku sellingPrice' },
  { path: 'branchId',        select: 'name code address' },
  { path: 'createdBy',       select: 'name email' },
];

/* ======================================================
   1. CREATE INVOICE
====================================================== */
exports.createInvoice = catchAsync(async (req, res, next) => {
  const invoice = await InvoiceService.createInvoice(req.body, req.user);
  res.status(201).json({ status: 'success', data: invoice });
});

/* ======================================================
   2. UPDATE INVOICE
====================================================== */
exports.updateInvoice = catchAsync(async (req, res, next) => {
  const invoice = await InvoiceService.updateInvoice(req.params.id, req.body, req.user);
  res.status(200).json({ status: 'success', data: { invoice } });
});

/* ======================================================
   3. CANCEL INVOICE
====================================================== */
exports.cancelInvoice = catchAsync(async (req, res, next) => {
  const { reason, restock, reverseFinancials } = req.body;
  await InvoiceService.cancelInvoice(req.params.id, { reason, restock, reverseFinancials }, req.user);
  res.status(200).json({ status: 'success', message: 'Invoice cancelled successfully' });
});

/* ======================================================
   4. ADD PAYMENT
====================================================== */
exports.addPayment = catchAsync(async (req, res, next) => {
  const result = await InvoiceService.addPayment(req.params.id, req.body, req.user);
  res.status(200).json({
    status:  'success',
    message: result.emi
      ? 'Payment recorded and synced with EMI Plan'
      : 'Payment added successfully',
  });
});

/* ======================================================
   5. CONVERT DRAFT TO ACTIVE
====================================================== */
exports.convertDraftToActive = catchAsync(async (req, res, next) => {
  await InvoiceService.convertDraftToActive(req.params.id, req.user);
  res.status(200).json({ status: 'success', message: 'Draft converted to active invoice' });
});

/* ======================================================
   6. BULK CANCEL
====================================================== */
exports.bulkCancelInvoices = catchAsync(async (req, res, next) => {
  const { ids, reason } = req.body;
  await InvoiceService.bulkCancelInvoices(ids, reason, req.user);
  res.status(200).json({ status: 'success', message: `${ids?.length || 0} invoice(s) cancelled` });
});

/* ======================================================
   7. CHECK STOCK
====================================================== */
exports.checkStock = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  if (!items?.length) return next(new AppError('Items are required', 400));
  const result = await InvoiceService.checkStock(items, req.user);
  res.status(200).json({ status: 'success', data: result });
});

/* ======================================================
   8. GET INVOICE WITH STOCK INFO
====================================================== */
exports.getInvoiceWithStock = catchAsync(async (req, res, next) => {
  const invoice = await InvoiceService.getInvoiceWithStock(req.params.id, req.user);
  res.status(200).json({ status: 'success', data: { invoice } });
});

/* ======================================================
   9. SEARCH INVOICES
====================================================== */
exports.searchInvoices = catchAsync(async (req, res, next) => {
  const query = (req.params.query || req.query.q || '').trim();
  const limit  = parseInt(req.query.limit) || 20;
  if (!query) return next(new AppError('Search query is required', 400));
  const invoices = await InvoiceService.searchInvoices(query, limit, req.user);
  res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
});

/* ======================================================
   10. LOW STOCK WARNINGS
====================================================== */
exports.getLowStockWarnings = catchAsync(async (req, res, next) => {
  const warnings = await InvoiceService.getLowStockWarnings(req.params.id, req.user);
  res.status(200).json({ status: 'success', warnings, hasWarnings: warnings.length > 0 });
});

/* ======================================================
   11. SEND EMAIL
====================================================== */
exports.sendInvoiceEmail = catchAsync(async (req, res, next) => {
  const email = await InvoiceService.sendInvoiceEmail(req.params.id, req.user);
  res.status(200).json({ status: 'success', message: `Invoice email sent to ${email}` });
});

/* ======================================================
   12. AUDIT HISTORY
====================================================== */
exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
  const history = await InvoiceService.getInvoiceHistory(req.params.id, req.user);
  res.status(200).json({ status: 'success', results: history.length, data: { history } });
});

/* ======================================================
   13. PAYMENTS LIST
====================================================== */
exports.getInvoicePayments = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({
    invoiceId:      req.params.id,
    organizationId: req.user.organizationId,
    isDeleted:      { $ne: true },
  })
    .sort({ paymentDate: -1 })
    .populate('createdBy', 'name email');
  res.status(200).json({ status: 'success', results: payments.length, data: { payments } });
});

/* ======================================================
   14. PDF DOWNLOAD
====================================================== */
exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id, organizationId: req.user.organizationId,
  }).populate(['customerId', 'branchId']);
  if (!invoice) return next(new AppError('Invoice not found', 404));

  const buffer = await invoicePDFService.generateInvoicePDF(invoice);
  res.set({
    'Content-Type':        'application/pdf',
    'Content-Disposition': `attachment; filename=invoice_${invoice.invoiceNumber}.pdf`,
  });
  res.send(buffer);
});

/* ======================================================
   15. MISC
====================================================== */
exports.validateNumber = catchAsync(async (req, res, next) => {
  const exists = await Invoice.exists({
    invoiceNumber:  req.params.number,
    organizationId: req.user.organizationId,
  });
  res.status(200).json({ status: 'success', data: { isAvailable: !exists } });
});

exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
  const { ids, status } = req.body;
  if (!ids?.length) return next(new AppError('IDs required', 400));
  if (!status)       return next(new AppError('Status required', 400));
  await Invoice.updateMany(
    { _id: { $in: ids }, organizationId: req.user.organizationId },
    { $set: { status } }
  );
  res.status(200).json({ status: 'success', message: 'Status updated' });
});

exports.exportInvoices = catchAsync(async (req, res, next) => {
  const { startDate, endDate, status } = req.query;
  const filter = { organizationId: req.user.organizationId, isDeleted: { $ne: true } };
  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.invoiceDate = {};
    if (startDate) filter.invoiceDate.$gte = new Date(startDate);
    if (endDate)   filter.invoiceDate.$lte = new Date(endDate);
  }
  const docs = await Invoice.find(filter)
    .populate('customerId', 'name email phone').lean().limit(5000);
  res.status(200).json({ status: 'success', results: docs.length, data: docs });
});

exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
  const invoices = await Invoice.find({
    organizationId: req.user.organizationId,
    customerId:     req.params.customerId,
    isDeleted:      { $ne: true },
  }).populate('items.productId', 'name sku').sort({ invoiceDate: -1 });
  res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
});

exports.restoreInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId, isDeleted: true },
    { isDeleted: false }, { new: true }
  );
  if (!invoice) return next(new AppError('Deleted invoice not found', 404));
  res.status(200).json({ status: 'success', data: { invoice } });
});

exports.getAllDrafts = catchAsync(async (req, res, next) => {
  const drafts = await Invoice.find({
    organizationId: req.user.organizationId, status: 'draft', isDeleted: { $ne: true },
  }).populate('customerId', 'name');
  res.status(200).json({ status: 'success', data: { invoices: drafts } });
});

exports.getDeletedInvoices = catchAsync(async (req, res, next) => {
  const trash = await Invoice.find({
    organizationId: req.user.organizationId, isDeleted: true,
  }).populate('customerId', 'name');
  res.status(200).json({ status: 'success', data: { invoices: trash } });
});

exports.deleteInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id, organizationId: req.user.organizationId,
  });
  if (!invoice) return next(new AppError('Invoice not found', 404));
  if (!['draft', 'cancelled'].includes(invoice.status)) {
    return next(new AppError(
      'Cancel the invoice before deleting to ensure stock and accounts are reversed', 400
    ));
  }
  return factory.deleteOne(Invoice)(req, res, next);
});

/* ======================================================
   FACTORY-POWERED READ
====================================================== */
exports.getAllInvoices = factory.getAll(Invoice, { populate: INVOICE_POPULATE });
exports.getInvoice     = factory.getOne(Invoice, { populate: INVOICE_POPULATE });

module.exports = exports;

// 'use strict';

// /**
//  * Invoice Controller
//  * ─────────────────────────────────────────────
//  * Thin HTTP layer only.
//  *   1. Parse / validate HTTP input
//  *   2. Call InvoiceService
//  *   3. Send HTTP response
//  *
//  * NO business logic, NO accounting, NO stock mutations here.
//  */

// const Invoice           = require('../invoice.model');
// const Payment           = require('../../payments/payment.model');
// const InvoiceService    = require('../../../../services/billing/invoiceService');
// const invoicePDFService = require('../invoicePDFService');

// const factory    = require('../../../../core/utils/api/handlerFactory');
// const catchAsync = require('../../../../core/utils/api/catchAsync');
// const AppError   = require('../../../../core/utils/api/appError');

// const INVOICE_POPULATE = [
//   { path: 'customerId',      select: 'name phone email address' },
//   { path: 'items.productId', select: 'name sku sellingPrice' },
//   { path: 'branchId',        select: 'name code address' },
//   { path: 'createdBy',       select: 'name email' },
// ];

// /* ======================================================
//    1. CREATE INVOICE
// ====================================================== */
// exports.createInvoice = catchAsync(async (req, res, next) => {
//   const invoice = await InvoiceService.createInvoice(req.body, req.user);
//   res.status(201).json({ status: 'success', data: invoice });
// });

// /* ======================================================
//    2. UPDATE INVOICE
// ====================================================== */
// exports.updateInvoice = catchAsync(async (req, res, next) => {
//   const invoice = await InvoiceService.updateInvoice(req.params.id, req.body, req.user);
//   res.status(200).json({ status: 'success', data: { invoice } });
// });

// /* ======================================================
//    3. CANCEL INVOICE
// ====================================================== */
// exports.cancelInvoice = catchAsync(async (req, res, next) => {
//   const { reason, restock, reverseFinancials } = req.body;
//   await InvoiceService.cancelInvoice(req.params.id, { reason, restock, reverseFinancials }, req.user);
//   res.status(200).json({ status: 'success', message: 'Invoice cancelled successfully' });
// });

// /* ======================================================
//    4. ADD PAYMENT
// ====================================================== */
// exports.addPayment = catchAsync(async (req, res, next) => {
//   const result = await InvoiceService.addPayment(req.params.id, req.body, req.user);
//   res.status(200).json({
//     status:  'success',
//     message: result.emi
//       ? 'Payment recorded and synced with EMI Plan'
//       : 'Payment added successfully',
//   });
// });

// /* ======================================================
//    5. CONVERT DRAFT TO ACTIVE
// ====================================================== */
// exports.convertDraftToActive = catchAsync(async (req, res, next) => {
//   await InvoiceService.convertDraftToActive(req.params.id, req.user);
//   res.status(200).json({ status: 'success', message: 'Draft converted to active invoice' });
// });

// /* ======================================================
//    6. BULK CANCEL
// ====================================================== */
// exports.bulkCancelInvoices = catchAsync(async (req, res, next) => {
//   const { ids, reason } = req.body;
//   await InvoiceService.bulkCancelInvoices(ids, reason, req.user);
//   res.status(200).json({ status: 'success', message: `${ids?.length || 0} invoice(s) cancelled` });
// });

// /* ======================================================
//    7. CHECK STOCK
// ====================================================== */
// exports.checkStock = catchAsync(async (req, res, next) => {
//   const { items } = req.body;
//   if (!items?.length) return next(new AppError('Items are required', 400));
//   const result = await InvoiceService.checkStock(items, req.user);
//   res.status(200).json({ status: 'success', data: result });
// });

// /* ======================================================
//    8. GET INVOICE WITH STOCK INFO
// ====================================================== */
// exports.getInvoiceWithStock = catchAsync(async (req, res, next) => {
//   const invoice = await InvoiceService.getInvoiceWithStock(req.params.id, req.user);
//   res.status(200).json({ status: 'success', data: { invoice } });
// });

// /* ======================================================
//    9. SEARCH INVOICES
// ====================================================== */
// exports.searchInvoices = catchAsync(async (req, res, next) => {
//   const query = (req.params.query || req.query.q || '').trim();
//   const limit  = parseInt(req.query.limit) || 20;
//   if (!query) return next(new AppError('Search query is required', 400));
//   const invoices = await InvoiceService.searchInvoices(query, limit, req.user);
//   res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
// });

// /* ======================================================
//    10. LOW STOCK WARNINGS
// ====================================================== */
// exports.getLowStockWarnings = catchAsync(async (req, res, next) => {
//   const warnings = await InvoiceService.getLowStockWarnings(req.params.id, req.user);
//   res.status(200).json({ status: 'success', warnings, hasWarnings: warnings.length > 0 });
// });

// /* ======================================================
//    11. SEND EMAIL
// ====================================================== */
// exports.sendInvoiceEmail = catchAsync(async (req, res, next) => {
//   const email = await InvoiceService.sendInvoiceEmail(req.params.id, req.user);
//   res.status(200).json({ status: 'success', message: `Invoice email sent to ${email}` });
// });

// /* ======================================================
//    12. AUDIT HISTORY
// ====================================================== */
// exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
//   const history = await InvoiceService.getInvoiceHistory(req.params.id, req.user);
//   res.status(200).json({ status: 'success', results: history.length, data: { history } });
// });

// /* ======================================================
//    13. PAYMENTS LIST
// ====================================================== */
// exports.getInvoicePayments = catchAsync(async (req, res, next) => {
//   const payments = await Payment.find({
//     invoiceId:      req.params.id,
//     organizationId: req.user.organizationId,
//     isDeleted:      { $ne: true },
//   })
//     .sort({ paymentDate: -1 })
//     .populate('createdBy', 'name email');
//   res.status(200).json({ status: 'success', results: payments.length, data: { payments } });
// });

// /* ======================================================
//    14. PDF DOWNLOAD
// ====================================================== */
// exports.downloadInvoice = catchAsync(async (req, res, next) => {
//   const invoice = await Invoice.findOne({
//     _id: req.params.id, organizationId: req.user.organizationId,
//   }).populate(['customerId', 'branchId']);
//   if (!invoice) return next(new AppError('Invoice not found', 404));

//   const buffer = await invoicePDFService.generateInvoicePDF(invoice);
//   res.set({
//     'Content-Type':        'application/pdf',
//     'Content-Disposition': `attachment; filename=invoice_${invoice.invoiceNumber}.pdf`,
//   });
//   res.send(buffer);
// });

// /* ======================================================
//    15. MISC
// ====================================================== */
// exports.validateNumber = catchAsync(async (req, res, next) => {
//   const exists = await Invoice.exists({
//     invoiceNumber:  req.params.number,
//     organizationId: req.user.organizationId,
//   });
//   res.status(200).json({ status: 'success', data: { isAvailable: !exists } });
// });

// exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
//   const { ids, status } = req.body;
//   if (!ids?.length) return next(new AppError('IDs required', 400));
//   if (!status)       return next(new AppError('Status required', 400));
//   await Invoice.updateMany(
//     { _id: { $in: ids }, organizationId: req.user.organizationId },
//     { $set: { status } }
//   );
//   res.status(200).json({ status: 'success', message: 'Status updated' });
// });

// exports.exportInvoices = catchAsync(async (req, res, next) => {
//   const { startDate, endDate, status } = req.query;
//   const filter = { organizationId: req.user.organizationId, isDeleted: { $ne: true } };
//   if (status) filter.status = status;
//   if (startDate || endDate) {
//     filter.invoiceDate = {};
//     if (startDate) filter.invoiceDate.$gte = new Date(startDate);
//     if (endDate)   filter.invoiceDate.$lte = new Date(endDate);
//   }
//   const docs = await Invoice.find(filter)
//     .populate('customerId', 'name email phone').lean().limit(5000);
//   res.status(200).json({ status: 'success', results: docs.length, data: docs });
// });

// exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
//   const invoices = await Invoice.find({
//     organizationId: req.user.organizationId,
//     customerId:     req.params.customerId,
//     isDeleted:      { $ne: true },
//   }).populate('items.productId', 'name sku').sort({ invoiceDate: -1 });
//   res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
// });

// exports.restoreInvoice = catchAsync(async (req, res, next) => {
//   const invoice = await Invoice.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId, isDeleted: true },
//     { isDeleted: false }, { new: true }
//   );
//   if (!invoice) return next(new AppError('Deleted invoice not found', 404));
//   res.status(200).json({ status: 'success', data: { invoice } });
// });

// exports.getAllDrafts = catchAsync(async (req, res, next) => {
//   const drafts = await Invoice.find({
//     organizationId: req.user.organizationId, status: 'draft', isDeleted: { $ne: true },
//   }).populate('customerId', 'name');
//   res.status(200).json({ status: 'success', data: { invoices: drafts } });
// });

// exports.getDeletedInvoices = catchAsync(async (req, res, next) => {
//   const trash = await Invoice.find({
//     organizationId: req.user.organizationId, isDeleted: true,
//   }).populate('customerId', 'name');
//   res.status(200).json({ status: 'success', data: { invoices: trash } });
// });

// exports.deleteInvoice = catchAsync(async (req, res, next) => {
//   const invoice = await Invoice.findOne({
//     _id: req.params.id, organizationId: req.user.organizationId,
//   });
//   if (!invoice) return next(new AppError('Invoice not found', 404));
//   if (!['draft', 'cancelled'].includes(invoice.status)) {
//     return next(new AppError(
//       'Cancel the invoice before deleting to ensure stock and accounts are reversed', 400
//     ));
//   }
//   return factory.deleteOne(Invoice)(req, res, next);
// });

// /* ======================================================
//    FACTORY-POWERED READ
// ====================================================== */
// exports.getAllInvoices = factory.getAll(Invoice, { populate: INVOICE_POPULATE });
// exports.getInvoice     = factory.getOne(Invoice, { populate: INVOICE_POPULATE });

// module.exports = exports;




// // const mongoose = require("mongoose");
// // const { z } = require("zod");
// // const { format } = require('fast-csv');
// // const { invalidateOpeningBalance } = require("../../core/ledgerCache.service");
// // const ProfitCalculator = require('../utils/profitCalculator');

// // const Invoice = require("../invoice.model");
// // const Payment = require("../../payments/payment.model");
// // const Product = require("../../../inventory/core/model/product.model");
// // const Customer = require("../../../organization/core/customer.model");
// // const AccountEntry = require('../../core/accountEntry.model');
// // const Account = require('../../core/account.model');
// // const Organization = require("../../../organization/core/organization.model");
// // const InvoiceAudit = require('../invoiceAudit.model');

// // const SalesService = require("../../../inventory/core/service/sales.service");
// // const invoicePDFService = require("../invoicePDFService");
// // const StockValidationService = require("../../../inventory/core/service/stockValidation.service");
// // const { createNotification } = require("../../../notification/core/notification.service");
// // // CHANGED: Import the whole service to access reverseInvoiceJournal
// // const salesJournalService = require('../../../inventory/core/service/salesJournal.service');

// // const catchAsync = require("../../../../core/utils/api/catchAsync");
// // const AppError = require("../../../../core/utils/api/appError");
// // const factory = require("../../../../core/utils/api/handlerFactory");
// // const { runInTransaction } = require("../../../../core/utils/db/runInTransaction");
// // const { emitToOrg } = require("../../../../socketHandlers/socket");

// // const EMI = require('../../payments/emi.model'); // Adjust path to your EMI model
// // const emiService = require('../../payments/emiService'); // Adjust path to your Service

// // async function restoreStockFromInvoice(items, branchId, organizationId, session) {
// //   for (const item of items) {
// //     const updateResult = await Product.findOneAndUpdate(
// //       { 
// //         _id: item.productId, 
// //         organizationId: organizationId, 
// //         "inventory.branchId": branchId 
// //       },
// //       { 
// //         $inc: { "inventory.$.quantity": item.quantity } 
// //       },
// //       { session, new: true }
// //     );

// //     if (!updateResult) {
// //       console.error(`[STOCK_SYNC] Failed to restore stock for product ${item.productId} at branch ${branchId}`);
// //       // We don't necessarily throw an error here to prevent blocking cancellation, 
// //       // but you might want to log this for manual audit.
// //     }
// //   }
// // }
// // // ==============================================================================
// // // 1. VALIDATION SCHEMA
// // // ==============================================================================
// // const createInvoiceSchema = z.object({
// //   customerId: z.string().min(1, "Customer ID is required"),
// //   items: z.array(z.object({
// //     productId: z.string().min(1, "Product ID is required"),
// //     quantity: z.coerce.number().positive("Quantity must be positive"),
// //     price: z.coerce.number().nonnegative("Price cannot be negative"), // Selling Price
    
// //     // 🟢 ADDED: This will be populated by the backend, not the user
// //     purchasePriceAtSale: z.coerce.number().nonnegative().optional(), 
    
// //     tax: z.coerce.number().optional().default(0),
// //     taxRate: z.coerce.number().optional().default(0),
// //     discount: z.coerce.number().optional().default(0),
// //     unit: z.string().optional().default('pcs'),
// //     hsnCode: z.string().optional()
// //   })).min(1, "Invoice must have at least one item"),

// //   invoiceNumber: z.string().optional(),
// //   invoiceDate: z.union([z.string(), z.date()]).optional(),
// //   dueDate: z.union([z.string(), z.date()]).optional(),

// //   paidAmount: z.coerce.number().min(0).optional().default(0),
// //   paymentMethod: z.enum(['cash', 'bank', 'upi', 'card', 'cheque', 'other']).optional().default('cash'),
// //   referenceNumber: z.string().optional(),
// //   paymentReference: z.string().optional(),
// //   transactionId: z.string().optional(),

// //   status: z.enum(['draft', 'issued', 'paid', 'cancelled']).optional().default('issued'),
// //   shippingCharges: z.coerce.number().min(0).optional().default(0),
// //   notes: z.string().optional(),
// //   roundOff: z.coerce.number().optional(),
// //   gstType: z.string().optional(),
// //   attachedFiles: z.array(z.string()).optional()
// // });

// // // ==============================================================================
// // // 2. HELPER FUNCTIONS
// // // ==============================================================================

// // // --- Get or Init Ledger Account ---
// // async function getOrInitAccount(orgId, type, name, code, session) {
// //   const query = Account.findOne({ organizationId: orgId, code });
// //   if (session) query.session(session);
// //   let account = await query;
// //   if (!account) {
// //     try {
// //         const newAccounts = await Account.create([{ 
// //             organizationId: orgId, name, code, type, isGroup: false, cachedBalance: 0 
// //         }], { session }); 
// //         account = newAccounts[0];
// //     } catch (err) {
// //         if (err.code === 11000) {
// //             const retryQuery = Account.findOne({ organizationId: orgId, code });
// //             if (session) retryQuery.session(session);
// //             account = await retryQuery;
// //         } else {
// //             throw err;
// //         }
// //     }
// //   }
// //   return account;
// // }

// // // --- Create Payment Accounting Entries (Double Entry) ---
// // async function createPaymentAccountingEntries({ invoice, payment, userId, session }) {
// //   if (!payment || !payment.amount || payment.amount <= 0) {
// //     console.warn('[ACCOUNTING] Skipping payment entries: Invalid amount');
// //     return;
// //   }
  
// //   let accountName = 'Cash';
// //   let accountCode = '1001';
  
// //   switch (payment.paymentMethod) {
// //     case 'bank':
// //     case 'cheque': accountName = 'Bank'; accountCode = '1002'; break;
// //     case 'upi': accountName = 'UPI Receivables'; accountCode = '1003'; break;
// //     case 'card': accountName = 'Card Receivables'; accountCode = '1004'; break;
// //   }

// //   const [assetAccount, arAccount] = await Promise.all([
// //     getOrInitAccount(invoice.organizationId, 'asset', accountName, accountCode, session),
// //     getOrInitAccount(invoice.organizationId, 'asset', 'Accounts Receivable', '1200', session)
// //   ]);

// //   // 1. Dr Asset (Cash/Bank) -> Money coming in
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

// //   // 2. Cr Accounts Receivable -> Reducing what customer owes
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

// // // --- Reduce Stock (Legacy/Standalone Helper) ---
// // // NOTE: Not used in createInvoice anymore to avoid race conditions with SalesService
// // async function reduceStockForInvoice(items, branchId, organizationId, session) {
// //   for (const item of items) {
// //     const updateResult = await Product.findOneAndUpdate(
// //       {  _id: item.productId,  organizationId: organizationId, "inventory.branchId": branchId, "inventory.quantity": { $gte: item.quantity }        },
// //       { $inc: { "inventory.$.quantity": -item.quantity }, $set: { lastSold: new Date() }       },
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

// // // ==============================================================================
// // // 3. CONTROLLER: CREATE INVOICE
// // // ==============================================================================

// // /**
// //  * @description Creates a new invoice, manages stock atomically, and handles initial payments/accounting.
// //  * @architect_notes Resolved N+1 Problem, Atomic Stock Deduction, and Mathematical Integrity.
// //  */
// // exports.createInvoice = catchAsync(async (req, res, next) => {
// //   // 1. Schema Validation
// //   const validatedData = createInvoiceSchema.safeParse(req.body);
// //   if (!validatedData.success) {
// //     // Log error for debugging
// //     console.error("Zod Validation Error:", JSON.stringify(validatedData.error, null, 2));
    
// //     // Check if error exists to prevent crash
// //     const errors = validatedData.error?.errors || [];
// //     const errorMessage = errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') || "Invalid input data";
// //     return next(new AppError(errorMessage, 400));
// //   }

// //   // Use the validated/coerced data instead of raw req.body
// //   // This guarantees 'items' is an array and defaults are applied
// //   const { items, ...invoiceData } = validatedData.data;

// //   // 2. Resolve N+1 Problem: Bulk fetch all products once
// //   const productIds = items.map(item => item.productId);
// //   const products = await Product.find({
// //     _id: { $in: productIds },
// //     organizationId: req.user.organizationId
// //   }).select('name sku inventory hsnCode category purchasePrice');

// //   // 3. Enrich items and prepare snapshots
// //   const enrichedItems = items.map(item => {
// //     const product = products.find(p => p._id.toString() === item.productId);
// //     if (!product) throw new AppError(`Product ${item.productId} not found`, 404);

// //     const inv = product.inventory?.find(i => String(i.branchId) === String(req.user.branchId));
    
// //     // Preliminary check (final check happens atomically in the transaction)
// //     if (!inv || inv.quantity < item.quantity) {
// //       throw new AppError(`Insufficient stock for ${product.name}`, 400);
// //     }

// //     return {
// //       ...item,
// //       name: product.name,
// //       hsnCode: product.hsnCode || product.sku || item.hsnCode || "",
// //       unit: item.unit || 'pcs',
// //       discount: item.discount || 0,
// //       taxRate: item.taxRate || item.tax || 0,
// //       // SNAPSHOT: Store current cost price to lock in profit margins
// //       purchasePriceAtSale: product.purchasePrice || 0,
// //       reminderSent: false,
// //       overdueNoticeSent: false,
// //       overdueCount: 0
// //     };
// //   });

// //   // 4. Mathematical Calculations (Pure Functions)
// //   const subtotal = enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
// //   const shippingCharges = invoiceData.shippingCharges || 0;
// //   const inputDiscount = invoiceData.discount || 0;
  
// //   const taxAmount = enrichedItems.reduce((sum, item) => {
// //     const lineTotal = (item.price * item.quantity) - (item.discount || 0);
// //     return sum + ((item.taxRate || 0) / 100 * lineTotal);
// //   }, 0);

// //   const roundOff = invoiceData.roundOff || 0;
// //   const grandTotal = Math.round(subtotal + shippingCharges + taxAmount - inputDiscount + roundOff);
// //   const paidAmount = invoiceData.paidAmount || 0;

// //   if (paidAmount > grandTotal) {
// //     return next(new AppError(`Paid amount (${paidAmount}) cannot exceed Grand Total (${grandTotal})`, 400));
// //   }

// //   const invoiceNumber = invoiceData.invoiceNumber || `INV-${Date.now()}`;

// //   // 5. Atomic Transaction Execution
// //   await runInTransaction(async (session) => {
// //     // A. Status & Payment Logic
// //     let paymentStatus = 'unpaid';
// //     let status = invoiceData.status || 'issued';

// //     if (paidAmount > 0) {
// //       paymentStatus = paidAmount >= grandTotal ? 'paid' : 'partial';
// //       if (paymentStatus === 'paid') status = 'paid';
// //     }

// //     // B. Create Invoice Document
// //     const [invoice] = await Invoice.create([{
// //       ...invoiceData,
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
// //       customerId: invoiceData.customerId,
// //       createdBy: req.user._id,
// //       paymentReference: invoiceData.paymentReference || invoiceData.referenceNumber,
// //       transactionId: invoiceData.transactionId
// //     }], { session });

// //     // ❌ REMOVED: Stock reduction here caused Double Deduction logic error.
// //     // Stock is now reduced inside SalesService.createFromInvoiceTransactional below.

// //     // D. Process Payment & Accounting (If applicable)
// //     if (paidAmount > 0) {
// //       const [payment] = await Payment.create([{
// //         organizationId: req.user.organizationId,
// //         branchId: req.user.branchId,
// //         type: 'inflow',
// //         customerId: invoice.customerId,
// //         invoiceId: invoice._id,
// //         paymentDate: invoiceData.invoiceDate || new Date(),
// //         amount: paidAmount,
// //         paymentMethod: invoiceData.paymentMethod || 'cash',
// //         transactionMode: 'auto',
// //         referenceNumber: invoiceData.paymentReference || invoiceData.referenceNumber,
// //         transactionId: invoiceData.transactionId,
// //         remarks: `Auto-payment for ${invoice.invoiceNumber}`,
// //         status: 'completed',
// //         allocationStatus: 'fully_allocated',
// //         remainingAmount: 0,
// //         allocatedTo: [{
// //           type: 'invoice',
// //           documentId: invoice._id,
// //           amount: paidAmount,
// //           allocatedAt: new Date()
// //         }],
// //         createdBy: req.user._id
// //       }], { session });

// //       // Generate Double-Entry Accounting Logs
// //       await createPaymentAccountingEntries({
// //         invoice,
// //         payment,
// //         userId: req.user._id,
// //         session
// //       });
// //     }

// //     // E. Update Customer Credit Profile
// //     if (invoice.customerId) {
// //       await Customer.findByIdAndUpdate(
// //         invoice.customerId,
// //         {
// //           $inc: {
// //             totalPurchases: grandTotal,
// //             outstandingBalance: grandTotal - paidAmount
// //           },
// //           $set: { lastPurchaseDate: new Date() }
// //         },
// //         { session }
// //       );
// //     }

// //     // F. Post Revenue Recognition Journal (Sales Journal)
// //     if (invoice.status !== 'draft') {
// //       // 1. Post Accounting Entries
// //       await salesJournalService.postInvoiceJournal({
// //         orgId: req.user.organizationId,
// //         branchId: req.user.branchId,
// //         invoice,
// //         customerId: invoice.customerId,
// //         items: invoice.items,
// //         userId: req.user._id,
// //         session
// //       });

// //       // 2. Synchronize with Sales Service (Inventory Deduction + COGS + Stats)
// //       // ✅ This service handles the stock reduction safely
// //       await SalesService.createFromInvoiceTransactional(invoice, session);
// //     }

// //     // Attach to request for post-transaction hooks
// //     req.invoice = invoice;

// //   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

// //   // 6. Post-Transaction Communication (Async)
// //   const finalInvoice = req.invoice;
  
// //   // Trigger Webhooks/Automation

  
// //   // Real-time Update via Socket.io
// //   emitToOrg(req.user.organizationId, 'invoice:created', finalInvoice);

// //   // 7. Success Response
// //   res.status(201).json({
// //     status: 'success',
// //     data: finalInvoice
// //   });
// // });

// // /* ======================================================
// //    2. UPDATE INVOICE WITH STOCK MANAGEMENT (REFACTORED)
// // ====================================================== */
// // exports.updateInvoice = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   const updates = req.body;
// //   let updatedInvoice;

// //   await runInTransaction(async (session) => {
// //     const oldInvoice = await Invoice.findOne({
// //       _id: id,
// //       organizationId: req.user.organizationId
// //     }).session(session);

// //     if (!oldInvoice) throw new AppError('Invoice not found', 404);
// //     if (oldInvoice.status === 'cancelled') throw new AppError('Cannot update cancelled invoice', 400);

// //     // If Draft: Simple Update (no stock changes)
// //     if (oldInvoice.status === 'draft' && (!updates.status || updates.status === 'draft')) {
// //       updatedInvoice = await Invoice.findByIdAndUpdate(id, updates, { new: true, session });

// //       await InvoiceAudit.create([{
// //         invoiceId: oldInvoice._id,
// //         action: 'UPDATE_DRAFT',
// //         performedBy: req.user._id,
// //         details: 'Draft invoice updated',
// //         ipAddress: req.ip
// //       }], { session });

// //       return;
// //     }

// //     // If invoice has been issued and we're updating items: REVERSE EVERYTHING Logic
// //     const needsFinancialUpdate = updates.items || updates.shippingCharges || updates.discount || updates.tax;

// //     if (needsFinancialUpdate) {
// //       // A. RESTORE OLD STOCK (Put items back on shelf)
// //       await restoreStockFromInvoice(
// //         oldInvoice.items,
// //         oldInvoice.branchId,
// //         req.user.organizationId,
// //         session
// //       );

// //       // B. VALIDATE NEW STOCK AVAILABILITY
// //       if (updates.items) {
// //         const stockValidation = await StockValidationService.validateSale(
// //           updates.items,
// //           oldInvoice.branchId,
// //           req.user.organizationId,
// //           session
// //         );

// //         if (!stockValidation.isValid) {
// //           throw new AppError(
// //             `Stock validation failed: ${stockValidation.errors.join(', ')}`,
// //             400
// //           );
// //         }
// //       }

// //       // C. REDUCE NEW STOCK (Take items from shelf)
// //       const newItems = updates.items || oldInvoice.items;
// //       await reduceStockForInvoice(
// //         newItems,
// //         oldInvoice.branchId,
// //         req.user.organizationId,
// //         session
// //       );

// //       // D. ENRICH ITEMS WITH PRODUCT DETAILS
// //       const enrichedItems = [];
// //       for (const item of newItems) {
// //         const product = await Product.findById(item.productId).session(session);
// //         enrichedItems.push({
// //           ...item,
// //           name: product.name,
// //           sku: product.sku
// //         });
// //       }
// //       updates.items = enrichedItems;

// //       // E. DELETE OLD ACCOUNTING ENTRIES
// // // Only delete Revenue recognition, NOT payment entries
// // await AccountEntry.deleteMany({
// //   referenceId: oldInvoice._id, // Using referenceId for specific invoice
// //   referenceType: 'invoice',
// //   organizationId: req.user.organizationId
// // }, { session });
// //       // F. UPDATE CUSTOMER BALANCE (Remove old amount)
// //       await Customer.findByIdAndUpdate(
// //         oldInvoice.customerId,
// //         { $inc: { outstandingBalance: -oldInvoice.grandTotal } },
// //         { session }
// //       );
// //     }

// //     // G. SAVE UPDATED INVOICE (recalculates totals)
// //     Object.assign(oldInvoice, updates);
// //     updatedInvoice = await oldInvoice.save({ session });

// //     // H. RE-BOOK ACCOUNTING ENTRIES (REFACTORED: Uses Service)
// //     if (needsFinancialUpdate && updatedInvoice.status !== 'draft') {

// //       // 1. Post new Journal Entries via Service
// //       await salesJournalService.postInvoiceJournal({
// //         orgId: req.user.organizationId,
// //         branchId: req.user.branchId,
// //         invoice: updatedInvoice,
// //         customerId: updatedInvoice.customerId,
// //         items: updatedInvoice.items,
// //         userId: req.user._id,
// //         session
// //       });

// //       // 2. Update Customer Balance (Add new amount)
// //       await Customer.findByIdAndUpdate(
// //         updatedInvoice.customerId,
// //         { $inc: { outstandingBalance: updatedInvoice.grandTotal } },
// //         { session }
// //       );

// //       // 3. Update Sales Record via Service
// //       await SalesService.updateFromInvoiceTransactional(updatedInvoice, session);
// //     }

// //     // I. CREATE AUDIT LOG
// //     await InvoiceAudit.create([{
// //       invoiceId: updatedInvoice._id,
// //       action: needsFinancialUpdate ? 'UPDATE_FINANCIAL' : 'UPDATE_INFO',
// //       performedBy: req.user._id,
// //       details: needsFinancialUpdate
// //         ? `Invoice updated. New Total: ${updatedInvoice.grandTotal}`
// //         : 'Non-financial update applied',
// //       ipAddress: req.ip
// //     }], { session });

// //   }, 3, { action: "UPDATE_INVOICE", userId: req.user._id });

// //   res.status(200).json({
// //     status: "success",
// //     data: { invoice: updatedInvoice }
// //   });
// // });

// // // /* ======================================================
// // //    3. CANCEL INVOICE (MODULAR REVERSAL)
// // // ====================================================== */
// // // exports.cancelInvoice = catchAsync(async (req, res, next) => {
// // //   const { id } = req.params;
// // //   // Default both to true to maintain current behavior, but allow overrides
// // //   const { 
// // //     reason, 
// // //     restock = true, 
// // //     reverseFinancials = true 
// // //   } = req.body;

// // //   if (!reason?.trim()) {
// // //     return next(new AppError('A cancellation reason is required', 400));
// // //   }

// // //   await runInTransaction(async (session) => {
// // //     const invoice = await Invoice.findOne({
// // //       _id: id,
// // //       organizationId: req.user.organizationId
// // //     }).populate('items.productId').session(session);

// // //     if (!invoice) throw new AppError('Invoice not found', 404);
// // //     if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

// // //     // 1. OPTIONAL: RESTOCK ITEMS
// // //     // Used if goods are returned to shelf in sellable condition
// // //     if (restock) {
// // //       await restoreStockFromInvoice(
// // //         invoice.items,
// // //         invoice.branchId,
// // //         req.user.organizationId,
// // //         session
// // //       );
// // //     }

// // //     // 2. OPTIONAL: REVERSE FINANCIALS
// // //     // If false, the customer still "owes" the money or the sale stays in revenue
// // //     if (reverseFinancials) {
// // //       // Reverse Customer Balance
// // //       await Customer.findByIdAndUpdate(
// // //         invoice.customerId,
// // //         {
// // //           $inc: {
// // //             totalPurchases: -invoice.grandTotal,
// // //             outstandingBalance: -invoice.grandTotal
// // //           }
// // //         },
// // //         { session }
// // //       );

// // //       // Create Credit Note / Accounting Journal Reversal
// // //       await salesJournalService.reverseInvoiceJournal({
// // //         orgId: req.user.organizationId,
// // //         branchId: invoice.branchId,
// // //         invoice,
// // //         userId: req.user._id,
// // //         session
// // //       });
      
// // //       // Update Sales Records (Revenue tracking)
// // //       await SalesService.updateFromInvoiceTransactional(invoice, session);
// // //     }

// // //     // 3. UPDATE INVOICE STATUS (Always happens)
// // //     invoice.status = 'cancelled';
// // //     invoice.notes = (invoice.notes || '') + 
// // //       `\n[CANCELLED] Reason: ${reason} | Restock: ${restock} | Reverse Financials: ${reverseFinancials} | By: ${req.user.name || req.user.id}`;
    
// // //     await invoice.save({ session });

// // //     // 4. AUDIT TRAIL
// // //     await InvoiceAudit.create([{
// // //       invoiceId: invoice._id,
// // //       action: 'STATUS_CHANGE',
// // //       performedBy: req.user._id,
// // //       details: `Cancelled. Restock: ${restock}, Financial Reversal: ${reverseFinancials}. Reason: ${reason}`,
// // //       ipAddress: req.ip
// // //     }], { session });

// // //   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

// // //   // 5. NOTIFY
// // //   emitToOrg(req.user.organizationId, 'invoice:cancelled', {
// // //     invoiceId: id,
// // //     restock,
// // //     reverseFinancials
// // //   });

// // //   res.status(200).json({
// // //     status: "success",
// // //     message: `Invoice cancelled successfully. (Restocked: ${restock}, Financials Reversed: ${reverseFinancials})`
// // //   });
// // // });
// // /* ======================================================
// //    3. CANCEL INVOICE (WITH AUTOMATIC WRITE-OFF)
// // ====================================================== */
// // exports.cancelInvoice = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   const { reason, restock = true, reverseFinancials = true } = req.body;

// //   await runInTransaction(async (session) => {
// //     const invoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId })
// //       .populate('items.productId')
// //       .session(session);

// //     if (!invoice) throw new AppError('Invoice not found', 404);

// //     // 1. IF RESTOCK: Put items back in inventory
// //     if (restock) {
// //       await restoreStockFromInvoice(invoice.items, invoice.branchId, req.user.organizationId, session);
// //     } 
// //     // 2. IF NO RESTOCK: Create a Write-Off/Adjustment record for the Audit Trail
// //     else {
// //       const adjustmentItems = invoice.items.map(item => ({
// //         productId: item.productId._id,
// //         quantity: item.quantity,
// //         type: 'decrease', // It stays decreased relative to original stock
// //         reason: `Invoice Cancelled (No Restock): ${reason}`
// //       }));

// //       // Create an entry in your InventoryAdjustment model
// //       await InventoryAdjustment.create([{
// //         organizationId: req.user.organizationId,
// //         branchId: invoice.branchId,
// //         items: adjustmentItems,
// //         notes: `Automatic write-off from cancelled invoice ${invoice.invoiceNumber}`,
// //         createdBy: req.user._id,
// //         status: 'approved'
// //       }], { session });
// //     }

// //     // 3. REVERSE FINANCIALS (Customer Balance & Sales Journal)
// //     if (reverseFinancials) {
// //       await Customer.findByIdAndUpdate(invoice.customerId, {
// //         $inc: { totalPurchases: -invoice.grandTotal, outstandingBalance: -invoice.grandTotal }
// //       }, { session });

// //       await salesJournalService.reverseInvoiceJournal({
// //         orgId: req.user.organizationId,
// //         branchId: invoice.branchId,
// //         invoice,
// //         userId: req.user._id,
// //         session
// //       });
// //     }

// //     // 4. FINAL STATUS UPDATE
// //     invoice.status = 'cancelled';
// //     invoice.notes += `\n[ACTION] Cancelled. Restock: ${restock}. Financials Reversed: ${reverseFinancials}.`;
// //     await invoice.save({ session });

// //   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

// //   res.status(200).json({ status: "success", message: "Invoice processed with audit trail." });
// // });

// // // /* ======================================================
// // //    3. CANCEL INVOICE WITH STOCK RESTORATION (REFACTORED)
// // // ====================================================== */
// // // exports.cancelInvoice = catchAsync(async (req, res, next) => {
// // //   const { id } = req.params;
// // //   const { reason, restock = true } = req.body;

// // //   await runInTransaction(async (session) => {
// // //     const invoice = await Invoice.findOne({
// // //       _id: id,
// // //       organizationId: req.user.organizationId
// // //     }).populate('items.productId').session(session);

// // //     if (!invoice) throw new AppError('Invoice not found', 404);
// // //     if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);

// // //     // 1. RESTOCK ITEMS (if requested)
// // //     if (restock) {
// // //       await restoreStockFromInvoice(
// // //         invoice.items,
// // //         invoice.branchId,
// // //         req.user.organizationId,
// // //         session
// // //       );
// // //     }

// // //     // 2. REVERSE CUSTOMER BALANCE
// // //     await Customer.findByIdAndUpdate(
// // //       invoice.customerId,
// // //       {
// // //         $inc: {
// // //           totalPurchases: -invoice.grandTotal,
// // //           outstandingBalance: -invoice.grandTotal
// // //         }
// // //       },
// // //       { session }
// // //     );

// // //     // 3. CREATE CREDIT NOTE ENTRIES (REFACTORED: Uses Service)
// // //     // This replaces ~30 lines of manual AccountEntry creation
// // //     await salesJournalService.reverseInvoiceJournal({
// // //       orgId: req.user.organizationId,
// // //       branchId: invoice.branchId,
// // //       invoice,
// // //       userId: req.user._id,
// // //       session
// // //     });

// // //     // 4. UPDATE INVOICE STATUS
// // //     invoice.status = 'cancelled';
// // //     invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason} (${new Date().toISOString()})`;
// // //     await invoice.save({ session });

// // //     // 5. CANCEL RELATED SALES RECORD (REFACTORED: Uses Service)
// // //     await SalesService.updateFromInvoiceTransactional(invoice, session);
// // //     await InvoiceAudit.create([{
// // //       invoiceId: invoice._id,
// // //       action: 'STATUS_CHANGE',
// // //       performedBy: req.user._id,
// // //       details: `Cancelled. Restock: ${restock}. Reason: ${reason}`,
// // //       ipAddress: req.ip
// // //     }], { session });
// // //   }, 3, { action: "CANCEL_INVOICE", userId: req.user._id });

// // //   // Emit real-time update
// // //   emitToOrg(req.user.organizationId, 'invoice:cancelled', {
// // //     invoiceId: id,
// // //     invoiceNumber: "Cancelled"
// // //   });

// // //   res.status(200).json({
// // //     status: "success",
// // //     message: "Invoice cancelled & reversed."
// // //   });
// // // });

// // /* ======================================================
// //    5. CHECK STOCK (No Changes Needed)
// // ====================================================== */
// // exports.checkStock = catchAsync(async (req, res, next) => {
// //   const { items } = req.body;

// //   if (!items || !Array.isArray(items) || items.length === 0) { return next(new AppError('Items are required', 400));  }
// //   const validation = await StockValidationService.validateSale(items,req.user.branchId,req.user.organizationId  );

// //   const detailedItems = [];
// //   for (const item of items) {
// //     const product = await Product.findOne({
// //       _id: item.productId,
// //       organizationId: req.user.organizationId
// //     });

// //     if (product) {
// //       const inventory = product.inventory.find(
// //         inv => String(inv.branchId) === String(req.user.branchId)
// //       );

// //       detailedItems.push({
// //         productId: item.productId,
// //         name: product.name,
// //         sku: product.sku,
// //         requestedQuantity: item.quantity,
// //         availableStock: inventory?.quantity || 0,
// //         price: product.sellingPrice,
// //         isAvailable: (inventory?.quantity || 0) >= item.quantity
// //       });
// //     }
// //   }

// //   res.status(200).json({
// //     status: 'success',
// //     data: {
// //       isValid: validation.isValid,
// //       errors: validation.errors,
// //       warnings: validation.warnings,
// //       items: detailedItems
// //     }
// //   });
// // });

// // /* ======================================================
// //    6. CONVERT DRAFT TO ACTIVE INVOICE (Minor Refactor)
// // ====================================================== */
// // exports.convertDraftToActive = catchAsync(async (req, res, next) => {
// //   const { id } = req.params;
// //   await runInTransaction(async (session) => {
// //     const invoice = await Invoice.findOne({
// //       _id: id,
// //       organizationId: req.user.organizationId,
// //       status: 'draft'
// //     }).session(session);
// //     if (!invoice) { throw new AppError('Draft invoice not found', 404);
// //     }

// //     const stockValidation = await StockValidationService.validateSale(
// //       invoice.items,
// //       invoice.branchId,
// //       req.user.organizationId,
// //       session
// //     );

// //     if (!stockValidation.isValid) {
// //       throw new AppError(
// //         `Cannot convert draft: ${stockValidation.errors.join(', ')}`,
// //         400
// //       );
// //     }

// //     await reduceStockForInvoice(
// //       invoice.items,
// //       invoice.branchId,
// //       req.user.organizationId,
// //       session
// //     );

// //     if (invoice.invoiceNumber.startsWith('DRAFT')) {
// //       const lastInvoice = await Invoice.findOne({
// //         organizationId: req.user.organizationId,
// //         invoiceNumber: { $regex: /^INV-/ }
// //       }).sort({ createdAt: -1 }).session(session);

// //       let invoiceNumber;
// //       if (lastInvoice && lastInvoice.invoiceNumber) {
// //         const lastNum = parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0;
// //         invoiceNumber = `INV-${String(lastNum + 1).padStart(6, '0')}`;
// //       } else {
// //         invoiceNumber = `INV-000001`;
// //       }

// //       invoice.invoiceNumber = invoiceNumber;
// //     }

// //     invoice.status = 'issued';
// //     invoice.invoiceDate = new Date();
// //     await invoice.save({ session });

// //     await Customer.findByIdAndUpdate(
// //       invoice.customerId,
// //       {
// //         $inc: {
// //           totalPurchases: invoice.grandTotal,
// //           outstandingBalance: invoice.grandTotal
// //         },
// //         lastPurchaseDate: new Date()
// //       },
// //       { session }
// //     );

// //     // CHANGED: Use Service
// //     await salesJournalService.postInvoiceJournal({
// //       orgId: req.user.organizationId,
// //       branchId: invoice.branchId,
// //       invoice,
// //       customerId: invoice.customerId,
// //       items: invoice.items,
// //       userId: req.user._id,
// //       session
// //     });

// //     // CHANGED: Use Service
// //     await SalesService.createFromInvoiceTransactional(invoice, session);
// //     await InvoiceAudit.create([{
// //       invoiceId: invoice._id,
// //       action: 'STATUS_CHANGE',
// //       performedBy: req.user._id,
// //       details: `Draft converted to active invoice ${invoice.invoiceNumber}`,
// //       ipAddress: req.ip
// //     }], { session });
// //   }, 3, { action: "CONVERT_DRAFT", userId: req.user._id });

// //   res.status(200).json({
// //     status: 'success',
// //     message: 'Draft converted to active invoice'
// //   });
// // });

// // /* ======================================================
// //    7. GET INVOICE WITH STOCK INFO
// // ====================================================== */
// // exports.getInvoiceWithStock = catchAsync(async (req, res, next) => {
// //   const invoice = await Invoice.findOne({
// //     _id: req.params.id,
// //     organizationId: req.user.organizationId
// //   }).populate([
// //     { path: 'customerId', select: 'name phone email address' },
// //     { path: 'items.productId', select: 'name sku sellingPrice inventory' },
// //     { path: 'branchId', select: 'name code address' },
// //     { path: 'createdBy', select: 'name email' }
// //   ]);

// //   if (!invoice) {
// //     return next(new AppError('Invoice not found', 404));
// //   }

// //   const itemsWithStock = await Promise.all(
// //     invoice.items.map(async (item) => {
// //       if (item.productId) {
// //         const inventory = item.productId.inventory.find(
// //           inv => String(inv.branchId) === String(invoice.branchId)
// //         );

// //         return {
// //           ...item.toObject(),
// //           currentStock: inventory?.quantity || 0,
// //           reorderLevel: inventory?.reorderLevel || 10,
// //           willBeLow: inventory?.quantity - item.quantity < (inventory?.reorderLevel || 10)
// //         };
// //       }
// //       return item;
// //     })
// //   );

// //   const invoiceWithStock = {
// //     ...invoice.toObject(),
// //     items: itemsWithStock
// //   };

// //   res.status(200).json({
// //     status: 'success',
// //     data: { invoice: invoiceWithStock }
// //   });
// // });

// // exports.searchInvoices = catchAsync(async (req, res, next) => {
// //   const { query } = req.params;
// //   const { limit = 20 } = req.query;
// //   const invoices = await Invoice.find({
// //     organizationId: req.user.organizationId,
// //     $or: [
// //       { invoiceNumber: { $regex: query, $options: 'i' } },
// //       { 'customerId.name': { $regex: query, $options: 'i' } },
// //       { notes: { $regex: query, $options: 'i' } }
// //     ],
// //     isDeleted: { $ne: true }
// //   }).populate('customerId', 'name phone').limit(parseInt(limit)).sort({ invoiceDate: -1 });
// //   res.status(200).json({ status: 'success', results: invoices.length, data: { invoices } });
// // });

// // exports.getLowStockWarnings = catchAsync(async (req, res, next) => {
// //   const invoice = await Invoice.findOne({
// //     _id: req.params.id,
// //     organizationId: req.user.organizationId
// //   }).populate('items.productId');
// //   if (!invoice) return next(new AppError('Invoice not found', 404));
// //   const warnings = [];
// //   for (const item of invoice.items) {
// //     if (item.productId) {
// //       const inventory = item.productId.inventory.find(inv => String(inv.branchId) === String(invoice.branchId));
// //       if (inventory && inventory.reorderLevel && inventory.quantity < inventory.reorderLevel) {
// //         warnings.push({
// //           productId: item.productId._id,
// //           productName: item.productId.name,
// //           currentStock: inventory.quantity,
// //           reorderLevel: inventory.reorderLevel,
// //           message: `${item.productId.name} is below reorder level (${inventory.quantity} < ${inventory.reorderLevel})`
// //         });
// //       }
// //     }
// //   }
// //   res.status(200).json({ status: 'success', warnings, hasWarnings: warnings.length > 0 });
// // });

// // exports.getAllInvoices = factory.getAll(Invoice, {
// //   populate: [
// //     { path: 'customerId', select: 'name phone email' },
// //     { path: 'items.productId', select: 'name sku' },
// //     { path: 'branchId', select: 'name code' }
// //   ]
// // });

// // exports.getInvoice = factory.getOne(Invoice, {
// //   populate: [
// //     { path: 'customerId', select: 'name phone email address' },
// //     { path: 'items.productId', select: 'name sku sellingPrice' },
// //     { path: 'branchId', select: 'name code address' },
// //     { path: 'createdBy', select: 'name email' }
// //   ]
// // });
// // exports.deleteInvoice = catchAsync(async (req, res, next) => {
// //   const invoice = await Invoice.findOne({ 
// //       _id: req.params.id, 
// //       organizationId: req.user.organizationId 
// //   });

// //   if (!invoice) return next(new AppError("Invoice not found", 404));

// //   // Guardrail: Don't allow deleting 'issued' or 'paid' invoices 
// //   // without cancelling them first!
// //   if (invoice.status !== 'draft' && invoice.status !== 'cancelled') {
// //       return next(new AppError("Please cancel the invoice before deleting it to ensure stock and accounts are reversed.", 400));
// //   }

// //   // If it passes the check, use your existing factory logic
// //   return factory.deleteOne(Invoice)(req, res, next);
// // });
// // // exports.deleteInvoice = factory.deleteOne(Invoice);

// // exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
// //   const { ids, status } = req.body;
// //   if (!ids) return next(new AppError("Ids required", 400));
// //   await Invoice.updateMany({ _id: { $in: ids }, organizationId: req.user.organizationId }, { $set: { status } });
// //   res.status(200).json({ status: "success", message: "Updated" });
// // });

// // exports.validateNumber = catchAsync(async (req, res, next) => {
// //   const { number } = req.params;
// //   const exists = await Invoice.exists({ 
// //     invoiceNumber: number, 
// //     organizationId: req.user.organizationId 
// //   });

// //   res.status(200).json({ 
// //     status: "success", 
// //     data: { isAvailable: !exists } 
// //   });
// // });

// // exports.exportInvoices = catchAsync(async (req, res, next) => {
// //   const docs = await Invoice.find({ organizationId: req.user.organizationId }).populate('customerId').lean();
// //   res.status(200).json({ status: "success", data: docs });
// // });

// // exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
// //   const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId, isDeleted: { $ne: true } }).populate('items.productId', 'name sku').sort({ invoiceDate: -1 });
// //   res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
// // });

// // exports.downloadInvoice = catchAsync(async (req, res, next) => {
// //   const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).populate(['customerId', 'branchId']);
// //   if (!invoice) return next(new AppError('Invoice not found', 404));
// //   const buffer = await invoicePDFService.generateInvoicePDF(invoice);
// //   res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=invoice_${invoice.invoiceNumber}.pdf` });
// //   res.send(buffer);
// // });

// // // --- Bulk Cancel Invoices ---
// // exports.bulkCancelInvoices = catchAsync(async (req, res, next) => {
// //   const { ids, reason } = req.body;
// //   if (!ids || !Array.isArray(ids)) return next(new AppError("Invoice IDs are required", 400));

// //   await runInTransaction(async (session) => {
// //       for (const id of ids) {
// //           const invoice = await Invoice.findOne({ _id: id, organizationId: req.user.organizationId }).session(session);
// //           if (!invoice || invoice.status === 'cancelled') continue;

// //           // 1. Restore Stock
// //           await restoreStockFromInvoice(invoice.items, invoice.branchId, req.user.organizationId, session);

// //           // 2. Reverse Accounting & Customer Balance
// //           await salesJournalService.reverseInvoiceJournal({
// //               orgId: req.user.organizationId,
// //               branchId: invoice.branchId,
// //               invoice,
// //               userId: req.user._id,
// //               session
// //           });

// //           // 3. Update Status
// //           invoice.status = 'cancelled';
// //           invoice.notes += `\nBulk Cancelled: ${reason}`;
// //           await invoice.save({ session });
// //       }
// //   }, 3, { action: "BULK_CANCEL_INVOICE", userId: req.user._id });

// //   res.status(200).json({ status: "success", message: `${ids.length} invoices cancelled.` });
// // });

// // // --- Restore Soft-Deleted Invoice ---
// // exports.restoreInvoice = catchAsync(async (req, res, next) => {
// //   const invoice = await Invoice.findOneAndUpdate(
// //       { _id: req.params.id, organizationId: req.user.organizationId, isDeleted: true },
// //       { isDeleted: false },
// //       { new: true }
// //   );

// //   if (!invoice) return next(new AppError('Deleted invoice not found', 404));

// //   res.status(200).json({ status: 'success', data: { invoice } });
// // });

// // exports.getAllDrafts = catchAsync(async (req, res, next) => {
// //   const drafts = await Invoice.find({
// //       organizationId: req.user.organizationId,
// //       status: 'draft',
// //       isDeleted: { $ne: true }
// //   }).populate('customerId', 'name');
  
// //   res.status(200).json({ status: 'success', data: { invoices: drafts } });
// // });

// // exports.getDeletedInvoices = catchAsync(async (req, res, next) => {
// //   const trash = await Invoice.find({
// //       organizationId: req.user.organizationId,
// //       isDeleted: true
// //   }).populate('customerId', 'name');

// //   res.status(200).json({ status: 'success', data: { invoices: trash } });
// // });

// // // /* ======================================================
// // //    5. GET INVOICE PAYMENTS
// // // ====================================================== */
// // exports.getInvoicePayments = catchAsync(async (req, res, next) => {
// //   const payments = await Payment.find({
// //     invoiceId: req.params.id,
// //     organizationId: req.user.organizationId,
// //     isDeleted: { $ne: true }
// //   })
// //   .sort({ paymentDate: -1 })
// //   .populate('createdBy', 'name email');

// //   res.status(200).json({ 
// //     status: 'success', 
// //     results: payments.length, 
// //     data: { payments } 
// //   });
// // });
// // /* ======================================================
// //    4. ADD PAYMENT TO INVOICE (MUTUALLY EXCLUSIVE LOGIC)
// // ====================================================== */
// // exports.addPayment = catchAsync(async (req, res, next) => {
// //   // const { id } = req.params;
// //   // const { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body;

// //   // if (!amount || amount <= 0) {
// //   //   return next(new AppError('Payment amount must be positive', 400));
// //   // }
// // const { id } = req.params;
// //   let { amount, paymentMethod, referenceNumber, transactionId, notes } = req.body; // Change const to let

// //   // 🛡️ SAFETY: Force amount to be a number
// //   amount = Number(amount); 

// //   if (!amount || amount <= 0 || isNaN(amount)) {
// //     return next(new AppError('Payment amount must be a positive number', 400));
// //   }
// //   // 1. CHECK FOR EMI (Outside Transaction)
// //   const existingEmi = await EMI.findOne({ 
// //       invoiceId: id, 
// //       status: { $ne: 'cancelled' } 
// //   });

// //   // ============================================================
// //   // PATH A: EMI EXISTS (Run THIS or PATH B, never both)
// //   // ============================================================
// //   if (existingEmi) {
// //     // This service handles EVERYTHING (Payment, Ledger, Invoice Update)
// //     await emiService.reconcileExternalPayment({
// //       organizationId: req.user.organizationId,
// //       branchId: req.user.branchId, 
// //       invoiceId: id,
// //       amount: Number(amount),
// //       paymentMethod: paymentMethod || 'cash',
// //       referenceNumber: referenceNumber,
// //       transactionId: transactionId,
// //       remarks: notes || 'Payment added via Invoice Screen',
// //       createdBy: req.user._id
// //     });

// //     // 🛑 RETURN IMMEDIATELY so Path B doesn't run
// //     return res.status(200).json({
// //       status: 'success',
// //       message: 'Payment recorded and synced with EMI Plan'
// //     });
// //   } 
  
// //   // ============================================================
// //   // PATH B: NO EMI (Standard Invoice Logic)
// //   // ============================================================
// //   else {
// //     await runInTransaction(async (session) => {
// //       const invoice = await Invoice.findOne({
// //         _id: id,
// //         organizationId: req.user.organizationId
// //       }).session(session);

// //       if (!invoice) throw new AppError('Invoice not found', 404);
// //       if (invoice.status === 'cancelled') throw new AppError('Cannot add payment to cancelled invoice', 400);
// //       if (invoice.status === 'paid') throw new AppError('Invoice already fully paid', 400);

// //       const newPaidAmount = invoice.paidAmount + amount;
      
// //       // Validation to prevent overpayment
// //       if (newPaidAmount > invoice.grandTotal) {
// //         throw new AppError(
// //           `Payment exceeds invoice total. Maximum allowed: ${invoice.grandTotal - invoice.paidAmount}`,
// //           400
// //         );
// //       }

// //       // 1. Create Payment Record
// //       const [payment] = await Payment.create([{
// //           organizationId: req.user.organizationId,
// //           branchId: invoice.branchId,
// //           type: 'inflow',
// //           customerId: invoice.customerId,
// //           invoiceId: invoice._id,
// //           paymentDate: new Date(),
// //           amount: amount,
// //           paymentMethod: paymentMethod || invoice.paymentMethod || 'cash',
// //           transactionMode: 'manual',
// //           referenceNumber: referenceNumber,
// //           transactionId: transactionId,
// //           remarks: notes || `Payment for Invoice #${invoice.invoiceNumber}`,
// //           status: 'completed',
// //           allocationStatus: 'fully_allocated',
// //           remainingAmount: 0,
// //           allocatedTo: [{
// //               type: 'invoice',
// //               documentId: invoice._id,
// //               amount: amount,
// //               allocatedAt: new Date()
// //           }],
// //           createdBy: req.user._id
// //       }], { session });

// //       // 2. Create Accounting Entries (Ledger)
// //       await createPaymentAccountingEntries({ 
// //           invoice, 
// //           payment, 
// //           userId: req.user._id, 
// //           session 
// //       });

// //       // 3. Update Customer Balance
// //       await Customer.findByIdAndUpdate(
// //           invoice.customerId,
// //           { $inc: { outstandingBalance: -amount } },
// //           { session }
// //       );

// //       // 4. Update Invoice Status
// //       invoice.paidAmount = newPaidAmount;
// //       invoice.balanceAmount = invoice.grandTotal - newPaidAmount;
      
// //       if (invoice.balanceAmount <= 0) {
// //         invoice.paymentStatus = 'paid';
// //         invoice.status = 'paid';
// //       } else {
// //         invoice.paymentStatus = 'partial';
// //       }

// //       if (paymentMethod) invoice.paymentMethod = paymentMethod;
// //       if (notes) invoice.notes = (invoice.notes || '') + `\nPayment: ${notes}`;

// //       await invoice.save({ session });

// //       // 5. Audit Log
// //       await InvoiceAudit.create([{
// //         invoiceId: invoice._id,
// //         action: 'PAYMENT_ADDED',
// //         performedBy: req.user._id,
// //         details: `Payment of ${amount} added. New paid: ${newPaidAmount}`,
// //         ipAddress: req.ip
// //       }], { session });

// //     }, 3, { action: "ADD_PAYMENT", userId: req.user._id });

// //     // Success Response for Path B
// //     return res.status(200).json({
// //       status: 'success',
// //       message: 'Payment added successfully'
// //     });
// //   }
// // });


// // module.exports = exports;

