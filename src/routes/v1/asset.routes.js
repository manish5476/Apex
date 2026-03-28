const express = require('express');
const router = express.Router();
// Adjust the path to where you saved your asset.controller
const assetController = require('../../modules/uploads/assetController');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);
router.get('/stats', checkPermission(PERMISSIONS.ASSET.READ), assetController.getStorageStats);
router.route('/').get(checkPermission(PERMISSIONS.ASSET.READ), assetController.getAllAssets);
router.route('/:id').delete(checkPermission(PERMISSIONS.ASSET.DELETE), assetController.deleteAsset);

module.exports = router;