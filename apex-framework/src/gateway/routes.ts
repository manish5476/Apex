const express = require('express');
const router = express.Router();

/**
 * Every module exposes a public `index.js` with a `.router`.
 * This file is the ONLY place in the whole app allowed to import
 * multiple modules — everywhere else, modules stay isolated.
 *
 * When you extract a module into its own service later, delete its
 * line here and replace it with an http-proxy-middleware rule instead:
 *
 *   router.use('/inventory', createProxyMiddleware({ target: 'http://inventory-service:4001' }));
 *
 * NAMESPACES (accounting, hrms, storefront) mount their whole sub-module
 * tree with one line — see src/modules/<namespace>/index.js for what
 * each one aggregates.
 */

// --- namespaces (nested sub-modules) ---
router.use('/accounting', require('../modules/accounting').router);   // billing, core, payments
router.use('/hrms', require('../modules/hrms').router);                // attendance, core-hr, leave-management, payroll-compensation, performance
router.use('/storefront', require('../modules/storefront').router);   // cart, customer-portal, layout, order, session, smart-rule

// --- flat modules ---
router.use('/products', require('../modules/products').router);
router.use('/inventory', require('../modules/inventory').router);
router.use('/activity', require('../modules/activity').router);
router.use('/ai', require('../modules/ai').router);
router.use('/analytics', require('../modules/analytics').router);
router.use('/auth', require('../modules/auth').router);
router.use('/dashboard', require('../modules/dashboard').router);
router.use('/feed', require('../modules/feed').router);
router.use('/field-service', require('../modules/fieldService').router);
router.use('/logistics', require('../modules/logistics').router);
router.use('/master', require('../modules/master').router);
router.use('/notes', require('../modules/notes').router);
router.use('/notification', require('../modules/notification').router);
router.use('/organization', require('../modules/organization').router);
router.use('/uploads', require('../modules/uploads').router);
router.use('/webhook', require('../modules/webhook').router);
router.use('/admin-platform', require('../modules/adminPlatform').router);

module.exports = router;
