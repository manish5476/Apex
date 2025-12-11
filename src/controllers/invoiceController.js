const mongoose = require("mongoose");
const { z } = require("zod");

const Invoice = require("../models/invoiceModel");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel");
const Ledger = require('../models/ledgerModel');
const AccountEntry = require('../models/accountEntryModel');
const Organization = require("../models/organizationModel");
const SalesService = require("../services/salesService");
const invoicePDFService = require("../services/invoicePDFService");

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const factory = require("../utils/handlerFactory");
const { runInTransaction } = require("../utils/runInTransaction");
const { emitToOrg } = require("../utils/socket");
const { createNotification } = require("../services/notificationService");
const InvoiceAudit = require('../models/invoiceAuditModel');
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
    // 1. Create Invoice
    const invoiceArr = await Invoice.create([{
      organizationId: req.user.organizationId,
      branchId: req.user.branchId,
      createdBy: req.user._id,
      ...body
    }], { session });
    newInvoice = invoiceArr[0];

    // 2. Reduce Inventory
    for (const item of body.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

      const branchInv = product.inventory.find(
        (inv) => inv.branchId.toString() === req.user.branchId.toString()
      );

      if (!branchInv || branchInv.quantity < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`, 400);
      }
      branchInv.quantity -= item.quantity;
      await product.save({ session });
    }

    // 3. Update Customer Outstanding
    const totalDue = newInvoice.grandTotal - (body.paidAmount || 0);
    if (totalDue !== 0) {
      await Customer.findByIdAndUpdate(
        body.customerId,
        { $inc: { outstandingBalance: totalDue } },
        { session }
      );
    }

    // ✅ LOG CREATION
    await InvoiceAudit.create([{
      invoiceId: newInvoice._id,
      action: 'CREATE',
      performedBy: req.user._id,
      details: `Invoice #${newInvoice.invoiceNumber} created with Grand Total: ${newInvoice.grandTotal}`,
      ipAddress: req.ip
    }], { session });

    // 4. Ledger Entry (Party)
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

    // 5. Sales Record
    salesDoc = await SalesService.createFromInvoiceTransactional(newInvoice, session);

    // 6. Accounting Entries (Double Entry)
    // Debit AR
    await AccountEntry.create([{
      organizationId: req.user.organizationId,
      date: newInvoice.invoiceDate,
      type: 'debit',
      amount: newInvoice.grandTotal,
      description: `Invoice ${newInvoice.invoiceNumber}`,
      referenceId: newInvoice._id,
      referenceModel: 'Invoice'
    }], { session });

    // Credit Sales
    await AccountEntry.create([{
      organizationId: req.user.organizationId,
      date: newInvoice.invoiceDate,
      type: 'credit',
      amount: newInvoice.grandTotal,
      description: `Revenue - Inv ${newInvoice.invoiceNumber}`,
      referenceId: newInvoice._id,
      referenceModel: 'Invoice'
    }], { session });

  }, 3, { action: "CREATE_INVOICE", userId: req.user._id });

  // 7. Notifications (After Transaction)
  try {
    emitToOrg(req.user.organizationId, "newNotification", {
      title: "New Sale",
      message: `Invoice #${newInvoice.invoiceNumber} for ₹${newInvoice.grandTotal}`,
      type: "success"
    });

    // Notify Owner
    const org = await Organization.findById(req.user.organizationId).select('owner');
    if (org && org.owner) {
      createNotification(req.user.organizationId, org.owner, "INVOICE_CREATED", "New Sale", `Invoice generated by ${req.user.name}`, req.app.get("io"));
    }
  } catch (e) { console.error("Notification failed", e.message); }

  res.status(201).json({ status: "success", data: { invoice: newInvoice, sales: salesDoc } });
});

