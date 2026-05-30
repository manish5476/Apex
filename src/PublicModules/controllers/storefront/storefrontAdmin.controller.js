/**
 * StorefrontAdminController
 *
 * Full page management for the visual page builder.
 *
 * Routes:
 *   GET    /admin/storefront/pages
 *   POST   /admin/storefront/pages
 *   GET    /admin/storefront/pages/:pageId
 *   PUT    /admin/storefront/pages/:pageId
 *   DELETE /admin/storefront/pages/:pageId
 *
 *   POST   /admin/storefront/pages/:pageId/publish
 *   POST   /admin/storefront/pages/:pageId/unpublish
 *   POST   /admin/storefront/pages/:pageId/duplicate
 *
 *   GET    /admin/storefront/section-types
 *   GET    /admin/storefront/templates
 *   GET    /admin/storefront/themes
 *   GET    /admin/storefront/pages/:pageId/analytics
 */

'use strict';

const { StorefrontPage, SectionTemplate, StorefrontOrder } = require('../../models/storefront/index');
const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
const StorefrontCache = require('../../services/storefront/cacheInvalidation.service');
const PageSnapshotService = require('../../services/storefront/pageSnapshot.service');
const SectionValidator = require('../../middleware/validation/section.validator');
const AppError = require('../../../core/utils/api/appError');
const { THEME_LIST } = require('../../utils/constants/storefront/themes.constants');
const CustomerService = require('../../services/storefront/customer.service');
const { normalizeSection } = require('../../utils/storefront/sectionConfigNormalizer');
const OrderService = require('../../services/storefront/order.service');
const CRMBridge = require('../../services/storefront/crmBridge.service');
const StorefrontCustomer = require('../../models/storefront/storefrontCustomer.model');

class StorefrontAdminController {

  // ---------------------------------------------------------------------------
  // COMMAND CENTER
  // GET /admin/storefront/command-center
  // ---------------------------------------------------------------------------

  getCommandCenter = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const StorefrontCustomer = require('../../models/storefront/storefrontCustomer.model');
      const StorefrontCart = require('../../models/storefront/storefrontCart.model');
      const Invoice = require('../../../modules/accounting/billing/invoice.model');

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const query = { organizationId };
      const deliveredQuery = { organizationId, fulfillmentStatus: 'delivered' };

