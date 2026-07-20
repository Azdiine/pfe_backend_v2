const recommendService = require('./recommend.service');
const { success, error } = require('../../utils/response');

/**
 * POST /api/recommend
 * Body: { ingredients: [] }
 */
async function recommendByIngredients(req, res) {
  try {
    const { ingredients, top_k } = req.body;
    const topK = top_k || 5;

    const recommendations = await recommendService.recommendByIngredients(ingredients, topK);

    return success(res, {
      ingredients,
      recommendations
    }, 'Recommendations retrieved successfully');
  } catch (err) {
    console.error('Error in recommendByIngredients:', err);
    return error(res, err.message || 'Failed to get recommendations', 500);
  }
}

/**
 * POST /api/recommend/barcode
 * Body: { barcode: "123456789" }
 */
async function recommendByBarcode(req, res) {
  try {
    const { barcode, top_k } = req.body;
    const topK = top_k || 5;

    const result = await recommendService.recommendByBarcode(barcode, topK);

    return success(res, result, 'Barcode recommendations retrieved successfully');
  } catch (err) {
    console.error('Error in recommendByBarcode:', err);
    return error(res, err.message || 'Failed to process barcode', 500);
  }
}

/**
 * GET /api/recommend/daily?count=6
 * Recipes of the day (deterministic per date)
 */
async function dailyRecipes(req, res) {
  try {
    const count = parseInt(req.query.count) || 6;
    const seed = req.query.seed || null;
    const result = await recommendService.getDailyRecipes(count, seed);

    return success(res, {
      date: result.date,
      recipes: result.recipes
    }, 'Daily recipes retrieved successfully');
  } catch (err) {
    console.error('Error in dailyRecipes:', err);
    return error(res, err.message || 'Failed to get daily recipes', 500);
  }
}

/**
 * GET /api/recommend/health
 * Check if recommendation service is available
 */
async function healthCheck(req, res) {
  try {
    const axios = require('axios');
    const FLASK_URL = process.env.FLASK_SERVICE_URL || 'http://localhost:5001';
    
    const health = await axios.get(`${FLASK_URL}/health`, { timeout: 5000 });
    
    return success(res, {
      flask_service: health.data.status === 'ok' ? 'healthy' : 'unhealthy',
      models_loaded: health.data.models_loaded
    }, 'Health check passed');
  } catch (err) {
    console.error('Flask service health check failed:', err.message);
    return error(res, 'Recommendation service is not available', 503);
  }
}

module.exports = {
  recommendByIngredients,
  recommendByBarcode,
  dailyRecipes,
  healthCheck
};
