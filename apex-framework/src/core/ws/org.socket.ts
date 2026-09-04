import { Server } from 'socket.io';
import { AuthenticatedSocket } from '@core/ws/socket.types';
import { presence } from '@core/ws/socket.presence';
import { SocketUtils } from '@core/ws/socket.utils';
import User from '@modules/iam/infrastructure/models/user.model';

export const registerOrgHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const { id: userId, orgId, isAdmin } = socket.user;

  socket.on('joinOrg', ({ organizationId }: any = {}) => {
    if (!organizationId || String(organizationId) !== orgId) return socket.sendError('INVALID_ORG');
    socket.join(`org:${organizationId}`);
    socket.emit('orgOnlineUsers', {
      organizationId: orgId,
      users: presence.getOnlineUsersInOrg(orgId),
    });
  });

  socket.on('getOnlineUsers', ({ channelId }: any = {}) => {
    if (channelId) {
      const online = presence.getUsersInChannel(channelId).filter((uid) => presence.getSocketIdsForUser(uid).length > 0);
      socket.emit('onlineUsersInChannel', { channelId, users: online });
    } else {
      socket.emit('onlineUsersInOrg', { users: presence.getOnlineUsersInOrg(orgId) });
    }
  });

  socket.on('admin:forceDisconnect', ({ targetUserId }: any = {}) => {
    if (!isAdmin) return socket.sendError('FORBIDDEN');
    if (!targetUserId || !SocketUtils.isValidObjectId(targetUserId)) return socket.sendError('INVALID_PAYLOAD');

    for (const sId of presence.getSocketIdsForUser(targetUserId)) {
      const s = io.sockets.sockets.get(sId);
      if (s) {
        s.emit('forceLogout', { reason: 'disabled_by_admin', timestamp: new Date().toISOString() });
        s.disconnect(true);
      }
    }
    socket.emit('admin:forceDisconnectSuccess', { targetUserId });
  });

  socket.on('admin:getStats', () => {
    if (!isAdmin) return socket.sendError('FORBIDDEN');
    socket.emit('systemStats', {
      connectedUsers: presence.getOnlineUsers().length,
      orgOnlineUsers: presence.getOnlineUsersInOrg(orgId).length,
      activeChannels: presence.getActiveChannelsCount(),
      totalConnections: presence.getTotalConnections(),
      timestamp: new Date().toISOString(),
    });
  });
};