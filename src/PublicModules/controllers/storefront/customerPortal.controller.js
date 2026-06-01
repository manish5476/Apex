'use strict';

/**
 * CustomerPortalController
 * ─────────────────────────────────────────────
 * Handles all storefront customer self-service portal endpoints.
 *
 * URL pattern: /api/v1/store/:organizationSlug/portal/*
 *
 * Auth:
 *   - Public endpoints (register, login, forgot/reset password) → no token
 *   - Protected endpoints → Bearer/Cookie portal JWT (type: 'portal_customer')
 */

const Organization    = require('../../../modules/organization/core/organization.model');
const PortalAuthService = require('../../services/storefront/portalAuth.service');
const PortalDataService = require('../../services/storefront/portalData.service');
const AppError          = require('../../../core/utils/api/appError');
const catchAsync        = require('../../../core/utils/api/catchAsync');

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const PORTAL_AUTH_COOKIE = 'portal_auth';

async function resolveOrg(slug) {
  const org = await Organization.findOne({
    uniqueShopId: slug.toUpperCase(),
    isActive: true,
  }).select('_id name').lean();
  if (!org) throw new AppError('Store not found', 404);
  return org;
}

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

function safeCustomer(customer) {
  const doc = customer?.toObject ? customer.toObject() : { ...customer };
  if (doc.portalAccess) {
    delete doc.portalAccess.passwordHash;
    delete doc.portalAccess.resetToken;
    delete doc.portalAccess.resetExpires;
  }
  return doc;
}

// ────────────────────────────────────────────────────────────────────────────
// Middleware: require portal authentication
// ────────────────────────────────────────────────────────────────────────────

exports.requirePortalAuth = catchAsync(async (req, res, next) => {
  const token =
    req.cookies?.[PORTAL_AUTH_COOKIE] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  const payload = PortalAuthService.verifyPortalToken(token);
  if (!payload) {
    return next(new AppError('Portal authentication required. Please log in.', 401));
  }

  // Attach to req for downstream handlers
  req.portalCustomer = {
    customerId:     payload.crmCustomerId,
    organizationId: payload.organizationId,
  };
  next();
});

// ────────────────────────────────────────────────────────────────────────────
// AUTH — Public endpoints
// ────────────────────────────────────────────────────────────────────────────

exports.register = catchAsync(async (req, res) => {
  const org      = await resolveOrg(req.params.organizationSlug);
  const customer = await PortalAuthService.register(org._id, req.body);
  const token    = PortalAuthService.signPortalToken({ _id: customer._id, organizationId: org._id });

  res.cookie(PORTAL_AUTH_COOKIE, token, cookieOptions());
  res.status(201).json({
    status:  'success',
    message: 'Account created successfully',
    data:    { customer: safeCustomer(customer), token },
  });
});

exports.login = catchAsync(async (req, res) => {
  const org      = await resolveOrg(req.params.organizationSlug);
  const customer = await PortalAuthService.login(org._id, req.body.email, req.body.password);
  const token    = PortalAuthService.signPortalToken({ _id: customer._id, organizationId: org._id });

  res.cookie(PORTAL_AUTH_COOKIE, token, cookieOptions());
  res.status(200).json({
    status: 'success',
    data:   { customer: safeCustomer(customer), token },
  });
});

exports.logout = catchAsync(async (req, res) => {
  const { maxAge, ...clearOpts } = cookieOptions();
  res.clearCookie(PORTAL_AUTH_COOKIE, clearOpts);
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
});

exports.forgotPassword = catchAsync(async (req, res) => {
  const org    = await resolveOrg(req.params.organizationSlug);
  const result = await PortalAuthService.forgotPassword(org._id, req.body.email);
  res.status(200).json({ status: 'success', ...result });
});

exports.resetPassword = catchAsync(async (req, res) => {
  const org = await resolveOrg(req.params.organizationSlug);
  await PortalAuthService.resetPassword(org._id, req.body.token, req.body.password);
  res.status(200).json({ status: 'success', message: 'Password reset successfully. Please log in.' });
});

// ────────────────────────────────────────────────────────────────────────────
// PROFILE — Protected
// ────────────────────────────────────────────────────────────────────────────

exports.getMe = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const data = await PortalDataService.getProfile(organizationId, customerId);
  res.status(200).json({ status: 'success', data });
});

exports.updateMe = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const customer = await PortalDataService.updateProfile(organizationId, customerId, req.body);
  res.status(200).json({ status: 'success', data: { customer: safeCustomer(customer) } });
});

exports.changePassword = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  await PortalAuthService.changePassword(
    organizationId, customerId, req.body.currentPassword, req.body.newPassword
  );
  res.status(200).json({ status: 'success', message: 'Password updated successfully' });
});

// ────────────────────────────────────────────────────────────────────────────
// ORDERS — Protected
// ────────────────────────────────────────────────────────────────────────────

exports.listOrders = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const result = await PortalDataService.listOrders(organizationId, customerId, req.query);
  res.status(200).json({ status: 'success', ...result });
});

exports.getOrderDetail = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const order = await PortalDataService.getOrderDetail(organizationId, customerId, req.params.saleId);
  res.status(200).json({ status: 'success', data: { order } });
});

// ────────────────────────────────────────────────────────────────────────────
// INVOICES — Protected (customer downloads same CRM invoice PDF)
// ────────────────────────────────────────────────────────────────────────────

exports.getInvoice = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const invoice = await PortalDataService.getInvoiceForPortal(organizationId, customerId, req.params.invoiceId);
  res.status(200).json({ status: 'success', data: { invoice } });
});

/**
 * Stream the CRM invoice PDF to the customer.
 * Delegates to the existing invoice PDF service — no new PDF logic needed.
 */
exports.downloadInvoicePdf = catchAsync(async (req, res, next) => {
  const { customerId, organizationId } = req.portalCustomer;

  // Verify ownership before streaming
  await PortalDataService.getInvoiceForPortal(organizationId, customerId, req.params.invoiceId);

  // Inject the invoiceId into req.params so the existing PDF controller can serve it
  req.params.id = req.params.invoiceId;
  // Attach a minimal req.user so the existing controller's org check passes
  req.user = { organizationId };

  // Delegate to existing invoice PDF controller
  try {
    const InvoicePdfController = require('../../../modules/accounting/billing/invoiceControllers/invoice.controller');
    return InvoicePdfController.downloadPdf(req, res, next);
  } catch {
    // Fallback: return the invoice JSON if PDF controller not accessible from this path
    const invoice = await PortalDataService.getInvoiceForPortal(organizationId, customerId, req.params.invoiceId);
    res.status(200).json({ status: 'success', data: { invoice } });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// RETURNS — Protected
// ────────────────────────────────────────────────────────────────────────────

exports.submitReturn = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const salesReturn = await PortalDataService.submitReturn(organizationId, customerId, req.body);
  res.status(201).json({
    status:  'success',
    message: 'Return request submitted. Your request is under review.',
    data:    { salesReturn },
  });
});

exports.listReturns = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const result = await PortalDataService.listReturns(organizationId, customerId, req.query);
  res.status(200).json({ status: 'success', ...result });
});

exports.getReturnDetail = catchAsync(async (req, res) => {
  const { customerId, organizationId } = req.portalCustomer;
  const salesReturn = await PortalDataService.getReturnDetail(organizationId, customerId, req.params.returnId);
  res.status(200).json({ status: 'success', data: { salesReturn } });
});
