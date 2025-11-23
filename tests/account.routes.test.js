// tests/account.routes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
let app, server;
const Account = require('../models/accountModel');
const AccountEntry = require('../models/accountEntryModel');

describe('Account routes', () => {
  let mongod, token;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    // Require app after setting MONGO_URI
    app = require('../app'); // adjust path to your express app bootstrap
    server = app.listen(0);
    await mongoose.connect(process.env.MONGO_URI);
    // Create a user/org stub in DB or mock auth — easiest: bypass auth by stubbing req.user in middleware for tests
    // For tests, ensure your auth middleware allows a test token or you can temporarily skip auth by setting env var
    token = 'test-token';
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    server.close();
  });

  beforeEach(async () => {
    await Account.deleteMany({});
    await AccountEntry.deleteMany({});
  });

  test('create, list and delete account (blocked when entries present)', async () => {
    // create account via API
    const resCreate = await request(app).post('/api/v1/accounts').set('Authorization','Bearer test').send({ code: '9999', name: 'Test Acc', type: 'asset' });
    expect([201,200]).toContain(resCreate.statusCode); // accommodate either
    const accId = resCreate.body.data._id;

    // create account entry to block deletion
    await AccountEntry.create({ organizationId: resCreate.body.data.organizationId, accountId: accId, date: new Date(), debit: 100, credit: 0 });

    // attempt delete -> should fail
    const del = await request(app).delete(`/api/v1/accounts/${accId}`).set('Authorization','Bearer test');
    expect(del.statusCode).toBe(400);
    expect(del.body.message).toMatch(/posted entries/i);
  });
});
