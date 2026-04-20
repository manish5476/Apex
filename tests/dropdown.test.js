const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/modules/auth/core/user.model');
const Organization = require('../src/modules/organization/core/organization.model');
const Branch = require('../src/modules/organization/core/branch.model');
const Session = require('../src/modules/auth/core/session.model');
const jwt = require('jsonwebtoken');

describe('Dropdown Factory Integration Tests', () => {
  let mongod, token, orgId, userId;

  beforeAll(async () => {
    // 1. Setup Mongo Memory Server
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    
    // Set ENV variables for test
    process.env.JWT_SECRET = 'test-secret-key-123';
    process.env.NODE_ENV = 'test';
    
    // Connect Mongoose
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(uri);

    // 2. Pre-generate IDs to solve circular dependency
    userId = new mongoose.Types.ObjectId();
    orgId = new mongoose.Types.ObjectId();

    // 3. Seed Organization
    await Organization.create({
      _id: orgId,
      name: 'Test Corp',
      email: 'admin@testcorp.com',
      uniqueShopId: 'TESTSHOP123',
      primaryEmail: 'admin@testcorp.com',
      primaryPhone: '1234567890',
      owner: userId, // Required field
      isActive: true
    });

    // 4. Seed User (Approved and Active)
    const user = await User.create({
      _id: userId,
      name: 'Test Admin',
      email: 'admin@testcorp.com',
      phone: '1234567890',
      password: 'password123',
      passwordConfirm: 'password123',
      organizationId: orgId,
      status: 'approved',
      isActive: true,
      role: new mongoose.Types.ObjectId() // Dummy role ID
    });

    // 5. Generate JWT
    token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // 6. Create valid Session in DB (required by protect middleware)
    await Session.create({
      userId: userId,
      organizationId: orgId,
      token: token,
      isValid: true,
      lastActivityAt: new Date(),
      browser: 'Jest',
      os: 'Node',
      deviceType: 'Testing'
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  describe('Dropdown Isolation & Filtering', () => {
    beforeEach(async () => {
      await Branch.deleteMany({});
      
      // Create branches for OUR organization
      await Branch.create([
        { name: 'Main Branch', organizationId: orgId, isActive: true, branchCode: 'B001' },
        { name: 'North Branch', organizationId: orgId, isActive: true, branchCode: 'B002' },
        { name: 'Closed Branch', organizationId: orgId, isActive: false, branchCode: 'B003' },
        { name: 'Deleted Branch', organizationId: orgId, isDeleted: true, branchCode: 'B004' }
      ]);

      // Create a branch for a DIFFERENT organization (Should NEVER be visible)
      await Branch.create({
        name: 'Foreign Branch',
        organizationId: new mongoose.Types.ObjectId(),
        isActive: true,
        branchCode: 'X999'
      });
    });

    test('SUCCESS: Should return only active, non-deleted branches for the logged-in org', async () => {
      const res = await request(app)
        .get('/api/v1/dropdowns/branches')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(2);
      
      const labels = res.body.data.map(d => d.label);
      expect(labels).toContain('Main Branch [B001]');
      expect(labels).toContain('North Branch [B002]');
      expect(labels).not.toContain('Closed Branch [B003]');
      expect(labels).not.toContain('Foreign Branch [X999]');
    });

    test('FILTER: Should respect the search query parameter', async () => {
      const res = await request(app)
        .get('/api/v1/dropdowns/branches?search=North')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].label).toBe('North Branch [B002]');
    });

    test('HYDRATION: Should force-include specific IDs even if they are inactive (includeIds)', async () => {
      const inactive = await Branch.findOne({ name: 'Closed Branch' });
      
      const res = await request(app)
        .get(`/api/v1/dropdowns/branches?includeIds=${inactive._id}`)
        .set('Authorization', `Bearer ${token}`);

      // Should return 2 active branches + 1 forced inactive branch
      expect(res.body.data).toHaveLength(3);
      const labels = res.body.data.map(d => d.label);
      expect(labels).toContain('Closed Branch [B003]');
    });

    test('PAGINATION: Should respect limit parameter', async () => {
      const res = await request(app)
        .get('/api/v1/dropdowns/branches?limit=1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.total).toBe(2); // Total active branches for our org
    });

    test('SECURITY: Should reject requests without a token', async () => {
      const res = await request(app).get('/api/v1/dropdowns/branches');
      expect(res.statusCode).toBe(401);
    }, 10000);
  });
});
