'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../../modules/auth/core/auth.controller');
const catchAsync = require('../../core/utils/api/catchAsync');
const forgotPasswordLimiter = require('../../core/middleware/rateLimit.middleware');

// ======================================================
// 1. PUBLIC ROUTES
// ======================================================

/**
 * POST /signup
 * @payload { name*, email*, password*, passwordConfirm*, phone*, uniqueShopId* }
 */
router.post('/signup', authController.signup);

/**
 * POST /login
 * @payload { email*, password*, uniqueShopId* }
 */
router.post('/login', authController.login);

/**
 * POST /refresh-token
 * Silent token refresh — uses HttpOnly cookie, no auth header needed
 * @payload {} (Reads cookie 'refreshToken')
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * POST /forgot-password
 * Rate-limited to prevent brute-force / SMTP abuse
 * @payload { email* }
 */
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);

/**
 * PATCH /reset-password/:token
 * @params { token* }
 * @payload { password*, passwordConfirm* }
 */
router.patch('/reset-password/:token', authController.resetPassword);

// Token & email verification
/** 
 * GET /verify-token 
 * @payload none
 */
router.get('/verify-token', authController.verifyToken);

/** 
 * GET /verify-email/:token 
 * @params { token* }
 * @payload none
 */
router.get('/verify-email/:token', authController.verifyEmail);

// ======================================================
// 2. PROTECTED ROUTES (require valid access token)
// ======================================================
router.use(authController.protect);

/**
 * PATCH /update-my-password
 * @payload { passwordCurrent*, password*, passwordConfirm* }
 */
router.patch('/update-my-password', authController.updateMyPassword);

/**
 * POST /send-verification-email
 * @payload none (Uses req.user)
 */
router.post('/send-verification-email', authController.sendVerificationEmail);

/**
 * POST /logout
 * @payload none
 */
router.post('/logout', authController.logout);

/**
 * POST /logout-all
 * @payload none
 */
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
