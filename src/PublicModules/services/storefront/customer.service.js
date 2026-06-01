'use strict';

const StorefrontCustomer = require('../../models/storefront/storefrontCustomer.model');
const StorefrontCustomerAddress = require('../../models/storefront/storefrontCustomerAddress.model');
const StorefrontWishlist = require('../../models/storefront/storefrontWishlist.model');
const StorefrontOrder = require('../../models/storefront/storefrontOrder.model');
const StorefrontCart = require('../../models/storefront/storefrontCart.model');
const Customer = require('../../../modules/organization/core/customer.model');
const AppError = require('../../../core/utils/api/appError');
const crypto = require('crypto');

class StorefrontCustomerService {
  async getOrCreateGuest(organizationId, sessionId, payload = {}) {
    const email = payload.email?.toLowerCase?.() || null;
    const phone = payload.phone || null;

    let customer = null;
    if (email || phone) {
      customer = await StorefrontCustomer.findOne({
        organizationId,
        $or: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : [])
        ]
      });
    }

    if (!customer) {
      try {
        customer = await StorefrontCustomer.create({
          organizationId,
          email,
          phone,
          firstName: payload.firstName ?? '',
          lastName: payload.lastName ?? '',
          guestAccount: true,
          authProvider: 'guest',
          marketingOptIn: !!payload.marketingOptIn,
          metadata: { firstSessionId: sessionId }
        });
      } catch (err) {
        if (err.code === 11000) {
          customer = await StorefrontCustomer.findOne({
            organizationId,
            $or: [
              ...(email ? [{ email }] : []),
              ...(phone ? [{ phone }] : [])
            ]
          });
        } else {
          throw err;
        }
      }
    } else {
      customer.lastSeenAt = new Date();
      if (payload.firstName && !customer.firstName) customer.firstName = payload.firstName;
      if (payload.lastName && !customer.lastName) customer.lastName = payload.lastName;
      if (phone && !customer.phone) customer.phone = phone;
      try {
        await customer.save();
      } catch (err) {
        if (err.code === 11000) {
          console.warn('[StorefrontCustomerService] Ignoring duplicate key on update for guest customer:', err.message);
        } else {
          throw err;
        }
      }
    }

    return customer;
  }

  async register(organizationId, payload) {
    if (!payload.email) throw new AppError('Email is required', 400);
    if (!payload.password || payload.password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    const existing = await StorefrontCustomer.findOne({ organizationId, email: payload.email.toLowerCase() });
    if (existing && !existing.guestAccount) throw new AppError('A storefront account already exists for this email', 409);

    const customer = existing ?? new StorefrontCustomer({ organizationId, email: payload.email.toLowerCase() });
    customer.firstName = payload.firstName ?? customer.firstName;
    customer.lastName = payload.lastName ?? customer.lastName;
    customer.phone = payload.phone ?? customer.phone;
    customer.marketingOptIn = !!payload.marketingOptIn;
    await customer.setPassword(payload.password);
    
    try {
      await customer.save();
    } catch (err) {
      if (err.code === 11000) {
        if (err.message.includes('phone_1')) {
          throw new AppError('A storefront account already exists with this phone number', 409);
        }
        throw new AppError('A storefront account already exists with these details', 409);
      }
      throw err;
    }

    return customer;
  }

  async login(organizationId, email, password) {
    const customer = await StorefrontCustomer.findOne({ organizationId, email: email?.toLowerCase(), status: 'active' }).select('+passwordHash');
    if (!customer || !(await customer.comparePassword(password))) {
      throw new AppError('Invalid storefront credentials', 401);
    }
    customer.lastSeenAt = new Date();
    await customer.save();
    return customer;
  }

  async forgotPassword(organizationId, email) {
    if (!email) throw new AppError('Email is required', 400);
    const customer = await StorefrontCustomer.findOne({ organizationId, email: email.toLowerCase(), status: 'active' });
    if (!customer) {
      // Return a generic message to prevent email enumeration
      return { message: 'If an account exists with that email, a password reset link has been sent.' };
    }

    const resetToken = customer.createPasswordResetToken();
    await customer.save({ validateBeforeSave: false });

    // In a production environment, send an email here.
    // For now, logging the reset token to console.
    console.log(`[Storefront Password Reset] Use this token to reset password: ${resetToken}`);

    return { message: 'Password reset link sent to email.' };
  }

  async resetPassword(organizationId, token, newPassword) {
    if (!token || !newPassword) throw new AppError('Token and new password are required', 400);
    if (newPassword.length < 8) throw new AppError('Password must be at least 8 characters', 400);

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const customer = await StorefrontCustomer.findOne({
      organizationId,
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
      status: 'active'
    });

    if (!customer) {
      throw new AppError('Token is invalid or has expired', 400);
    }

    await customer.setPassword(newPassword);
    customer.passwordResetToken = undefined;
    customer.passwordResetExpires = undefined;
    await customer.save();

    return customer;
  }

  async updatePassword(organizationId, customerId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) throw new AppError('Current and new password are required', 400);
    if (newPassword.length < 8) throw new AppError('Password must be at least 8 characters', 400);

    const customer = await StorefrontCustomer.findOne({ _id: customerId, organizationId, status: 'active' }).select('+passwordHash');
    if (!customer) throw new AppError('Customer not found', 404);

    if (!(await customer.comparePassword(currentPassword))) {
      throw new AppError('Current password is incorrect', 401);
    }

    await customer.setPassword(newPassword);
    await customer.save();
    return customer;
  }

  async addAddress(organizationId, customerId, payload) {
    const count = await StorefrontCustomerAddress.countDocuments({ organizationId, customerId });
    const isDefault = payload.isDefault === true || count === 0;

    if (isDefault) {
      await StorefrontCustomerAddress.updateMany({ organizationId, customerId }, { $set: { isDefault: false } });
    }

    const address = await StorefrontCustomerAddress.create({
      ...payload,
      organizationId,
      customerId,
      isDefault
    });

    if (isDefault) {
      await StorefrontCustomer.findOneAndUpdate({ _id: customerId, organizationId }, { defaultAddressId: address._id });
    }

    return address;
  }

  async updateAddress(organizationId, customerId, addressId, payload) {
    const address = await StorefrontCustomerAddress.findOne({ _id: addressId, organizationId, customerId });
    if (!address) throw new AppError('Address not found', 404);

    const wasDefault = address.isDefault === true;
    const isDefault = payload.isDefault === true;

    if (isDefault) {
      await StorefrontCustomerAddress.updateMany({ organizationId, customerId }, { $set: { isDefault: false } });
    }

    const allowedFields = [
      'fullName', 'phone', 'country', 'state', 'city',
      'postalCode', 'addressLine1', 'addressLine2', 'landmark', 'addressType'
    ];

    allowedFields.forEach(field => {
      if (payload[field] !== undefined) {
        address[field] = payload[field];
      }
    });
    address.isDefault = isDefault;
    await address.save();

    if (isDefault) {
      await StorefrontCustomer.findOneAndUpdate({ _id: customerId, organizationId }, { defaultAddressId: address._id });
    } else if (wasDefault) {
      // If we are un-defaulting this address, clear defaultAddressId if it matches this one
      await StorefrontCustomer.findOneAndUpdate({ _id: customerId, organizationId, defaultAddressId: address._id }, { $unset: { defaultAddressId: 1 } });
    }

    return address;
  }

  async toggleWishlist(organizationId, customerId, productId, variantId = null) {
    const query = { organizationId, customerId, productId, variantId };
    const existing = await StorefrontWishlist.findOne(query);
    if (existing) {
      await existing.deleteOne();
      return { action: 'removed', productId, variantId };
    }
    
    try {
      await StorefrontWishlist.create(query);
      return { action: 'added', productId, variantId };
    } catch (error) {
      if (error.code === 11000) {
        return { action: 'added', productId, variantId };
      }
      throw error;
    }
  }

  async getDashboard(organizationId, customerId) {
    const [customer, addresses, orders, wishlist, carts] = await Promise.all([
      StorefrontCustomer.findOne({ _id: customerId, organizationId }).lean(),
      StorefrontCustomerAddress.find({ customerId, organizationId }).sort({ isDefault: -1, updatedAt: -1 }).lean(),
      StorefrontOrder.find({ customerId, organizationId }).sort({ createdAt: -1 }).limit(20).lean(),
      StorefrontWishlist.find({ customerId, organizationId }).populate('productId', 'name slug images sellingPrice discountedPrice').lean(),
      StorefrontCart.find({ customerId, organizationId, status: { $in: ['active', 'abandoned'] } }).sort({ updatedAt: -1 }).limit(5).lean()
    ]);

    if (!customer) throw new AppError('Storefront customer not found', 404);
    return { customer, addresses, orders, wishlist, carts };
  }

  async listAdmin(organizationId, params = {}) {
    const query = { organizationId };
    if (params.status) query.status = params.status;
    if (params.converted !== undefined) query.convertedToMainCustomer = params.converted === 'true';
    if (params.guest !== undefined) query.guestAccount = params.guest === 'true';
    if (params.search) {
      const rx = new RegExp(params.search, 'i');
      query.$or = [{ email: rx }, { phone: rx }, { firstName: rx }, { lastName: rx }];
    }

    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 100);
    const [data, total] = await Promise.all([
      StorefrontCustomer.find(query).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      StorefrontCustomer.countDocuments(query)
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async detailAdmin(organizationId, customerId) {
    const data = await this.getDashboard(organizationId, customerId);
    const abandonedCarts = await StorefrontCart.find({ organizationId, customerId, status: 'abandoned' }).sort({ updatedAt: -1 }).lean();
    return { ...data, abandonedCarts };
  }

  async convertToCrmCustomer(organizationId, storefrontCustomerId, actorId = null) {
    const customer = await StorefrontCustomer.findOne({ _id: storefrontCustomerId, organizationId });
    if (!customer) throw new AppError('Storefront customer not found', 404);
    if (customer.convertedToMainCustomer && customer.linkedCustomerId) {
      return { storefrontCustomer: customer, crmCustomerId: customer.linkedCustomerId, alreadyConverted: true };
    }

    const defaultAddress = customer.defaultAddressId
      ? await StorefrontCustomerAddress.findOne({ _id: customer.defaultAddressId, organizationId }).lean()
      : await StorefrontCustomerAddress.findOne({ customerId: customer._id, organizationId }).sort({ isDefault: -1, updatedAt: -1 }).lean();

    const name = customer.fullName || customer.email || customer.phone || 'Storefront Customer';
    const phone = customer.phone || defaultAddress?.phone;
    if (!phone) throw new AppError('A phone number is required before converting to CRM customer', 400);

    const existingQuery = {
      organizationId,
      isDeleted: { $ne: true },
      $or: [
        { phone },
        ...(customer.email ? [{ email: customer.email }] : [])
      ]
    };

    let crmCustomer = await Customer.findOne(existingQuery);
    if (!crmCustomer) {
      crmCustomer = await Customer.create({
        organizationId,
        type: 'individual',
        name,
        avatar: customer.avatar,
        email: customer.email,
        phone,
        billingAddress: defaultAddress ? this.mapAddress(defaultAddress) : undefined,
        shippingAddress: defaultAddress ? this.mapAddress(defaultAddress) : undefined,
        tags: [...new Set([...(customer.tags ?? []), 'storefront-converted'])],
        notes: [
          customer.notes,
          `Converted from storefront customer ${customer._id}`
        ].filter(Boolean).join('\n'),
        createdBy: actorId,
        updatedBy: actorId
      });
    } else {
      const tags = new Set([...(crmCustomer.tags || []), 'storefront-converted']);
      crmCustomer.tags = Array.from(tags);
      crmCustomer.email = crmCustomer.email || customer.email;
      crmCustomer.avatar = crmCustomer.avatar || customer.avatar;
      if (defaultAddress && !crmCustomer.shippingAddress?.street) {
        crmCustomer.shippingAddress = this.mapAddress(defaultAddress);
      }
      if (defaultAddress && !crmCustomer.billingAddress?.street) {
        crmCustomer.billingAddress = this.mapAddress(defaultAddress);
      }
      crmCustomer.notes = [
        crmCustomer.notes,
        `Linked from storefront customer ${customer._id}`
      ].filter(Boolean).join('\n');
      crmCustomer.updatedBy = actorId;
      await crmCustomer.save();
    }

    customer.convertedToMainCustomer = true;
    customer.linkedCustomerId = crmCustomer._id;
    await customer.save();

    await StorefrontOrder.updateMany(
      { organizationId, customerId: customer._id },
      { $set: { 'metadata.linkedCustomerId': crmCustomer._id } }
    );

    return { storefrontCustomer: customer, crmCustomerId: crmCustomer._id, alreadyConverted: false };
  }

  mapAddress(address) {
    return {
      street: [address.addressLine1, address.addressLine2, address.landmark].filter(Boolean).join(', '),
      city: address.city,
      state: address.state,
      zipCode: address.postalCode,
      country: address.country
    };
  }
}

module.exports = new StorefrontCustomerService();
