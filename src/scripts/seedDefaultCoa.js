// scripts/seedDefaultCoa.js (update)
require('dotenv').config();
const mongoose = require('mongoose');
const Account = require('../src/models/accountModel');

const defaultAccounts = [
  { code: '1000', name: 'Cash', type: 'asset', metadata: { short: 'CASH' } },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', metadata: { short: 'AR' } },
  { code: '2000', name: 'Accounts Payable', type: 'liability', metadata: { short: 'AP' } },
  { code: '4000', name: 'Sales', type: 'income', metadata: { short: 'SALES' } },
  { code: '5000', name: 'Purchases', type: 'expense', metadata: { short: 'PURCHASES' } },
  { code: '6000', name: 'Expenses', type: 'expense', metadata: { short: 'EXP' } }
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const orgId = process.env.SEED_ORG_ID;
    if (!orgId) throw new Error('Set SEED_ORG_ID');
    for (const a of defaultAccounts) {
      await Account.updateOne({ organizationId: orgId, code: a.code }, { $setOnInsert: { ...a, organizationId: orgId } }, { upsert: true });
    }
    console.log('COA seeded');
  } catch (e) { console.error(e); process.exit(1); } finally { await mongoose.disconnect(); }
})();


// // scripts/seedDefaultCoa.js
// require('dotenv').config();
// const mongoose = require('mongoose');
// const Account = require('../src/models/accountModel');

// const defaultAccounts = [
//   { code: '1000', name: 'Cash', type: 'asset', metadata: { short: 'CASH' } },
//   { code: '1100', name: 'Accounts Receivable', type: 'asset', metadata: { short: 'AR' } },
//   { code: '2000', name: 'Accounts Payable', type: 'liability', metadata: { short: 'AP' } },
//   { code: '3000', name: 'Equity', type: 'equity' },
//   { code: '4000', name: 'Sales', type: 'income', metadata: { short: 'SALES' } },
//   { code: '5000', name: 'Purchases', type: 'expense', metadata: { short: 'PURCHASES' } },
//   { code: '6000', name: 'Expenses', type: 'expense' }
// ];

// (async () => {
//   try {
//     await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
//     console.log('Connected');
//     const orgId = process.env.TEST_ORG_ID; // pass organization id env var
//     for (const a of defaultAccounts) {
//       await Account.updateOne({ organizationId: orgId, code: a.code }, { $setOnInsert: { ...a, organizationId: orgId } }, { upsert: true });
//     }
//     console.log('Seeded COA');
//   } catch (err) {
//     console.error(err);
//   } finally {
//     await mongoose.disconnect();
//   }
// })();