/* -------------------------------------------------------------
 * BULK STATUS UPDATE (Productivity Feature)
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
  const { format = 'csv', start, end } = req.query;
  const filter = { organizationId: req.user.organizationId };
  if (start) filter.createdAt = { ...filter.createdAt, $gte: new Date(start) };
  if (end) filter.createdAt = { ...filter.createdAt, $lte: new Date(end) };

  const docs = await Invoice.find(filter).lean();

  if (format === 'csv') {
    const headers = Object.keys(docs[0] || {});
    const rows = [headers.join(',')].concat(docs.map(d => headers.map(h => JSON.stringify(d[h] ?? '')).join(',')));
    res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv');
    res.setHeader('Content-Type', 'text/csv');
    return res.send(rows.join("\n"));
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
exports.updateInvoice = exports.updateInvoice = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return next(new AppError("Invoice not found", 404));

  const updates = req.body;
  
  // ✅ LOG STATUS CHANGE
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
    // ✅ LOG GENERAL UPDATE
    await InvoiceAudit.create({
      invoiceId: invoice._id,
      action: 'UPDATE',
      performedBy: req.user._id,
      details: `Invoice details updated`,
      meta: { updates },
      ipAddress: req.ip
    });
  }

  // Perform the actual update
  const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

  res.status(200).json({ status: "success", data: { invoice: updatedInvoice } });
});
// factory.updateOne(Invoice);
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
  
  // ✅ Now this works!
  const history = await InvoiceAudit.find({ invoiceId })
    .populate('performedBy', 'name email') // Show who did it
    .sort({ createdAt: -1 }); // Newest actions first

  res.status(200).json({ 
    status: "success", 
    results: history.length, 
    data: { history } 
  });
});

// const Invoice = require("../models/invoiceModel");
// const Product = require("../models/productModel");
// const Customer = require("../models/customerModel");
// const Ledger = require('../models/ledgerModel');
// const Organization = require("../models/organizationModel"); // ✅ Needed to find Owner
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");
// const mongoose = require("mongoose");
// const invoicePDFService = require("../services/invoicePDFService");
// const SalesService = require("../services/salesService");
// const { runInTransaction } = require("../utils/runInTransaction");
// const factory = require("../utils/handlerFactory");

// // ✅ IMPORT NOTIFICATION HELPERS
// const { emitToOrg } = require("../utils/socket");
// const { createNotification } = require("../services/notificationService");

// exports.createInvoice = catchAsync(async (req, res, next) => {
//   const {
//     customerId,
//     items,
//     invoiceNumber,
//     invoiceDate,
//     dueDate,
//     paidAmount,
//     paymentStatus,
//     notes,
//     status,
//     shippingCharges,
//   } = req.body;

//   if (!customerId || !Array.isArray(items) || items.length === 0) {
//     return next(new AppError("customerId and items[] required.", 400));
//   }

//   let newInvoice, salesDoc;

//   /* -------------------------------------------------------------
//    * EXECUTE ENTIRE WORKFLOW INSIDE SAFE RETRY TRANSACTION
//    ------------------------------------------------------------- */
//   await runInTransaction(async (session) => {

//     /* -------------------------------------------------------------
//       * STEP 1 — Create Invoice
//      ------------------------------------------------------------- */
//     const invoiceArr = await Invoice.create(
//       [
//         {
//           organizationId: req.user.organizationId,
//           branchId: req.user.branchId,
//           customerId,
//           items,
//           invoiceNumber,
//           invoiceDate,
//           dueDate,
//           shippingCharges,
//           paidAmount,
//           paymentStatus,
//           notes,
//           status,
//           createdBy: req.user._id,
//         },
//       ],
//       { session }
//     );

//     newInvoice = invoiceArr[0];

//     /* -------------------------------------------------------------
//       * STEP 2 — Reduce Inventory
//      ------------------------------------------------------------- */
//     for (const item of items) {
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

//     /* -------------------------------------------------------------
//       * STEP 3 — Update Customer Outstanding
//      ------------------------------------------------------------- */
//     const totalDue = newInvoice.grandTotal - (paidAmount || 0);

//     await Customer.findByIdAndUpdate(
//       customerId,
//       { $inc: { outstandingBalance: totalDue } },
//       { session }
//     );

//     /* -------------------------------------------------------------
//       * STEP 4 — Ledger Entry
//      ------------------------------------------------------------- */
//     await Ledger.create(
//       [
//         {
//           organizationId: req.user.organizationId,
//           branchId: req.user.branchId,
//           customerId,
//           invoiceId: newInvoice._id,
//           type: "debit",
//           amount: newInvoice.grandTotal,
//           description: `Invoice ${invoiceNumber || newInvoice._id} created`,
//           accountType: "customer",
//           createdBy: req.user._id,
//         },
//       ],
//       { session }
//     );

