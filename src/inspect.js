const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./modules/auth/core/user.model');
const AccountEntry = require('./modules/accounting/core/model/accountEntry.model');

// Load env
dotenv.config({ path: './.env' });

async function run() {
  try {
    await mongoose.connect(process.env.DATABASE, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to DB');

    const users = await User.find({}).select('email role branchId organizationId').lean();
    console.log('Users:', users);

    const entries = await AccountEntry.find().limit(5).select('branchId').lean();
    console.log('Sample entries branchIds:', entries);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

run();
