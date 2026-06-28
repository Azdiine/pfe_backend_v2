"""
Rebuilds the FAISS index using TruncatedSVD (LSA) on the TF-IDF matrix.
Run once: python rebuild_faiss.py
"""
import pickle
import faiss
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize
import warnings
warnings.filterwarnings('ignore')

PKL_PATH  = 'recommendation_data/sys_recommandation.pkl'
FAISS_PATH = 'recommendation_data/faiss_index.bin'
N_COMPONENTS = 384  # keeps same FAISS dim as before

print("Loading pickle...")
with open(PKL_PATH, 'rb') as f:
    sys_data = pickle.load(f)

tfidf_matrix = sys_data['tfidf_matrix']
print(f"TF-IDF matrix: {tfidf_matrix.shape}  (sparse)")

# ── TruncatedSVD (LSA): 522k → 384 dense dims ────────────────────────────────
print(f"Fitting TruncatedSVD({N_COMPONENTS}) — this may take a few minutes...")
svd = TruncatedSVD(n_components=N_COMPONENTS, algorithm='randomized', random_state=42)
dense = svd.fit_transform(tfidf_matrix)          # (n_recipes, 384)
dense = normalize(dense, norm='l2').astype('float32')
print(f"Dense matrix: {dense.shape}  explained variance: {svd.explained_variance_ratio_.sum():.2%}")

# ── Rebuild FAISS index (IndexFlatIP = cosine on L2-normalized vectors) ───────
print("Building FAISS IndexFlatIP...")
index = faiss.IndexFlatIP(N_COMPONENTS)
index.add(dense)
faiss.write_index(index, FAISS_PATH)
print(f"FAISS index saved: {FAISS_PATH}  ({index.ntotal} vectors)")

# ── Save SVD in pickle so the service can transform queries ──────────────────
sys_data['svd'] = svd
with open(PKL_PATH, 'wb') as f:
    pickle.dump(sys_data, f)
print(f"Pickle updated with SVD: {PKL_PATH}")

# ── Quick sanity check ───────────────────────────────────────────────────────
print("\n=== Sanity check ===")
tfidf_model = sys_data['tfidf']
df = sys_data['df']

def quick_recommend(ingredients, top_k=5):
    query = ' '.join(ingredients).lower()
    q_tfidf = tfidf_model.transform([query])
    q_dense = svd.transform(q_tfidf)
    q_dense = normalize(q_dense, norm='l2').astype('float32')
    scores_arr = np.zeros(len(df))
    dists, idxs = index.search(q_dense, top_k)
    for d, i in zip(dists[0], idxs[0]):
        if 0 <= i < len(df):
            scores_arr[i] = float(d)
    top = scores_arr.argsort()[::-1][:top_k]
    return [df.iloc[i]['name'] for i in top]

print("chicken + tomatoes :", quick_recommend(['chicken', 'tomatoes']))
print("milk + eggs + cheese:", quick_recommend(['milk', 'eggs', 'cheese']))
print("carrots + lettuce  :", quick_recommend(['carrots', 'lettuce']))
print("\nDone! Restart the Flask service.")

