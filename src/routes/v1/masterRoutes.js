const express = require("express");
const router = express.Router();
const masterController = require("../../modules/master/core/master.controller");
const authController = require("../../modules/auth/core/auth.controller");
const { checkPermission } = require("../../core/middleware/permission.middleware");
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
