"""
Quick fix: Rename the ISODE srl Knowledge Base to "ISODE"
Run from: stratagent/backend/
  cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend"
  python ..\..\rename_isode_kb.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__) + "/stratagent/backend")

from dotenv import load_dotenv
load_dotenv("stratagent/backend/.env")

from services import firestore as db

kbs = db.list_knowledge_bases()
target = next((kb for kb in kbs if "isode" in kb.get("company_name", "").lower()), None)

if not target:
    print("No ISODE KB found — nothing to rename.")
else:
    old_name = target["company_name"]
    sid = target.get("supplier_id") or target.get("id")
    db.save_knowledge_base(sid, {"company_name": "ISODE"})
    print(f"Renamed '{old_name}' -> 'ISODE'  (ID: {sid})")
    print("Refresh the app — discovery banner should be clear.")
