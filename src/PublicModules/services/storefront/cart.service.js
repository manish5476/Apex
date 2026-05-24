'use strict';

const mongoose = require('mongoose');
const StorefrontCart = require('../../models/storefront/storefrontCart.model');
const StorefrontCartItem = require('../../models/storefront/storefrontCartItem.model');
const Product = require('../../../modules/inventory/core/model/product.model');
const AppError = require('../../../core/utils/api/appError');

const GUEST_CART_TTL = 7 * 24 * 60 * 60 * 1000;
const CUSTOMER_CART_TTL = 30 * 24 * 60 * 60 * 1000;

class CartService {
  async getOrCreate(organizationId, identity, options = {}) {
    this._validateIdentity(identity);
    let cart = await this._findActiveCart(organizationId, identity);

    if (!cart) {
      cart = await StorefrontCart.create({
        organizationId,
        storefrontId: options.storefrontId ?? null,
        customerId: identity.customerId ?? null,
        sessionId: identity.sessionId ?? null,
        currency: options.currency ?? 'INR',
        expiresAt: new Date(Date.now() + (identity.customerId ? CUSTOMER_CART_TTL : GUEST_CART_TTL))
      });
    }

    return this._toDTO(cart);
  }

  async addItem(organizationId, identity, productId, quantity = 1, branchId = null, variantId = null) {
    if (!mongoose.isValidObjectId(productId)) throw new AppError('Invalid product ID', 400);
    if (quantity < 1 || !Number.isInteger(quantity)) throw new AppError('Quantity must be a positive integer', 400);

    const product = await Product.findOne({
      _id: productId,
      organizationId,
      isActive: true,
      isDeleted: { $ne: true }
    }).lean();
    if (!product) throw new AppError('Product not found or unavailable', 404);

    const availableStock = this._getStock(product, branchId);
    if (availableStock < quantity) {
      throw new AppError(`Only ${availableStock} unit(s) available for "${product.name}"`, 400);
    }

    const cart = await this._findActiveCart(organizationId, identity)
      ?? await StorefrontCart.create({
        organizationId,
        customerId: identity.customerId ?? null,
        sessionId: identity.sessionId ?? null,
        expiresAt: new Date(Date.now() + (identity.customerId ? CUSTOMER_CART_TTL : GUEST_CART_TTL))
      });

    const existing = await StorefrontCartItem.findOne({
      organizationId,
      cartId: cart._id,
      productId,
      variantId: variantId ?? null,
      branchId: branchId ?? null
    });

    if (existing) {
      const newQty = existing.quantity + quantity;
      if (availableStock < newQty) {
        throw new AppError(`Cannot add ${quantity} more; only ${availableStock - existing.quantity} unit(s) left`, 400);
      }
      existing.quantity = newQty;
      await existing.save();
    } else {
      const item = await StorefrontCartItem.create({
        organizationId,
        storefrontId: cart.storefrontId,
        cartId: cart._id,
        customerId: cart.customerId,
        sessionId: cart.sessionId,
        productId,
        variantId,
        branchId,
        quantity,
        snapshot: this._snapshot(product, variantId)
      });
      cart.cartItems.push(item._id);
    }

    await this._touchAndRecalculate(cart);
    return this._toDTO(cart);
  }

  async updateItemQuantity(organizationId, identity, cartItemId, quantity) {
    if (quantity < 1 || !Number.isInteger(quantity)) throw new AppError('Quantity must be a positive integer', 400);
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    const item = await StorefrontCartItem.findOne({ _id: cartItemId, organizationId, cartId: cart._id });
    if (!item) throw new AppError('Cart item not found', 404);

    const product = await Product.findOne({ _id: item.productId, organizationId, isActive: true, isDeleted: { $ne: true } }).lean();
    if (!product) {
      await StorefrontCartItem.deleteOne({ _id: item._id });
      cart.cartItems.pull(item._id);
      await this._touchAndRecalculate(cart);
      throw new AppError('This product is no longer available and has been removed from your cart', 410);
    }

    const availableStock = this._getStock(product, item.branchId?.toString());
    if (availableStock < quantity) throw new AppError(`Only ${availableStock} unit(s) available`, 400);

    item.quantity = quantity;
    await item.save();
    await this._touchAndRecalculate(cart);
    return this._toDTO(cart);
  }

