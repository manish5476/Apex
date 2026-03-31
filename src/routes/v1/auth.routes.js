'use strict';

const express = require('express');
const router  = express.Router();

const authController        = require('../../modules/auth/core/auth.controller');
const catchAsync            = require('../../core/utils/api/catchAsync');
const forgotPasswordLimiter = require('../../core/middleware/rateLimit.middleware');

// ======================================================
// 1. PUBLIC ROUTES
// ======================================================

router.post('/signup',       authController.signup);
router.post('/login',        authController.login);

// Silent token refresh — uses HttpOnly cookie, no auth header needed
router.post('/refresh-token', authController.refreshToken);

// Rate-limited to prevent brute-force / SMTP abuse
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.patch('/reset-password/:token', authController.resetPassword);

// Token & email verification
router.get('/verify-token',        authController.verifyToken);
router.get('/verify-email/:token', authController.verifyEmail);

// ======================================================
// 2. PROTECTED ROUTES (require valid access token)
// ======================================================
router.use(authController.protect);

router.patch('/update-my-password', authController.updateMyPassword);
router.post('/send-verification-email', authController.sendVerificationEmail);

router.post('/logout',     authController.logout);
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






// const express = require('express');
// const authController = require('../../modules/auth/core/auth.controller');
// const router = express.Router();
// const catchAsync = require('../../core/utils/api/catchAsync');
// const forgotPasswordLimiter = require("../../core/middleware/rateLimit.middleware");

// // ======================================================
// // 1. PUBLIC ROUTES (Identity & Access)
// // ======================================================

// router.post('/signup', authController.signup);
// router.post('/login', authController.login);
// router.post('/refresh-token', authController.refreshToken);

// // Rate-limited to prevent brute-force/SMTP abuse
// router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);
// router.patch('/resetPassword/:token', authController.resetPassword);

// // Verification & Status
// router.get('/verify-token', authController.verifyToken);
// router.get('/verify-email/:token', authController.verifyEmail);

// // ======================================================
// // 2. PROTECTED ROUTES (Requires Login)
// // ======================================================
// router.use(authController.protect);

// router.patch('/updateMyPassword', authController.updateMyPassword);
// router.post('/send-verification-email', authController.sendVerificationEmail);

// // Logout logic
// router.post('/logout', authController.logout);
// router.post('/logout-all', authController.logoutAll);

// // ======================================================
// // 3. SESSION MANAGEMENT (Device & Security)
// // ======================================================

// /**
//  * Get all active devices/sessions
//  * In production, it's cleaner to move the logic below into authController.getSessions
//  */
// router.get('/sessions', catchAsync(async (req, res, next) => {
//   const Session = require('../../modules/auth/core/session.model');
//   const sessions = await Session.find({ 
//     userId: req.user.id, 
//     isValid: true 
//   }).select('-token -refreshToken').sort('-lastActivityAt');
  
//   res.status(200).json({
//     status: 'success',
//     results: sessions.length,
//     data: { sessions }
//   });
// }));

// /**
//  * Terminate a specific session (Remote Logout)
//  */
// router.delete('/sessions/:sessionId', catchAsync(async (req, res, next) => {
//   const Session = require('../../modules/auth/core/session.model');
//   const session = await Session.findOneAndUpdate(
//     { 
//       _id: req.params.sessionId, 
//       userId: req.user.id,
//       isValid: true 
//     },
//     { isValid: false, terminatedAt: new Date() },
//     { new: true }
//   );
  
//   if (!session) {
//     return res.status(404).json({ status: 'fail', message: 'Session not found' });
//   }

//   res.status(200).json({
//     status: 'success',
//     message: 'Session terminated successfully'
//   });
// }));

// module.exports = router;