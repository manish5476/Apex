

const Customer = require('./customer.model');
const Invoice = require('../../accounting/billing/invoice.model'); // ✅ Added for Integrity Check
const factory = require('../../../core/utils/handlerFactory');
const AppError = require("../../../core/utils/appError");
const catchAsync = require("../../../core/utils/catchAsync");
const imageUploadService = require("../../_legacy/services/uploads/imageUploadService");

// PATCH /v1/customers/:id/credit-limit
exports.updateCreditLimit = catchAsync(async (req, res, next) => {
  const { creditLimit } = req.body;
  if (typeof creditLimit !== "number") return next(new AppError("creditLimit must be a number", 400));

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { creditLimit },
    { new: true, runValidators: true }
  );
  if (!customer) return next(new AppError("Customer not found", 404));
  res.status(200).json({ status: "success", data: { customer } });
});

// ======================================================
// DELETE CUSTOMER (Safeguarded)
// ======================================================
exports.deleteCustomer = catchAsync(async (req, res, next) => {
  const customerId = req.params.id;
  const orgId = req.user.organizationId;

  // 1. Check for Active Invoices
  // We cannot delete a customer if they have invoices that are NOT cancelled.
  const hasInvoices = await Invoice.exists({
      customerId: customerId,
      organizationId: orgId,
      status: { $ne: 'cancelled' }
  });

  if (hasInvoices) {
      return next(new AppError(
          "CANNOT DELETE: This customer has active Invoices in the system. \n" +
          "-> Action: Mark the customer as 'Inactive' instead, or cancel all their invoices first.",
          409 // Conflict
      ));
  }

  // 2. Check for Outstanding Balance (Financial Safety)
  const customer = await Customer.findOne({ _id: customerId, organizationId: orgId });
  if (!customer) return next(new AppError("Customer not found", 404));

  if (Math.abs(customer.outstandingBalance) > 1) { // Tolerate < 1 floating point diff
      return next(new AppError(
          `CANNOT DELETE: This customer has a balance of ₹${customer.outstandingBalance}. \n` +
          "-> You must settle the payment or write it off before deleting.",
          409
      ));
  }
  // 3. Safe Soft Delete
  customer.isDeleted = true;
  customer.isActive = false;
  await customer.save();

  res.status(200).json({ status: "success", message: "Customer deleted successfully." });
});

exports.createCustomer = factory.createOne(Customer);
exports.getAllCustomers = factory.getAll(Customer);
exports.getCustomer = factory.getOne(Customer);
exports.updateCustomer = factory.updateOne(Customer);
exports.restoreCustomer = factory.restoreOne(Customer);
exports.createBulkCustomer = factory.bulkCreate(Customer);
// ======================================================
// SEARCH CUSTOMERS
// ======================================================
exports.searchCustomers = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const orgId = req.user.organizationId;

  const customers = await Customer.find({
    organizationId: orgId,
    $or: [
      { name: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { gstNumber: { $regex: q, $options: "i" } },
    ],
  }).limit(20);

  res.status(200).json({
    status: "success",
    results: customers.length,
    data: { customers },
  });
});

// ======================================================
// BULK UPDATE
// ======================================================
exports.bulkUpdateCustomers = catchAsync(async (req, res, next) => {
  const updates = req.body;
  if (!Array.isArray(updates) || updates.length === 0) { return next(new AppError("Provide an array of customer updates.", 400)); }
  const orgId = req.user.organizationId;
  const operations = updates.map((c) => ({
    updateOne: {
      filter: { _id: c._id, organizationId: orgId },
      update: { $set: c.update },
    },
  }));
  await Customer.bulkWrite(operations);
  res.status(200).json({ status: "success", message: "Bulk update complete" });
});

