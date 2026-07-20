#!/usr/bin/env python3
"""
Flask service for Meatay Assistant chatbot (RAG)
Brain: meatay_chatbot_data.pt (FAQ + recipe embeddings, MiniLM multilingual)
     + meatay_dataset_clean.csv (the 993 recipe texts, index-aligned)
Engine: Gemini writes the final answer from the retrieved context.
Fallback: direct semantic FAQ answer when Gemini is unavailable.
"""

import os
import re
import sys
import numpy as np
import pandas as pd
import torch
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

# ─── Setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT_DIR = os.path.dirname(__file__)
BASE_DIR = os.path.join(ROOT_DIR, 'features', 'chatbot')
DATA_PATH = os.path.join(BASE_DIR, 'meatay_chatbot_data.pt')
RECIPES_CSV_PATH = os.path.join(BASE_DIR, 'meatay_dataset_clean.csv')

EMBEDDING_MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'


def _load_dotenv():
    """Minimal .env loader (shares the backend .env, no extra dependency)."""
    env_path = os.path.join(ROOT_DIR, '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '').strip()
# "-latest" aliases always point to the newest model of the tier — avoids
# hard 404s when Google retires a pinned version. The lite tier answers in
# under a second (vs 10-45s for the thinking flash), ideal for a chatbot.
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-flash-lite-latest')
GEMINI_URL = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent'

# Below this cosine similarity the FAQ fallback answers with a generic message.
# Calibrated on samples: legit cooking queries score >= 0.72,
# off-topic ones ("capitale de la France", "bitcoin") score <= 0.64.
CONFIDENCE_THRESHOLD = 0.65

# Above this score, recipes are considered relevant enough for the context
RECIPE_THRESHOLD = 0.45

FALLBACK_RESPONSE = (
    "Désolé, je n'ai pas bien compris votre question 🥩 "
    "Dites-moi quels ingrédients vous avez (ex : « J'ai du poulet et du riz ») "
    "ou posez-moi une question sur la cuisine, la nutrition ou l'application !"
)

SYSTEM_PROMPT = (
    "Tu es Meatay Assistant 🥩, le chef cuisinier virtuel de l'application de "
    "nutrition Meatay. Tu réponds en français, de façon chaleureuse, concise "
    "(3 phrases maximum sauf pour détailler une recette demandée) et tu utilises "
    "quelques emojis culinaires. Tu aides sur : les recettes, les ingrédients, "
    "les techniques de cuisine, la nutrition et l'utilisation de l'application. "
    "Appuie-toi en priorité sur le CONTEXTE fourni (réponse type de la FAQ et "
    "recettes du catalogue Meatay). Si l'utilisateur cite des ingrédients, "
    "propose-lui les recettes du contexte. Si la question sort de la cuisine ou "
    "de la nutrition, décline poliment en rappelant ton rôle."
)

# ─── Global models (loaded at startup) ──────────────────────────────────────
MODEL = None
FAQ_QUESTIONS = None
FAQ_REPONSES = None
FAQ_EMBEDDINGS_NORM = None      # L2-normalized, for cosine via dot product
RECIPES_DF = None
RECIPE_EMBEDDINGS_NORM = None


def _normalize(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


def load_models():
    """Load the sentence-transformer model, FAQ data and recipe catalog"""
    global MODEL, FAQ_QUESTIONS, FAQ_REPONSES, FAQ_EMBEDDINGS_NORM
    global RECIPES_DF, RECIPE_EMBEDDINGS_NORM

    try:
        data = torch.load(DATA_PATH, map_location='cpu', weights_only=False)
        FAQ_QUESTIONS = data['faq_questions']
        FAQ_REPONSES = data['faq_reponses']
        FAQ_EMBEDDINGS_NORM = _normalize(data['faq_embeddings'].numpy().astype('float32'))
        logger.info(f"✅ Loaded meatay_chatbot_data.pt ({len(FAQ_QUESTIONS)} FAQ entries)")

        # Recipe catalog: meatay_dataset_clean.csv rows are index-aligned with
        # recettes_embeddings (embedding of "name + ingredients", verified 1.0)
        recipe_emb = data.get('recettes_embeddings')
        if recipe_emb is not None and os.path.exists(RECIPES_CSV_PATH):
            df = pd.read_csv(RECIPES_CSV_PATH)
            if len(df) == recipe_emb.shape[0]:
                RECIPES_DF = df
                RECIPE_EMBEDDINGS_NORM = _normalize(recipe_emb.numpy().astype('float32'))
                logger.info(f"✅ Loaded recipe catalog ({len(df)} recipes)")
            else:
                logger.warning(
                    f"⚠️ Recipe CSV ({len(df)} rows) does not match embeddings "
                    f"({recipe_emb.shape[0]}), recipes disabled")

        from sentence_transformers import SentenceTransformer
        MODEL = SentenceTransformer(EMBEDDING_MODEL_NAME)
        logger.info(f"✅ Loaded embedding model {EMBEDDING_MODEL_NAME}")

        if GEMINI_API_KEY:
            logger.info(f"✅ Gemini engine enabled ({GEMINI_MODEL})")
        else:
            logger.warning("⚠️ GEMINI_API_KEY not set — falling back to semantic FAQ answers")

        return True
    except Exception as e:
        logger.error(f"❌ Error loading models: {e}")
        return False


# ─── Retrieval ──────────────────────────────────────────────────────────────

def embed_query(message: str) -> np.ndarray:
    query = MODEL.encode([message], convert_to_numpy=True)[0].astype('float32')
    norm = np.linalg.norm(query)
    return query / (norm if norm else 1.0)


def search_faq(query: np.ndarray):
    """Best FAQ answer for the query. Returns (question, answer, score)."""
    scores = FAQ_EMBEDDINGS_NORM @ query
    idx = int(np.argmax(scores))
    return FAQ_QUESTIONS[idx], FAQ_REPONSES[idx], float(scores[idx])


def _image_url(name: str, width=400, height=300) -> str:
    """Realistic food photo URL for any dish name (pollinations.ai, free, no key).
    Deterministic seed per name so the same dish always gets the same image."""
    from urllib.parse import quote
    seed = sum(ord(c) for c in name) % 100000
    prompt = quote(f"professional food photography of {name}, appetizing, "
                   f"restaurant plating, natural light, high resolution")
    return (f"https://image.pollinations.ai/prompt/{prompt}"
            f"?width={width}&height={height}&nologo=true&seed={seed}")


def _clean_field(value, *prefixes):
    """Strip dataset prefixes ("Ingredients", "Step by step") and fix
    the missing space after periods ("paper.Toss" -> "paper. Toss")."""
    text = str(value or '').strip()
    if text.lower() in ('nan', 'none'):
        return ''
    for prefix in prefixes:
        if text.lower().startswith(prefix.lower()):
            text = text[len(prefix):].strip()
    return re.sub(r'\.(?=[A-Z])', '. ', text)


def search_recipes(query: np.ndarray, top_k: int = 3):
    """Top recipes of the Meatay catalog for the query."""
    if RECIPE_EMBEDDINGS_NORM is None:
        return []
    scores = RECIPE_EMBEDDINGS_NORM @ query
    top = np.argsort(scores)[::-1][:top_k]
    results = []
    for idx in top:
        if float(scores[idx]) < RECIPE_THRESHOLD:
            continue
        row = RECIPES_DF.iloc[int(idx)]
        name = str(row.get('name', ''))
        results.append({
            'name': name,
            'description': _clean_field(row.get('description'))[:200],
            'ingredients': _clean_field(row.get('ingredients'), 'Ingredients')[:600],
            'etapes': _clean_field(row.get('etapes'), 'Step by step')[:1200],
            'score': round(float(scores[idx]), 4),
            'image_url': _image_url(name),
        })
    return results


# ─── Gemini engine ──────────────────────────────────────────────────────────

def gemini_generate(message, history, faq_question, faq_answer, faq_score, recipes):
    """
    Ask Gemini to write the final reply from the retrieved context.
    Returns (text, tokens_used) or None if unavailable/failed.
    """
    if not GEMINI_API_KEY:
        return None

    context_parts = []
    if faq_score >= RECIPE_THRESHOLD:
        context_parts.append(
            f"FAQ Meatay la plus proche (similarité {faq_score:.2f}) :\n"
            f"Q: {faq_question}\nRéponse type: {faq_answer}")
    if recipes:
        lines = []
        for r in recipes:
            lines.append(
                f"- {r['name']} (pertinence {r['score']:.2f})\n"
                f"  Ingrédients: {r['ingredients']}\n"
                f"  Étapes: {r['etapes']}")
        context_parts.append("Recettes du catalogue Meatay :\n" + "\n".join(lines))

    context = "\n\n".join(context_parts) if context_parts else "(aucun contexte pertinent trouvé)"

    contents = []
    for msg in (history or [])[-8:]:
        role = 'model' if msg.get('isBot') else 'user'
        text = str(msg.get('content', '')).strip()
        if text:
            contents.append({'role': role, 'parts': [{'text': text}]})
    contents.append({
        'role': 'user',
        'parts': [{'text': f"CONTEXTE:\n{context}\n\nMESSAGE DU CLIENT:\n{message}"}]
    })

    payload = {
        'systemInstruction': {'parts': [{'text': SYSTEM_PROMPT}]},
        'contents': contents,
        # thinking models spend output tokens on internal reasoning first
        'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 2048},
    }

    try:
        resp = requests.post(
            GEMINI_URL,
            params={'key': GEMINI_API_KEY},
            json=payload,
            timeout=45,
        )
        resp.raise_for_status()
        body = resp.json()
        parts = body['candidates'][0]['content']['parts']
        text = ''.join(
            p.get('text', '') for p in parts if not p.get('thought')).strip()
        if not text:
            return None
        tokens = body.get('usageMetadata', {}).get('totalTokenCount')
        return text, tokens
    except Exception as e:
        logger.error(f"Gemini error, falling back to FAQ: {e}")
        return None


# ─── Chat logic ─────────────────────────────────────────────────────────────

def answer_message(message: str, history=None):
    """
    RAG pipeline: retrieve FAQ answer + recipes with the MiniLM embeddings,
    then let Gemini write the reply. Falls back to the raw FAQ answer.
    """
    if MODEL is None or FAQ_EMBEDDINGS_NORM is None:
        raise Exception("Models not loaded")

    query = embed_query(message)
    faq_question, faq_answer, faq_score = search_faq(query)
    recipes = search_recipes(query)

    generated = gemini_generate(
        message, history, faq_question, faq_answer, faq_score, recipes)

    if generated is not None:
        response, tokens = generated
        engine = GEMINI_MODEL
        is_fallback = False
    elif faq_score >= CONFIDENCE_THRESHOLD:
        response, tokens = faq_answer, None
        engine = 'faq-minilm'
        is_fallback = False
    else:
        response, tokens = FALLBACK_RESPONSE, None
        engine = 'faq-minilm'
        is_fallback = True

    logger.info(
        f"[chat] engine={engine} faq_score={faq_score:.3f} "
        f"recipes={len(recipes)} matched={faq_question!r}")

    return {
        'response': response,
        'engine': engine,
        'matched_question': None if is_fallback else faq_question,
        'score': round(faq_score, 4),
        'is_fallback': is_fallback,
        'tokens_used': tokens,
        'recipes': recipes,
    }


# ─── API Routes ─────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'models_loaded': MODEL is not None and FAQ_EMBEDDINGS_NORM is not None,
        'recipes_loaded': RECIPE_EMBEDDINGS_NORM is not None,
        'gemini_enabled': bool(GEMINI_API_KEY),
    })


