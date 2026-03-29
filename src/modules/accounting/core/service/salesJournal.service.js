'use strict';

/**
 * SalesJournalService
 * ─────────────────────────────────────────────
 * Posts and reverses revenue recognition journal entries for invoices.
 *
 * Key fixes vs original:
 *   FIX #1 — postInvoiceJournal used a local getAccount() (find-then-create, race condition).
 *     All account resolution now goes through JournalService.getOrInitAccount (uses
 *     findOneAndUpdate with $setOnInsert — atomic, race-condition safe).
 *
 *   FIX #2 — CRITICAL: COGS calculation fetched Product.purchasePrice (current cost).
 *     This means historical invoices retroactively show wrong margins whenever
 *     the cost price changes. Fixed: use item.purchasePriceAtSale (snapshotted at
 *     time of sale). Requires .select('+purchasePriceAtSale') on the invoice query.
 *     Falls back to current product price only when snapshot is genuinely null.
 *
 *   FIX #3 — All AccountEntry.create calls are now batched into fewer calls
 *     with ordered:true (required inside a session).
 *
 *   FIX #4 — reverseInvoiceJournal now deletes entries by referenceId + referenceType
 *     instead of a manual credit-debit swap, which was creating duplicate entries
 *     and making the trial balance show doubled values.
 */

const AccountEntry   = require('./model/accountEntry.model');
const Product        = require('../../../inventory/core/model/product.model');
const JournalService = require('../../../../services/accounting/journalService');

/* ============================================================
   1. POST INVOICE JOURNAL  (Revenue Recognition)
   Dr AR  /  Cr Sales  /  Cr Tax Payable  +  Dr COGS / Cr Inventory
   ============================================================ */
exports.postInvoiceJournal = async ({ invoice, orgId, branchId, userId, session }) => {
  const [arAcc, salesAcc, inventoryAcc, cogsAcc] = await Promise.all([
    JournalService.getOrInitAccount(orgId, 'asset',   'Accounts Receivable',  '1200', session),
    JournalService.getOrInitAccount(orgId, 'income',  'Sales Revenue',        '4000', session),
    JournalService.getOrInitAccount(orgId, 'asset',   'Inventory Asset',      '1500', session),
    JournalService.getOrInitAccount(orgId, 'expense', 'Cost of Goods Sold',   '5000', session),
  ]);

  const taxAcc = invoice.totalTax > 0
    ? await JournalService.getOrInitAccount(orgId, 'liability', 'Tax Payable', '2100', session)
    : null;

  const entries = [];

  // Dr AR (full invoice amount)
  entries.push({
    organizationId: orgId, branchId, accountId: arAcc._id,
    customerId:    invoice.customerId,
    debit:         invoice.grandTotal, credit: 0,
    referenceType: 'invoice', referenceId: invoice._id,
    description:   `Invoice #${invoice.invoiceNumber}`,
    createdBy:     userId,
  });

  // Cr Sales (net of tax)
  const netRevenue = invoice.grandTotal - (invoice.totalTax || 0);
  entries.push({
    organizationId: orgId, branchId, accountId: salesAcc._id,
    debit: 0, credit: netRevenue,
    referenceType: 'invoice', referenceId: invoice._id,
    description:   `Sales #${invoice.invoiceNumber}`,
    createdBy:     userId,
  });

  // Cr Tax Payable
  if (taxAcc && invoice.totalTax > 0) {
    entries.push({
      organizationId: orgId, branchId, accountId: taxAcc._id,
      debit: 0, credit: invoice.totalTax,
      referenceType: 'invoice', referenceId: invoice._id,
      description:   `GST #${invoice.invoiceNumber}`,
      createdBy:     userId,
    });
  }

  // COGS — FIX #2: use purchasePriceAtSale (snapshot), not current product price
  let totalCost = 0;
  for (const item of invoice.items) {
    let costPerUnit = null;

    if (item.purchasePriceAtSale != null) {
      // Snapshot is available (happy path)
      costPerUnit = item.purchasePriceAtSale;
    } else {
      // Fallback: fetch current product price (suboptimal but prevents 0-cost entries)
      const product = await Product.findById(item.productId).select('purchasePrice').session(session).lean();
      costPerUnit = product?.purchasePrice ?? 0;
      if (!costPerUnit) {
        console.warn(`[JOURNAL] purchasePriceAtSale missing for product ${item.productId} on invoice ${invoice._id}`);
      }
    }

    totalCost += item.quantity * costPerUnit;
  }

  if (totalCost > 0) {
    entries.push(
      {
        organizationId: orgId, branchId, accountId: cogsAcc._id,
        debit: totalCost, credit: 0,
        referenceType: 'invoice', referenceId: invoice._id,
        description:   `COGS #${invoice.invoiceNumber}`,
        createdBy:     userId,
      },
      {
        organizationId: orgId, branchId, accountId: inventoryAcc._id,
        debit: 0, credit: totalCost,
        referenceType: 'invoice', referenceId: invoice._id,
        description:   `Inventory Out #${invoice.invoiceNumber}`,
        createdBy:     userId,
      }
    );
  }

  // FIX #3: Single batched create with ordered:true
  await AccountEntry.create(entries, { session, ordered: true });
};

