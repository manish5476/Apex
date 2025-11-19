const express = require("express");
const router = express.Router();

const authController = require("../../controllers/authController");
const masterTypeController = require("../../controllers/masterTypeController");

// All routes require login
router.use(authController.protect);

// GET all — everyone can read
router.get("/", masterTypeController.getMasterTypes);

// Admin-only routes
router.post(
  "/",
  authController.restrictTo("admin"),
  masterTypeController.createMasterType
);

router.patch(
  "/:id",
  authController.restrictTo("admin"),
  masterTypeController.updateMasterType
);

router.delete(
  "/:id",
  authController.restrictTo("admin"),
  masterTypeController.deleteMasterType
);

module.exports = router;
