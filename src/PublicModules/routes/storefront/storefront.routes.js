/**
 * Storefront Routes
 *
 * Mount this router at the app level:
 *   app.use('/api/v1', storefrontRouter);
 *
 * Resulting routes:
 *
 * ADMIN (requires JWT + organizationId)
 *   GET    /api/v1/admin/storefront/layout
 *   PUT    /api/v1/admin/storefront/layout
 *   DELETE /api/v1/admin/storefront/layout/reset
 *
 *   GET    /api/v1/admin/storefront/section-types
 *   GET    /api/v1/admin/storefront/templates
 *   GET    /api/v1/admin/storefront/themes
 *
 *   GET    /api/v1/admin/storefront/pages
 *   POST   /api/v1/admin/storefront/pages
 *   GET    /api/v1/admin/storefront/pages/:pageId
 *   PUT    /api/v1/admin/storefront/pages/:pageId
 *   DELETE /api/v1/admin/storefront/pages/:pageId
 *   POST   /api/v1/admin/storefront/pages/:pageId/publish
 *   POST   /api/v1/admin/storefront/pages/:pageId/unpublish
 *   POST   /api/v1/admin/storefront/pages/:pageId/set-homepage
 *   POST   /api/v1/admin/storefront/pages/:pageId/duplicate
 *   GET    /api/v1/admin/storefront/pages/:pageId/analytics
 *
 *   GET    /api/v1/admin/storefront/rules
 *   POST   /api/v1/admin/storefront/rules
 *   POST   /api/v1/admin/storefront/rules/preview
 *   GET    /api/v1/admin/storefront/rules/:ruleId
 *   PUT    /api/v1/admin/storefront/rules/:ruleId
 *   DELETE /api/v1/admin/storefront/rules/:ruleId
 *   POST   /api/v1/admin/storefront/rules/:ruleId/execute
 *   POST   /api/v1/admin/storefront/rules/:ruleId/clear-cache
 *
 * PUBLIC (no auth)
 *   GET    /api/v1/store/:organizationSlug
 *   GET    /api/v1/store/:organizationSlug/sitemap
 *   GET    /api/v1/store/:organizationSlug/meta
 *   GET    /api/v1/store/:organizationSlug/filters
 *   GET    /api/v1/store/:organizationSlug/search
 *   GET    /api/v1/store/:organizationSlug/categories
 *   GET    /api/v1/store/:organizationSlug/brands
 *   GET    /api/v1/store/:organizationSlug/tags
 *   GET    /api/v1/store/:organizationSlug/products
 *   GET    /api/v1/store/:organizationSlug/products/:productSlug
 *
 *   GET    /api/v1/store/:organizationSlug/cart
 *   POST   /api/v1/store/:organizationSlug/cart/items
 *   PATCH  /api/v1/store/:organizationSlug/cart/items/:cartItemId
 *   DELETE /api/v1/store/:organizationSlug/cart/items/:cartItemId
 *   DELETE /api/v1/store/:organizationSlug/cart
 *   POST   /api/v1/store/:organizationSlug/cart/merge      (auth required)
 *   GET    /api/v1/store/:organizationSlug/cart/validate
 *
 *   GET    /api/v1/store/:organizationSlug/:pageSlug       (catch-all page render — LAST)
 */

'use strict';

const express = require('express');

// Controllers
const {
  LayoutAdminController,
  StorefrontAdminController,
  SmartRuleController,
  StorefrontPublicController,
  ProductPublicController,
  CartController
} = require('../controllers');

// Auth middleware (swap for your actual middleware)
// protect     → verifies JWT, attaches req.user
// requireRole → gates by role (optional)
const { protect } = require('../../../core/middleware/auth.middleware');

// Rate limiter for public endpoints
const publicRateLimit = require('../../../core/middleware/rateLimit.middleware');

// ============================================================================
// ADMIN ROUTER
// ============================================================================

const adminRouter = express.Router();

// All admin routes require authentication
adminRouter.use(protect);

// --- Layout -----------------------------------------------------------------
adminRouter.get('/layout',       LayoutAdminController.getLayout);
adminRouter.put('/layout',       LayoutAdminController.updateLayout);
adminRouter.delete('/layout/reset', LayoutAdminController.resetLayout);

