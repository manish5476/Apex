// routes/v1/auth.routes.js
const express = require('express');
const authController = require('../../modules/auth/core/auth.controller');
const router = express.Router();
const forgotPasswordLimiter = require("../../core/middleware/rateLimit.middleware");

// ======================================================
// PUBLIC ROUTES (No Authentication Required)
// ======================================================

/**
 * @route   POST /api/v1/auth/signup
 * @desc    Register new user
 * @access  Public
 */
router.post('/signup', authController.signup);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user (email or phone)
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Get new access token using refresh token
 * @access  Public (with refresh token cookie)
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @route   POST /api/v1/auth/forgotPassword
 * @desc    Send password reset email
 * @access  Public
 * @limits  5 requests per hour per IP
 */
router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);

/**
 * @route   PATCH /api/v1/auth/resetPassword/:token
 * @desc    Reset password with token
 * @access  Public
 */
router.patch('/resetPassword/:token', authController.resetPassword);

/**
 * @route   GET /api/v1/auth/verify-token
 * @desc    Verify if token is valid
 * @access  Public (but requires token)
 */
router.get('/verify-token', authController.verifyToken);

/**
 * @route   GET /api/v1/auth/verify-email/:token
 * @desc    Verify email address with token
 * @access  Public
 */
router.get('/verify-email/:token', authController.verifyEmail);

// ======================================================
// PROTECTED ROUTES (Authentication Required)
// ======================================================

// Apply protect middleware to all routes below
router.use(authController.protect);

/**
 * @route   PATCH /api/v1/auth/updateMyPassword
 * @desc    Update password (when logged in)
 * @access  Private
 */
router.patch('/updateMyPassword', authController.updateMyPassword);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current user
 * @access  Private
 */
router.post('/logout', authController.logout);

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all', authController.logoutAll);

/**
 * @route   POST /api/v1/auth/send-verification-email
 * @desc    Send email verification link
 * @access  Private
 */
router.post('/send-verification-email', authController.sendVerificationEmail);

// ======================================================
// OPTIONAL: Session Management Routes
// ======================================================

/**
 * @route   GET /api/v1/auth/sessions
 * @desc    Get all active sessions for current user
 * @access  Private
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
 * @route   DELETE /api/v1/auth/sessions/:sessionId
 * @desc    Terminate specific session
 * @access  Private
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
    return next(new AppError('Session not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Session terminated successfully'
  });
});

module.exports = router;

// // Standard Auth - No permission changes needed
// const express = require('express');
// const authController = require('../../modules/auth/core/auth.controller');
// const router = express.Router();
// const forgotPasswordLimiter = require("../../core/middleware/rateLimit.middleware");
// router.post('/signup', authController.signup);
// router.post('/login', authController.login);
// router.post('/refresh-token', authController.refreshToken);
// router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);
// router.patch('/resetPassword/:token', authController.resetPassword);
// router.get('/verify-token', authController.verifyToken);

// // Protected routes
// router.use(authController.protect);
// router.patch('/updateMyPassword', authController.updateMyPassword);
// router.post('/logout', authController.logout);

// module.exports = router;
