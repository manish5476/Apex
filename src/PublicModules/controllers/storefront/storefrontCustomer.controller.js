'use strict';

const CustomerService = require('../../services/storefront/customer.service');
const CartService = require('../../services/storefront/cart.service');
const OrderService = require('../../services/storefront/order.service');
const SessionService = require('../../services/storefront/session.service');
const Organization = require('../../../modules/organization/core/organization.model');
const AppError = require('../../../core/utils/api/appError');

class StorefrontCustomerController {
  register = async (req, res, next) => {
    try {
      const { organizationId, session } = await this._resolvePublicContext(req, res);
      const customer = await CustomerService.register(organizationId, req.body);
      session.customerId = customer._id;
      session.guest = false;
      await session.save();
      const token = SessionService.signCustomer(customer);
      res.cookie(SessionService.cookieNames.auth, token, SessionService.cookieOptions());
      await CartService.mergeGuestCart(organizationId, session._id, customer._id);
      res.status(201).json({ status: 'success', data: this.safeCustomer(customer) });
    } catch (err) {
      next(err);
    }
  };

  login = async (req, res, next) => {
    try {
      const { organizationId, session } = await this._resolvePublicContext(req, res);
      const customer = await CustomerService.login(organizationId, req.body.email, req.body.password);
      session.customerId = customer._id;
      session.guest = false;
      await session.save();
      const token = SessionService.signCustomer(customer);
      res.cookie(SessionService.cookieNames.auth, token, SessionService.cookieOptions());
      const cart = await CartService.mergeGuestCart(organizationId, session._id, customer._id);
      res.status(200).json({ status: 'success', data: { customer: this.safeCustomer(customer), cart } });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req, res, next) => {
    try {
      res.clearCookie(SessionService.cookieNames.auth);
      res.status(200).json({ status: 'success', message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req, res, next) => {
    try {
      const { organizationId } = await this._resolvePublicContext(req, res);
      const result = await CustomerService.forgotPassword(organizationId, req.body.email);
      res.status(200).json({ status: 'success', ...result });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req, res, next) => {
    try {
      const { organizationId } = await this._resolvePublicContext(req, res);
      await CustomerService.resetPassword(organizationId, req.body.token, req.body.password);
      res.status(200).json({ status: 'success', message: 'Password reset successfully' });
    } catch (err) {
      next(err);
    }
  };

  updatePassword = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolvePublicContext(req, res);
      if (!identity.customerId) return next(new AppError('Storefront customer authentication required', 401));
      
      await CustomerService.updatePassword(organizationId, identity.customerId, req.body.currentPassword, req.body.newPassword);
      
      res.status(200).json({ status: 'success', message: 'Password updated successfully' });
    } catch (err) {
      next(err);
    }
  };

  me = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolvePublicContext(req, res);
      if (!identity.customerId) return next(new AppError('Storefront customer authentication required', 401));
      const data = await CustomerService.getDashboard(organizationId, identity.customerId);
      res.status(200).json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  };

  getOrders = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolvePublicContext(req, res);
      if (!identity.customerId) return next(new AppError('Storefront customer authentication required', 401));
      const orders = await OrderService.listForCustomer(organizationId, identity.customerId);
      res.status(200).json({ status: 'success', data: orders });
    } catch (err) {
      next(err);
    }
  };

  toggleWishlist = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolvePublicContext(req, res);
      if (!identity.customerId) return next(new AppError('Storefront customer authentication required', 401));
      const { productId } = req.body;
      if (!productId) return next(new AppError('productId is required', 400));
      const result = await CustomerService.toggleWishlist(organizationId, identity.customerId, productId);
      res.status(200).json({ status: 'success', data: result });
    } catch (err) {
      next(err);
    }
  };

  addAddress = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolvePublicContext(req, res);
      if (!identity.customerId) return next(new AppError('Storefront customer authentication required', 401));
      const address = await CustomerService.addAddress(organizationId, identity.customerId, req.body);
      res.status(201).json({ status: 'success', data: address });
    } catch (err) {
      next(err);
    }
  };

  updateAddress = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolvePublicContext(req, res);
      if (!identity.customerId) return next(new AppError('Storefront customer authentication required', 401));
      const address = await CustomerService.updateAddress(organizationId, identity.customerId, req.params.addressId, req.body);
      res.status(200).json({ status: 'success', data: address });
    } catch (err) {
      next(err);
    }
  };

  checkout = async (req, res, next) => {
    try {
      const { organizationId, identity } = await this._resolvePublicContext(req, res);
      const order = await OrderService.createFromCart(organizationId, identity, req.body);
      res.status(201).json({ status: 'success', message: 'Order placed', data: order });
    } catch (err) {
      next(err);
    }
  };

  trackOrder = async (req, res, next) => {
    try {
      const { organizationId } = await this._resolvePublicContext(req, res);
      const order = await OrderService.trackOrder(organizationId, req.params.orderNumber, req.query.verify);
      res.status(200).json({ status: 'success', data: order });
    } catch (err) {
      next(err);
    }
  };

  adminList = async (req, res, next) => {
    try {
      const organizationId = req.user?.organizationId;
      const result = await CustomerService.listAdmin(organizationId, req.query);
      res.status(200).json({ status: 'success', ...result });
    } catch (err) {
      next(err);
    }
  };

  adminDetail = async (req, res, next) => {
    try {
      const data = await CustomerService.detailAdmin(req.user?.organizationId, req.params.customerId);
      res.status(200).json({ status: 'success', data });
    } catch (err) {
      next(err);
    }
  };

  convertToCrm = async (req, res, next) => {
    try {
      const data = await CustomerService.convertToCrmCustomer(req.user?.organizationId, req.params.customerId, req.user?._id || req.user?.id);
      res.status(200).json({ status: 'success', message: 'Storefront customer converted to CRM customer', data });
    } catch (err) {
      next(err);
    }
  };

  async _resolvePublicContext(req, res) {
    const org = await Organization.findOne({
      uniqueShopId: req.params.organizationSlug.toUpperCase(),
      isActive: true
    }).select('_id').lean();
    if (!org) throw new AppError('Store not found', 404);
    const sessionContext = await SessionService.resolve(req, res, org._id);
    return { organizationId: org._id, ...sessionContext };
  }

  safeCustomer(customer) {
    const doc = customer.toObject ? customer.toObject() : customer;
    delete doc.passwordHash;
    return doc;
  }
}

module.exports = new StorefrontCustomerController();
