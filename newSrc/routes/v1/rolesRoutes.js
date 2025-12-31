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