// ======================================================
// UPLOAD PHOTO
// ======================================================
exports.uploadCustomerPhoto = catchAsync(async (req, res, next) => {
  const customerId = req.params.id;
  if (!req.file || !req.file.buffer) {
    return next(new AppError("Please upload an image file.", 400));
  }
  const folder = `customers/${req.user.organizationId}`;
  const uploadResult = await imageUploadService.uploadImage(req.file.buffer, folder);
  const customer = await Customer.findOneAndUpdate(
    { _id: customerId, organizationId: req.user.organizationId },
    { avatar: uploadResult.url },
    { new: true }
  );

  if (!customer) return next(new AppError("Customer not found.", 404));
  res.status(200).json({ status: "success", message: "Customer photo updated", data: { customer } });
});

// ======================================================
// CHECK DUPLICATE
// ======================================================
exports.checkDuplicate = catchAsync(async (req, res, next) => {
  const { email, phone, name } = req.query;
  const orgId = req.user.organizationId;

  const query = { organizationId: orgId, $or: [] };
  if (email) query.$or.push({ email: email });
  if (phone) query.$or.push({ phone: phone });
  if (name) query.$or.push({ name: { $regex: `^${name}$`, $options: 'i' } });

  if (query.$or.length === 0) {
    return res.status(200).json({ status: "success", isDuplicate: false });
  }

  const existing = await Customer.findOne(query).select("name email phone");
  res.status(200).json({
    status: "success",
    isDuplicate: !!existing,
    existingCustomer: existing || null
  });
});

// // In your controller
// const { CrudHandlerFactory } = require('./handlerFactory');

// const userHandler = new CrudHandlerFactory(User, {
//   allowedRoles: ['admin', 'manager'],
//   fieldPermissions: {
//     create: ['name', 'email', 'role'],
//     update: ['name', 'avatar']
//   },
//   preHooks: {
//     getAll: async (req) => {
//       // Custom logic before getAll
//       if (req.user.role === 'manager') {
//         req.query.department = req.user.department;
//       }
//     }
//   },
//   population: {
//     department: { select: 'name' },
//     projects: { match: { isActive: true } }
//   }
// });

// // In your routes
// router.get('/', userHandler.getAll({
//   searchFields: ['name', 'email', 'employeeId'],
//   paginationStrategy: 'cursor',
//   useCache: true
// }));

// router.post('/',
//   rateLimiter.create(10, 60), // 10 requests per minute
//   userHandler.createOne()
// );
// controllers/customerController.js
// const Customer = require("../models/customerModel");
// const Invoice = require("../models/invoiceModel");
// const Order = require("../models/orderModel");
// const Payment = require("../models/paymentModel");
// const Note = require("../models/noteModel");
// const ActivityLog = require("../models/activityLogModel");
// const CreditLimitLog = require("../models/creditLimitLogModel");
// const { CrudHandlerFactory } = require("../utils/handlerFactory");
// const AppError = require("../utils/appError");
// const catchAsync = require("../utils/catchAsync");
// const imageUploadService = require("../services/uploads/imageUploadService");

// // ======================================================
// // CUSTOMER FACTORY CONFIGURATION (CLEAN VERSION)
// // ======================================================
// const customerFactory = new CrudHandlerFactory(Customer, {
//   // Core Configuration
//   enableSoftDelete: true,
//   enableAuditLog: true,
//   enableValidation: true,

//   // Search configuration
//   searchFields: [
//     "name",
//     "email",
//     "phone",
//     "gstNumber",
//     "customerCode",
//     "contactPerson",
//   ],

//   // Default population
//   population: {
//     assignedTo: { select: "name email avatar" },
//     createdBy: { select: "name email" },
//     updatedBy: { select: "name email" },
//   },

//   // Defaults
//   defaultSort: "-createdAt",
//   defaultLimit: 50,
//   maxLimit: 500,

//   // Pre-hooks
//   preHooks: {
//     getAll: async (req, res) => {
//       // Add organization filter automatically
//       if (!req.query.organizationId && req.user?.organizationId) {
//         req.query.organizationId = req.user.organizationId;
//       }
//     },

//     createOne: async (req, res) => {
//       // Auto-generate customer code if not provided
//       if (!req.body.customerCode) {
//         const lastCustomer = await Customer.findOne(
//           { organizationId: req.user.organizationId },
//           { customerCode: 1 },
//           { sort: { customerCode: -1 } },
//         ).lean();

