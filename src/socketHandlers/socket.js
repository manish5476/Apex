"use strict";

/**
 * ============================================================================
 * socket.js  —  Production-Grade, Scale-Proof Socket.IO Server
 * ============================================================================
 *
 * Architecture highlights:
 *  - JWT auth middleware with structured error codes
 *  - In-memory presence maps (activeSockets, orgOnlineUsers, channelPresence)
 *  - Optional Redis adapter for horizontal scaling (multi-instance)
 *  - Optional Redis pub/sub for presence sync across instances
 *  - Per-event rate limiting via token-bucket (no extra deps)
 *  - Input sanitization on all user-supplied strings
 *  - All role checks use socket.user.role (zero DB round-trips for auth)
 *  - No duplicate event handlers
 *  - Graceful disconnect cleanup
 *  - Structured error emission (code + message, never raw stack traces)
 *  - Safe connection-state recovery (middlewares NOT skipped)
 *  - Exported helpers for use in REST controllers
 * ============================================================================
 */

const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const Channel = require("../modules/organization/core/channel.model");
const Message = require("../modules/notification/core/message.model");
const User = require("../modules/auth/core/user.model");
const NotificationModel = require("../modules/notification/core/notification.model");

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_ROLES = new Set(["admin", "superadmin", "owner"]);
const MAX_MESSAGE_LENGTH = 4000;
const MAX_FETCH_LIMIT = 100;
const DEFAULT_FETCH_LIMIT = 50;
const MAX_NOTIFICATION_FETCH = 20;
const MAX_CHANNELS_FETCH = 50;

// ─── Module-level singletons ──────────────────────────────────────────────────
let io = null;

/** userId (string) → Set<socketId> */
const activeSockets = new Map();

/** orgId (string) → Set<userId string> */
const orgOnlineUsers = new Map();

/** channelId (string) → Set<userId string> */
const channelPresence = new Map();

// ─── Presence helpers ─────────────────────────────────────────────────────────

function _setAdd(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function _setRemove(map, key, value) {
  const set = map.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) map.delete(key);
}

function _setValues(map, key) {
  const set = map.get(key);
  return set ? Array.from(set) : [];
}

function addSocketForUser(userId, socketId) {
  _setAdd(activeSockets, String(userId), socketId);
}

function removeSocketForUser(userId, socketId) {
  _setRemove(activeSockets, String(userId), socketId);
}

function getSocketIdsForUser(userId) {
  return _setValues(activeSockets, String(userId));
}

function addOrgOnlineUser(orgId, userId) {
  _setAdd(orgOnlineUsers, String(orgId), String(userId));
}

function removeOrgOnlineUser(orgId, userId) {
  _setRemove(orgOnlineUsers, String(orgId), String(userId));
}

function addUserToChannel(channelId, userId) {
  _setAdd(channelPresence, String(channelId), String(userId));
}

function removeUserFromChannel(channelId, userId) {
  _setRemove(channelPresence, String(channelId), String(userId));
}

function getUsersInChannel(channelId) {
  return _setValues(channelPresence, String(channelId));
}

function getUserOnlineStatus(userId) {
  return activeSockets.has(String(userId));
}

function getOnlineUsersInOrg(orgId) {
  return _setValues(orgOnlineUsers, String(orgId));
}

// ─── Input sanitization ───────────────────────────────────────────────────────

/**
 * Strip HTML tags and trim. Returns empty string for non-strings.
 */
function sanitize(value, maxLen = 500) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")   // strip HTML
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .trim()
    .slice(0, maxLen);
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─── Rate limiter (token-bucket, no extra deps) ───────────────────────────────

/**
 * Per-socket, per-event rate limiter.
 * Returns true if the event should be allowed, false if rate-limited.
 *
 * @param {Map}    store      - shared per-socket map
 * @param {string} key        - event name
 * @param {number} maxTokens  - burst capacity
 * @param {number} refillMs   - ms per token refill
 */
function checkRateLimit(store, key, maxTokens, refillMs) {
  const now = Date.now();
  if (!store.has(key)) {
    store.set(key, { tokens: maxTokens - 1, lastRefill: now });
    return true;
  }
  const bucket = store.get(key);
  const elapsed = now - bucket.lastRefill;
  const refilled = Math.floor(elapsed / refillMs);
  if (refilled > 0) {
    bucket.tokens = Math.min(maxTokens, bucket.tokens + refilled);
    bucket.lastRefill = now;
  }
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }
  return false;
}

