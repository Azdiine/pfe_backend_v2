const axios = require('axios');

const FLASK_SERVICE_URL = process.env.FLASK_SERVICE_URL || 'http://localhost:5001';
const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v0/product';

/**
 * Get product info from barcode via Open Food Facts API
 * Returns: { name, ingredients, calories, ... }
 */
async function getProductByBarcode(barcode) {
  try {
    const response = await axios.get(`${OPEN_FOOD_FACTS_API}/${barcode}.json`);
    
    if (response.data.status === 0 || !response.data.product) {
      return {
        found: false,
        message: 'Product not found'
      };
    }

    const product = response.data.product;
    
    // Extract ingredients from product
    const ingredientsList = [];
    if (product.ingredients && Array.isArray(product.ingredients)) {
      ingredientsList.push(...product.ingredients.map(ing => ing.text || ing).filter(Boolean));
    } else if (product.ingredients_text) {
      // Split comma-separated ingredients
      ingredientsList.push(...product.ingredients_text.split(',').map(i => i.trim()).filter(Boolean));
    }

    return {
      found: true,
      barcode,
      name: product.product_name || 'Unknown',
      brand: product.brands || '',
      ingredients: ingredientsList,
      calories: product.nutriments?.energy_kcal || product.nutriments?.['energy-kcal'] || 0,
      proteins: product.nutriments?.proteins || 0,
      carbs: product.nutriments?.carbohydrates || 0,
      fats: product.nutriments?.fat || 0,
      imageUrl: product.image_front_url || product.image_url || null,
    };
  } catch (error) {
    console.error(`Error fetching barcode ${barcode}:`, error.message);
    return {
      found: false,
      error: error.message
    };
  }
}

/**
 * Call Flask recommendation service
 * Input: { ingredients: [], top_k: 5 }
 * Returns: recommendations array with nutrition & images
 */
async function getRecommendations(ingredients, topK = 5) {
  try {
    const response = await axios.post(`${FLASK_SERVICE_URL}/recommend`, {
      ingredients,
      top_k: topK
    }, {
      timeout: 30000
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Recommendation failed');
    }

    return response.data.recommendations;
  } catch (error) {
    console.error('Error calling Flask service:', error.message);
    throw new Error(`Recommendation service error: ${error.message}`);
  }
}

/**
 * Get recommendations by ingredients (direct)
 */
async function recommendByIngredients(ingredients, topK = 5) {
  if (!ingredients || ingredients.length === 0) {
    throw new Error('Ingredients list is required');
  }

  const recommendations = await getRecommendations(ingredients, topK);
  return recommendations;
}

/**
 * Get recommendations by barcode
 */
async function recommendByBarcode(barcode, topK = 5) {
  if (!barcode) {
    throw new Error('Barcode is required');
  }

  // 1. Get product from Open Food Facts
  const product = await getProductByBarcode(barcode);
  
  if (!product.found) {
    throw new Error(`Product not found for barcode: ${barcode}`);
  }

  // 2. Use product ingredients to get recommendations
  let ingredients = product.ingredients;
  if (ingredients.length === 0) {
    ingredients = [product.name.toLowerCase()];
  }

  const recommendations = await getRecommendations(ingredients, topK);

  // Add product info to response
  return {
    scannedProduct: {
      barcode,
      name: product.name,
      brand: product.brand,
      imageUrl: product.imageUrl,
      ingredients: product.ingredients,
      nutrition: {
        calories: product.calories,
        proteins_g: product.proteins,
        carbs_g: product.carbs,
        fats_g: product.fats
      }
    },
    recommendations
  };
}

module.exports = {
  getProductByBarcode,
  getRecommendations,
  recommendByIngredients,
  recommendByBarcode
};
