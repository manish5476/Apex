// src/routes/storefront/smartRule.routes.js
//
// Mounted separately if you prefer:
//   app.use('/api/v1/admin/storefront/rules', smartRuleRoutes);
//
// Or left inside admin.routes.js (already included there).
// This file exists for teams that want the rules router independently.

const express = require('express');
const router  = express.Router();

const auth = require('../../../core/middleware/auth.middleware');
const smartRuleController = require('../../controllers/storefront/smartRule.controller');

router.use(auth.protect);

// ── CRUD ────────────────────────────────────────────────────
router.route('/')
  .get(smartRuleController.getAllRules)
  .post(smartRuleController.createRule);

// NOTE: /preview must be registered BEFORE /:ruleId
// so Express does not match the string "preview" as a ruleId.
router.post('/preview', smartRuleController.previewRule);

router.route('/:ruleId')
  .get(smartRuleController.getRuleById)
  .put(smartRuleController.updateRule)
  .delete(smartRuleController.deleteRule);

// ── ACTIONS ──────────────────────────────────────────────────
router.post  ('/:ruleId/execute',     smartRuleController.executeRule);
router.post  ('/:ruleId/clear-cache', smartRuleController.clearCache);
router.delete('/:ruleId/cache',       smartRuleController.clearCache); // matches your old DELETE pattern

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const smartRuleController = require('../../controllers/storefront/smartRule.controller');
// const auth = require('../../../core/middleware/auth.middleware');

// // All routes require authentication
// router.use(auth.protect);

// // ==========================================
// // 1. CRUD ROUTES
// // ==========================================
// router.route('/')
//   .get(smartRuleController.getAllRules)
//   .post(smartRuleController.createRule);

// router.route('/:ruleId')
//   .get(smartRuleController.getRuleById)
//   .put(smartRuleController.updateRule)
//   .delete(smartRuleController.deleteRule);

// // ==========================================
// // 2. ACTION ROUTES
// // ==========================================
// router.get('/:ruleId/execute', smartRuleController.executeRule);
// router.post('/preview', smartRuleController.previewRule);
// // router.get('/:ruleId/analytics', smartRuleController.getRuleAnalytics);
// // router.post('/template', smartRuleController.createFromTemplate);
// router.delete('/:ruleId/cache', smartRuleController.clearCache);

// module.exports = router;