//         const lastCode = lastCustomer?.customerCode || "CUST-00000";
//         const match = lastCode.match(/\d+/);
//         const nextNum = match ? parseInt(match[0]) + 1 : 1;
//         req.body.customerCode = `CUST-${nextNum.toString().padStart(5, "0")}`;
//       }

//       // Set default status
//       if (!req.body.status) {
//         req.body.status = "active";
//       }

//       // Auto-assign default credit limit
//       if (!req.body.creditLimit) {
//         req.body.creditLimit = 100000; // Default 1 lakh
//       }
//     },
//   },
// });

// // ======================================================
// // FACTORY-BASED ENDPOINTS
// // ======================================================

// // 1. CREATE CUSTOMER
// exports.createCustomer = customerFactory.createOne({
//   transform: (doc) => {
//     // Clean up response
//     doc.__v = undefined;
//     return doc;
//   },
// });

// // 2. GET ALL CUSTOMERS
// exports.getAllCustomers = customerFactory.getAll({
//   // Advanced filtering
//   filterOptions: {
//     allowedOperators: ["eq", "ne", "gt", "lt", "in", "regex"],
//   },

//   // Default filter
//   defaultFilter: (req) => {
//     const filter = {};

//     // Date range filtering
//     if (req.query.fromDate || req.query.toDate) {
//       filter.createdAt = {};
//       if (req.query.fromDate)
//         filter.createdAt.$gte = new Date(req.query.fromDate);
//       if (req.query.toDate) filter.createdAt.$lte = new Date(req.query.toDate);
//     }

//     // Exclude deleted by default
//     if (req.query.includeDeleted !== "true") {
//       filter.isDeleted = { $ne: true };
//     }

//     // Exclude inactive by default
//     if (req.query.includeInactive !== "true") {
//       filter.isActive = true;
//     }

//     return filter;
//   },

//   // Cache configuration
//   useCache: true,
//   cacheTTL: 120,

//   // Transform with statistics
//   transform: async (result) => {
//     if (!result.data || result.data.length === 0) return result;

//     const customerIds = result.data.map((c) => c._id);

//     // Get invoice counts in parallel
//     const invoiceStats = await Invoice.aggregate([
//       {
//         $match: {
//           customerId: { $in: customerIds },
//           status: { $ne: "cancelled" },
//         },
//       },
//       {
//         $group: {
//           _id: "$customerId",
//           count: { $sum: 1 },
//           total: { $sum: "$grandTotal" },
//         },
//       },
//     ]);

//     // Merge stats
//     result.data = result.data.map((customer) => {
//       const stat = invoiceStats.find((s) => s._id.equals(customer._id));
//       return {
//         ...customer,
//         stats: {
//           invoiceCount: stat?.count || 0,
//           totalPurchases: stat?.total || 0,
//         },
//       };
//     });

//     return result;
//   },
// });

// // 3. GET SINGLE CUSTOMER
// exports.getCustomer = customerFactory.getOne({
//   // Extended population
//   populate: {
//     invoices: {
//       path: "invoices",
//       select: "invoiceNumber date dueDate grandTotal status",
//       options: { limit: 10, sort: "-date" },
//     },
//     orders: {
//       path: "orders",
//       select: "orderNumber total status createdAt",
//       options: { limit: 5, sort: "-createdAt" },
//     },
//   },

//   // Transform with additional data
//   transform: async (doc) => {
//     const customer = doc.toObject();

//     // Get real-time financial stats
//     const [outstandingInvoices, recentPayments] = await Promise.all([
//       Invoice.find({
//         customerId: customer._id,
//         status: { $nin: ["paid", "cancelled"] },
//       })
//         .select("invoiceNumber dueDate balanceDue")
//         .sort("dueDate")
//         .limit(5)
//         .lean(),

//       Payment.find({
//         customerId: customer._id,
//         status: "completed",
//       })
//         .select("paymentNumber date amount mode")
//         .sort("-date")
//         .limit(5)
//         .lean(),
//     ]);

