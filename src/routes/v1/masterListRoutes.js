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

// const express = require('express');
// // Ensure this path matches your actual file structure (e.g. ../controllers/...)
// const masterListController = require('../../controllers/masterListController'); 
// const authController = require('../../controllers/authController');

// const router = express.Router();
// router.use(authController.protect);
// router.get('/', masterListController.getMasterList);
// router.get('/list', masterListController.getSpecificList);
// router.get('/export', authController.restrictTo('superadmin','admin'), masterListController.exportMasterList);

// module.exports = router;