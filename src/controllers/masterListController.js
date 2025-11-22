const Branch = require("../models/branchModel");
const Role = require("../models/roleModel");
const Customer = require("../models/customerModel");
const Supplier = require("../models/supplierModel");
const Product = require("../models/productModel");
const Master = require("../models/masterModel");
const Account = require("../models/accountModel");       // Added
const User = require("../models/userModel");             // Added
const Invoice = require("../models/invoiceModel");       // Added
const Purchase = require("../models/purchaseModel");     // Added
const Sales = require("../models/salesModel");           // Added
const Payment = require("../models/paymentModel");       // Added
const EMI = require("../models/emiModel");               // Added
const Ledger = require("../models/ledgerModel");         // Added

const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

/**
 * 1. FETCH ALL MASTERS (Combined)
 * Loads lightweight versions of all entities for dropdowns/initial state
 */
exports.getMasterList = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  if (!orgId) return next(new AppError("Organization not found for current user.", 400));

  // Fetch all in parallel for efficiency
  const [
    branches,
    roles,
    customers,
    suppliers,
    products,
    masters,
    accounts,
    users,
    invoices,
    purchases,
    sales,
    payments,
    emis
  ] = await Promise.all([
    // 1. Branches
    Branch.find({ organizationId: orgId, isActive: true }).select("_id name").lean(),

    // 2. Roles
    Role.find({ organizationId: orgId }).select("_id name").lean(),

    // 3. Customers
    Customer.find({ organizationId: orgId, isActive: true }).select("_id name phone").lean(),

    // 4. Suppliers
    Supplier.find({ organizationId: orgId, isActive: true }).select("_id companyName contactPerson").lean(),

    // 5. Products
    Product.find({ organizationId: orgId, isActive: true }).select("_id name sku sellingPrice").lean(),

    // 6. General Masters (Tax, Units, etc.)
    Master.find({ organizationId: orgId, isActive: true }).select("_id type name code").lean(),

    // 7. Accounts (Chart of Accounts)
    Account.find({ organizationId: orgId }).select("_id name code type balance").lean(),

    // 8. Users (Employees/Salespersons) - Exclude passwords
    User.find({ organizationId: orgId, isActive: true }).select("_id name email role").lean(),

    // 9. Invoices (Lightweight - for reference dropdowns)
    Invoice.find({ organizationId: orgId }).select("_id invoiceNumber grandTotal paymentStatus invoiceDate").sort({ invoiceDate: -1 }).limit(100).lean(),

    // 10. Purchases (Lightweight)
    Purchase.find({ organizationId: orgId }).select("_id invoiceNumber grandTotal supplierId").sort({ purchaseDate: -1 }).limit(100).lean(),

    // 11. Sales (Lightweight)
    Sales.find({ organizationId: orgId }).select("_id invoiceNumber grandTotal customerId").sort({ saleDate: -1 }).limit(100).lean(),

    // 12. Payments (Recent)
    Payment.find({ organizationId: orgId }).select("_id referenceNumber amount type paymentDate").sort({ paymentDate: -1 }).limit(50).lean(),

    // 13. EMIs
    EMI.find({ organizationId: orgId }).select("_id totalAmount status").lean()
  ]);

  // Group generic masters by type
  const groupedMasters = masters.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push({ _id: item._id, name: item.name, code: item.code });
    return acc;
  }, {});

  res.status(200).json({
    status: "success",
    data: {
      organizationId: orgId,
      branches,
      roles,
      customers,
      suppliers,
      products,
      accounts,
      users,
      masters: groupedMasters,
      // Transactional summaries (optional, remove if payload is too heavy)
      recentInvoices: invoices,
      recentPurchases: purchases,
      recentSales: sales,
      recentPayments: payments,
      emis
    },
  });
});

