'use strict';

/**
 * PortalAuthService
 * ─────────────────────────────────────────────
 * Handles customer self-service portal authentication.
 *
 * Customers authenticate with their CRM Customer record via
 * the portalAccess sub-document (email + password).
 * This is SEPARATE from CRM user (staff) authentication.
 *
 * Flow:
 *   register → find/create CRM Customer → set portalAccess → sign JWT
 *   login    → find Customer by portal email → compare password → sign JWT
 */

const crypto       = require('crypto');
const jwt          = require('jsonwebtoken');
const Customer     = require('../../../modules/organization/core/customer.model');
const AppError     = require('../../../core/utils/api/appError');

const PORTAL_JWT_SECRET  = () => process.env.STOREFRONT_JWT_SECRET || process.env.JWT_SECRET;
const PORTAL_JWT_EXPIRES = () => process.env.PORTAL_JWT_EXPIRES_IN || '30d';
const PORTAL_TOKEN_TYPE  = 'portal_customer';

class PortalAuthService {

  // ────────────────────────────────────────────────────────────────────
  // JWT helpers
  // ────────────────────────────────────────────────────────────────────

  signPortalToken(customer) {
    return jwt.sign(
      {
        type:           PORTAL_TOKEN_TYPE,
        crmCustomerId:  customer._id.toString(),
        organizationId: customer.organizationId.toString(),
      },
      PORTAL_JWT_SECRET(),
      { expiresIn: PORTAL_JWT_EXPIRES() }
    );
  }

