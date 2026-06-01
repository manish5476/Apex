'use strict';

const CartService = require('../../services/storefront/cart.service');
const SessionService = require('../../services/storefront/session.service');
const Organization = require('../../../modules/organization/core/organization.model');
const AppError = require('../../../core/utils/api/appError');

class CartController {
  getCart = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const cart = await CartService.getOrCreate(organizationId, identity);
      res.status(200).json({ status: 'success', data: cart });
    } catch (err) {
      next(err);
    }
  };

  addItem = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const { productId, quantity = 1, branchId, variantId } = req.body;
      if (!productId) return next(new AppError('"productId" is required', 400));
      const cart = await CartService.addItem(organizationId, identity, productId, Number(quantity), branchId ?? null, variantId ?? null);
      res.status(200).json({ status: 'success', message: 'Item added', data: cart });
    } catch (err) {
      next(err);
    }
  };

  updateItemQuantity = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const quantity = Number(req.body.quantity);
      const cart = await CartService.updateItemQuantity(organizationId, identity, req.params.cartItemId, quantity);
      res.status(200).json({ status: 'success', message: 'Quantity updated', data: cart });
    } catch (err) {
      next(err);
    }
  };

  removeItem = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const cart = await CartService.removeItem(organizationId, identity, req.params.cartItemId);
      res.status(200).json({ status: 'success', message: 'Item removed', data: cart });
    } catch (err) {
      next(err);
    }
  };

  clearCart = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const cart = await CartService.clearCart(organizationId, identity);
      res.status(200).json({ status: 'success', message: 'Cart cleared', data: cart });
    } catch (err) {
      next(err);
    }
  };

  applyCoupon = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const cart = await CartService.applyCoupon(organizationId, identity, req.body.couponCode);
      res.status(200).json({ status: 'success', message: 'Coupon applied', data: cart });
    } catch (err) {
      next(err);
    }
  };

  estimateShipping = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const cart = await CartService.estimateShipping(organizationId, identity, req.body);
      res.status(200).json({ status: 'success', data: cart });
    } catch (err) {
      next(err);
    }
  };

  mergeCart = async (req, res, next) => {
    try {
      const { organizationId, session, identity } = await this._resolveContext(req, res);
      if (!identity.customerId) return next(new AppError('Storefront customer authentication required', 401));
      const cart = await CartService.mergeGuestCart(organizationId, session._id, identity.customerId);
      res.status(200).json({ status: 'success', message: 'Cart merged', data: cart ?? { items: [] } });
    } catch (err) {
      next(err);
    }
  };

  validateCart = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolveContext(req, res);
      const result = await CartService.validateForCheckout(organizationId, identity);
      res.status(result.valid ? 200 : 409).json({
        status: result.valid ? 'success' : 'conflict',
        message: result.valid
          ? 'Cart is valid for checkout'
          : (result.issues?.[0]?.message || 'Some cart items need attention before checkout'),
        data: result
      });
    } catch (err) {
      next(err);
    }
  };

  async _resolveContext(req, res) {
    const org = await Organization.findOne({
      uniqueShopId: req.params.organizationSlug.toUpperCase(),
      isActive: true
    }).select('_id').lean();
    if (!org) throw new AppError('Store not found', 404);

    const { session, identity } = await SessionService.resolve(req, res, org._id);
    return { organizationId: org._id, session, identity };
  }
}

module.exports = new CartController();
