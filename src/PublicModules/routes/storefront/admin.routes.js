// src/routes/storefront/admin.routes.js
const express = require('express');
const router  = express.Router();

const auth = require('../../../core/middleware/auth.middleware');
const { checkAnyPermission, checkPermission } = require('../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../config/permissions');

const storefrontAdminController = require('../../controllers/storefront/storefrontAdmin.controller');
const layoutAdminController     = require('../../controllers/storefront/layoutAdmin.controller');
const smartRuleController       = require('../../controllers/storefront/smartRule.controller');
const storefrontCustomerController = require('../../controllers/storefront/storefrontCustomer.controller');

router.use(auth.protect);

const canReadStorefront = checkPermission(PERMISSIONS.STOREFRONT.READ);
const canReadOrManageLayout = checkAnyPermission([
  PERMISSIONS.STOREFRONT.READ,
  PERMISSIONS.STOREFRONT.LAYOUT_MANAGE
]);
const canReadOrManageThemes = checkAnyPermission([
  PERMISSIONS.STOREFRONT.READ,
  PERMISSIONS.STOREFRONT.THEME_MANAGE
]);
const canReadOrManageRules = checkAnyPermission([
  PERMISSIONS.STOREFRONT.READ,
  PERMISSIONS.STOREFRONT.RULE_MANAGE
]);

// ============================================================
// LAYOUT
// ============================================================
router.route('/layout')
  .get(canReadOrManageLayout, layoutAdminController.getLayout)
  .put(checkPermission(PERMISSIONS.STOREFRONT.LAYOUT_MANAGE), layoutAdminController.updateLayout);

router.delete('/layout/reset', checkPermission(PERMISSIONS.STOREFRONT.LAYOUT_MANAGE), layoutAdminController.resetLayout);

// ============================================================
// BUILDER CATALOGUE
// ============================================================
router.get('/themes',        canReadOrManageThemes, storefrontAdminController.getAvailableThemes);
router.get('/sections',      canReadStorefront, storefrontAdminController.getSectionTypes);
router.get('/section-types', canReadStorefront, storefrontAdminController.getSectionTypes);
router.get('/templates',     canReadStorefront, storefrontAdminController.getTemplates);

// ============================================================
// PAGES
// ============================================================
router.route('/pages')
  .get(canReadStorefront, storefrontAdminController.getPages)
  .post(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.createPage);

router.route('/pages/:pageId')
  .get(canReadStorefront, storefrontAdminController.getPageById)
  .put(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.updatePage)
  .delete(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.deletePage);

router.post('/pages/:pageId/publish',      checkPermission(PERMISSIONS.STOREFRONT.PUBLISH), storefrontAdminController.publishPage);
router.post('/pages/:pageId/unpublish',    checkPermission(PERMISSIONS.STOREFRONT.PUBLISH), storefrontAdminController.unpublishPage);
router.post('/pages/:pageId/set-homepage', checkPermission(PERMISSIONS.STOREFRONT.PUBLISH), storefrontAdminController.setHomepage);
router.post('/pages/:pageId/duplicate',    checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.duplicatePage);
router.get('/pages/:pageId/analytics',     canReadStorefront, storefrontAdminController.getPageAnalytics);
// ============================================================
// ORDERS
// ============================================================
router.get('/command-center', canReadStorefront, storefrontAdminController.getCommandCenter);
router.get('/orders', canReadStorefront, storefrontAdminController.getAllOrders);
router.put('/orders/:orderId/status', checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.updateOrderStatus);
router.patch('/orders/:orderId/assign-agent', checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.assignDeliveryAgent);

// ============================================================
// DELIVERY AGENTS
// ============================================================
router.route('/delivery-agents')
  .get(canReadStorefront, storefrontAdminController.getDeliveryAgents)
  .post(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.createDeliveryAgent);

router.route('/delivery-agents/:agentId')
  .get(canReadStorefront, storefrontAdminController.getDeliveryAgentById)
  .put(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.updateDeliveryAgent)
  .delete(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.deleteDeliveryAgent);

router.post('/delivery-agents/:agentId/send-invite', checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.sendDeliveryAgentInvite);

// ============================================================
// COUPONS
// ============================================================
router.route('/coupons')
  .get(canReadStorefront, storefrontAdminController.getCoupons)
  .post(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.createCoupon);

router.route('/coupons/:couponId')
  .get(canReadStorefront, storefrontAdminController.getCouponById)
  .put(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.updateCoupon)
  .delete(checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontAdminController.deleteCoupon);

// ============================================================
// STOREFRONT COMMERCE CUSTOMERS
// Separate from ERP/CRM customers. Conversion is explicit/manual.
// ============================================================
router.get('/customers', canReadStorefront, storefrontCustomerController.adminList);
router.get('/customers/:customerId', canReadStorefront, storefrontCustomerController.adminDetail);
router.post('/customers/:customerId/convert-to-crm', checkPermission(PERMISSIONS.STOREFRONT.PAGE_MANAGE), storefrontCustomerController.convertToCrm);

// ============================================================
// SMART RULES
// ============================================================
router.route('/rules')
  .get(canReadOrManageRules, smartRuleController.getAllRules)
  .post(checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.createRule);

router.post('/rules/preview', canReadOrManageRules, smartRuleController.previewRule);

router.route('/rules/:ruleId')
  .get(canReadOrManageRules, smartRuleController.getRuleById)
  .put(checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.updateRule)
  .delete(checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.deleteRule);

router.post('/rules/:ruleId/execute',     canReadOrManageRules, smartRuleController.executeRule);
router.post('/rules/:ruleId/clear-cache', checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.clearCache);
router.delete('/rules/:ruleId/cache',     checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.clearCache);

module.exports = router;