//     // Add computed fields
//     customer.financialSummary = {
//       totalOutstanding: outstandingInvoices.reduce(
//         (sum, inv) => sum + (inv.balanceDue || 0),
//         0,
//       ),
//       overdueInvoices: outstandingInvoices.filter(
//         (inv) => new Date(inv.dueDate) < new Date(),
//       ).length,
//       recentPayments: recentPayments.reduce(
//         (sum, pmt) => sum + (pmt.amount || 0),
//         0,
//       ),
//     };

//     customer.recentActivity = {
//       invoices: outstandingInvoices,
//       payments: recentPayments,
//     };

//     // Clean up
//     delete customer.__v;

//     return customer;
//   },
// });

// // 4. UPDATE CUSTOMER
// exports.updateCustomer = customerFactory.updateOne({
//   // Optimistic locking
//   enableOptimisticLocking: true,

//   // Pre-update validation
//   preHook: async (req, res, currentDoc) => {
//     // Prevent deactivation if has outstanding invoices
//     if (req.body.status === "inactive" && currentDoc.status === "active") {
//       const hasOutstanding = await Invoice.exists({
//         customerId: currentDoc._id,
//         status: { $nin: ["paid", "cancelled"] },
//         dueDate: { $lt: new Date() },
//       });

//       if (hasOutstanding) {
//         throw new AppError(
//           "Cannot deactivate customer with outstanding invoices",
//           400,
//         );
//       }
//     }

//     // Track changes for audit
//     req.changeLog = {};
//     for (const key in req.body) {
//       if (JSON.stringify(currentDoc[key]) !== JSON.stringify(req.body[key])) {
//         req.changeLog[key] = {
//           old: currentDoc[key],
//           new: req.body[key],
//         };
//       }
//     }
//   },
// });

// // ======================================================
// // CUSTOM BUSINESS ENDPOINTS
// // ======================================================

// // UPDATE CREDIT LIMIT
// exports.updateCreditLimit = catchAsync(async (req, res, next) => {
//   const { creditLimit, reason } = req.body;

//   if (typeof creditLimit !== "number" || creditLimit < 0) {
//     return next(new AppError("creditLimit must be a positive number", 400));
//   }

//   // Find customer
//   const customer = await Customer.findOne({
//     _id: req.params.id,
//     organizationId: req.user.organizationId,
//     isDeleted: { $ne: true },
//   });

//   if (!customer) {
//     return next(new AppError("Customer not found", 404));
//   }

//   // Check current utilization
//   const currentUtilization = await calculateCreditUtilization(customer._id);
//   if (currentUtilization.used > creditLimit) {
//     return next(
//       new AppError(
//         `Current outstanding (₹${currentUtilization.used}) exceeds new limit. Clear dues first.`,
//         400,
//       ),
//     );
//   }

//   // Update credit limit
//   const oldLimit = customer.creditLimit;
//   customer.creditLimit = creditLimit;
//   await customer.save();

//   // Log the change
//   if (CreditLimitLog) {
//     await CreditLimitLog.create({
//       customerId: customer._id,
//       organizationId: req.user.organizationId,
//       changedBy: req.user.id,
//       oldLimit,
//       newLimit: creditLimit,
//       reason: reason || "Credit limit adjustment",
//       ipAddress: req.ip,
//     });
//   }

//   res.status(200).json({
//     status: "success",
//     message: "Credit limit updated successfully",
//     data: {
//       customer: {
//         _id: customer._id,
//         name: customer.name,
//         oldCreditLimit: oldLimit,
//         newCreditLimit: creditLimit,
//         utilization: currentUtilization,
//       },
//     },
//   });
// });

// // DELETE CUSTOMER (SAFEGUARDED)
// exports.deleteCustomer = catchAsync(async (req, res, next) => {
//   const customerId = req.params.id;
//   const orgId = req.user.organizationId;
//   const userId = req.user.id;

