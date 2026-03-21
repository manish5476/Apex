const mongoose = require("mongoose");
const { z } = require("zod");
const { format } = require('fast-csv');
const Invoice = require("../invoice.model");
const { invalidateOpeningBalance } = require("../../core/ledgerCache.service");
const ProfitCalculator = require('../utils/profitCalculator');

const Payment = require("../../payments/payment.model");
const Product = require("../../../inventory/core/product.model");
const Customer = require("../../../organization/core/customer.model");
const AccountEntry = require('../../core/accountEntry.model');
const Account = require('../../core/account.model');
const Organization = require("../../../organization/core/organization.model");
const InvoiceAudit = require('../invoiceAudit.model');

const SalesService = require("../../../inventory/core/sales.service");
const invoicePDFService = require("../invoicePDFService");
const StockValidationService = require("../../../inventory/core/stockValidationService");
const { createNotification } = require("../../../notification/core/notification.service");
// CHANGED: Import the whole service to access reverseInvoiceJournal
const salesJournalService = require('../../../inventory/core/salesJournal.service');

const catchAsync = require("../../../../core/utils/api/catchAsync");
const AppError = require("../../../../core/utils/api/appError");
const factory = require("../../../../core/utils/api/handlerFactory");
const { runInTransaction } = require("../../../../core/utils/db/runInTransaction");
const { emitToOrg } = require("../../../../socketHandlers/socket");
const automationService = require('../../../webhook/automationService');



exports.getSalesReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true }
  };

  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }

  let groupStage;
  if (groupBy === 'day') {
    groupStage = {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } },
        date: { $first: "$invoiceDate" },
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" },
        totalTax: { $sum: "$totalTax" }
      }
    };
  } else if (groupBy === 'month') {
    groupStage = {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
        month: { $first: { $month: "$invoiceDate" } },
        year: { $first: { $year: "$invoiceDate" } },
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" },
        totalTax: { $sum: "$totalTax" }
      }
    };
  } else {
    groupStage = {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" },
        totalTax: { $sum: "$totalTax" }
      }
    };
  }

  const report = await Invoice.aggregate([
    { $match: match },
    groupStage,
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({ status: 'success', results: report.length, data: { report } });
});


exports.getTaxReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    isDeleted: { $ne: true },
    totalTax: { $gt: 0 }
  };
  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = new Date(startDate);
    if (endDate) match.invoiceDate.$lte = new Date(endDate);
  }
  const taxReport = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: { year: { $year: "$invoiceDate" }, month: { $month: "$invoiceDate" } },
        totalTax: { $sum: "$totalTax" },
        count: { $sum: 1 },
        totalSales: { $sum: "$grandTotal" }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);
  res.status(200).json({ status: 'success', results: taxReport.length, data: { taxReport } });
});


exports.getOutstandingInvoices = catchAsync(async (req, res, next) => {
  const { overdueOnly = false } = req.query;
  const match = {
    organizationId: req.user.organizationId,
    status: { $in: ['issued', 'paid'] },
    balanceAmount: { $gt: 0 },
    isDeleted: { $ne: true }
  };
  if (overdueOnly) {
    match.dueDate = { $lt: new Date() };
  }
  const invoices = await Invoice.find(match)
    .populate('customerId', 'name phone email')
    .sort({ dueDate: 1 });

  const invoicesWithOverdue = invoices.map(invoice => {
    const invoiceObj = invoice.toObject();
    if (invoice.dueDate < new Date()) {
      const overdueDays = Math.ceil((new Date() - invoice.dueDate) / (1000 * 60 * 60 * 24));
      invoiceObj.overdueDays = overdueDays;
      invoiceObj.isOverdue = true;
    } else {
      invoiceObj.overdueDays = 0;
      invoiceObj.isOverdue = false;
    }
    return invoiceObj;
  });

  const summary = invoices.reduce((acc, invoice) => {
    acc.totalOutstanding += invoice.balanceAmount;
    acc.totalInvoices += 1;
    if (invoice.dueDate < new Date()) {
      acc.overdueAmount += invoice.balanceAmount;
      acc.overdueCount += 1;
    }
    return acc;
  }, { totalOutstanding: 0, totalInvoices: 0, overdueAmount: 0, overdueCount: 0 });

  res.status(200).json({ status: 'success', results: invoices.length, data: { invoices: invoicesWithOverdue, summary } });
});


exports.getCustomerInvoiceSummary = catchAsync(async (req, res, next) => {
  const summary = await Invoice.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        customerId: mongoose.Types.ObjectId(req.params.customerId),
        status: { $ne: 'cancelled' },
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalAmount: { $sum: '$grandTotal' },
        totalPaid: { $sum: '$paidAmount' },
        totalDue: { $sum: '$balanceAmount' }
      }
    }
  ]);
  res.status(200).json({
    status: 'success',
    data: summary[0] || { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 }
  });
});