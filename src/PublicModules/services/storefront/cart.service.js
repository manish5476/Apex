/**
 * CartService
 *
 * Manages the full shopping cart lifecycle:
 *   - Add / update / remove items
 *   - Guest carts (sessionToken) and customer carts (customerId)
 *   - Cart merge: guest cart → customer cart on login
 *   - Stock validation on add and on checkout
 *   - Price snapshots — cart stores the price at time of add
 *
 * The cart never holds live prices — the snapshot is what the customer agreed to.
 * Re-validation happens at checkout to catch price changes.
 */

'use strict';

const mongoose       = require('mongoose');
const StorefrontCart = require('../../models/storefront/storefrontCart.model');
const Product        = require('../../../modules/inventory/core/model/product.model');
const AppError       = require('../../../core/utils/api/appError');

// Guest carts expire in 7 days, customer carts in 30
const GUEST_CART_TTL    = 7  * 24 * 60 * 60 * 1000;
const CUSTOMER_CART_TTL = 30 * 24 * 60 * 60 * 1000;

class CartService {

  // ---------------------------------------------------------------------------
  // Public: get or create a cart
  // ---------------------------------------------------------------------------

  /**
   * Resolves the active cart for a session or customer.
   * Creates one if none exists.
   *
   * @param {string}  organizationId
   * @param {Object}  identity        { sessionToken? } or { customerId? }
   * @returns {Object}  Cart document (lean)
   */
  async getOrCreate(organizationId, identity) {
    this._validateIdentity(identity);

    let cart = await this._findActiveCart(organizationId, identity);

    if (!cart) {
      const isCustomer = !!identity.customerId;
      const ttl        = isCustomer ? CUSTOMER_CART_TTL : GUEST_CART_TTL;

      cart = await StorefrontCart.create({
        organizationId,
        customerId:   identity.customerId   ?? null,
        sessionToken: identity.sessionToken ?? null,
        expiresAt:    new Date(Date.now() + ttl),
        status:       'active',
        items:        []
      });
    }

    return this._toDTO(cart);
  }

  // ---------------------------------------------------------------------------
  // Public: add an item (or increment quantity if already in cart)
  // ---------------------------------------------------------------------------

  /**
   * @param {string}  organizationId
   * @param {Object}  identity        { sessionToken } or { customerId }
   * @param {string}  productId
   * @param {number}  quantity        How many to add (default 1)
   * @param {string}  [branchId]      For branch-specific stock checks
   */
  async addItem(organizationId, identity, productId, quantity = 1, branchId = null) {
    if (!mongoose.isValidObjectId(productId)) {
      throw new AppError('Invalid product ID', 400);
    }
    if (quantity < 1 || !Number.isInteger(quantity)) {
      throw new AppError('Quantity must be a positive integer', 400);
    }

    // Fetch product and validate it belongs to this org
    const product = await Product.findOne({
      _id:            productId,
      organizationId,
      isActive:       true,
      isDeleted:      { $ne: true }
    }).lean();

    if (!product) throw new AppError('Product not found or unavailable', 404);

    // Stock check
    const availableStock = this._getStock(product, branchId);
    if (availableStock < quantity) {
      throw new AppError(
        `Only ${availableStock} unit(s) available for "${product.name}"`,
        400
      );
    }

    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    // Check if item already exists in cart
    const existingIdx = cart.items.findIndex(
      i => i.productId.toString() === productId
    );

    if (existingIdx >= 0) {
      const newQty = cart.items[existingIdx].quantity + quantity;

      // Re-validate combined quantity against stock
      if (availableStock < newQty) {
        throw new AppError(
          `Cannot add ${quantity} more — only ${availableStock - cart.items[existingIdx].quantity} unit(s) left`,
          400
        );
      }
      cart.items[existingIdx].quantity = newQty;
    } else {
      // Build snapshot — this is the price frozen at add-time
      const snapshot = {
        name:            product.name,
        slug:            product.slug,
        image:           product.images?.[0] ?? null,
        sku:             product.sku          ?? null,
        sellingPrice:    product.sellingPrice,
        discountedPrice: product.discountedPrice ?? null,
        taxRate:         product.taxRate         ?? 0,
        isTaxInclusive:  product.isTaxInclusive  ?? false
      };

      cart.items.push({ productId, snapshot, quantity, branchId: branchId ?? undefined });
    }

    // Extend expiry on activity
    const isCustomer = !!cart.customerId;
    cart.expiresAt = new Date(Date.now() + (isCustomer ? CUSTOMER_CART_TTL : GUEST_CART_TTL));

    await cart.save();
    return this._toDTO(cart);
  }

