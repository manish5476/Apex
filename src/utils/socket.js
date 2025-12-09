
// src/utils/socket.js
'use strict';

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const Channel = require('../models/channelModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel'); // make sure path matches your project

let io = null;

/**
 * Data structures
 * - activeSockets: userId -> Set(socketId)
 * - orgOnlineUsers: orgId -> Set(userId)
 * - channelPresence: channelId -> Set(userId)
 */
const activeSockets = new Map();
const orgOnlineUsers = new Map();
const channelPresence = new Map();

function addSocketForUser(userId, socketId) {
  const key = String(userId);
  const set = activeSockets.get(key) || new Set();
  set.add(socketId);
  activeSockets.set(key, set);
}

function removeSocketForUser(userId, socketId) {
  const key = String(userId);
  const set = activeSockets.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) activeSockets.delete(key);
  else activeSockets.set(key, set);
}

function getSocketIdsForUser(userId) {
  const set = activeSockets.get(String(userId));
  return set ? Array.from(set) : [];
}

function addOrgOnlineUser(orgId, userId) {
  const key = String(orgId);
  if (!orgOnlineUsers.has(key)) orgOnlineUsers.set(key, new Set());
  orgOnlineUsers.get(key).add(String(userId));
}

function removeOrgOnlineUser(orgId, userId) {
  const key = String(orgId);
  const set = orgOnlineUsers.get(key);
  if (!set) return;
  set.delete(String(userId));
  if (set.size === 0) orgOnlineUsers.delete(key);
}

function addUserToChannel(channelId, userId) {
  const key = String(channelId);
  if (!channelPresence.has(key)) channelPresence.set(key, new Set());
  channelPresence.get(key).add(String(userId));
}

function removeUserFromChannel(channelId, userId) {
  const key = String(channelId);
  const set = channelPresence.get(key);
  if (!set) return;
  set.delete(String(userId));
  if (set.size === 0) channelPresence.delete(key);
}

function getUsersInChannel(channelId) {
  const set = channelPresence.get(String(channelId));
  return set ? Array.from(set) : [];
}

/**
 * Initialize Socket.IO server
 * server: http.Server instance
 * options: { cors, redisUrl, jwtSecret, pingTimeout }
 */
