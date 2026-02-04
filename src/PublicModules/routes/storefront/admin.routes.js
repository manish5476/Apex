const express = require('express');
const router = express.Router();
const auth = require('../../../core/middleware/auth.middleware');
const storefrontAdminController = require('../../controllers/storefront/storefrontAdmin.controller');
const smartRuleController = require('../../controllers/storefront/smartRule.controller');

// 🔒 All routes require Authentication
router.use(auth.protect);

// --- 1. LAYOUT & THEME ---
router.route('/layout')
  .get(storefrontAdminController.getLayout)
  .put(storefrontAdminController.updateLayout); // Updates Header, Footer, AND Theme

// --- 2. PAGE MANAGEMENT ---
router.route('/pages')
  .get(storefrontAdminController.getPages)
  .post(storefrontAdminController.createPage);

router.route('/pages/:pageId')
  .get(storefrontAdminController.getPageById)
  .put(storefrontAdminController.updatePage)
  .delete(storefrontAdminController.deletePage); // Soft Delete

// Page Actions
router.post('/pages/:pageId/publish', storefrontAdminController.publishPage);
router.post('/pages/:pageId/unpublish', storefrontAdminController.unpublishPage);
router.post('/pages/:pageId/duplicate', storefrontAdminController.duplicatePage);

// --- 3. SMART RULES (The Brain) ---
router.route('/smart-rules')
  .get(smartRuleController.getAllRules)
  .post(smartRuleController.createRule);

router.route('/smart-rules/:ruleId')
  .get(smartRuleController.getRuleById)
  .put(smartRuleController.updateRule)
  .delete(smartRuleController.deleteRule);

router.get('/smart-rules/:ruleId/preview', smartRuleController.executeRule); // Test before saving

// --- 4. ASSETS (Templates) ---
router.get('/templates', storefrontAdminController.getTemplates);
router.get('/sections', storefrontAdminController.getSectionTypes);

module.exports = router;

// // src/routes/storefront/admin.routes.js
// const express = require('express');
// const router = express.Router();
// const auth = require('../../../core/middleware/auth.middleware');
// const storefrontAdminController = require('../../controllers/storefront/storefrontAdmin.controller');

// // All routes require authentication
// router.use(auth.protect);

// router.route('/layout')
//   .get(storefrontAdminController.getLayout)
//   .put(storefrontAdminController.updateLayout);
  
// // Page management
// router.route('/pages')
//   .get(storefrontAdminController.getPages)
//   .post(storefrontAdminController.createPage);

// router.route('/pages/:pageId')
//   .get(storefrontAdminController.getPageById)
//   .put(storefrontAdminController.updatePage)
//   .delete(storefrontAdminController.deletePage);

// router.post('/pages/:pageId/publish', storefrontAdminController.publishPage);
// router.post('/pages/:pageId/unpublish', storefrontAdminController.unpublishPage);
// router.post('/pages/:pageId/duplicate', storefrontAdminController.duplicatePage);

// // Sections and templates
// router.get('/sections', storefrontAdminController.getSectionTypes);
// router.get('/templates', storefrontAdminController.getTemplates);

// // Analytics
// router.get('/pages/:pageId/analytics', storefrontAdminController.getPageAnalytics);

// module.exports = router;