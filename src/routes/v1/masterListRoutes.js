const express = require('express');
const router = express.Router();
const masterListController = require('../../modules/master/core/masterList.controller'); 
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Main master list with filters
router.get('/', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getMasterList);

// Get specific entity list with advanced filters
router.get('/list', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getSpecificList);

// Get filter options for a specific entity type
router.get('/filter-options', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getFilterOptions);

// Get quick stats dashboard
router.get('/quick-stats', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getQuickStats);

// Get entity details by type and ID
router.get('/details/:type/:id', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getEntityDetails);

// Export master list
router.get('/export', checkPermission(PERMISSIONS.MASTER.MANAGE), masterListController.exportMasterList);

// Export filtered data
router.get('/export-filtered', checkPermission(PERMISSIONS.MASTER.MANAGE), masterListController.exportFilteredData);

// Get permissions metadata
router.get('/permissions', masterListController.getPermissionsMetadata);

module.exports = router;






// Route Summary:
// Method	Endpoint	Description	Permission Required
// GET	/	Get full master list with filters	MASTER.READ
// GET	/list	Get specific entity list with advanced filters	MASTER.READ
// GET	/filter-options?type=customer	Get available filter options for an entity type	MASTER.READ
// GET	/quick-stats?period=month	Get quick dashboard statistics	MASTER.READ
// GET	/details/customer/:id	Get detailed entity info with related data	MASTER.READ
// GET	/export	Export master list	MASTER.MANAGE
// GET	/export-filtered?type=invoice&format=csv	Export filtered data in various formats	MASTER.MANAGE
// GET	/permissions	Get permissions metadata	None (Public within 




// const express = require('express');
// const router = express.Router();
// const masterListController = require('../../modules/master/core/masterList.controller'); 
// const authController = require('../../modules/auth/core/auth.controller');
// const { checkPermission } = require("../../core/middleware/permission.middleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.get('/', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getMasterList);
// router.get('/list', checkPermission(PERMISSIONS.MASTER.READ), masterListController.getSpecificList);
// router.get('/export', checkPermission(PERMISSIONS.MASTER.MANAGE), masterListController.exportMasterList);
// router.get('/permissions', masterListController.getPermissionsMetadata);
// module.exports = router;
