// src/routes/storefront/index.js
//
// Mount all storefront route files from your main app router.
//
// In your app.js / server.js:
//
//   const storefrontRoutes = require('./routes/storefront');
//   storefrontRoutes(app);
//
// This gives you:
//
//   ADMIN
//     /api/v1/admin/storefront/layout
//     /api/v1/admin/storefront/layout/reset
//     /api/v1/admin/storefront/themes
//     /api/v1/admin/storefront/sections
//     /api/v1/admin/storefront/templates
//     /api/v1/admin/storefront/pages
//     /api/v1/admin/storefront/pages/:pageId
//     /api/v1/admin/storefront/pages/:pageId/publish
//     /api/v1/admin/storefront/pages/:pageId/unpublish
//     /api/v1/admin/storefront/pages/:pageId/set-homepage
//     /api/v1/admin/storefront/pages/:pageId/duplicate
//     /api/v1/admin/storefront/pages/:pageId/analytics
//     /api/v1/admin/storefront/rules
//     /api/v1/admin/storefront/rules/preview
//     /api/v1/admin/storefront/rules/:ruleId
//     /api/v1/admin/storefront/rules/:ruleId/execute
//     /api/v1/admin/storefront/rules/:ruleId/clear-cache
//
//   PUBLIC
//     /api/v1/store/:organizationSlug
//     /api/v1/store/:organizationSlug/sitemap
//     /api/v1/store/:organizationSlug/meta
//     /api/v1/store/:organizationSlug/filters
//     /api/v1/store/:organizationSlug/search
//     /api/v1/store/:organizationSlug/categories
//     /api/v1/store/:organizationSlug/brands
//     /api/v1/store/:organizationSlug/tags
//     /api/v1/store/:organizationSlug/products
//     /api/v1/store/:organizationSlug/products/:productSlug
//     /api/v1/store/:organizationSlug/cart
//     /api/v1/store/:organizationSlug/cart/items
//     /api/v1/store/:organizationSlug/cart/items/:cartItemId
//     /api/v1/store/:organizationSlug/cart/validate
//     /api/v1/store/:organizationSlug/cart/merge
//     /api/v1/store/:organizationSlug/:pageSlug   ← catch-all, always last

const adminRoutes  = require('./admin.routes');
const publicRoutes = require('./public.routes');

module.exports = function mountStorefrontRoutes(app) {
  app.use('/api/v1/admin/storefront', adminRoutes);
  app.use('/api/v1/store',            publicRoutes);
};


// // src/publicModules/routes/index.js
// const express = require('express');
// const router = express.Router();

// const storefrontPublicRoutes = require('./public.routes');
// const storefrontAdminRoutes = require('./admin.routes');
// // src/routes/index.js
// const smartRuleRoutes = require('./smartRule.routes');

// // Add to existing routes
// router.use('/admin/storefront/smart-rules', smartRuleRoutes);
// router.use('/public', storefrontPublicRoutes);
// router.use('/admin/storefront', storefrontAdminRoutes);

// module.exports = router;