//     /* -------------------------------------------------------------
//       * STEP 5 — Sales Record (inside transaction)
//      ------------------------------------------------------------- */
//     salesDoc = await SalesService.createFromInvoiceTransactional(
//       newInvoice,
//       session
//     );
//   }, 3, {
//     action: "CREATE_INVOICE",
//     customerId,
//     branchId: req.user.branchId,
//     userId: req.user._id,
//   });

//   /* -------------------------------------------------------------
//    * STEP 6 — Journal Entries (AFTER TRANSACTION)
//    ------------------------------------------------------------- */
//   try {
//     const orgId = req.user.organizationId;
//     const date = newInvoice.invoiceDate || newInvoice.createdAt || new Date();
//     const amt = Number(newInvoice.grandTotal || 0);

//     // Call Journal Service
//     // await postJournalEntries(...) // Assuming this function exists globally or is imported
//   } catch (err) {
//     console.log("Journal entry failed after commit:", err.message);
//   }

//   /* -------------------------------------------------------------
//    * STEP 7 — NOTIFICATIONS (✅ NEW ADDITION)
//    ------------------------------------------------------------- */
//   try {
//     // 1. Send Real-time Socket Alert to Organization (Owner + Admins)
//     emitToOrg(req.user.organizationId, "newNotification", {
//       title: "New Sale Recorded",
//       message: `Invoice #${newInvoice.invoiceNumber} created for ₹${newInvoice.grandTotal}`,
//       type: "success",
//       createdAt: new Date()
//     });

//     // 2. Persist in Database (Optional: Find Owner to log it specifically for them)
//     const org = await Organization.findById(req.user.organizationId).select('owner');
//     if (org && org.owner) {
//         await createNotification(
//             req.user.organizationId,
//             org.owner, // Assign to Owner
//             "INVOICE_CREATED",
//             "New Invoice Generated",
//             `Invoice #${newInvoice.invoiceNumber} generated by ${req.user.name}`,
//             req.app.get("io")
//         );
//     }
//   } catch (notifErr) {
//     console.error("Failed to send sale notification:", notifErr.message);
//   }

//   /* -------------------------------------------------------------
//    * STEP 8 — RESPONSE
//    ------------------------------------------------------------- */
//   return res.status(201).json({
//     status: "success",
//     message: "Invoice created successfully",
//     data: { invoice: newInvoice, sales: salesDoc },
//   });
// });

// /* -------------------------------------------------------------
//  * Get All Invoices (Organization Scoped)
// ------------------------------------------------------------- */
// exports.getAllInvoices = factory.getAll(Invoice);

// /* -------------------------------------------------------------
//  * Get One Invoice (With Populations)
// ------------------------------------------------------------- */
// exports.getInvoice = factory.getOne(Invoice, [
//   { path: "customerId", select: "name phone email" },
//   { path: "items.productId", select: "name sku brand category" },
// ]);

// /* -------------------------------------------------------------
//  * Update Invoice (Admin Only)
// ------------------------------------------------------------- */
// exports.updateInvoice = factory.updateOne(Invoice);

// /* -------------------------------------------------------------
//  * Delete Invoice (Soft Delete Supported)
// ------------------------------------------------------------- */
// exports.deleteInvoice = factory.deleteOne(Invoice);

// /* -------------------------------------------------------------
//  * Get Invoices by Customer
// ------------------------------------------------------------- */
// exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;

//   const invoices = await Invoice.find({
//     organizationId: req.user.organizationId,
//     customerId,
//     isDeleted: { $ne: true },
//   });

//   res.status(200).json({
//     status: "success",
//     results: invoices.length,
//     data: { invoices },
//   });
// });

// exports.downloadInvoice = catchAsync(async (req, res, next) => {
//   const pdfBuffer = await invoicePDFService.generateInvoicePDF(
//     req.params.id,
//     req.user.organizationId,
//   );
//   res.set({
//     "Content-Type": "application/pdf",
//     "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf`,
//   });
//   res.send(pdfBuffer);
// });

// exports.emailInvoice = catchAsync(async (req, res, next) => {
//   await invoicePDFService.sendInvoiceEmail(
//     req.params.id,
//     req.user.organizationId,
//   );
//   res
//     .status(200)
//     .json({ status: "success", message: "Invoice emailed successfully." });
// });



