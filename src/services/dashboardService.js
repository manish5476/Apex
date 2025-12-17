const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Purchase = require('../models/purchaseModel');
const Payment = require('../models/paymentModel');
const Customer = require('../models/customerModel');
const Supplier = require('../models/supplierModel');
const Product = require('../models/productModel');
const AccountEntry = require('../models/accountEntryModel'); // ✅ New Source
const Account = require('../models/accountModel'); // ✅ Needed for Profit

/* ==========================================================
   SERVICE: Dashboard / Reports
   ----------------------------------------------------------
   Returns a comprehensive snapshot of the organization
========================================================== */
exports.getDashboardData = async (organizationId, branchId = null) => {
  const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };
  if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);

  // 1. Calculate P&L (Profit & Loss) using AccountEntry
  // We need to aggregate AccountEntry -> Lookup Account -> Filter by Type (Income/Expense)
  const profitAggregation = await AccountEntry.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'accounts',
        localField: 'accountId',
        foreignField: '_id',
        as: 'account'
      }
    },
    { $unwind: '$account' },
    {
      $group: {
        _id: '$account.type',
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    }
  ]);

  // Extract Income and Expense
  const incomeStats = profitAggregation.find(p => p._id === 'income') || { totalDebit: 0, totalCredit: 0 };
  const expenseStats = profitAggregation.find(p => p._id === 'expense') || { totalDebit: 0, totalCredit: 0 };

  // Accounting Logic:
  // Income: Credit Balance (Credit - Debit)
  // Expense: Debit Balance (Debit - Credit)
  const income = (incomeStats.totalCredit || 0) - (incomeStats.totalDebit || 0);
  const expenses = (expenseStats.totalDebit || 0) - (expenseStats.totalCredit || 0);
  const netProfit = income - expenses;

  // 2. Parallel Aggregations for Operational Data
  const [
    totalSales,
    totalPurchases,
    totalReceipts,
    totalPayments,
    totalCustomers,
    totalSuppliers,
    inventorySummary,
    topProducts,
    topCustomers,
  ] = await Promise.all([
    // Total Sales
    Invoice.aggregate([
      { $match: match },
      { $group: { _id: null, totalSales: { $sum: '$grandTotal' } } },
    ]),

    // Total Purchases
    Purchase.aggregate([
      { $match: match },
      { $group: { _id: null, totalPurchases: { $sum: '$grandTotal' } } },
    ]),

    // Total Customer Receipts
    Payment.aggregate([
      { $match: { ...match, type: 'inflow', status: 'completed' } },
      { $group: { _id: null, totalReceipts: { $sum: '$amount' } } },
    ]),

    // Total Supplier Payments
    Payment.aggregate([
      { $match: { ...match, type: 'outflow', status: 'completed' } },
      { $group: { _id: null, totalPayments: { $sum: '$amount' } } },
    ]),

    // Customer count
    Customer.countDocuments(match),

    // Supplier count
    Supplier.countDocuments(match),

    // Inventory value (sum of branch quantities * sellingPrice)
    Product.aggregate([
      { $match: match },
      { $unwind: '$inventory' },
      {
        $group: {
          _id: null,
          totalStockValue: {
            $sum: { $multiply: ['$inventory.quantity', '$sellingPrice'] },
          },
          totalStockQuantity: { $sum: '$inventory.quantity' },
        },
      },
    ]),

    // Top 5 Products by Sales Volume
    Invoice.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          quantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.totalPrice' }, // Assuming items have totalPrice
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      { $project: { productName: '$product.name', quantitySold: 1, totalRevenue: 1 } },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 },
    ]),

    // Top 5 Customers by Sales
    Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$customerId',
          totalSpent: { $sum: '$grandTotal' },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      { $project: { customerName: '$customer.name', totalSpent: 1 } },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 },
    ]),
  ]);

  return {
    summary: {
      totalSales: totalSales[0]?.totalSales || 0,
      totalPurchases: totalPurchases[0]?.totalPurchases || 0,
      totalReceipts: totalReceipts[0]?.totalReceipts || 0,
      totalPayments: totalPayments[0]?.totalPayments || 0,
      totalCustomers,
      totalSuppliers,
      stockValue: inventorySummary[0]?.totalStockValue || 0,
      totalStockQuantity: inventorySummary[0]?.totalStockQuantity || 0,
      
      // ✅ Now powered by Real Double-Entry Accounting
      income,
      expenses,
      netProfit,
    },
    topProducts,
    topCustomers,
  };
};

// const mongoose = require('mongoose');
// const Invoice = require('../models/invoiceModel');
// const Purchase = require('../models/purchaseModel');
// const Payment = require('../models/paymentModel');
// const Customer = require('../models/customerModel');
// const Supplier = require('../models/supplierModel');
// const Product = require('../models/productModel');

