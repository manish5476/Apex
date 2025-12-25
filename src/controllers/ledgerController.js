const AccountEntry = require('../models/accountEntryModel');
const Account = require('../models/accountModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('../utils/handlerFactory');
const ApiFeatures = require('../utils/ApiFeatures');
const mongoose = require('mongoose');
const { 
  getOpeningBalance, 
  setOpeningBalance 
} = require("../services/ledgerCache");
/* -------------------------------------------------------------
   GET ALL ENTRIES (Journal View)
------------------------------------------------------------- */
exports.getAllLedgers = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;

  const {
    startDate,
    endDate,
    customerId,
    supplierId,
    accountId,
    paymentStatus,
    invoiceStatus,
    entryType,
    minAmount,
    maxAmount,
    search,

    lastDate,
    lastId,
    limit = 50
  } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
  }

  if (customerId) match.customerId = new mongoose.Types.ObjectId(customerId);
  if (supplierId) match.supplierId = new mongoose.Types.ObjectId(supplierId);
  if (accountId) match.accountId = new mongoose.Types.ObjectId(accountId);
  if (entryType === "debit") match.debit = { $gt: 0 };
  if (entryType === "credit") match.credit = { $gt: 0 };

  if (minAmount || maxAmount) {
    const range = {};
    if (minAmount) range.$gte = Number(minAmount);
    if (maxAmount) range.$lte = Number(maxAmount);
    match.$or = [{ debit: range }, { credit: range }];
  }

  const pipeline = [{ $match: match }];

  if (lastDate && lastId) {
    pipeline.push({
      $match: {
        $or: [
          { date: { $lt: new Date(lastDate) } },
          {
            date: new Date(lastDate),
            _id: { $lt: new mongoose.Types.ObjectId(lastId) }
          }
        ]
      }
    });
  }

  pipeline.push(
    // ACCOUNT
    {
      $lookup: {
        from: "accounts",
        localField: "accountId",
        foreignField: "_id",
        as: "account"
      }
    },
    { $unwind: "$account" },

    // CUSTOMER
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customer"
      }
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

    // SUPPLIER
    {
      $lookup: {
        from: "suppliers",
        localField: "supplierId",
        foreignField: "_id",
        as: "supplier"
      }
    },
    { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },

    // INVOICE
    {
      $lookup: {
        from: "invoices",
        localField: "invoiceId",
        foreignField: "_id",
        as: "invoice"
      }
    },
    { $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true } },

    // PURCHASE
    {
      $lookup: {
        from: "purchases",
        localField: "purchaseId",
        foreignField: "_id",
        as: "purchase"
      }
    },
    { $unwind: { path: "$purchase", preserveNullAndEmptyArrays: true } },

    // PAYMENT
    {
      $lookup: {
        from: "payments",
        localField: "paymentId",
        foreignField: "_id",
        as: "payment"
      }
    },
    { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } }
  );

  // search filter
  if (search) {
    const regex = new RegExp(search, "i");
    pipeline.push({
      $match: {
        $or: [
          { description: regex },
          { referenceNumber: regex },
          { "account.name": regex },
          { "customer.name": regex },
          { "supplier.companyName": regex },
          { "invoice.invoiceNumber": regex },
          { "purchase.invoiceNumber": regex }
        ]
      }
    });
  }

  if (paymentStatus) {
    pipeline.push({
      $match: {
        $or: [
          { "invoice.paymentStatus": paymentStatus },
          { "purchase.paymentStatus": paymentStatus }
        ]
      }
    });
  }

  if (invoiceStatus) {
    pipeline.push({
      $match: { "invoice.status": invoiceStatus }
    });
  }

  pipeline.push(
    { $sort: { date: -1, _id: -1 } },
    { $limit: Number(limit) },

    {
      $project: {
        _id: 1,
        date: 1,
        debit: 1,
        credit: 1,
        description: 1,
        referenceType: 1,
        referenceNumber: 1,

        accountId: 1,
        "account.name": 1,
        "account.code": 1,
        "account.type": 1,

        customerId: 1,
        supplierId: 1,
        invoiceId: 1,
        purchaseId: 1,
        paymentId: 1,

        branchId: 1,
        createdBy: 1,

        customerName: "$customer.name",
        customerPhone: "$customer.phone",

        supplierName: "$supplier.companyName",
        supplierPhone: "$supplier.phone",

        invoiceNumber: "$invoice.invoiceNumber",
        purchaseNumber: "$purchase.invoiceNumber",
        paymentRef: "$payment.reference"
      }
    }
  );

  const docs = await AccountEntry.aggregate(pipeline);

  const nextCursor = docs.length
    ? {
        lastDate: docs[docs.length - 1].date,
        lastId: docs[docs.length - 1]._id
      }
    : null;

  return res.status(200).json({
    status: "success",
    count: docs.length,
    nextCursor,
    data: docs
  });
});

/* -------------------------------------------------------------
   CUSTOMER STATEMENT (Optimized)
------------------------------------------------------------- */

exports.getCustomerLedger = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const { startDate, endDate, limit = 200 } = req.query;

  const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
  const custId = new mongoose.Types.ObjectId(customerId);

  const match = {
    organizationId: orgId,
    customerId: custId
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23,59,59,999));
  }

  let openingBalance = 0;
  let cached = null;

  if (startDate) {
    cached = await getOpeningBalance(orgId, custId, startDate);
  }

  if (cached !== null) {
    openingBalance = cached;
  } else if (startDate) {
    const start = new Date(startDate);

    const prev = await AccountEntry.aggregate([
      {
        $match: {
          organizationId: orgId,
          customerId: custId,
          date: { $lt: start }
        }
      },
      {
        $group: {
          _id: null,
          debit: { $sum: "$debit" },
          credit: { $sum: "$credit" }
        }
      }
    ]);

    openingBalance = prev.length
      ? prev[0].debit - prev[0].credit
      : 0;

    await setOpeningBalance(orgId, custId, startDate, openingBalance);
  }

  const pipeline = [
    { $match: match },

    // invoice join
    {
      $lookup: {
        from: "invoices",
        localField: "invoiceId",
        foreignField: "_id",
        as: "invoice"
      }
    },
    { $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true } },

    // payment join
    {
      $lookup: {
        from: "payments",
        localField: "paymentId",
        foreignField: "_id",
        as: "payment"
      }
    },
    { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },

    {
      $sort: { date: 1, _id: 1 }
    },
    {
      $limit: Number(limit)
    },

    {
      $project: {
        _id: 1,
        date: 1,
        debit: 1,
        credit: 1,
        description: 1,
        referenceNumber: 1,
        referenceType: 1,

        branchId: 1,
        createdBy: 1,

        invoiceId: 1,
        paymentId: 1,

        invoiceNumber: "$invoice.invoiceNumber",
        invoiceStatus: "$invoice.paymentStatus",

        paymentRef: "$payment.reference",
        paymentMethod: "$payment.method"
      }
    }
  ];

  const entries = await AccountEntry.aggregate(pipeline);

  let running = openingBalance;
  const history = [];

  if (startDate) {
    history.push({
      _id: "opening",
      date: new Date(startDate),
      description: "Opening Balance",
      debit: 0,
      credit: 0,
      balance: Number(running.toFixed(2))
    });
  }

  for (const e of entries) {
    running += (e.debit || 0) - (e.credit || 0);

    history.push({
      ...e,
      balance: Number(running.toFixed(2))
    });
  }

  const customer = await mongoose.model("Customer")
    .findById(customerId)
    .select("name phone gstNumber outstandingBalance");

  res.status(200).json({
    status: "success",
    openingBalance,
    closingBalance: running,
    customer,
    count: history.length,
    cached: cached !== null,
    history
  });
});

