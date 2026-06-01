const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// 1. ROBUST ENV LOADING
const envPath = path.join(process.cwd(), 'src', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`📂 Loaded environment from: ${envPath}`);
} else {
  console.warn(`⚠️ Could not find .env at ${envPath}. Using defaults.`);
}

// 2. Import Models
const StorefrontCustomer = require('../models/storefront/storefrontCustomer.model');
const StorefrontOrder = require('../models/storefront/storefrontOrder.model');
const CRMBridge = require('../services/storefront/crmBridge.service');

async function migrateOldStorefrontData() {
  try {
    // 3. Connect to the DB
    const dbUri = process.env.DATABASE || process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/apex-erp';
    
    console.log('------------------------------------------------');
    console.log(`🔌 Connecting to: ${dbUri}`); 
    console.log('------------------------------------------------');
    
    await mongoose.connect(dbUri);
    console.log('✅ Connected to MongoDB');

    // ========================================================
    // PHASE 1: MIGRATE ALL STOREFRONT CUSTOMERS TO CRM
    // ========================================================
    console.log('\n--- PHASE 1: MIGRATING CUSTOMERS ---');
    const sfCustomers = await StorefrontCustomer.find({ convertedToMainCustomer: { $ne: true } });
    console.log(`Found ${sfCustomers.length} un-converted storefront customers.`);
    
    let cSuccess = 0, cFailed = 0;
    for (const sfC of sfCustomers) {
      try {
        if (!sfC.phone) {
          sfC.phone = `000${sfC._id.toString().substring(0, 7)}`;
          await StorefrontCustomer.findByIdAndUpdate(sfC._id, { phone: sfC.phone });
        }
        
        // Use a generic organizationId if they have none, but usually sfC belongs to the main org
        // In this system, storefront org might be dynamic. Assuming the primary org if missing.
        const orgId = sfC.organizationId || (await mongoose.connection.db.collection('organizations').findOne({}))?._id;
        if (!orgId) throw new Error("No organization found to bind customer");

        const crmResult = await CRMBridge.ensureCRMCustomer(orgId, sfC, {});
        if (crmResult) {
          await CRMBridge.syncStorefrontCustomerLink(sfC._id, crmResult.crmCustomer);
          cSuccess++;
        } else {
          cFailed++;
        }
      } catch (e) {
        console.error(`[ERROR] Migrating sfCustomer ${sfC._id}:`, e.message);
        cFailed++;
      }
    }
    console.log(`Customer Migration: ${cSuccess} Success, ${cFailed} Failed.`);

    // ========================================================
    // PHASE 2: MIGRATE UN-SYNCED ORDERS
    // ========================================================
    console.log('\n--- PHASE 2: MIGRATING ORDERS ---');
    const orders = await StorefrontOrder.find({
      crmSyncStatus: { $ne: 'synced' },
      orderStatus: { $ne: 'cancelled' } // skip cancelled orders for now
    }).sort({ createdAt: 1 });

    console.log(`Found ${orders.length} un-synced storefront orders to migrate.`);

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const order of orders) {
      console.log(`\n--- Processing Order: ${order.orderNumber} ---`);
      
      try {
        if (!order.customerId) {
          console.log(`[SKIP] No storefront customerId on order`);
          skipped++;
          continue;
        }

        const sfCustomer = await StorefrontCustomer.findById(order.customerId);
        if (!sfCustomer) {
           console.log(`[SKIP] StorefrontCustomer ${order.customerId} not found`);
           skipped++;
           continue;
        }

        if (!sfCustomer.phone) {
          sfCustomer.phone = `000${sfCustomer._id.toString().substring(0, 7)}`;
          await StorefrontCustomer.findByIdAndUpdate(sfCustomer._id, { phone: sfCustomer.phone });
        }

        const crmResult = await CRMBridge.ensureCRMCustomer(order.organizationId, sfCustomer, {
          shippingAddress: order.shippingAddress
        });

        if (!crmResult) {
           console.log(`[FAIL] Could not ensure CRM customer`);
           failed++;
           continue;
        }

        const { crmCustomer } = crmResult;
        console.log(`[OK] CRM Customer ready: ${crmCustomer._id}`);
        
        const { invoice, sale } = await CRMBridge.createOrderCRMRecords(order, crmCustomer, null, { skipStockDeduction: true });
        
        await CRMBridge.syncStorefrontCustomerLink(sfCustomer._id, crmCustomer);

        order.crmInvoiceId = invoice._id;
        order.crmSaleId = sale._id;
        order.crmCustomerId = crmCustomer._id;
        order.crmSyncStatus = 'synced';
        order.crmSyncError = null;
        await order.save();

        console.log(`[SUCCESS] Order migrated -> Invoice: ${invoice.invoiceNumber}`);
        success++;

      } catch (err) {
        console.error(`[ERROR] Migrating order ${order.orderNumber}:`, err.message);
        order.crmSyncStatus = 'failed';
        order.crmSyncError = err.message.substring(0, 500);
        await order.save();
        failed++;
      }
    }

    console.log('\n================================================');
    console.log('             MIGRATION COMPLETE                 ');
    console.log('================================================');
    console.log(`Customers: ${cSuccess} migrated.`);
    console.log(`Orders: ${success} migrated, ${skipped} skipped, ${failed} failed.`);
    console.log('================================================\n');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Global Error:', error);
    process.exit(1);
  }
}

migrateOldStorefrontData();
