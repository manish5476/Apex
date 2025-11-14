// src/utils/socket.js
const jwt = require('jsonwebtoken');
let io = null;
let pubClient = null;
let subClient = null;

function init(server, { path, cors, redisUrl, jwtSecret }) {
  if (io) return io;
  const { Server } = require('socket.io');
  io = new Server(server, { path: path || '/socket.io', cors: cors || { origin: '*' } });

  if (redisUrl) {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    pubClient = createClient({ url: redisUrl });
    subClient = pubClient.duplicate();
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('Socket.IO Redis adapter connected');
    }).catch(err => console.error('Redis adapter err', err));
  }

  // Authentication on connection via token in auth handshake
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(); // allow anonymous but restrict later if needed
      const secret = jwtSecret || process.env.JWT_SECRET;
      const payload = jwt.verify(token, secret);
      // attach user to socket for later checks
      socket.user = payload;
      return next();
    } catch (err) {
      return next(); // don't block connection — you can enforce on joinOrg
    }
  });

  io.on('connection', (socket) => {
    socket.on('joinOrg', ({ organizationId }) => {
      // enforce that socket.user belongs to org if authenticated
      if (socket.user) {
        if (String(socket.user.organizationId) !== String(organizationId)) {
          return socket.emit('error', 'Not authorized for organization');
        }
      }
      socket.join(`org:${organizationId}`);
    });
  });

  return io;
}

function emitToOrg(organizationId, event, payload) {
  if (!io) return;
  io.to(`org:${organizationId}`).emit(event, payload);
}

module.exports = { init, emitToOrg, getIo: () => io };


// // src/utils/socket.js
// let io = null;

// /**
//  * initialize Socket.io on the HTTP server
//  * call require('./src/utils/socket').init(server, { path, cors })
//  */
// function init(server, opts = {}) {
//   if (io) return io;
//   const { Server } = require('socket.io');
//   io = new Server(server, {
//     path: opts.path || '/socket.io',
//     cors: opts.cors || { origin: '*' } // tighten in production
//   });

//   io.on('connection', (socket) => {
//     // expect client to join organization room after authenticating
//     socket.on('joinOrg', ({ organizationId }) => {
//       if (organizationId) {
//         socket.join(`org:${organizationId}`);
//       }
//     });
//     // allow client to leave
//     socket.on('leaveOrg', ({ organizationId }) => {
//       if (organizationId) socket.leave(`org:${organizationId}`);
//     });
//   });

//   return io;
// }

// /**
//  * emitToOrg - emit an event to all sockets in an org room
//  */
// function emitToOrg(organizationId, event, payload) {
//   if (!io) return;
//   io.to(`org:${organizationId}`).emit(event, payload);
// }

// module.exports = { init, emitToOrg, getIo: () => io };
