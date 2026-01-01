const express = require("express");
const router = express.Router();
const authController = require("@modules/auth/core/auth.controller");
const orgController = require("../../controllers/organizationExtrasController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.patch("/transfer-ownership", checkPermission(PERMISSIONS.ORG.TRANSFER), orgController.transferOwnership);
router.post("/invite", checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgController.inviteUser);
router.delete("/members/:id", checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgController.removeMember);
router.get("/activity-log", checkPermission(PERMISSIONS.ORG.MANAGE), orgController.getActivityLog);

module.exports = router;