  verifyPortalToken(token) {
    if (!token) return null;
    try {
      const payload = jwt.verify(token, PORTAL_JWT_SECRET());
      return payload?.type === PORTAL_TOKEN_TYPE ? payload : null;
    } catch {
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 1. REGISTER
  // Creates or upgrades a CRM Customer with portal access.
  // If the customer was auto-created from a storefront order (source:'storefront'),
  // we simply add portalAccess to that existing record.
  // ────────────────────────────────────────────────────────────────────
  async register(organizationId, payload) {
    const { email, password, firstName, lastName, phone } = payload;

    if (!email)               throw new AppError('Email is required', 400);
    if (!password || password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    const portalEmail = email.toLowerCase().trim();

    // Check if portal account already exists
    const portalExists = await Customer.findOne({
      organizationId,
      'portalAccess.email': portalEmail,
      'portalAccess.enabled': true,
      isDeleted: { $ne: true },
    });
    if (portalExists) {
      throw new AppError('A portal account already exists for this email', 409);
    }

    // Try to find existing CRM customer by phone or email (created from previous orders)
    let customer = null;
    if (phone) {
      customer = await Customer.findOne({
        organizationId,
        phone,
        isDeleted: { $ne: true },
      }).select('+portalAccess.passwordHash +portalAccess.resetToken +portalAccess.resetExpires');
    }
    if (!customer && email) {
      customer = await Customer.findOne({
        organizationId,
        email: portalEmail,
        isDeleted: { $ne: true },
      }).select('+portalAccess.passwordHash +portalAccess.resetToken +portalAccess.resetExpires');
    }

    if (customer) {
      // Upgrade existing CRM customer with portal access
      customer.portalAccess.email = portalEmail;
      if (firstName && !customer.name?.includes(' ')) customer.name = [firstName, lastName].filter(Boolean).join(' ') || customer.name;
      await customer.setPortalPassword(password);
      await customer.save();
      return customer;
    }

    // No existing record — create a new CRM customer
    const name = [firstName, lastName].filter(Boolean).join(' ').trim() || portalEmail;

    if (!phone) throw new AppError('Phone number is required to create an account', 400);

    try {
      customer = new Customer({
        organizationId,
        type:         'individual',
        name,
        email:        portalEmail,
        phone,
        source:       'storefront',
        customerType: 'online',
        tags:         ['portal'],
      });
      customer.portalAccess.email = portalEmail;
      await customer.setPortalPassword(password);
      await customer.save();
      return customer;
    } catch (err) {
      if (err.code === 11000) {
        throw new AppError('An account already exists with this phone number or email', 409);
      }
      throw err;
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 2. LOGIN
  // ────────────────────────────────────────────────────────────────────
  async login(organizationId, email, password) {
    if (!email || !password) throw new AppError('Email and password are required', 400);

    const portalEmail = email.toLowerCase().trim();

    const customer = await Customer.findOne({
      organizationId,
      'portalAccess.email': portalEmail,
      'portalAccess.enabled': true,
      isDeleted: { $ne: true },
      isActive: { $ne: false },
    }).select('+portalAccess.passwordHash +portalAccess.resetToken +portalAccess.resetExpires');

    if (!customer) {
      throw new AppError('Invalid email or password', 401);
    }

    const passwordOk = await customer.comparePortalPassword(password);
    if (!passwordOk) {
      throw new AppError('Invalid email or password', 401);
    }

    customer.portalAccess.lastLoginAt = new Date();
    await customer.save();

    return customer;
  }

  // ────────────────────────────────────────────────────────────────────
  // 3. FORGOT PASSWORD
  // ────────────────────────────────────────────────────────────────────
  async forgotPassword(organizationId, email) {
    if (!email) throw new AppError('Email is required', 400);

    const portalEmail = email.toLowerCase().trim();
    const customer = await Customer.findOne({
      organizationId,
      'portalAccess.email': portalEmail,
      'portalAccess.enabled': true,
      isDeleted: { $ne: true },
    }).select('+portalAccess.passwordHash +portalAccess.resetToken +portalAccess.resetExpires');

    // Always return success to prevent email enumeration
    if (!customer) {
      return { message: 'If a portal account exists for this email, a reset link has been sent.' };
    }

    const rawToken = customer.createPortalResetToken();
    await customer.save({ validateBeforeSave: false });

    // TODO: integrate with email/WhatsApp notification service
    console.log(`[Portal Password Reset] Token for ${portalEmail}: ${rawToken}`);

    return { message: 'Password reset link sent to your email.' };
  }

  // ────────────────────────────────────────────────────────────────────
  // 4. RESET PASSWORD
  // ────────────────────────────────────────────────────────────────────
  async resetPassword(organizationId, rawToken, newPassword) {
    if (!rawToken || !newPassword) throw new AppError('Token and new password are required', 400);
    if (newPassword.length < 8) throw new AppError('Password must be at least 8 characters', 400);

    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const customer = await Customer.findOne({
      organizationId,
      'portalAccess.resetToken':   hashedToken,
      'portalAccess.resetExpires': { $gt: new Date() },
      'portalAccess.enabled': true,
      isDeleted: { $ne: true },
    }).select('+portalAccess.passwordHash +portalAccess.resetToken +portalAccess.resetExpires');

    if (!customer) throw new AppError('Reset token is invalid or has expired', 400);

    await customer.setPortalPassword(newPassword);
    customer.portalAccess.resetToken   = undefined;
    customer.portalAccess.resetExpires = undefined;
    await customer.save();

    return customer;
  }

  // ────────────────────────────────────────────────────────────────────
  // 5. CHANGE PASSWORD (logged-in customer)
  // ────────────────────────────────────────────────────────────────────
  async changePassword(organizationId, customerId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) throw new AppError('Current and new passwords are required', 400);
    if (newPassword.length < 8) throw new AppError('New password must be at least 8 characters', 400);

    const customer = await Customer.findOne({
      _id: customerId,
      organizationId,
      'portalAccess.enabled': true,
      isDeleted: { $ne: true },
    }).select('+portalAccess.passwordHash +portalAccess.resetToken +portalAccess.resetExpires');

    if (!customer) throw new AppError('Customer not found', 404);

    const ok = await customer.comparePortalPassword(currentPassword);
    if (!ok) throw new AppError('Current password is incorrect', 401);

    await customer.setPortalPassword(newPassword);
    await customer.save();
    return customer;
  }
}

module.exports = new PortalAuthService();
