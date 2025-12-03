const express = require("express");
const router = express.Router();
const sessionController = require("../../controllers/sessionController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Current user
router.get("/me", sessionController.mySessions);

// Admin View All
router.get("/", checkPermission(PERMISSIONS.SESSION.VIEW_ALL), sessionController.listSessions);

// Admin Manage
router.delete("/:id", checkPermission(PERMISSIONS.USER.MANAGE), sessionController.deleteSession);
router.patch("/:id/revoke", checkPermission(PERMISSIONS.USER.MANAGE), sessionController.revokeSession);
router.patch("/revoke-all", checkPermission(PERMISSIONS.USER.MANAGE), sessionController.revokeAllOthers);

module.exports = router;


// const express = require("express");
// const sessionController = require("../../controllers/sessionController");
// const authController = require("../../controllers/authController");
// const router = express.Router();
// router.use(authController.protect);

// // current user sessions
// router.get("/me", sessionController.mySessions);
// router.get("/", authController.restrictTo("read_users", "platform-admin", "superadmin"), sessionController.listSessions);
// router.delete("/:id", sessionController.deleteSession);
// router.patch("/:id/revoke", sessionController.revokeSession);
// router.patch("/revoke-all", sessionController.revokeAllOthers);
// module.exports = router;
