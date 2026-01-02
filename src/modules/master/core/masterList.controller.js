const Branch = require("../../organization/core/branch.model");
const Role = require("../../auth/core/role.model");
const Customer = require("../../organization/core/customer.model");
const Supplier = require("../../organization/core/supplier.model");
const Product = require("../../inventory/core/product.model");
const Master = require("./master.model");
const Account = require("../../accounting/core/account.model"); // ADDED
const User = require("../../auth/core/user.model");
const Invoice = require("../../accounting/billing/invoice.model");
const Purchase = require("../../inventory/core/purchase.model");
const Sales = require("../../inventory/core/sales.model");
const Payment = require("../../accounting/payments/payment.model");
const EMI = require("../../accounting/payments/emi.model");
const { PERMISSIONS_LIST } = require('../../../config/permissions');

const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");

/* ============================================================================
   FULL MASTER LIST — Optimized for dropdowns + reference data
============================================================================ */
exports.getMasterList = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;

  if (!orgId) {
    return next(new AppError("Organization not found for current user.", 400));
  }

  const [
    branches,
    roles,
    customers,
    suppliers,
    products,
    masters,
    accounts,            // ADDED BACK
    users,
    invoices,
    purchases,
    sales,
    payments,
    emis
  ] = await Promise.all([

    Branch.find({ organizationId: orgId, isActive: true })
      .select("_id name")
      .lean(),

    Role.find({ organizationId: orgId })
      .select("_id name")
      .lean(),

    Customer.find({ organizationId: orgId, isActive: true })
      .select("_id name phone")
      .lean(),

    Supplier.find({ organizationId: orgId, isActive: true })
      .select("_id companyName contactPerson phone")
      .lean(),

    Product.find({ organizationId: orgId, isActive: true })
      .select("_id name sku sellingPrice")
      .lean(),

    Master.find({ organizationId: orgId, isActive: true })
      .select("_id type name code")
      .lean(),

    Account.find({ organizationId: orgId })
      .select("_id name code type")
      .lean(),

    User.find({ organizationId: orgId, isActive: true })
      .select("_id name email role")
      .lean(),

    Invoice.find({ organizationId: orgId })
      .select("_id invoiceNumber grandTotal paymentStatus invoiceDate customerId")
      .sort({ invoiceDate: -1 })
      .limit(100)
      .lean(),

    Purchase.find({ organizationId: orgId })
      .select("_id invoiceNumber grandTotal paymentStatus purchaseDate supplierId")
      .sort({ purchaseDate: -1 })
      .limit(100)
      .lean(),

    Sales.find({ organizationId: orgId })
      .select("_id invoiceNumber grandTotal saleDate customerId")
      .sort({ saleDate: -1 })
      .limit(100)
      .lean(),

    Payment.find({ organizationId: orgId })
      .select("_id referenceNumber amount type paymentDate customerId supplierId method")
      .sort({ paymentDate: -1 })
      .limit(50)
      .lean(),

    EMI.find({ organizationId: orgId })
      .select("_id totalAmount balanceAmount status customerId invoiceId")
      .lean()
  ]);

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
      accounts,      // returned
      users,
      masters: groupedMasters,

      // lightweight transactional references
      recentInvoices: invoices,
      recentPurchases: purchases,
      recentSales: sales,
      recentPayments: payments,

      emis
    },
  });
});

