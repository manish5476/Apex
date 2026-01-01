// src/utils/socket.js
'use strict';

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const Channel = require('../models/channelModel');
const Message = require('../models/messageModel');
const User = require('../models/userModel');

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

  // Strict auth middleware: token required via AUTH OBJECT only
  io.use((socket, next) => {
    try {
      // 🔒 SECURITY FIX: Removed `socket.handshake.query.token` support
      // Query params are logged in plain text in server access logs.
      const token = socket.handshake.auth?.token;
      
      if (!token) return next(new Error('auth required (token missing in handshake.auth)'));
      
      const secret = jwtSecret || process.env.JWT_SECRET;
      const payload = jwt.verify(token, secret);

      if (!payload || !payload.sub || !payload.organizationId) {
        return next(new Error('invalid token payload'));
      }

      // attach minimal user info
      socket.user = {
        _id: payload.sub,
        email: payload.email,
        organizationId: payload.organizationId,
        role: payload.role || 'member',
      };

      // ✨ OPTIMIZATION: Initialize Set to track channels this specific socket joins
      socket.joinedChannels = new Set();

      return next();
    } catch (err) {
      return next(new Error('auth failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user._id);
    const orgId = String(socket.user.organizationId);
    
    console.log(`🔌 Socket Connected: ${socket.id}`);
    
    // register socket
    addSocketForUser(userId, socket.id);

    // mark user online for org (only when first socket connects)
    if (getSocketIdsForUser(userId).length === 1) {
      addOrgOnlineUser(orgId, userId);
      io.to(`org:${orgId}`).emit('userOnline', { userId });
    }

    // automatically join organization room for org-wide broadcasts
    socket.join(`org:${orgId}`);

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

        // ✨ OPTIMIZATION: Track this channel on the socket instance
        socket.joinedChannels.add(channelId);

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
      if (socket.joinedChannels) socket.joinedChannels.delete(channelId);

      removeUserFromChannel(channelId, userId);
      io.to(`channel:${channelId}`).emit('userLeftChannel', { userId, channelId });
      socket.emit('leftChannel', { channelId });
    });

    // SEND MESSAGE
    socket.on('sendMessage', async (payload = {}) => {
      const { channelId, body, attachments } = payload;
      if (!channelId || (!body && !attachments)) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      
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
        io.to(`org:${orgId}`).emit('channelActivity', { 
            channelId, 
            lastMessage: { 
                _id: msg._id, 
                body: msg.body, 
                createdAt: msg.createdAt, 
                senderId: msg.senderId 
            } 
        });
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

    // READ RECEIPTS
    socket.on('markRead', async ({ channelId, messageIds } = {}) => {
      if (!channelId) return;
      try {
        const filter = { channelId };
        if (Array.isArray(messageIds) && messageIds.length) filter._id = { $in: messageIds };

        await Message.updateMany(
            { ...filter, readBy: { $ne: socket.user._id } }, 
            { $push: { readBy: socket.user._id } }
        );

        socket.to(`channel:${channelId}`).emit('readReceipt', { userId, channelId, messageIds: Array.isArray(messageIds) ? messageIds : null });
      } catch (err) {
        console.error('markRead err', err);
      }
    });

    // FETCH MESSAGES
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

    // ADMIN ACTION: force disconnect
    socket.on('admin:forceDisconnect', async ({ targetUserId } = {}) => {
      if (!targetUserId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      try {
        const actor = await User.findById(socket.user._id).select('role organizationId').lean();
        if (!actor) return socket.emit('error', { code: 'NOT_AUTH' });
        if (String(actor.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
        
        if (!['superadmin', 'admin', 'owner'].includes(String(actor.role))) {
            return socket.emit('error', { code: 'FORBIDDEN' });
        }

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

      // ✨ OPTIMIZATION: Use the Set on the socket to clean up efficiently (O(1))
      // instead of iterating the entire global channel map.
      if (socket.joinedChannels) {
        for (const chId of socket.joinedChannels) {
            // Remove user from the global presence map
            removeUserFromChannel(chId, userId);
            
            // Broadcast to others in that channel
            io.to(`channel:${chId}`).emit('userLeftChannel', { userId, channelId: chId });
        }
        socket.joinedChannels.clear();
      }

      // If no sockets left for this user -> mark offline in org and broadcast
      if (getSocketIdsForUser(userId).length === 0) {
        removeOrgOnlineUser(orgId, userId);
        io.to(`org:${orgId}`).emit('userOffline', { userId });
      }
    });
  });

  return io;
}

/**
 * Helpers to emit from server-side controllers
 */
function emitToOrg(organizationId, event, payload) {
  if (!io) {
    console.error('❌ SOCKET ERROR: io is not initialized yet! Cannot emit to Org.');
    return;
  }
  io.to(`org:${organizationId}`).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (!io) {
    console.error('❌ SOCKET ERROR: io is not initialized yet! Cannot emit to User.');
    return;
  }
  const socketIds = getSocketIdsForUser(userId);
  for (const sId of socketIds) {
    io.to(sId).emit(event, payload);
  }
}

function emitToUsers(userIds, event, payload) {
  if (!io || !Array.isArray(userIds)) return;
  
  const emittedSockets = new Set();
  
  userIds.forEach(userId => {
    const socketIds = getSocketIdsForUser(userId);
    socketIds.forEach(socketId => {
      if (!emittedSockets.has(socketId)) {
        emittedSockets.add(socketId);
        io.to(socketId).emit(event, payload);
      }
    });
  });
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

module.exports = { 
  init, 
  emitToOrg, 
  emitToUser, 
  emitToUsers,
  forceDisconnectUser, 
  getIo: () => io 
};

// // src/utils/socket.js
// 'use strict';

// const jwt = require('jsonwebtoken');
// const { Server } = require('socket.io');

// const Channel = require('../models/channelModel');
// const Message = require('../models/messageModel');
// const User = require('../models/userModel');

// let io = null;

// /**
//  * Data structures
//  * - activeSockets: userId -> Set(socketId)
//  * - orgOnlineUsers: orgId -> Set(userId)
//  * - channelPresence: channelId -> Set(userId)
//  */
// const activeSockets = new Map();
// const orgOnlineUsers = new Map();
// const channelPresence = new Map();

// function addSocketForUser(userId, socketId) {
//   const key = String(userId);
//   const set = activeSockets.get(key) || new Set();
//   set.add(socketId);
//   activeSockets.set(key, set);
// }

// function removeSocketForUser(userId, socketId) {
//   const key = String(userId);
//   const set = activeSockets.get(key);
//   if (!set) return;
//   set.delete(socketId);
//   if (set.size === 0) activeSockets.delete(key);
//   else activeSockets.set(key, set);
// }

// function getSocketIdsForUser(userId) {
//   const set = activeSockets.get(String(userId));
//   return set ? Array.from(set) : [];
// }

// function addOrgOnlineUser(orgId, userId) {
//   const key = String(orgId);
//   if (!orgOnlineUsers.has(key)) orgOnlineUsers.set(key, new Set());
//   orgOnlineUsers.get(key).add(String(userId));
// }

// function removeOrgOnlineUser(orgId, userId) {
//   const key = String(orgId);
//   const set = orgOnlineUsers.get(key);
//   if (!set) return;
//   set.delete(String(userId));
//   if (set.size === 0) orgOnlineUsers.delete(key);
// }

// function addUserToChannel(channelId, userId) {
//   const key = String(channelId);
//   if (!channelPresence.has(key)) channelPresence.set(key, new Set());
//   channelPresence.get(key).add(String(userId));
// }

// function removeUserFromChannel(channelId, userId) {
//   const key = String(channelId);
//   const set = channelPresence.get(key);
//   if (!set) return;
//   set.delete(String(userId));
//   if (set.size === 0) channelPresence.delete(key);
// }

// function getUsersInChannel(channelId) {
//   const set = channelPresence.get(String(channelId));
//   return set ? Array.from(set) : [];
// }

// /**
//  * Initialize Socket.IO server
//  * server: http.Server instance
//  * options: { cors, redisUrl, jwtSecret, pingTimeout }
//  */
// function init(server, options = {}) {
//   if (io) return io;

//   const { cors, redisUrl, jwtSecret, pingTimeout = 30000 } = options;

//   io = new Server(server, {
//     cors: cors || { origin: '*' },
//     transports: ['websocket', 'polling'],
//     pingTimeout,
//   });

//   // Optional Redis adapter for scaling
//   if (redisUrl) {
//     try {
//       const { createClient } = require('redis');
//       const { createAdapter } = require('@socket.io/redis-adapter');
//       const pubClient = createClient({ url: redisUrl });
//       const subClient = pubClient.duplicate();
//       Promise.all([pubClient.connect(), subClient.connect()])
//         .then(() => {
//           io.adapter(createAdapter(pubClient, subClient));
//           console.log('✅ Socket.IO Redis adapter connected');
//         })
//         .catch((err) => console.error('❌ Redis adapter error:', err));
//     } catch (err) {
//       console.error('Redis adapter setup failed:', err);
//     }
//   }

//   // Strict auth middleware: token required via AUTH OBJECT only
//   io.use((socket, next) => {
//     try {
//       // 🔒 SECURITY FIX: Removed `socket.handshake.query.token` support
//       // Query params are logged in plain text in server access logs.
//       const token = socket.handshake.auth?.token;
      
//       if (!token) return next(new Error('auth required (token missing in handshake.auth)'));
      
//       const secret = jwtSecret || process.env.JWT_SECRET;
//       const payload = jwt.verify(token, secret);

//       if (!payload || !payload.sub || !payload.organizationId) {
//         return next(new Error('invalid token payload'));
//       }

//       // attach minimal user info
//       socket.user = {
//         _id: payload.sub,
//         email: payload.email,
//         organizationId: payload.organizationId,
//         role: payload.role || 'member',
//       };

//       // ✨ OPTIMIZATION: Initialize Set to track channels this specific socket joins
//       socket.joinedChannels = new Set();

//       return next();
//     } catch (err) {
//       return next(new Error('auth failed'));
//     }
//   });

//   io.on('connection', (socket) => {
//     const userId = String(socket.user._id);
//     const orgId = String(socket.user.organizationId);
    
//     console.log(`🔌 Socket Connected: ${socket.id}`);
    
//     // register socket
//     addSocketForUser(userId, socket.id);

//     // mark user online for org (only when first socket connects)
//     if (getSocketIdsForUser(userId).length === 1) {
//       addOrgOnlineUser(orgId, userId);
//       io.to(`org:${orgId}`).emit('userOnline', { userId });
//     }

//     // automatically join organization room for org-wide broadcasts
//     socket.join(`org:${orgId}`);

//     // BACKWARDS COMPATIBILITY: registerUser event (optional)
//     socket.on('registerUser', (registerUserId) => {
//       if (!registerUserId) return;
//       addSocketForUser(registerUserId, socket.id);
//     });

//     // JOIN ORG room explicitly (keeps security check)
//     socket.on('joinOrg', ({ organizationId } = {}) => {
//       if (!organizationId) return;
//       if (String(organizationId) !== orgId) {
//         return socket.emit('error', { code: 'INVALID_ORG', message: 'Organization mismatch' });
//       }
//       socket.join(`org:${organizationId}`);
//     });

//     // JOIN CHANNEL
//     socket.on('joinChannel', async ({ channelId } = {}) => {
//       if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
//       try {
//         const channel = await Channel.findById(channelId).lean();
//         if (!channel) return socket.emit('error', { code: 'CHANNEL_NOT_FOUND' });
//         if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' });
//         if (String(channel.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });

//         if (channel.type !== 'public') {
//           const isMember = (channel.members || []).some((m) => String(m) === userId);
//           if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
//         }

//         socket.join(`channel:${channelId}`);

//         // ✨ OPTIMIZATION: Track this channel on the socket instance
//         socket.joinedChannels.add(channelId);

//         // add to channel presence and broadcast join
//         addUserToChannel(channelId, userId);
//         socket.to(`channel:${channelId}`).emit('userJoinedChannel', { userId, channelId });

//         // send current present users to the joiner
//         const present = getUsersInChannel(channelId);
//         socket.emit('channelUsers', { channelId, users: present });
//       } catch (err) {
//         console.error('joinChannel err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // LEAVE CHANNEL
//     socket.on('leaveChannel', ({ channelId } = {}) => {
//       if (!channelId) return;
      
//       socket.leave(`channel:${channelId}`);
//       if (socket.joinedChannels) socket.joinedChannels.delete(channelId);

//       removeUserFromChannel(channelId, userId);
//       io.to(`channel:${channelId}`).emit('userLeftChannel', { userId, channelId });
//       socket.emit('leftChannel', { channelId });
//     });

//     // SEND MESSAGE
//     socket.on('sendMessage', async (payload = {}) => {
//       const { channelId, body, attachments } = payload;
//       if (!channelId || (!body && !attachments)) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      
//       try {
//         const channel = await Channel.findById(channelId);
//         if (!channel) return socket.emit('error', { code: 'CHANNEL_NOT_FOUND' });
//         if (String(channel.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
//         if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' });
        
//         if (channel.type !== 'public') {
//           const isMember = (channel.members || []).some((m) => String(m) === userId);
//           if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
//         }

//         // persist message
//         const msg = await Message.create({
//           organizationId: channel.organizationId,
//           channelId: channel._id,
//           senderId: socket.user._id,
//           body: body ? String(body).trim() : '',
//           attachments: Array.isArray(attachments) ? attachments : [],
//         });

//         // emit to channel
//         io.to(`channel:${channelId}`).emit('newMessage', msg);

//         // emit lightweight channel activity to org room (optional)
//         io.to(`org:${orgId}`).emit('channelActivity', { 
//             channelId, 
//             lastMessage: { 
//                 _id: msg._id, 
//                 body: msg.body, 
//                 createdAt: msg.createdAt, 
//                 senderId: msg.senderId 
//             } 
//         });
//       } catch (err) {
//         console.error('sendMessage err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // TYPING INDICATOR
//     socket.on('typing', ({ channelId, typing } = {}) => {
//       if (!channelId) return;
//       socket.to(`channel:${channelId}`).emit('userTyping', { userId, channelId, typing: !!typing });
//     });

//     // READ RECEIPTS
//     socket.on('markRead', async ({ channelId, messageIds } = {}) => {
//       if (!channelId) return;
//       try {
//         const filter = { channelId };
//         if (Array.isArray(messageIds) && messageIds.length) filter._id = { $in: messageIds };

//         await Message.updateMany(
//             { ...filter, readBy: { $ne: socket.user._id } }, 
//             { $push: { readBy: socket.user._id } }
//         );

//         socket.to(`channel:${channelId}`).emit('readReceipt', { userId, channelId, messageIds: Array.isArray(messageIds) ? messageIds : null });
//       } catch (err) {
//         console.error('markRead err', err);
//       }
//     });

//     // FETCH MESSAGES
//     socket.on('fetchMessages', async ({ channelId, before, limit = 50 } = {}) => {
//       if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
//       try {
//         const filter = { channelId };
//         if (before) filter.createdAt = { $lt: new Date(before) };
//         const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
//         socket.emit('messages', { channelId, messages });
//       } catch (err) {
//         console.error('fetchMessages err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // ADMIN ACTION: force disconnect
//     socket.on('admin:forceDisconnect', async ({ targetUserId } = {}) => {
//       if (!targetUserId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
//       try {
//         const actor = await User.findById(socket.user._id).select('role organizationId').lean();
//         if (!actor) return socket.emit('error', { code: 'NOT_AUTH' });
//         if (String(actor.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
        
//         if (!['superadmin', 'admin', 'owner'].includes(String(actor.role))) {
//             return socket.emit('error', { code: 'FORBIDDEN' });
//         }

//         const sockets = getSocketIdsForUser(targetUserId);
//         for (const sId of sockets) {
//           const s = io.sockets.sockets.get(sId);
//           if (s) {
//             s.emit('forceLogout', { reason: 'disabled_by_admin' });
//             s.disconnect(true);
//           }
//         }
//       } catch (err) {
//         console.error('admin:forceDisconnect err', err);
//         socket.emit('error', { code: 'SERVER_ERROR' });
//       }
//     });

//     // CLEANUP on disconnect
//     socket.on('disconnect', (reason) => {
//       // remove socket registration
//       removeSocketForUser(userId, socket.id);

//       // ✨ OPTIMIZATION: Use the Set on the socket to clean up efficiently (O(1))
//       // instead of iterating the entire global channel map.
//       if (socket.joinedChannels) {
//         for (const chId of socket.joinedChannels) {
//             // Remove user from the global presence map
//             removeUserFromChannel(chId, userId);
            
//             // Broadcast to others in that channel
//             io.to(`channel:${chId}`).emit('userLeftChannel', { userId, channelId: chId });
//         }
//         socket.joinedChannels.clear();
//       }

//       // If no sockets left for this user -> mark offline in org and broadcast
//       if (getSocketIdsForUser(userId).length === 0) {
//         removeOrgOnlineUser(orgId, userId);
//         io.to(`org:${orgId}`).emit('userOffline', { userId });
//       }
//     });
//   });

//   return io;
// }

// /**
//  * Helpers to emit from server-side controllers
//  */
// function emitToOrg(organizationId, event, payload) {
//   if (!io) {
//     console.error('❌ SOCKET ERROR: io is not initialized yet! Cannot emit to Org.');
//     return;
//   }
//   // console.log(`📢 Emitting to Room: org:${organizationId}`); 
//   io.to(`org:${organizationId}`).emit(event, payload);
// }

// function emitToUser(userId, event, payload) {
//   if (!io) {
//     console.error('❌ SOCKET ERROR: io is not initialized yet! Cannot emit to User.');
//     return;
//   }
//   const socketIds = getSocketIdsForUser(userId);
//   for (const sId of socketIds) {
//     io.to(sId).emit(event, payload);
//   }
// }

// function forceDisconnectUser(userId) {
//   if (!io) return;
//   const socketIds = getSocketIdsForUser(userId);
//   for (const sId of socketIds) {
//     const s = io.sockets.sockets.get(sId);
//     if (s) {
//       s.emit('forceLogout', { reason: 'forced_by_server' });
//       s.disconnect(true);
//     }
//   }
// }

// module.exports = { init, emitToOrg, emitToUser, forceDisconnectUser, getIo: () => io };
