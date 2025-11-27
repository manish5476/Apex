const express = require('express');
// Ensure this path matches your actual file structure (e.g. ../controllers/...)
const masterListController = require('../../controllers/masterListController'); 
const authController = require('../../controllers/authController');

const router = express.Router();
router.use(authController.protect);
router.get('/', masterListController.getMasterList);
router.get('/list', masterListController.getSpecificList);
router.get('/export', authController.restrictTo('superadmin','admin'), masterListController.exportMasterList);

module.exports = router;