const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const {
  registerValidation,
  loginValidation,
  verifyOtpValidation,
  resendOtpValidation,
  refreshValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
} = require('./auth.validation');
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

// POST /api/auth/logout (protected) — revokes the refresh session server-side
router.post('/logout', authMiddleware, authController.logout);

// PUT /api/auth/change-password (protected)
router.put('/change-password', authMiddleware, changePasswordValidation, validate, authController.changePassword);

// POST /api/auth/forgot-password — sends a reset OTP by email
router.post('/forgot-password', forgotPasswordValidation, validate, authController.forgotPassword);

// POST /api/auth/reset-password — resets the password with the emailed OTP
router.post('/reset-password', resetPasswordValidation, validate, authController.resetPassword);

// POST /api/auth/sessions (protected) — active sessions (body: optional refreshToken to flag the current one)
router.post('/sessions', authMiddleware, authController.listSessions);

// DELETE /api/auth/sessions/:id (protected) — revoke one session
router.delete('/sessions/:id', authMiddleware, authController.revokeSession);

module.exports = router;