      const [
        totals,
        revenue,
        byStatus,
        byPayment,
        recentOrders,
        customers,
        abandonedCarts,
        deliveredWithoutLinkedCustomer,
        deliveredWithoutInvoice,
        unfulfilledAccepted,
        pages
      ] = await Promise.all([
        StorefrontOrder.countDocuments(query),
        StorefrontOrder.aggregate([
          { $match: { organizationId, createdAt: { $gte: since }, orderStatus: { $ne: 'cancelled' } } },
          {
            $group: {
              _id: null,
              grossRevenue: { $sum: '$totals.grandTotal' },
              shippingRevenue: { $sum: '$totals.shipping' },
              averageOrderValue: { $avg: '$totals.grandTotal' },
              orders: { $sum: 1 }
            }
          }
        ]),
        StorefrontOrder.aggregate([
          { $match: query },
          { $group: { _id: '$orderStatus', count: { $sum: 1 }, value: { $sum: '$totals.grandTotal' } } },
          { $sort: { count: -1 } }
        ]),
        StorefrontOrder.aggregate([
          { $match: query },
          { $group: { _id: '$paymentStatus', count: { $sum: 1 }, value: { $sum: '$totals.grandTotal' } } },
          { $sort: { count: -1 } }
        ]),
        StorefrontOrder.find(query)
          .populate('customerId', 'firstName lastName email phone convertedToMainCustomer linkedCustomerId guestAccount')
          .sort({ createdAt: -1 })
          .limit(8)
          .lean(),
        StorefrontCustomer.aggregate([
          { $match: { organizationId } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              guests: { $sum: { $cond: ['$guestAccount', 1, 0] } },
              converted: { $sum: { $cond: ['$convertedToMainCustomer', 1, 0] } },
              revenue: { $sum: '$totalSpent' }
            }
          }
        ]),
        StorefrontCart.countDocuments({ organizationId, status: 'abandoned' }),
        StorefrontOrder.countDocuments({
          ...deliveredQuery,
          $or: [
            { 'metadata.linkedCustomerId': null },
            { 'metadata.linkedCustomerId': { $exists: false } }
          ]
        }),
        StorefrontOrder.aggregate([
          { $match: deliveredQuery },
          {
            $lookup: {
              from: 'invoices',
              localField: '_id',
              foreignField: 'saleId',
              as: 'invoice'
            }
          },
          { $match: { invoice: { $size: 0 } } },
          { $count: 'count' }
        ]),
        StorefrontOrder.countDocuments({
          organizationId,
          orderStatus: 'confirmed',
          fulfillmentStatus: { $in: ['unfulfilled', 'partial'] }
        }),
        StorefrontPage.aggregate([
          { $match: { organizationId } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              views: { $sum: { $ifNull: ['$viewCount', 0] } }
            }
          }
        ])
      ]);

      const revenueSummary = revenue[0] || { grossRevenue: 0, shippingRevenue: 0, averageOrderValue: 0, orders: 0 };
      const customerSummary = customers[0] || { total: 0, guests: 0, converted: 0, revenue: 0 };

      res.status(200).json({
        status: 'success',
        data: {
          generatedAt: new Date().toISOString(),
          period: { label: 'Last 30 days', since },
          kpis: {
            totalOrders: totals,
            grossRevenue: revenueSummary.grossRevenue || 0,
            averageOrderValue: revenueSummary.averageOrderValue || 0,
            shippingRevenue: revenueSummary.shippingRevenue || 0,
            storefrontCustomers: customerSummary.total || 0,
            convertedCustomers: customerSummary.converted || 0,
            guestCustomers: customerSummary.guests || 0,
            abandonedCarts,
            unfulfilledAccepted,
            ghostRisk: (deliveredWithoutLinkedCustomer || 0) + (deliveredWithoutInvoice[0]?.count || 0)
          },
          byStatus,
          byPayment,
          pages,
          recentOrders,
          workQueues: [
            {
              key: 'pending-dispatch',
              title: 'Accepted orders pending dispatch',
              count: unfulfilledAccepted,
              severity: unfulfilledAccepted > 0 ? 'warning' : 'success',
              route: '/storefront/orders'
            },
            {
              key: 'ghost-customers',
              title: 'Delivered orders without CRM customer link',
              count: deliveredWithoutLinkedCustomer,
              severity: deliveredWithoutLinkedCustomer > 0 ? 'danger' : 'success',
              route: '/storefront/customers'
            },
            {
              key: 'missing-invoices',
              title: 'Delivered orders without invoice',
              count: deliveredWithoutInvoice[0]?.count || 0,
              severity: deliveredWithoutInvoice[0]?.count ? 'danger' : 'success',
              route: '/storefront/orders'
            },
            {
              key: 'abandoned-carts',
              title: 'Abandoned carts',
              count: abandonedCarts,
              severity: abandonedCarts > 0 ? 'info' : 'success',
              route: '/storefront/abandoned-carts'
            }
          ]
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // LIST pages
  // GET /admin/storefront/pages
  // ---------------------------------------------------------------------------

  getPages = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { status, pageType, search, page = 1, limit = 20 } = req.query;

      const query = { organizationId };
      if (status) query.status = status;
      if (pageType) query.pageType = pageType;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit), 50);
      const total = await StorefrontPage.countDocuments(query);

      const pages = await StorefrontPage.find(query)
        .select('name slug pageType status isPublished isHomepage viewCount updatedAt sections')
        .sort({ isHomepage: -1, updatedAt: -1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit), 50))
        .lean();

      res.status(200).json({
        status: 'success',
        results: pages.length,
        total,
        data: pages.map(p => ({
          ...p,
          sectionsCount: p.sections?.length ?? 0,
          sections: undefined // Omit heavy payload in list view
        }))
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // GET single page
  // GET /admin/storefront/pages/:pageId
  // ---------------------------------------------------------------------------

  getPageById = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({ status: 'success', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // CREATE page
  // POST /admin/storefront/pages
  // ---------------------------------------------------------------------------

  createPage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const {
        name, slug, pageType = 'custom',
        sections = [], seo = {},
        themeOverride = {}, isHomepage = false
      } = req.body;

      if (!name || !slug) {
        return next(new AppError('"name" and "slug" are required', 400));
      }

      if (!Array.isArray(sections)) {
        return next(new AppError('"sections" must be an array', 400));
      }

      // Slug format check
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return next(new AppError('Slug may only contain lowercase letters, numbers, and hyphens', 400));
      }

      // Slug uniqueness
      const exists = await StorefrontPage.findOne({ organizationId, slug: slug.toLowerCase() });
      if (exists) {
        return next(new AppError(`A page with slug "${slug}" already exists`, 409));
      }

      const normalizedSections = Array.isArray(sections)
        ? sections.map(section => normalizeSection(section))
        : sections;

      // Validate sections if provided
      if (normalizedSections.length > 0) {
        const result = SectionValidator.validateSections(normalizedSections);
        if (!result.valid) {
          return next(new AppError(`Section validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      const page = await StorefrontPage.create({
        organizationId,
        name,
        slug: slug.toLowerCase(),
        pageType,
        sections: normalizedSections,
        seo,
        themeOverride,
        isHomepage,
        status: 'draft',
        createdBy: req.user._id
      });

      await StorefrontCache.invalidateStore(organizationId);

      res.status(201).json({
        status: 'success',
        message: 'Page created',
        data: page
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE page (the core builder save endpoint)
  // PUT /admin/storefront/pages/:pageId
  // ---------------------------------------------------------------------------

  updatePage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;
      const updateData = { ...req.body };

      // Prevent direct status/publish manipulation through this endpoint
      // (use /publish and /unpublish endpoints instead)
      delete updateData.status;
      delete updateData.isPublished;
      delete updateData.publishedAt;
      delete updateData.organizationId; // Never allow org change

      // Validate sections if they're being updated
      if (updateData.sections !== undefined) {
        if (!Array.isArray(updateData.sections)) {
          return next(new AppError('"sections" must be an array', 400));
        }
        updateData.sections = updateData.sections.map(section => normalizeSection(section));
        const result = SectionValidator.validateSections(updateData.sections);
        if (!result.valid) {
          return next(new AppError(`Section validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      // Validate slug uniqueness if being changed
      if (updateData.slug) {
        updateData.slug = updateData.slug.toLowerCase();
        if (!/^[a-z0-9-]+$/.test(updateData.slug)) {
          return next(new AppError('Slug may only contain lowercase letters, numbers, and hyphens', 400));
        }
        const conflict = await StorefrontPage.findOne({
          organizationId,
          slug: updateData.slug,
          _id: { $ne: pageId }
        });
        if (conflict) {
          return next(new AppError(`Slug "${updateData.slug}" is already used by another page`, 409));
        }
      }

      const page = await StorefrontPage.findOneAndUpdate(
        { _id: pageId, organizationId },
        { $set: updateData, $inc: { version: 1 } },
        { new: true, runValidators: true }
      );

      if (!page) return next(new AppError('Page not found', 404));

      if (page.isPublished && page.status === 'published') {
        await PageSnapshotService.buildForPage(organizationId, page._id);
      } else {
        await StorefrontCache.invalidateStore(organizationId);
      }

      res.status(200).json({
        status: 'success',
        message: 'Page saved',
        data: page
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE page
  // DELETE /admin/storefront/pages/:pageId
  // ---------------------------------------------------------------------------

  deletePage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      if (page.isDeletable === false) {
        return next(new AppError('This is a core system page and cannot be deleted.', 400));
      }

      if (page.isHomepage) {
        return next(new AppError(
          'Cannot delete the active homepage. Assign a different page as homepage first.',
          400
        ));
      }

      if (page.status === 'published') {
        return next(new AppError(
          'Unpublish this page before deleting it.',
          400
        ));
      }

      await page.deleteOne();
      await PageSnapshotService.deleteForPage(organizationId, pageId);

      res.status(200).json({ status: 'success', message: 'Page deleted' });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLISH
  // POST /admin/storefront/pages/:pageId/publish
  // ---------------------------------------------------------------------------

  publishPage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOneAndUpdate(
        { _id: pageId, organizationId },
        { status: 'published', isPublished: true, publishedAt: new Date() },
        { new: true }
      );
      if (!page) return next(new AppError('Page not found', 404));

      await PageSnapshotService.buildForPage(organizationId, page._id);

      res.status(200).json({ status: 'success', message: 'Page is now live', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UNPUBLISH
  // POST /admin/storefront/pages/:pageId/unpublish
  // ---------------------------------------------------------------------------

  unpublishPage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOneAndUpdate(
        { _id: pageId, organizationId },
        { status: 'draft', isPublished: false },
        { new: true }
      );
      if (!page) return next(new AppError('Page not found', 404));

      await PageSnapshotService.deleteForPage(organizationId, page._id);

      res.status(200).json({ status: 'success', message: 'Page unpublished', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // SET HOMEPAGE
  // POST /admin/storefront/pages/:pageId/set-homepage
  // ---------------------------------------------------------------------------

  setHomepage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      if (page.status !== 'published') {
        return next(new AppError('Only published pages can be set as homepage', 400));
      }

      // The pre-save hook on StorefrontPage handles clearing isHomepage on others
      page.isHomepage = true;
      await page.save();
      await PageSnapshotService.buildForPage(organizationId, page._id);

      res.status(200).json({ status: 'success', message: 'Homepage updated', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DUPLICATE
  // POST /admin/storefront/pages/:pageId/duplicate
  // ---------------------------------------------------------------------------

  duplicatePage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;
      const { newSlug, newName } = req.body;

      const original = await StorefrontPage.findOne({ _id: pageId, organizationId }).lean();
      if (!original) return next(new AppError('Page not found', 404));

      // Generate unique slug if not provided
      const baseSlug = newSlug ?? `${original.slug}-copy`;
      const finalSlug = await this._uniqueSlug(organizationId, baseSlug);

      const { _id, createdAt, updatedAt, __v, ...rest } = original;

      const newPage = await StorefrontPage.create({
        ...rest,
        organizationId,
        name: newName ?? `${original.name} (Copy)`,
        slug: finalSlug,
        status: 'draft',
        isPublished: false,
        isHomepage: false,
        publishedAt: null,
        viewCount: 0,
        version: 1,
        createdBy: req.user._id
      });

      await StorefrontCache.invalidateStore(organizationId);

      res.status(201).json({ status: 'success', message: 'Page duplicated', data: newPage });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION TYPES catalogue (drives the page builder sidebar)
  // GET /admin/storefront/section-types
  // ---------------------------------------------------------------------------

  getSectionTypes = async (req, res, next) => {
    try {
      const { includeSystem = 'false' } = req.query;
      let types = SectionRegistry.getSectionTypes();

      if (includeSystem !== 'true') {
        types = types.filter(t => !t.isSystem);
      }

      res.status(200).json({
        status: 'success',
        results: types.length,
        data: types
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // TEMPLATES
  // GET /admin/storefront/templates
  // ---------------------------------------------------------------------------

  getTemplates = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { sectionType, category } = req.query;

      const query = {
        $or: [
          { isPublic: true },
          { isSystemTemplate: true },
          { organizationId }
        ]
      };
      if (sectionType) query.sectionType = sectionType;
      if (category) query.category = category;

      const templates = await SectionTemplate.find(query)
        .sort({ isSystemTemplate: -1, usageCount: -1 })
        .lean();

      res.status(200).json({ status: 'success', results: templates.length, data: templates });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // THEMES
  // GET /admin/storefront/themes
  // ---------------------------------------------------------------------------

  getAvailableThemes = async (req, res, next) => {
    try {
      res.status(200).json({
        status: 'success',
        results: THEME_LIST.length,
        data: { themes: THEME_LIST }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PAGE ANALYTICS
  // GET /admin/storefront/pages/:pageId/analytics
  // ---------------------------------------------------------------------------

  getPageAnalytics = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId })
        .select('name viewCount lastViewedAt status');
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({
        status: 'success',
        data: {
          pageId,
          pageName: page.name,
          pageStatus: page.status,
          views: {
            total: page.viewCount,
            lastViewedAt: page.lastViewedAt ?? null
          }
          // Wire to real analytics service here when available
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // ALL ORDERS
  // GET /admin/storefront/orders
  // ---------------------------------------------------------------------------

  getAllOrders = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { status, paymentStatus, search, crmSyncStatus, page = 1, limit = 20 } = req.query;

      const query = { organizationId };
      if (status) query.orderStatus = status;
      if (paymentStatus) query.paymentStatus = paymentStatus;
      if (crmSyncStatus) query.crmSyncStatus = crmSyncStatus;

      if (search) {
        query.orderNumber = { $regex: search, $options: 'i' };
      }

      const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit), 50);
      const total = await StorefrontOrder.countDocuments(query);

      const orders = await StorefrontOrder.find(query)
        .populate('customerId', 'firstName lastName email phone avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit), 50))
        .lean();

      res.status(200).json({
        status: 'success',
        results: orders.length,
        total,
        data: orders
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE ORDER STATUS
  // PUT /admin/storefront/orders/:orderId/status
  // ---------------------------------------------------------------------------
  updateOrderStatus = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { orderId }        = req.params;
      const { orderStatus, fulfillmentStatus, paymentStatus } = req.body;

      const order = await StorefrontOrder.findOne({ _id: orderId, organizationId });
      if (!order) return next(new AppError('Order not found', 404));

      const oldOrderStatus       = order.orderStatus;
      const oldFulfillmentStatus = order.fulfillmentStatus;

      // ── Cancellation: delegate to OrderService (reverses CRM + stock) ──────
      if (orderStatus === 'cancelled' && oldOrderStatus !== 'cancelled') {
        const cancelled = await OrderService.cancelOrder(organizationId, orderId, req.user);
        return res.status(200).json({ status: 'success', data: cancelled });
      }

      // ── Status updates ──────────────────────────────────────────────────────
      if (orderStatus && orderStatus !== oldOrderStatus) {
        order.orderStatus = orderStatus;
        order.timeline.push({
          type:    'status_update',
          message: `Order status changed to ${orderStatus}`,
          actorId: req.user._id,
        });
      }

      if (fulfillmentStatus && fulfillmentStatus !== oldFulfillmentStatus) {
        order.fulfillmentStatus = fulfillmentStatus;
        order.timeline.push({
          type:    'fulfillment_update',
          message: `Fulfillment status changed to ${fulfillmentStatus}`,
          actorId: req.user._id,
        });
      }

      if (paymentStatus) order.paymentStatus = paymentStatus;

      // ── On Delivery: verify CRM sync, attempt recovery if missing ──────────
      // CRM records should already exist from order placement (createFromCart).
      // This block is a safety net for pre-refactor orders.
      if (fulfillmentStatus === 'delivered' && oldFulfillmentStatus !== 'delivered') {
        if (!order.crmInvoiceId) {
          try {
            const sfCustomer = await StorefrontCustomer.findById(order.customerId).lean();
            if (sfCustomer) {
              const crmResult = await CRMBridge.ensureCRMCustomer(organizationId, sfCustomer, {
                shippingAddress: order.shippingAddress,
              });
              if (crmResult) {
                const { invoice, sale } = await CRMBridge.createOrderCRMRecords(
                  order, crmResult.crmCustomer, req.user
                );
                await CRMBridge.syncStorefrontCustomerLink(sfCustomer._id, crmResult.crmCustomer);
                order.crmInvoiceId  = invoice._id;
                order.crmSaleId     = sale._id;
                order.crmCustomerId = crmResult.crmCustomer._id;
                order.crmSyncStatus = 'synced';
                order.crmSyncError  = null;
                order.timeline.push({
                  type:    'crm_records_created',
                  message: `CRM Invoice ${invoice.invoiceNumber} created on delivery (recovery sync)`,
                  actorId: req.user._id,
                });
              } else {
                order.timeline.push({
                  type:    'crm_sync_skipped',
                  message: 'CRM sync skipped: customer phone number is required',
                  actorId: req.user._id,
                });
              }
            }
          } catch (crmErr) {
            console.error('[CRMBridge] Recovery sync failed on delivery:', crmErr.message);
            order.crmSyncError  = crmErr.message?.substring(0, 500);
            order.crmSyncStatus = 'failed';
            order.timeline.push({
              type:    'crm_sync_failed',
              message: `CRM sync failed: ${crmErr.message}`,
              actorId: req.user._id,
            });
          }
        } else {
          order.timeline.push({
            type:    'delivered',
            message: `Order delivered. CRM Invoice already linked (${order.crmInvoiceId})`,
            actorId: req.user._id,
          });
        }
      }

      await order.save();

      res.status(200).json({ status: 'success', data: order });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async _uniqueSlug(organizationId, base) {
    let slug = base;
    let attempt = 0;
    while (await StorefrontPage.exists({ organizationId, slug })) {
      attempt++;
      slug = `${base}-${attempt}`;
    }
    return slug;
  }

  // ---------------------------------------------------------------------------
  // COUPON ADMINISTRATION
  // ---------------------------------------------------------------------------

  getCoupons = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { search, page = 1, limit = 20 } = req.query;

      const query = { organizationId };
      if (search) {
        query.code = { $regex: search, $options: 'i' };
      }

      const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit), 50);
      const Coupon = require('../../models/storefront/storefrontCoupon.model');
      const total = await Coupon.countDocuments(query);
      const coupons = await Coupon.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit), 50))
        .lean();

      res.status(200).json({
        status: 'success',
        results: coupons.length,
        total,
        data: coupons
      });
    } catch (err) {
      next(err);
    }
  }

  createCoupon = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { code, discountType, amount, maxDiscount, minPurchaseAmount, startDate, endDate, usageLimit, isActive } = req.body;

      if (!code || amount === undefined) {
        return next(new AppError('code and amount are required', 400));
      }

      const normalized = String(code).trim().toUpperCase();
      const Coupon = require('../../models/storefront/storefrontCoupon.model');
      const exists = await Coupon.findOne({ organizationId, code: normalized });
      if (exists) {
        return next(new AppError(`Coupon with code "${normalized}" already exists`, 409));
      }

      const coupon = await Coupon.create({
        organizationId,
        code: normalized,
        discountType,
        amount,
        maxDiscount,
        minPurchaseAmount,
        startDate,
        endDate,
        usageLimit,
        isActive
      });

      res.status(201).json({ status: 'success', message: 'Coupon created', data: coupon });
    } catch (err) {
      next(err);
    }
  }

  getCouponById = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { couponId } = req.params;

      const Coupon = require('../../models/storefront/storefrontCoupon.model');
      const coupon = await Coupon.findOne({ _id: couponId, organizationId });
      if (!coupon) return next(new AppError('Coupon not found', 404));

      res.status(200).json({ status: 'success', data: coupon });
    } catch (err) {
      next(err);
    }
  }

  updateCoupon = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { couponId } = req.params;
      const updateData = { ...req.body };

      delete updateData.organizationId;
      delete updateData.code;

      const Coupon = require('../../models/storefront/storefrontCoupon.model');
      const coupon = await Coupon.findOneAndUpdate(
        { _id: couponId, organizationId },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!coupon) return next(new AppError('Coupon not found', 404));

      res.status(200).json({ status: 'success', message: 'Coupon updated', data: coupon });
    } catch (err) {
      next(err);
    }
  }

  deleteCoupon = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { couponId } = req.params;

      const Coupon = require('../../models/storefront/storefrontCoupon.model');
      const coupon = await Coupon.findOneAndDelete({ _id: couponId, organizationId });
      if (!coupon) return next(new AppError('Coupon not found', 404));

      res.status(200).json({ status: 'success', message: 'Coupon deleted' });
    } catch (err) {
      next(err);
    }
  }
  // ---------------------------------------------------------------------------
  // DELIVERY AGENT ADMINISTRATION
  // ---------------------------------------------------------------------------

  getDeliveryAgents = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { search, page = 1, limit = 20 } = req.query;

      const query = { organizationId };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit), 50);
      const Agent = require('../../models/storefront/storefrontDeliveryAgent.model');
      const total = await Agent.countDocuments(query);
      const agents = await Agent.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit), 50))
        .populate('staffId', 'firstName lastName email')
        .lean();

      res.status(200).json({
        status: 'success',
        results: agents.length,
        total,
        data: agents
      });
    } catch (err) {
      next(err);
    }
  }

  createDeliveryAgent = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { name, phone, email, password, staffId, vehicleType, vehicleRegistrationNumber, isActive } = req.body;

      if (!name || !phone || !password) {
        return next(new AppError('name, phone, and password are required', 400));
      }

      const Agent = require('../../models/storefront/storefrontDeliveryAgent.model');
      const exists = await Agent.findOne({ organizationId, phone });
      if (exists) {
        return next(new AppError(`Delivery Agent with phone "${phone}" already exists`, 409));
      }

      const agent = await Agent.create({
        organizationId,
        name,
        phone,
        email,
        password,
        staffId: staffId || null,
        vehicleType,
        vehicleRegistrationNumber,
        isActive
      });

      agent.password = undefined; // hide password in response

      res.status(201).json({ status: 'success', message: 'Delivery Agent created', data: agent });
    } catch (err) {
      next(err);
    }
  }

  getDeliveryAgentById = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { agentId } = req.params;

      const Agent = require('../../models/storefront/storefrontDeliveryAgent.model');
      const agent = await Agent.findOne({ _id: agentId, organizationId }).populate('staffId', 'firstName lastName email');
      if (!agent) return next(new AppError('Delivery Agent not found', 404));

      res.status(200).json({ status: 'success', data: agent });
    } catch (err) {
      next(err);
    }
  }

  updateDeliveryAgent = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { agentId } = req.params;
      const updateData = { ...req.body };

      delete updateData.organizationId;

      const Agent = require('../../models/storefront/storefrontDeliveryAgent.model');

      if (updateData.password) {
        // Need to save so pre-save hook hashes the password
        const agent = await Agent.findOne({ _id: agentId, organizationId });
        if (!agent) return next(new AppError('Delivery Agent not found', 404));

        Object.assign(agent, updateData);
        await agent.save();
        agent.password = undefined;
        return res.status(200).json({ status: 'success', message: 'Delivery Agent updated', data: agent });
      } else {
        const agent = await Agent.findOneAndUpdate(
          { _id: agentId, organizationId },
          { $set: updateData },
          { new: true, runValidators: true }
        );
        if (!agent) return next(new AppError('Delivery Agent not found', 404));
        res.status(200).json({ status: 'success', message: 'Delivery Agent updated', data: agent });
      }
    } catch (err) {
      next(err);
    }
  }

  deleteDeliveryAgent = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { agentId } = req.params;

      const Agent = require('../../models/storefront/storefrontDeliveryAgent.model');
      const agent = await Agent.findOneAndDelete({ _id: agentId, organizationId });
      if (!agent) return next(new AppError('Delivery Agent not found', 404));

      res.status(200).json({ status: 'success', message: 'Delivery Agent deleted' });
    } catch (err) {
      next(err);
    }
  }

  assignDeliveryAgent = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { orderId } = req.params;
      const {
        deliveryAgent,
        carrierName,
        trackingNumber,
        estimatedDeliveryDate,
        deliveryNotes,
        fulfillmentMode,
        publicPartnerId,
        publicPartnerName,
        dispatchPriority,
        serviceLevel,
        deliveryQuote
      } = req.body;

      const order = await StorefrontOrder.findOne({ _id: orderId, organizationId });
      if (!order) return next(new AppError('Order not found', 404));

      if (deliveryAgent !== undefined) order.deliveryAgent = deliveryAgent || null;
      if (carrierName !== undefined) order.carrierName = carrierName;
      if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
      if (estimatedDeliveryDate !== undefined) order.estimatedDeliveryDate = estimatedDeliveryDate;
      if (deliveryNotes !== undefined) order.deliveryNotes = deliveryNotes;
      if (fulfillmentMode) {
        order.fulfilledBy = fulfillmentMode === 'public_partner' ? 'platform' : 'merchant';
        order.metadata = {
          ...(order.metadata || {}),
          logistics: {
            ...((order.metadata || {}).logistics || {}),
            fulfillmentMode,
            publicPartnerId: publicPartnerId || null,
            publicPartnerName: publicPartnerName || '',
            dispatchPriority: dispatchPriority || 'normal',
            serviceLevel: serviceLevel || 'standard',
            deliveryQuote: deliveryQuote || null,
            plannedAt: new Date(),
            plannedBy: req.user._id
          }
        };
      }

      let msg = 'Delivery details updated';
      if (deliveryAgent) {
        const Agent = require('../../models/storefront/storefrontDeliveryAgent.model');
        const agent = await Agent.findById(deliveryAgent);
        if (agent) {
          msg = `Assigned to delivery agent: ${agent.name}`;
          // Also add order to agent's assignedOrders
          if (!agent.assignedOrders.includes(order._id)) {
            agent.assignedOrders.push(order._id);
            await agent.save();
          }
        }
      } else if (carrierName) {
        msg = `Assigned to carrier: ${carrierName}`;
        if (trackingNumber) msg += ` (Tracking: ${trackingNumber})`;
      }
      if (publicPartnerName) {
        msg = `Routed through Apex partner network: ${publicPartnerName}`;
      }

      order.timeline.push({
        type: 'delivery_assigned',
        message: msg,
        actorId: req.user._id
      });

      await order.save();

      res.status(200).json({ status: 'success', message: 'Delivery agent assigned', data: order });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new StorefrontAdminController();


