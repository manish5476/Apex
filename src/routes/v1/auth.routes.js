'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../../modules/auth/core/auth.controller');
const catchAsync = require('../../core/utils/api/catchAsync');
const forgotPasswordLimiter = require('../../core/middleware/rateLimit.middleware');

// ======================================================
// 1. PUBLIC ROUTES
// ======================================================

router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Silent token refresh — uses HttpOnly cookie, no auth header needed
router.post('/refresh-token', authController.refreshToken);

// Rate-limited to prevent brute-force / SMTP abuse
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.patch('/reset-password/:token', authController.resetPassword);

// Token & email verification
router.get('/verify-token', authController.verifyToken);
router.get('/verify-email/:token', authController.verifyEmail);

// ======================================================
// 2. PROTECTED ROUTES (require valid access token)
// ======================================================
router.use(authController.protect);

router.patch('/update-my-password', authController.updateMyPassword);
router.post('/send-verification-email', authController.sendVerificationEmail);

router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);

// ======================================================
// 3. SESSION MANAGEMENT
// Note: /me/devices and /me/devices/:sessionId live in user.routes.js
// These duplicated inline handlers below have been removed — they were
// doing the same thing as userController.getMyDevices / revokeDevice
// but without proper error handling and without the AppError pattern.
// ======================================================

// GET  /sessions  →  moved to GET /users/me/devices
// DEL  /sessions/:sessionId  →  moved to DELETE /users/me/devices/:sessionId

module.exports = router;
