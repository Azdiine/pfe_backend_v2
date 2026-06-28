const { body } = require('express-validator');

const onboardingValidation = [
  body('gender').optional().isString(),
  body('birthDate').optional().isISO8601(),
  body('heightCm').optional().isFloat({ min: 50, max: 300 }),
  body('weightKg').optional().isFloat({ min: 20, max: 500 }),
  body('targetWeightKg').optional().isFloat({ min: 20, max: 500 }),
  body('goal').optional().isString(),
  body('activityLevel').optional().isString(),
  body('dietType').optional().isString(),
  body('allergies').optional().isArray(),
  body('allergies.*').optional().isString(),
  body('healthConditions').optional().isArray(),
  body('healthConditions.*').optional().isString(),
  body('cuisinePrefs').optional().isArray(),
  body('cuisinePrefs.*').optional().isString(),
];

const updateProfileValidation = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('gender').optional().isString(),
  body('birthDate').optional().isISO8601(),
  body('heightCm').optional().isFloat({ min: 50, max: 300 }),
  body('weightKg').optional().isFloat({ min: 20, max: 500 }),
  body('targetWeightKg').optional().isFloat({ min: 20, max: 500 }),
  body('goal').optional().isString(),
  body('activityLevel').optional().isString(),
  body('dietType').optional().isString(),
  body('allergies').optional().isArray(),
  body('healthConditions').optional().isArray(),
  body('cuisinePrefs').optional().isArray(),
];

module.exports = { onboardingValidation, updateProfileValidation };