  // ---------------------------------------------------------------------------
  // Public: update quantity of a specific cart item
  // ---------------------------------------------------------------------------

  async updateItemQuantity(organizationId, identity, cartItemId, quantity) {
    if (quantity < 1 || !Number.isInteger(quantity)) {
      throw new AppError('Quantity must be a positive integer', 400);
    }

    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    const item = cart.items.id(cartItemId);
    if (!item) throw new AppError('Cart item not found', 404);

    // Re-validate stock
    const product = await Product.findOne({
      _id: item.productId, organizationId, isActive: true, isDeleted: { $ne: true }
    }).lean();

    if (!product) {
      // Product was deactivated since it was added
      cart.items.pull({ _id: cartItemId });
      await cart.save();
      throw new AppError('This product is no longer available and has been removed from your cart', 410);
    }

    const availableStock = this._getStock(product, item.branchId?.toString());
    if (availableStock < quantity) {
      throw new AppError(`Only ${availableStock} unit(s) available`, 400);
    }

    item.quantity = quantity;
    await cart.save();
    return this._toDTO(cart);
  }

  // ---------------------------------------------------------------------------
  // Public: remove a specific item
  // ---------------------------------------------------------------------------

  async removeItem(organizationId, identity, cartItemId) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    const before = cart.items.length;
    cart.items.pull({ _id: cartItemId });

    if (cart.items.length === before) {
      throw new AppError('Cart item not found', 404);
    }

