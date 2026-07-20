const { body, param } = require('express-validator');

const addMealValidation = [
  body('calories').isFloat({ min: 0, max: 10000 }).withMessage('calories is required (0-10000)'),
  body('proteinsG').optional().isFloat({ min: 0, max: 1000 }),
  body('carbsG').optional().isFloat({ min: 0, max: 1000 }),
  body('fatsG').optional().isFloat({ min: 0, max: 1000 }),
  body('mealType').optional().isIn(['breakfast', 'lunch', 'dinner', 'snack'])
    .withMessage('mealType must be breakfast, lunch, dinner or snack'),
  body('name').optional().isString().trim().isLength({ max: 200 }),
  body('source').optional().isString().trim().isLength({ max: 50 }),
  body('date').optional().isISO8601(),
];

const deleteMealValidation = [
  param('id').isUUID().withMessage('Invalid meal entry id'),
];

const addWaterValidation = [
  body('ml').isInt({ min: 1, max: 10000 }).withMessage('ml is required (1-10000)'),
  body('date').optional().isISO8601(),
];

const updateDayValidation = [
  body('caloriesBurned').optional().isFloat({ min: 0, max: 20000 }),
  body('activityType').optional().isString().trim().isLength({ max: 100 }),
  body('activityMinutes').optional().isInt({ min: 0, max: 1440 }),
  body('weightKg').optional().isFloat({ min: 20, max: 500 }),
  body('bodyFatPercent').optional().isFloat({ min: 1, max: 80 }),
  body('waterMl').optional().isInt({ min: 0, max: 20000 }),
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
  body('mood').optional().isString().trim().isLength({ max: 50 }),
  body('date').optional().isISO8601(),
];

module.exports = { addMealValidation, deleteMealValidation, addWaterValidation, updateDayValidation };
