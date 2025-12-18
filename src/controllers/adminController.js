// src/controllers/adminController.js
const Invoice = require("../models/invoiceModel");
const Customer = require("../models/customerModel");
const Product = require("../models/productModel");
const Branch = require("../models/branchModel"); 
const { getSummary, getMonthlyTrends, getOutstandingList } = require("../services/adminService");
const { logAudit } = require("../utils/auditLogger");
const catchAsync = require("../utils/catchAsync"); // ✅ Standard Import

// ------------------------------------------------------------
// 1. ADMIN SUMMARY
// GET /v1/admin/summary
// ------------------------------------------------------------
exports.summary = catchAsync(async (req, res) => {
  const data = await getSummary(req.user, {
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    branchId: req.query.branchId
  });

  logAudit({
    user: req.user,
    action: "admin:read_summary",
    req,
    meta: { query: req.query }
  });

  res.status(200).json({ status: "success", data });
});

// ------------------------------------------------------------
// 2. MONTHLY TRENDS
// GET /v1/admin/monthly
// ------------------------------------------------------------
exports.monthlyTrends = catchAsync(async (req, res) => {
  const months = req.query.months ? Number(req.query.months) : 12;

  const data = await getMonthlyTrends(req.user, {
    months,
    branchId: req.query.branchId
  });

  res.status(200).json({ status: "success", data });
});

// ------------------------------------------------------------
// 3. OUTSTANDING (Receivable / Payable)
// GET /v1/admin/outstanding
// ------------------------------------------------------------
exports.outstanding = catchAsync(async (req, res) => {
  const type = req.query.type || "receivable";
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const data = await getOutstandingList(req.user, {
    type,
    limit,
    branchId: req.query.branchId
  });

  res.status(200).json({ status: "success", data });
});

// ------------------------------------------------------------
// 4. TOP CUSTOMERS (Fixed Fields & Status)
// GET /v1/admin/top-customers?limit=10&start=&end=
// ------------------------------------------------------------
exports.topCustomers = catchAsync(async (req, res) => {
  const { limit = 10, start, end } = req.query;

  const match = { 
    organizationId: req.user.organizationId,
    status: { $nin: ['draft', 'cancelled'] } // 🛡️ EXCLUDE INVALID INVOICES
  };

  if (start || end) {
    match.invoiceDate = {}; // ✅ Use invoiceDate, not createdAt for business logic
    if (start) match.invoiceDate.$gte = new Date(start);
    if (end) match.invoiceDate.$lte = new Date(end);
  }

  const result = await Invoice.aggregate([
    { $match: match },
    { 
      $group: { 
        _id: "$customerId", 
        total: { $sum: "$grandTotal" }, // ✅ FIXED: was $total
        count: { $sum: 1 }
      } 
    },
    { $sort: { total: -1 } },
    { $limit: Number(limit) },
    {
      $lookup: {
        from: "customers",
        localField: "_id",
        foreignField: "_id",
        as: "customer"
      }
    },
    { $unwind: "$customer" },
    {
        $project: {
            name: "$customer.name",
            email: "$customer.email",
            phone: "$customer.phone",
            totalRevenue: "$total",
            invoiceCount: "$count"
        }
    }
  ]);

  res.status(200).json({ status: "success", data: { topCustomers: result } });
});

// ------------------------------------------------------------
// 5. TOP PRODUCTS (Fixed Fields)
// GET /v1/admin/top-products?limit=10
// ------------------------------------------------------------
exports.topProducts = catchAsync(async (req, res) => {
  const { limit = 10, start, end } = req.query;

  const match = { 
    organizationId: req.user.organizationId,
    status: { $nin: ['draft', 'cancelled'] } // 🛡️ SAFETY
  };

  if (start || end) {
    match.invoiceDate = {};
    if (start) match.invoiceDate.$gte = new Date(start);
    if (end) match.invoiceDate.$lte = new Date(end);
  }

  const result = await Invoice.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        soldQty: { $sum: "$items.quantity" }, // ✅ FIXED: was items.qty
        revenue: {
          $sum: { $multiply: ["$items.quantity", "$items.price"] } // ✅ FIXED
        }
      }
    },
    { $sort: { soldQty: -1 } },
    { $limit: Number(limit) },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product"
      }
    },
    { $unwind: "$product" },
    {
        $project: {
            name: "$product.name",
            sku: "$product.sku",
            soldQty: 1,
            revenue: 1
        }
    }
  ]);

  res.status(200).json({ status: "success", data: { topProducts: result } });
});