/* ============================================================================
   SPECIFIC LIST FETCHER — unchanged, just aligned with upgraded schema
============================================================================ */
exports.getSpecificList = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { type } = req.query;

  if (!type) {
    return next(new AppError("Please provide a 'type' query parameter", 400));
  }

  let Model = null;
  let selectFields = "";
  let query = { organizationId: orgId };
  let populateOptions = null;

  switch (type.toLowerCase()) {

    case "payment":
      Model = Payment;
      selectFields = "_id referenceNumber amount type paymentDate customerId supplierId method";
      populateOptions = [
        { path: 'customerId', select: 'name phone' },
        { path: 'supplierId', select: 'companyName' }
      ];
      break;

    case "emi":
      Model = EMI;
      selectFields = "_id totalAmount balanceAmount status emiStartDate customerId invoiceId";
      populateOptions = [
        { path: 'customerId', select: 'name phone' },
        { path: 'invoiceId', select: 'invoiceNumber' }
      ];
      break;

    case "invoice":
      Model = Invoice;
      selectFields = "_id invoiceNumber grandTotal paymentStatus invoiceDate customerId";
      populateOptions = { path: 'customerId', select: 'name phone' };
      break;

    case "sales":
      Model = Sales;
      selectFields = "_id invoiceNumber grandTotal saleDate customerId";
      populateOptions = { path: 'customerId', select: 'name phone' };
      break;

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

  let queryObj = Model.find(query).select(selectFields).sort({ createdAt: -1 });

  if (populateOptions) {
    queryObj = queryObj.populate(populateOptions);
  }

  let data = await queryObj.lean();

  data = data.map(item => {
    if (type.toLowerCase() === 'payment') {
      const isReceived = item.type === 'inflow';
      const name = isReceived
        ? item.customerId?.name || 'Unknown Cust'
        : item.supplierId?.companyName || 'Unknown Supp';

      const symbol = isReceived ? '+' : '-';

      return {
        ...item,
        customLabel: `${symbol} ${item.amount} | Ref: ${item.referenceNumber || '-'} | ${name}`,
        searchKey: `${item.amount} ${item.referenceNumber} ${name}`
      };
    }

    if (type.toLowerCase() === 'emi') {
      const cust = item.customerId?.name || 'Unknown';
      const inv = item.invoiceId?.invoiceNumber || 'No Inv';

      return {
        ...item,
        customLabel: `${cust} (${inv}) - ${item.status.toUpperCase()}`,
        searchKey: `${cust} ${inv} ${item.status}`
      };
    }

    if (['invoice', 'sales'].includes(type.toLowerCase())) {
      const cust = item.customerId?.name || 'Unknown';
      const phone = item.customerId?.phone || '';

      return {
        ...item,
        customLabel: `${item.invoiceNumber} - ${cust} ${phone ? `(${phone})` : ''}`,
        searchKey: `${item.invoiceNumber} ${cust} ${phone}`
      };
    }

    if (type.toLowerCase() === 'customer') {
      const city = item.billingAddress?.city || '';
      return {
        ...item,
        customLabel: `${item.name} (${item.phone}) ${city ? `- ${city}` : ''}`,
        searchKey: `${item.name} ${item.phone} ${city}`
      };
    }

    return item;
  });

  res.status(200).json({
    status: "success",
    results: data.length,
    type,
    data
  });
});

/* ============================================================================
   EXPORT & PERMISSIONS — unchanged
============================================================================ */
exports.exportMasterList = catchAsync(async (req, res, next) => {
  const data = await MasterList.find({ organizationId: req.user.organizationId }).lean();
  res.setHeader('Content-Disposition', 'attachment; filename=master-list.json');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data));
});

exports.getPermissionsMetadata = (req, res, next) => {
  res.status(200).json({
    status: "success",
    results: PERMISSIONS_LIST.length,
    data: PERMISSIONS_LIST
  });
};


// const Branch = require("../models/branchModel");
// const Role = require("../models/roleModel");
// const Customer = require("../models/customerModel");
// const Supplier = require("../models/supplierModel");
// const Product = require("../models/productModel");
// const Master = require("../models/masterModel");
// const User = require("../models/userModel")
// const Invoice = require("../models/invoiceModel")
// const Purchase = require("../models/purchaseModel")
// const Sales = require("../models/salesModel")
// const Payment = require("../models/paymentModel")
// const EMI = require("../models/emiModel")
// const { PERMISSIONS_LIST } = require('../config/permissions');
// const catchAsync = require("../utils/catchAsync");
// const AppError = require("../utils/appError");

// exports.getMasterList = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   if (!orgId) return next(new AppError("Organization not found for current user.", 400));
//   const [branches, roles, customers, suppliers, products, masters, users, invoices, purchases, sales, payments, emis] = await Promise.all([
//     Branch.find({ organizationId: orgId, isActive: true }).select("_id name").lean(),
//     Role.find({ organizationId: orgId }).select("_id name").lean(),
//     Customer.find({ organizationId: orgId, isActive: true }).select("_id name phone").lean(),
//     Supplier.find({ organizationId: orgId, isActive: true }).select("_id companyName contactPerson").lean(),
//     Product.find({ organizationId: orgId, isActive: true }).select("_id name sku sellingPrice").lean(),
//     Master.find({ organizationId: orgId, isActive: true }).select("_id type name code").lean(),
//     User.find({ organizationId: orgId, isActive: true }).select("_id name email role").lean(),
//     Invoice.find({ organizationId: orgId }).select("_id invoiceNumber grandTotal paymentStatus invoiceDate").sort({ invoiceDate: -1 }).limit(100).lean(),
//     Purchase.find({ organizationId: orgId }).select("_id invoiceNumber grandTotal supplierId").sort({ purchaseDate: -1 }).limit(100).lean(),
//     Sales.find({ organizationId: orgId }).select("_id invoiceNumber grandTotal customerId").sort({ saleDate: -1 }).limit(100).lean(),
//     Payment.find({ organizationId: orgId }).select("_id referenceNumber amount type paymentDate").sort({ paymentDate: -1 }).limit(50).lean(),
//     EMI.find({ organizationId: orgId }).select("_id totalAmount status").lean()
//   ]);

