const mongoose = require("mongoose");
const SalesReturn = require("./salesReturn.model");
const Invoice = require("../../accounting/billing/invoice.model");
const Product = require("./product.model");
const Customer = require("../../organization/core/customer.model");
const AccountEntry = require("../../accounting/core/accountEntry.model");
const Account = require("../../accounting/core/account.model");

const catchAsync = require("../../../core/utils/api/catchAsync");
const AppError = require("../../../core/utils/api/appError");
const { runInTransaction } = require("../../../core/utils/db/runInTransaction");

/* ======================================================
   ACCOUNT HELPER (IDEMPOTENT)
====================================================== */
async function getOrInitAccount(orgId, type, name, code, session) {
  let account = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!account) {
    const created = await Account.create([{
      organizationId: orgId,
      name,
      code,
      type,
      isGroup: false
    }], { session });
    return created[0];
  }
  return account;
}

/* ======================================================
   CREATE SALES RETURN (CREDIT NOTE)
====================================================== */
exports.createReturn = catchAsync(async (req, res, next) => {
  const { invoiceId, items, reason, restock = true } = req.body;

  if (!invoiceId || !Array.isArray(items) || !items.length) {
    return next(new AppError("Invoice and return items are required", 400));
  }

  await runInTransaction(async (session) => {
    /* ---------- LOAD INVOICE ---------- */
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      organizationId: req.user.organizationId
    }).session(session);

    if (!invoice) throw new AppError("Invoice not found", 404);
    if (invoice.status === "cancelled") {
      throw new AppError("Cannot return cancelled invoice", 400);
    }

    /* ---------- VALIDATE RETURN QUANTITIES ---------- */
    const alreadyReturned = await SalesReturn.find({
      invoiceId,
      organizationId: req.user.organizationId
    }).session(session);

    const returnedQtyMap = {};
    for (const r of alreadyReturned) {
      for (const i of r.items) {
        returnedQtyMap[i.productId] =
          (returnedQtyMap[i.productId] || 0) + i.quantity;
      }
    }

    let totalRefund = 0;
    let totalTaxReversal = 0;
    let totalSubTotal = 0;
    const returnItems = [];

    for (const reqItem of items) {
      const invItem = invoice.items.find(
        i => String(i.productId) === String(reqItem.productId)
      );

      if (!invItem) {
        throw new AppError("Product not part of invoice", 400);
      }

      const alreadyQty = returnedQtyMap[reqItem.productId] || 0;
      const maxReturnable = invItem.quantity - alreadyQty;

      if (reqItem.quantity > maxReturnable) {
        throw new AppError(
          `Return exceeds remaining quantity for ${invItem.name}`,
          400
        );
      }

      /* ---------- PRO-RATA CALCULATION ---------- */
      const ratio = reqItem.quantity / invItem.quantity;
      const base = invItem.price * reqItem.quantity;
      const discount = (invItem.discount || 0) * ratio;
      const tax = ((invItem.taxRate || 0) / 100) * (base - discount);
      const refund = base - discount + tax;

      totalSubTotal += base;
      totalTaxReversal += tax;
      totalRefund += refund;

      returnItems.push({
        productId: reqItem.productId,
        name: invItem.name,
        quantity: reqItem.quantity,
        unitPrice: invItem.price,
        discountAmount: discount,
        taxAmount: tax,
        refundAmount: refund
      });

      /* ---------- RESTOCK ---------- */
      if (restock) {
        await Product.findOneAndUpdate(
          { _id: reqItem.productId, "inventory.branchId": invoice.branchId },
          { $inc: { "inventory.$.quantity": reqItem.quantity } },
          { session }
        );
      }
    }

    /* ---------- GENERATE RETURN NUMBER ---------- */
    const last = await SalesReturn.findOne({
      organizationId: req.user.organizationId
    }).sort({ createdAt: -1 });

    const seq = last ? parseInt(last.returnNumber.replace(/\D/g, "")) || 0 : 0;
    const returnNumber = `RET-${String(seq + 1).padStart(4, "0")}`;

    /* ---------- CREATE RETURN ---------- */
    const [salesReturn] = await SalesReturn.create([{
      organizationId: req.user.organizationId,
      branchId: invoice.branchId,
      invoiceId,
      customerId: invoice.customerId,
      returnNumber,
      items: returnItems,
      subTotal: totalSubTotal,
      taxTotal: totalTaxReversal,
      totalRefundAmount: totalRefund,
      reason,
      createdBy: req.user._id
    }], { session });

    /* ---------- CUSTOMER BALANCE ---------- */
    await Customer.findByIdAndUpdate(
      invoice.customerId,
      { $inc: { outstandingBalance: -totalRefund } },
      { session }
    );

    /* ---------- LEDGER (CREDIT NOTE) ---------- */
    const arAcc = await getOrInitAccount(
      req.user.organizationId, "asset", "Accounts Receivable", "1200", session
    );
    const salesAcc = await getOrInitAccount(
      req.user.organizationId, "income", "Sales", "4000", session
    );

    const netRevenue = totalRefund - totalTaxReversal;

    // Dr Sales
    await AccountEntry.create([{
      organizationId: req.user.organizationId,
      branchId: invoice.branchId,
      accountId: salesAcc._id,
      date: new Date(),
      debit: netRevenue,
      credit: 0,
      description: `Sales Return ${returnNumber}`,
      referenceType: "credit_note",
      referenceId: salesReturn._id,
      createdBy: req.user._id
    }], { session });

    // Dr Tax Payable
    if (totalTaxReversal > 0) {
      const taxAcc = await getOrInitAccount(
        req.user.organizationId, "liability", "Tax Payable", "2100", session
      );

      await AccountEntry.create([{
        organizationId: req.user.organizationId,
        branchId: invoice.branchId,
        accountId: taxAcc._id,
        date: new Date(),
        debit: totalTaxReversal,
        credit: 0,
        description: `Tax Reversal ${returnNumber}`,
        referenceType: "credit_note",
        referenceId: salesReturn._id,
        createdBy: req.user._id
      }], { session });
    }

    // Cr Accounts Receivable
    await AccountEntry.create([{
      organizationId: req.user.organizationId,
      branchId: invoice.branchId,
      accountId: arAcc._id,
      customerId: invoice.customerId,
      date: new Date(),
      debit: 0,
      credit: totalRefund,
      description: `Credit Note ${returnNumber}`,
      referenceType: "credit_note",
      referenceId: salesReturn._id,
      createdBy: req.user._id
    }], { session });
  }, 3, { action: "CREATE_SALES_RETURN", userId: req.user._id });

  res.status(201).json({
    status: "success",
    message: "Sales return processed successfully"
  });
});

/* ======================================================
   GET RETURNS
====================================================== */
exports.getReturns = catchAsync(async (req, res) => {
  const returns = await SalesReturn.find({
    organizationId: req.user.organizationId
  })
    .populate("customerId", "name phone")
    .populate("items.productId", "name sku")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: returns.length,
    data: { returns }
  });
});
