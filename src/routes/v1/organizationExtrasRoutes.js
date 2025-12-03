const express = require("express");
const router = express.Router();
const authController = require("../../controllers/authController");
const orgController = require("../../controllers/organizationExtrasController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.patch("/transfer-ownership", checkPermission(PERMISSIONS.ORG.TRANSFER), orgController.transferOwnership);
router.post("/invite", checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgController.inviteUser);
router.delete("/members/:id", checkPermission(PERMISSIONS.ORG.MANAGE_MEMBERS), orgController.removeMember);
router.get("/activity-log", checkPermission(PERMISSIONS.ORG.MANAGE), orgController.getActivityLog);

module.exports = router;



// const express = require("express");
// const authController = require("../../controllers/authController");
// const orgController = require("../../controllers/organizationExtrasController");

// const router = express.Router();

// router.use(authController.protect);

// // ---------------------------------------------------
// // ORG OWNER / ADMIN ONLY
// // ---------------------------------------------------
// router.patch(
//   "/transfer-ownership",
//   authController.restrictTo("manage_organization", "superadmin"),
//   orgController.transferOwnership
// );

// router.post(
//   "/invite",
//   authController.restrictTo("manage_organization", "superadmin"),
//   orgController.inviteUser
// );

// router.delete(
//   "/members/:id",
//   authController.restrictTo("manage_organization", "superadmin"),
//   orgController.removeMember
// );

// // ---------------------------------------------------
// // ACTIVITY LOG (Admin view)
// // ---------------------------------------------------
// router.get(
//   "/activity-log",
//   authController.restrictTo("manage_organization", "superadmin"),
//   orgController.getActivityLog
// );

// module.exports = router;