/* -------------------------------------------------------------
   SUPPLIER STATEMENT (Optimized)
------------------------------------------------------------- */
exports.getSupplierLedger = catchAsync(async (req, res, next) => {
  const { supplierId } = req.params;
  const { startDate, endDate, limit = 200 } = req.query;

  const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
  const suppId = new mongoose.Types.ObjectId(supplierId);

  const match = {
    organizationId: orgId,
    supplierId: suppId
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23,59,59,999));
  }

  let openingBalance = 0;
  let cached = null;

  if (startDate) {
    cached = await getOpeningBalance(orgId, suppId, startDate);
  }

  if (cached !== null) {
    openingBalance = cached;
  } else if (startDate) {
    const start = new Date(startDate);

    const prev = await AccountEntry.aggregate([
      {
        $match: {
          organizationId: orgId,
          supplierId: suppId,
          date: { $lt: start }
        }
      },
      {
        $group: {
          _id: null,
          debit: { $sum: "$debit" },
          credit: { $sum: "$credit" }
        }
      }
    ]);

    openingBalance = prev.length
      ? prev[0].credit - prev[0].debit
      : 0;

    await setOpeningBalance(orgId, suppId, startDate, openingBalance);
  }

  const pipeline = [
    { $match: match },

    {
      $lookup: {
        from: "purchases",
        localField: "purchaseId",
        foreignField: "_id",
        as: "purchase"
      }
    },
    { $unwind: { path: "$purchase", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "payments",
        localField: "paymentId",
        foreignField: "_id",
        as: "payment"
      }
    },
    { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },

    {
      $sort: { date: 1, _id: 1 }
    },
    {
      $limit: Number(limit)
    },

    {
      $project: {
        _id: 1,
        date: 1,
        debit: 1,
        credit: 1,
        description: 1,
        referenceNumber: 1,
        referenceType: 1,

        branchId: 1,
        createdBy: 1,

        purchaseId: 1,
        paymentId: 1,

        purchaseNumber: "$purchase.invoiceNumber",
        purchaseStatus: "$purchase.paymentStatus",

        paymentRef: "$payment.reference",
        paymentMethod: "$payment.method"
      }
    }
  ];

  const entries = await AccountEntry.aggregate(pipeline);

  let running = openingBalance;
  const history = [];

  if (startDate) {
    history.push({
      _id: "opening",
      date: new Date(startDate),
      description: "Opening Balance",
      debit: 0,
      credit: 0,
      balance: Number(running.toFixed(2))
    });
  }

  for (const e of entries) {
    running += (e.credit || 0) - (e.debit || 0);
    history.push({
      ...e,
      balance: Number(running.toFixed(2))
    });
  }

  const supplier = await mongoose.model("Supplier")
    .findById(supplierId)
    .select("companyName phone gstNumber outstandingBalance");

  res.status(200).json({
    status: "success",
    openingBalance,
    closingBalance: running,
    supplier,
    count: history.length,
    cached: cached !== null,
    history
  });
});


exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const summary = await AccountEntry.aggregate([
    { $match: match },

    // join only AFTER filtering to use indexes
    {
      $lookup: {
        from: "accounts",
        localField: "accountId",
        foreignField: "_id",
        as: "account"
      }
    },
    { $unwind: "$account" },

    // group by type
    {
      $group: {
        _id: "$account.type",
        debit: { $sum: "$debit" },
        credit: { $sum: "$credit" }
      }
    },

    // project net for each type
    {
      $project: {
        type: "$_id",
        net: { $subtract: ["$credit", "$debit"] }, // credit - debit
        debit: 1,
        credit: 1,
        _id: 0
      }
    }
  ]);

  // initialize zero for all types
  const result = {
    asset: 0,
    liability: 0,
    equity: 0,
    income: 0,
    expense: 0,
    other: 0
  };

  // fill actual values
  summary.forEach(s => {
    result[s.type] = s.net || 0;
  });

  // net profit/loss is income - expense
  const netProfit = result.income - result.expense;

  res.status(200).json({
    status: "success",
    data: {
      ...result,
      netProfit
    }
  });
});

const ExcelJS = require("exceljs");

exports.exportLedgers = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { start, end, customerId, supplierId } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (start || end) {
    match.date = {};
    if (start) match.date.$gte = new Date(start);
    if (end) match.date.$lte = new Date(end);
  }

  if (customerId) match.customerId = new mongoose.Types.ObjectId(customerId);
  if (supplierId) match.supplierId = new mongoose.Types.ObjectId(supplierId);

  const pipeline = [
    { $match: match },

    { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", as: "account" }},
    { $unwind: "$account" },

    { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" }},
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true }},

    { $lookup: { from: "suppliers", localField: "supplierId", foreignField: "_id", as: "supplier" }},
    { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true }},

    { $sort: { date: 1, _id: 1 }}
  ];

  const entries = await AccountEntry.aggregate(pipeline);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ledger");

  sheet.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "Account", key: "account", width: 20 },
    { header: "Type", key: "type", width: 12 },
    { header: "Description", key: "description", width: 40 },
    { header: "Reference", key: "reference", width: 20 },
    { header: "Party", key: "party", width: 20 },
    { header: "Party Type", key: "partyType", width: 12 },
    { header: "GST", key: "gst", width: 15 },
    { header: "Branch", key: "branch", width: 15 },
    { header: "Created By", key: "createdBy", width: 20 },
    { header: "Debit", key: "debit", width: 15 },
    { header: "Credit", key: "credit", width: 15 },
    { header: "Balance", key: "balance", width: 15 }
  ];

  let running = 0;

  entries.forEach(e => {
    running += (e.debit - e.credit);

    const party =
      e.customer?.name ||
      e.supplier?.companyName ||
      "-";

    const partyType =
      e.customer ? "Customer" :
      e.supplier ? "Supplier" : "None";

    sheet.addRow({
      date: e.date.toISOString().split("T")[0],
      account: e.account.name,
      type: e.account.type,
      description: e.description,
      reference: e.referenceNumber,
      party,
      partyType,
      gst: e.customer?.gstNumber || e.supplier?.gstNumber || "-",
      branch: e.branchId || "-",
      createdBy: e.createdBy || "-",
      debit: e.debit || "",
      credit: e.credit || "",
      balance: running.toFixed(2)
    });
  });

  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader( "Content-Disposition", "attachment; filename=ledger.xlsx"  );
  await workbook.xlsx.write(res);

  res.end();
});