// /* ==========================================================
//    SERVICE: Dashboard / Reports
//    ----------------------------------------------------------
//    Returns a comprehensive snapshot of the organization:
//    - Total Sales, Purchases, Payments, Customers, etc.
//    - Profit summary
//    - Top products and customers
//    - Outstanding balances
// ========================================================== */
// exports.getDashboardData = async (organizationId, branchId = null) => {
//   const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };
//   if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);

//   // Aggregations
//   const [
//     totalSales,
//     totalPurchases,
//     totalReceipts,
//     totalPayments,
//     totalCustomers,
//     totalSuppliers,
//     inventorySummary,
//     profitStats,
//     topProducts,
//     topCustomers,
//   ] = await Promise.all([
//     // Total Sales
//     Invoice.aggregate([
//       { $match: match },
//       { $group: { _id: null, totalSales: { $sum: '$grandTotal' } } },
//     ]),

//     // Total Purchases
//     Purchase.aggregate([
//       { $match: match },
//       { $group: { _id: null, totalPurchases: { $sum: '$grandTotal' } } },
//     ]),

//     // Total Customer Receipts
//     Payment.aggregate([
//       { $match: { ...match, type: 'inflow', status: 'completed' } },
//       { $group: { _id: null, totalReceipts: { $sum: '$amount' } } },
//     ]),

//     // Total Supplier Payments
//     Payment.aggregate([
//       { $match: { ...match, type: 'outflow', status: 'completed' } },
//       { $group: { _id: null, totalPayments: { $sum: '$amount' } } },
//     ]),

//     // Customer count
//     Customer.countDocuments(match),

//     // Supplier count
//     Supplier.countDocuments(match),

//     // Inventory value (sum of branch quantities * sellingPrice)
//     Product.aggregate([
//       { $match: match },
//       { $unwind: '$inventory' },
//       {
//         $group: {
//           _id: null,
//           totalStockValue: {
//             $sum: { $multiply: ['$inventory.quantity', '$sellingPrice'] },
//           },
//           totalStockQuantity: { $sum: '$inventory.quantity' },
//         },
//       },
//     ]),

//     // Profit = Total Sales - Total Purchases
//     Ledger.aggregate([
//       { $match: match },
//       {
//         $group: {
//           _id: '$type',
//           total: { $sum: '$amount' },
//         },
//       },
//     ]),

//     // Top 5 Products by Sales Volume
//     Invoice.aggregate([
//       { $match: match },
//       { $unwind: '$items' },
//       {
//         $group: {
//           _id: '$items.productId',
//           quantitySold: { $sum: '$items.quantity' },
//           totalRevenue: { $sum: '$items.totalPrice' },
//         },
//       },
//       {
//         $lookup: {
//           from: 'products',
//           localField: '_id',
//           foreignField: '_id',
//           as: 'product',
//         },
//       },
//       { $unwind: '$product' },
//       { $project: { productName: '$product.name', quantitySold: 1, totalRevenue: 1 } },
//       { $sort: { quantitySold: -1 } },
//       { $limit: 5 },
//     ]),

//     // Top 5 Customers by Sales
//     Invoice.aggregate([
//       { $match: match },
//       {
//         $group: {
//           _id: '$customerId',
//           totalSpent: { $sum: '$grandTotal' },
//         },
//       },
//       {
//         $lookup: {
//           from: 'customers',
//           localField: '_id',
//           foreignField: '_id',
//           as: 'customer',
//         },
//       },
//       { $unwind: '$customer' },
//       { $project: { customerName: '$customer.name', totalSpent: 1 } },
//       { $sort: { totalSpent: -1 } },
//       { $limit: 5 },
//     ]),
//   ]);

//   const income = profitStats.find((p) => p._id === 'credit')?.total || 0;
//   const expenses = profitStats.find((p) => p._id === 'debit')?.total || 0;
//   const netProfit = income - expenses;

//   return {
//     summary: {
//       totalSales: totalSales[0]?.totalSales || 0,
//       totalPurchases: totalPurchases[0]?.totalPurchases || 0,
//       totalReceipts: totalReceipts[0]?.totalReceipts || 0,
//       totalPayments: totalPayments[0]?.totalPayments || 0,
//       totalCustomers,
//       totalSuppliers,
//       stockValue: inventorySummary[0]?.totalStockValue || 0,
//       totalStockQuantity: inventorySummary[0]?.totalStockQuantity || 0,
//       income,
//       expenses,
//       netProfit,
//     },
//     topProducts,
//     topCustomers,
//   };
// };
