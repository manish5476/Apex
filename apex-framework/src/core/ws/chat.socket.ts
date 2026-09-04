import { Server } from 'socket.io';
import { AuthenticatedSocket } from '@core/ws/socket.types';
import { presence } from '@core/ws/socket.presence';
import { SocketUtils } from '@core/ws/socket.utils';
import Channel from '../../infrastructure/models/channel.model';
import Message from '../../infrastructure/models/message.model';
import logger from '@core/logger';

export const registerChatHandlers = (io: Server, socket: AuthenticatedSocket): void => {
  const { id: userId, orgId, isAdmin } = socket.user;

  // ─── CHANNEL HANDLERS ────────────────────────────────────────────────────────

  socket.on('joinChannel', async ({ channelId }: any = {}) => {
    if (!channelId || !SocketUtils.isValidObjectId(channelId)) return socket.sendError('INVALID_PAYLOAD');
    
    try {
      const channel = await Channel.findOne({ _id: channelId, organizationId: orgId }).lean();
      if (!channel) return socket.sendError('CHANNEL_NOT_FOUND');
      if (!channel.isActive) return socket.sendError('CHANNEL_DISABLED');

      if (channel.type !== 'public') {
        const isMember = (channel.members || []).some((m: any) => String(m) === userId);
        if (!isMember) return socket.sendError('NOT_MEMBER');
      }

      socket.join(`channel:${channelId}`);
      socket.joinedChannels.add(channelId);
      presence.addUserToChannel(channelId, userId);

      socket.to(`channel:${channelId}`).emit('userJoinedChannel', { userId, channelId });
      socket.emit('channelUsers', { channelId, users: presence.getUsersInChannel(channelId) });
    } catch (e) {
      logger.error(`[WS] joinChannel error: ${(e as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('leaveChannel', ({ channelId }: any = {}) => {
    if (!channelId) return;
    
    socket.leave(`channel:${channelId}`);
    socket.joinedChannels.delete(channelId);
    presence.removeUserFromChannel(channelId, userId);
    
    io.to(`channel:${channelId}`).emit('userLeftChannel', { userId, channelId });
    socket.emit('leftChannel', { channelId });
  });

  socket.on('createChannel', async (payload: any = {}) => {
    if (!socket.enforceRateLimit('createChannel', 5, 10000)) return; // 5 per 10s

    const type = SocketUtils.sanitize(payload.type || 'public', 20) || 'public';
    const name = SocketUtils.sanitize(payload.name || '', 80);
    const members = Array.isArray(payload.members) ? payload.members : [];

    try {
      if (type !== 'public' && !isAdmin) {
        return socket.sendError('FORBIDDEN', 'Only admins can create private/DM channels');
      }

      const channelName = type === 'dm' ? undefined : (name || `channel-${Date.now()}`);

      const channel = await Channel.create({
        organizationId: orgId,
        name: channelName,
        type,
        members: type === 'public' ? [] : [...new Set([...members.map(String), userId])],
        createdBy: userId,
        isActive: true,
      });

      io.to(`org:${orgId}`).emit('channelCreated', channel);

      if (type !== 'public') {
        const chIdStr = String(channel._id);
        socket.join(`channel:${chIdStr}`);
        socket.joinedChannels.add(chIdStr);
        presence.addUserToChannel(chIdStr, userId);
      }
    } catch (e) {
      logger.error(`[WS] createChannel error: ${(e as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('updateChannel', async (payload: any = {}) => {
    if (!isAdmin) return socket.sendError('FORBIDDEN', 'Insufficient permissions');
    
    const { channelId } = payload;
    if (!channelId || !SocketUtils.isValidObjectId(channelId)) return socket.sendError('INVALID_PAYLOAD');

    try {
      const update: Record<string, any> = {};
      if (payload.name !== undefined) update.name = SocketUtils.sanitize(payload.name, 80);
      if (payload.isActive !== undefined) update.isActive = Boolean(payload.isActive);
      if (payload.type !== undefined) update.type = SocketUtils.sanitize(payload.type, 20);
      if (Array.isArray(payload.members)) update.members = payload.members;

      const channel = await Channel.findOneAndUpdate(
        { _id: channelId, organizationId: orgId },
        update,
        { new: true }
      );

      if (!channel) return socket.sendError('NOT_FOUND', 'Channel not found');

      io.to(`channel:${channelId}`).emit('channelUpdated', channel);
      io.to(`org:${orgId}`).emit('channelUpdated', channel);
      socket.emit('channelUpdateSuccess', { channelId });
    } catch (e) {
      logger.error(`[WS] updateChannel error: ${(e as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });

  // ─── MESSAGE HANDLERS ────────────────────────────────────────────────────────

  socket.on('sendMessage', async (payload: any = {}) => {
    if (!socket.enforceRateLimit('sendMessage', 20, 1000)) return; // 20 msg/s burst

    const { channelId, attachments } = payload;
    const body = SocketUtils.sanitize(payload.body || '', 4000);

    if (!channelId || !SocketUtils.isValidObjectId(channelId)) return socket.sendError('INVALID_PAYLOAD');
    if (!body && !Array.isArray(attachments)) return socket.sendError('INVALID_PAYLOAD');

    try {
      const channel = await Channel.findOne({ _id: channelId, organizationId: orgId }).lean();
      if (!channel || !channel.isActive) return socket.sendError('CHANNEL_NOT_FOUND');

      if (channel.type !== 'public') {
        const isMember = (channel.members || []).some((m: any) => String(m) === userId);
        if (!isMember) return socket.sendError('NOT_MEMBER');
      }

      const msg = await Message.create({
        organizationId: orgId,
        channelId: channel._id,
        senderId: socket.user._id,
        body,
        attachments: Array.isArray(attachments) ? attachments.slice(0, 10) : [],
        readBy: [socket.user._id],
      });

      const populated = await Message.findById(msg._id).populate('senderId', 'name email avatar').lean();

      io.to(`channel:${channelId}`).emit('newMessage', populated);
      io.to(`org:${orgId}`).emit('channelActivity', {
        channelId,
        lastMessage: { _id: msg._id, body: msg.body, createdAt: msg.createdAt, senderId: msg.senderId },
      });
    } catch (e) {
      logger.error(`[WS] sendMessage error: ${(e as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('editMessage', async (payload: any = {}) => {
    if (!socket.enforceRateLimit('editMessage', 10, 1000)) return;

    const { messageId } = payload;
    const body = SocketUtils.sanitize(payload.body || '', 4000);

    if (!messageId || !SocketUtils.isValidObjectId(messageId) || !body) {
      return socket.sendError('INVALID_PAYLOAD');
    }

    try {
      const message = await Message.findOne({
        _id: messageId,
        senderId: socket.user._id, // Ownership enforced directly in query
      });

      if (!message) return socket.sendError('NOT_FOUND', 'Message not found or not yours');

      message.body = body;
      message.editedAt = new Date();
      message.editedBy = socket.user._id;
      await message.save();

      const updated = await Message.findById(message._id)
        .populate('senderId', 'name email avatar')
        .lean();

      io.to(`channel:${message.channelId}`).emit('messageEdited', updated);
    } catch (e) {
      logger.error(`[WS] editMessage error: ${(e as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('deleteMessage', async (payload: any = {}) => {
    if (!socket.enforceRateLimit('deleteMessage', 10, 1000)) return;

    const { messageId } = payload;
    if (!messageId || !SocketUtils.isValidObjectId(messageId)) return socket.sendError('INVALID_PAYLOAD');

    try {
      const message = await Message.findById(messageId);
      if (!message) return socket.sendError('MESSAGE_NOT_FOUND');

      const isSender = String(message.senderId) === userId;
      if (!isSender && !isAdmin) return socket.sendError('FORBIDDEN');

      // Soft delete
      message.body = '';
      message.attachments = [];
      message.deleted = true;
      message.deletedAt = new Date();
      message.deletedBy = socket.user._id;
      await message.save();

      io.to(`channel:${message.channelId}`).emit('messageDeleted', {
        messageId: String(message._id),
        channelId: String(message.channelId),
        deletedBy: userId,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      logger.error(`[WS] deleteMessage error: ${(e as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('typing', ({ channelId, typing }: any = {}) => {
    if (!channelId) return;
    if (!socket.enforceRateLimit('typing', 3, 1000)) return; 
    
    socket.to(`channel:${channelId}`).emit('userTyping', {
      userId,
      channelId,
      typing: !!typing,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('markRead', async ({ channelId, messageIds }: any = {}) => {
    if (!channelId || !SocketUtils.isValidObjectId(channelId)) return;
    if (!socket.enforceRateLimit('markRead', 10, 1000)) return;

    try {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;

      const safeIds = messageIds
        .filter(SocketUtils.isValidObjectId)
        .slice(0, 100); // cap at 100 ids

      await Message.updateMany(
        {
          _id: { $in: safeIds },
          channelId,
          readBy: { $ne: socket.user._id },
        },
        { $push: { readBy: socket.user._id } }
      );

      socket.to(`channel:${channelId}`).emit('readReceipt', {
        userId,
        channelId,
        messageIds: safeIds,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      logger.error(`[WS] markRead error: ${(e as Error).message}`);
    }
  });

  socket.on('fetchMessages', async ({ channelId, before, limit }: any = {}) => {
    if (!channelId || !SocketUtils.isValidObjectId(channelId)) return socket.sendError('INVALID_PAYLOAD');
    if (!socket.enforceRateLimit('fetchMessages', 10, 2000)) return;

    try {
      const channel = await Channel.findOne({ _id: channelId, organizationId: orgId }).lean();
      if (!channel) return socket.sendError('CHANNEL_NOT_FOUND');

      if (channel.type !== 'public') {
        const isMember = (channel.members || []).some((m: any) => String(m) === userId);
        if (!isMember) return socket.sendError('FORBIDDEN', 'Not a member');
      }

      const safeLimit = Math.min(Number(limit) || 50, 100);
      const filter: Record<string, any> = { channelId };
      
      if (before) {
        const beforeDate = new Date(before);
        if (!isNaN(beforeDate.getTime())) filter.createdAt = { $lt: beforeDate };
      }

      const messages = await Message.find(filter)
        .populate('senderId', 'name email avatar')
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean();

      socket.emit('messages', { channelId, messages });
    } catch (e) {
      logger.error(`[WS] fetchMessages error: ${(e as Error).message}`);
      socket.sendError('SERVER_ERROR');
    }
  });
};