exports.getSpecificList = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { type } = req.query; 
  if (!type) {  return next(new AppError("Please provide a 'type' query parameter", 400)); }
  let Model = null;
  let selectFields = "";
  let query = { organizationId: orgId };
  let populateOptions = null; // To fetch related Customer/Supplier details
  switch (type.toLowerCase()) {
    case "payment":
      Model = Payment;
      selectFields = "_id referenceNumber amount type paymentDate customerId supplierId method";
      // We populate BOTH because a payment could be Inflow (Customer) or Outflow (Supplier)
      populateOptions = [
        { path: 'customerId', select: 'name phone' },
        { path: 'supplierId', select: 'companyName' }
      ];
      break;

    // 2. EMI (Needs Invoice Number + Customer Name)
    case "emi":
      Model = EMI;
      selectFields = "_id totalAmount balanceAmount status emiStartDate customerId invoiceId";
      populateOptions = [
        { path: 'customerId', select: 'name phone' },
        { path: 'invoiceId', select: 'invoiceNumber' }
      ];
      break;

    // 3. INVOICE (Needs Customer Name)
    case "invoice":
      Model = Invoice;
      selectFields = "_id invoiceNumber grandTotal paymentStatus invoiceDate customerId";
      populateOptions = { path: 'customerId', select: 'name phone' }; 
      break;

    // 4. SALES (Needs Customer Name)
    case "sales":
      Model = Sales;
      selectFields = "_id invoiceNumber grandTotal saleDate customerId";
      populateOptions = { path: 'customerId', select: 'name phone' };
      break;

    // 5. CUSTOMER (Needs City for context)
    case "customer":
      Model = Customer;
      selectFields = "_id name phone email billingAddress outstandingBalance";
      query.isActive = true;
      break;

    case "supplier":
      Model = Supplier;
      selectFields = "_id companyName contactPerson phone outstandingBalance";
      query.isActive = true;
      break;

    case "product":
      Model = Product;
      selectFields = "_id name sku sellingPrice stock";
      query.isActive = true;
      break;
      
    case "user":
      Model = User;
      selectFields = "_id name role phone";
      query.isActive = true;
      break;

    default:
      return next(new AppError(`Type ${type} not configured for specific list`, 400));
  }

  // --- B. QUERY EXECUTION ---
  let queryObj = Model.find(query).select(selectFields).sort({ createdAt: -1 });

  // Apply populate (can handle array of populates or single object)
  if (populateOptions) {
    queryObj = queryObj.populate(populateOptions);
  }

  // Fetch as plain JSON objects
  let data = await queryObj.lean();

  // --- C. DATA TRANSFORMATION (Smart Labels / Aliasing) ---
  data = data.map(item => {
    
    // ---------------------------------------------------------
    // 1. FORMAT FOR PAYMENT
    // Logic: Check if it is Inflow (Customer) or Outflow (Supplier)
    // ---------------------------------------------------------
    if (type.toLowerCase() === 'payment') {
      const isReceived = item.type === 'inflow';
      const entityName = isReceived 
        ? (item.customerId?.name || 'Unknown Cust') 
        : (item.supplierId?.companyName || 'Unknown Supp');
      
      const symbol = isReceived ? '+' : '-'; // Visual cue
      
      return {
        ...item,
        // Label: "+ 5000 | Ref: 123 | Rahul Kumar"
        customLabel: `${symbol} ${item.amount} | Ref: ${item.referenceNumber || '-'} | ${entityName}`,
        // Search: "5000 123 Rahul Kumar"
        searchKey: `${item.amount} ${item.referenceNumber} ${entityName}`
      };
    }

    // ---------------------------------------------------------
    // 2. FORMAT FOR EMI
    // Logic: Show Invoice Number + Customer + Status
    // ---------------------------------------------------------
    if (type.toLowerCase() === 'emi') {
      const custName = item.customerId?.name || 'Unknown';
      const invNum = item.invoiceId?.invoiceNumber || 'No Inv';
      
      return {
        ...item,
        // Label: "Rahul Kumar (INV-001) - Active"
        customLabel: `${custName} (${invNum}) - ${item.status.toUpperCase()}`,
        searchKey: `${custName} ${invNum} ${item.status}`
      };
    }

    // ---------------------------------------------------------
    // 3. FORMAT FOR INVOICE / SALES
    // Logic: Invoice Number + Customer + Phone
    // ---------------------------------------------------------
    if (['invoice', 'sales'].includes(type.toLowerCase())) {
      const custName = item.customerId?.name || 'Unknown';
      const custPhone = item.customerId?.phone || '';
      
      return {
        ...item,
        // Label: "INV-1001 - Rahul Kumar (9898...)"
        customLabel: `${item.invoiceNumber} - ${custName} ${custPhone ? `(${custPhone})` : ''}`,
        searchKey: `${item.invoiceNumber} ${custName} ${custPhone}`
      };
    }

    // ---------------------------------------------------------
    // 4. FORMAT FOR CUSTOMER ITSELF
    // Logic: Name + Phone + City (helps if 2 people have same name)
    // ---------------------------------------------------------
    if (type.toLowerCase() === 'customer') {
      const city = item.billingAddress?.city || '';
      return {
        ...item,
        // Label: "Rahul Kumar (9898...) - Surat"
        customLabel: `${item.name} (${item.phone}) ${city ? `- ${city}` : ''}`,
        searchKey: `${item.name} ${item.phone} ${city}`
      };
    }

    // Default: Return item as is if no special format
    return item;
  });

  res.status(200).json({
    status: "success",
    results: data.length,
    type: type,
    data,
  });
});

// /**
//  * 2. DYNAMIC SPECIFIC LIST CONTROLLER
//  * Use this to fetch just one model type on demand.
//  * Usage: GET /api/v1/masters/specific?type=product
//  */
// exports.getSpecificList = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { type } = req.query; // e.g., ?type=customer

//   if (!type) {
//     return next(new AppError("Please provide a 'type' query parameter (e.g., ?type=product)", 400));
//   }

