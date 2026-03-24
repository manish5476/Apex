// src/routes/storefront/admin.routes.js
const express = require('express');
const router  = express.Router();

const auth = require('../../../core/middleware/auth.middleware');

const storefrontAdminController = require('../../controllers/storefront/storefrontAdmin.controller');
const layoutAdminController     = require('../../controllers/storefront/layoutAdmin.controller');
const smartRuleController       = require('../../controllers/storefront/smartRule.controller');

// All admin storefront routes require authentication
router.use(auth.protect);

// ============================================================
// LAYOUT
// ============================================================
router.route('/layout')
  .get(layoutAdminController.getLayout)
  .put(layoutAdminController.updateLayout);

router.delete('/layout/reset', layoutAdminController.resetLayout);

// ============================================================
// BUILDER CATALOGUE
// ============================================================
router.get('/themes',        storefrontAdminController.getAvailableThemes);
router.get('/sections',      storefrontAdminController.getSectionTypes);  // existing name
router.get('/section-types', storefrontAdminController.getSectionTypes);  // alias
router.get('/templates',     storefrontAdminController.getTemplates);

// ============================================================
// PAGES
// ============================================================
router.route('/pages')
  .get(storefrontAdminController.getPages)
  .post(storefrontAdminController.createPage);

router.route('/pages/:pageId')
  .get(storefrontAdminController.getPageById)
  .put(storefrontAdminController.updatePage)
  .delete(storefrontAdminController.deletePage);

router.post('/pages/:pageId/publish',      storefrontAdminController.publishPage);
router.post('/pages/:pageId/unpublish',    storefrontAdminController.unpublishPage);
router.post('/pages/:pageId/set-homepage', storefrontAdminController.setHomepage);
router.post('/pages/:pageId/duplicate',    storefrontAdminController.duplicatePage);
router.get('/pages/:pageId/analytics',     storefrontAdminController.getPageAnalytics);

// ============================================================
// SMART RULES
// NOTE: /preview and /preview-adhoc must come before /:ruleId
// so Express does not interpret 'preview' as a rule ID.
// ============================================================
router.route('/rules')
  .get(smartRuleController.getAllRules)
  .post(smartRuleController.createRule);

router.post('/rules/preview', smartRuleController.previewRule); // ← before /:ruleId

router.route('/rules/:ruleId')
  .get(smartRuleController.getRuleById)
  .put(smartRuleController.updateRule)
  .delete(smartRuleController.deleteRule);

router.post('/rules/:ruleId/execute',     smartRuleController.executeRule);
router.post('/rules/:ruleId/clear-cache', smartRuleController.clearCache);
router.delete('/rules/:ruleId/cache',     smartRuleController.clearCache); // alias (matches your old route)

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
// router.get('/themes', storefrontAdminController.getAvailableThemes);
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