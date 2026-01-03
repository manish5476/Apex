// src/routes/v1/salesReturnRoutes.js
const express = require('express');
const router = express.Router();
const salesReturnController = require('../../modules/inventory/core/salesReturn.controller');
const authController = require('../../modules/auth/core/auth.controller');
router.use(authController.protect);
router.post('/', salesReturnController.createReturn);
router.get('/', salesReturnController.getReturns);

module.exports = router;
