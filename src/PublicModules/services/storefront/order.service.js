'use strict';

const StorefrontCart = require('../../models/storefront/storefrontCart.model');
const StorefrontCartItem = require('../../models/storefront/storefrontCartItem.model');
const StorefrontOrder = require('../../models/storefront/storefrontOrder.model');
const StorefrontCustomer = require('../../models/storefront/storefrontCustomer.model');
const Product = require('../../../modules/inventory/core/model/product.model');
const CustomerService = require('./customer.service');
const CartService = require('./cart.service');
const AppError = require('../../../core/utils/api/appError');

class StorefrontOrderService {
  async createFromCart(organizationId, identity, payload = {}) {
    const validation = await CartService.validateForCheckout(organizationId, identity);
    if (!validation.valid) {
      const err = new AppError('Cart has validation issues', 409);
      err.issues = validation.issues;
      throw err;
    }

    const cart = await StorefrontCart.findOne({
      organizationId,
      status: 'active',
      ...(identity.customerId ? { customerId: identity.customerId } : { sessionId: identity.sessionId })
    }).lean();
    if (!cart) throw new AppError('Cart not found', 404);

    const items = await StorefrontCartItem.find({ cartId: cart._id, organizationId }).lean();
    if (items.length === 0) throw new AppError('Cart is empty', 400);

    let customerId = identity.customerId;
    if (!customerId) {
      const guest = await CustomerService.getOrCreateGuest(organizationId, identity.sessionId, payload.customer ?? payload.contact ?? {});
      customerId = guest._id;
    }

    const shippingAddress = this.normalizeAddress(payload.shippingAddress);
    const billingAddress = this.normalizeAddress(payload.billingAddress ?? payload.shippingAddress);
    if (!shippingAddress || !billingAddress) throw new AppError('Shipping and billing addresses are required', 400);

    if (payload.saveAddress && customerId) {
      await CustomerService.addAddress(organizationId, customerId, { ...shippingAddress, isDefault: payload.defaultAddress ?? false });
    }

    const orderItems = items.map(item => {
      const unitPrice = item.snapshot.discountedPrice ?? item.snapshot.sellingPrice;
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
      return {
        productId: item.productId,
        variantId: item.variantId,
        branchId: item.branchId,
        snapshot: item.snapshot,
        quantity: item.quantity,
        unitPrice,
        taxAmount: 0,
        discountAmount: 0,
        lineTotal
      };
    });

    const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount = cart.discountTotals?.total ?? 0;
    const shipping = cart.shippingTotals?.total ?? 0;
    const tax = cart.taxTotals?.total ?? 0;
    const grandTotal = Math.max(0, subtotal - discount + shipping + tax);

    const order = await StorefrontOrder.create({
      organizationId,
      storefrontId: cart.storefrontId,
      customerId,
      sessionId: identity.sessionId,
      guestOrder: !identity.customerId,
      cartId: cart._id,
      shippingAddress,
      billingAddress,
      items: orderItems,
      totals: {
        subtotal: Number(subtotal.toFixed(2)),
        discount,
        shipping,
        tax,
        grandTotal: Number(grandTotal.toFixed(2)),
        currency: cart.currency
      },
      appliedCoupons: (cart.appliedCoupons ?? []).map(c => c.code),
      metadata: {
        paymentIntentId: payload.paymentIntentId ?? null,
        linkedCustomerId: null
      }
    });

    // Lock Inventory (Reserve Stock)
    const lockPromises = orderItems.map(async (item) => {
      if (!item.productId) return;
      const product = await Product.findOne({ _id: item.productId, organizationId });
      if (product && product.inventory && product.inventory.length > 0) {
        let inv = product.inventory.find(i => i.branchId.toString() === item.branchId?.toString());
        if (!inv) inv = product.inventory[0]; // fallback to first branch if not specified
        inv.reservedQuantity = (inv.reservedQuantity || 0) + item.quantity;
        await product.save();
      }
    });

    await Promise.all([
      ...lockPromises,
      StorefrontCart.updateOne({ _id: cart._id }, { $set: { status: 'converted' } }),
      StorefrontCustomer.updateOne(
        { _id: customerId, organizationId },
        {
          $set: { lastOrderAt: new Date(), lastSeenAt: new Date() },
          $inc: { orderCount: 1, totalSpent: order.totals.grandTotal }
        }
      )
    ]);

    return order;
  }

  async listForCustomer(organizationId, customerId) {
    return StorefrontOrder.find({ organizationId, customerId }).sort({ createdAt: -1 }).lean();
  }

  async trackOrder(organizationId, orderNumber, emailOrPhone) {
    const order = await StorefrontOrder.findOne({ organizationId, orderNumber }).populate('customerId', 'email phone firstName lastName').lean();
    if (!order) throw new AppError('Order not found', 404);
    const email = order.customerId?.email;
    const phone = order.customerId?.phone;
    if (emailOrPhone && emailOrPhone !== email && emailOrPhone !== phone) {
      throw new AppError('Order verification failed', 403);
    }
    return order;
  }

  normalizeAddress(address) {
    if (!address) return null;
    return {
      fullName: address.fullName || address.name,
      phone: address.phone,
      country: address.country || 'India',
      state: address.state,
      city: address.city,
      postalCode: address.postalCode || address.zipCode,
      addressLine1: address.addressLine1 || address.street,
      addressLine2: address.addressLine2 || '',
      landmark: address.landmark || ''
    };
  }
}

module.exports = new StorefrontOrderService();
