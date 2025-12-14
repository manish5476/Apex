const mongoose = require("mongoose");
const { z } = require("zod");
const { format } = require('fast-csv');

const Invoice = require("../models/invoiceModel");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel");
const Ledger = require('../models/ledgerModel');
const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel'); // ✅ Added for Accounting Fix
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

// 🛡️ 1. Validation Schema
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
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']).optional().default('sent'),
  paymentStatus: z.enum(['paid', 'unpaid', 'partial']).optional().default('unpaid'),
  shippingCharges: z.number().nonnegative().optional().default(0),
  notes: z.string().optional()
});

/* -------------------------------------------------------------
 * CREATE INVOICE (Transactional & Validated)
------------------------------------------------------------- */
exports.createInvoice = catchAsync(async (req, res, next) => {
  // Validate
  const validation = createInvoiceSchema.safeParse(req.body);
  if (!validation.success) {
    return next(new AppError(validation.error.errors[0].message, 400));
  }
  const body = validation.data;

  let newInvoice, salesDoc;

  await runInTransaction(async (session) => {
    // ---------------------------------------------------------
    // 1. PRE-PROCESS ITEMS (Fetch Names & Manage Inventory)
    // ---------------------------------------------------------
    const enrichedItems = [];
    
    // We loop through items FIRST to populate names and check stock
    for (const item of body.items) {
      const product = await Product.findById(item.productId).session(session);
      
      if (!product) {
        throw new AppError(`Product not found: ${item.productId}`, 404);
      }

      // Inventory Check
      const branchInv = product.inventory.find(
        (inv) => inv.branchId.toString() === req.user.branchId.toString()
      );

      if (!branchInv || branchInv.quantity < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`, 400);
      }
      
      // Deduct Stock
      branchInv.quantity -= item.quantity;
      await product.save({ session });

      // ✅ FIX 1: Populate the 'name' field required by Invoice Model
      enrichedItems.push({
        ...item,
        name: product.name, 
        sku: product.sku
      });
    }

    // ---------------------------------------------------------
    // 2. Create Invoice
    // ---------------------------------------------------------
    const invoiceArr = await Invoice.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      ...body,
      items: enrichedItems, // Use the items with names
    }], { session });
    
    newInvoice = invoiceArr[0];

    // ---------------------------------------------------------
    // 3. Update Customer Outstanding
    // ---------------------------------------------------------
    const totalDue = newInvoice.grandTotal - (body.paidAmount || 0);
    if (totalDue !== 0) {
      await Customer.findByIdAndUpdate(
        body.customerId,
        { $inc: { outstandingBalance: totalDue } },
        { session }
      );
    }

    // ---------------------------------------------------------
    // 4. Ledger Entry (Customer Party Ledger)
    // ---------------------------------------------------------
    await Ledger.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      customerId: body.customerId,
      invoiceId: newInvoice._id,
      type: "debit",
      amount: newInvoice.grandTotal,
      description: `Invoice #${newInvoice.invoiceNumber}`,
      accountType: "customer",
      createdBy: req.user._id,
    }], { session });

    // ---------------------------------------------------------
    // 5. Accounting Entries (Double Entry System)
    // ---------------------------------------------------------
    // ✅ FIX 2: Find actual Account IDs for Double Entry
    const arAccount = await Account.findOne({ 
      organizationId: req.user.organizationId, 
      name: 'Accounts Receivable' // Ensure this exact name exists in your Account list
    }).session(session);

    const salesAccount = await Account.findOne({ 
      organizationId: req.user.organizationId, 
      name: 'Sales' // Ensure this exact name exists in your Account list
    }).session(session);

    if (arAccount && salesAccount) {
        // Debit Accounts Receivable (Asset increases)
        await AccountEntry.create([{
            organizationId: req.user.organizationId,
            accountId: arAccount._id, // ✅ Using correct Account ID
            date: newInvoice.invoiceDate,
            debit: newInvoice.grandTotal,
            credit: 0,
            description: `Invoice ${newInvoice.invoiceNumber}`,
            referenceType: 'invoice',
            referenceId: newInvoice._id
        }], { session });

        // Credit Sales (Income increases)
        await AccountEntry.create([{
            organizationId: req.user.organizationId,
            accountId: salesAccount._id, // ✅ Using correct Account ID
            date: newInvoice.invoiceDate,
            debit: 0,
            credit: newInvoice.grandTotal,
            description: `Revenue - Inv ${newInvoice.invoiceNumber}`,
            referenceType: 'invoice',
            referenceId: newInvoice._id
        }], { session });
    } else {
      console.warn("Skipping Accounting Entries: 'Sales' or 'Accounts Receivable' account not found.");
    }

    // ---------------------------------------------------------
    // 6. Sales Record & Audit
    // ---------------------------------------------------------
    salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);

    await InvoiceAudit.create([{
      invoiceId: newInvoice._id,
      action: 'CREATE',
      performedBy: req.user._id,
      details: `Invoice #${newInvoice.invoiceNumber} created. Total: ${newInvoice.grandTotal}`,
      ipAddress: req.ip
    }], { session });

  }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

  // ---------------------------------------------------------
  // 7. Notifications
  // ---------------------------------------------------------
  try {
    emitToOrg(req.user.organizationId, "newNotification", {
      title: "New Sale",
      message: `Invoice #${newInvoice.invoiceNumber} for ₹${newInvoice.grandTotal}`,
      type: "success"
    });

    const org = await Organization.findById(req.user.organizationId).select('owner');
    if (org && org.owner) {
      createNotification(req.user.organizationId, org.owner, "INVOICE_CREATED", "New Sale", `Invoice generated by ${req.user.name}`, req.app.get("io"));
    }
  } catch (e) { console.error("Notification failed", e.message); }

  res.status(201).json({ status: "success", data: { invoice: newInvoice, sales: salesDoc } });
});