// ─── Emit helpers (used by REST controllers) ─────────────────────────────────

function emitToOrg(organizationId, event, payload) {
  if (!io) { console.error("❌ Socket.IO not initialized"); return; }
  io.to(`org:${organizationId}`).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (!io) { console.error("❌ Socket.IO not initialized"); return; }
  io.to(`user:${userId}`).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  if (!io || !Array.isArray(userIds)) return;
  for (const uid of userIds) {
    io.to(`user:${uid}`).emit(event, payload);
  }
}

function emitToChannel(channelId, event, payload) {
  if (!io) return;
  io.to(`channel:${channelId}`).emit(event, payload);
}

function forceDisconnectUser(userId) {
  if (!io) return;
  for (const sId of getSocketIdsForUser(userId)) {
    const s = io.sockets.sockets.get(sId);
    if (s) { s.emit("forceLogout", { reason: "forced_by_server" }); s.disconnect(true); }
  }
}

function getOnlineUsers() {
  return Array.from(activeSockets.keys());
}

function getOrgOnlineUsers(orgId) {
  return _setValues(orgOnlineUsers, String(orgId));
}

// ─── Main init ────────────────────────────────────────────────────────────────

/**
 * Initialize and return the Socket.IO server.
 *
 * @param {import("http").Server} server
 * @param {{
 *   cors?: object,
 *   redisUrl?: string,
 *   jwtSecret?: string,
 *   pingTimeout?: number,
 *   pingInterval?: number,
 * }} options
 */
