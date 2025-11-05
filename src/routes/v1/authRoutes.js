const express = require('express');
const authController = require('../../controllers/authController');

const router = express.Router();

// Public routes for signing up (as employee) and logging in
router.post('/signup', authController.signup);
router.post('/login', authController.login);

// TODO: Add password reset routes here
// router.post('/forgotPassword', authController.forgotPassword);
// router.patch('/resetPassword/:token', authController.resetPassword);

module.exports = router;