'use strict';

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const Channel = require('../../../modules/organization/core/channel.model');
const Message = require('../../../modules/notification/core/message.model');
const User = require('../../../modules/auth/core/user.model');
const NotificationModel = require('../../../modules/notification/core/notification.model');

let io = null;
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

function getUserOnlineStatus(userId) {
  return activeSockets.has(String(userId));
}

function getOnlineUsersInOrg(orgId) {
  const set = orgOnlineUsers.get(String(orgId));
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
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    }
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

  // // Strict auth middleware: token required via AUTH OBJECT only
  // io.use(async (socket, next) => {
  //   try {
  //     const token = socket.handshake.auth?.token;
      
  //     if (!token) return next(new Error('auth required (token missing in handshake.auth)'));
      
  //     const secret = jwtSecret || process.env.JWT_SECRET;
  //     const payload = jwt.verify(token, secret);

  //     if (!payload || !payload.sub || !payload.organizationId) {
  //       return next(new Error('invalid token payload'));
  //     }

  //     // Verify user exists and is active
  //     const user = await User.findById(payload.sub).select('_id email organizationId role isActive').lean();
  //     if (!user || !user.isActive) {
  //       return next(new Error('user not found or inactive'));
  //     }

  //     socket.user = {
  //       _id: user._id,
  //       email: user.email,
  //       organizationId: user.organizationId,
  //       role: user.role || 'member',
  //       name: user.name || user.email.split('@')[0],
  //     };

  //     // Initialize Set to track channels this specific socket joins
  //     socket.joinedChannels = new Set();

  //     return next();
  //   } catch (err) {
  //     console.error('Socket auth error:', err.message);
  //     return next(new Error('auth failed'));
  //   }
  // });