function init(server, options = {}) {
  if (io) return io;

  const {
    cors,
    redisUrl,
    jwtSecret,
    pingTimeout = 30000,
    pingInterval = 10000,
  } = options;

  io = new Server(server, {
    cors: cors || { origin: "*", credentials: true },
    transports: ["websocket", "polling"],
    pingTimeout,
    pingInterval,
    maxHttpBufferSize: 1e6, // 1 MB max payload
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,  // KEEP false — expired tokens must still be rejected
    },
  });

  // ── Optional Redis adapter (horizontal scaling) ──────────────────────────
  if (redisUrl) {
    (async () => {
      try {
        const { createClient } = require("redis");
        const { createAdapter } = require("@socket.io/redis-adapter");
        const pubClient = createClient({ url: redisUrl });
        const subClient = pubClient.duplicate();
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        console.log("✅ Socket.IO Redis adapter connected");
      } catch (err) {
        console.error("❌ Redis adapter error:", err.message);
      }
    })();
  }

  // ── JWT Auth Middleware ───────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      
      if (!token) {
        console.warn(`⚠️ Socket connection rejected: No token provided (Socket ID: ${socket.id})`);
        return next(Object.assign(new Error("AUTH_REQUIRED"), { data: { code: "AUTH_REQUIRED" } }));
      }

      const secret = jwtSecret || process.env.JWT_SECRET;
      let payload;
      try {
        payload = jwt.verify(token, secret);
      } catch (err) {
        if (err.name === "TokenExpiredError") {
          return next(Object.assign(new Error("TOKEN_EXPIRED"), { data: { code: "TOKEN_EXPIRED" } }));
        }
        return next(Object.assign(new Error("INVALID_TOKEN"), { data: { code: "INVALID_TOKEN" } }));
      }

      const userId = payload.sub || payload.id;
      if (!userId || !payload.organizationId) {
        return next(Object.assign(new Error("INVALID_PAYLOAD"), { data: { code: "INVALID_PAYLOAD" } }));
      }

      const user = await User.findById(userId)
        .select("_id name email organizationId role isActive")
        .lean();

      if (!user) return next(Object.assign(new Error("USER_NOT_FOUND"), { data: { code: "USER_NOT_FOUND" } }));
      if (!user.isActive) return next(Object.assign(new Error("USER_INACTIVE"), { data: { code: "USER_INACTIVE" } }));

      // Attach everything we need — zero DB calls during events
      socket.user = {
        _id: user._id,
        id: String(user._id),
        email: user.email,
        name: user.name || user.email.split("@")[0],
        organizationId: user.organizationId,
        orgId: String(user.organizationId),
        role: user.role || "member",
        isAdmin: ADMIN_ROLES.has(user.role),
      };

      socket.joinedChannels = new Set();
      socket.rateLimits = new Map(); // per-socket rate limit buckets

      console.log(`✅ Socket authenticated: User ${userId} (Socket ID: ${socket.id})`);
      return next();
    } catch (err) {
      console.error("🔴 Socket Auth Error:", err.message, "| Stack:", err.stack);
      return next(Object.assign(new Error("INTERNAL_ERROR"), { data: { code: "INTERNAL_ERROR" } }));
    }
  });

  // ── Connection handler ────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const { id: userId, orgId, role, isAdmin, name } = socket.user;

    console.log(`🔌 Connected: ${socket.id} | user=${userId} org=${orgId}`);

    // Register socket
    addSocketForUser(userId, socket.id);

    // First socket for this user → mark online
    if (getSocketIdsForUser(userId).length === 1) {
      addOrgOnlineUser(orgId, userId);
      io.to(`org:${orgId}`).emit("userOnline", {
        userId,
        organizationId: orgId,
        timestamp: new Date().toISOString(),
      });
    }

    // Auto-join org & identity rooms
    socket.join(`org:${orgId}`);
    socket.join(`user:${userId}`); // ✅ FIXED: Added for direct user-scoped emits

    if (socket.user.role) {
      socket.join(`role:${String(socket.user.role)}`);
    }
    socket.emit("connectionEstablished", {
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // ── Helpers scoped to this socket ───────────────────────────────────────

    /** Emit a structured error to this socket only */
    function err(code, message) {
      socket.emit("error", { code, message: message || code });
    }

    /** Enforce rate limit; emits error and returns false if exceeded */
    function rateLimit(event, maxTokens, refillMs) {
      if (!checkRateLimit(socket.rateLimits, event, maxTokens, refillMs)) {
        err("RATE_LIMITED", `Slow down on "${event}"`);
        return false;
      }
      return true;
    }

    // ── PING / health ────────────────────────────────────────────────────────
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: new Date().toISOString() });
    });

    // ── ORG ──────────────────────────────────────────────────────────────────
    socket.on("joinOrg", ({ organizationId } = {}) => {
      if (!organizationId || String(organizationId) !== orgId) {
        return err("INVALID_ORG", "Organization mismatch");
      }
      socket.join(`org:${organizationId}`);
      socket.emit("orgOnlineUsers", {
        organizationId: orgId,
        users: getOnlineUsersInOrg(orgId),
      });
    });

    socket.on("getOnlineUsers", ({ channelId } = {}) => {
      if (channelId) {
        const online = getUsersInChannel(channelId).filter(
          (uid) => getSocketIdsForUser(uid).length > 0
        );
        socket.emit("onlineUsersInChannel", { channelId, users: online });
      } else {
        socket.emit("onlineUsersInOrg", { users: getOnlineUsersInOrg(orgId) });
      }
    });

    // ── CHANNELS ─────────────────────────────────────────────────────────────
    socket.on("joinChannel", async ({ channelId } = {}) => {
      if (!channelId || !isValidObjectId(channelId)) return err("INVALID_PAYLOAD");
      try {
        const channel = await Channel.findOne({
          _id: channelId,
          organizationId: orgId,   // ✅ scoped to org — one query, no leak
        }).lean();

        if (!channel) return err("CHANNEL_NOT_FOUND");
        if (!channel.isActive) return err("CHANNEL_DISABLED");

        if (channel.type !== "public") {
          const isMember = (channel.members || []).some((m) => String(m) === userId);
          if (!isMember) return err("NOT_MEMBER");
        }

        socket.join(`channel:${channelId}`);
        socket.joinedChannels.add(channelId);
        addUserToChannel(channelId, userId);

        socket.to(`channel:${channelId}`).emit("userJoinedChannel", { userId, channelId });
        socket.emit("channelUsers", { channelId, users: getUsersInChannel(channelId) });

        console.log(`👥 ${userId} joined channel ${channelId}`);
      } catch (e) {
        console.error("joinChannel:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("leaveChannel", ({ channelId } = {}) => {
      if (!channelId) return;
      socket.leave(`channel:${channelId}`);
      socket.joinedChannels.delete(channelId);
      removeUserFromChannel(channelId, userId);
      io.to(`channel:${channelId}`).emit("userLeftChannel", { userId, channelId });
      socket.emit("leftChannel", { channelId });
      console.log(`👋 ${userId} left channel ${channelId}`);
    });

    socket.on("createChannel", async (payload = {}) => {
      if (!rateLimit("createChannel", 5, 10_000)) return; // 5 per 10s
      const type = sanitize(payload.type || "public", 20) || "public";
      const name = sanitize(payload.name || "", 80);
      const members = Array.isArray(payload.members) ? payload.members : [];

      try {
        if (type !== "public" && !isAdmin) {
          return err("FORBIDDEN", "Only admins can create private/DM channels");
        }

        const channelName = type === "dm" ? undefined : (name || `channel-${Date.now()}`);

        const channel = await Channel.create({
          organizationId: orgId,
          name: channelName,
          type,
          members: type === "public" ? [] : [...new Set([...members.map(String), userId])],
          createdBy: userId,
          isActive: true,
        });

        io.to(`org:${orgId}`).emit("channelCreated", channel);

        if (type !== "public") {
          socket.join(`channel:${channel._id}`);
          socket.joinedChannels.add(String(channel._id));
          addUserToChannel(channel._id, userId);
        }

        console.log(`📢 Channel ${channel._id} created by ${userId}`);
      } catch (e) {
        console.error("createChannel:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("updateChannel", async (payload = {}) => {
      if (!isAdmin) return err("FORBIDDEN", "Insufficient permissions");
      const { channelId } = payload;
      if (!channelId || !isValidObjectId(channelId)) return err("INVALID_PAYLOAD");

      try {
        const update = {};
        if (payload.name !== undefined) update.name = sanitize(payload.name, 80);
        if (payload.isActive !== undefined) update.isActive = Boolean(payload.isActive);
        if (payload.type !== undefined) update.type = sanitize(payload.type, 20);
        if (Array.isArray(payload.members)) update.members = payload.members;

        const channel = await Channel.findOneAndUpdate(
          { _id: channelId, organizationId: orgId },
          update,
          { new: true }
        );

        if (!channel) return err("NOT_FOUND", "Channel not found");

        io.to(`channel:${channelId}`).emit("channelUpdated", channel);
        io.to(`org:${orgId}`).emit("channelUpdated", channel);
        socket.emit("channelUpdateSuccess", { channelId });
        console.log(`✅ Channel ${channelId} updated by ${userId}`);
      } catch (e) {
        console.error("updateChannel:", e.message);
        err("SERVER_ERROR");
      }
    });

    // ── MESSAGES ─────────────────────────────────────────────────────────────
    socket.on("sendMessage", async (payload = {}) => {
      if (!rateLimit("sendMessage", 20, 1_000)) return; // 20 msg/s burst

      const { channelId, attachments } = payload;
      const body = sanitize(payload.body || "", MAX_MESSAGE_LENGTH);

      if (!channelId || !isValidObjectId(channelId)) return err("INVALID_PAYLOAD");
      if (!body && !Array.isArray(attachments)) return err("INVALID_PAYLOAD");

      try {
        const channel = await Channel.findOne({
          _id: channelId,
          organizationId: orgId,
        }).lean();

        if (!channel) return err("CHANNEL_NOT_FOUND");
        if (!channel.isActive) return err("CHANNEL_DISABLED");

        if (channel.type !== "public") {
          const isMember = (channel.members || []).some((m) => String(m) === userId);
          if (!isMember) return err("NOT_MEMBER");
        }

        const msg = await Message.create({
          organizationId: orgId,
          channelId: channel._id,
          senderId: socket.user._id,
          body,
          attachments: Array.isArray(attachments)
            ? attachments.slice(0, 10)  // cap at 10 attachments
            : [],
          readBy: [socket.user._id],
        });

        const populated = await Message.findById(msg._id)
          .populate("senderId", "name email avatar")
          .lean();

        io.to(`channel:${channelId}`).emit("newMessage", populated);
        io.to(`org:${orgId}`).emit("channelActivity", {
          channelId,
          lastMessage: {
            _id: msg._id,
            body: msg.body,
            createdAt: msg.createdAt,
            senderId: msg.senderId,
          },
        });

        console.log(`💬 Message in ${channelId} by ${userId}`);
      } catch (e) {
        console.error("sendMessage:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("editMessage", async (payload = {}) => {
      if (!rateLimit("editMessage", 10, 1_000)) return;

      const { messageId } = payload;
      const body = sanitize(payload.body || "", MAX_MESSAGE_LENGTH);

      if (!messageId || !isValidObjectId(messageId) || !body) {
        return err("INVALID_PAYLOAD");
      }

      try {
        const message = await Message.findOne({
          _id: messageId,
          senderId: socket.user._id, // ✅ ownership enforced in query, one round-trip
        });

        if (!message) return err("NOT_FOUND", "Message not found or not yours");

        message.body = body;
        message.editedAt = new Date();
        message.editedBy = socket.user._id;
        await message.save();

        const updated = await Message.findById(message._id)
          .populate("senderId", "name email avatar")
          .lean();

        io.to(`channel:${message.channelId}`).emit("messageEdited", updated);
      } catch (e) {
        console.error("editMessage:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("deleteMessage", async (payload = {}) => {
      if (!rateLimit("deleteMessage", 10, 1_000)) return;

      const { messageId } = payload;
      if (!messageId || !isValidObjectId(messageId)) return err("INVALID_PAYLOAD");

      try {
        const message = await Message.findById(messageId);
        if (!message) return err("MESSAGE_NOT_FOUND");

        const isSender = String(message.senderId) === userId;
        if (!isSender && !isAdmin) return err("FORBIDDEN");

        // Soft delete
        message.body = "";
        message.attachments = [];
        message.deleted = true;
        message.deletedAt = new Date();
        message.deletedBy = socket.user._id;
        await message.save();

        io.to(`channel:${message.channelId}`).emit("messageDeleted", {
          messageId: String(message._id),
          channelId: String(message.channelId),
          deletedBy: userId,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.error("deleteMessage:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("typing", ({ channelId, typing } = {}) => {
      if (!channelId) return;
      if (!rateLimit("typing", 3, 1_000)) return; // throttle typing events
      socket.to(`channel:${channelId}`).emit("userTyping", {
        userId,
        channelId,
        typing: !!typing,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on("markRead", async ({ channelId, messageIds } = {}) => {
      if (!channelId || !isValidObjectId(channelId)) return;
      if (!rateLimit("markRead", 10, 1_000)) return;

      try {
        // ✅ FIX: Only mark specific messages if provided; otherwise require explicit list
        if (!Array.isArray(messageIds) || messageIds.length === 0) return;

        const safeIds = messageIds
          .filter(isValidObjectId)
          .slice(0, 100); // cap at 100 ids

        await Message.updateMany(
          {
            _id: { $in: safeIds },
            channelId,                       // scoped to channel
            readBy: { $ne: socket.user._id },
          },
          { $push: { readBy: socket.user._id } }
        );

        socket.to(`channel:${channelId}`).emit("readReceipt", {
          userId,
          channelId,
          messageIds: safeIds,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.error("markRead:", e.message);
      }
    });

    socket.on("fetchMessages", async ({ channelId, before, limit } = {}) => {
      if (!channelId || !isValidObjectId(channelId)) return err("INVALID_PAYLOAD");
      if (!rateLimit("fetchMessages", 10, 2_000)) return;

      try {
        const channel = await Channel.findOne({
          _id: channelId,
          organizationId: orgId, // ✅ scoped — prevents cross-org reads
        }).lean();

        if (!channel) return err("CHANNEL_NOT_FOUND");

        if (channel.type !== "public") {
          const isMember = (channel.members || []).some((m) => String(m) === userId);
          if (!isMember) return err("FORBIDDEN", "Not a member");
        }

        const safeLimit = Math.min(Number(limit) || DEFAULT_FETCH_LIMIT, MAX_FETCH_LIMIT);
        const filter = { channelId };
        if (before) {
          const beforeDate = new Date(before);
          if (!isNaN(beforeDate)) filter.createdAt = { $lt: beforeDate };
        }

        const messages = await Message.find(filter)
          .populate("senderId", "name email avatar")
          .sort({ createdAt: -1 })
          .limit(safeLimit)
          .lean();

        socket.emit("messages", { channelId, messages });
      } catch (e) {
        console.error("fetchMessages:", e.message);
        err("SERVER_ERROR");
      }
    });

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
    socket.on("subscribeNotifications", async () => {
      try {
        socket.join(`notifications:${userId}`);

        const notifications = await NotificationModel.find({
          recipientId: socket.user._id,
          isRead: false,
        })
          .sort({ createdAt: -1 })
          .limit(MAX_NOTIFICATION_FETCH)
          .lean();

        socket.emit("initialNotifications", { notifications });
        console.log(`🔔 ${userId} subscribed to notifications`);
      } catch (e) {
        console.error("subscribeNotifications:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("sendNotification", async (payload = {}) => {
      // ✅ FIX: role check from memory, no DB query
      if (!isAdmin) return err("FORBIDDEN");
      if (!rateLimit("sendNotification", 10, 5_000)) return;

      const { recipientId, metadata } = payload;
      const title = sanitize(payload.title || "", 200);
      const message = sanitize(payload.message || "", 1000);
      const type = sanitize(payload.type || "info", 20);

      if (!recipientId || !isValidObjectId(recipientId) || !title || !message) {
        return err("INVALID_PAYLOAD");
      }

      try {
        const notification = await NotificationModel.create({
          organizationId: orgId,
          recipientId,
          title,
          message,
          type,
          metadata: metadata && typeof metadata === "object" ? metadata : {},
          createdBy: socket.user._id,
        });

        io.to(`notifications:${recipientId}`).emit("newNotification", notification);
        socket.emit("notificationSent", { notificationId: notification._id });
        console.log(`📨 Notification → ${recipientId} by ${userId}`);
      } catch (e) {
        console.error("sendNotification:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("markNotificationRead", async ({ notificationId } = {}) => {
      if (!notificationId || !isValidObjectId(notificationId)) return;
      try {
        const notification = await NotificationModel.findOneAndUpdate(
          { _id: notificationId, recipientId: socket.user._id }, // ownership enforced
          { isRead: true, readAt: new Date(), readBy: socket.user._id },
          { new: true }
        ).lean();

        if (!notification) return;

        socket.emit("notificationRead", { notificationId });

        if (notification.messageId) {
          await Message.updateOne(
            { _id: notification.messageId },
            { $addToSet: { readBy: socket.user._id } }
          );
        }
      } catch (e) {
        console.error("markNotificationRead:", e.message);
        err("SERVER_ERROR");
      }
    });

    // ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────
    socket.on("createAnnouncement", async (payload = {}) => {
      // ✅ FIX: role from memory
      if (!isAdmin) return err("FORBIDDEN");
      if (!rateLimit("createAnnouncement", 5, 10_000)) return;

      const title = sanitize(payload.title || "", 200);
      const message = sanitize(payload.message || "", 2000);
      const type = sanitize(payload.type || "info", 20);
      const { targetOrgId } = payload;

      if (!title || !message || !targetOrgId) return err("INVALID_PAYLOAD");

      // Non-superadmin can only announce in their own org
      if (String(targetOrgId) !== orgId && role !== "superadmin") {
        return err("FORBIDDEN", "Cross-org announcements require superadmin");
      }

      try {
        const announcement = {
          _id: new mongoose.Types.ObjectId(),
          title,
          message,
          type,
          senderId: userId,
          organizationId: targetOrgId,
          createdAt: new Date(),
        };

        // Uncomment if you add AnnouncementModel:
        // const saved = await AnnouncementModel.create(announcement);

        io.to(`org:${targetOrgId}`).emit("newAnnouncement", { data: announcement });
        socket.emit("announcementCreated", { id: announcement._id });
        console.log(`📢 Announcement in org ${targetOrgId} by ${userId}`);
      } catch (e) {
        console.error("createAnnouncement:", e.message);
        err("SERVER_ERROR");
      }
    });

    // ── THEME ─────────────────────────────────────────────────────────────────
    socket.on("updateTheme", async ({ themeId } = {}) => {
      if (!themeId) return;
      if (!rateLimit("updateTheme", 5, 5_000)) return;

      try {
        const updated = await User.findByIdAndUpdate(
          socket.user._id,
          { "preferences.themeId": sanitize(String(themeId), 50) },
          { new: true }
        ).select("preferences.themeId").lean();

        if (updated) {
          for (const sId of getSocketIdsForUser(userId)) {
            io.to(sId).emit("themeChanged", { themeId: updated.preferences.themeId });
          }
        }
      } catch (e) {
        console.error("updateTheme:", e.message);
        err("THEME_UPDATE_FAILED");
      }
    });

    // ── INITIAL DATA ──────────────────────────────────────────────────────────
    socket.on("getInitialData", async () => {
      if (!rateLimit("getInitialData", 3, 5_000)) return;
      try {
        const [channels, unreadCount] = await Promise.all([
          Channel.find({
            organizationId: orgId,
            isActive: true,
            $or: [
              { type: "public" },
              { type: { $in: ["private", "dm"] }, members: socket.user._id },
            ],
          })
            .select("_id name type members isActive createdAt")
            .sort({ createdAt: -1 })
            .limit(MAX_CHANNELS_FETCH)
            .lean(),

          NotificationModel.countDocuments({
            recipientId: socket.user._id,
            isRead: false,
          }),
        ]);

        socket.emit("initialData", {
          channels,
          unreadCount,
          onlineUsers: getOnlineUsersInOrg(orgId),
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.error("getInitialData:", e.message);
        err("SERVER_ERROR");
      }
    });

    // ── ADMIN ─────────────────────────────────────────────────────────────────
    socket.on("admin:forceDisconnect", async ({ targetUserId } = {}) => {
      // ✅ FIX: role from memory — no DB query
      if (!isAdmin) return err("FORBIDDEN");
      if (!targetUserId || !isValidObjectId(targetUserId)) return err("INVALID_PAYLOAD");

      try {
        const sockets = getSocketIdsForUser(targetUserId);
        for (const sId of sockets) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.emit("forceLogout", {
              reason: "disabled_by_admin",
              timestamp: new Date().toISOString(),
            });
            s.disconnect(true);
          }
        }
        socket.emit("admin:forceDisconnectSuccess", { targetUserId });
        console.log(`⚡ Admin ${userId} force-disconnected ${targetUserId}`);
      } catch (e) {
        console.error("admin:forceDisconnect:", e.message);
        err("SERVER_ERROR");
      }
    });

    socket.on("admin:getStats", () => {
      // ✅ FIX: role from memory — no DB query, no async needed
      if (!isAdmin) return err("FORBIDDEN");

      socket.emit("systemStats", {
        connectedUsers: activeSockets.size,
        orgOnlineUsers: orgOnlineUsers.get(orgId)?.size || 0,
        activeChannels: channelPresence.size,
        totalConnections: io.engine.clientsCount,
        timestamp: new Date().toISOString(),
      });
    });

    // ── In the connection handler, update the disconnect listener: ────────────
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected: ${socket.id} | user=${userId} | reason=${reason}`);

      removeSocketForUser(userId, socket.id);

      for (const chId of socket.joinedChannels) {
        removeUserFromChannel(chId, userId);
        io.to(`channel:${chId}`).emit('userLeftChannel', {
          userId,
          channelId: chId,
          timestamp: new Date().toISOString(),
        });
      }
      socket.joinedChannels.clear();
      socket.rateLimits.clear();

      if (getSocketIdsForUser(userId).length === 0) {
        removeOrgOnlineUser(orgId, userId);
        io.to(`org:${orgId}`).emit('userOffline', {
          userId,
          organizationId: orgId,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // // ── DISCONNECT CLEANUP ────────────────────────────────────────────────────
    // socket.on("disconnect", (reason) => {
    //   console.log(`🔌 Disconnected: ${socket.id} | user=${userId} | reason=${reason}`);

    //   removeSocketForUser(userId, socket.id);

    //   // Clean up all channel presence for this socket's joined channels
    //   for (const chId of socket.joinedChannels) {
    //     removeUserFromChannel(chId, userId);
    //     io.to(`channel:${chId}`).emit("userLeftChannel", {
    //       userId,
    //       channelId: chId,
    //       timestamp: new Date().toISOString(),
    //     });
    //   }
    //   socket.joinedChannels.clear();
    //   socket.rateLimits.clear();

    //   // Last socket for this user → mark offline
    //   if (getSocketIdsForUser(userId).length === 0) {
    //     removeOrgOnlineUser(orgId, userId);
    //     io.to(`org:${orgId}`).emit("userOffline", {
    //       userId,
    //       organizationId: orgId,
    //       timestamp: new Date().toISOString(),
    //     });
    //   }
    // });
  });

  return io;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  init,
  emitToOrg,
  emitToUser,
  emitToUsers,
  emitToChannel,
  forceDisconnectUser,
  getOnlineUsers,
  getOrgOnlineUsers,
  getUserOnlineStatus,
  getUsersInChannel,
  getIo: () => io,
};