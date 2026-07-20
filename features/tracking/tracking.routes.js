const express = require('express');
const router = express.Router();
const trackingController = require('./tracking.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const { addMealValidation, deleteMealValidation, addWaterValidation, updateDayValidation } = require('./tracking.validation');
const validate = require('../../middlewares/validate.middleware');

// POST /api/tracking/meal — add a meal entry (breakfast/lunch/dinner/snack)
router.post('/meal', authMiddleware, addMealValidation, validate, trackingController.addMeal);

// DELETE /api/tracking/meal/:id — remove one meal entry
router.delete('/meal/:id', authMiddleware, deleteMealValidation, validate, trackingController.deleteMeal);

// POST /api/tracking/water — add water (ml) to the daily log
router.post('/water', authMiddleware, addWaterValidation, validate, trackingController.addWater);

// PUT /api/tracking/daily — set day values (weight, activity, mood...)
router.put('/daily', authMiddleware, updateDayValidation, validate, trackingController.updateDay);

// GET /api/tracking/daily — one day's log (?date=YYYY-MM-DD, default today)
router.get('/daily', authMiddleware, trackingController.getDay);

// GET /api/tracking/range — last N days (?days=7)
router.get('/range', authMiddleware, trackingController.getRange);

module.exports = router;