exports.getLedger = factory.getOne(AccountEntry);
exports.deleteLedger = factory.deleteOne(AccountEntry);
exports.getTrialBalance = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const trial = await AccountEntry.aggregate([
    { $match: match },

    {
      $lookup: {
        from: "accounts",
        localField: "accountId",
        foreignField: "_id",
        as: "account"
      }
    },
    { $unwind: "$account" },

    {
      $group: {
        _id: "$account._id",
        accountName: { $first: "$account.name" },
        accountType: { $first: "$account.type" },
        debit: { $sum: "$debit" },
        credit: { $sum: "$credit" }
      }
    },

    { $sort: { accountType: 1, accountName: 1 } }
  ]);

  const totals = {
    totalDebit: trial.reduce((a, b) => a + b.debit, 0),
    totalCredit: trial.reduce((a, b) => a + b.credit, 0)
  };

  res.status(200).json({
    status: "success",
    totals,
    difference: totals.totalDebit - totals.totalCredit,
    trial
  });
});

exports.getProfitAndLoss = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const summary = await AccountEntry.aggregate([
    { $match: match },

    {
      $lookup: {
        from: "accounts",
        localField: "accountId",
        foreignField: "_id",
        as: "account"
      }
    },
    { $unwind: "$account" },

    {
      $match: {
        "account.type": { $in: ["income", "expense"] }
      }
    },

    {
      $group: {
        _id: "$account.type",
        debit: { $sum: "$debit" },
        credit: { $sum: "$credit" }
      }
    }
  ]);

  const income = summary.find(s => s._id === "income") || { debit: 0, credit: 0 };
  const expense = summary.find(s => s._id === "expense") || { debit: 0, credit: 0 };

  const totalIncome = income.credit - income.debit;
  const totalExpense = expense.debit - expense.credit;

  const netProfit = totalIncome - totalExpense;

  res.status(200).json({
    status: "success",
    totalIncome,
    totalExpense,
    netProfit
  });
});
exports.getBalanceSheet = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { asOfDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  };

  if (asOfDate) {
    match.date = { $lte: new Date(new Date(asOfDate).setHours(23,59,59)) };
  }

  const summary = await AccountEntry.aggregate([
    { $match: match },

    {
      $lookup: {
        from: "accounts",
        localField: "accountId",
        foreignField: "_id",
        as: "account"
      }
    },
    { $unwind: "$account" },

    {
      $group: {
        _id: "$account.type",
        debit: { $sum: "$debit" },
        credit: { $sum: "$credit" }
      }
    }
  ]);

  const get = (t) => summary.find(s => s._id === t) || { debit: 0, credit: 0 };

  const assets     = get("asset").debit - get("asset").credit;
  const liabilities = get("liability").credit - get("liability").debit;
  const equity      = get("equity").credit - get("equity").debit;

  const retainedEarnings = (equity); // simplified until P&L integrated

  res.status(200).json({
    status: "success",
    assets,
    liabilities,
    equity,
    retainedEarnings,
    balanced: (assets === liabilities + retainedEarnings)
  });
});
exports.getRetainedEarnings = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { asOfDate } = req.query;

  const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };

  if (asOfDate) {
    match.date = { $lte: new Date(asOfDate) };
  }

  const summary = await AccountEntry.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "accounts",
        localField: "accountId",
        foreignField: "_id",
        as: "account"
      }
    },
    { $unwind: "$account" },
    {
      $match: { "account.type": { $in: ["income", "expense"] } }
    },
    {
      $group: {
        _id: "$account.type",
        debit: { $sum: "$debit" },
        credit: { $sum: "$credit" }
      }
    }
  ]);

  const income = summary.find(s => s._id === "income") || { debit: 0, credit: 0 };
  const expense = summary.find(s => s._id === "expense") || { debit: 0, credit: 0 };

  const netProfit = (income.credit - income.debit) - (expense.debit - expense.credit);

  res.status(200).json({
    status: "success",
    retainedEarnings: netProfit
  });
});

exports.getAccountDrillDown = catchAsync(async (req, res, next) => {
  const { accountId } = req.params;
  const { organizationId } = req.user;
  const { startDate, endDate, limit = 100 } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    accountId: new mongoose.Types.ObjectId(accountId)
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const docs = await AccountEntry.aggregate([
    { $match: match },
    { $sort: { date: -1, _id: -1 }},
    { $limit: Number(limit) }
  ]);

  res.status(200).json({
    status: "success",
    count: docs.length,
    data: docs
  });
});
exports.getCashFlow = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const { startDate, endDate } = req.query;

  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    $or: [
      { referenceType: "payment" },
      { referenceType: "invoice" },
      { referenceType: "purchase" }
    ]
  };

  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const entries = await AccountEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$referenceType",
        cashIn: { $sum: "$credit" },
        cashOut: { $sum: "$debit" }
      }
    }
  ]);

  const cashIn = entries.reduce((a, b) => a + b.cashIn, 0);
  const cashOut = entries.reduce((a, b) => a + b.cashOut, 0);

  res.status(200).json({
    status: "success",
    cashIn,
    cashOut,
    netCashFlow: cashIn - cashOut
  });
});

// exports.getCustomerLedger = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;
//   const { startDate, endDate, limit = 200 } = req.query;

//   const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
//   const custId = new mongoose.Types.ObjectId(customerId);

//   let match = {
//     organizationId: orgId,
//     customerId: custId
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23,59,59));
//   }


//   /* ==========================
//      1️⃣ Opening Balance Cache Logic
//   =========================== */

//   let openingBalance = 0;

//   let cached = null;

//   if (startDate) {
//     cached = await getOpeningBalance(orgId, custId, startDate);
//   }

//   if (cached !== null) {
//     openingBalance = cached;
//   } 
//   else if (startDate) {
//     const start = new Date(startDate);

//     const prev = await AccountEntry.aggregate([
//       { $match: { 
//           organizationId: orgId, 
//           customerId: custId, 
//           date: { $lt: start } 
//       }},
//       { $group: { 
//           _id: null, 
//           debit: { $sum: '$debit' }, 
//           credit: { $sum: '$credit' } 
//       }}
//     ]);