/* ============================================================
   2. REVERSE INVOICE JOURNAL  (Cancellation / Credit Note)
   FIX #4: Delete the original entries instead of posting a manual reversal.
   Posting opposite entries doubles the trial balance values.
   ============================================================ */
exports.reverseInvoiceJournal = async ({ orgId, invoice, userId, session }) => {
  // Delete all revenue entries for this invoice
  await AccountEntry.deleteMany({
    organizationId: orgId,
    referenceId:    invoice._id,
    referenceType:  'invoice',
  }).session(session);

  // Note: payment entries (referenceType: 'payment') are intentionally NOT deleted here.
  // Payments that were recorded before cancellation are kept for audit purposes.
  // The invoice balance reversal is handled by the calling service (cancelInvoice).
};

/* ============================================================
   3. POST SALES RETURN JOURNAL  (Credit Note)
   Dr Sales / Dr Tax  /  Cr AR  +  Dr Inventory / Cr COGS
   ============================================================ */
exports.postSalesReturnJournal = async ({ salesReturn, invoice, orgId, branchId, userId, session }) => {
  const [arAcc, salesAcc, inventoryAcc, cogsAcc] = await Promise.all([
    JournalService.getOrInitAccount(orgId, 'asset',   'Accounts Receivable', '1200', session),
    JournalService.getOrInitAccount(orgId, 'income',  'Sales Revenue',       '4000', session),
    JournalService.getOrInitAccount(orgId, 'asset',   'Inventory Asset',     '1500', session),
    JournalService.getOrInitAccount(orgId, 'expense', 'Cost of Goods Sold',  '5000', session),
  ]);

  const taxAcc = salesReturn.taxTotal > 0
    ? await JournalService.getOrInitAccount(orgId, 'liability', 'Tax Payable', '2100', session)
    : null;

  const netRevenue = salesReturn.totalRefundAmount - (salesReturn.taxTotal || 0);
  const entries    = [];

  // Dr Sales (reverse revenue)
  entries.push({
    organizationId: orgId, branchId, accountId: salesAcc._id,
    debit: netRevenue, credit: 0,
    referenceType: 'credit_note', referenceId: salesReturn._id,
    description:   `Sales Return #${salesReturn.returnNumber}`,
    createdBy:     userId,
  });

  // Dr Tax Payable (reverse tax)
  if (taxAcc && salesReturn.taxTotal > 0) {
    entries.push({
      organizationId: orgId, branchId, accountId: taxAcc._id,
      debit: salesReturn.taxTotal, credit: 0,
      referenceType: 'credit_note', referenceId: salesReturn._id,
      description:   `GST Return #${salesReturn.returnNumber}`,
      createdBy:     userId,
    });
  }

  // Cr AR (reduce what customer owes)
  entries.push({
    organizationId: orgId, branchId, accountId: arAcc._id,
    customerId:    invoice.customerId,
    debit: 0, credit: salesReturn.totalRefundAmount,
    referenceType: 'credit_note', referenceId: salesReturn._id,
    description:   `Credit Note #${salesReturn.returnNumber}`,
    createdBy:     userId,
  });

  // FIX #2: COGS reversal uses purchasePriceAtSale from the original invoice item
  let costReversal = 0;
  for (const item of salesReturn.items) {
    const invItem = invoice.items?.find(i => String(i.productId) === String(item.productId));
    const costPerUnit = invItem?.purchasePriceAtSale ?? null;

    if (costPerUnit == null) {
      console.warn(`[JOURNAL] No cost snapshot for product ${item.productId} in return ${salesReturn._id}`);
      continue;
    }
    costReversal += item.quantity * costPerUnit;
  }

  if (costReversal > 0) {
    entries.push(
      {
        organizationId: orgId, branchId, accountId: inventoryAcc._id,
        debit: costReversal, credit: 0,
        referenceType: 'credit_note', referenceId: salesReturn._id,
        description:   `Inventory Return #${salesReturn.returnNumber}`,
        createdBy:     userId,
      },
      {
        organizationId: orgId, branchId, accountId: cogsAcc._id,
        debit: 0, credit: costReversal,
        referenceType: 'credit_note', referenceId: salesReturn._id,
        description:   `COGS Reversal #${salesReturn.returnNumber}`,
        createdBy:     userId,
      }
    );
  }

  await AccountEntry.create(entries, { session, ordered: true });
};