/* -------------------------------------------------------------
 * BULK STATUS UPDATE
------------------------------------------------------------- */
exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
  const { ids, status } = req.body;
  if (!ids || !Array.isArray(ids)) return next(new AppError("ids array required", 400));

  const result = await Invoice.updateMany(
    { _id: { $in: ids }, organizationId: req.user.organizationId },
    { $set: { status: status, paymentStatus: status === 'paid' ? 'paid' : 'unpaid' } }
  );

  res.status(200).json({ status: "success", message: `Updated ${result.modifiedCount} invoices.` });
});

/* -------------------------------------------------------------
 * VALIDATE INVOICE NUMBER
------------------------------------------------------------- */
exports.validateNumber = catchAsync(async (req, res, next) => {
  const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
  res.status(200).json({ status: "success", valid: !exists });
});

/* -------------------------------------------------------------
 * EXPORT INVOICES (CSV/JSON)
------------------------------------------------------------- */
exports.exportInvoices = catchAsync(async (req, res, next) => {
  const { format: fileFormat = 'csv', start, end } = req.query;
  const filter = { organizationId: req.user.organizationId };

  if (start || end) {
    filter.invoiceDate = {};
    if (start) filter.invoiceDate.$gte = new Date(start);
    if (end) filter.invoiceDate.$lte = new Date(end);
  }

  const docs = await Invoice.find(filter)
    .populate('customerId', 'name phone email')
    .sort({ invoiceDate: -1 })
    .lean();

  if (fileFormat === 'csv') {
    res.setHeader('Content-Disposition', `attachment; filename=invoices_${new Date().toISOString().slice(0,10)}.csv`);
    res.setHeader('Content-Type', 'text/csv');

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    docs.forEach(doc => {
      csvStream.write({
        'Date': doc.invoiceDate ? new Date(doc.invoiceDate).toLocaleDateString() : '-',
        'Invoice No': doc.invoiceNumber,
        'Customer Name': doc.customerId?.name || 'Walk-in',
        'Customer Phone': doc.customerId?.phone || '-',
        'Total Amount': doc.grandTotal || 0,
        'Paid Amount': doc.paidAmount || 0,
        'Balance': doc.balanceAmount || 0,
        'Status': doc.status,
        'Payment Status': doc.paymentStatus,
        'Items Summary': doc.items ? doc.items.map(i => `${i.name} (x${i.quantity})`).join(', ') : ''
      });
    });

    csvStream.end();
    return;
  }

  res.status(200).json({ status: 'success', results: docs.length, data: { invoices: docs } });
});