//     openingBalance = prev.length
//       ? prev[0].debit - prev[0].credit
//       : 0;

//     // store in cache
//     await setOpeningBalance(orgId, custId, startDate, openingBalance);
//   }


//   /* ==========================
//      2️⃣ Ledger Fetch
//   =========================== */

//   const pipeline = [
//     { $match: match },

//     { $lookup: {
//       from: 'invoices',
//       localField: 'invoiceId',
//       foreignField: '_id',
//       as: 'invoice'
//     }},
//     { $unwind: { 
//       path: '$invoice', 
//       preserveNullAndEmptyArrays: true 
//     }},

//     { $sort: { date: 1, _id: 1 }},

//     { $limit: Number(limit) }
//   ];

//   const entries = await AccountEntry.aggregate(pipeline);


//   /* ==========================
//      3️⃣ Running Balance
//   =========================== */

//   let running = openingBalance;
//   const history = [];

//   if (startDate) {
//     history.push({
//       _id: 'opening',
//       date: new Date(startDate),
//       description: 'Opening Balance',
//       debit: 0, 
//       credit: 0,
//       balance: Number(running.toFixed(2))
//     });
//   }

//   for (const e of entries) {
//     running += (e.debit || 0) - (e.credit || 0);

//     history.push({
//       _id: e._id,
//       date: e.date,
//       description: e.description,
//       referenceNumber: e.referenceNumber,
//       invoiceNumber: e.invoice?.invoiceNumber || null,
//       paymentStatus: e.invoice?.paymentStatus || null,

//       debit: e.debit,
//       credit: e.credit,
//       balance: Number(running.toFixed(2))
//     });
//   }


//   /* ==========================
//      4️⃣ Customer Details
//   =========================== */
//   const customer = await mongoose.model('Customer')
//     .findById(customerId)
//     .select('name phone gstNumber outstandingBalance');

//   res.status(200).json({
//     status: 'success',
//     openingBalance,
//     closingBalance: running,
//     customer,
//     count: history.length,
//     cached: cached !== null,
//     history
//   });
// });

// exports.exportLedgers = catchAsync(async (req, res, next) => {
//   const { organizationId } = req.user;
//   const { start, end, customerId, supplierId } = req.query;

//   const match = {
//     organizationId: new mongoose.Types.ObjectId(organizationId)
//   };

//   if (start || end) {
//     match.date = {};
//     if (start) match.date.$gte = new Date(start);
//     if (end) match.date.$lte = new Date(end);
//   }

//   if (customerId) match.customerId = new mongoose.Types.ObjectId(customerId);
//   if (supplierId) match.supplierId = new mongoose.Types.ObjectId(supplierId);

//   const pipeline = [
//     { $match: match },

//     { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' }},
//     { $unwind: '$account' },

//     { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' }},
//     { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true }},

//     { $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supplier' }},
//     { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true }},

//     { $sort: { date: 1, _id: 1 }}
//   ];

//   const entries = await AccountEntry.aggregate(pipeline);

//   let running = 0;
//   const rows = [];

//   for (const e of entries) {
//     running += (e.debit - e.credit);
//     rows.push({
//       date: e.date.toISOString(),
//       account: e.account.name,
//       description: e.description,
//       referenceNumber: e.referenceNumber,
//       party: e.customer?.name || e.supplier?.companyName || '-',
//       gst: e.customer?.gstNumber || e.supplier?.gstNumber || '-',
//       debit: e.debit,
//       credit: e.credit,
//       balance: running.toFixed(2)
//     });
//   }

//   res.status(200).json({
//     status: 'success',
//     count: rows.length,
//     data: rows
//   });
// });

// exports.getSupplierLedger = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;
//   const { startDate, endDate, limit = 200 } = req.query;

//   const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
//   const suppId = new mongoose.Types.ObjectId(supplierId);

//   let match = {
//     organizationId: orgId,
//     supplierId: suppId
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23,59,59));
//   }

//   /* ===========================================
//      1️⃣ Opening Balance Cache 
//   ============================================ */

//   let openingBalance = 0;
//   let cached = null;

//   if (startDate) {
//     cached = await getOpeningBalance(orgId, suppId, startDate);
//   }

//   if (cached !== null) {
//     openingBalance = cached;
//   } 
//   else if (startDate) {
//     const start = new Date(startDate);

//     const prev = await AccountEntry.aggregate([
//       { $match: { 
//           organizationId: orgId, 
//           supplierId: suppId, 
//           date: { $lt: start } 
//       }},
//       { $group: { 
//           _id: null, 
//           debit: { $sum: '$debit' }, 
//           credit: { $sum: '$credit' } 
//       }}
//     ]);

//     // NOTE: suppliers invert the rule (credit − debit)
//     openingBalance = prev.length
//       ? prev[0].credit - prev[0].debit
//       : 0;

//     await setOpeningBalance(orgId, suppId, startDate, openingBalance);
//   }

//   /* ===========================================
//      2️⃣ Ledger Fetch
//   ============================================ */

//   const pipeline = [
//     { $match: match },

//     { $lookup: {
//       from: 'purchases',
//       localField: 'purchaseId',
//       foreignField: '_id',
//       as: 'purchase'
//     }},
//     { $unwind: { 
//       path: '$purchase', 
//       preserveNullAndEmptyArrays: true 
//     }},

//     { $sort: { date: 1, _id: 1 }},

//     { $limit: Number(limit) }
//   ];

//   const entries = await AccountEntry.aggregate(pipeline);

//   /* ===========================================
//      3️⃣ Running Balance
//   ============================================ */
//   let running = openingBalance;
//   const history = [];

//   if (startDate) {
//     history.push({
//       _id: 'opening',
//       date: new Date(startDate),
//       description: 'Opening Balance',
//       debit: 0, credit: 0,
//       balance: Number(running.toFixed(2))
//     });
//   }

//   for (const e of entries) {
//     running += (e.credit || 0) - (e.debit || 0);

//     history.push({
//       _id: e._id,
//       date: e.date,
//       description: e.description,
//       referenceNumber: e.referenceNumber,
//       purchaseNumber: e.purchase?.invoiceNumber || null,
//       paymentStatus: e.purchase?.paymentStatus || null,
//       debit: e.debit,
//       credit: e.credit,
//       balance: Number(running.toFixed(2))
//     });
//   }

//   /* ===========================================
//      4️⃣ Supplier Info
//   ============================================ */
//   const supplier = await mongoose.model("Supplier")
//     .findById(supplierId)
//     .select("companyName phone gstNumber outstandingBalance");

