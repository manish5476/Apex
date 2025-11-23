// tests/statements.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
let app;
let server;
const Invoice = require('../src/models/invoiceModel');
const Purchase = require('../src/models/purchaseModel');
const Payment = require('../src/models/paymentModel');
const Ledger = require('../src/models/ledgerModel');

describe('Statements API', () => {
  let mongod;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();
    // require app after setting env
    app = require('../app'); // adjust if your express bootstrap path differs
    server = app.listen(0);
    await mongoose.connect(process.env.MONGO_URI);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    server.close();
  });

  beforeEach(async () => {
    await Invoice.deleteMany({});
    await Purchase.deleteMany({});
    await Payment.deleteMany({});
    await Ledger.deleteMany({});
  });

  test('P&L returns sales and purchases', async () => {
    // seed invoice
    await Invoice.create({ organizationId: mongoose.Types.ObjectId(), invoiceNumber: 'INV1', invoiceDate: new Date('2025-01-10'), grandTotal: 1000 });
    await Purchase.create({ organizationId: mongoose.Types.ObjectId(), purchaseDate: new Date('2025-01-10'), grandTotal: 400 });
    const res = await request(app).get('/api/v1/statements/pl?startDate=2025-01-01&endDate=2025-12-31').set('Authorization', 'Bearer testtoken');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.sales.totalSales).toBeDefined();
  });
});
