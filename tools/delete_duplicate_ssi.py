"""
Deletes the duplicate SSI Consult KB (depth 35, no docs).
Run from: stratagent/backend/
  cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend"
  python ..\..\delete_duplicate_ssi.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__) + "/stratagent/backend")
from dotenv import load_dotenv
load_dotenv("stratagent/backend/.env")

from google.cloud import firestore

DUPLICATE_ID = "8df1ccc3-e1ef-4888-8cba-0bd6e3578e00"

db = firestore.Client()
doc = db.collection("knowledge_bases").document(DUPLICATE_ID).get()

if not doc.exists:
    print("Document not found — already deleted?")
else:
    data = doc.to_dict()
    print(f"Deleting: {data.get('company_name')} | depth {round(data.get('intelligence_depth', {}).get('total', 0))} | {len(data.get('documents', []))} docs")
    db.collection("knowledge_bases").document(DUPLICATE_ID).delete()
    print("Done. Refresh the app.")
