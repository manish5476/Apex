'use strict';

const express = require('express');
const router = express.Router();

const companyAssetController = require('../controllers/companyAsset.controller');
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require('../../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../../config/permissions');

router.use(authController.protect);

router.route('/')
  .get(checkPermission(PERMISSIONS.ASSET.HRMS_READ), companyAssetController.getAllAssets)
  .post(checkPermission(PERMISSIONS.ASSET.HRMS_MANAGE), companyAssetController.createAsset);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.ASSET.HRMS_READ), companyAssetController.getAsset)
  .patch(checkPermission(PERMISSIONS.ASSET.HRMS_MANAGE), companyAssetController.updateAsset);

router.post('/:id/assign', checkPermission(PERMISSIONS.ASSET.HRMS_MANAGE), companyAssetController.assignAsset);
router.post('/:id/return', checkPermission(PERMISSIONS.ASSET.HRMS_MANAGE), companyAssetController.returnAsset);

module.exports = router;
