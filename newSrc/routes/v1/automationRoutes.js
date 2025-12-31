const express = require("express");
const router = express.Router();
const automationController = require("../../controllers/automationController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.route("/webhooks")
  .get(checkPermission(PERMISSIONS.AUTOMATION.READ), automationController.getAllWebhooks)
  .post(checkPermission(PERMISSIONS.AUTOMATION.WEBHOOK), automationController.createWebhook);

router.route("/webhooks/:id")
  .patch(checkPermission(PERMISSIONS.AUTOMATION.WEBHOOK), automationController.updateWebhook)
  .delete(checkPermission(PERMISSIONS.AUTOMATION.WEBHOOK), automationController.deleteWebhook);

router.route("/workflows")
  .get(checkPermission(PERMISSIONS.AUTOMATION.READ), automationController.getAllWorkflows)
  .post(checkPermission(PERMISSIONS.AUTOMATION.WORKFLOW), automationController.createWorkflow);

router.route("/workflows/:id")
  .patch(checkPermission(PERMISSIONS.AUTOMATION.WORKFLOW), automationController.updateWorkflow)
  .delete(checkPermission(PERMISSIONS.AUTOMATION.WORKFLOW), automationController.deleteWorkflow);

module.exports = router;


// const express = require("express");
// const router = express.Router();
// const automationController = require("../../controllers/automationController");
// const authController = require("../../controllers/authController");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // Only Admins should touch automation
// // Add AUTOMATION permissions to your config/permissions.js if needed
// // For now, using 'MANAGE_ORGANIZATION' as proxy

// router.route("/webhooks")
//   .get(automationController.getAllWebhooks)
//   .post(automationController.createWebhook);

// router.route("/webhooks/:id")
//   .patch(automationController.updateWebhook)
//   .delete(automationController.deleteWebhook);

// router.route("/workflows")
//   .get(automationController.getAllWorkflows)
//   .post(automationController.createWorkflow);

// router.route("/workflows/:id")
//   .patch(automationController.updateWorkflow)
//   .delete(automationController.deleteWorkflow);

// module.exports = router;