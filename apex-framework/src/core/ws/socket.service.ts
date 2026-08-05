import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import logger from '../logger';
import { socketAuthMiddleware } from './socket.auth';
import { AuthenticatedSocket } from './socket.types';
import { presence } from './socket.presence';
import { SocketUtils } from './socket.utils';

// Import domain handlers
import { registerChatHandlers } from '@modules/communication/api/ws/chat.socket';
import { registerNotificationHandlers } from '@modules/notification/api/ws/notification.socket';
import { registerOrgHandlers } from '@modules/organization/api/ws/org.socket';

class SocketService {
  private io: Server | null = null;

  public init(server: HttpServer, options: any = {}): Server {
    if (this.io) return this.io;

    const {
      cors,
      redisUrl = process.env.REDIS_URL,
      pingTimeout = 30000,
      pingInterval = 10000,
    } = options;

    this.io = new Server(server, {
      cors: cors || { origin: '*', credentials: true },
      transports: ['websocket', 'polling'],
      pingTimeout,
      pingInterval,
      maxHttpBufferSize: 1e6, // 1 MB
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: false,
      },
    });

    this.io.engine.on('connection_error', (err) => {
      logger.error(`❌ Socket Engine Error: ${err.message}`, { code: err.code });
    });

    if (redisUrl) {
      this.setupRedisAdapter(redisUrl);
    }

    this.io.use(socketAuthMiddleware);

    this.io.on('connection', (rawSocket: Socket) => {
      const socket = rawSocket as AuthenticatedSocket;
      this.handleConnection(socket);
      
      // Inject helpers into the socket for the domain handlers to use
      socket.sendError = (code: string, message?: string) => {
        socket.emit('error', { code, message: message || code });
      };
      
      socket.enforceRateLimit = (event: string, maxTokens: number, refillMs: number) => {
        if (!SocketUtils.checkRateLimit(socket.rateLimits, event, maxTokens, refillMs)) {
          socket.sendError('RATE_LIMITED', `Slow down on "${event}"`);
          return false;
        }
        return true;
      };

      // ── Delegate to Domain Modules ──
      registerChatHandlers(this.io!, socket);
      registerNotificationHandlers(this.io!, socket);
      registerOrgHandlers(this.io!, socket);

      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
    });

    return this.io;
  }

  private async setupRedisAdapter(redisUrl: string) {
    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.io!.adapter(createAdapter(pubClient, subClient));
      logger.info('✅ Socket.IO Redis adapter connected');
    } catch (err) {
      logger.error(`❌ Redis adapter error: ${(err as Error).message}`);
    }
  }

  private handleConnection(socket: AuthenticatedSocket) {
    const { id: userId, orgId, role } = socket.user;
    logger.info(`🔌 Connected: ${socket.id} | user=${userId} org=${orgId}`);

    presence.addSocketForUser(userId, socket.id);

    if (presence.getSocketIdsForUser(userId).length === 1) {
      presence.addOrgOnlineUser(orgId, userId);
      this.io!.to(`org:${orgId}`).emit('userOnline', {
        userId,
        organizationId: orgId,
        timestamp: new Date().toISOString(),
      });
    }

    socket.join(`org:${orgId}`);
    socket.join(`user:${userId}`);
    if (role) socket.join(`role:${String(role)}`);

    socket.emit('connectionEstablished', {
      userId,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    socket.on('ping', () => socket.emit('pong', { timestamp: new Date().toISOString() }));
  }

  private handleDisconnect(socket: AuthenticatedSocket, reason: string) {
    const { id: userId, orgId } = socket.user;
    logger.info(`🔌 Disconnected: ${socket.id} | user=${userId} | reason=${reason}`);

    presence.removeSocketForUser(userId, socket.id);

    for (const chId of socket.joinedChannels) {
      presence.removeUserFromChannel(chId, userId);
      this.io!.to(`channel:${chId}`).emit('userLeftChannel', {
        userId,
        channelId: chId,
        timestamp: new Date().toISOString(),
      });
    }
    socket.joinedChannels.clear();
    socket.rateLimits.clear();

    if (presence.getSocketIdsForUser(userId).length === 0) {
      presence.removeOrgOnlineUser(orgId, userId);
      this.io!.to(`org:${orgId}`).emit('userOffline', {
        userId,
        organizationId: orgId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── Helpers exported for REST Controllers ──
  public emitToOrg(orgId: string, event: string, payload: any) { this.io?.to(`org:${orgId}`).emit(event, payload); }
  public emitToUser(userId: string, event: string, payload: any) { this.io?.to(`user:${userId}`).emit(event, payload); }
  public emitToChannel(channelId: string, event: string, payload: any) { this.io?.to(`channel:${channelId}`).emit(event, payload); }
  
  public forceDisconnectUser(userId: string) {
    if (!this.io) return;
    for (const sId of presence.getSocketIdsForUser(userId)) {
      const s = this.io.sockets.sockets.get(sId);
      if (s) {
        s.emit('forceLogout', { reason: 'forced_by_server' });
        s.disconnect(true);
      }
    }
  }
}

export const SocketApp = new SocketService();