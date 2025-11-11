// tests/socket.test.js
const { createServer } = require('http');
const { io: Client } = require('socket.io-client');
const { init } = require('../src/utils/socket');
const jwt = require('jsonwebtoken');

describe('Socket events', () => {
  let httpServer, serverUrl, ioServer;

  beforeAll((done) => {
    httpServer = createServer();
    httpServer.listen(() => {
      const port = httpServer.address().port;
      serverUrl = `http://localhost:${port}`;
      ioServer = init(httpServer, { jwtSecret: process.env.JWT_SECRET || 'testsecret' });
      done();
    });
  });

  afterAll((done) => {
    ioServer.close();
    httpServer.close(done);
  });

  test('client receives transaction:created after joinOrg', (done) => {
    const token = jwt.sign({ userId: 'u1', organizationId: 'org1' }, process.env.JWT_SECRET || 'testsecret');
    const client = new Client(serverUrl, { auth: { token } });
    client.on('connect', () => {
      client.emit('joinOrg', { organizationId: 'org1' });
      // subscribe to event
      client.on('transaction:created', (payload) => {
        expect(payload.type).toBe('invoice');
        client.close();
        done();
      });

      // simulate server emit
      setTimeout(() => {
        ioServer.to('org:org1').emit('transaction:created', { type: 'invoice', id: 'abc' });
      }, 50);
    });
  });
});
