const express = require('express');
const router = express.Router();
const recommendController = require('./recommend.controller');
const { recommendValidation, barcodeValidation } = require('./recommend.validation');
const validate = require('../../middlewares/validate.middleware');
const authMiddleware = require('../../middlewares/auth.middleware');

/**
 * Health check (no auth required)
 */
router.get('/health', recommendController.healthCheck);

/**
 * GET /api/recommend/daily
 * Recipes of the day (requires auth)
 */
router.get('/daily', authMiddleware, recommendController.dailyRecipes);

/**
 * POST /api/recommend
 * Get recommendations by ingredients (requires auth)
 */
router.post(
  '/',
  authMiddleware,
  recommendValidation,
  validate,
  recommendController.recommendByIngredients
);

/**
 * POST /api/recommend/barcode
 * Get recommendations by barcode (requires auth)
 */
router.post(
  '/barcode',
  authMiddleware,
  barcodeValidation,
  validate,
  recommendController.recommendByBarcode
);

module.exports = router;
