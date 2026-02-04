const AccountEntry = require('./accountEntry.model');
const Account = require('./account.model');
const Product = require('../../inventory/core/product.model');
const AppError = require('../../../core/utils/appError');

async function getAccount(orgId, code, fallbackName, type, session) {
  let acc = await Account.findOne({ organizationId: orgId, code }).session(session);
  if (!acc) {
    const created = await Account.create([{
      organizationId: orgId,
      code,
      name: fallbackName,
      type,
      isGroup: false
    }], { session });
    acc = created[0];
  }
  return acc;
}

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
  const ar = await getAccount(orgId, '1200', 'Accounts Receivable', 'asset', session);
  const sales = await getAccount(orgId, '4000', 'Sales', 'income', session);
  const tax = invoice.totalTax > 0
    ? await getAccount(orgId, '2100', 'Tax Payable', 'liability', session)
    : null;
  const inventory = await getAccount(orgId, '1500', 'Inventory Asset', 'asset', session);
  const cogs = await getAccount(orgId, '5000', 'Cost of Goods Sold', 'expense', session);

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
  const ar = await getAccount(orgId, '1200', 'Accounts Receivable', 'asset', session);
  const sales = await getAccount(orgId, '4000', 'Sales', 'income', session);
  const tax = salesReturn.taxTotal > 0
    ? await getAccount(orgId, '2100', 'Tax Payable', 'liability', session)
    : null;
  const inventory = await getAccount(orgId, '1500', 'Inventory Asset', 'asset', session);
  const cogs = await getAccount(orgId, '5000', 'Cost of Goods Sold', 'expense', session);

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
