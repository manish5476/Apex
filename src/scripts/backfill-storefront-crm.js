#!/usr/bin/env node
/**
 * Backfill: Storefront Orders → CRM Records
 * ─────────────────────────────────────────────
 * One-time migration script to create CRM records for all existing
 * StorefrontOrders that are NOT cancelled and have no crmInvoiceId.
 *
 * Usage:
 *   node src/scripts/backfill-storefront-crm.js [--org <organizationId>] [--dry-run]
 *
 * Features:
 *   - Fully idempotent: safe to run multiple times
 *   - Processes orders in batches of 20 to avoid memory issues
 *   - Logs success/failure per order
 *   - dry-run mode: shows what would be synced without writing anything
 *   - Filters to a specific organization with --org flag
 *
 * Requirements:
 *   - MongoDB replica set (required for transactions)
 *   - All CRM models and StockService available
 */

'use strict';

require('dotenv').config();
const mongoose   = require('mongoose');
const path       = require('path');

// ─── Bootstrap models ─────────────────────────────────────────────────────────
require('../modules/organization/core/customer.model');
require('../modules/accounting/billing/invoice.model');
require('../modules/inventory/core/model/sales.model');
require('../modules/inventory/core/model/product.model');
require('../modules/accounting/payments/payment.model');
require('../modules/accounting/core/model/account.model');
require('../modules/accounting/core/model/accountEntry.model');
require('../PublicModules/models/storefront/storefrontCustomer.model');
require('../PublicModules/models/storefront/storefrontOrder.model');

const StorefrontOrder    = mongoose.model('StorefrontOrder');
const StorefrontCustomer = mongoose.model('StorefrontCustomer');
const CRMBridge          = require('../PublicModules/services/storefront/crmBridge.service');

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const orgIdx  = args.indexOf('--org');
const ORG_ID  = orgIdx !== -1 ? args[orgIdx + 1] : null;

const BATCH_SIZE = 20;

async function run() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI environment variable is required');

  console.log('\n=== Storefront → CRM Backfill ===');
  console.log(`Mode:    ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Org:     ${ORG_ID || 'ALL organizations'}`);
  console.log('');

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  // Build query for orders to backfill
  const query = {
    orderStatus:  { $ne: 'cancelled' },
    crmSyncStatus: { $in: ['pending', 'failed', 'pending_phone', null, undefined] },
    $or: [
      { crmInvoiceId: null },
      { crmInvoiceId: { $exists: false } }
    ]
  };
  if (ORG_ID) query.organizationId = new mongoose.Types.ObjectId(ORG_ID);

  const total = await StorefrontOrder.countDocuments(query);
  console.log(`Found ${total} orders to process\n`);

  if (total === 0) {
    console.log('Nothing to do. Exiting.');
    await mongoose.disconnect();
    return;
  }

  let processed = 0;
  let succeeded = 0;
  let failed    = 0;
  let skipped   = 0;

  const errors = [];

  while (processed < total) {
    const batch = await StorefrontOrder.find(query)
      .skip(processed)
      .limit(BATCH_SIZE)
      .lean();

    if (batch.length === 0) break;

    for (const order of batch) {
      const label = `Order ${order.orderNumber} [${order._id}]`;
      try {
        // Fetch storefront customer
        const sfCustomer = await StorefrontCustomer.findById(order.customerId).lean();
        if (!sfCustomer) {
          console.log(`  [SKIP] ${label} — StorefrontCustomer not found`);
          skipped++;
          continue;
        }

        if (!sfCustomer.phone) {
          console.log(`  [SKIP] ${label} — Customer has no phone (crmSyncStatus → pending_phone)`);
          if (!DRY_RUN) {
            await StorefrontOrder.updateOne(
              { _id: order._id },
              { $set: { crmSyncStatus: 'pending_phone' } }
            );
          }
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          console.log(`  [DRY]  ${label} — Would sync (customer: ${sfCustomer.firstName} ${sfCustomer.lastName}, phone: ${sfCustomer.phone})`);
          succeeded++;
          continue;
        }

        // Ensure CRM customer
        const crmResult = await CRMBridge.ensureCRMCustomer(
          order.organizationId, sfCustomer, { shippingAddress: order.shippingAddress }
        );
        if (!crmResult) {
          console.log(`  [SKIP] ${label} — Could not link CRM customer`);
          skipped++;
          continue;
        }

        // Create CRM records
        const { invoice, sale } = await CRMBridge.createOrderCRMRecords(
          order, crmResult.crmCustomer, null
        );

        // Sync storefront customer link
        await CRMBridge.syncStorefrontCustomerLink(sfCustomer._id, crmResult.crmCustomer);

        // Update order
        await StorefrontOrder.updateOne({ _id: order._id }, {
          $set: {
            crmInvoiceId:  invoice._id,
            crmSaleId:     sale._id,
            crmCustomerId: crmResult.crmCustomer._id,
            crmSyncStatus: 'synced',
            crmSyncError:  null,
          }
        });

        console.log(`  [OK]   ${label} → Invoice ${invoice.invoiceNumber} | Sale ${sale._id}`);
        succeeded++;

      } catch (err) {
        console.error(`  [ERR]  ${label} → ${err.message}`);
        errors.push({ orderId: order._id, orderNumber: order.orderNumber, error: err.message });
        if (!DRY_RUN) {
          await StorefrontOrder.updateOne({ _id: order._id }, {
            $set: { crmSyncStatus: 'failed', crmSyncError: err.message?.substring(0, 500) }
          }).catch(() => {});
        }
        failed++;
      }
    }

    processed += batch.length;
    console.log(`\nProgress: ${processed}/${total}\n`);
  }

  // Summary
  console.log('\n=== Backfill Complete ===');
  console.log(`Total processed: ${processed}`);
  console.log(`  Succeeded:     ${succeeded}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Failed:        ${failed}`);

  if (errors.length > 0) {
    console.log('\nFailed orders:');
    for (const e of errors) {
      console.log(`  ${e.orderNumber} [${e.orderId}]: ${e.error}`);
    }
  }

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\nFatal error:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
