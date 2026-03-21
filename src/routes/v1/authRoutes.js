const express = require('express');
const authController = require('../../modules/auth/core/auth.controller');
const router = express.Router();
const forgotPasswordLimiter = require("../../core/middleware/rateLimit.middleware");

// ======================================================
// 1. PUBLIC ROUTES (Identity & Access)
// ======================================================

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

// Rate-limited to prevent brute-force/SMTP abuse
router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

// Verification & Status
router.get('/verify-token', authController.verifyToken);
router.get('/verify-email/:token', authController.verifyEmail);

// ======================================================
// 2. PROTECTED ROUTES (Requires Login)
// ======================================================
router.use(authController.protect);

router.patch('/updateMyPassword', authController.updateMyPassword);
router.post('/send-verification-email', authController.sendVerificationEmail);

// Logout logic
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);

// ======================================================
// 3. SESSION MANAGEMENT (Device & Security)
// ======================================================

/**
 * Get all active devices/sessions
 * In production, it's cleaner to move the logic below into authController.getSessions
 */
router.get('/sessions', async (req, res, next) => {
  const Session = require('../../modules/auth/core/session.model');
  const sessions = await Session.find({ 
    userId: req.user.id, 
    isValid: true 
  }).select('-token -refreshToken').sort('-lastActivityAt');
  
  res.status(200).json({
    status: 'success',
    results: sessions.length,
    data: { sessions }
  });
});

/**
 * Terminate a specific session (Remote Logout)
 */
router.delete('/sessions/:sessionId', async (req, res, next) => {
  const Session = require('../../modules/auth/core/session.model');
  const session = await Session.findOneAndUpdate(
    { 
      _id: req.params.sessionId, 
      userId: req.user.id,
      isValid: true 
    },
    { isValid: false, terminatedAt: new Date() },
    { new: true }
  );
  
  if (!session) {
    // Ensuring we handle the error gracefully if AppError isn't global
    return res.status(404).json({ status: 'fail', message: 'Session not found' });
  }

  res.status(200).json({
    status: 'success',
    message: 'Session terminated successfully'
  });
});

module.exports = router;