//   res.status(200).json({
//     status: "success",
//     openingBalance,
//     closingBalance: running,
//     supplier,
//     count: history.length,
//     cached: cached !== null,
//     history
//   });
// });
// exports.getAllLedgers = catchAsync(async (req, res, next) => {

//   const { organizationId } = req.user;

//   const {
//     startDate,
//     endDate,
//     customerId,
//     supplierId,
//     accountId,
//     paymentStatus,
//     invoiceStatus,
//     entryType,
//     minAmount,
//     maxAmount,
//     search,

//     // cursor-based pagination
//     lastDate,
//     lastId,
//     limit = 50
//   } = req.query;

//   const match = {
//     organizationId: new mongoose.Types.ObjectId(organizationId)
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23,59,59,999));
//   }

//   if (customerId) match.customerId = new mongoose.Types.ObjectId(customerId);
//   if (supplierId) match.supplierId = new mongoose.Types.ObjectId(supplierId);
//   if (accountId) match.accountId = new mongoose.Types.ObjectId(accountId);

//   if (entryType === 'debit') match.debit = { $gt: 0 };
//   if (entryType === 'credit') match.credit = { $gt: 0 };

//   if (minAmount || maxAmount) {
//     const range = {};
//     if (minAmount) range.$gte = Number(minAmount);
//     if (maxAmount) range.$lte = Number(maxAmount);

//     match.$or = [
//       { debit: range },
//       { credit: range }
//     ];
//   }

//   const pipeline = [
//     { $match: match }
//   ];

//   if (lastDate && lastId) {
//     pipeline.push({
//       $match: {
//         $or: [
//           { date: { $lt: new Date(lastDate) } },
//           {
//             date: new Date(lastDate),
//             _id: { $lt: new mongoose.Types.ObjectId(lastId) }
//           }
//         ]
//       }
//     });
//   }

//   pipeline.push(
//     { $lookup: {
//         from: 'accounts',
//         localField: 'accountId',
//         foreignField: '_id',
//         as: 'account'
//     }},
//     { $unwind: { path: '$account', preserveNullAndEmptyArrays: true }},

//     { $lookup: {
//         from: 'customers',
//         localField: 'customerId',
//         foreignField: '_id',
//         as: 'customer'
//     }},
//     { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true }},

//     { $lookup: {
//         from: 'suppliers',
//         localField: 'supplierId',
//         foreignField: '_id',
//         as: 'supplier'
//     }},
//     { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true }},

//     { $lookup: {
//         from: 'invoices',
//         localField: 'invoiceId',
//         foreignField: '_id',
//         as: 'invoice'
//     }},
//     { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true }},

//     { $lookup: {
//         from: 'purchases',
//         localField: 'purchaseId',
//         foreignField: '_id',
//         as: 'purchase'
//     }},
//     { $unwind: { path: '$purchase', preserveNullAndEmptyArrays: true }}
//   );

//   if (search) {
//     const regex = new RegExp(search, 'i');
//     pipeline.push({
//       $match: {
//         $or: [
//           { description: regex },
//           { referenceNumber: regex },
//           { 'account.name': regex },
//           { 'customer.name': regex },
//           { 'supplier.companyName': regex },
//           { 'invoice.invoiceNumber': regex },
//           { 'purchase.invoiceNumber': regex }
//         ]
//       }
//     });
//   }

//   if (paymentStatus) {
//     pipeline.push({
//       $match: {
//         $or: [
//           { 'invoice.paymentStatus': paymentStatus },
//           { 'purchase.paymentStatus': paymentStatus }
//         ]
//       }
//     });
//   }

//   if (invoiceStatus) {
//     pipeline.push({ $match: { 'invoice.status': invoiceStatus } });
//   }

//   pipeline.push(
//     { $project: {
//         date: 1,
//         description: 1,
//         referenceNumber: 1,
//         debit: 1,
//         credit: 1,

//         account: {
//           name: 1,
//           code: 1,
//           type: 1
//         },

//         customer: {
//           name: 1,
//           phone: 1,
//           gstNumber: 1
//         },

//         supplier: {
//           companyName: 1,
//           phone: 1,
//           gstNumber: 1
//         },

//         invoice: {
//           invoiceNumber: 1,
//           paymentStatus: 1,
//           grandTotal: 1,
//           balanceAmount: 1
//         },

//         purchase: {
//           invoiceNumber: 1,
//           paymentStatus: 1,
//           grandTotal: 1,
//           balanceAmount: 1
//         }
//       }
//     },

//     { $sort: { date: -1, _id: -1 } },

//     { $limit: Number(limit) }
//   );

//   const docs = await AccountEntry.aggregate(pipeline);

//   const nextCursor = docs.length
//     ? { lastDate: docs[docs.length-1].date, lastId: docs[docs.length-1]._id }
//     : null;

//   res.status(200).json({
//     status: 'success',
//     count: docs.length,
//     nextCursor,
//     data: docs
//   });
// });

// exports.getCustomerLedger = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;
//   const { startDate, endDate, limit = 200 } = req.query;

//   const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
//   const custId = new mongoose.Types.ObjectId(customerId);

//   let match = {
//     organizationId: orgId,
//     customerId: custId
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23,59,59));
//   }

//   // Opening balance BEFORE startDate
//   let openingBalance = 0;

//   if (startDate) {
//     const start = new Date(startDate);

//     const prev = await AccountEntry.aggregate([
//       { $match: { organizationId: orgId, customerId: custId, date: { $lt: start } }},
//       { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }
//     ]);

//     if (prev.length)
//       openingBalance = prev[0].debit - prev[0].credit;
//   }

//   const pipeline = [
//     { $match: match },

//     { $lookup: {
//       from: 'invoices',
//       localField: 'invoiceId',
//       foreignField: '_id',
//       as: 'invoice'
//     }},
//     { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true }},

//     { $sort: { date: 1, _id: 1 }},

//     { $limit: Number(limit) }
//   ];

//   const entries = await AccountEntry.aggregate(pipeline);

//   let running = openingBalance;
//   const history = [];

//   if (startDate) {
//     history.push({
//       _id: 'opening',
//       date: new Date(startDate),
//       description: 'Opening Balance',
//       debit: 0, credit: 0,
//       balance: Number(running.toFixed(2))
//     });
//   }

//   for (const e of entries) {
//     running += (e.debit || 0) - (e.credit || 0);

//     history.push({
//       _id: e._id,
//       date: e.date,
//       description: e.description,
//       referenceNumber: e.referenceNumber,
//       invoiceNumber: e.invoice?.invoiceNumber || null,
//       paymentStatus: e.invoice?.paymentStatus || null,

//       debit: e.debit,
//       credit: e.credit,
//       balance: Number(running.toFixed(2))
//     });
//   }

//   const customer = await mongoose.model('Customer')
//     .findById(customerId)
//     .select('name phone gstNumber outstandingBalance');

