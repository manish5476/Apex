const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { fetchTransactionsAggregated } = require('./modules/accounting/core/service/transaction.service');
const AccountEntry = require('./modules/accounting/core/model/accountEntry.model');

// Load env
dotenv.config({ path: './.env' });
mongoose.set('debug', true);

async function run() {
  try {
    await mongoose.connect(process.env.DATABASE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to DB');

    const entry = await AccountEntry.findOne({});
    if (!entry) {
        console.log("No entries found");
        process.exit(0);
    }
    
    // Attempt with branchId
    console.log('\n--- SIMULATING WITH BRANCH ID ---');
    const userWithBranch = {
       organizationId: entry.organizationId.toString(),
       branchId: "650000000000000000000000" // fake branch
    };
    
    await fetchTransactionsAggregated(userWithBranch, { page: "1", limit: "100" });

    // Attempt without branchId
    console.log('\n--- SIMULATING WITHOUT BRANCH ID ---');
    const userNoBranch = {
       organizationId: entry.organizationId.toString()
    };
    
    await fetchTransactionsAggregated(userNoBranch, { page: "1", limit: "100" });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

run();