/* -------------------------------------------------------------
 * PROFIT SUMMARY
------------------------------------------------------------- */
exports.profitSummary = catchAsync(async (req, res, next) => {
  const { start, end } = req.query;
  const match = { organizationId: req.user.organizationId };
  if (start) match.createdAt = { ...match.createdAt, $gte: new Date(start) };
  if (end) match.createdAt = { ...match.createdAt, $lte: new Date(end) };

  const agg = await Invoice.aggregate([
    { $match: match },
    { $group: { _id: null, totalRevenue: { $sum: "$total" }, totalCost: { $sum: "$cost" }, count: { $sum: 1 } } }
  ]);

  const summary = agg[0] || { totalRevenue: 0, totalCost: 0, count: 0, profit: 0 };
  summary.profit = summary.totalRevenue - summary.totalCost;
  res.status(200).json({ status: "success", data: { summary } });
});

/* -------------------------------------------------------------
 * STANDARD CRUD & PDF
------------------------------------------------------------- */
exports.getAllInvoices = factory.getAll(Invoice);

exports.getInvoice = factory.getOne(Invoice, [
  { path: "customerId", select: "name phone email" },
  { path: "items.productId", select: "name sku brand category" }
]);

exports.updateInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return next(new AppError("Invoice not found", 404));

  const updates = req.body;
  
  if (updates.status && updates.status !== invoice.status) {
    await InvoiceAudit.create({
      invoiceId: invoice._id,
      action: 'STATUS_CHANGE',
      performedBy: req.user._id,
      details: `Status changed from ${invoice.status} to ${updates.status}`,
      meta: { old: invoice.status, new: updates.status },
      ipAddress: req.ip
    });
  } else {
    await InvoiceAudit.create({
      invoiceId: invoice._id,
      action: 'UPDATE',
      performedBy: req.user._id,
      details: `Invoice details updated`,
      meta: { updates },
      ipAddress: req.ip
    });
  }

  const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

  res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
});

exports.deleteInvoice = factory.deleteOne(Invoice);

exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
  const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId });
  res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
});

