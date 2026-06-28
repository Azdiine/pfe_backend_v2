#!/usr/bin/env python3
"""
Flask service for hybrid recommendation system
Loads pickled models and FAISS index, exposes /recommend endpoint
"""

import os
import sys
import pickle
import json
import ast
import numpy as np
import faiss
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

# ─── Setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Global models (loaded at startup) ──────────────────────────────────────
SYSTEME = None
FAISS_INDEX = None

def load_models():
    """Load pickled models and FAISS index at startup"""
    global SYSTEME, FAISS_INDEX
    
    try:
        # Load pickle system (contains df, corpus, TF-IDF, embeddings, etc.)
        pkl_path = os.path.join(os.path.dirname(__file__), 'recommendation_data', 'sys_recommandation.pkl')
        with open(pkl_path, 'rb') as f:
            SYSTEME = pickle.load(f)
        logger.info(f"✅ Loaded sys_recommandation.pkl")
        
        # Load FAISS index
        faiss_path = os.path.join(os.path.dirname(__file__), 'recommendation_data', 'faiss_index.bin')
        FAISS_INDEX = faiss.read_index(faiss_path)
        logger.info(f"✅ Loaded faiss_index.bin")
        
        return True
    except Exception as e:
        logger.error(f"❌ Error loading models: {e}")
        return False

# ─── French → English ingredient translation ────────────────────────────────

_FR_TO_EN = {
    # Viandes
    'poulet': 'chicken', 'boeuf': 'beef', 'veau': 'veal', 'porc': 'pork',
    'agneau': 'lamb', 'dinde': 'turkey', 'canard': 'duck', 'lapin': 'rabbit',
    'saucisse': 'sausage', 'jambon': 'ham', 'lardons': 'bacon', 'bacon': 'bacon',
    'steak': 'steak', 'viande': 'meat', 'côtelette': 'chop',
    # Poissons
    'saumon': 'salmon', 'thon': 'tuna', 'cabillaud': 'cod', 'crevettes': 'shrimp',
    'moules': 'mussels', 'calamar': 'squid', 'sardines': 'sardines',
    'truite': 'trout', 'daurade': 'sea bream', 'poisson': 'fish',
    # Légumes
    'tomates': 'tomatoes', 'tomate': 'tomato', 'carottes': 'carrots',
    'carotte': 'carrot', 'pommes de terre': 'potatoes', 'pomme de terre': 'potato',
    'patate': 'potato', 'patates': 'potatoes', 'oignon': 'onion', 'oignons': 'onions',
    'ail': 'garlic', 'poivron': 'bell pepper', 'poivrons': 'bell peppers',
    'courgette': 'zucchini', 'courgettes': 'zucchini', 'aubergine': 'eggplant',
    'brocoli': 'broccoli', 'chou': 'cabbage', 'chou-fleur': 'cauliflower',
    'épinards': 'spinach', 'épinard': 'spinach', 'laitue': 'lettuce',
    'salade': 'salad', 'céleri': 'celery', 'poireau': 'leek', 'poireaux': 'leeks',
    'champignons': 'mushrooms', 'champignon': 'mushroom', 'concombre': 'cucumber',
    'petits pois': 'peas', 'haricots': 'beans', 'haricots verts': 'green beans',
    'maïs': 'corn', 'asperges': 'asparagus', 'artichaut': 'artichoke',
    'betterave': 'beet', 'radis': 'radish', 'navet': 'turnip',
    # Fruits
    'pomme': 'apple', 'pommes': 'apples', 'banane': 'banana', 'bananes': 'bananas',
    'fraises': 'strawberries', 'fraise': 'strawberry', 'citron': 'lemon',
    'citrons': 'lemons', 'orange': 'orange', 'oranges': 'oranges',
    'raisin': 'grape', 'raisins': 'grapes', 'mangue': 'mango', 'ananas': 'pineapple',
    'poire': 'pear', 'pêche': 'peach', 'abricot': 'apricot', 'cerise': 'cherry',
    'myrtilles': 'blueberries', 'framboises': 'raspberries', 'avocat': 'avocado',
    # Produits laitiers
    'lait': 'milk', 'fromage': 'cheese', 'beurre': 'butter', 'crème': 'cream',
    'yaourt': 'yogurt', 'oeufs': 'eggs', 'œufs': 'eggs', 'oeuf': 'egg', 'œuf': 'egg',
    'crème fraîche': 'sour cream', 'mozzarella': 'mozzarella', 'parmesan': 'parmesan',
    'gruyère': 'gruyere', 'emmental': 'emmental', 'camembert': 'camembert',
    # Céréales & féculents
    'farine': 'flour', 'riz': 'rice', 'pâtes': 'pasta', 'pain': 'bread',
    'semoule': 'semolina', 'avoine': 'oats', 'quinoa': 'quinoa',
    'lentilles': 'lentils', 'pois chiches': 'chickpeas', 'macaroni': 'macaroni',
    # Condiments & épices
    'sel': 'salt', 'poivre': 'pepper', 'huile': 'oil', "huile d'olive": 'olive oil',
    'vinaigre': 'vinegar', 'moutarde': 'mustard', 'mayonnaise': 'mayonnaise',
    'ketchup': 'ketchup', 'sauce tomate': 'tomato sauce', 'sauce': 'sauce',
    'miel': 'honey', 'sucre': 'sugar', 'cannelle': 'cinnamon', 'cumin': 'cumin',
    'curry': 'curry', 'paprika': 'paprika', 'thym': 'thyme', 'basilic': 'basil',
    'persil': 'parsley', 'coriandre': 'coriander', 'romarin': 'rosemary',
    'laurier': 'bay leaf', 'vanille': 'vanilla', 'levure': 'yeast',
    # Boissons
    "jus d'orange": 'orange juice', 'jus de pomme': 'apple juice',
    'jus': 'juice', 'eau': 'water', 'lait de coco': 'coconut milk',
    # Divers
    'chocolat': 'chocolate', 'noix': 'nuts', 'amandes': 'almonds',
    'noisettes': 'hazelnuts', 'noix de cajou': 'cashews', 'tofu': 'tofu',
}