// // GET /v1/invoices/validate-number/:number
// exports.validateNumber = catchAsync(async (req, res, next) => {
//   const number = req.params.number;
//   const exists = await Invoice.exists({ invoiceNumber: number, organizationId: req.user.organizationId });
//   res.status(200).json({ status: "success", valid: !exists });
// });

// // GET /v1/invoices/export?format=csv&start=&end=
// exports.exportInvoices = catchAsync(async (req, res, next) => {
//   const { format = 'csv', start, end } = req.query;
//   const filter = { organizationId: req.user.organizationId };
//   if (start || end) filter.createdAt = {};
//   if (start) filter.createdAt.$gte = new Date(start);
//   if (end) filter.createdAt.$lte = new Date(end);

//   const docs = await Invoice.find(filter).lean();

//   if (format === 'csv') {
//     // quick CSV serializer
//     const headers = Object.keys(docs[0] || {});
//     const rows = [headers.join(',')].concat(docs.map(d => headers.map(h => JSON.stringify(d[h] ?? '')).join(',')));
//     res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv');
//     res.setHeader('Content-Type', 'text/csv');
//     return res.send(rows.join("\n"));
//   }

//   // for other formats return JSON
//   res.status(200).json({ status: 'success', results: docs.length, data: { invoices: docs } });
// });

// // GET /v1/invoices/profit-summary?start=&end=
// exports.profitSummary = catchAsync(async (req, res, next) => {
//   const { start, end } = req.query;
//   const match = { organizationId: req.user.organizationId };
//   if (start || end) match.createdAt = {};
//   if (start) match.createdAt.$gte = new Date(start);
//   if (end) match.createdAt.$lte = new Date(end);

//   // assumes invoice has fields: total, cost
//   const agg = await Invoice.aggregate([
//     { $match: match },
//     {
//       $group: {
//         _id: null,
//         totalRevenue: { $sum: "$total" },
//         totalCost: { $sum: "$cost" },
//         count: { $sum: 1 }
//       }
//     }
//   ]);

//   const summary = agg[0] || { totalRevenue: 0, totalCost: 0, count: 0, profit: 0 };
//   summary.profit = summary.totalRevenue - summary.totalCost;
//   res.status(200).json({ status: "success", data: { summary } });
// });

// // GET /v1/invoices/:id/history
// exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
//   const invoiceId = req.params.id;
//   // const InvoiceAudit = require('../models/invoiceAuditModel'); // optional
//   const history = await InvoiceAudit.find({ invoiceId }).sort({ createdAt: -1 }).limit(200);
//   res.status(200).json({ status: "success", results: history.length, data: { history } });
// });

// // const Invoice = require("../models/invoiceModel");
// // const Product = require("../models/productModel");
// // const Customer = require("../models/customerModel");
// // const Ledger = require('../models/ledgerModel');
// // const catchAsync = require("../utils/catchAsync");
// // const AppError = require("../utils/appError");
// // const mongoose = require("mongoose");
// // const invoicePDFService = require("../services/invoicePDFService");
// // const SalesService = require("../services/salesService"); // FIXED CASING
// // const { runInTransaction } = require("../utils/runInTransaction"); // NEW import
// // const factory = require("../utils/handlerFactory");

// // exports.createInvoice = catchAsync(async (req, res, next) => {
// //   const {
// //     customerId,
// //     items,
// //     invoiceNumber,
// //     invoiceDate,
// //     dueDate,
// //     paidAmount,
// //     paymentStatus,
// //     notes,
// //     status,
// //     shippingCharges,
// //   } = req.body;

// //   if (!customerId || !Array.isArray(items) || items.length === 0) {
// //     return next(new AppError("customerId and items[] required.", 400));
// //   }

// //   let newInvoice, salesDoc;

// //   /* -------------------------------------------------------------
// //    * EXECUTE ENTIRE WORKFLOW INSIDE SAFE RETRY TRANSACTION
// //   ------------------------------------------------------------- */
// //   await runInTransaction(async (session) => {

// //     /* -------------------------------------------------------------
// //      * STEP 1 — Create Invoice
// //     ------------------------------------------------------------- */
// //     const invoiceArr = await Invoice.create(
// //       [
// //         {
// //           organizationId: req.user.organizationId,
// //           branchId: req.user.branchId,
// //           customerId,
// //           items,
// //           invoiceNumber,
// //           invoiceDate,
// //           dueDate,
// //           shippingCharges,
// //           paidAmount,
// //           paymentStatus,
// //           notes,
// //           status,
// //           createdBy: req.user._id,
// //         },
// //       ],
// //       { session }
// //     );