  async removeItem(organizationId, identity, cartItemId) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    const removed = await StorefrontCartItem.findOneAndDelete({ _id: cartItemId, organizationId, cartId: cart._id });
    if (!removed) throw new AppError('Cart item not found', 404);

    cart.cartItems.pull(removed._id);
    await this._touchAndRecalculate(cart);
    return this._toDTO(cart);
  }

  async clearCart(organizationId, identity) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    await StorefrontCartItem.deleteMany({ organizationId, cartId: cart._id });
    cart.cartItems = [];
    await this._touchAndRecalculate(cart);
    return this._toDTO(cart);
  }

  async applyCoupon(organizationId, identity, couponCode) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);
    if (!couponCode) throw new AppError('Coupon code is required', 400);

    // Foundation only: stores coupon for later rules engine integration.
    const normalized = String(couponCode).trim().toUpperCase();
    if (!cart.appliedCoupons.some(c => c.code === normalized)) {
      cart.appliedCoupons.push({ code: normalized, discountType: 'fixed', amount: 0 });
    }
    await this._touchAndRecalculate(cart);
    return this._toDTO(cart);
  }

  async estimateShipping(organizationId, identity, estimate = {}) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);
    cart.shippingTotals = { subtotal: 0, total: Number(estimate.amount ?? 0), currency: cart.currency };
    cart.metadata.shippingEstimate = estimate;
    await this._touchAndRecalculate(cart);
    return this._toDTO(cart);
  }

  async mergeGuestCart(organizationId, sessionId, customerId) {
    const [guestCart, customerCart] = await Promise.all([
      StorefrontCart.findOne({ organizationId, sessionId, status: 'active' }),
      StorefrontCart.findOne({ organizationId, customerId, status: 'active' })
    ]);

    if (!guestCart) return customerCart ? this._toDTO(customerCart) : null;

    if (!customerCart) {
      guestCart.customerId = customerId;
      guestCart.sessionId = null;
      guestCart.expiresAt = new Date(Date.now() + CUSTOMER_CART_TTL);
      await StorefrontCartItem.updateMany({ cartId: guestCart._id, organizationId }, { $set: { customerId, sessionId: null } });
      await this._touchAndRecalculate(guestCart);
      return this._toDTO(guestCart);
    }

    const guestItems = await StorefrontCartItem.find({ organizationId, cartId: guestCart._id });
    for (const guestItem of guestItems) {
      const existing = await StorefrontCartItem.findOne({
        organizationId,
        cartId: customerCart._id,
        productId: guestItem.productId,
        variantId: guestItem.variantId,
        branchId: guestItem.branchId
      });
      if (existing) {
        existing.quantity = Math.max(existing.quantity, guestItem.quantity);
        await existing.save();
        await guestItem.deleteOne();
      } else {
        guestItem.cartId = customerCart._id;
        guestItem.customerId = customerId;
        guestItem.sessionId = null;
        await guestItem.save();
        customerCart.cartItems.push(guestItem._id);
      }
    }

    guestCart.status = 'merged';
    await Promise.all([guestCart.save(), this._touchAndRecalculate(customerCart)]);
    return this._toDTO(customerCart);
  }

  async validateForCheckout(organizationId, identity) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    const items = await StorefrontCartItem.find({ organizationId, cartId: cart._id }).lean();
    if (items.length === 0) throw new AppError('Cart is empty', 400);

    const products = await Product.find({
      _id: { $in: items.map(i => i.productId) },
      organizationId,
      isActive: true,
      isDeleted: { $ne: true }
    }).lean();

    const productMap = new Map(products.map(product => [product._id.toString(), product]));
    const issues = [];
    for (const item of items) {
      const product = productMap.get(item.productId.toString());
      if (!product) {
        issues.push({ itemId: item._id, productName: item.snapshot.name, issue: 'unavailable', requested: item.quantity, available: 0 });
        continue;
      }
      const available = this._getStock(product, item.branchId?.toString());
      if (available < item.quantity) {
        issues.push({
          itemId: item._id,
          productName: product.name,
          issue: available === 0 ? 'out_of_stock' : 'insufficient_stock',
          requested: item.quantity,
          available
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  async _findActiveCart(organizationId, identity) {
    this._validateIdentity(identity);
    const query = { organizationId, status: 'active' };
    if (identity.customerId) query.customerId = identity.customerId;
    else query.sessionId = identity.sessionId;
    return StorefrontCart.findOne(query);
  }

  _validateIdentity(identity) {
    if (!identity || (!identity.customerId && !identity.sessionId)) {
      throw new AppError('Storefront cart identity required', 400);
    }
  }

  _snapshot(product, variantId = null) {
    const variant = variantId && Array.isArray(product.variants)
      ? product.variants.find(v => v._id?.toString() === variantId?.toString())
      : null;
    return {
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] ?? null,
      sku: variant?.sku ?? product.sku ?? null,
      variantTitle: variant?.title ?? null,
      sellingPrice: variant?.sellingPrice ?? product.sellingPrice,
      discountedPrice: variant?.discountedPrice ?? product.discountedPrice ?? null,
      taxRate: product.taxRate ?? 0,
      isTaxInclusive: product.isTaxInclusive ?? false,
      currency: product.currency ?? 'INR'
    };
  }

  _getStock(product, branchId) {
    if (!Array.isArray(product.inventory) || product.inventory.length === 0) return 0;
    if (branchId) {
      const entry = product.inventory.find(i => i.branchId?.toString() === branchId);
      return entry?.quantity ?? 0;
    }
    return product.inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }

  async _touchAndRecalculate(cart) {
    const items = await StorefrontCartItem.find({ organizationId: cart.organizationId, cartId: cart._id }).lean();
    const subtotal = items.reduce((sum, item) => sum + ((item.snapshot.discountedPrice ?? item.snapshot.sellingPrice) * item.quantity), 0);
    const discount = cart.appliedCoupons.reduce((sum, coupon) => sum + (coupon.amount || 0), 0);
    const shipping = cart.shippingTotals?.total ?? 0;
    const tax = 0;
    cart.totals = { subtotal: Number(subtotal.toFixed(2)), total: Number(Math.max(0, subtotal - discount + shipping + tax).toFixed(2)), currency: cart.currency };
    cart.discountTotals = { subtotal: discount, total: discount, currency: cart.currency };
    cart.taxTotals = { subtotal: tax, total: tax, currency: cart.currency };
    cart.expiresAt = new Date(Date.now() + (cart.customerId ? CUSTOMER_CART_TTL : GUEST_CART_TTL));
    await cart.save();
  }

  async _toDTO(cart) {
    const doc = cart.toObject ? cart.toObject({ virtuals: true }) : cart;
    const items = await StorefrontCartItem.find({ organizationId: doc.organizationId, cartId: doc._id }).lean();
    return {
      id: doc._id,
      organizationId: doc.organizationId,
      storefrontId: doc.storefrontId ?? null,
      customerId: doc.customerId ?? null,
      sessionId: doc.sessionId ?? null,
      status: doc.status,
      currency: doc.currency,
      items: items.map(item => ({
        id: item._id,
        productId: item.productId,
        variantId: item.variantId ?? null,
        branchId: item.branchId ?? null,
        quantity: item.quantity,
        snapshot: item.snapshot,
        lineTotal: Number(((item.snapshot.discountedPrice ?? item.snapshot.sellingPrice) * item.quantity).toFixed(2))
      })),
      appliedCoupons: doc.appliedCoupons ?? [],
      totals: doc.totals ?? { subtotal: 0, total: 0, currency: doc.currency },
      discountTotals: doc.discountTotals ?? { subtotal: 0, total: 0, currency: doc.currency },
      shippingTotals: doc.shippingTotals ?? { subtotal: 0, total: 0, currency: doc.currency },
      taxTotals: doc.taxTotals ?? { subtotal: 0, total: 0, currency: doc.currency },
      subtotal: doc.totals?.subtotal ?? 0,
      grandTotal: doc.totals?.total ?? 0,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      expiresAt: doc.expiresAt,
      updatedAt: doc.updatedAt
    };
  }
}

module.exports = new CartService();