//   const groupedMasters = masters.reduce((acc, item) => {
//     if (!acc[item.type]) acc[item.type] = [];
//     acc[item.type].push({ _id: item._id, name: item.name, code: item.code });
//     return acc;
//   }, {});

//   res.status(200).json({
//     status: "success",
//     data: {
//       organizationId: orgId, branches, roles, customers, suppliers, products, users, masters: groupedMasters, recentInvoices: invoices, recentPurchases: purchases, recentSales: sales, recentPayments: payments, emis
//     },
//   });
// });

// exports.getSpecificList = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { type } = req.query;
//   if (!type) { return next(new AppError("Please provide a 'type' query parameter", 400)); }
//   let Model = null;
//   let selectFields = "";
//   let query = { organizationId: orgId };
//   let populateOptions = null
//   switch (type.toLowerCase()) {
//     case "payment":
//       Model = Payment;
//       selectFields = "_id referenceNumber amount type paymentDate customerId supplierId method";
//       populateOptions = [
//         { path: 'customerId', select: 'name phone' },
//         { path: 'supplierId', select: 'companyName' }
//       ];
//       break;

//     case "emi":
//       Model = EMI;
//       selectFields = "_id totalAmount balanceAmount status emiStartDate customerId invoiceId";
//       populateOptions = [
//         { path: 'customerId', select: 'name phone' },
//         { path: 'invoiceId', select: 'invoiceNumber' }
//       ];
//       break;

//     case "invoice":
//       Model = Invoice;
//       selectFields = "_id invoiceNumber grandTotal paymentStatus invoiceDate customerId";
//       populateOptions = { path: 'customerId', select: 'name phone' };
//       break;

//     case "sales":
//       Model = Sales;
//       selectFields = "_id invoiceNumber grandTotal saleDate customerId";
//       populateOptions = { path: 'customerId', select: 'name phone' };
//       break;

//     case "customer":
//       Model = Customer;
//       selectFields = "_id name phone email billingAddress outstandingBalance";
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

//     case "user":
//       Model = User;
//       selectFields = "_id name role phone";
//       query.isActive = true;
//       break;
//     default:
//       return next(new AppError(`Type ${type} not configured for specific list`, 400));
//   }
//   let queryObj = Model.find(query).select(selectFields).sort({ createdAt: -1 });
//   if (populateOptions) {
//     queryObj = queryObj.populate(populateOptions);
//   }
//   let data = await queryObj.lean();
//   data = data.map(item => {
//     if (type.toLowerCase() === 'payment') {
//       const isReceived = item.type === 'inflow';
//       const entityName = isReceived
//         ? (item.customerId?.name || 'Unknown Cust')
//         : (item.supplierId?.companyName || 'Unknown Supp');

//       const symbol = isReceived ? '+' : '-'

//       return {
//         ...item,
//         customLabel: `${symbol} ${item.amount} | Ref: ${item.referenceNumber || '-'} | ${entityName}`,
//         searchKey: `${item.amount} ${item.referenceNumber} ${entityName}`
//       };
//     }
//     if (type.toLowerCase() === 'emi') {
//       const custName = item.customerId?.name || 'Unknown';
//       const invNum = item.invoiceId?.invoiceNumber || 'No Inv';

//       return {
//         ...item,
//         customLabel: `${custName} (${invNum}) - ${item.status.toUpperCase()}`,
//         searchKey: `${custName} ${invNum} ${item.status}`
//       };
//     }
//     if (['invoice', 'sales'].includes(type.toLowerCase())) {
//       const custName = item.customerId?.name || 'Unknown';
//       const custPhone = item.customerId?.phone || '';

//       return {
//         ...item,
//         customLabel: `${item.invoiceNumber} - ${custName} ${custPhone ? `(${custPhone})` : ''}`,
//         searchKey: `${item.invoiceNumber} ${custName} ${custPhone}`
//       };
//     }
//     if (type.toLowerCase() === 'customer') {
//       const city = item.billingAddress?.city || '';
//       return {
//         ...item,
//         customLabel: `${item.name} (${item.phone}) ${city ? `- ${city}` : ''}`,
//         searchKey: `${item.name} ${item.phone} ${city}`
//       };
//     }
//     return item;
//   });

//   res.status(200).json({
//     status: "success",
//     results: data.length,
//     type: type,
//     data,
//   });
// });


// exports.exportMasterList = catchAsync(async (req, res, next) => {
//   const data = await MasterList.find({ organizationId: req.user.organizationId }).lean();
//   res.setHeader('Content-Disposition', 'attachment; filename=master-list.json');
//   res.setHeader('Content-Type', 'application/json');
//   res.send(JSON.stringify(data));
// });


// exports.getPermissionsMetadata = (req, res, next) => {
//   res.status(200).json({
//     status: 'success',
//     results: PERMISSIONS_LIST.length,
//     data: PERMISSIONS_LIST
//   });
// };