//   // Find customer
//   const customer = await Customer.findOne({
//     _id: customerId,
//     organizationId: orgId,
//     isDeleted: { $ne: true },
//   });

//   if (!customer) {
//     return next(new AppError("Customer not found", 404));
//   }

//   // 1. Check for Active Invoices
//   const hasInvoices = await Invoice.exists({
//     customerId: customerId,
//     organizationId: orgId,
//     status: { $nin: ["paid", "cancelled", "void"] },
//   });

//   if (hasInvoices) {
//     return next(
//       new AppError(
//         "CANNOT DELETE: Customer has unpaid or pending invoices.",
//         409,
//       ),
//     );
//   }

//   // 2. Check for Open Orders
//   if (Order) {
//     const hasOrders = await Order.exists({
//       customerId: customerId,
//       organizationId: orgId,
//       status: { $in: ["pending", "processing", "shipped"] },
//     });

//     if (hasOrders) {
//       return next(
//         new AppError(
//           "CANNOT DELETE: Customer has active orders in process.",
//           409,
//         ),
//       );
//     }
//   }

//   // 3. Financial Safety Check
//   if (Math.abs(customer.outstandingBalance) > 1) {
//     return next(
//       new AppError(
//         `Outstanding balance: ₹${customer.outstandingBalance.toFixed(2)}. Settle payments before deletion.`,
//         409,
//       ),
//     );
//   }

//   // 4. Soft Delete
//   customer.isDeleted = true;
//   customer.isActive = false;
//   customer.deletedBy = userId;
//   customer.deletedAt = new Date();
//   customer.deletionReason = req.body.reason || "Manual deletion by user";

//   await customer.save();

//   // 5. Log Activity
//   if (ActivityLog) {
//     await ActivityLog.create({
//       organizationId: orgId,
//       userId: userId,
//       action: "CUSTOMER_DELETED",
//       entityType: "Customer",
//       entityId: customerId,
//       details: {
//         name: customer.name,
//         email: customer.email,
//         reason: customer.deletionReason,
//       },
//     });
//   }

//   res.status(200).json({
//     status: "success",
//     message: "Customer deleted successfully",
//     data: {
//       customerId: customerId,
//       deletedAt: customer.deletedAt,
//       canRestoreUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
//     },
//   });
// });

// // SEARCH CUSTOMERS
// exports.searchCustomers = catchAsync(async (req, res, next) => {
//   const q = req.query.q || "";
//   const orgId = req.user.organizationId;
//   const limit = parseInt(req.query.limit) || 20;

//   const query = {
//     organizationId: orgId,
//     isDeleted: { $ne: true },
//     $or: [
//       { name: { $regex: q, $options: "i" } },
//       { email: { $regex: q, $options: "i" } },
//       { phone: { $regex: q, $options: "i" } },
//       { gstNumber: { $regex: q, $options: "i" } },
//       { customerCode: { $regex: q, $options: "i" } },
//       { contactPerson: { $regex: q, $options: "i" } },
//     ],
//   };

//   const customers = await Customer.find(query)
//     .select(
//       "name email phone customerCode status creditLimit outstandingBalance",
//     )
//     .limit(limit)
//     .sort({
//       [q ? "score" : "-createdAt"]: -1,
//       name: 1,
//     });

//   res.status(200).json({
//     status: "success",
//     results: customers.length,
//     data: { customers },
//     meta: {
//       query: q,
//       limit,
//     },
//   });
// });

// // BULK UPDATE CUSTOMERS
// exports.bulkUpdateCustomers = catchAsync(async (req, res, next) => {
//   const updates = req.body;
//   const orgId = req.user.organizationId;

//   if (!Array.isArray(updates) || updates.length === 0) {
//     return next(new AppError("Provide an array of customer updates", 400));
//   }

//   if (updates.length > 100) {
//     return next(new AppError("Maximum 100 updates per batch", 400));
//   }

