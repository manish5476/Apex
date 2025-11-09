const express = require('express');
const masterListController = require('../../controllers/masterListController');
const authController = require('../../controllers/authController');

const router = express.Router();

router.use(authController.protect);

// Only approved/active users can view master lists
router.get('/', masterListController.getMasterList);

module.exports = router;
