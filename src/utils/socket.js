// src/utils/socket.js
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

let io = null;

// Map to track specific users: userId -> socketId
const activeUsers = new Map(); 

function init(server, { cors, redisUrl, jwtSecret }) {
  if (io) return io;

  io = new Server(server, { 
    cors: cors || { origin: '*' },
    transports: ['websocket', 'polling']
  });

  // (Optional) Redis Adapter Setup
  if (redisUrl) {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.IO Redis adapter connected');
    }).catch(err => console.error('❌ Redis adapter error:', err));
  }

  // --- Middleware: Authentication ---
  io.use((socket, next) => {
    try {
      // 1. Check for token in handshake auth
      const token = socket.handshake.auth?.token;
      
      if (!token) {
        // Option: return next(new Error("Authentication error")); to force auth
        return next(); 
      }

      const secret = jwtSecret || process.env.JWT_SECRET;
      const payload = jwt.verify(token, secret);
      socket.user = payload; // Attach user data to socket
      return next();
    } catch (err) {
      console.warn("⚠️ Socket Auth Failed:", err.message);
      return next(); // Proceed as guest, or next(err) to block
    }
  });

  // --- Connection Logic ---
  io.on('connection', (socket) => {
    console.log(`⚡ Client connected: ${socket.id}`);

    // A. Register User (for 1-on-1 messages like Force Logout)
    socket.on('registerUser', (userId) => {
      if (!userId) return;
      activeUsers.set(userId, socket.id);
      console.log(`👤 User registered: ${userId}`);
    });

    // B. Join Organization Room (for Group Notifications)
    socket.on('joinOrg', ({ organizationId }) => {
      // Security Check: Ensure token matches requested org
      if (socket.user && String(socket.user.organizationId) !== String(organizationId)) {
         console.warn(`⚠️ User ${socket.user._id} tried to join wrong org ${organizationId}`);
         return; 
      }
      
      const roomName = `org:${organizationId}`;
      socket.join(roomName);
      console.log(`🏢 Socket ${socket.id} joined room: ${roomName}`);
    });

    // C. Disconnect Cleanup
    socket.on('disconnect', () => {
      // Remove from activeUsers map
      for (const [userId, socketId] of activeUsers.entries()) {
        if (socketId === socket.id) {
          activeUsers.delete(userId);
          break;
        }
      }
    });
  });

  return io;
}

// --- Helper: Send to entire Organization ---
function emitToOrg(organizationId, event, payload) {
  if (!io) {
    console.warn("⚠️ Socket.IO not initialized, cannot emit.");
    return;
  }
  io.to(`org:${organizationId}`).emit(event, payload);
}

// --- Helper: Send to specific User (e.g. Force Logout) ---
function emitToUser(userId, event, payload) {
  if (!io) return;
  const socketId = activeUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, payload);
  }
}

module.exports = { init, emitToOrg, emitToUser, getIo: () => io };


// // src/utils/socket.js
// const jwt = require('jsonwebtoken');
// let io = null;
// let pubClient = null;
// let subClient = null;

// function init(server, { path, cors, redisUrl, jwtSecret }) {
//   if (io) return io;
//   const { Server } = require('socket.io');
//   io = new Server(server, { path: path || '/socket.io', cors: cors || { origin: '*' } });

//   if (redisUrl) {
//     const { createClient } = require('redis');
//     const { createAdapter } = require('@socket.io/redis-adapter');
//     pubClient = createClient({ url: redisUrl });
//     subClient = pubClient.duplicate();
//     Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
//       io.adapter(createAdapter(pubClient, subClient));
//       console.log('Socket.IO Redis adapter connected');
//     }).catch(err => console.error('Redis adapter err', err));
//   }

//   // Authentication on connection via token in auth handshake
//   io.use((socket, next) => {
//     try {
//       const token = socket.handshake.auth && socket.handshake.auth.token;
//       if (!token) return next(); // allow anonymous but restrict later if needed
//       const secret = jwtSecret || process.env.JWT_SECRET;
//       const payload = jwt.verify(token, secret);
//       // attach user to socket for later checks
//       socket.user = payload;
//       return next();
//     } catch (err) {
//       return next(); // don't block connection — you can enforce on joinOrg
//     }
//   });

//   io.on('connection', (socket) => {
//     socket.on('joinOrg', ({ organizationId }) => {
//       // enforce that socket.user belongs to org if authenticated
//       if (socket.user) {
//         if (String(socket.user.organizationId) !== String(organizationId)) {
//           return socket.emit('error', 'Not authorized for organization');
//         }
//       }
//       socket.join(`org:${organizationId}`);
//     });
//   });

//   return io;
// }

// function emitToOrg(organizationId, event, payload) {
//   if (!io) return;
//   io.to(`org:${organizationId}`).emit(event, payload);
// }

// module.exports = { init, emitToOrg, getIo: () => io };