//   res.status(200).json({
//     status: 'success',
//     openingBalance,
//     closingBalance: running,
//     customer,
//     count: history.length,
//     history
//   });
// });

// exports.getCustomerLedger = catchAsync(async (req, res, next) => {
//   const { customerId } = req.params;
//   const { startDate, endDate } = req.query;
//   const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
//   const custId = new mongoose.Types.ObjectId(customerId);

//   let openingBalance = 0;
//   let dateFilter = {};

//   // 1. Calculate Opening Balance
//   if (startDate) {
//     const start = new Date(startDate);
//     dateFilter = { $gte: start };
//     const prevStats = await AccountEntry.aggregate([
//       { $match: { organizationId: orgId, customerId: custId, date: { $lt: start } } },
//       { $group: { _id: null, totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
//     ]);
//     if (prevStats.length > 0) {
//       openingBalance = prevStats[0].totalDebit - prevStats[0].totalCredit;
//     }
//   }

//   if (endDate) {
//     if (!dateFilter.$gte) dateFilter = {};
//     dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
//   }

//   // 2. Fetch Range with Enhanced Populate
//   const query = { organizationId: orgId, customerId: custId };
//   if (startDate || endDate) query.date = dateFilter;

//   const entries = await AccountEntry.find(query)
//     .sort({ date: 1, createdAt: 1 })
//     .populate({
//       path: 'invoiceId',
//       select: 'invoiceNumber grandTotal balanceAmount paymentStatus'
//     })
//     .populate({
//       path: 'customerId',
//       select: 'name phone email gstNumber outstandingBalance'
//     })
//     .lean();

//   // 3. Build Running Balance
//   let runningBalance = openingBalance;
//   const history = [];

//   if (startDate) {
//     history.push({
//       _id: 'opening', date: new Date(startDate), description: 'Opening Balance',
//       ref: '-', docRef: '-', debit: 0, credit: 0, balance: Number(runningBalance.toFixed(2))
//     });
//   }

//   entries.forEach(entry => {
//     const debit = entry.debit || 0;
//     const credit = entry.credit || 0;
//     runningBalance += (debit - credit);

//     history.push({
//       _id: entry._id, date: entry.date, description: entry.description,
//       ref: entry.referenceNumber,
//       docRef: entry.invoiceId?.invoiceNumber || entry.referenceNumber || '-',
//       paymentStatus: entry.invoiceId?.paymentStatus || 'N/A', // Added detail
//       debit, credit, balance: Number(runningBalance.toFixed(2))
//     });
//   });

//   res.status(200).json({
//     status: 'success',
//     results: history.length,
//     data: { 
//       customer: entries[0]?.customerId || null, // Returns full customer profile
//       openingBalance, 
//       closingBalance: runningBalance, 
//       history 
//     }
//   });
// });




// exports.getAllLedgers = catchAsync(async (req, res, next) => {
//   const { organizationId } = req.user;
//   const { 
//     startDate, endDate, 
//     customerId, supplierId, accountId, 
//     search, page = 1, limit = 20 
//   } = req.query;

//   const pipeline = [];

//   // 1. Initial Filter (Basic security and entity filters)
//   const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };
  
//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
//   }

//   if (customerId) match.customerId = new mongoose.Types.ObjectId(customerId);
//   if (supplierId) match.supplierId = new mongoose.Types.ObjectId(supplierId);
//   if (accountId) match.accountId = new mongoose.Types.ObjectId(accountId);

//   pipeline.push({ $match: match });

//   // 2. Joins (Lookups) for Searchable fields
//   pipeline.push(
//     { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
//     { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
//     { $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supplier' } },
//     { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'invoice' } },
//     { $lookup: { from: 'purchases', localField: 'purchaseId', foreignField: '_id', as: 'purchase' } },
//     // Unwind arrays (preserve empty ones so we don't lose records without a party/invoice)
//     { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
//     { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
//     { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
//     { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
//     { $unwind: { path: '$purchase', preserveNullAndEmptyArrays: true } }
//   );

//   // 3. Global Search Logic
//   if (search) {
//     const searchRegex = new RegExp(search, 'i');
//     pipeline.push({
//       $match: {
//         $or: [
//           { description: searchRegex },
//           { referenceNumber: searchRegex },
//           { 'account.name': searchRegex },
//           { 'customer.name': searchRegex },
//           { 'supplier.companyName': searchRegex },
//           { 'invoice.invoiceNumber': searchRegex },
//           { 'purchase.invoiceNumber': searchRegex }
//         ]
//       }
//     });
//   }

//   // 4. Sorting & Pagination
//   pipeline.push(
//     { $sort: { date: -1, createdAt: -1 } },
//     { $skip: (page - 1) * limit },
//     { $limit: Number(limit) }
//   );

//   const docs = await AccountEntry.aggregate(pipeline);

//   res.status(200).json({
//     status: 'success',
//     results: docs.length,
//     data: { ledgers: docs }
//   });
// });
// exports.getSupplierLedger = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;
//   const { startDate, endDate, limit = 200 } = req.query;

//   const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
//   const suppId = new mongoose.Types.ObjectId(supplierId);

//   let match = {
//     organizationId: orgId,
//     supplierId: suppId
//   };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(new Date(endDate).setHours(23,59,59));
//   }

//   // Opening balance logic (supplier owed)
//   let openingBalance = 0;

//   if (startDate) {
//     const start = new Date(startDate);

//     const prev = await AccountEntry.aggregate([
//       { $match: { organizationId: orgId, supplierId: suppId, date: { $lt: start } }},
//       { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }
//     ]);

//     if (prev.length)
//       openingBalance = prev[0].credit - prev[0].debit;
//   }

//   const pipeline = [
//     { $match: match },

//     { $lookup: {
//       from: 'purchases',
//       localField: 'purchaseId',
//       foreignField: '_id',
//       as: 'purchase'
//     }},
//     { $unwind: { path: '$purchase', preserveNullAndEmptyArrays: true }},

//     { $sort: { date: 1, _id: 1 }},
//     { $limit: Number(limit) }
//   ];

//   const entries = await AccountEntry.aggregate(pipeline);

//   let running = openingBalance;
//   const history = [];

//   if (startDate) {
//     history.push({
//       _id: 'opening',
//       date: new Date(startDate),
//       description: 'Opening Balance',
//       debit: 0, credit: 0,
//       balance: Number(running.toFixed(2))
//     });
//   }

//   for (const e of entries) {
//     running += (e.credit || 0) - (e.debit || 0);

//     history.push({
//       _id: e._id,
//       date: e.date,
//       description: e.description,
//       referenceNumber: e.referenceNumber,
//       invoiceNumber: e.purchase?.invoiceNumber || null,
//       paymentStatus: e.purchase?.paymentStatus || null,

