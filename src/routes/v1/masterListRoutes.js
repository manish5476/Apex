const express = require('express');
const router = express.Router();
const masterListController = require('../../modules/master/core/masterList.controller'); 
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getMasterList);
router.get('/list', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getSpecificList);
router.get('/export', checkPermission(PERMISSIONS.MASTER.MANAGE), masterListController.exportMasterList);
router.get('/permissions', masterListController.getPermissionsMetadata);
module.exports = router;