    await cart.save();
    return this._toDTO(cart);
  }

  // ---------------------------------------------------------------------------
  // Public: clear all items
  // ---------------------------------------------------------------------------

  async clearCart(organizationId, identity) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart) throw new AppError('Cart not found', 404);

    cart.items = [];
    await cart.save();
    return this._toDTO(cart);
  }

  // ---------------------------------------------------------------------------
  // Public: merge guest cart into customer cart on login
  // ---------------------------------------------------------------------------

  /**
   * Merges items from a guest sessionToken cart into a customerId cart.
   * Guest items are added; if an item already exists the higher quantity wins.
   * Guest cart is marked as 'merged' and retired.
   *
   * @param {string} organizationId
   * @param {string} sessionToken    The guest cart token
   * @param {string} customerId      The newly authenticated customer
   */
  async mergeGuestCart(organizationId, sessionToken, customerId) {
    const [guestCart, customerCart] = await Promise.all([
      StorefrontCart.findOne({ organizationId, sessionToken, status: 'active' }),
      this._findActiveCart(organizationId, { customerId })
    ]);

    if (!guestCart || guestCart.items.length === 0) return; // Nothing to merge

    let target = customerCart;
    if (!target) {
      // Customer has no cart yet — just reassign the guest cart
      guestCart.customerId   = customerId;
      guestCart.sessionToken = null;
      guestCart.expiresAt    = new Date(Date.now() + CUSTOMER_CART_TTL);
      guestCart.status       = 'active';
      await guestCart.save();
      return this._toDTO(guestCart);
    }

    // Merge items
    for (const guestItem of guestCart.items) {
      const existingIdx = target.items.findIndex(
        i => i.productId.toString() === guestItem.productId.toString()
      );
      if (existingIdx >= 0) {
        // Take the larger quantity
        target.items[existingIdx].quantity = Math.max(
          target.items[existingIdx].quantity,
          guestItem.quantity
        );
      } else {
        target.items.push({
          productId: guestItem.productId,
          snapshot:  guestItem.snapshot,
          quantity:  guestItem.quantity,
          branchId:  guestItem.branchId
        });
      }
    }

    target.expiresAt = new Date(Date.now() + CUSTOMER_CART_TTL);

    // Retire guest cart
    guestCart.status = 'merged';

    await Promise.all([target.save(), guestCart.save()]);
    return this._toDTO(target);
  }

  // ---------------------------------------------------------------------------
  // Public: validate cart stock before checkout (returns issues array)
  // ---------------------------------------------------------------------------

  /**
   * Re-checks every cart item against live stock.
   * Returns { valid: boolean, issues: [{ itemId, productName, requested, available }] }
   */
  async validateForCheckout(organizationId, identity) {
    const cart = await this._findActiveCart(organizationId, identity);
    if (!cart || cart.items.length === 0) {
      throw new AppError('Cart is empty', 400);
    }

    const productIds = cart.items.map(i => i.productId);
    const products   = await Product.find({
      _id: { $in: productIds },
      organizationId,
      isActive: true,
      isDeleted: { $ne: true }
    }).lean();

    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    const issues     = [];

    for (const item of cart.items) {
      const product = productMap.get(item.productId.toString());
      if (!product) {
        issues.push({
          itemId:      item._id,
          productName: item.snapshot.name,
          issue:       'unavailable',
          requested:   item.quantity,
          available:   0
        });
        continue;
      }

      const available = this._getStock(product, item.branchId?.toString());
      if (available < item.quantity) {
        issues.push({
          itemId:      item._id,
          productName: product.name,
          issue:       available === 0 ? 'out_of_stock' : 'insufficient_stock',
          requested:   item.quantity,
          available
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async _findActiveCart(organizationId, identity) {
    const query = { organizationId, status: 'active' };

    if (identity.customerId) {
      query.customerId = identity.customerId;
    } else if (identity.sessionToken) {
      query.sessionToken = identity.sessionToken;
    } else {
      throw new AppError('Cart identity (customerId or sessionToken) is required', 400);
    }

    return StorefrontCart.findOne(query);
  }

  _validateIdentity(identity) {
    if (!identity || (!identity.customerId && !identity.sessionToken)) {
      throw new AppError('Cart identity required: provide customerId or sessionToken', 400);
    }
  }

  /**
   * Get available stock for a product.
   * If branchId provided, returns branch-specific stock; otherwise total stock.
   */
  _getStock(product, branchId) {
    if (!Array.isArray(product.inventory) || product.inventory.length === 0) return 0;

    if (branchId) {
      const entry = product.inventory.find(i => i.branchId?.toString() === branchId);
      return entry?.quantity ?? 0;
    }

    return product.inventory.reduce((sum, i) => sum + (i.quantity || 0), 0);
  }

  /**
   * Convert Mongoose document to a clean DTO for API responses.
   * Computes totals here so controllers don't have to.
   */
  _toDTO(cart) {
    const doc = cart.toObject ? cart.toObject({ virtuals: true }) : cart;

    const subtotal = doc.items.reduce((sum, item) => {
      const price = item.snapshot.discountedPrice ?? item.snapshot.sellingPrice;
      return sum + price * item.quantity;
    }, 0);

    const grandTotal = Math.max(0, subtotal - (doc.discountAmount ?? 0));

    return {
      id:            doc._id,
      organizationId:doc.organizationId,
      customerId:    doc.customerId    ?? null,
      sessionToken:  doc.sessionToken  ?? null,
      status:        doc.status,
      items: doc.items.map(item => ({
        id:         item._id,
        productId:  item.productId,
        quantity:   item.quantity,
        snapshot:   item.snapshot,
        branchId:   item.branchId ?? null,
        lineTotal:  parseFloat(
          ((item.snapshot.discountedPrice ?? item.snapshot.sellingPrice) * item.quantity).toFixed(2)
        )
      })),
      couponCode:    doc.couponCode    ?? null,
      discountAmount:doc.discountAmount ?? 0,
      subtotal:      parseFloat(subtotal.toFixed(2)),
      grandTotal:    parseFloat(grandTotal.toFixed(2)),
      itemCount:     doc.items.reduce((n, i) => n + i.quantity, 0),
      expiresAt:     doc.expiresAt,
      updatedAt:     doc.updatedAt
    };
  }
}

module.exports = new CartService();