def _translate_ingredients(ingredients: list) -> list:
    """Translate French ingredient names to English for TF-IDF matching."""
    translated = []
    for ing in ingredients:
        key = ing.strip().lower()
        translated.append(_FR_TO_EN.get(key, ing))
    return translated


# ─── Nutrition parser ────────────────────────────────────────────────────────
# Food.com nutrition column format:
# [calories, total_fat_%DV, sugar_%DV, sodium_%DV, protein_%DV, sat_fat_%DV, carbs_%DV]
# FDA daily reference values used for PDV% → grams conversion
_DV_FAT_G      = 78.0
_DV_PROTEIN_G  = 50.0
_DV_CARBS_G    = 275.0

def _parse_nutrition(nutrition_raw, calories_raw):
    """Return (calories, proteins_g, carbs_g, fats_g) from the nutrition column."""
    try:
        if isinstance(nutrition_raw, str):
            nutr = ast.literal_eval(nutrition_raw)
        elif isinstance(nutrition_raw, list):
            nutr = nutrition_raw
        else:
            nutr = []

        cal   = float(nutr[0]) if len(nutr) > 0 else 0.0
        fat_g = round(float(nutr[1]) * _DV_FAT_G / 100, 1)   if len(nutr) > 1 else 0.0
        pro_g = round(float(nutr[4]) * _DV_PROTEIN_G / 100, 1) if len(nutr) > 4 else 0.0
        crb_g = round(float(nutr[6]) * _DV_CARBS_G / 100, 1)  if len(nutr) > 6 else 0.0
        return cal, pro_g, crb_g, fat_g
    except Exception:
        cal = float(calories_raw) if calories_raw and str(calories_raw) != 'nan' else 0.0
        return cal, 0.0, 0.0, 0.0


# ─── Helpers ────────────────────────────────────────────────────────────────

def _parse_list_field(value, sep=','):
    """Parse a DataFrame field that may be a Python list, JSON array, or plain string."""
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if value is None:
        return []
    try:
        import math
        if isinstance(value, float) and math.isnan(value):
            return []
    except Exception:
        pass
    s = str(value).strip()
    if not s or s in ('nan', 'None', '[]', '{}', ''):
        return []
    # Try Python literal eval first (handles ['item1', 'item2'] format from CSV)
    try:
        parsed = ast.literal_eval(s)
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if str(v).strip()]
    except Exception:
        pass
    # Try JSON array
    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if str(v).strip()]
    except (json.JSONDecodeError, ValueError):
        pass
    # Fallback: split by separator
    return [v.strip() for v in s.split(sep) if v.strip()]


