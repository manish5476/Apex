const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// 1. Load .env from the 'src' folder
// __dirname is 'src/scripts', so we go up one level ('..') to find '.env' inside 'src/'
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// 2. Import Models
const Organization = require('../models/organizationModel');
const Account = require('../models/accountModel');

// 3. Get Connection String (Using 'DATABASE' as per your server.js)
const DB_URI = process.env.DATABASE;

const DEFAULT_ACCOUNTS = [
  { code: '1001', name: 'Cash', type: 'asset', isGroup: false },
  { code: '1002', name: 'Bank', type: 'asset', isGroup: false },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', isGroup: false },
  { code: '1200', name: 'Inventory Asset', type: 'asset', isGroup: false }, 
  { code: '2000', name: 'Accounts Payable', type: 'liability', isGroup: false }, 
  { code: '4000', name: 'Sales', type: 'income', isGroup: false },
  { code: '5000', name: 'Purchases', type: 'expense', isGroup: false },
  { code: '5100', name: 'Cost of Goods Sold', type: 'expense', isGroup: false }
];

(async () => {
  try {
    // Safety Check
    if (!DB_URI) {
      console.error('❌ FATAL ERROR: process.env.DATABASE is undefined.');
      console.error(`   Checked for .env file at: ${envPath}`);
      process.exit(1);
    }

    // Connect
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');

    const orgs = await Organization.find({});
    console.log(`Found ${orgs.length} Organizations to seed.`);
    
    for (const org of orgs) {
      console.log(`Processing Org: ${org.name} (${org._id})`);
      
      for (const template of DEFAULT_ACCOUNTS) {
        // Check if account exists by Code OR Name
        const exists = await Account.findOne({
          organizationId: org._id,
          $or: [{ code: template.code }, { name: template.name }]
        });

        if (!exists) {
          await Account.create({
            organizationId: org._id,
            ...template
          });
          console.log(`   + Created: ${template.name}`);
        } else {
          // console.log(`   . Skipped: ${template.name} (Exists)`);
        }
      }
    }
    console.log('✅ Seeding Complete');
  } catch (e) {
    console.error('Script Error:', e);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('👋 Disconnected');
    }
  }
})();