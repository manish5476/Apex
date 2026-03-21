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

exports.sendInvoiceEmail = catchAsync(async (req, res, next) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).populate('customerId');
  if (!invoice) return next(new AppError('Invoice not found', 404));
  const customerEmail = invoice.customerId?.email;
  if (!customerEmail) return next(new AppError('Customer email not found', 400));
  await InvoiceAudit.create({
    invoiceId: invoice._id,
    action: 'EMAIL_SENT',
    performedBy: req.user._id,
    details: `Invoice emailed to ${customerEmail}`,
    ipAddress: req.ip
  });
  res.status(200).json({ status: 'success', message: 'Invoice email sent successfully' });
});

exports.getInvoiceHistory = catchAsync(async (req, res, next) => {
  const invoiceId = req.params.id;
  const history = await InvoiceAudit.find({ invoiceId }).sort({ createdAt: -1 }).populate('performedBy', 'name email');
  res.status(200).json({ status: "success", results: history.length, data: { history } });
});
