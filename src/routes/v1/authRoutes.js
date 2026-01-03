// Standard Auth - No permission changes needed
const express = require('express');
const authController = require('../../modules/auth/core/auth.controller');
const router = express.Router();
const forgotPasswordLimiter = require("../../core/middleware/rateLimit.middleware");

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);
router.get('/verify-token', authController.verifyToken);

// Protected routes
router.use(authController.protect);
router.patch('/updateMyPassword', authController.updateMyPassword);
router.post('/logout', authController.logout);

module.exports = router;
