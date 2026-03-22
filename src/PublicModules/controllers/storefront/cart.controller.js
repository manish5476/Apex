/**
 * CartController
 *
 * HTTP layer for the CartService.
 * Supports both guest carts (sessionToken cookie) and customer carts (JWT auth).
 *
 * Cart identity resolution order:
 *   1. req.user.customerId  — authenticated customer
 *   2. req.cookies.cartSession — guest session token
 *   3. Auto-generate new session token for new guests
 *
 * Routes (all scoped to :organizationSlug):
 *   GET    /public/:organizationSlug/cart                    → get/create cart
 *   POST   /public/:organizationSlug/cart/items              → add item
 *   PATCH  /public/:organizationSlug/cart/items/:cartItemId  → update qty
 *   DELETE /public/:organizationSlug/cart/items/:cartItemId  → remove item
 *   DELETE /public/:organizationSlug/cart                    → clear cart
 *   POST   /public/:organizationSlug/cart/merge              → merge guest → customer
 *   GET    /public/:organizationSlug/cart/validate           → pre-checkout validation
 */

'use strict';

const { nanoid }    = require('nanoid');
const CartService   = require('../../services/storefront/cart.service');
const Organization  = require('../../../modules/organization/core/organization.model');
const AppError      = require('../../../core/utils/api/appError');

// Guest session cookie config
const SESSION_COOKIE = 'cartSession';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  secure:   process.env.NODE_ENV === 'production'
};

class CartController {

  // ---------------------------------------------------------------------------
  // GET /public/:organizationSlug/cart
  // ---------------------------------------------------------------------------

  getCart = async (req, res, next) => {
    try {
      const { organizationId, identity, isNewSession } = await this._resolveContext(req, res);

      const cart = await CartService.getOrCreate(organizationId, identity);

      // Set cookie for new guest sessions
      if (isNewSession && identity.sessionToken) {
        res.cookie(SESSION_COOKIE, identity.sessionToken, COOKIE_OPTIONS);
      }

      res.status(200).json({ status: 'success', data: cart });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // POST /public/:organizationSlug/cart/items
  // Body: { productId, quantity?, branchId? }
  // ---------------------------------------------------------------------------

  addItem = async (req, res, next) => {
    try {
      const { organizationId, identity, isNewSession } = await this._resolveContext(req, res);
      const { productId, quantity = 1, branchId } = req.body;

      if (!productId) return next(new AppError('"productId" is required', 400));

      const cart = await CartService.addItem(
        organizationId, identity,
        productId, parseInt(quantity), branchId ?? null
      );

      if (isNewSession && identity.sessionToken) {
        res.cookie(SESSION_COOKIE, identity.sessionToken, COOKIE_OPTIONS);
      }

      res.status(200).json({ status: 'success', message: 'Item added', data: cart });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PATCH /public/:organizationSlug/cart/items/:cartItemId
  // Body: { quantity }
  // ---------------------------------------------------------------------------

  updateItemQuantity = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const { cartItemId }  = req.params;
      const { quantity }    = req.body;

      if (quantity === undefined) return next(new AppError('"quantity" is required', 400));

      const cart = await CartService.updateItemQuantity(
        organizationId, identity, cartItemId, parseInt(quantity)
      );

      res.status(200).json({ status: 'success', message: 'Quantity updated', data: cart });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /public/:organizationSlug/cart/items/:cartItemId
  // ---------------------------------------------------------------------------

  removeItem = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const cart = await CartService.removeItem(organizationId, identity, req.params.cartItemId);
      res.status(200).json({ status: 'success', message: 'Item removed', data: cart });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /public/:organizationSlug/cart
  // ---------------------------------------------------------------------------

  clearCart = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const cart = await CartService.clearCart(organizationId, identity);
      res.status(200).json({ status: 'success', message: 'Cart cleared', data: cart });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // POST /public/:organizationSlug/cart/merge
  // Called after customer login — merges guest cart into customer cart
  // Body: { sessionToken } (the guest token)
  // Requires auth (customerId from JWT)
  // ---------------------------------------------------------------------------

  mergeCart = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));

      if (!req.user?.customerId) {
        return next(new AppError('Authentication required to merge cart', 401));
      }

      const { sessionToken } = req.body;
      if (!sessionToken) return next(new AppError('"sessionToken" is required', 400));

      const cart = await CartService.mergeGuestCart(org._id, sessionToken, req.user.customerId);

      // Clear the guest cookie
      res.clearCookie(SESSION_COOKIE);

      res.status(200).json({
        status:  'success',
        message: 'Cart merged',
        data:    cart ?? { items: [] }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // GET /public/:organizationSlug/cart/validate
  // Pre-checkout stock validation
  // ---------------------------------------------------------------------------

  validateCart = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const result = await CartService.validateForCheckout(organizationId, identity);

      const statusCode = result.valid ? 200 : 409;
      res.status(statusCode).json({
        status:  result.valid ? 'success' : 'conflict',
        message: result.valid ? 'Cart is valid for checkout' : 'Some items have stock issues',
        data:    result
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: resolve organizationId + cart identity from request
  // ---------------------------------------------------------------------------

  async _resolveContext(req, res) {
    const { organizationSlug } = req.params;
    const org = await this._resolveOrg(organizationSlug);
    if (!org) throw new AppError('Store not found', 404);

    let identity     = {};
    let isNewSession = false;

    // Authenticated customer takes priority
    if (req.user?.customerId) {
      identity = { customerId: req.user.customerId };
    } else {
      // Guest: use existing cookie or generate a new session token
      const existingToken = req.cookies?.[SESSION_COOKIE];
      if (existingToken) {
        identity = { sessionToken: existingToken };
      } else {
        identity     = { sessionToken: nanoid(32) };
        isNewSession = true;
      }
    }

    return { organizationId: org._id, identity, isNewSession };
  }

  async _resolveOrg(slug) {
    return Organization.findOne({
      uniqueShopId: slug.toUpperCase(),
      isActive:     true
    }).select('_id').lean();
  }
}

module.exports = new CartController();