//       debit: e.debit,
//       credit: e.credit,
//       balance: Number(running.toFixed(2))
//     });
//   }

//   const supplier = await mongoose.model('Supplier')
//     .findById(supplierId)
//     .select('companyName phone gstNumber outstandingBalance');

//   res.status(200).json({
//     status: 'success',
//     openingBalance,
//     closingBalance: running,
//     supplier,
//     count: history.length,
//     history
//   });
// });

// exports.getSupplierLedger = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;
//   const { startDate, endDate } = req.query;
//   const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
//   const suppId = new mongoose.Types.ObjectId(supplierId);

//   let openingBalance = 0;
//   let dateFilter = {};

//   if (startDate) {
//     const start = new Date(startDate);
//     dateFilter = { $gte: start };
//     const prevStats = await AccountEntry.aggregate([
//       { $match: { organizationId: orgId, supplierId: suppId, date: { $lt: start } } },
//       { $group: { _id: null, totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
//     ]);
//     if (prevStats.length > 0) {
//       openingBalance = prevStats[0].totalCredit - prevStats[0].totalDebit;
//     }
//   }

//   if (endDate) {
//     if (!dateFilter.$gte) dateFilter = {};
//     dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
//   }

//   const query = { organizationId: orgId, supplierId: suppId };
//   if (startDate || endDate) query.date = dateFilter;

//   const entries = await AccountEntry.find(query)
//     .sort({ date: 1, createdAt: 1 })
//     .populate({
//       path: 'purchaseId',
//       select: 'invoiceNumber grandTotal paymentStatus'
//     })
//     .populate({
//       path: 'supplierId',
//       select: 'companyName contactPerson phone gstNumber outstandingBalance'
//     })
//     .lean();

//   let runningBalance = openingBalance;
//   const history = [];

//   if (startDate) {
//     history.push({
//       _id: 'opening', date: new Date(startDate), description: 'Opening Balance',
//       ref: '-', docRef: '-', debit: 0, credit: 0, balance: Number(runningBalance.toFixed(2))
//     });
//   }

//   entries.forEach(entry => {
//     const debit = entry.debit || 0;
//     const credit = entry.credit || 0;
//     runningBalance += (credit - debit);

//     history.push({
//       _id: entry._id, date: entry.date, description: entry.description,
//       ref: entry.referenceNumber,
//       docRef: entry.purchaseId?.invoiceNumber || entry.referenceNumber || '-',
//       paymentStatus: entry.purchaseId?.paymentStatus || 'N/A',
//       debit, credit, balance: Number(runningBalance.toFixed(2))
//     });
//   });

//   res.status(200).json({
//     status: 'success',
//     results: history.length,
//     data: { 
//       supplier: entries[0]?.supplierId || null, 
//       openingBalance, 
//       closingBalance: runningBalance, 
//       history 
//     }
//   });
// });
/* -------------------------------------------------------------
   ORG SUMMARY & EXPORTS
------------------------------------------------------------- */
// exports.getOrganizationLedgerSummary = catchAsync(async (req, res, next) => {
//   const { organizationId } = req.user;
//   const { startDate, endDate } = req.query;
//   const match = { organizationId: new mongoose.Types.ObjectId(organizationId) };

//   if (startDate || endDate) {
//     match.date = {};
//     if (startDate) match.date.$gte = new Date(startDate);
//     if (endDate) match.date.$lte = new Date(endDate);
//   }

//   const summary = await AccountEntry.aggregate([
//     { $match: match },
//     { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
//     { $unwind: '$account' },
//     { $group: { _id: '$account.type', totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
//   ]);

//   const incomeStats = summary.find(s => s._id === 'income') || { totalCredit: 0, totalDebit: 0 };
//   const expenseStats = summary.find(s => s._id === 'expense') || { totalCredit: 0, totalDebit: 0 };

//   const income = (incomeStats.totalCredit - incomeStats.totalDebit);
//   const expense = (expenseStats.totalDebit - expenseStats.totalCredit);

//   res.status(200).json({ status: 'success', data: { income, expense, netProfit: income - expense } });
// });






// exports.exportLedgers = catchAsync(async (req, res, next) => {
//   const { start, end, customerId, supplierId, format = 'csv' } = req.query;
//   const filter = { organizationId: req.user.organizationId };

//   if (start || end) {
//     filter.date = {};
//     if (start) filter.date.$gte = new Date(start);
//     if (end) filter.date.$lte = new Date(end);
//   }
//   if (customerId) filter.customerId = customerId;
//   if (supplierId) filter.supplierId = supplierId;

//   const docs = await AccountEntry.find(filter)
//     .sort({ date: 1 })
//     .populate('accountId', 'name code')
//     .populate('customerId', 'name phone gstNumber')
//     .populate('supplierId', 'companyName name gstNumber')
//     .lean();

//   if (format === 'csv') {
//     // Added GST Number to headers
//     const headers = ['Date', 'Account', 'Description', 'Ref', 'Party', 'GSTIN', 'Debit', 'Credit', 'Balance'];
//     let runningBalance = 0;
    
//     const rows = docs.map(d => {
//       const party = d.customerId?.name || d.supplierId?.companyName || d.supplierId?.name || '-';
//       const gstin = d.customerId?.gstNumber || d.supplierId?.gstNumber || '-';
//       const account = d.accountId?.name || 'Unknown';
//       const date = d.date ? new Date(d.date).toLocaleDateString() : '-';
//       const notes = (d.description || '').replace(/,/g, ' ');
//       const debit = d.debit || 0;
//       const credit = d.credit || 0;
      
//       if (supplierId) runningBalance += (credit - debit);
//       else runningBalance += (debit - credit);

//       return `${date},${account},${notes},${d.referenceNumber || '-'},${party},${gstin},${debit},${credit},${runningBalance.toFixed(2)}`;
//     });

//     const csvContent = [headers.join(',')].concat(rows).join('\n');
//     res.setHeader('Content-Disposition', 'attachment; filename=ledger_report.csv');
//     res.setHeader('Content-Type', 'text/csv');
//     return res.send(csvContent);
//   }
  
//   res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
// });
// Standard CRUD


// exports.getSupplierLedger = catchAsync(async (req, res, next) => {
//   const { supplierId } = req.params;
//   const { startDate, endDate } = req.query;
//   const orgId = new mongoose.Types.ObjectId(req.user.organizationId);
//   const suppId = new mongoose.Types.ObjectId(supplierId);

//   let openingBalance = 0;
//   let dateFilter = {};

//   if (startDate) {
//     const start = new Date(startDate);
//     dateFilter = { $gte: start };

