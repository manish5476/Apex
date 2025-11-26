const express = require('express');
const authController = require('../../controllers/authController');
const { protect } = require('../../controllers/authController'); // or your middleware path
const router = express.Router();
const forgotPasswordLimiter = require("../../middleware/forgotPasswordLimiter");

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/auth/refresh-token', authController.refreshToken);
// router.post('/forgotPassword', authController.forgotPassword);
router.post("/forgotPassword", forgotPasswordLimiter, authController.forgotPassword);

router.patch('/resetPassword/:token', authController.resetPassword);
router.patch('/updateMyPassword', protect, authController.updateMyPassword);
router.get('/verify-token', authController.verifyToken);

module.exports = router;
