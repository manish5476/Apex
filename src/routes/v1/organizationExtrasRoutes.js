const express = require("express");
const authController = require("../../controllers/authController");
const orgController = require("../../controllers/organizationExtrasController");

const router = express.Router();

router.use(authController.protect);

// ---------------------------------------------------
// ORG OWNER / ADMIN ONLY
// ---------------------------------------------------
router.patch(
  "/transfer-ownership",
  authController.restrictTo("manage_organization", "superadmin"),
  orgController.transferOwnership
);

router.post(
  "/invite",
  authController.restrictTo("manage_organization", "superadmin"),
  orgController.inviteUser
);

router.delete(
  "/members/:id",
  authController.restrictTo("manage_organization", "superadmin"),
  orgController.removeMember
);

// ---------------------------------------------------
// ACTIVITY LOG (Admin view)
// ---------------------------------------------------
router.get(
  "/activity-log",
  authController.restrictTo("manage_organization", "superadmin"),
  orgController.getActivityLog
);

module.exports = router;
