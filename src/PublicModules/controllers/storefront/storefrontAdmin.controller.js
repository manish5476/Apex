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

class StorefrontAdminController {

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

      // Slug format check
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return next(new AppError('Slug may only contain lowercase letters, numbers, and hyphens', 400));
      }

      // Slug uniqueness
      const exists = await StorefrontPage.findOne({ organizationId, slug: slug.toLowerCase() });
      if (exists) {
        return next(new AppError(`A page with slug "${slug}" already exists`, 409));
      }

      // Validate sections if provided
      if (sections.length > 0) {
        const result = SectionValidator.validateSections(sections);
        if (!result.valid) {
          return next(new AppError(`Section validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      const page = await StorefrontPage.create({
        organizationId,
        name,
        slug: slug.toLowerCase(),
        pageType,
        sections,
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
      const { status, paymentStatus, search, page = 1, limit = 20 } = req.query;

      const query = { organizationId };
      if (status) query.orderStatus = status;
      if (paymentStatus) query.paymentStatus = paymentStatus;

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
      const { orderId } = req.params;
      const { orderStatus, fulfillmentStatus, paymentStatus } = req.body;

      const order = await StorefrontOrder.findOne({ _id: orderId, organizationId });
      if (!order) return next(new AppError('Order not found', 404));

      const oldOrderStatus = order.orderStatus;
      const oldFulfillmentStatus = order.fulfillmentStatus;

      if (orderStatus) order.orderStatus = orderStatus;
      if (fulfillmentStatus) order.fulfillmentStatus = fulfillmentStatus;
      if (paymentStatus) order.paymentStatus = paymentStatus;

      // Handle Cancellation
      if (orderStatus === 'cancelled' && oldOrderStatus !== 'cancelled') {
        const Product = require('../../../modules/inventory/core/model/product.model');
        for (const item of order.items) {
          if (!item.productId) continue;
          const product = await Product.findOne({ _id: item.productId, organizationId });
          if (product && product.inventory && product.inventory.length > 0) {
            let inv = product.inventory.find(i => i.branchId?.toString() === item.branchId?.toString());
            if (!inv) inv = product.inventory[0];
            inv.reservedQuantity = Math.max(0, (inv.reservedQuantity || 0) - item.quantity);
            await product.save();
          }
        }
      }

      // Handle Delivery (deduct physical stock)
      if (fulfillmentStatus === 'delivered' && oldFulfillmentStatus !== 'delivered') {
        const Product = require('../../../modules/inventory/core/model/product.model');
        for (const item of order.items) {
          if (!item.productId) continue;
          const product = await Product.findOne({ _id: item.productId, organizationId });
          if (product && product.inventory && product.inventory.length > 0) {
            let inv = product.inventory.find(i => i.branchId?.toString() === item.branchId?.toString());
            if (!inv) inv = product.inventory[0];
            inv.quantity = Math.max(0, inv.quantity - item.quantity);
            inv.reservedQuantity = Math.max(0, (inv.reservedQuantity || 0) - item.quantity);
            await product.save();
          }
        }

        // Generate Invoice
        try {
          const Invoice = require('../../../modules/accounting/billing/invoice.model');
          const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const { nanoid } = require('nanoid');

          const invoiceItems = order.items.map(i => ({
            productId: i.productId,
            name: i.snapshot?.name || 'Product',
            quantity: i.quantity,
            originalQuantity: i.quantity,
            unit: 'pcs',
            purchasePriceAtSale: 0,
            price: i.unitPrice,
            discount: i.discountAmount,
            taxRate: i.snapshot?.taxRate || 0,
            hsnCode: i.snapshot?.hsnCode
          }));

          const addressToString = (addr) => addr ? Object.values(addr).filter(v => typeof v === 'string' && v.trim() !== '').join(', ') : '';

          await Invoice.create({
            organizationId,
            customerId: order.customerId,
            saleId: order._id,
            invoiceNumber: `INV-${date}-${nanoid(6).toUpperCase()}`,
            invoiceDate: new Date(),
            status: 'issued',
            billingAddress: addressToString(order.billingAddress),
            shippingAddress: addressToString(order.shippingAddress),
            items: invoiceItems,
            shippingCharges: order.totals?.shipping || 0,
            grandTotal: order.totals?.grandTotal || 0,
            paymentStatus: order.paymentStatus === 'paid' ? 'paid' : 'unpaid',
            paidAmount: order.paymentStatus === 'paid' ? (order.totals?.grandTotal || 0) : 0
          });
        } catch (invoiceErr) {
          console.error('[Invoice Generation Error]', invoiceErr.message);
        }
      }

      await order.save();

      res.status(200).json({
        status: 'success',
        data: order
      });
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
}

module.exports = new StorefrontAdminController();