//   const operations = updates.map((c) => ({
//     updateOne: {
//       filter: {
//         _id: c._id,
//         organizationId: orgId,
//         isDeleted: { $ne: true },
//       },
//       update: {
//         $set: {
//           ...c.update,
//           updatedBy: req.user.id,
//           updatedAt: new Date(),
//         },
//       },
//     },
//   }));

//   const result = await Customer.bulkWrite(operations);

//   res.status(200).json({
//     status: "success",
//     message: "Bulk update completed",
//     data: {
//       matchedCount: result.matchedCount,
//       modifiedCount: result.modifiedCount,
//     },
//   });
// });

// // UPLOAD CUSTOMER PHOTO
// exports.uploadCustomerPhoto = catchAsync(async (req, res, next) => {
//   const customerId = req.params.id;
//   const orgId = req.user.organizationId;

//   if (!req.file || !req.file.buffer) {
//     return next(
//       new AppError("Please upload an image file (JPG, PNG, WebP)", 400),
//     );
//   }

//   // Validate file size
//   const maxSize = 5 * 1024 * 1024;
//   if (req.file.size > maxSize) {
//     return next(new AppError("Image size must be less than 5MB", 400));
//   }

//   // Find customer
//   const customer = await Customer.findOne({
//     _id: customerId,
//     organizationId: orgId,
//     isDeleted: { $ne: true },
//   });

//   if (!customer) {
//     return next(new AppError("Customer not found", 404));
//   }

//   // Delete old photo if exists
//   if (customer.avatar) {
//     try {
//       await imageUploadService.deleteImage(customer.avatar);
//     } catch (error) {
//       console.warn("Failed to delete old avatar:", error.message);
//     }
//   }

//   // Upload new photo
//   const folder = `customers/${orgId}/avatars`;
//   const uploadResult = await imageUploadService.uploadImage(
//     req.file.buffer,
//     folder,
//     {
//       resize: { width: 500, height: 500 },
//       quality: 85,
//       format: "webp",
//     },
//   );

//   // Update customer
//   customer.avatar = uploadResult.url;
//   customer.updatedBy = req.user.id;
//   await customer.save();

//   res.status(200).json({
//     status: "success",
//     message: "Customer photo updated successfully",
//     data: {
//       customer: {
//         _id: customer._id,
//         name: customer.name,
//         avatar: customer.avatar,
//       },
//     },
//   });
// });

// // CHECK DUPLICATE CUSTOMER
// exports.checkDuplicate = catchAsync(async (req, res, next) => {
//   const { email, phone, gstNumber } = req.query;
//   const orgId = req.user.organizationId;

//   if (!email && !phone && !gstNumber) {
//     return res.status(200).json({
//       status: "success",
//       isDuplicate: false,
//       message: "No search criteria provided",
//     });
//   }

//   const query = {
//     organizationId: orgId,
//     isDeleted: { $ne: true },
//     $or: [],
//   };

//   if (email) query.$or.push({ email: email.toLowerCase().trim() });
//   if (phone) query.$or.push({ phone: phone.replace(/\D/g, "") });
//   if (gstNumber) query.$or.push({ gstNumber: gstNumber.toUpperCase().trim() });

//   const existingCustomers = await Customer.find(query)
//     .select("name email phone gstNumber status")
//     .limit(3);

//   res.status(200).json({
//     status: "success",
//     isDuplicate: existingCustomers.length > 0,
//     matches: existingCustomers,
//     count: existingCustomers.length,
//   });
// });

// // RESTORE CUSTOMER
// exports.restoreCustomer = catchAsync(async (req, res, next) => {
//   const customerId = req.params.id;
//   const orgId = req.user.organizationId;

//   // Find deleted customer
//   const customer = await Customer.findOne({
//     _id: customerId,
//     organizationId: orgId,
//     isDeleted: true,
//   });

//   if (!customer) {
//     return next(
//       new AppError("No soft-deleted customer found with this ID", 404),
//     );
//   }

//   // Check if within restoration period (30 days)
//   const archiveDate = new Date(customer.deletedAt);
//   const daysSinceDeletion = Math.floor(
//     (Date.now() - archiveDate) / (1000 * 60 * 60 * 24),
//   );

