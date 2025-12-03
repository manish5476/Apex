const express = require('express');
const router = express.Router();
const roleController = require('../../controllers/roleControllers');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Metadata for Frontend UI (Checkbox generation)
router.get('/permissions-metadata', (req, res) => {
    const { PERMISSIONS_LIST } = require("../../config/permissions");
    res.json({ status: 'success', data: PERMISSIONS_LIST });
});

router.get('/', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRoles);
router.post('/', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.createRole);
router.patch('/:id', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.updateRole);
router.delete('/:id', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.deleteRole);

module.exports = router;



// const express = require('express');
// const router = express.Router();
// const roleController = require('../../controllers/roleControllers'); // Typo fix: controller
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // Endpoint to get the list of ALL permissions (for Frontend UI)
// router.get('/permissions-metadata', (req, res) => {
//     const { PERMISSIONS_LIST } = require("../../config/permissions");
//     res.json({ status: 'success', data: PERMISSIONS_LIST });
// });

// router.get('/', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.getRoles);
// router.post('/', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.createRole);
// router.patch('/:id', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.updateRole);
// router.delete('/:id', checkPermission(PERMISSIONS.ROLE.MANAGE), roleController.deleteRole);

// module.exports = router;

// // const express = require('express');
// // const roleController = require('../../controllers/roleControllers');
// // const authController = require('../../controllers/authController');

// // const router = express.Router();

// // router.use(authController.protect);
// // router.get('/', authController.restrictTo('create_roles', 'read_roles', 'superadmin'), roleController.getRoles);
// // router.post('/', authController.restrictTo('create_roles', 'superadmin'), roleController.createRole);
// // router.patch('/:id', authController.restrictTo('update_roles', 'superadmin'), roleController.updateRole);
// // router.delete('/:id', authController.restrictTo('delete_roles', 'superadmin'), roleController.deleteRole);

// // module.exports = router;
