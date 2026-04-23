const AccountEntry = require('../model/accountEntry.model');
const Account = require('../model/account.model');
const Product = require('../../../inventory/core/model/product.model');
const AppError = require('../../../../core/utils/api/appError');

/**
 * Atomic find-or-create for a ledger account.
 * Uses findOneAndUpdate with $setOnInsert to prevent race conditions.
 */
async function getOrInitAccount(orgId, type, name, code, session = null) {
  const opts = { upsert: true, new: true };
  if (session) opts.session = session;

  const account = await Account.findOneAndUpdate(
    { organizationId: orgId, code },
    {
      $setOnInsert: {
        organizationId: orgId,
        name,
        code,
        type,
        isGroup: false,
        isActive: true,
        cachedBalance: 0,
      },
    },
    opts
  );

  return account;
}

/**
 * Resolve the asset account (Cash / Bank / UPI / Card) from paymentMethod string.
 */
async function getPaymentAssetAccount(orgId, paymentMethod, session = null) {
  const map = {
    cash:   { name: 'Cash',             code: '1001', type: 'asset' },
    bank:   { name: 'Bank',             code: '1002', type: 'asset' },
    cheque: { name: 'Bank',             code: '1002', type: 'asset' },
    upi:    { name: 'UPI Receivables',  code: '1003', type: 'asset' },
    card:   { name: 'Card Receivables', code: '1004', type: 'asset' },
  };
  const def = map[paymentMethod] || { name: 'Other Payment Account', code: '1009', type: 'asset' };
  return getOrInitAccount(orgId, def.type, def.name, def.code, session);
}

exports.getOrInitAccount = getOrInitAccount;
exports.getPaymentAssetAccount = getPaymentAssetAccount;

/* ======================================================
   SALES INVOICE JOURNAL (REVENUE + TAX + COGS)
====================================================== */
exports.postInvoiceJournal = async ({
  invoice,
  orgId,
  branchId,
  userId,
  session
}) => {
  const ar = await getOrInitAccount(orgId, 'asset', 'Accounts Receivable', '1200', session);
  const sales = await getOrInitAccount(orgId, 'income', 'Sales', '4000', session);
  const tax = invoice.totalTax > 0
    ? await getOrInitAccount(orgId, 'liability', 'Tax Payable', '2100', session)
    : null;
  const inventory = await getOrInitAccount(orgId, 'asset', 'Inventory Asset', '1500', session);
  const cogs = await getOrInitAccount(orgId, 'expense', 'Cost of Goods Sold', '5000', session);

  // --- AR
  await AccountEntry.create([{
    organizationId: orgId,
    branchId,
    accountId: ar._id,
    customerId: invoice.customerId,
    debit: invoice.grandTotal,
    credit: 0,
    referenceType: 'invoice',
    referenceId: invoice._id,
    description: `Invoice #${invoice.invoiceNumber}`,
    createdBy: userId
  }], { session });

  // --- SALES
  const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);
  await AccountEntry.create([{
    organizationId: orgId,
    branchId,
    accountId: sales._id,
    debit: 0,
    credit: netRevenue,
    referenceType: 'invoice',
    referenceId: invoice._id,
    description: `Sales #${invoice.invoiceNumber}`,
    createdBy: userId
  }], { session });

  // --- TAX
  if (tax) {
    await AccountEntry.create([{
      organizationId: orgId,
      branchId,
      accountId: tax._id,
      debit: 0,
      credit: invoice.totalTax,
      referenceType: 'invoice',
      referenceId: invoice._id,
      description: `GST #${invoice.invoiceNumber}`,
      createdBy: userId
    }], { session });
  }

  // --- COGS
  let totalCost = 0;
  for (const item of invoice.items) {
    const product = await Product.findById(item.productId).session(session);
    totalCost += item.quantity * (product.purchasePrice || 0);
  }

  if (totalCost > 0) {
    await AccountEntry.create([
      {
        organizationId: orgId,
        branchId,
        accountId: cogs._id,
        debit: totalCost,
        credit: 0,
        referenceType: 'invoice',
        referenceId: invoice._id,
        description: `COGS #${invoice.invoiceNumber}`,
        createdBy: userId
      },
      {
        organizationId: orgId,
        branchId,
        accountId: inventory._id,
        debit: 0,
        credit: totalCost,
        referenceType: 'invoice',
        referenceId: invoice._id,
        description: `Inventory Out #${invoice.invoiceNumber}`,
        createdBy: userId
      }
    ], { session });
  }
};

/* ======================================================
   SALES RETURN JOURNAL (FULL REVERSAL)
====================================================== */
exports.postSalesReturnJournal = async ({
  salesReturn,
  invoice,
  orgId,
  branchId,
  userId,
  session
}) => {
  const ar = await getOrInitAccount(orgId, 'asset', 'Accounts Receivable', '1200', session);
  const sales = await getOrInitAccount(orgId, 'income', 'Sales', '4000', session);
  const tax = salesReturn.taxTotal > 0
    ? await getOrInitAccount(orgId, 'liability', 'Tax Payable', '2100', session)
    : null;
  const inventory = await getOrInitAccount(orgId, 'asset', 'Inventory Asset', '1500', session);
  const cogs = await getOrInitAccount(orgId, 'expense', 'Cost of Goods Sold', '5000', session);

  const netRevenue = salesReturn.totalRefundAmount - salesReturn.taxTotal;

  // Reverse Sales
  await AccountEntry.create([{
    organizationId: orgId,
    branchId,
    accountId: sales._id,
    debit: netRevenue,
    credit: 0,
    referenceType: 'credit_note',
    referenceId: salesReturn._id,
    description: `Sales Return #${salesReturn.returnNumber}`,
    createdBy: userId
  }], { session });

  // Reverse Tax
  if (tax) {
    await AccountEntry.create([{
      organizationId: orgId,
      branchId,
      accountId: tax._id,
      debit: salesReturn.taxTotal,
      credit: 0,
      referenceType: 'credit_note',
      referenceId: salesReturn._id,
      description: `GST Return #${salesReturn.returnNumber}`,
      createdBy: userId
    }], { session });
  }

  // Reverse AR
  await AccountEntry.create([{
    organizationId: orgId,
    branchId,
    accountId: ar._id,
    customerId: invoice.customerId,
    debit: 0,
    credit: salesReturn.totalRefundAmount,
    referenceType: 'credit_note',
    referenceId: salesReturn._id,
    description: `Credit Note #${salesReturn.returnNumber}`,
    createdBy: userId
  }], { session });

  // Restore Inventory & Reverse COGS
  let costReversal = 0;
  for (const item of salesReturn.items) {
    const product = await Product.findById(item.productId).session(session);
    costReversal += item.quantity * (product.purchasePrice || 0);
  }

  if (costReversal > 0) {
    await AccountEntry.create([
      {
        organizationId: orgId,
        branchId,
        accountId: inventory._id,
        debit: costReversal,
        credit: 0,
        referenceType: 'credit_note',
        referenceId: salesReturn._id,
        description: `Inventory Return #${salesReturn.returnNumber}`,
        createdBy: userId
      },
      {
        organizationId: orgId,
        branchId,
        accountId: cogs._id,
        debit: 0,
        credit: costReversal,
        referenceType: 'credit_note',
        referenceId: salesReturn._id,
        description: `COGS Reversal #${salesReturn.returnNumber}`,
        createdBy: userId
      }
    ], { session });
  }
};
