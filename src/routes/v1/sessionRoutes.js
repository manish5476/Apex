const express = require("express");
const router = express.Router();
const sessionController = require("../../modules/auth/core/session.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes
router.use(authController.protect);

// ======================================================
// 1. SELF MANAGEMENT (Accessible to ALL logged-in users)
// ======================================================
router.get("/me", sessionController.mySessions);

// ======================================================
// 2. ADMIN SESSION MANAGEMENT (Requires RBAC)
// ======================================================
router.get("/", checkPermission(PERMISSIONS.SESSION.VIEW_ALL), sessionController.listSessions);

// BULK DELETE (Must be BEFORE /:id)
router.delete(
  "/bulk-delete", 
  checkPermission(PERMISSIONS.USER.MANAGE), 
  sessionController.bulkDeleteSessions
);

router.delete("/:id", checkPermission(PERMISSIONS.USER.MANAGE), sessionController.deleteSession);
router.patch("/:id/revoke", checkPermission(PERMISSIONS.USER.MANAGE), sessionController.revokeSession);
router.patch("/revoke-all", checkPermission(PERMISSIONS.USER.MANAGE), sessionController.revokeAllOthers);

module.exports = router;
