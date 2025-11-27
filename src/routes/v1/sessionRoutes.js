const express = require("express");
const sessionController = require("../../controllers/sessionController");
const authController = require("../../controllers/authController");
const router = express.Router();
router.use(authController.protect);

// current user sessions
router.get("/me", sessionController.mySessions);
router.get("/", authController.restrictTo("read_users", "platform-admin", "superadmin"), sessionController.listSessions);
router.delete("/:id", sessionController.deleteSession);
router.patch("/:id/revoke", sessionController.revokeSession);
router.patch("/revoke-all", sessionController.revokeAllOthers);
module.exports = router;
