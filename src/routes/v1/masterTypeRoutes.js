const express = require("express");
const router = express.Router();
const authController = require("../../controllers/authController");
const masterTypeController = require("../../controllers/masterTypeController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Read All
router.get("/", checkPermission(PERMISSIONS.MASTER.READ), masterTypeController.getMasterTypes);

// Manage
router.post("/", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.createMasterType);
router.patch("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.updateMasterType);
router.delete("/:id", checkPermission(PERMISSIONS.MASTER.MANAGE), masterTypeController.deleteMasterType);

module.exports = router;

// const express = require("express");
// const router = express.Router();

// const authController = require("../../controllers/authController");
// const masterTypeController = require("../../controllers/masterTypeController");

// // All routes require login
// router.use(authController.protect);

// // GET all — everyone can read
// router.get("/", masterTypeController.getMasterTypes);

// // Admin-only routes
// router.post(
//   "/",
//   authController.restrictTo("admin"),
//   masterTypeController.createMasterType
// );

// router.patch(
//   "/:id",
//   authController.restrictTo("admin"),
//   masterTypeController.updateMasterType
// );

// router.delete(
//   "/:id",
//   authController.restrictTo("admin"),
//   masterTypeController.deleteMasterType
// );

// module.exports = router;