// //     newInvoice = invoiceArr[0];

// //     /* -------------------------------------------------------------
// //      * STEP 2 — Reduce Inventory
// //     ------------------------------------------------------------- */
// //     for (const item of items) {
// //       const product = await Product.findById(item.productId).session(session);
// //       if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

// //       const branchInv = product.inventory.find(
// //         (inv) => inv.branchId.toString() === req.user.branchId.toString()
// //       );

// //       if (!branchInv || branchInv.quantity < item.quantity) {
// //         throw new AppError(`Insufficient stock for ${product.name}`, 400);
// //       }

// //       branchInv.quantity -= item.quantity;
// //       await product.save({ session });
// //     }

// //     /* -------------------------------------------------------------
// //      * STEP 3 — Update Customer Outstanding
// //     ------------------------------------------------------------- */
// //     const totalDue = newInvoice.grandTotal - (paidAmount || 0);

// //     await Customer.findByIdAndUpdate(
// //       customerId,
// //       { $inc: { outstandingBalance: totalDue } },
// //       { session }
// //     );

// //     /* -------------------------------------------------------------
// //      * STEP 4 — Ledger Entry
// //     ------------------------------------------------------------- */
// //     await Ledger.create(
// //       [
// //         {
// //           organizationId: req.user.organizationId,
// //           branchId: req.user.branchId,
// //           customerId,
// //           invoiceId: newInvoice._id,
// //           type: "debit",
// //           amount: newInvoice.grandTotal,
// //           description: `Invoice ${invoiceNumber || newInvoice._id} created`,
// //           accountType: "customer",
// //           createdBy: req.user._id,
// //         },
// //       ],
// //       { session }
// //     );

// //     /* -------------------------------------------------------------
// //      * STEP 5 — Sales Record (inside transaction)
// //     ------------------------------------------------------------- */
// //     salesDoc = await SalesService.createFromInvoiceTransactional(
// //       newInvoice,
// //       session
// //     );
// //   }, 3, {
// //     action: "CREATE_INVOICE",
// //     customerId,
// //     branchId: req.user.branchId,
// //     userId: req.user._id,
// //   });

// //   /* -------------------------------------------------------------
// //    * STEP 6 — Journal Entries (AFTER TRANSACTION)
// //   ------------------------------------------------------------- */
// //   try {
// //     const orgId = req.user.organizationId;
// //     const date = newInvoice.invoiceDate || newInvoice.createdAt || new Date();
// //     const amt = Number(newInvoice.grandTotal || 0);

// //     await postJournalEntries(
// //       orgId,
// //       date,
// //       [
// //         {
// //           accountCode: "AR",
// //           debit: amt,
// //           description: `Invoice ${newInvoice.invoiceNumber}`,
// //           referenceType: "invoice",
// //           referenceId: newInvoice._id,
// //         },
// //         {
// //           accountCode: "SALES",
// //           credit: amt,
// //           description: `Invoice ${newInvoice.invoiceNumber}`,
// //           referenceType: "invoice",
// //           referenceId: newInvoice._id,
// //         },
// //       ],
// //       { updateBalances: true }
// //     );
// //   } catch (err) {
// //     console.log("Journal entry failed after commit:", err.message);
// //   }

// //   /* -------------------------------------------------------------
// //    * STEP 7 — RESPONSE
// //   ------------------------------------------------------------- */
// //   return res.status(201).json({
// //     status: "success",
// //     message: "Invoice created successfully",
// //     data: { invoice: newInvoice, sales: salesDoc },
// //   });
// // });

// // /* -------------------------------------------------------------
// //  * Get All Invoices (Organization Scoped)
// // ------------------------------------------------------------- */
// // exports.getAllInvoices = factory.getAll(Invoice);

// // /* -------------------------------------------------------------
// //  * Get One Invoice (With Populations)
// // ------------------------------------------------------------- */
// // exports.getInvoice = factory.getOne(Invoice, [
// //   { path: "customerId", select: "name phone email" },
// //   { path: "items.productId", select: "name sku brand category" },
// // ]);

// // /* -------------------------------------------------------------
// //  * Update Invoice (Admin Only)
// // ------------------------------------------------------------- */
// // exports.updateInvoice = factory.updateOne(Invoice);

