const express = require('express');
const router = express.Router();
const smartRuleController = require('../../controllers/storefront/smartRule.controller');
const auth = require('../../../core/middleware/auth.middleware');

// All routes require authentication
router.use(auth.protect);

// ==========================================
// 1. CRUD ROUTES
// ==========================================
router.route('/')
  .get(smartRuleController.getAllRules)
  .post(smartRuleController.createRule);

router.route('/:ruleId')
  .get(smartRuleController.getRuleById)
  .put(smartRuleController.updateRule)
  .delete(smartRuleController.deleteRule);

// ==========================================
// 2. ACTION ROUTES
// ==========================================
router.get('/:ruleId/execute', smartRuleController.executeRule);
router.post('/preview', smartRuleController.previewRule);
// router.get('/:ruleId/analytics', smartRuleController.getRuleAnalytics);
// router.post('/template', smartRuleController.createFromTemplate);
router.delete('/:ruleId/cache', smartRuleController.clearCache);

module.exports = router;