// ------------------------------------------------------------
// 6. BRANCH SALES SUMMARY
// GET /v1/admin/branch-sales
// ------------------------------------------------------------
exports.branchSales = catchAsync(async (req, res) => {
  const { start, end } = req.query;

  const match = { 
    organizationId: req.user.organizationId,
    status: { $nin: ['draft', 'cancelled'] } // 🛡️ SAFETY
  };

  if (start || end) {
    match.invoiceDate = {};
    if (start) match.invoiceDate.$gte = new Date(start);
    if (end) match.invoiceDate.$lte = new Date(end);
  }

  const result = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$branchId",
        totalSales: { $sum: "$grandTotal" }, // ✅ FIXED
        invoices: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "branches",
        localField: "_id",
        foreignField: "_id",
        as: "branch"
      }
    },
    { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        branchName: { $ifNull: ["$branch.name", "Unknown Branch"] },
        totalSales: 1,
        invoices: 1
      }
    },
    { $sort: { totalSales: -1 } }
  ]);

  res.status(200).json({ status: "success", data: { branchSales: result } });
});


// // src/controllers/adminController.js
// const Invoice = require("../models/invoiceModel");
// const Customer = require("../models/customerModel");
// const Product = require("../models/productModel");
// const Branch = require("../models/branchModel"); 
// const { getSummary, getMonthlyTrends, getOutstandingList } = require("../services/adminService");
// const { logAudit } = require("../utils/auditLogger");

// // ------------------------------------------------------------
// // UNIVERSAL ASYNC HANDLER (Safer than catchAsync)
// // ------------------------------------------------------------
// const asyncHandler = (fn) => (req, res, next) =>
//   Promise.resolve(fn(req, res, next)).catch(next);

// // ------------------------------------------------------------
// // 1. ADMIN SUMMARY
// // GET /v1/admin/summary
// // ------------------------------------------------------------
// exports.summary = asyncHandler(async (req, res) => {
//   const user = req.user;

//   const data = await getSummary(user, {
//     startDate: req.query.startDate,
//     endDate: req.query.endDate,
//     branchId: req.query.branchId
//   });

//   logAudit({
//     user,
//     action: "admin:read_summary",
//     req,
//     meta: { query: req.query }
//   });

//   res.status(200).json({
//     status: "success",
//     data
//   });
// });

// // ------------------------------------------------------------
// // 2. MONTHLY TRENDS
// // GET /v1/admin/monthly
// // ------------------------------------------------------------
// exports.monthlyTrends = asyncHandler(async (req, res) => {
//   const user = req.user;

//   const months = req.query.months ? Number(req.query.months) : 12;

//   const data = await getMonthlyTrends(user, {
//     months,
//     branchId: req.query.branchId
//   });

//   logAudit({
//     user,
//     action: "admin:read_monthly",
//     req,
//     meta: { months }
//   });

//   res.status(200).json({
//     status: "success",
//     data
//   });
// });

// // ------------------------------------------------------------
// // 3. OUTSTANDING (Receivable / Payable)
// // GET /v1/admin/outstanding
// // ------------------------------------------------------------
// exports.outstanding = asyncHandler(async (req, res) => {
//   const user = req.user;

//   const type = req.query.type || "receivable";
//   const limit = req.query.limit ? Number(req.query.limit) : 20;

//   const data = await getOutstandingList(user, {
//     type,
//     limit,
//     branchId: req.query.branchId
//   });

//   logAudit({
//     user,
//     action: `admin:read_outstanding_${type}`,
//     req,
//     meta: { type, limit }
//   });