exports.downloadInvoice = catchAsync(async (req, res, next) => {
  const pdfBuffer = await invoicePDFService.generateInvoicePDF(req.params.id, req.user.organizationId);
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf` });
  res.send(pdfBuffer);
});

exports.emailInvoice = catchAsync(async (req, res, next) => {
  await invoicePDFService.sendInvoiceEmail(req.params.id, req.user.organizationId);
  res.status(200).json({ status: "success", message: "Emailed successfully." });
});

exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
  const invoiceId = req.params.id;
  const history = await InvoiceAudit.find({ invoiceId })
    .populate('performedBy', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({ 
    status: "success", 
    results: history.length, 
    data: { history } 
  });
});









// const mongoose = require("mongoose");
// const { z } = require("zod");

// const Invoice = require("../models/invoiceModel");
// const Product = require("../models/productModel");
// const Customer = require("../models/customerModel");
// const Ledger = require('../models/ledgerModel');
// const AccountEntry = require('../models/accountEntryModel');
// const Organization = require("../models/organizationModel");
// const SalesService = require("../services/salesService");
// const invoicePDFService = require("../services/invoicePDFService");

// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const factory = require("../utils/handlerFactory");
// const { runInTransaction } = require("../utils/runInTransaction");
// const { emitToOrg } = require("../utils/socket");
// const { createNotification } = require("../services/notificationService");
// const InvoiceAudit = require('../models/invoiceAuditModel');
// // 🛡️ 1. Validation Schema
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
//   status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']).optional().default('sent'),
//   paymentStatus: z.enum(['paid', 'unpaid', 'partial']).optional().default('unpaid'),
//   shippingCharges: z.number().nonnegative().optional().default(0),
//   notes: z.string().optional()
// });

// /* -------------------------------------------------------------
//  * CREATE INVOICE (Transactional & Validated)
// ------------------------------------------------------------- */
// exports.createInvoice = catchAsync(async (req, res, next) => {
//   // Validate
//   const validation = createInvoiceSchema.safeParse(req.body);
//   if (!validation.success) {
//     return next(new AppError(validation.error.errors[0].message, 400));
//   }
//   const body = validation.data;

//   let newInvoice, salesDoc;

//   await runInTransaction(async (session) => {
//     // 1. Create Invoice
//     const invoiceArr = await Invoice.create([{
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       createdBy: req.user._id,
//       ...body
//     }], { session });
//     newInvoice = invoiceArr[0];

//     // 2. Reduce Inventory
//     for (const item of body.items) {
//       const product = await Product.findById(item.productId).session(session);
//       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

//       const branchInv = product.inventory.find(
//         (inv) => inv.branchId.toString() === req.user.branchId.toString()
//       );

//       if (!branchInv || branchInv.quantity < item.quantity) {
//         throw new AppError(`Insufficient stock for ${product.name}`, 400);
//       }
//       branchInv.quantity -= item.quantity;
//       await product.save({ session });
//     }

//     // 3. Update Customer Outstanding
//     const totalDue = newInvoice.grandTotal - (body.paidAmount || 0);
//     if (totalDue !== 0) {
//       await Customer.findByIdAndUpdate(
//         body.customerId,
//         { $inc: { outstandingBalance: totalDue } },
//         { session }
//       );
//     }

//     // ✅ LOG CREATION
//     await InvoiceAudit.create([{
//       invoiceId: newInvoice._id,
//       action: 'CREATE',
//       performedBy: req.user._id,
//       details: `Invoice #${newInvoice.invoiceNumber} created with Grand Total: ${newInvoice.grandTotal}`,
//       ipAddress: req.ip
//     }], { session });

//     // 4. Ledger Entry (Party)
//     await Ledger.create([{
//       organizationId: req.user.organizationId,
//       branchId: req.user.branchId,
//       customerId: body.customerId,
//       invoiceId: newInvoice._id,
//       type: "debit",
//       amount: newInvoice.grandTotal,
//       description: `Invoice #${newInvoice.invoiceNumber}`,
//       accountType: "customer",
//       createdBy: req.user._id,
//     }], { session });

//     // 5. Sales Record
//     salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);

//     // 6. Accounting Entries (Double Entry)
//     // Debit AR
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId,
//       date: newInvoice.invoiceDate,
//       type: 'debit',
//       amount: newInvoice.grandTotal,
//       description: `Invoice ${newInvoice.invoiceNumber}`,
//       referenceId: newInvoice._id,
//       referenceModel: 'Invoice'
//     }], { session });

//     // Credit Sales
//     await AccountEntry.create([{
//       organizationId: req.user.organizationId,
//       date: newInvoice.invoiceDate,
//       type: 'credit',
//       amount: newInvoice.grandTotal,
//       description: `Revenue - Inv ${newInvoice.invoiceNumber}`,
//       referenceId: newInvoice._id,
//       referenceModel: 'Invoice'
//     }], { session });

//   }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

//   // 7. Notifications (After Transaction)
//   try {
//     emitToOrg(req.user.organizationId, "newNotification", {
//       title: "New Sale",
//       message: `Invoice #${newInvoice.invoiceNumber} for ₹${newInvoice.grandTotal}`,
//       type: "success"
//     });

//     // Notify Owner
//     const org = await Organization.findById(req.user.organizationId).select('owner');
//     if (org && org.owner) {
//       createNotification(req.user.organizationId, org.owner, "INVOICE_CREATED", "New Sale", `Invoice generated by ${req.user.name}`, req.app.get("io"));
//     }
//   } catch (e) { console.error("Notification failed", e.message); }

//   res.status(201).json({ status: "success", data: { invoice: newInvoice, sales: salesDoc } });
// });

// /* -------------------------------------------------------------
//  * BULK STATUS UPDATE (Productivity Feature)
// ------------------------------------------------------------- */
// exports.bulkUpdateStatus = catchAsync(async (req, res, next) => {
//   const { ids, status } = req.body;
//   if (!ids || !Array.isArray(ids)) return next(new AppError("ids array required", 400));

//   const result = await Invoice.updateMany(
//     { _id: { $in: ids }, organizationId: req.user.organizationId },
//     { $set: { status: status, paymentStatus: status === 'paid' ? 'paid' : 'unpaid' } }
//   );

//   res.status(200).json({ status: "success", message: `Updated ${result.modifiedCount} invoices.` });
// });

// /* -------------------------------------------------------------
//  * VALIDATE INVOICE NUMBER
// ------------------------------------------------------------- */
// exports.validateNumber = catchAsync(async (req, res, next) => {
//   const exists = await Invoice.exists({ invoiceNumber: req.params.number, organizationId: req.user.organizationId });
//   res.status(200).json({ status: "success", valid: !exists });
// });

// // /* -------------------------------------------------------------
// //  * EXPORT INVOICES (CSV/JSON)
// // ------------------------------------------------------------- */
// // exports.exportInvoices = catchAsync(async (req, res, next) => {
// //   const { format = 'csv', start, end } = req.query;
// //   const filter = { organizationId: req.user.organizationId };
// //   if (start) filter.createdAt = { ...filter.createdAt, $gte: new Date(start) };
// //   if (end) filter.createdAt = { ...filter.createdAt, $lte: new Date(end) };

// //   const docs = await Invoice.find(filter).lean();

// //   if (format === 'csv') {
// //     const headers = Object.keys(docs[0] || {});
// //     const rows = [headers.join(',')].concat(docs.map(d => headers.map(h => JSON.stringify(d[h] ?? '')).join(',')));
// //     res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv');
// //     res.setHeader('Content-Type', 'text/csv');
// //     return res.send(rows.join("\n"));
// //   }
// //   res.status(200).json({ status: 'success', results: docs.length, data: { invoices: docs } });
// // });
// const { format } = require('fast-csv'); // ✅ Ensure this is imported at the top

// /* -------------------------------------------------------------
//  * EXPORT INVOICES (Professional CSV with Customer Names)
// ------------------------------------------------------------- */
// exports.exportInvoices = catchAsync(async (req, res, next) => {
//   const { format: fileFormat = 'csv', start, end } = req.query;
//   const filter = { organizationId: req.user.organizationId };

//   // 1. Better Date Filtering (Using invoiceDate is usually better for reports)
//   if (start || end) {
//     filter.invoiceDate = {};
//     if (start) filter.invoiceDate.$gte = new Date(start);
//     if (end) filter.invoiceDate.$lte = new Date(end);
//   }

//   // 2. Fetch Data with Population
//   const docs = await Invoice.find(filter)
//     .populate('customerId', 'name phone email') // ✅ Get Customer Details
//     .sort({ invoiceDate: -1 }) // Newest first
//     .lean();

//   if (fileFormat === 'csv') {
//     // 3. Set Headers for Download
//     res.setHeader('Content-Disposition', `attachment; filename=invoices_${new Date().toISOString().slice(0,10)}.csv`);
//     res.setHeader('Content-Type', 'text/csv');

//     // 4. Create Stream with Specific Columns
//     const csvStream = format({ headers: true });
//     csvStream.pipe(res);

//     docs.forEach(doc => {
//       // 5. Write Clean Rows
//       csvStream.write({
//         'Date': doc.invoiceDate ? new Date(doc.invoiceDate).toLocaleDateString() : '-',
//         'Invoice No': doc.invoiceNumber,
//         'Customer Name': doc.customerId?.name || 'Walk-in',
//         'Customer Phone': doc.customerId?.phone || '-',
//         'Total Amount': doc.grandTotal || 0,
//         'Paid Amount': doc.paidAmount || 0,
//         'Balance': doc.balanceAmount || 0,
//         'Status': doc.status,
//         'Payment Status': doc.paymentStatus,
//         // Optional: List items in a single cell
//         'Items Summary': doc.items ? doc.items.map(i => `${i.name} (x${i.quantity})`).join(', ') : ''
//       });
//     });

//     csvStream.end();
//     return;
//   }

//   // Fallback for JSON
//   res.status(200).json({ status: 'success', results: docs.length, data: { invoices: docs } });
// });
// /* -------------------------------------------------------------
//  * PROFIT SUMMARY
// ------------------------------------------------------------- */
// exports.profitSummary = catchAsync(async (req, res, next) => {
//   const { start, end } = req.query;
//   const match = { organizationId: req.user.organizationId };
//   if (start) match.createdAt = { ...match.createdAt, $gte: new Date(start) };
//   if (end) match.createdAt = { ...match.createdAt, $lte: new Date(end) };

//   const agg = await Invoice.aggregate([
//     { $match: match },
//     { $group: { _id: null, totalRevenue: { $sum: "$total" }, totalCost: { $sum: "$cost" }, count: { $sum: 1 } } }
//   ]);

//   const summary = agg[0] || { totalRevenue: 0, totalCost: 0, count: 0, profit: 0 };
//   summary.profit = summary.totalRevenue - summary.totalCost;
//   res.status(200).json({ status: "success", data: { summary } });
// });

// /* -------------------------------------------------------------
//  * STANDARD CRUD & PDF
// ------------------------------------------------------------- */
// exports.getAllInvoices = factory.getAll(Invoice);
// exports.getInvoice = factory.getOne(Invoice, [
//   { path: "customerId", select: "name phone email" },
//   { path: "items.productId", select: "name sku brand category" }
// ]);
// exports.updateInvoice = exports.updateInvoice = catchAsync(async (req, res, next) => {
//   const invoice = await Invoice.findById(req.params.id);
//   if (!invoice) return next(new AppError("Invoice not found", 404));

//   const updates = req.body;
  
//   // ✅ LOG STATUS CHANGE
//   if (updates.status && updates.status !== invoice.status) {
//     await InvoiceAudit.create({
//       invoiceId: invoice._id,
//       action: 'STATUS_CHANGE',
//       performedBy: req.user._id,
//       details: `Status changed from ${invoice.status} to ${updates.status}`,
//       meta: { old: invoice.status, new: updates.status },
//       ipAddress: req.ip
//     });
//   } else {
//     // ✅ LOG GENERAL UPDATE
//     await InvoiceAudit.create({
//       invoiceId: invoice._id,
//       action: 'UPDATE',
//       performedBy: req.user._id,
//       details: `Invoice details updated`,
//       meta: { updates },
//       ipAddress: req.ip
//     });
//   }

//   // Perform the actual update
//   const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

//   res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
// });
// // factory.updateOne(Invoice);
// exports.deleteInvoice = factory.deleteOne(Invoice);

// exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
//   const invoices = await Invoice.find({ organizationId: req.user.organizationId, customerId: req.params.customerId });
//   res.status(200).json({ status: "success", results: invoices.length, data: { invoices } });
// });

// exports.downloadInvoice = catchAsync(async (req, res, next) => {
//   const pdfBuffer = await invoicePDFService.generateInvoicePDF(req.params.id, req.user.organizationId);
//   res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf` });
//   res.send(pdfBuffer);
// });

// exports.emailInvoice = catchAsync(async (req, res, next) => {
//   await invoicePDFService.sendInvoiceEmail(req.params.id, req.user.organizationId);
//   res.status(200).json({ status: "success", message: "Emailed successfully." });
// });

// exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
//   const invoiceId = req.params.id;
  
//   // ✅ Now this works!
//   const history = await InvoiceAudit.find({ invoiceId })
//     .populate('performedBy', 'name email') // Show who did it
//     .sort({ createdAt: -1 }); // Newest actions first

//   res.status(200).json({ 
//     status: "success", 
//     results: history.length, 
//     data: { history } 
//   });
// });