// --- Builder catalogue -------------------------------------------------------
adminRouter.get('/section-types', StorefrontAdminController.getSectionTypes);
adminRouter.get('/templates',     StorefrontAdminController.getTemplates);
adminRouter.get('/themes',        StorefrontAdminController.getAvailableThemes);

// --- Pages -------------------------------------------------------------------
adminRouter.get('/pages',     StorefrontAdminController.getPages);
adminRouter.post('/pages',    StorefrontAdminController.createPage);

adminRouter.get('/pages/:pageId',    StorefrontAdminController.getPageById);
adminRouter.put('/pages/:pageId',    StorefrontAdminController.updatePage);
adminRouter.delete('/pages/:pageId', StorefrontAdminController.deletePage);

adminRouter.post('/pages/:pageId/publish',      StorefrontAdminController.publishPage);
adminRouter.post('/pages/:pageId/unpublish',    StorefrontAdminController.unpublishPage);
adminRouter.post('/pages/:pageId/set-homepage', StorefrontAdminController.setHomepage);
adminRouter.post('/pages/:pageId/duplicate',    StorefrontAdminController.duplicatePage);
adminRouter.get('/pages/:pageId/analytics',     StorefrontAdminController.getPageAnalytics);

// --- Smart Rules -------------------------------------------------------------
// NOTE: /preview must be registered BEFORE /:ruleId so it isn't treated as an id
adminRouter.get('/rules',         SmartRuleController.getAllRules);
adminRouter.post('/rules',        SmartRuleController.createRule);
adminRouter.post('/rules/preview', SmartRuleController.previewRule);

adminRouter.get('/rules/:ruleId',    SmartRuleController.getRuleById);
adminRouter.put('/rules/:ruleId',    SmartRuleController.updateRule);
adminRouter.delete('/rules/:ruleId', SmartRuleController.deleteRule);

adminRouter.post('/rules/:ruleId/execute',     SmartRuleController.executeRule);
adminRouter.post('/rules/:ruleId/clear-cache', SmartRuleController.clearCache);

// ============================================================================
// PUBLIC ROUTER
// ============================================================================

const publicRouter = express.Router();

publicRouter.use(publicRateLimit);

// --- Per org (parameterised by slug) -----------------------------------------
publicRouter.get('/:organizationSlug',         StorefrontPublicController.getOrganizationInfo);
publicRouter.get('/:organizationSlug/sitemap', StorefrontPublicController.getSitemap);
publicRouter.get('/:organizationSlug/meta',    ProductPublicController.getStoreMetadata);
publicRouter.get('/:organizationSlug/filters', ProductPublicController.getShopFilters);
publicRouter.get('/:organizationSlug/search',  ProductPublicController.searchProducts);
publicRouter.get('/:organizationSlug/categories', ProductPublicController.getCategories);
publicRouter.get('/:organizationSlug/brands',     ProductPublicController.getBrands);
publicRouter.get('/:organizationSlug/tags',        ProductPublicController.getTags);

// Products
publicRouter.get('/:organizationSlug/products',             ProductPublicController.getProducts);
publicRouter.get('/:organizationSlug/products/:productSlug', ProductPublicController.getProductBySlug);

// Cart — optionally authenticated (protect is optional here; CartController
// handles both authed and guest flows via cookie fallback)
publicRouter.get   ('/:organizationSlug/cart',                    CartController.getCart);
publicRouter.post  ('/:organizationSlug/cart/items',              CartController.addItem);
publicRouter.patch ('/:organizationSlug/cart/items/:cartItemId',  CartController.updateItemQuantity);
publicRouter.delete('/:organizationSlug/cart/items/:cartItemId',  CartController.removeItem);
publicRouter.delete('/:organizationSlug/cart',                    CartController.clearCart);
publicRouter.get   ('/:organizationSlug/cart/validate',           CartController.validateCart);

// Cart merge requires auth
publicRouter.post('/:organizationSlug/cart/merge', protect, CartController.mergeCart);

// --- Page renderer (catch-all — MUST be last) --------------------------------
publicRouter.get('/:organizationSlug/:pageSlug', StorefrontPublicController.getPublicPage);

// ============================================================================
// MAIN EXPORT — mount both onto the parent app
// ============================================================================

const storefrontRouter = express.Router();

storefrontRouter.use('/admin/storefront', adminRouter);
storefrontRouter.use('/store',            publicRouter);

module.exports = storefrontRouter;