# ─── Recommendation logic ────────────────────────────────────────────────────
def recommend_hybrid(ingredients: list, top_k=5, poids_tfidf=0.3, poids_faiss=0.7):
    """
    Hybrid recommendation: TF-IDF (30%) + FAISS/LSA (70%)
    FAISS index is built on TruncatedSVD(384) of the TF-IDF matrix.
    Run rebuild_faiss.py once to generate the compatible index.
    """
    if SYSTEME is None or FAISS_INDEX is None:
        raise Exception("Models not loaded")

    try:
        df = SYSTEME['df']
        tfidf_corpus = SYSTEME['tfidf']
        tfidf_matrix = SYSTEME['tfidf_matrix']
        svd = SYSTEME.get('svd')

        n = len(df)
        ingredients_en = _translate_ingredients(ingredients)
        logger.info(f"[recommend] {ingredients} -> {ingredients_en}")
        query_text = ' '.join(ingredients_en).lower()
        query_tfidf = tfidf_corpus.transform([query_text])

        # ─ TF-IDF scores (cosine similarity) ────────────────────────────────
        from sklearn.metrics.pairwise import cosine_similarity
        scores_tfidf = cosine_similarity(query_tfidf, tfidf_matrix).flatten()

        # ─ FAISS scores (LSA-compressed cosine) ─────────────────────────────
        if svd is not None:
            from sklearn.preprocessing import normalize
            q_dense = svd.transform(query_tfidf)           # (1, 384)
            q_dense = normalize(q_dense, norm='l2').astype('float32')
            distances, indices = FAISS_INDEX.search(q_dense, top_k * 2)
            scores_faiss = np.zeros(n)
            for dist, idx in zip(distances[0], indices[0]):
                if 0 <= idx < n:
                    scores_faiss[idx] = float(dist)
        else:
            # SVD not available yet — fall back to pure TF-IDF
            scores_faiss = scores_tfidf

        # ─ Hybrid score ─────────────────────────────────────────────────────
        scores_hybrid = poids_tfidf * scores_tfidf + poids_faiss * scores_faiss
        top_indices = scores_hybrid.argsort()[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            if idx < len(df):
                row = df.iloc[idx]
                results.append({
                    'index': int(idx),
                    'name': str(row.get('name', 'Unknown')),
                    'score': float(scores_hybrid[idx]),
                    'category': str(row.get('category', '')),
                    'cuisine_type': str(row.get('cuisine_type', '')),
                    'servings': int(row.get('servings', 1)) if pd.notna(row.get('servings')) else 1,
                    **dict(zip(
                        ('calories', 'proteins_g', 'carbs_g', 'fats_g'),
                        _parse_nutrition(row.get('nutrition'), row.get('calories', 0))
                    )),
                    'prep_time_min': int(row.get('prep_time_min', 0)) if pd.notna(row.get('prep_time_min')) else 0,
                    'cook_time_min': int(row.get('cook_time_min', 0)) if pd.notna(row.get('cook_time_min')) else 0,
                    'difficulty': str(row.get('difficulty', '')),
                    'ingredients': _parse_list_field(row.get('ingredients', [])),
                    'steps': _parse_list_field(row.get('steps', []), sep='.'),
                    'tags': _parse_list_field(row.get('tags', [])),
                })
        
        return results
    except Exception as e:
        logger.error(f"Error in recommend_hybrid: {e}")
        raise

# ─── API Routes ─────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'models_loaded': SYSTEME is not None and FAISS_INDEX is not None
    })

@app.route('/recommend', methods=['POST'])
def recommend():
    """
    POST /recommend
    Body: { "ingredients": ["chicken", "garlic", "lemon"], "top_k": 5 }
    Returns: { "success": true, "recommendations": [...] }
    """
    try:
        data = request.get_json()
        ingredients = data.get('ingredients', [])
        top_k = data.get('top_k', 5)

        logger.info(f"[/recommend] received ingredients: {ingredients}")

        if not ingredients or len(ingredients) == 0:
            return jsonify({
                'success': False,
                'error': 'ingredients list is required'
            }), 400
        
        if top_k < 1 or top_k > 20:
            top_k = 5
        
        recommendations = recommend_hybrid(ingredients, top_k=top_k)
        
        return jsonify({
            'success': True,
            'query': ingredients,
            'recommendations': recommendations
        }), 200
    
    except Exception as e:
        logger.error(f"Error in /recommend: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ─── Startup ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Import pandas here to avoid import at module level
    import pandas as pd
    
    logger.info("🚀 Starting Recommendation Service...")
    if load_models():
        logger.info("✅ All models loaded successfully")
        app.run(host='0.0.0.0', port=5001, debug=False)
    else:
        logger.error("❌ Failed to load models")
        sys.exit(1)
