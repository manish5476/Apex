const express = require("express");
const masterController = require("../../controllers/masterController");
const authController = require("../../controllers/authController");

const router = express.Router();

router.use(authController.protect);

router
  .route("/")
  .post(authController.restrictTo("superadmin", "admin"), masterController.createMaster)
  .get(masterController.getMasters);

router
  .route("/:id")
  .patch(authController.restrictTo("superadmin", "admin"), masterController.updateMaster)
  .delete(authController.restrictTo("superadmin", "admin"), masterController.deleteMaster);
  router.post('/bulk', authController.protect, masterController.bulkCreateMasters);

module.exports = router;
