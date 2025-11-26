const express = require("express");
const sessionController = require("../../controllers/sessionController");
const authController = require("../../controllers/authController");

const router = express.Router();

router.use(authController.protect);

// current user sessions
router.get("/me", sessionController.mySessions);

// admin / org view (optional filter ?userId=)
router.get("/", authController.restrictTo("read_users", "platform-admin", "superadmin"), sessionController.listSessions);

// revoke one session (owner or admin)
router.patch("/:id/revoke", sessionController.revokeSession);

// revoke others
router.patch("/revoke-all", sessionController.revokeAllOthers);

module.exports = router;
