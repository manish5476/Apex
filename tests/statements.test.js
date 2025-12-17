// tests/statements.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken'); // Ensure you have this installed
const app = require('../src/app'); // Adjusted path to src/app based on your file structure

// Models
const Account = require('../src/models/accountModel');
const AccountEntry = require('../src/models/accountEntryModel');
const User = require('../src/models/userModel');
const Organization = require('../src/models/organizationModel');

let mongoServer;
let server;

describe('Statements API', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.JWT_SECRET = 'test-secret'; // Ensure secret matches auth middleware expectations
    
    await mongoose.connect(process.env.MONGO_URI);
    server = app.listen(0);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    server.close();
  });

  beforeEach(async () => {
    // Clear all relevant collections
    await Account.deleteMany({});
    await AccountEntry.deleteMany({});
    await User.deleteMany({});
    await Organization.deleteMany({});
  });

  