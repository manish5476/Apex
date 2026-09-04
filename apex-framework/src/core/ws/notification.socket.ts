import { Server } from 'socket.io';
import { AuthenticatedSocket } from '@core/ws/socket.types';
import { SocketUtils } from '@core/ws/socket.utils';
import NotificationModel from '@modules/notification/infrastructure/models/notification.model';
import mongoose from 'mongoose';

export const registerNotificationHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const { id: userId, orgId, isAdmin, role } = socket.user;

  socket.on('subscribeNotifications', async () => {
    try {
      socket.join(`notifications:${userId}`);
      const notifications = await NotificationModel.find({ recipientId: socket.user._id, isRead: false })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      socket.emit('initialNotifications', { notifications });
    } catch (e) {
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('sendNotification', async (payload: any = {}) => {
    if (!isAdmin) return socket.sendError('FORBIDDEN');
    if (!socket.enforceRateLimit('sendNotification', 10, 5000)) return;

    const { recipientId, metadata } = payload;
    const title = SocketUtils.sanitize(payload.title, 200);
    const message = SocketUtils.sanitize(payload.message, 1000);
    const type = SocketUtils.sanitize(payload.type || 'info', 20);

    if (!recipientId || !SocketUtils.isValidObjectId(recipientId) || !title || !message) {
      return socket.sendError('INVALID_PAYLOAD');
    }

    try {
      const notification = await NotificationModel.create({
        organizationId: orgId,
        recipientId,
        title,
        message,
        type,
        metadata: metadata || {},
        createdBy: socket.user._id,
      });

      io.to(`notifications:${recipientId}`).emit('newNotification', notification);
      socket.emit('notificationSent', { notificationId: notification._id });
    } catch (e) {
      socket.sendError('SERVER_ERROR');
    }
  });

  socket.on('createAnnouncement', async (payload: any = {}) => {
    if (!isAdmin) return socket.sendError('FORBIDDEN');
    if (!socket.enforceRateLimit('createAnnouncement', 5, 10000)) return;

    const title = SocketUtils.sanitize(payload.title, 200);
    const message = SocketUtils.sanitize(payload.message, 2000);
    const type = SocketUtils.sanitize(payload.type || 'info', 20);
    const { targetOrgId } = payload;

    if (String(targetOrgId) !== orgId && role !== 'superadmin') {
      return socket.sendError('FORBIDDEN', 'Cross-org announcements require superadmin');
    }

    try {
      const announcement = {
        _id: new mongoose.Types.ObjectId(),
        title, message, type, senderId: userId, organizationId: targetOrgId, createdAt: new Date(),
      };
      io.to(`org:${targetOrgId}`).emit('newAnnouncement', { data: announcement });
    } catch (e) {
      socket.sendError('SERVER_ERROR');
    }
  });
};