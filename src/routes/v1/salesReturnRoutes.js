// src/routes/v1/salesReturnRoutes.js
const express = require('express');
const router = express.Router();
const salesReturnController = require('../../controllers/salesReturnController');
const { protect } = require('../../middleware/authMiddleware'); // Assuming this exists

router.use(protect);

router.post('/', salesReturnController.createReturn);
router.get('/', salesReturnController.getReturns);

module.exports = router;