//   let data = [];
//   let Model = null;
//   let selectFields = "";
//   let query = { organizationId: orgId };
//   switch (type.toLowerCase()) {
//     case "branch":
//       Model = Branch;
//       selectFields = "_id name branchCode address";
//       query.isActive = true;
//       break;
//     case "role":
//       Model = Role;
//       selectFields = "_id name permissions";
//       break;
//     case "customer":
//       Model = Customer;
//       selectFields = "_id name phone email outstandingBalance";
//       query.isActive = true;
//       break;
//     case "supplier":
//       Model = Supplier;
//       selectFields = "_id companyName contactPerson phone outstandingBalance";
//       query.isActive = true;
//       break;
//     case "product":
//       Model = Product;
//       selectFields = "_id name sku sellingPrice stock";
//       query.isActive = true;
//       break;
//     case "account":
//       Model = Account;
//       selectFields = "_id name code type parent balance";
//       break;
//     case "user":
//       Model = User;
//       selectFields = "_id name email role phone status";
//       query.isActive = true;
//       break;
//     case "invoice":
//       Model = Invoice;
//       selectFields = "_id invoiceNumber invoiceDate grandTotal paymentStatus";
//       break;
//     case "purchase":
//       Model = Purchase;
//       selectFields = "_id invoiceNumber purchaseDate grandTotal supplierId";
//       break;
//     case "sales":
//       Model = Sales;
//       selectFields = "_id invoiceNumber saleDate grandTotal customerId";
//       break;
//     case "payment":
//       Model = Payment;
//       selectFields = "_id referenceNumber paymentDate amount type";
//       break;
//     case "ledger":
//       Model = Ledger;
//       selectFields = "_id entryDate type amount description";
//       break;
//     case "emi":
//       Model = EMI;
//       selectFields = "_id totalAmount balanceAmount status";
//       break;
//     case "master":
//       Model = Master;
//       selectFields = "_id type name code";
//       query.isActive = true;
//       break;
//     default:
//       return next(new AppError(`Invalid type requested: ${type}`, 400));
//   }

//   // Execute Query
//   data = await Model.find(query).select(selectFields).sort({ createdAt: -1 }).lean();
//   res.status(200).json({
//     status: "success",
//     results: data.length,
//     type: type,
//     data,
//   });
// });


// const Branch = require("../models/branchModel");
// const Role = require("../models/roleModel");
// const Customer = require("../models/customerModel");
// const Supplier = require("../models/supplierModel");
// const Product = require("../models/productModel");
// const Master = require("../models/masterModel"); // <-- new
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");

// exports.getMasterList = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   if (!orgId) return next(new AppError("Organization not found for current user.", 400));

//   // Fetch all in parallel for efficiency
//   const [branches, roles, customers, suppliers, products, masters] = await Promise.all([
//     Branch.find({ organizationId: orgId, isActive: true })
//       .select("_id name")
//       .lean(),

//     Role.find({ organizationId: orgId })
//       .select("_id name")
//       .lean(),

//     Customer.find({ organizationId: orgId, isActive: true })
//       .select("_id name")
//       .lean(),

//     Supplier.find({ organizationId: orgId, isActive: true })
//       .select("_id companyName")
//       .lean(),

//     Product.find({ organizationId: orgId, isActive: true })
//       .select("_id name")
//       .lean(),

//     Master.find({ organizationId: orgId, isActive: true })
//       .select("_id type name code")
//       .lean(),
//   ]);

//   const groupedMasters = masters.reduce((acc, item) => {
//     if (!acc[item.type]) acc[item.type] = [];
//     acc[item.type].push({ _id: item._id, name: item.name, code: item.code });
//     return acc;
//   }, {});
//   res.status(200).json({
//     status: "success",
//     data: {
//       organizationId: orgId,
//       branches,
//       roles,
//       customers,
//       suppliers,
//       products,
//       masters: groupedMasters,
//     },
//   });
// });


// // // src/controllers/masterListController.js
// // const Branch = require('../models/branchModel');
// // const Role = require('../models/roleModel');
// // const Customer = require('../models/customerModel');
// // const Supplier = require('../models/supplierModel');
// // const Product = require('../models/productModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');

// // exports.getMasterList = catchAsync(async (req, res, next) => {
// //   const orgId = req.user.organizationId;
// //   if (!orgId) return next(new AppError('Organization not found for current user.', 400));

// //   // Fetch all reference data concurrently
// //   const [branches, roles, customers, suppliers, products] = await Promise.all([
// //     Branch.find({ organizationId: orgId, isActive: true })
// //       .select('_id name')
// //       .lean(),

// //     Role.find({ organizationId: orgId })
// //       .select('_id name')
// //       .lean(),

// //     Customer.find({ organizationId: orgId, isActive: true })
// //       .select('_id name')
// //       .lean(),

// //     Supplier.find({ organizationId: orgId, isActive: true })
// //       .select('_id name')
// //       .lean(),

// //     Product.find({ organizationId: orgId, isActive: true })
// //       .select('_id name')
// //       .lean(),
// //   ]);

// //   // Bundle it cleanly
// //   res.status(200).json({
// //     status: 'success',
// //     data: {
// //       organizationId: orgId,
// //       branches,
// //       roles,
// //       customers,
// //       suppliers,
// //       products,
// //     },
// //   });
// // });

// // src/controllers/masterListController.js