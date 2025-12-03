const express = require("express");
const router = express.Router();
const masterController = require("../../controllers/masterController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.post('/bulk', checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.bulkCreateMasters);

router.route("/")
  .get(checkPermission(PERMISSIONS.MASTER.READ), masterController.getMasters)
  .post(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.createMaster);

router.route("/:id")
  .patch(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.updateMaster)
  .delete(checkPermission(PERMISSIONS.MASTER.MANAGE), masterController.deleteMaster);

module.exports = router;


// const express = require("express");
// const masterController = require("../../controllers/masterController");
// const authController = require("../../controllers/authController");

// const router = express.Router();

// router.use(authController.protect);

// router
//   .route("/")
//   .post(authController.restrictTo("superadmin", "admin"), masterController.createMaster)
//   .get(masterController.getMasters);

// router
//   .route("/:id")
//   .patch(authController.restrictTo("superadmin", "admin"), masterController.updateMaster)
//   .delete(authController.restrictTo("superadmin", "admin"), masterController.deleteMaster);
//   router.post('/bulk', authController.protect, masterController.bulkCreateMasters);

// module.exports = router;
