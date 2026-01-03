const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// ==========================================================
// 1. ROBUST ENVIRONMENT LOADING
// ==========================================================
// Try to locate .env in src/ or root
const possiblePaths = [
  path.resolve(__dirname, '../.env'),      // If script is in src/scripts
  path.resolve(__dirname, '../../.env'),   // If script is deeper
  path.resolve(process.cwd(), '.env'),     // From root
  path.resolve(process.cwd(), 'src/.env')  // From root/src
];

const envPath = possiblePaths.find(p => fs.existsSync(p));

if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`✅ Loaded environment from: ${envPath}`);
} else {
  console.error('🔴 FATAL: Could not locate .env file. Exiting.');
  process.exit(1);
}

// ==========================================================
// 2. IMPORTS
// ==========================================================
// Adjust paths based on your folder structure
const Organization = require('../models/organizationModel');
const Account = require('../models/accountModel');

const DB_URI = process.env.DATABASE;

// ==========================================================
// 3. CHART OF ACCOUNTS (STANDARD)
// ==========================================================
const DEFAULT_ACCOUNTS = [
  // --- ASSETS ---
  { code: '1001', name: 'Cash', type: 'asset', isGroup: false },
  { code: '1002', name: 'Bank', type: 'asset', isGroup: false },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', isGroup: false }, // AR Standard
  { code: '1200', name: 'Inventory Asset', type: 'asset', isGroup: false },
  
  // --- LIABILITIES ---
  { code: '2000', name: 'Accounts Payable', type: 'liability', isGroup: false }, // AP Standard
  { code: '2100', name: 'Tax Payable', type: 'liability', isGroup: false },
  
  // --- INCOME ---
  { code: '4000', name: 'Sales', type: 'income', isGroup: false },
  { code: '4100', name: 'Service Income', type: 'income', isGroup: false },
  
  // --- EXPENSES ---
  { code: '5000', name: 'Purchases', type: 'expense', isGroup: false },
  { code: '5100', name: 'Cost of Goods Sold', type: 'expense', isGroup: false },
  { code: '5200', name: 'Operating Expenses', type: 'expense', isGroup: false },

  // --- EQUITY/OTHER ---
  { code: '3000', name: 'Opening Balance Equity', type: 'equity', isGroup: false },
  { code: '9999', name: 'Uncategorized Transactions', type: 'other', isGroup: false } // Safety Net
];

// ==========================================================
// 4. MAIN EXECUTION
// ==========================================================
(async () => {
  try {
    if (!DB_URI) {
      throw new Error('DATABASE URI is missing in .env');
    }

    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');

    const orgs = await Organization.find({});
    console.log(`🔍 Found ${orgs.length} Organizations to seed.`);
    
    for (const org of orgs) {
      console.log(`\n🏢 Processing Org: ${org.name || 'Unnamed'} (${org._id})`);
      
      let createdCount = 0;

      for (const template of DEFAULT_ACCOUNTS) {
        // 🛡️ LOGIC: Check by Code OR Name to prevent duplicates
        const exists = await Account.findOne({
          organizationId: org._id,
          $or: [
            { code: template.code }, 
            { name: template.name }
          ]
        });

        if (!exists) {
          await Account.create({
            organizationId: org._id,
            ...template,
            cachedBalance: 0,
            metadata: { isSystemDefault: true } // Mark as system generated
          });
          console.log(`   ✨ Created: [${template.code}] ${template.name}`);
          createdCount++;
        } else {
          // Optional: Update immutable flags if needed, otherwise skip
          // console.log(`   Note: [${template.code}] ${template.name} already exists.`);
        }
      }
      
      if (createdCount === 0) console.log('   (No new accounts needed)');
    }
    
    console.log('\n✅ Seeding Complete. All ledgers are compliant.');

  } catch (e) {
    console.error('\n💥 Script Error:', e.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('👋 Disconnected');
    }
  }
})();
// const mongoose = require('mongoose');
// const path = require('path');
// const dotenv = require('dotenv');

// // 1. Load .env from the 'src' folder
// // __dirname is 'src/scripts', so we go up one level ('..') to find '.env' inside 'src/'
// const envPath = path.resolve(__dirname, '../.env');
// dotenv.config({ path: envPath });

// // 2. Import Models
// const Organization = require('../models/organizationModel');
// const Account = require('../models/accountModel');

// // 3. Get Connection String (Using 'DATABASE' as per your server.js)
// const DB_URI = process.env.DATABASE;

// const DEFAULT_ACCOUNTS = [
//   { code: '1001', name: 'Cash', type: 'asset', isGroup: false },
//   { code: '1002', name: 'Bank', type: 'asset', isGroup: false },
//   { code: '1100', name: 'Accounts Receivable', type: 'asset', isGroup: false },
//   { code: '1200', name: 'Inventory Asset', type: 'asset', isGroup: false }, 
//   { code: '2000', name: 'Accounts Payable', type: 'liability', isGroup: false }, 
//   { code: '4000', name: 'Sales', type: 'income', isGroup: false },
//   { code: '5000', name: 'Purchases', type: 'expense', isGroup: false },
//   { code: '5100', name: 'Cost of Goods Sold', type: 'expense', isGroup: false }
// ];

// (async () => {
//   try {
//     // Safety Check
//     if (!DB_URI) {
//       console.error('❌ FATAL ERROR: process.env.DATABASE is undefined.');
//       console.error(`   Checked for .env file at: ${envPath}`);
//       process.exit(1);
//     }

//     // Connect
//     await mongoose.connect(DB_URI);
//     console.log('✅ Connected to MongoDB');

//     const orgs = await Organization.find({});
//     console.log(`Found ${orgs.length} Organizations to seed.`);
    
//     for (const org of orgs) {
//       console.log(`Processing Org: ${org.name} (${org._id})`);
      
//       for (const template of DEFAULT_ACCOUNTS) {
//         // Check if account exists by Code OR Name
//         const exists = await Account.findOne({
//           organizationId: org._id,
//           $or: [{ code: template.code }, { name: template.name }]
//         });

//         if (!exists) {
//           await Account.create({
//             organizationId: org._id,
//             ...template
//           });
//           console.log(`   + Created: ${template.name}`);
//         } else {
//           // console.log(`   . Skipped: ${template.name} (Exists)`);
//         }
//       }
//     }
//     console.log('✅ Seeding Complete');
//   } catch (e) {
//     console.error('Script Error:', e);
//   } finally {
//     if (mongoose.connection.readyState !== 0) {
//       await mongoose.disconnect();
//       console.log('👋 Disconnected');
//     }
//   }
// })();