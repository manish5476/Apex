// Standard Auth - No permission changes needed
const express = require('express');
const authController = require('../../controllers/authController');
const router = express.Router();
const forgotPasswordLimiter = require("../../middleware/forgotPasswordLimiter");

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/auth/refresh-token', authController.refreshToken);
router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);
router.get('/verify-token', authController.verifyToken);

// Protected routes
router.use(authController.protect);
router.patch('/updateMyPassword', authController.updateMyPassword);
router.post('/logout', authController.logout);

module.exports = router;

// const express = require('express');
// const authController = require('../../controllers/authController');
// const { protect } = require('../../controllers/authController'); // or your middleware path
// const router = express.Router();
// const forgotPasswordLimiter = require("../../middleware/forgotPasswordLimiter");

// router.post('/signup', authController.signup);
// router.post('/login', authController.login);
// router.post('/auth/refresh-token', authController.refreshToken);
// // router.post('/forgotPassword', authController.forgotPassword);
// router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);

// router.patch('/resetPassword/:token', authController.resetPassword);
// router.patch('/updateMyPassword', protect, authController.updateMyPassword);
// router.get('/verify-token', authController.verifyToken);
// router.post('/logout', authController.protect, authController.logout);

// module.exports = router;
