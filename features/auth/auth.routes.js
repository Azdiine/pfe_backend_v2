const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { registerValidation, loginValidation, verifyOtpValidation, resendOtpValidation, refreshValidation } = require('./auth.validation');
const validate = require('../../middlewares/validate.middleware');
const authMiddleware = require('../../middlewares/auth.middleware');

// POST /api/auth/register
router.post('/register', registerValidation, validate, authController.register);

// POST /api/auth/login
router.post('/login', loginValidation, validate, authController.login);

// POST /api/auth/verify-otp
router.post('/verify-otp', verifyOtpValidation, validate, authController.verifyOtp);

// POST /api/auth/resend-otp
router.post('/resend-otp', resendOtpValidation, validate, authController.resendOtp);

// POST /api/auth/google
router.post('/google', authController.googleAuth);

// GET /api/auth/me (protected)
router.get('/me', authMiddleware, authController.getMe);

// POST /api/auth/refresh
router.post('/refresh', refreshValidation, validate, authController.refresh);

module.exports = router;
