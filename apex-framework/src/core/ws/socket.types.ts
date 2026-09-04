import { Socket } from 'socket.io';
import { Types } from 'mongoose';

export interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

export interface SocketUser {
  _id: Types.ObjectId;
  id: string;
  email: string;
  name: string;
  organizationId: Types.ObjectId;
  orgId: string;
  role: string;
  isAdmin: boolean;
}

export interface AuthenticatedSocket extends Socket {
  user: SocketUser;
  joinedChannels: Set<string>;
  rateLimits: Map<string, RateLimitBucket>;
  
  // Custom emit helper for strict error formatting
  sendError: (code: string, message?: string) => void;
  // Custom rate limit enforcer
  enforceRateLimit: (event: string, maxTokens: number, refillMs: number) => boolean;
}