//   res.status(200).json({
//     status: "success",
//     data
//   });
// });

// // ------------------------------------------------------------
// // 4. TOP CUSTOMERS
// // GET /v1/admin/top-customers?limit=10&start=&end=
// // ------------------------------------------------------------
// exports.topCustomers = asyncHandler(async (req, res) => {
//   const { limit = 10, start, end } = req.query;

//   const match = { organizationId: req.user.organizationId };

//   if (start || end) {
//     match.createdAt = {};
//     if (start) match.createdAt.$gte = new Date(start);
//     if (end) match.createdAt.$lte = new Date(end);
//   }

//   const result = await Invoice.aggregate([
//     { $match: match },

//     // Group totals by customer
//     { 
//       $group: { 
//         _id: "$customerId", 
//         total: { $sum: { $toDouble: "$total" } }
//       } 
//     },

//     { $sort: { total: -1 } },

//     { $limit: Number(limit) },

//     // Lookup actual customer
//     {
//       $lookup: {
//         from: "customers",
//         localField: "_id",
//         foreignField: "_id",
//         as: "customer"
//       }
//     },
//     { $unwind: "$customer" }
//   ]);

//   res.status(200).json({
//     status: "success",
//     data: { topCustomers: result }
//   });
// });

// // ------------------------------------------------------------
// // 5. TOP PRODUCTS
// // GET /v1/admin/top-products?limit=10&start=&end=
// // ------------------------------------------------------------
// exports.topProducts = asyncHandler(async (req, res) => {
//   const { limit = 10, start, end } = req.query;

//   const match = { organizationId: req.user.organizationId };

//   if (start || end) {
//     match.createdAt = {};
//     if (start) match.createdAt.$gte = new Date(start);
//     if (end) match.createdAt.$lte = new Date(end);
//   }

//   const result = await Invoice.aggregate([
//     { $match: match },

//     // Decompose each item
//     { $unwind: "$items" },

//     // Proper numeric conversion of qty * price
//     {
//       $group: {
//         _id: "$items.productId",
//         soldQty: { $sum: { $toDouble: "$items.qty" } },
//         revenue: {
//           $sum: {
//             $multiply: [
//               { $toDouble: "$items.qty" },
//               { $toDouble: "$items.price" }
//             ]
//           }
//         }
//       }
//     },

//     { $sort: { soldQty: -1 } },

//     { $limit: Number(limit) },

//     // Lookup actual product
//     {
//       $lookup: {
//         from: "products",
//         localField: "_id",
//         foreignField: "_id",
//         as: "product"
//       }
//     },
//     { $unwind: "$product" }
//   ]);

//   res.status(200).json({
//     status: "success",
//     data: { topProducts: result }
//   });
// });

// // ------------------------------------------------------------
// // 6. BRANCH SALES SUMMARY
// // GET /v1/admin/branch-sales?start=&end=
// // ------------------------------------------------------------
// exports.branchSales = asyncHandler(async (req, res) => {
//   const { start, end } = req.query;

//   const match = { organizationId: req.user.organizationId };

//   if (start || end) {
//     match.createdAt = {};
//     if (start) match.createdAt.$gte = new Date(start);
//     if (end) match.createdAt.$lte = new Date(end);
//   }

//   const result = await Invoice.aggregate([
//     { $match: match },

//     {
//       $group: {
//         _id: "$branchId",
//         totalSales: { $sum: { $toDouble: "$total" } },
//         invoices: { $sum: 1 }
//       }
//     },

//     // Lookup branch details
//     {
//       $lookup: {
//         from: "branches",
//         localField: "_id",
//         foreignField: "_id",
//         as: "branch"
//       }
//     },
//     { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },

//     {
//       $project: {
//         branchName: "$branch.name",
//         totalSales: 1,
//         invoices: 1
//       }
//     },

//     { $sort: { totalSales: -1 } }
//   ]);

//   res.status(200).json({
//     status: "success",
//     data: { branchSales: result }
//   });
// });

