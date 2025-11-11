// src/routes/statementsRoutes.js
const express = require('express');
const router = express.Router();
const statementsController = require('../../controllers/statementsController');
const authController = require('../../controllers/authController');

router.use(authController.protect);
// optionally restrict to finance roles
// router.use(authController.restrictTo('admin','finance'));

router.get('/pl', statementsController.pl);
router.get('/balance-sheet', statementsController.balanceSheet);
router.get('/trial-balance', statementsController.trialBalance);

module.exports = router;
