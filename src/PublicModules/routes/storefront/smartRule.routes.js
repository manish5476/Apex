// src/routes/storefront/smartRule.routes.js
const express = require('express');
const router = express.Router();

const auth = require('../../../core/middleware/auth.middleware');
const { checkAnyPermission, checkPermission } = require('../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../config/permissions');
const smartRuleController = require('../../controllers/storefront/smartRule.controller');

router.use(auth.protect);

const canReadOrManageRules = checkAnyPermission([PERMISSIONS.STOREFRONT.READ,
PERMISSIONS.STOREFRONT.RULE_MANAGE
]);

router.route('/')
  .get(canReadOrManageRules, smartRuleController.getAllRules)
  .post(checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.createRule);

router.post('/preview', canReadOrManageRules, smartRuleController.previewRule);

router.route('/:ruleId')
  .get(canReadOrManageRules, smartRuleController.getRuleById)
  .put(checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.updateRule)
  .delete(checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.deleteRule);

router.post('/:ruleId/execute', canReadOrManageRules, smartRuleController.executeRule);
router.post('/:ruleId/clear-cache', checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.clearCache);
router.delete('/:ruleId/cache', checkPermission(PERMISSIONS.STOREFRONT.RULE_MANAGE), smartRuleController.clearCache);

module.exports = router;