@app.route('/chat', methods=['POST'])
def chat():
    """
    POST /chat
    Body: { "message": "J'ai du poulet et du riz",
            "history": [{ "content": "...", "isBot": false }, ...] }
    Returns: { "success": true, "response": "...", "engine": "...",
               "score": 0.87, "recipes": [...] }
    """
    try:
        data = request.get_json()
        message = (data.get('message') or '').strip()
        history = data.get('history') or []

        logger.info(f"[/chat] received message: {message[:120]!r}")

        if not message:
            return jsonify({
                'success': False,
                'error': 'message is required'
            }), 400

        result = answer_message(message, history)

        return jsonify({
            'success': True,
            **result
        }), 200

    except Exception as e:
        logger.exception(f"Error in /chat: {e}")
        # Generic message: internals (paths, stack details) stay in the logs
        return jsonify({
            'success': False,
            'error': 'Internal chatbot error'
        }), 500


# ─── Startup ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    logger.info("🚀 Starting Meatay Assistant Chatbot Service...")
    if load_models():
        logger.info("✅ All models loaded successfully")
        # 127.0.0.1 by default: only the Node backend calls this service and it
        # has no authentication — exposing it on the LAN would let anyone use
        # the Gemini key. Set CHATBOT_HOST=0.0.0.0 explicitly if ever needed.
        app.run(host=os.environ.get('CHATBOT_HOST', '127.0.0.1'), port=5002, debug=False)
    else:
        logger.error("❌ Failed to load models")
        sys.exit(1)
