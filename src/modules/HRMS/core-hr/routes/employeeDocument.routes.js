'use strict';

const express = require('express');
const router = express.Router();

const employeeDocumentController = require('../controllers/employeeDocument.controller');
const authController = require('../../../auth/core/auth.controller');
const { checkPermission } = require('../../../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../../../config/permissions');

router.use(authController.protect);

router.route('/')
  .get(checkPermission(PERMISSIONS.DOCUMENT.READ), employeeDocumentController.getAllDocuments)
  .post(checkPermission(PERMISSIONS.DOCUMENT.MANAGE), employeeDocumentController.uploadDocument);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.DOCUMENT.READ), employeeDocumentController.getDocument)
  .delete(checkPermission(PERMISSIONS.DOCUMENT.MANAGE), employeeDocumentController.deleteDocument);

router.patch('/:id/verify', checkPermission(PERMISSIONS.DOCUMENT.MANAGE), employeeDocumentController.verifyDocument);

module.exports = router;