// // /* -------------------------------------------------------------
// //  * Delete Invoice (Soft Delete Supported)
// // ------------------------------------------------------------- */
// // exports.deleteInvoice = factory.deleteOne(Invoice);

// // /* -------------------------------------------------------------
// //  * Get Invoices by Customer
// // ------------------------------------------------------------- */
// // exports.getInvoicesByCustomer = catchAsync(async (req, res, next) => {
// //   const { customerId } = req.params;

// //   const invoices = await Invoice.find({
// //     organizationId: req.user.organizationId,
// //     customerId,
// //     isDeleted: { $ne: true },
// //   });

// //   res.status(200).json({
// //     status: "success",
// //     results: invoices.length,
// //     data: { invoices },
// //   });
// // });

// // exports.downloadInvoice = catchAsync(async (req, res, next) => {
// //   const pdfBuffer = await invoicePDFService.generateInvoicePDF(
// //     req.params.id,
// //     req.user.organizationId,
// //   );
// //   res.set({
// //     "Content-Type": "application/pdf",
// //     "Content-Disposition": `inline; filename=invoice_${req.params.id}.pdf`,
// //   });
// //   res.send(pdfBuffer);
// // });

// // exports.emailInvoice = catchAsync(async (req, res, next) => {
// //   await invoicePDFService.sendInvoiceEmail(
// //     req.params.id,
// //     req.user.organizationId,
// //   );
// //   res
// //     .status(200)
// //     .json({ status: "success", message: "Invoice emailed successfully." });
// // });



// // // GET /v1/invoices/validate-number/:number
// // exports.validateNumber = catchAsync(async (req, res, next) => {
// //   const number = req.params.number;
// //   const exists = await Invoice.exists({ invoiceNumber: number, organizationId: req.user.organizationId });
// //   res.status(200).json({ status: "success", valid: !exists });
// // });

// // // GET /v1/invoices/export?format=csv&start=&end=
// // exports.exportInvoices = catchAsync(async (req, res, next) => {
// //   const { format = 'csv', start, end } = req.query;
// //   const filter = { organizationId: req.user.organizationId };
// //   if (start || end) filter.createdAt = {};
// //   if (start) filter.createdAt.$gte = new Date(start);
// //   if (end) filter.createdAt.$lte = new Date(end);

// //   const docs = await Invoice.find(filter).lean();

// //   if (format === 'csv') {
// //     // quick CSV serializer
// //     const headers = Object.keys(docs[0] || {});
// //     const rows = [headers.join(',')].concat(docs.map(d => headers.map(h => JSON.stringify(d[h] ?? '')).join(',')));
// //     res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv');
// //     res.setHeader('Content-Type', 'text/csv');
// //     return res.send(rows.join("\n"));
// //   }

// //   // for other formats return JSON
// //   res.status(200).json({ status: 'success', results: docs.length, data: { invoices: docs } });
// // });

// // // GET /v1/invoices/profit-summary?start=&end=
// // exports.profitSummary = catchAsync(async (req, res, next) => {
// //   const { start, end } = req.query;
// //   const match = { organizationId: req.user.organizationId };
// //   if (start || end) match.createdAt = {};
// //   if (start) match.createdAt.$gte = new Date(start);
// //   if (end) match.createdAt.$lte = new Date(end);

// //   // assumes invoice has fields: total, cost
// //   const agg = await Invoice.aggregate([
// //     { $match: match },
// //     {
// //       $group: {
// //         _id: null,
// //         totalRevenue: { $sum: "$total" },
// //         totalCost: { $sum: "$cost" },
// //         count: { $sum: 1 }
// //       }
// //     }
// //   ]);

// //   const summary = agg[0] || { totalRevenue: 0, totalCost: 0, count: 0, profit: 0 };
// //   summary.profit = summary.totalRevenue - summary.totalCost;
// //   res.status(200).json({ status: "success", data: { summary } });
// // });

// // // GET /v1/invoices/:id/history
// // exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
// //   const invoiceId = req.params.id;
// //   // const InvoiceAudit = require('../models/invoiceAuditModel'); // optional
// //   const history = await InvoiceAudit.find({ invoiceId }).sort({ createdAt: -1 }).limit(200);
// //   res.status(200).json({ status: "success", results: history.length, data: { history } });
// // });
