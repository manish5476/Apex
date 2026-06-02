'use strict';

/**
 * PortalDataService
 * ─────────────────────────────────────────────
 * Serves all customer-portal read/write operations.
 * Reads from CRM models directly — no sync, no duplication.
 *
 * Orders  → Sales  (source:'storefront', customerId)
 * Invoice → Invoice (linked via Sales.invoiceId)
 * Returns → SalesReturn
 */

const mongoose    = require('mongoose');
const Customer    = require('../../../modules/organization/core/customer.model');
const Sales       = require('../../../modules/inventory/core/model/sales.model');
const Invoice     = require('../../../modules/accounting/billing/invoice.model');
const SalesReturn = require('../../../modules/inventory/core/model/salesReturn.model');
const AppError    = require('../../../core/utils/api/appError');

class PortalDataService {

  // ────────────────────────────────────────────────────────────────────
  // 1. PROFILE
  // ────────────────────────────────────────────────────────────────────
  async getProfile(organizationId, customerId) {
    const customer = await Customer.findOne({
      _id: customerId,
      organizationId,
      'portalAccess.enabled': true,
      isDeleted: { $ne: true },
    }).lean();

    if (!customer) throw new AppError('Customer not found', 404);

    // Strip sensitive fields before returning
    if (customer.portalAccess) {
      delete customer.portalAccess.passwordHash;
      delete customer.portalAccess.resetToken;
      delete customer.portalAccess.resetExpires;
    }

    // Quick stats from Sales
    const [totalOrders, totalSpent] = await Promise.all([
      Sales.countDocuments({ organizationId, customerId, source: 'storefront', status: { $ne: 'cancelled' } }),
      Sales.aggregate([
        { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), customerId: new mongoose.Types.ObjectId(customerId), source: 'storefront', status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    return {
      customer,
      stats: {
        totalOrders,
        totalSpent: totalSpent[0]?.total ?? 0,
      }
    };
  }

  async updateProfile(organizationId, customerId, payload) {
    const allowed = ['name', 'phone', 'billingAddress', 'shippingAddress'];
    const update  = {};
    for (const key of allowed) {
      if (payload[key] !== undefined) update[key] = payload[key];
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, organizationId, 'portalAccess.enabled': true, isDeleted: { $ne: true } },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!customer) throw new AppError('Customer not found', 404);
    return customer;
  }

  // ────────────────────────────────────────────────────────────────────
  // 2. ORDERS
  // ────────────────────────────────────────────────────────────────────
  async listOrders(organizationId, customerId, { page = 1, limit = 20 } = {}) {
    page  = Math.max(Number(page)  || 1, 1);
    limit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const query = {
      organizationId,
      customerId,
      source: 'storefront',
    };

    const [orders, total] = await Promise.all([
      Sales.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('invoiceId', 'invoiceNumber invoiceDate status grandTotal')
        .lean(),
      Sales.countDocuments(query),
    ]);

    return { orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getOrderDetail(organizationId, customerId, saleId) {
    const sale = await Sales.findOne({
      _id: saleId,
      organizationId,
      customerId,
      source: 'storefront',
    })
      .populate('invoiceId')
      .lean();

    if (!sale) throw new AppError('Order not found', 404);
    return sale;
  }

  // ────────────────────────────────────────────────────────────────────
  // 3. INVOICE — fetches Invoice doc for PDF generation
  // ────────────────────────────────────────────────────────────────────
  async getInvoiceForPortal(organizationId, customerId, invoiceId) {
    // Verify the invoice belongs to this customer
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      organizationId,
      customerId,
    })
      .populate('customerId', 'name phone email billingAddress')
      .lean();

    if (!invoice) throw new AppError('Invoice not found', 404);
    return invoice;
  }

  // ────────────────────────────────────────────────────────────────────
  // 4. RETURNS
  // ────────────────────────────────────────────────────────────────────

  /**
   * Submit a return request from the portal.
   * Creates a SalesReturn with status:'pending' and source:'storefront_request'.
   */
  async submitReturn(organizationId, customerId, payload) {
    const { invoiceId, items, reason, notes, evidenceImages = [] } = payload;

    if (!invoiceId) throw new AppError('invoiceId is required', 400);
    if (!Array.isArray(items) || !items.length) throw new AppError('At least one item is required', 400);
    if (!reason?.trim()) throw new AppError('Return reason is required', 400);

    // Verify invoice belongs to this portal customer
    const invoice = await Invoice.findOne({ _id: invoiceId, organizationId, customerId }).lean();
    if (!invoice) throw new AppError('Invoice not found or does not belong to your account', 404);

    // Check for duplicate pending return on same invoice
    const existing = await SalesReturn.findOne({
      invoiceId,
      organizationId,
      status: { $in: ['pending', 'approved'] },
    }).lean();
    if (existing) {
      throw new AppError('A return request already exists for this order', 409);
    }

    const SalesReturnService = require('../../../modules/inventory/core/service/salesReturn.service');
    
    // Create the return via the official service to handle return numbers, totals, etc.
    // We pass a mock user object because the service expects a CRM user, but we inject the organizationId
    const salesReturn = await SalesReturnService.createReturn({
      invoiceId,
      items,
      reason,
      notes,
    }, {
      _id: customerId, // record customer as creator
      organizationId
    });

    // Tag the return as originating from the storefront portal with evidence images
    salesReturn.source = 'storefront_request';
    salesReturn.storefront = {
      customerId,
      returnReason: reason.trim(),
      evidenceImages,
    };
    
    await salesReturn.save();

    return salesReturn;
  }

  async listReturns(organizationId, customerId, { page = 1, limit = 20 } = {}) {
    page  = Math.max(Number(page)  || 1, 1);
    limit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const query = { organizationId, customerId, source: 'storefront_request' };
    const [returns, total] = await Promise.all([
      SalesReturn.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('invoiceId', 'invoiceNumber invoiceDate grandTotal')
        .lean(),
      SalesReturn.countDocuments(query),
    ]);

    return { returns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getReturnDetail(organizationId, customerId, returnId) {
    const salesReturn = await SalesReturn.findOne({
      _id: returnId,
      organizationId,
      customerId,
    })
      .populate('invoiceId', 'invoiceNumber invoiceDate grandTotal items')
      .lean();

    if (!salesReturn) throw new AppError('Return not found', 404);
    return salesReturn;
  }
}

module.exports = new PortalDataService();
