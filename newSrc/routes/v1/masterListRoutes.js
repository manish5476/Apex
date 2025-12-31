const express = require('express');
const router = express.Router();
const masterListController = require('../../controllers/masterListController'); 
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

router.get('/', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getMasterList);
router.get('/list', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getSpecificList);
router.get('/export', checkPermission(PERMISSIONS.MASTER.MANAGE), masterListController.exportMasterList);
router.get('/permissions', masterListController.getPermissionsMetadata);
module.exports = router;
