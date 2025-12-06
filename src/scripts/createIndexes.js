// scripts/createIndexes.js
require('dotenv').config();
const mongoose = require('mongoose');
const Invoice = require('../models/invoiceModel');
const Payment = require('../models/paymentModel');
const Purchase = require('../models/purchaseModel');
const Ledger = require('../models/ledgerModel');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    await Invoice.createIndexes();
    await Payment.createIndexes();
    await Purchase.createIndexes();
    await Ledger.createIndexes();

    console.log('Indexes created successfully.');
  } catch (err) {
    console.error('Error creating indexes:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
})();
/**const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/yourdb";

async function run() {
  try {
    console.log("\n🔧 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { autoIndex: false });
    console.log("✅ Connected.\n");

    const db = mongoose.connection.db;

    const indexSets = [
      // ---------------- INVOICE ----------------
      {
        collection: "invoices",
        indexes: [
          { key: { organizationId: 1, invoiceDate: -1 } },
          { key: { organizationId: 1, customerId: 1 } },
          { key: { organizationId: 1, branchId: 1, invoiceDate: -1 } },
          { key: { organizationId: 1, paymentStatus: 1 } },
          { key: { organizationId: 1, status: 1 } },
        ]
      },

      // ---------------- PURCHASES ----------------
      {
        collection: "purchases",
        indexes: [
          { key: { organizationId: 1, purchaseDate: -1 } },
          { key: { organizationId: 1, supplierId: 1 } },
          { key: { organizationId: 1, branchId: 1 } },
        ]
      },

      // ---------------- PAYMENTS ----------------
      {
        collection: "payments",
        indexes: [
          { key: { organizationId: 1, paymentDate: -1 } },
          { key: { customerId: 1 } },
          { key: { supplierId: 1 } }
        ]
      },

      // ---------------- CUSTOMERS ----------------
      {
        collection: "customers",
        indexes: [
          { key: { organizationId: 1, createdAt: -1 } },
          { key: { organizationId: 1, outstandingBalance: -1 } }
        ]
      },

      // ---------------- PRODUCTS ----------------
      {
        collection: "products",
        indexes: [
          { key: { organizationId: 1, category: 1 } },
          { key: { organizationId: 1, isActive: 1 } },
          { key: { organizationId: 1, sku: 1 }, unique: true, partialFilterExpression: { sku: { $type: "string" } } }
        ]
      },

      // ---------------- LEDGER ----------------
      {
        collection: "ledgers",
        indexes: [
          { key: { organizationId: 1, entryDate: -1 } },
          { key: { organizationId: 1, accountType: 1 } }
        ]
      },

      // ---------------- AUDIT LOGS ----------------
      {
        collection: "auditlogs",
        indexes: [
          { key: { organizationId: 1, createdAt: -1 } },
          { key: { userId: 1, createdAt: -1 } },
          { key: { action: 1 } }
        ]
      }
    ];

    for (const set of indexSets) {
      const col = db.collection(set.collection);
      console.log(`📁 Applying indexes for: ${set.collection}`);

      for (const idx of set.indexes) {
        try {
          await col.createIndex(idx.key, {
            ...idx,
            background: true
          });

          console.log(`   ✔️ Created: ${JSON.stringify(idx.key)}`);
        } catch (err) {
          console.log(`   ⚠️ Skipped (already exists or conflict): ${JSON.stringify(idx.key)} → ${err.message}`);
        }
      }

      console.log("");
    }

    console.log("🎉 Index creation completed.\n");
    process.exit(0);

  } catch (err) {
    console.error("❌ Error creating indexes:", err);
    process.exit(1);
  }
}

run();
 */
