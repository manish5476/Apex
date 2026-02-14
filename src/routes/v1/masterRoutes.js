// routes/master.route.js  (or wherever your router is)

const express = require("express");
const router = express.Router();
const masterController = require("../../modules/master/core/master.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// ────────────────────────────────────────────────
// Existing routes
// ────────────────────────────────────────────────
router.post('/bulk', checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkCreateMasters);

router.route("/")
  .get(checkPermission(PERMISSIONS.MASTER.READ), masterController.getMasters)
  .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.createMaster);

router.route("/:id")
  .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.updateMaster)
  .delete(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.deleteMaster);

// ────────────────────────────────────────────────
// NEW: Bulk operations
// ────────────────────────────────────────────────
router.route("/bulk-delete")
  .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkDeleteMasters);

router.route("/bulk-update")
  .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkUpdateMasters);

module.exports = router;

// const express = require("express");
// const router = express.Router();
// const masterController = require("../../modules/master/core/master.controller");
// const authController = require("../../modules/auth/core/auth.controller");
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);
// router.post('/bulk', checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkCreateMasters);
// router.route("/")
//   .get(checkPermission(PERMISSIONS.MASTER.READ), masterController.getMasters)
//   .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.createMaster);
// router.route("/:id")
//   .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.updateMaster)
//   .delete(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.deleteMaster);

// module.exports = router;