function init(server, options = {}) {
  if (io) return io;

  const { cors, redisUrl, jwtSecret, pingTimeout = 30000 } = options;

  io = new Server(server, {
    cors: cors || { origin: '*' },
    transports: ['websocket', 'polling'],
    pingTimeout,
  });

  // Optional Redis adapter for scaling
  if (redisUrl) {
    try {
      const { createClient } = require('redis');
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          io.adapter(createAdapter(pubClient, subClient));
          console.log('✅ Socket.IO Redis adapter connected');
        })
        .catch((err) => console.error('❌ Redis adapter error:', err));
    } catch (err) {
      console.error('Redis adapter setup failed:', err);
    }
  }

  // Strict auth middleware: token required and must contain sub & organizationId
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('auth required'));
      const secret = jwtSecret || process.env.JWT_SECRET;
      const payload = jwt.verify(token, secret);

      if (!payload || !payload.sub || !payload.organizationId) return next(new Error('invalid token payload'));

      // attach minimal user info
      socket.user = {
        _id: payload.sub,
        email: payload.email,
        organizationId: payload.organizationId,
        role: payload.role || 'member',
      };

      return next();
    } catch (err) {
      return next(new Error('auth failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user._id);
    const orgId = String(socket.user.organizationId);

    // register socket
    addSocketForUser(userId, socket.id);

    // mark user online for org (only when first socket connects)
    if (getSocketIdsForUser(userId).length === 1) {
      addOrgOnlineUser(orgId, userId);
      io.to(`org:${orgId}`).emit('userOnline', { userId });
    }

    // automatically join organization room for org-wide broadcasts
    socket.join(`org:${orgId}`);

    // debug
    // console.log(`socket connected: ${socket.id} user:${userId} org:${orgId}`);

    // BACKWARDS COMPATIBILITY: registerUser event (optional)
    socket.on('registerUser', (registerUserId) => {
      if (!registerUserId) return;
      addSocketForUser(registerUserId, socket.id);
    });

    // JOIN ORG room explicitly (keeps security check)
    socket.on('joinOrg', ({ organizationId } = {}) => {
      if (!organizationId) return;
      if (String(organizationId) !== orgId) {
        return socket.emit('error', { code: 'INVALID_ORG', message: 'Organization mismatch' });
      }
      socket.join(`org:${organizationId}`);
    });

    // JOIN CHANNEL
    socket.on('joinChannel', async ({ channelId } = {}) => {
      if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      try {
        const channel = await Channel.findById(channelId).lean();
        if (!channel) return socket.emit('error', { code: 'CHANNEL_NOT_FOUND' });
        if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' });
        if (String(channel.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });

        if (channel.type !== 'public') {
          const isMember = (channel.members || []).some((m) => String(m) === userId);
          if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
        }

        socket.join(`channel:${channelId}`);

        // add to channel presence and broadcast join
        addUserToChannel(channelId, userId);
        socket.to(`channel:${channelId}`).emit('userJoinedChannel', { userId, channelId });

        // send current present users to the joiner
        const present = getUsersInChannel(channelId);
        socket.emit('channelUsers', { channelId, users: present });
      } catch (err) {
        console.error('joinChannel err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // LEAVE CHANNEL
    socket.on('leaveChannel', ({ channelId } = {}) => {
      if (!channelId) return;
      socket.leave(`channel:${channelId}`);
      removeUserFromChannel(channelId, userId);
      io.to(`channel:${channelId}`).emit('userLeftChannel', { userId, channelId });
      socket.emit('leftChannel', { channelId });
    });

    // SEND MESSAGE
    socket.on('sendMessage', async (payload = {}) => {
      const { channelId, body, attachments } = payload;
      if (!channelId || (!body && !attachments)) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      // 👇 ADD THESE DEBUG LOGS 👇
  console.log('----------------DEBUG----------------');
  console.log('1. Payload Attachments:', attachments);
  console.log('2. Schema Definition:', Message.schema.path('attachments').instance);
  console.log('3. Schema Caster:', Message.schema.path('attachments').caster.instance);
  console.log('-------------------------------------');
      try {
        const channel = await Channel.findById(channelId);
        if (!channel) return socket.emit('error', { code: 'CHANNEL_NOT_FOUND' });
        if (String(channel.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
        if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' });
        if (channel.type !== 'public') {
          const isMember = (channel.members || []).some((m) => String(m) === userId);
          if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
        }

        // persist message
        const msg = await Message.create({
          organizationId: channel.organizationId,
          channelId: channel._id,
          senderId: socket.user._id,
          body: body ? String(body).trim() : '',
          attachments: Array.isArray(attachments) ? attachments : [],
        });

        // emit to channel
        io.to(`channel:${channelId}`).emit('newMessage', msg);

        // emit lightweight channel activity to org room (optional)
        io.to(`org:${orgId}`).emit('channelActivity', { channelId, lastMessage: { _id: msg._id, body: msg.body, createdAt: msg.createdAt, senderId: msg.senderId } });
      } catch (err) {
        console.error('sendMessage err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // TYPING INDICATOR
    socket.on('typing', ({ channelId, typing } = {}) => {
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit('userTyping', { userId, channelId, typing: !!typing });
    });

    // READ RECEIPTS (mark messages as read by this user)
    socket.on('markRead', async ({ channelId, messageIds } = {}) => {
      if (!channelId) return;
      try {
        const filter = { channelId };
        if (Array.isArray(messageIds) && messageIds.length) filter._id = { $in: messageIds };

        await Message.updateMany({ ...filter, readBy: { $ne: socket.user._id } }, { $push: { readBy: socket.user._id } });

        socket.to(`channel:${channelId}`).emit('readReceipt', { userId, channelId, messageIds: Array.isArray(messageIds) ? messageIds : null });
      } catch (err) {
        console.error('markRead err', err);
      }
    });

    // FETCH MESSAGES (via socket)
    socket.on('fetchMessages', async ({ channelId, before, limit = 50 } = {}) => {
      if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      try {
        const filter = { channelId };
        if (before) filter.createdAt = { $lt: new Date(before) };
        const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
        socket.emit('messages', { channelId, messages });
      } catch (err) {
        console.error('fetchMessages err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ADMIN ACTION: force disconnect a user (owner/admin only)
    socket.on('admin:forceDisconnect', async ({ targetUserId } = {}) => {
      if (!targetUserId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      try {
        const actor = await User.findById(socket.user._id).select('role organizationId').lean();
        if (!actor) return socket.emit('error', { code: 'NOT_AUTH' });
        if (String(actor.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
        // adapt this role check to your Role model specifics
        if (!['superadmin', 'admin', 'owner'].includes(String(actor.role))) return socket.emit('error', { code: 'FORBIDDEN' });

        const sockets = getSocketIdsForUser(targetUserId);
        for (const sId of sockets) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.emit('forceLogout', { reason: 'disabled_by_admin' });
            s.disconnect(true);
          }
        }
      } catch (err) {
        console.error('admin:forceDisconnect err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // CLEANUP on disconnect
    socket.on('disconnect', (reason) => {
      // remove socket registration
      removeSocketForUser(userId, socket.id);

      // Remove user from channelPresence for any channels they were in, broadcast leave
      for (const [chId, set] of Array.from(channelPresence.entries())) {
        if (set.has(userId)) {
          set.delete(userId);
          io.to(`channel:${chId}`).emit('userLeftChannel', { userId, channelId: chId });
          if (set.size === 0) channelPresence.delete(chId);
        }
      }

      // If no sockets left for this user -> mark offline in org and broadcast
      if (getSocketIdsForUser(userId).length === 0) {
        removeOrgOnlineUser(orgId, userId);
        io.to(`org:${orgId}`).emit('userOffline', { userId });
      }

      // debug
      // console.log(`socket disconnected: ${socket.id} user:${userId} reason:${reason}`);
    });
  });

  return io;
}

/**
 * Helpers to emit from server-side controllers
 */
function emitToOrg(organizationId, event, payload) {
  if (!io) return;
  io.to(`org:${organizationId}`).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  const socketIds = getSocketIdsForUser(userId);
  for (const sId of socketIds) {
    io.to(sId).emit(event, payload);
  }
}

function forceDisconnectUser(userId) {
  if (!io) return;
  const socketIds = getSocketIdsForUser(userId);
  for (const sId of socketIds) {
    const s = io.sockets.sockets.get(sId);
    if (s) {
      s.emit('forceLogout', { reason: 'forced_by_server' });
      s.disconnect(true);
    }
  }
}

module.exports = { init, emitToOrg, emitToUser, forceDisconnectUser, getIo: () => io };

// // FILE: src/utils/socket.js
// // Complete Socket.IO server with auth, channel & message events, admin actions, and multi-socket support
// const jwt = require('jsonwebtoken');
// const { Server } = require('socket.io');
// const Channel = require('../models/channelModel');
// const Message = require('../models/messageModel');
// const User = require('../models/userModel');

// let io = null;

// // Map userId -> Set of socketIds (supports multiple devices per user)
// const activeUsers = new Map();

// function addActiveSocket(userId, socketId) {
//   const set = activeUsers.get(String(userId)) || new Set();
//   set.add(socketId);
//   activeUsers.set(String(userId), set);
// }

// function removeActiveSocket(userId, socketId) {
//   const set = activeUsers.get(String(userId));
//   if (!set) return;
//   set.delete(socketId);
//   if (set.size === 0) activeUsers.delete(String(userId));
//   else activeUsers.set(String(userId), set);
// }

// function getSocketsByUserId(userId) {
//   const set = activeUsers.get(String(userId));
//   return set ? Array.from(set) : [];
// }

// function init(server, { cors, redisUrl, jwtSecret, pingTimeout = 30000 } = {}) {
//   if (io) return io;

//   io = new Server(server, {
//     cors: cors || { origin: '*' },
//     transports: ['websocket', 'polling'],
//     pingTimeout,
//   });

//   // Optional Redis adapter for horizontal scaling
//   if (redisUrl) {
//     const { createClient } = require('redis');
//     const { createAdapter } = require('@socket.io/redis-adapter');
//     const pubClient = createClient({ url: redisUrl });
//     const subClient = pubClient.duplicate();
//     Promise.all([pubClient.connect(), subClient.connect()])
//       .then(() => io.adapter(createAdapter(pubClient, subClient)))
//       .catch(err => console.error('Redis adapter error:', err));
//   }

//   // Authentication middleware (strict — reject if token invalid)
//   io.use(async (socket, next) => {
//     try {
//       const token = socket.handshake.auth?.token || socket.handshake.query?.token;
//       if (!token) return next(new Error('auth required'));

//       const secret = jwtSecret || process.env.JWT_SECRET;
//       const payload = jwt.verify(token, secret);

//       // Minimal payload validation
//       if (!payload || !payload.sub || !payload.organizationId) return next(new Error('invalid token'));

//       // Attach minimal user info to socket; full user can be loaded later if needed
//       socket.user = {
//         _id: payload.sub,
//         email: payload.email,
//         organizationId: payload.organizationId,
//         role: payload.role || 'member',
//       };

//       return next();
//     } catch (err) {
//       return next(new Error('auth failed'));
//     }
//   });

//   io.on('connection', (socket) => {
//     // register socket
//     addActiveSocket(socket.user._id, socket.id);
//     console.log(`Socket connected: ${socket.id} user:${socket.user._id}`);

//     // automatic room: organization-wide
//     const orgRoom = `org:${socket.user.organizationId}`;
//     socket.join(orgRoom);

//     // Provide an event to explicitly register (backwards compatibility)
//     socket.on('registerUser', (userId) => {
//       if (!userId) return;
//       addActiveSocket(userId, socket.id);
//     });

//     // --- JOIN CHANNEL ---
//     socket.on('joinChannel', async ({ channelId } = {}) => {
//       if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'channelId required' });
//       try {
//         const channel = await Channel.findById(channelId).lean();
//         if (!channel) return socket.emit('error', { code: 'NOT_FOUND', message: 'channel not found' });
//         if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' , message: 'channel disabled'});
//         if (String(channel.organizationId) !== String(socket.user.organizationId)) return socket.emit('error', { code: 'INVALID_ORG' });

//         if (channel.type !== 'public') {
//           const isMember = (channel.members || []).some(m => String(m) === String(socket.user._id));
//           if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
//         }

//         socket.join(`channel:${channelId}`);
//         socket.emit('joinedChannel', { channelId });
//       } catch (err) {
//         console.error('joinChannel err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // --- LEAVE CHANNEL ---
//     socket.on('leaveChannel', ({ channelId } = {}) => {
//       if (!channelId) return;
//       socket.leave(`channel:${channelId}`);
//       socket.emit('leftChannel', { channelId });
//     });

//     // --- SEND MESSAGE ---
//     socket.on('sendMessage', async (payload = {}) => {
//       const { channelId, body, attachments } = payload;
//       if (!channelId || (typeof body !== 'string' && !attachments)) return socket.emit('error', { code: 'INVALID_PAYLOAD' });

//       try {
//         const channel = await Channel.findById(channelId);
//         if (!channel) return socket.emit('error', { code: 'NOT_FOUND' });
//         if (String(channel.organizationId) !== String(socket.user.organizationId)) return socket.emit('error', { code: 'INVALID_ORG' });
//         if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' });
//         if (channel.type !== 'public') {
//           const isMember = (channel.members || []).some(m => String(m) === String(socket.user._id));
//           if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
//         }

//         // Persist message first
//         const msg = await Message.create({
//           organizationId: channel.organizationId,
//           channelId: channel._id,
//           senderId: socket.user._id,
//           body: body ? body.trim() : '',
//           attachments: attachments || [],
//         });

//         // Emit to channel room
//         io.to(`channel:${channelId}`).emit('newMessage', msg);

//         // Optionally emit organization-level summary/update
//         io.to(orgRoom).emit('channelActivity', { channelId, lastMessage: msg });
//       } catch (err) {
//         console.error('sendMessage err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // --- TYPING INDICATOR ---
//     socket.on('typing', ({ channelId, typing } = {}) => {
//       if (!channelId) return;
//       socket.to(`channel:${channelId}`).emit('userTyping', { userId: socket.user._id, channelId, typing: !!typing });
//     });

//     // --- READ RECEIPTS: mark one or many messages as read by this user ---
//     socket.on('markRead', async ({ channelId, messageIds } = {}) => {
//       try {
//         if (!channelId) return;
//         const filter = { channelId };
//         if (Array.isArray(messageIds) && messageIds.length) filter._id = { $in: messageIds };

//         await Message.updateMany(
//           { ...filter, readBy: { $ne: socket.user._id } },
//           { $push: { readBy: socket.user._id } }
//         );

//         socket.to(`channel:${channelId}`).emit('readReceipt', { userId: socket.user._id, channelId, messageIds });
//       } catch (err) {
//         console.error('markRead err', err);
//       }
//     });

//     // --- FETCH RECENT MESSAGES (socket-friendly) ---
//     socket.on('fetchMessages', async ({ channelId, before, limit = 50 } = {}) => {
//       try {
//         if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
//         const filter = { channelId };
//         if (before) filter.createdAt = { $lt: new Date(before) };
//         const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
//         socket.emit('messages', { channelId, messages });
//       } catch (err) {
//         console.error('fetchMessages err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // --- ADMIN ACTIONS: force disconnect user(s) ---
//     socket.on('admin:forceDisconnect', async ({ targetUserId } = {}) => {
//       // Quick role check – load user from DB to check org and role
//       try {
//         const actor = await User.findById(socket.user._id).select('role organizationId');
//         if (!actor) return socket.emit('error', { code: 'NOT_AUTH' });
//         // Only allow owner or admin to use this
//         if (String(actor.organizationId) !== String(socket.user.organizationId)) return socket.emit('error', { code: 'INVALID_ORG' });

//         // Replace below with your real role check; here we allow if actor.role equals 'superadmin' or 'admin'
//         if (!['superadmin','admin','owner'].includes(actor.role)) return socket.emit('error', { code: 'FORBIDDEN' });

//         const sockets = getSocketsByUserId(targetUserId);
//         for (const sId of sockets) {
//           const s = io.sockets.sockets.get(sId);
//           if (s) {
//             s.emit('forceLogout', { reason: 'disabled_by_admin' });
//             s.disconnect(true);
//           }
//         }
//       } catch (err) {
//         console.error('forceDisconnect err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // Disconnect cleanup
//     socket.on('disconnect', (reason) => {
//       removeActiveSocket(socket.user._id, socket.id);
//       console.log(`Socket disconnected: ${socket.id} reason:${reason}`);
//     });
//   });

//   return io;
// }

// // Helper: emit to organization room
// function emitToOrg(organizationId, event, payload) {
//   if (!io) return;
//   io.to(`org:${organizationId}`).emit(event, payload);
// }

// // Helper: emit to user on all active sockets
// function emitToUser(userId, event, payload) {
//   if (!io) return;
//   const sockets = getSocketsByUserId(userId);
//   for (const sId of sockets) {
//     io.to(sId).emit(event, payload);
//   }
// }

// // Helper: force disconnect user
// function forceDisconnectUser(userId) {
//   if (!io) return;
//   const sockets = getSocketsByUserId(userId);
//   for (const sId of sockets) {
//     const s = io.sockets.sockets.get(sId);
//     if (s) {
//       s.emit('forceLogout', { reason: 'forced_by_server' });
//       s.disconnect(true);
//     }
//   }
// }

// module.exports = { init, emitToOrg, emitToUser, forceDisconnectUser, getIo: () => io };


// // // src/utils/socket.js
// // const jwt = require('jsonwebtoken');
// // const { Server } = require('socket.io');

// // let io = null;

// // // Map to track specific users: userId -> socketId
// // const activeUsers = new Map(); 

// // function init(server, { cors, redisUrl, jwtSecret }) {
// //   if (io) return io;

// //   io = new Server(server, { 
// //     cors: cors || { origin: '*' },
// //     transports: ['websocket', 'polling']
// //   });

// //   // (Optional) Redis Adapter Setup
// //   if (redisUrl) {
// //     const { createClient } = require('redis');
// //     const { createAdapter } = require('@socket.io/redis-adapter');
// //     const pubClient = createClient({ url: redisUrl });
// //     const subClient = pubClient.duplicate();
// //     Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
// //       io.adapter(createAdapter(pubClient, subClient));
// //       console.log('✅ Socket.IO Redis adapter connected');
// //     }).catch(err => console.error('❌ Redis adapter error:', err));
// //   }

// //   // --- Middleware: Authentication ---
// //   io.use((socket, next) => {
// //     try {
// //       // 1. Check for token in handshake auth
// //       const token = socket.handshake.auth?.token;
      
// //       if (!token) {
// //         // Option: return next(new Error("Authentication error")); to force auth
// //         return next(); 
// //       }

// //       const secret = jwtSecret || process.env.JWT_SECRET;
// //       const payload = jwt.verify(token, secret);
// //       socket.user = payload; // Attach user data to socket
// //       return next();
// //     } catch (err) {
// //       console.warn("⚠️ Socket Auth Failed:", err.message);
// //       return next(); // Proceed as guest, or next(err) to block
// //     }
// //   });

// //   // --- Connection Logic ---
// //   io.on('connection', (socket) => {
// //     console.log(`⚡ Client connected: ${socket.id}`);

// //     // A. Register User (for 1-on-1 messages like Force Logout)
// //     socket.on('registerUser', (userId) => {
// //       if (!userId) return;
// //       activeUsers.set(userId, socket.id);
// //       console.log(`👤 User registered: ${userId}`);
// //     });

// //     // B. Join Organization Room (for Group Notifications)
// //     socket.on('joinOrg', ({ organizationId }) => {
// //       // Security Check: Ensure token matches requested org
// //       if (socket.user && String(socket.user.organizationId) !== String(organizationId)) {
// //          console.warn(`⚠️ User ${socket.user._id} tried to join wrong org ${organizationId}`);
// //          return; 
// //       }
      
// //       const roomName = `org:${organizationId}`;
// //       socket.join(roomName);
// //       console.log(`🏢 Socket ${socket.id} joined room: ${roomName}`);
// //     });

// //     // C. Disconnect Cleanup
// //     socket.on('disconnect', () => {
// //       // Remove from activeUsers map
// //       for (const [userId, socketId] of activeUsers.entries()) {
// //         if (socketId === socket.id) {
// //           activeUsers.delete(userId);
// //           break;
// //         }
// //       }
// //     });
// //   });

// //   return io;
// // }

// // // --- Helper: Send to entire Organization ---
// // function emitToOrg(organizationId, event, payload) {
// //   if (!io) {
// //     console.warn("⚠️ Socket.IO not initialized, cannot emit.");
// //     return;
// //   }
// //   io.to(`org:${organizationId}`).emit(event, payload);
// // }

// // // --- Helper: Send to specific User (e.g. Force Logout) ---
// // function emitToUser(userId, event, payload) {
// //   if (!io) return;
// //   const socketId = activeUsers.get(userId);
// //   if (socketId) {
// //     io.to(socketId).emit(event, payload);
// //   }
// // }

// // module.exports = { init, emitToOrg, emitToUser, getIo: () => io };
