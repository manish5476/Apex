const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { fetchTransactionsAggregated } = require('./modules/accounting/core/service/transaction.service');

dotenv.config({ path: './.env' });

async function run() {
  try {
    await mongoose.connect(process.env.DATABASE, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected DB');

    const orgId = "698f1a7feff3e811b71a590f";
    const branchId = "698f1a82eff3e811b71a5916";

    // Simulating what the controller passes
    const user = {
       organizationId: orgId,
       branchId: branchId
    };

    console.log('Fetching with user:', user);
    const result = await fetchTransactionsAggregated(user, {});
    console.log('API Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

run();