//   if (daysSinceDeletion > 30) {
//     return next(
//       new AppError(
//         `Customer was deleted ${daysSinceDeletion} days ago. Restoration only possible within 30 days.`,
//         410,
//       ),
//     );
//   }

//   // Restore customer
//   customer.isDeleted = false;
//   customer.isActive = true;
//   customer.restoredBy = req.user.id;
//   customer.restoredAt = new Date();
//   await customer.save();

//   res.status(200).json({
//     status: "success",
//     message: "Customer restored successfully",
//     data: {
//       customer: {
//         _id: customer._id,
//         name: customer.name,
//         email: customer.email,
//         restoredAt: customer.restoredAt,
//       },
//     },
//   });
// });

// // BULK CREATE CUSTOMERS
// exports.createBulkCustomer = customerFactory.batchCreate();

// // GET CUSTOMER STATISTICS
// exports.getCustomerStats = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;

//   const stats = await Customer.aggregate([
//     {
//       $match: {
//         organizationId: new mongoose.Types.ObjectId(orgId),
//         isDeleted: { $ne: true },
//       },
//     },
//     {
//       $facet: {
//         totalCount: [{ $group: { _id: null, count: { $sum: 1 } } }],
//         byStatus: [
//           {
//             $group: {
//               _id: "$status",
//               count: { $sum: 1 },
//               totalBalance: { $sum: "$outstandingBalance" },
//             },
//           },
//         ],
//         byType: [
//           {
//             $group: {
//               _id: "$type",
//               count: { $sum: 1 },
//             },
//           },
//         ],
//         creditUtilization: [
//           { $match: { creditLimit: { $gt: 0 } } },
//           {
//             $project: {
//               utilizationPercentage: {
//                 $cond: [
//                   { $eq: ["$creditLimit", 0] },
//                   0,
//                   {
//                     $multiply: [
//                       { $divide: ["$outstandingBalance", "$creditLimit"] },
//                       100,
//                     ],
//                   },
//                 ],
//               },
//             },
//           },
//           {
//             $group: {
//               _id: null,
//               avgUtilization: { $avg: "$utilizationPercentage" },
//               highUtilization: {
//                 $sum: {
//                   $cond: [{ $gte: ["$utilizationPercentage", 80] }, 1, 0],
//                 },
//               },
//             },
//           },
//         ],
//       },
//     },
//   ]);

//   res.status(200).json({
//     status: "success",
//     data: {
//       stats: stats[0],
//     },
//   });
// });

// // ======================================================
// // UTILITY FUNCTIONS
// // ======================================================

// async function calculateCreditUtilization(customerId) {
//   const result = await Invoice.aggregate([
//     {
//       $match: {
//         customerId: new mongoose.Types.ObjectId(customerId),
//         status: { $nin: ["paid", "cancelled", "void"] },
//       },
//     },
//     {
//       $group: {
//         _id: null,
//         totalOutstanding: { $sum: "$balanceDue" },
//         count: { $sum: 1 },
//       },
//     },
//   ]);

//   return {
//     used: result[0]?.totalOutstanding || 0,
//     invoiceCount: result[0]?.count || 0,
//   };
// }

// // ======================================================
// // EXPORT ALL HANDLERS
// // ======================================================
// module.exports = {
//   createCustomer: exports.createCustomer,
//   getAllCustomers: exports.getAllCustomers,
//   getCustomer: exports.getCustomer,
//   updateCustomer: exports.updateCustomer,
//   deleteCustomer: exports.deleteCustomer,
//   restoreCustomer: exports.restoreCustomer,
//   createBulkCustomer: exports.createBulkCustomer,
//   updateCreditLimit: exports.updateCreditLimit,
//   searchCustomers: exports.searchCustomers,
//   bulkUpdateCustomers: exports.bulkUpdateCustomers,
//   uploadCustomerPhoto: exports.uploadCustomerPhoto,
//   checkDuplicate: exports.checkDuplicate,
//   getCustomerStats: exports.getCustomerStats,
// };