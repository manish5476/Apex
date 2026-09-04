import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

export interface TokenPayload {
  id: string | Types.ObjectId;
  sub?: string | Types.ObjectId;
  type?: string;
  organizationId?: Types.ObjectId;
  name?: string;
  email?: string;
  isSuperAdmin?: boolean;
  isOwner?: boolean;
  branchId?: Types.ObjectId;
  role?: string | Types.ObjectId;
}

export class AuthUtils {
  static signAccessToken(user: Partial<TokenPayload>): string {
    const userId = user.id;

    const payload: TokenPayload = {
      id: userId as string | Types.ObjectId,
      sub: userId, 
      type: 'merchant_user',
      organizationId: user.organizationId,
      ...(user.name && { name: user.name }),
      ...(user.email && { email: user.email }),
      isSuperAdmin: user.isSuperAdmin || false,
      isOwner: user.isOwner || false
    };

    return jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1h",
    });
  }

  static signRefreshToken(input: string | { id?: string; _id?: string }): string {
    let id: string;
    
    if (typeof input === 'string') {
      id = input;
    } else if (input._id) {
      id = input._id;
    } else if (input.id) {
      id = input.id;
    } else {
      throw new Error("Invalid user ID for Refresh Token");
    }
    
    return jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET as string, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
    });
  }

  static verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
    } catch {
      return null;
    }
  }

  static verifyRefreshToken(token: string): { id: string } | null {
    try {
      return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET as string) as { id: string };
    } catch {
      return null;
    }
  }

  static decodeToken(token: string): TokenPayload | null {
    try {
      return jwt.decode(token) as TokenPayload;
    } catch {
      return null;
    }
  }
}