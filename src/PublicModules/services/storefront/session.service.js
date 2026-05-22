'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const StorefrontSession = require('../../models/storefront/storefrontSession.model');

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const TOKEN_COOKIE = 'sf_session';
const AUTH_COOKIE = 'sf_auth';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

class StorefrontSessionService {
  cookieNames = { session: TOKEN_COOKIE, auth: AUTH_COOKIE };

  cookieOptions(maxAge = SESSION_TTL) {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge
    };
  }

  async resolve(req, res, organizationId, storefrontId = null) {
    const authPayload = this.verifyAuthToken(req.cookies?.[AUTH_COOKIE]);
    const rawToken = req.cookies?.[TOKEN_COOKIE] || nanoid(48);
    const sessionTokenHash = hashToken(rawToken);

    let session = await StorefrontSession.findOne({
      organizationId,
      sessionTokenHash,
      expiresAt: { $gt: new Date() }
    });

    if (!session) {
      session = await StorefrontSession.create({
        organizationId,
        storefrontId,
        customerId: authPayload?.storefrontCustomerId ?? null,
        sessionTokenHash,
        guest: !authPayload?.storefrontCustomerId,
        userAgent: req.get?.('user-agent') ?? '',
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + SESSION_TTL)
      });
      res.cookie(TOKEN_COOKIE, rawToken, this.cookieOptions());
    } else {
      session.lastSeenAt = new Date();
      if (authPayload?.storefrontCustomerId && !session.customerId) {
        session.customerId = authPayload.storefrontCustomerId;
        session.guest = false;
      }
      await session.save();
    }

    return {
      session,
      identity: {
        sessionId: session._id,
        customerId: authPayload?.storefrontCustomerId ?? session.customerId ?? null
      },
      rawSessionToken: rawToken
    };
  }

  signCustomer(customer) {
    return jwt.sign(
      {
        type: 'storefront_customer',
        storefrontCustomerId: customer._id.toString(),
        organizationId: customer.organizationId.toString()
      },
      process.env.STOREFRONT_JWT_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.STOREFRONT_JWT_EXPIRES_IN || '30d' }
    );
  }

  verifyAuthToken(token) {
    if (!token) return null;
    try {
      const payload = jwt.verify(token, process.env.STOREFRONT_JWT_SECRET || process.env.JWT_SECRET);
      return payload?.type === 'storefront_customer' ? payload : null;
    } catch {
      return null;
    }
  }
}

module.exports = new StorefrontSessionService();
