const express = require('express');
const router = express.Router();
const profileController = require('./profile.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const { onboardingValidation, updateProfileValidation } = require('./profile.validation');
const validate = require('../../middlewares/validate.middleware');

// PUT /api/profile/onboarding — save onboarding answers
router.put('/onboarding', authMiddleware, onboardingValidation, validate, profileController.saveOnboarding);

// GET /api/profile — get full profile
router.get('/', authMiddleware, profileController.getProfile);

// PUT /api/profile — update profile
router.put('/', authMiddleware, updateProfileValidation, validate, profileController.updateProfile);

module.exports = router;
