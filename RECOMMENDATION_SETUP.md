# 🥩 Meatay Recommendation System — Intégration

## 📋 Architecture

```
Flutter App (barcode scanner)
    ↓
Node/Express Backend (/api/recommend)
    ↓
Flask Service (/recommend)
    + Charge sys_recommandation.pkl
    + Charge faiss_index.bin
    ↓
Open Food Facts API (barcode → product)
```

---

## 🚀 Démarrage du service Flask

### 1. Installer les dépendances Python
```bash
pip install -r requirements.txt
```

### 2. Démarrer le service Flask
```bash
python recommendation_service.py
```

**Output attendu :**
```
✅ Loaded sys_recommandation.pkl
✅ Loaded faiss_index.bin
🚀 Starting Recommendation Service...
✅ All models loaded successfully
 * Running on http://0.0.0.0:5001
```

---

## 🔌 API Endpoints

### Node Backend (protégés par authMiddleware)

#### 1. Recommandations par ingrédients
```
POST /api/recommend
Content-Type: application/json
Authorization: Bearer <token>

{
  "ingredients": ["chicken", "garlic", "lemon"],
  "top_k": 5
}
```

**Response :**
```json
{
  "success": true,
  "ingredients": ["chicken", "garlic", "lemon"],
  "recommendations": [
    {
      "index": 42,
      "name": "Chicken Lemon Garlic Pasta",
      "score": 0.95,
      "category": "pasta",
      "cuisine_type": "italian",
      "servings": 2,
      "calories": 450,
      "proteins_g": 35,
      "carbs_g": 55,
      "fats_g": 12,
      "prep_time_min": 10,
      "cook_time_min": 20,
      "difficulty": "easy",
      "ingredients": [
        { "name": "chicken breast", "quantity": 300, "unit": "g" },
        { "name": "garlic", "quantity": 3, "unit": "cloves" },
        { "name": "lemon", "quantity": 1, "unit": "whole" }
      ],
      "steps": [
        { "step": 1, "instruction": "..." }
      ],
      "tags": ["quick", "healthy", "italian"]
    }
  ]
}
```

---

#### 2. Recommandations par code-barres
```
POST /api/recommend/barcode
Content-Type: application/json
Authorization: Bearer <token>

{
  "barcode": "3017620425035",
  "top_k": 5
}
```

**Response :**
```json
{
  "success": true,
  "scannedProduct": {
    "barcode": "3017620425035",
    "name": "Nutella",
    "brand": "Ferrero",
    "imageUrl": "https://...",
    "ingredients": ["hazelnuts", "cocoa", "sugar"],
    "nutrition": {
      "calories": 540,
      "proteins_g": 8,
      "carbs_g": 56,
      "fats_g": 31
    }
  },
  "recommendations": [
    {
      "name": "Hazelnut Chocolate Spread Pancakes",
      "score": 0.88,
      ...
    }
  ]
}
```

---

#### 3. Health Check (pas besoin d'auth)
```
GET /api/recommend/health
```

**Response :**
```json
{
  "success": true,
  "flask_service": "healthy",
  "models_loaded": true
}
```

---

## 📱 Utilisation côté Flutter

### Exemple : Recommandation par texte libre

```dart
// Obtenir le token d'authentification
String token = await getToken();

// Appeler l'API
final response = await http.post(
  Uri.parse('http://localhost:5000/api/recommend'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json'
  },
  body: jsonEncode({
    'ingredients': ['chicken', 'garlic', 'lemon'],
    'top_k': 5
  })
);

if (response.statusCode == 200) {
  final data = jsonDecode(response.body);
  final recommendations = data['recommendations'];
  
  // Afficher dans une popup avec image + nutrition
  showRecommendationPopup(recommendations);
}
```

---

### Exemple : Recommandation par code-barres

```dart
// Scanner un code-barres (utilise la caméra)
BarcodeCapture barcode = await scanBarcode();

// Appeler l'API
final response = await http.post(
  Uri.parse('http://localhost:5000/api/recommend/barcode'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json'
  },
  body: jsonEncode({
    'barcode': barcode.code,
    'top_k': 5
  })
);

if (response.statusCode == 200) {
  final data = jsonDecode(response.body);
  final product = data['scannedProduct'];
  final recommendations = data['recommendations'];
  
  // Afficher le produit scanné + recommandations
  showProductAndRecipePopup(product, recommendations);
}
```

---

## 🧪 Tests manuels

### Avec curl

#### Test ingrédients (besoin d'un token valide)
```bash
curl -X POST http://localhost:5000/api/recommend \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ingredients": ["chicken", "garlic"], "top_k": 3}'
```

#### Test health check
```bash
curl http://localhost:5000/api/recommend/health
```

---

## 🔧 Dépannage

### "Flask service is not available"
- Vérifier que le service Flask est démarré : `python recommendation_service.py`
- Vérifier que le port 5001 est accessible

### "Product not found for barcode"
- Le barcode n'existe pas dans Open Food Facts
- Essayer un autre barcode (ex : UPC d'un produit courant)

### "Recommendation service error"
- Vérifier que les fichiers `sys_recommandation.pkl` et `faiss_index.bin` existent dans `recommendation_data/`
- Vérifier les logs du service Flask

---

## 📦 Fichiers créés

```
projet_pfe_backend/
├── recommendation_service.py          # Service Flask principal
├── requirements.txt                   # Dépendances Python
├── recommendation_data/
│   ├── sys_recommandation.pkl         # Modèles entraînés
│   └── faiss_index.bin                # Index FAISS
├── features/recommend/
│   ├── recommend.service.js           # Logique métier
│   ├── recommend.controller.js        # Contrôleur requêtes
│   ├── recommend.routes.js            # Routes Express
│   └── recommend.validation.js        # Validation inputs
└── server.js                          # Modifié : ajout routes recommend
```

---

## 📞 Support

Si le service Flask refuse de démarrer :
1. Vérifier que Python 3.8+ est installé
2. Vérifier que toutes les dépendances sont installées : `pip install -r requirements.txt`
3. Vérifier que les fichiers pickle/FAISS ont la bonne taille (centaines de MB)
