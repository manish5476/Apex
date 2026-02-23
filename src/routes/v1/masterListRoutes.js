const express = require('express');
const router = express.Router();
const masterListController = require('../../modules/master/core/masterList.controller'); 
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Protect all routes globally
router.use(authController.protect);

// ======================================================
// 1. DATA RETRIEVAL & FILTERS (READ)
// ======================================================

// Main master list with filters
router.get('/', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getMasterList);

// Get specific entity list with advanced filters
router.get('/list', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getSpecificList);

// Get filter options for a specific entity type
router.get('/filter-options', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getFilterOptions);

// Get quick stats dashboard
router.get('/quick-stats', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getQuickStats);

// Get entity details by type and ID (Polymorphic Lookup)
router.get('/details/:type/:id', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getEntityDetails);

// ======================================================
// 2. EXPORTS & METADATA
// ======================================================

// Exporting is usually restricted to Manage-level access
router.get('/export', checkPermission(PERMISSIONS.MASTER.MANAGE), masterListController.exportMasterList);
router.get('/export-filtered', checkPermission(PERMISSIONS.MASTER.MANAGE), masterListController.exportFilteredData);

// Metadata for UI permission mapping
router.get('/permissions', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getPermissionsMetadata);

module.exports = router;