//     const prevStats = await AccountEntry.aggregate([
//       {
//         $match: {
//           organizationId: orgId,
//           supplierId: suppId,
//           date: { $lt: start }
//         }
//       },
//       {
//         $group: {
//           _id: null,
//           totalDebit: { $sum: '$debit' },
//           totalCredit: { $sum: '$credit' }
//         }
//       }
//     ]);

//     if (prevStats.length > 0) {
//       // Supplier (Liability): Credit - Debit
//       openingBalance = prevStats[0].totalCredit - prevStats[0].totalDebit;
//     }
//   }

//   if (endDate) {
//     if (!dateFilter.$gte) dateFilter = {};
//     dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59));
//   }

//   const query = { organizationId: orgId, supplierId: suppId };
//   if (startDate || endDate) query.date = dateFilter;

//   const entries = await AccountEntry.find(query)
//     .sort({ date: 1, createdAt: 1 })
//     .populate('purchaseId', 'invoiceNumber')
//     .lean();

//   let runningBalance = openingBalance;
//   const history = [];

//   if (startDate) {
//     history.push({
//       _id: 'opening', date: new Date(startDate), description: 'Opening Balance',
//       ref: '-', docRef: '-', debit: 0, credit: 0, balance: Number(runningBalance.toFixed(2))
//     });
//   }

//   entries.forEach(entry => {
//     const debit = entry.debit || 0;
//     const credit = entry.credit || 0;
//     runningBalance += (credit - debit);

//     history.push({
//       _id: entry._id, date: entry.date, description: entry.description,
//       ref: entry.referenceNumber,
//       docRef: entry.purchaseId?.invoiceNumber || entry.referenceNumber || '-',
//       debit, credit, balance: Number(runningBalance.toFixed(2))
//     });
//   });

//   res.status(200).json({
//     status: 'success',
//     results: history.length,
//     data: { supplierId, openingBalance, closingBalance: runningBalance, history }
//   });
// });

// exports.exportLedgers = catchAsync(async (req, res, next) => {
//   const { start, end, customerId, supplierId, format = 'csv' } = req.query;
//   const filter = { organizationId: req.user.organizationId };

//   if (start || end) {
//     filter.date = {};
//     if (start) filter.date.$gte = new Date(start);
//     if (end) filter.date.$lte = new Date(end);
//   }
//   if (customerId) filter.customerId = customerId;
//   if (supplierId) filter.supplierId = supplierId;

//   const docs = await AccountEntry.find(filter)
//     .sort({ date: 1 })
//     .populate('accountId', 'name')
//     .populate('customerId', 'name')
//     .populate('supplierId', 'companyName name')
//     .lean();

//   if (format === 'csv') {
//     const headers = ['Date', 'Account', 'Description', 'Ref', 'Party', 'Debit', 'Credit', 'Balance'];
//     let runningBalance = 0;
//     const rows = docs.map(d => {
//       const party = d.customerId?.name || d.supplierId?.companyName || d.supplierId?.name || '-';
//       const account = d.accountId?.name || 'Unknown';
//       const date = d.date ? new Date(d.date).toLocaleDateString() : '-';
//       const notes = (d.description || '').replace(/,/g, ' ');
//       const debit = d.debit || 0;
//       const credit = d.credit || 0;
//       if (supplierId) runningBalance += (credit - debit);
//       else runningBalance += (debit - credit);

//       return `${date},${account},${notes},${d.referenceNumber || '-'},${party},${debit},${credit},${runningBalance.toFixed(2)}`;
//     });

//     const csvContent = [headers.join(',')].concat(rows).join('\n');
//     res.setHeader('Content-Disposition', 'attachment; filename=ledger.csv');
//     res.setHeader('Content-Type', 'text/csv');
//     return res.send(csvContent);
//   }
//   res.status(200).json({ status: 'success', results: docs.length, data: { ledgers: docs } });
// });

// exports.getAllLedgers = catchAsync(async (req, res, next) => {
//   const filter = { organizationId: req.user.organizationId };

//   if (req.query.startDate || req.query.endDate) {
//     filter.date = {};
//     if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
//     if (req.query.endDate) {
//       const end = new Date(req.query.endDate);
//       end.setHours(23, 59, 59, 999);
//       filter.date.$lte = end;
//     }
//   }

//   if (req.query.customerId) filter.customerId = req.query.customerId;
//   if (req.query.supplierId) filter.supplierId = req.query.supplierId;
//   if (req.query.accountId) filter.accountId = req.query.accountId;

//   const features = new ApiFeatures(AccountEntry.find(filter), req.query)
//     .sort({ date: -1 })
//     .limitFields()
//     .paginate();

//   features.query = features.query.populate([
//     { path: 'accountId', select: 'name code type' },
//     { path: 'customerId', select: 'name phone' },
//     { path: 'supplierId', select: 'companyName name' },
//     { path: 'invoiceId', select: 'invoiceNumber' },
//     { path: 'purchaseId', select: 'invoiceNumber' }
//   ]);

//   const docs = await features.query;

//   res.status(200).json({
//     status: 'success',
//     results: docs.length,
//     data: { data: docs }
//   });
// });
// exports.getAllLedgers = catchAsync(async (req, res, next) => {
//   const filter = { organizationId: req.user.organizationId };

//   // Date Filtering logic
//   if (req.query.startDate || req.query.endDate) {
//     filter.date = {};
//     if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
//     if (req.query.endDate) {
//       const end = new Date(req.query.endDate);
//       end.setHours(23, 59, 59, 999);
//       filter.date.$lte = end;
//     }
//   }

//   // ID Filtering logic
//   if (req.query.customerId) filter.customerId = req.query.customerId;
//   if (req.query.supplierId) filter.supplierId = req.query.supplierId;
//   if (req.query.accountId) filter.accountId = req.query.accountId;

//   const features = new ApiFeatures(AccountEntry.find(filter), req.query)
//     .sort({ date: -1 })
//     .limitFields()
//     .paginate();

//   // --- ENHANCED POPULATION ---
//   features.query = features.query.populate([
//     { 
//       path: 'accountId', 
//       select: 'name code type isGroup cachedBalance' 
//     },
//     { 
//       path: 'customerId', 
//       select: 'name phone email gstNumber outstandingBalance billingAddress' 
//     },
//     { 
//       path: 'supplierId', 
//       select: 'companyName contactPerson phone gstNumber outstandingBalance address' 
//     },
//     { 
//       path: 'invoiceId', 
//       select: 'invoiceNumber grandTotal balanceAmount paymentStatus status' 
//     },
//     { 
//       path: 'purchaseId', 
//       select: 'invoiceNumber grandTotal balanceAmount paymentStatus status' 
//     }
//   ]);

//   const docs = await features.query;

//   res.status(200).json({
//     status: 'success',
//     results: docs.length,
//     data: { data: docs }
//   });
// });