// 🟢 UPGRADED: Strict auth middleware with explicit Expiration Handling
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      
      if (!token) return next(new Error('AUTH_REQUIRED'));
      
      const secret = jwtSecret || process.env.JWT_SECRET;
      
      // Verify JWT
      let payload;
      try {
        payload = jwt.verify(token, secret);
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          // ⚠️ CRITICAL FIX: Create an error object with machine-readable data
          const expirationError = new Error('jwt expired');
          expirationError.data = { code: 'TOKEN_EXPIRED' }; 
          return next(expirationError);
        }
        return next(new Error('INVALID_TOKEN'));
      }

      if (!payload || (!payload.sub && !payload.id) || !payload.organizationId) {
        return next(new Error('INVALID_PAYLOAD'));
      }

      // Verify user exists and is active (using parallel ID check for flexibility)
      const userId = payload.sub || payload.id;
      const user = await User.findById(userId).select('_id email organizationId role isActive').lean();
      
      if (!user) return next(new Error('USER_NOT_FOUND'));
      if (!user.isActive) return next(new Error('USER_INACTIVE'));

      socket.user = {
        _id: user._id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role || 'member',
        name: user.name || user.email.split('@')[0],
      };

      // Initialize Set to track channels this specific socket joins
      socket.joinedChannels = new Set();

      return next();
    } catch (err) {
      console.error('Socket Auth System Error:', err.message);
      return next(new Error('INTERNAL_SERVER_ERROR'));
    }
  });
  
  io.on('connection', (socket) => {
    const userId = String(socket.user._id);
    const orgId = String(socket.user.organizationId);
    
    console.log(`🔌 Socket Connected: ${socket.id} - User: ${userId}`);
    
    // Register socket
    addSocketForUser(userId, socket.id);

    // Mark user online for org (only when first socket connects)
    if (getSocketIdsForUser(userId).length === 1) {
      addOrgOnlineUser(orgId, userId);
      io.to(`org:${orgId}`).emit('userOnline', { 
        userId, 
        organizationId: orgId,
        timestamp: new Date().toISOString()
      });
    }

    // Automatically join organization room for org-wide broadcasts
    socket.join(`org:${orgId}`);

    // Send initial connection data
    socket.emit('connectionEstablished', {
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    // BACKWARDS COMPATIBILITY: registerUser event (optional)
    socket.on('registerUser', (registerUserId) => {
      if (!registerUserId) return;
      addSocketForUser(registerUserId, socket.id);
    });

    // ==========================================================================
    // ORG & CHANNEL MANAGEMENT
    // ==========================================================================

    // JOIN ORG room explicitly (keeps security check)
    socket.on('joinOrg', ({ organizationId } = {}) => {
      if (!organizationId) return;
      if (String(organizationId) !== orgId) {
        return socket.emit('error', { code: 'INVALID_ORG', message: 'Organization mismatch' });
      }
      socket.join(`org:${organizationId}`);
      
      // Send current online users in org
      const onlineUsers = getOnlineUsersInOrg(orgId);
      socket.emit('orgOnlineUsers', { 
        organizationId: orgId, 
        users: onlineUsers 
      });
    });

    // GET ONLINE USERS
    socket.on('getOnlineUsers', ({ channelId } = {}) => {
      try {
        if (channelId) {
          // Get online users in a specific channel
          const onlineInChannel = getUsersInChannel(channelId)
            .filter(userId => getSocketIdsForUser(userId).length > 0);
          
          socket.emit('onlineUsersInChannel', {
            channelId,
            users: onlineInChannel
          });
        } else {
          // Get all online users in organization
          const orgUsers = getOnlineUsersInOrg(orgId);
          socket.emit('onlineUsersInOrg', {
            users: orgUsers
          });
        }
      } catch (err) {
        console.error('getOnlineUsers err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ==========================================================================
    // CHANNEL MANAGEMENT
    // ==========================================================================

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
        socket.joinedChannels.add(channelId);

        // Add to channel presence and broadcast join
        addUserToChannel(channelId, userId);
        socket.to(`channel:${channelId}`).emit('userJoinedChannel', { userId, channelId });

        // Send current present users to the joiner
        const present = getUsersInChannel(channelId);
        socket.emit('channelUsers', { channelId, users: present });

        console.log(`👥 User ${userId} joined channel ${channelId}`);

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
      
      console.log(`👋 User ${userId} left channel ${channelId}`);
    });

    // CREATE CHANNEL
    socket.on('createChannel', async (payload = {}) => {
      const { name, type = 'public', members = [] } = payload;
      
      try {
        // Validate user can create channels
        const user = await User.findById(userId).select('role').lean();
        if (!user || (type !== 'public' && !['admin', 'superadmin', 'owner'].includes(user.role))) {
          return socket.emit('error', { code: 'FORBIDDEN' });
        }

        // Use your existing channel controller logic
        const channel = await Channel.create({
          organizationId: orgId,
          name: name || (type === 'dm' ? null : `Channel-${Date.now()}`),
          type,
          members: type === 'public' ? [] : [...members, userId],
          createdBy: userId,
          isActive: true,
        });

        // Notify organization
        io.to(`org:${orgId}`).emit('channelCreated', channel);
        
        // Auto-join creator to their own private/DM channel
        if (type !== 'public') {
          socket.join(`channel:${channel._id}`);
          addUserToChannel(channel._id, userId);
        }

        socket.emit('channelCreated', channel);
        console.log(`📢 Channel created: ${channel._id} by ${userId}`);

      } catch (err) {
        console.error('createChannel err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // UPDATE CHANNEL
    socket.on('updateChannel', async (payload = {}) => {
      const { channelId, name, isActive, type } = payload;
      
      try {
        // Permission check
        const user = await User.findById(userId).select('role').lean();
        if (!['admin', 'superadmin', 'owner'].includes(user?.role)) {
          return socket.emit('error', { code: 'FORBIDDEN' });
        }

        const update = {};
        if (name !== undefined) update.name = name;
        if (isActive !== undefined) update.isActive = isActive;
        if (type !== undefined) update.type = type;

        const channel = await Channel.findByIdAndUpdate(
          channelId,
          update,
          { new: true }
        );

        if (channel) {
          io.to(`channel:${channelId}`).emit('channelUpdated', channel);
          io.to(`org:${orgId}`).emit('channelUpdated', channel);
        }
        
        socket.emit('channelUpdateSuccess', { channelId });

      } catch (err) {
        console.error('updateChannel err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ==========================================================================
    // MESSAGE HANDLING
    // ==========================================================================

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

        // Persist message
        const msg = await Message.create({
          organizationId: channel.organizationId,
          channelId: channel._id,
          senderId: socket.user._id,
          body: body ? String(body).trim() : '',
          attachments: Array.isArray(attachments) ? attachments : [],
          readBy: [userId], // Sender automatically marks as read
        });

        // Populate sender info
        const populatedMsg = await Message.findById(msg._id)
          .populate('senderId', 'name email avatar')
          .lean();

        // Emit to channel
        io.to(`channel:${channelId}`).emit('newMessage', populatedMsg);

        // Emit lightweight channel activity to org room
        io.to(`org:${orgId}`).emit('channelActivity', { 
          channelId, 
          lastMessage: { 
            _id: msg._id, 
            body: msg.body, 
            createdAt: msg.createdAt, 
            senderId: msg.senderId 
          } 
        });

        console.log(`💬 Message sent in channel ${channelId} by ${userId}`);

      } catch (err) {
        console.error('sendMessage err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // EDIT MESSAGE
    socket.on('editMessage', async (payload = {}) => {
      const { messageId, body } = payload;
      
      if (!messageId || !body) {
        return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      }
      
      try {
        const message = await Message.findById(messageId);
        if (!message) return socket.emit('error', { code: 'MESSAGE_NOT_FOUND' });
        
        // Check permissions
        if (String(message.senderId) !== String(userId)) {
          return socket.emit('error', { code: 'NOT_AUTHORIZED' });
        }
        
        // Update message
        message.body = body;
        message.editedAt = new Date();
        message.editedBy = userId;
        await message.save();

        const populatedMsg = await Message.findById(message._id)
          .populate('senderId', 'name email avatar')
          .lean();
        
        // Broadcast to channel
        io.to(`channel:${message.channelId}`).emit('messageEdited', populatedMsg);
        
        console.log(`✏️ Message edited: ${messageId} by ${userId}`);

      } catch (err) {
        console.error('editMessage err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // DELETE MESSAGE
    socket.on('deleteMessage', async (payload = {}) => {
      const { messageId } = payload;
      
      if (!messageId) {
        return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      }
      
      try {
        const message = await Message.findById(messageId);
        if (!message) return socket.emit('error', { code: 'MESSAGE_NOT_FOUND' });
        
        // Check permissions (sender or admin)
        const user = await User.findById(userId).select('role').lean();
        const isSender = String(message.senderId) === String(userId);
        const isAdmin = ['admin', 'superadmin', 'owner'].includes(user?.role);
        
        if (!isSender && !isAdmin) {
          return socket.emit('error', { code: 'NOT_AUTHORIZED' });
        }
        
        // Soft delete
        message.body = '';
        message.attachments = [];
        message.deleted = true;
        message.deletedAt = new Date();
        message.deletedBy = userId;
        await message.save();
        
        // Broadcast to channel
        io.to(`channel:${message.channelId}`).emit('messageDeleted', { 
          messageId,
          channelId: message.channelId,
          deletedBy: userId,
          timestamp: new Date().toISOString()
        });
        
        console.log(`🗑️ Message deleted: ${messageId} by ${userId}`);

      } catch (err) {
        console.error('deleteMessage err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // TYPING INDICATOR
    socket.on('typing', ({ channelId, typing } = {}) => {
      if (!channelId) return;
      socket.to(`channel:${channelId}`).emit('userTyping', { 
        userId, 
        channelId, 
        typing: !!typing,
        timestamp: new Date().toISOString()
      });
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

        socket.to(`channel:${channelId}`).emit('readReceipt', { 
          userId, 
          channelId, 
          messageIds: Array.isArray(messageIds) ? messageIds : null,
          timestamp: new Date().toISOString()
        });
        
        console.log(`👁️ Messages marked as read in channel ${channelId} by ${userId}`);

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
        
        const messages = await Message.find(filter)
          .populate('senderId', 'name email avatar')
          .sort({ createdAt: -1 })
          .limit(Number(limit))
          .lean();
          
        socket.emit('messages', { channelId, messages });
        
      } catch (err) {
        console.error('fetchMessages err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ==========================================================================
    // NOTIFICATION SYSTEM
    // ==========================================================================

    // SUBSCRIBE TO NOTIFICATIONS
    socket.on('subscribeNotifications', async () => {
      try {
        // Join notification room for this user
        socket.join(`notifications:${userId}`);
        
        // Send initial notifications
        const notifications = await NotificationModel.find({
          recipientId: userId,
          isRead: false
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
        
        socket.emit('initialNotifications', { notifications });
        
        console.log(`🔔 User ${userId} subscribed to notifications`);
        
      } catch (err) {
        console.error('subscribeNotifications err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // MARK NOTIFICATION AS READ
    socket.on('markNotificationRead', async ({ notificationId } = {}) => {
      try {
        const notification = await NotificationModel.findByIdAndUpdate(
          notificationId,
          { 
            isRead: true, 
            readAt: new Date(),
            readBy: userId
          },
          { new: true }
        ).lean();
        
        if (notification) {
          // Acknowledge to sender
          socket.emit('notificationRead', { notificationId });
          
          // If notification has a related message, update read status
          if (notification.messageId) {
            await Message.updateOne(
              { _id: notification.messageId },
              { $addToSet: { readBy: userId } }
            );
          }
        }
        
      } catch (err) {
        console.error('markNotificationRead err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });
    socket.on('sendNotification', async (payload = {}) => {
      const { recipientId, title, message, type = 'info', metadata } = payload;
      if (!recipientId || !title || !message) {
        return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      }      
      try {
        const user = await User.findById(userId).select('role').lean();
        if (!['admin', 'superadmin', 'owner'].includes(user?.role)) {
          return socket.emit('error', { code: 'FORBIDDEN' });
        }

        const notification = await NotificationModel.create({
          recipientId,
          title,
          message,
          type,
          metadata: metadata || {},
          createdBy: userId,
        });
        io.to(`notifications:${recipientId}`).emit('newNotification', notification);
        socket.emit('notificationSent', { notificationId: notification._id });
        console.log(`📨 Notification sent to ${recipientId} by ${userId}`);
      } catch (err) {
        console.error('sendNotification err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ==========================================================================
    // ANNOUNCEMENT SYSTEM
    // ==========================================================================

    // CREATE ANNOUNCEMENT
    socket.on('createAnnouncement', async (payload = {}) => {
      const { title, message, type = 'info', targetOrgId } = payload;
      
      if (!title || !message || !targetOrgId) {
        return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      }
      
      try {
        // Check permissions
        const user = await User.findById(userId).select('role').lean();
        if (!['admin', 'superadmin', 'owner'].includes(user?.role)) {
          return socket.emit('error', { code: 'FORBIDDEN' });
        }
        
        // Verify target org matches user's org (or user has cross-org permissions)
        if (String(targetOrgId) !== orgId && user.role !== 'superadmin') {
          return socket.emit('error', { code: 'FORBIDDEN' });
        }

        const announcement = {
          _id: new mongoose.Types.ObjectId(),
          title,
          message,
          type,
          senderId: userId,
          organizationId: targetOrgId,
          createdAt: new Date(),
        };

        // Save to database if you have AnnouncementModel
        // const saved = await AnnouncementModel.create(announcement);
        
        // Emit to organization
        io.to(`org:${targetOrgId}`).emit('newAnnouncement', {
          data: announcement
        });
        
        console.log(`📢 Announcement created in org ${targetOrgId} by ${userId}`);

      } catch (err) {
        console.error('createAnnouncement err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ==========================================================================
    // ADMIN ACTIONS
    // ==========================================================================

    // FORCE DISCONNECT USER
    socket.on('admin:forceDisconnect', async ({ targetUserId } = {}) => {
      if (!targetUserId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      try {
        const actor = await User.findById(userId).select('role organizationId').lean();
        if (!actor) return socket.emit('error', { code: 'NOT_AUTH' });
        if (String(actor.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
        
        if (!['superadmin', 'admin', 'owner'].includes(String(actor.role))) {
            return socket.emit('error', { code: 'FORBIDDEN' });
        }

        const sockets = getSocketIdsForUser(targetUserId);
        for (const sId of sockets) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.emit('forceLogout', { 
              reason: 'disabled_by_admin',
              timestamp: new Date().toISOString()
            });
            s.disconnect(true);
          }
        }
        
        console.log(`⚡ Admin ${userId} force-disconnected user ${targetUserId}`);
        
      } catch (err) {
        console.error('admin:forceDisconnect err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // GET SYSTEM STATS
    socket.on('admin:getStats', async () => {
      try {
        const actor = await User.findById(userId).select('role').lean();
        if (!['superadmin', 'admin', 'owner'].includes(String(actor.role))) {
          return socket.emit('error', { code: 'FORBIDDEN' });
        }

        const stats = {
          connectedUsers: activeSockets.size,
          orgOnlineUsers: orgOnlineUsers.get(orgId)?.size || 0,
          channelPresence: channelPresence.size,
          totalConnections: io.engine.clientsCount,
          timestamp: new Date().toISOString(),
        };

        socket.emit('systemStats', stats);
        
      } catch (err) {
        console.error('admin:getStats err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ==========================================================================
    // INITIAL DATA LOADING
    // ==========================================================================

    socket.on('getInitialData', async () => {
      try {
        const [channels, unreadNotifications] = await Promise.all([
          // Get user's channels
          Channel.find({
            organizationId: orgId,
            isActive: true,
            $or: [
              { type: 'public' },
              { type: { $in: ['private', 'dm'] }, members: userId }
            ]
          })
          .select('_id name type members isActive createdAt')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
          
          // Get unread notifications
          NotificationModel.countDocuments({
            recipientId: userId,
            isRead: false
          })
        ]);
        
        socket.emit('initialData', {
          channels,
          unreadCount: unreadNotifications,
          onlineUsers: getOnlineUsersInOrg(orgId),
          timestamp: new Date().toISOString()
        });
        
      } catch (err) {
        console.error('getInitialData err', err);
        socket.emit('error', { code: 'SERVER_ERROR' });
      }
    });

    // ==========================================================================
    // CLEANUP ON DISCONNECT
    // ==========================================================================

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket Disconnected: ${socket.id} - Reason: ${reason}`);
      
      // Remove socket registration
      removeSocketForUser(userId, socket.id);

      // Clean up channel presence efficiently
      if (socket.joinedChannels) {
        for (const chId of socket.joinedChannels) {
          // Remove user from the global presence map
          removeUserFromChannel(chId, userId);
          
          // Broadcast to others in that channel
          io.to(`channel:${chId}`).emit('userLeftChannel', { 
            userId, 
            channelId: chId,
            timestamp: new Date().toISOString()
          });
        }
        socket.joinedChannels.clear();
      }

      // If no sockets left for this user -> mark offline in org and broadcast
      if (getSocketIdsForUser(userId).length === 0) {
        removeOrgOnlineUser(orgId, userId);
        io.to(`org:${orgId}`).emit('userOffline', { 
          userId,
          organizationId: orgId,
          timestamp: new Date().toISOString()
        });
      }
    });

    // PING/PONG for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
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

function emitToChannel(channelId, event, payload) {
  if (!io) return;
  io.to(`channel:${channelId}`).emit(event, payload);
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

function getOnlineUsers() {
  return Array.from(activeSockets.keys());
}

function getOrgOnlineUsers(orgId) {
  const set = orgOnlineUsers.get(String(orgId));
  return set ? Array.from(set) : [];
}

module.exports = { 
  init, 
  emitToOrg, 
  emitToUser, 
  emitToUsers,
  emitToChannel,
  forceDisconnectUser,
  getOnlineUsers,
  getOrgOnlineUsers,
  getIo: () => io 
};
















// // src/utils/socket.js
// 'use strict';

// const jwt = require('jsonwebtoken');
// const { Server } = require('socket.io');

// const Channel = require('../../../modules/organization/core/channel.model');
// const Message = require('../../../modules/notification/core/message.model');
// const User = require('../../../modules/auth/core/user.model');

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

//     // Add to socket.js:
// socket.on('subscribeNotifications', async () => {
//   // Join notification room for this user
//   socket.join(`notifications:${socket.user._id}`);
  
//   // Send initial notifications if needed
//   try {
//     const NotificationModel = require('./notification.model');
//     const notifications = await NotificationModel.find({
//       recipientId: socket.user._id,
//       isRead: false
//     }).sort({ createdAt: -1 }).limit(20).lean();
    
//     socket.emit('initialNotifications', { notifications });
//   } catch (err) {
//     console.error('subscribeNotifications err', err);
//   }
// });

// socket.on('markNotificationRead', async ({ notificationId } = {}) => {
//   try {
//     const NotificationModel = require('./notification.model');
//     const notification = await NotificationModel.findByIdAndUpdate(
//       notificationId,
//       { isRead: true, readAt: new Date() },
//       { new: true }
//     ).lean();
    
//     if (notification) {
//       // Acknowledge to sender
//       socket.emit('notificationRead', { notificationId });
      
//       // If notification has a related message, update read status
//       if (notification.messageId) {
//         await Message.updateOne(
//           { _id: notification.messageId },
//           { $addToSet: { readBy: socket.user._id } }
//         );
//       }
//     }
//   } catch (err) {
//     console.error('markNotificationRead err', err);
//   }
// });

// // Add to your socket.js in the connection handler:
// socket.on('createAnnouncement', async (payload = {}) => {
//   const { title, message, type = 'info', targetOrgId } = payload;
  
//   if (!title || !message || !targetOrgId) {
//     return socket.emit('error', { code: 'INVALID_PAYLOAD' });
//   }
  
//   // Check permissions
//   const user = await User.findById(socket.user._id).select('role').lean();
//   if (!['admin', 'superadmin', 'owner'].includes(user?.role)) {
//     return socket.emit('error', { code: 'FORBIDDEN' });
//   }
  
//   const announcement = {
//     _id: new mongoose.Types.ObjectId(),
//     title,
//     message,
//     type,
//     senderId: socket.user._id,
//     createdAt: new Date(),
//   };
  
//   // Emit to organization
//   io.to(`org:${targetOrgId}`).emit('newAnnouncement', {
//     data: announcement
//   });
  
//   // Optional: Save to database
//   // await AnnouncementModel.create(announcement);
// });
// // Add to socket.js:
// socket.on('editMessage', async (payload = {}) => {
//   const { messageId, body } = payload;
  
//   if (!messageId || !body) {
//     return socket.emit('error', { code: 'INVALID_PAYLOAD' });
//   }
  
//   try {
//     const message = await Message.findById(messageId);
//     if (!message) return socket.emit('error', { code: 'MESSAGE_NOT_FOUND' });
    
//     // Check permissions
//     if (String(message.senderId) !== String(socket.user._id)) {
//       return socket.emit('error', { code: 'NOT_AUTHORIZED' });
//     }
    
//     // Update message
//     message.body = body;
//     message.editedAt = new Date();
//     await message.save();
    
//     // Broadcast to channel
//     io.to(`channel:${message.channelId}`).emit('messageEdited', message);
    
//   } catch (err) {
//     console.error('editMessage err', err);
//     socket.emit('error', { code: 'SERVER_ERROR' });
//   }
// });
// // Add to socket.js:
// socket.on('createChannel', async (payload = {}) => {
//   const { name, type = 'public', members = [] } = payload;
  
//   try {
//     // Use your existing channel controller logic
//     const channel = await Channel.create({
//       organizationId: socket.user.organizationId,
//       name,
//       type,
//       members: type === 'public' ? [] : [...members, socket.user._id],
//       createdBy: socket.user._id,
//     });
    
//     // Notify organization
//     io.to(`org:${socket.user.organizationId}`).emit('channelCreated', channel);
    
//     // Auto-join creator to their own private/DM channel
//     if (type !== 'public') {
//       socket.join(`channel:${channel._id}`);
//       addUserToChannel(channel._id, socket.user._id);
//     }
    
//     socket.emit('channelCreated', channel);
    
//   } catch (err) {
//     console.error('createChannel err', err);
//     socket.emit('error', { code: 'SERVER_ERROR' });
//   }
// });

// socket.on('updateChannel', async (payload = {}) => {
//   const { channelId, name, isActive } = payload;
  
//   // Permission check
//   const user = await User.findById(socket.user._id).select('role').lean();
//   if (!['admin', 'superadmin', 'owner'].includes(user?.role)) {
//     return socket.emit('error', { code: 'FORBIDDEN' });
//   }
  
//   const update = {};
//   if (name !== undefined) update.name = name;
//   if (isActive !== undefined) update.isActive = isActive;
  
//   const channel = await Channel.findByIdAndUpdate(
//     channelId,
//     update,
//     { new: true }
//   );
  
//   if (channel) {
//     io.to(`channel:${channelId}`).emit('channelUpdated', channel);
//   }
// });
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

// function emitToUsers(userIds, event, payload) {
//   if (!io || !Array.isArray(userIds)) return;
  
//   const emittedSockets = new Set();
  
//   userIds.forEach(userId => {
//     const socketIds = getSocketIdsForUser(userId);
//     socketIds.forEach(socketId => {
//       if (!emittedSockets.has(socketId)) {
//         emittedSockets.add(socketId);
//         io.to(socketId).emit(event, payload);
//       }
//     });
//   });
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

// module.exports = { 
//   init, 
//   emitToOrg, 
//   emitToUser, 
//   emitToUsers,
//   forceDisconnectUser, 
//   getIo: () => io 
// };
















// // // src/utils/socket.js
// // 'use strict';

// // const jwt = require('jsonwebtoken');
// // const { Server } = require('socket.io');

// // const Channel = require('../models/channelModel');
// // const Message = require('../models/messageModel');
// // const User = require('../models/userModel');

// // let io = null;

// // /**
// //  * Data structures
// //  * - activeSockets: userId -> Set(socketId)
// //  * - orgOnlineUsers: orgId -> Set(userId)
// //  * - channelPresence: channelId -> Set(userId)
// //  */
// // const activeSockets = new Map();
// // const orgOnlineUsers = new Map();
// // const channelPresence = new Map();

// // function addSocketForUser(userId, socketId) {
// //   const key = String(userId);
// //   const set = activeSockets.get(key) || new Set();
// //   set.add(socketId);
// //   activeSockets.set(key, set);
// // }

// // function removeSocketForUser(userId, socketId) {
// //   const key = String(userId);
// //   const set = activeSockets.get(key);
// //   if (!set) return;
// //   set.delete(socketId);
// //   if (set.size === 0) activeSockets.delete(key);
// //   else activeSockets.set(key, set);
// // }

// // function getSocketIdsForUser(userId) {
// //   const set = activeSockets.get(String(userId));
// //   return set ? Array.from(set) : [];
// // }

// // function addOrgOnlineUser(orgId, userId) {
// //   const key = String(orgId);
// //   if (!orgOnlineUsers.has(key)) orgOnlineUsers.set(key, new Set());
// //   orgOnlineUsers.get(key).add(String(userId));
// // }

// // function removeOrgOnlineUser(orgId, userId) {
// //   const key = String(orgId);
// //   const set = orgOnlineUsers.get(key);
// //   if (!set) return;
// //   set.delete(String(userId));
// //   if (set.size === 0) orgOnlineUsers.delete(key);
// // }

// // function addUserToChannel(channelId, userId) {
// //   const key = String(channelId);
// //   if (!channelPresence.has(key)) channelPresence.set(key, new Set());
// //   channelPresence.get(key).add(String(userId));
// // }

// // function removeUserFromChannel(channelId, userId) {
// //   const key = String(channelId);
// //   const set = channelPresence.get(key);
// //   if (!set) return;
// //   set.delete(String(userId));
// //   if (set.size === 0) channelPresence.delete(key);
// // }

// // function getUsersInChannel(channelId) {
// //   const set = channelPresence.get(String(channelId));
// //   return set ? Array.from(set) : [];
// // }

// // /**
// //  * Initialize Socket.IO server
// //  * server: http.Server instance
// //  * options: { cors, redisUrl, jwtSecret, pingTimeout }
// //  */
// // function init(server, options = {}) {
// //   if (io) return io;

// //   const { cors, redisUrl, jwtSecret, pingTimeout = 30000 } = options;

// //   io = new Server(server, {
// //     cors: cors || { origin: '*' },
// //     transports: ['websocket', 'polling'],
// //     pingTimeout,
// //   });

// //   // Optional Redis adapter for scaling
// //   if (redisUrl) {
// //     try {
// //       const { createClient } = require('redis');
// //       const { createAdapter } = require('@socket.io/redis-adapter');
// //       const pubClient = createClient({ url: redisUrl });
// //       const subClient = pubClient.duplicate();
// //       Promise.all([pubClient.connect(), subClient.connect()])
// //         .then(() => {
// //           io.adapter(createAdapter(pubClient, subClient));
// //           console.log('✅ Socket.IO Redis adapter connected');
// //         })
// //         .catch((err) => console.error('❌ Redis adapter error:', err));
// //     } catch (err) {
// //       console.error('Redis adapter setup failed:', err);
// //     }
// //   }

// //   // Strict auth middleware: token required via AUTH OBJECT only
// //   io.use((socket, next) => {
// //     try {
// //       // 🔒 SECURITY FIX: Removed `socket.handshake.query.token` support
// //       // Query params are logged in plain text in server access logs.
// //       const token = socket.handshake.auth?.token;
      
// //       if (!token) return next(new Error('auth required (token missing in handshake.auth)'));
      
// //       const secret = jwtSecret || process.env.JWT_SECRET;
// //       const payload = jwt.verify(token, secret);

// //       if (!payload || !payload.sub || !payload.organizationId) {
// //         return next(new Error('invalid token payload'));
// //       }

// //       // attach minimal user info
// //       socket.user = {
// //         _id: payload.sub,
// //         email: payload.email,
// //         organizationId: payload.organizationId,
// //         role: payload.role || 'member',
// //       };

// //       // ✨ OPTIMIZATION: Initialize Set to track channels this specific socket joins
// //       socket.joinedChannels = new Set();

// //       return next();
// //     } catch (err) {
// //       return next(new Error('auth failed'));
// //     }
// //   });

// //   io.on('connection', (socket) => {
// //     const userId = String(socket.user._id);
// //     const orgId = String(socket.user.organizationId);
    
// //     console.log(`🔌 Socket Connected: ${socket.id}`);
    
// //     // register socket
// //     addSocketForUser(userId, socket.id);

// //     // mark user online for org (only when first socket connects)
// //     if (getSocketIdsForUser(userId).length === 1) {
// //       addOrgOnlineUser(orgId, userId);
// //       io.to(`org:${orgId}`).emit('userOnline', { userId });
// //     }

// //     // automatically join organization room for org-wide broadcasts
// //     socket.join(`org:${orgId}`);

// //     // BACKWARDS COMPATIBILITY: registerUser event (optional)
// //     socket.on('registerUser', (registerUserId) => {
// //       if (!registerUserId) return;
// //       addSocketForUser(registerUserId, socket.id);
// //     });

// //     // JOIN ORG room explicitly (keeps security check)
// //     socket.on('joinOrg', ({ organizationId } = {}) => {
// //       if (!organizationId) return;
// //       if (String(organizationId) !== orgId) {
// //         return socket.emit('error', { code: 'INVALID_ORG', message: 'Organization mismatch' });
// //       }
// //       socket.join(`org:${organizationId}`);
// //     });

// //     // JOIN CHANNEL
// //     socket.on('joinChannel', async ({ channelId } = {}) => {
// //       if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
// //       try {
// //         const channel = await Channel.findById(channelId).lean();
// //         if (!channel) return socket.emit('error', { code: 'CHANNEL_NOT_FOUND' });
// //         if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' });
// //         if (String(channel.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });

// //         if (channel.type !== 'public') {
// //           const isMember = (channel.members || []).some((m) => String(m) === userId);
// //           if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
// //         }

// //         socket.join(`channel:${channelId}`);

// //         // ✨ OPTIMIZATION: Track this channel on the socket instance
// //         socket.joinedChannels.add(channelId);

// //         // add to channel presence and broadcast join
// //         addUserToChannel(channelId, userId);
// //         socket.to(`channel:${channelId}`).emit('userJoinedChannel', { userId, channelId });

// //         // send current present users to the joiner
// //         const present = getUsersInChannel(channelId);
// //         socket.emit('channelUsers', { channelId, users: present });
// //       } catch (err) {
// //         console.error('joinChannel err', err);
// //         socket.emit('error', { code: 'SERVER_ERROR' });
// //       }
// //     });

// //     // LEAVE CHANNEL
// //     socket.on('leaveChannel', ({ channelId } = {}) => {
// //       if (!channelId) return;
      
// //       socket.leave(`channel:${channelId}`);
// //       if (socket.joinedChannels) socket.joinedChannels.delete(channelId);

// //       removeUserFromChannel(channelId, userId);
// //       io.to(`channel:${channelId}`).emit('userLeftChannel', { userId, channelId });
// //       socket.emit('leftChannel', { channelId });
// //     });

// //     // SEND MESSAGE
// //     socket.on('sendMessage', async (payload = {}) => {
// //       const { channelId, body, attachments } = payload;
// //       if (!channelId || (!body && !attachments)) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
      
// //       try {
// //         const channel = await Channel.findById(channelId);
// //         if (!channel) return socket.emit('error', { code: 'CHANNEL_NOT_FOUND' });
// //         if (String(channel.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
// //         if (!channel.isActive) return socket.emit('error', { code: 'CHANNEL_DISABLED' });
        
// //         if (channel.type !== 'public') {
// //           const isMember = (channel.members || []).some((m) => String(m) === userId);
// //           if (!isMember) return socket.emit('error', { code: 'NOT_MEMBER' });
// //         }

// //         // persist message
// //         const msg = await Message.create({
// //           organizationId: channel.organizationId,
// //           channelId: channel._id,
// //           senderId: socket.user._id,
// //           body: body ? String(body).trim() : '',
// //           attachments: Array.isArray(attachments) ? attachments : [],
// //         });

// //         // emit to channel
// //         io.to(`channel:${channelId}`).emit('newMessage', msg);

// //         // emit lightweight channel activity to org room (optional)
// //         io.to(`org:${orgId}`).emit('channelActivity', { 
// //             channelId, 
// //             lastMessage: { 
// //                 _id: msg._id, 
// //                 body: msg.body, 
// //                 createdAt: msg.createdAt, 
// //                 senderId: msg.senderId 
// //             } 
// //         });
// //       } catch (err) {
// //         console.error('sendMessage err', err);
// //         socket.emit('error', { code: 'SERVER_ERROR' });
// //       }
// //     });

// //     // TYPING INDICATOR
// //     socket.on('typing', ({ channelId, typing } = {}) => {
// //       if (!channelId) return;
// //       socket.to(`channel:${channelId}`).emit('userTyping', { userId, channelId, typing: !!typing });
// //     });

// //     // READ RECEIPTS
// //     socket.on('markRead', async ({ channelId, messageIds } = {}) => {
// //       if (!channelId) return;
// //       try {
// //         const filter = { channelId };
// //         if (Array.isArray(messageIds) && messageIds.length) filter._id = { $in: messageIds };

// //         await Message.updateMany(
// //             { ...filter, readBy: { $ne: socket.user._id } }, 
// //             { $push: { readBy: socket.user._id } }
// //         );

// //         socket.to(`channel:${channelId}`).emit('readReceipt', { userId, channelId, messageIds: Array.isArray(messageIds) ? messageIds : null });
// //       } catch (err) {
// //         console.error('markRead err', err);
// //       }
// //     });

// //     // FETCH MESSAGES
// //     socket.on('fetchMessages', async ({ channelId, before, limit = 50 } = {}) => {
// //       if (!channelId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
// //       try {
// //         const filter = { channelId };
// //         if (before) filter.createdAt = { $lt: new Date(before) };
// //         const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
// //         socket.emit('messages', { channelId, messages });
// //       } catch (err) {
// //         console.error('fetchMessages err', err);
// //         socket.emit('error', { code: 'SERVER_ERROR' });
// //       }
// //     });

// //     // ADMIN ACTION: force disconnect
// //     socket.on('admin:forceDisconnect', async ({ targetUserId } = {}) => {
// //       if (!targetUserId) return socket.emit('error', { code: 'INVALID_PAYLOAD' });
// //       try {
// //         const actor = await User.findById(socket.user._id).select('role organizationId').lean();
// //         if (!actor) return socket.emit('error', { code: 'NOT_AUTH' });
// //         if (String(actor.organizationId) !== orgId) return socket.emit('error', { code: 'INVALID_ORG' });
        
// //         if (!['superadmin', 'admin', 'owner'].includes(String(actor.role))) {
// //             return socket.emit('error', { code: 'FORBIDDEN' });
// //         }

// //         const sockets = getSocketIdsForUser(targetUserId);
// //         for (const sId of sockets) {
// //           const s = io.sockets.sockets.get(sId);
// //           if (s) {
// //             s.emit('forceLogout', { reason: 'disabled_by_admin' });
// //             s.disconnect(true);
// //           }
// //         }
// //       } catch (err) {
// //         console.error('admin:forceDisconnect err', err);
// //         socket.emit('error', { code: 'SERVER_ERROR' });
// //       }
// //     });

// //     // CLEANUP on disconnect
// //     socket.on('disconnect', (reason) => {
// //       // remove socket registration
// //       removeSocketForUser(userId, socket.id);

// //       // ✨ OPTIMIZATION: Use the Set on the socket to clean up efficiently (O(1))
// //       // instead of iterating the entire global channel map.
// //       if (socket.joinedChannels) {
// //         for (const chId of socket.joinedChannels) {
// //             // Remove user from the global presence map
// //             removeUserFromChannel(chId, userId);
            
// //             // Broadcast to others in that channel
// //             io.to(`channel:${chId}`).emit('userLeftChannel', { userId, channelId: chId });
// //         }
// //         socket.joinedChannels.clear();
// //       }

// //       // If no sockets left for this user -> mark offline in org and broadcast
// //       if (getSocketIdsForUser(userId).length === 0) {
// //         removeOrgOnlineUser(orgId, userId);
// //         io.to(`org:${orgId}`).emit('userOffline', { userId });
// //       }
// //     });
// //   });

// //   return io;
// // }

// // /**
// //  * Helpers to emit from server-side controllers
// //  */
// // function emitToOrg(organizationId, event, payload) {
// //   if (!io) {
// //     console.error('❌ SOCKET ERROR: io is not initialized yet! Cannot emit to Org.');
// //     return;
// //   }
// //   // console.log(`📢 Emitting to Room: org:${organizationId}`); 
// //   io.to(`org:${organizationId}`).emit(event, payload);
// // }

// // function emitToUser(userId, event, payload) {
// //   if (!io) {
// //     console.error('❌ SOCKET ERROR: io is not initialized yet! Cannot emit to User.');
// //     return;
// //   }
// //   const socketIds = getSocketIdsForUser(userId);
// //   for (const sId of socketIds) {
// //     io.to(sId).emit(event, payload);
// //   }
// // }

// // function forceDisconnectUser(userId) {
// //   if (!io) return;
// //   const socketIds = getSocketIdsForUser(userId);
// //   for (const sId of socketIds) {
// //     const s = io.sockets.sockets.get(sId);
// //     if (s) {
// //       s.emit('forceLogout', { reason: 'forced_by_server' });
// //       s.disconnect(true);
// //     }
// //   }
// // }

// // module.exports = { init, emitToOrg, emitToUser, forceDisconnectUser, getIo: () => io };
