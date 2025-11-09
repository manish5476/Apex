const express = require('express');
const roleController = require('../../controllers/roleControllers');
const authController = require('../../controllers/authController');

const router = express.Router();

router.use(authController.protect);
router.get('/', authController.restrictTo('create_roles', 'read_roles', 'superadmin'), roleController.getRoles);
router.post('/', authController.restrictTo('create_roles', 'superadmin'), roleController.createRole);
router.patch('/:id', authController.restrictTo('update_roles', 'superadmin'), roleController.updateRole);
router.delete('/:id', authController.restrictTo('delete_roles', 'superadmin'), roleController.deleteRole);

module.exports = router;
