"""
Diagnostic: list all Knowledge Base documents in Firestore
Run from STRATAGENT Sales App root:
  cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend"
  python ..\..\list_kbs.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from services import firestore as db

kbs = db.list_knowledge_bases()
print(f"\n{'ID':<40} {'Name':<35} {'Depth':>6}  Docs")
print("-" * 90)
for kb in kbs:
    sid = kb.get('supplier_id') or kb.get('id', '???')
    name = kb.get('company_name', '(no name)')
    depth = round(kb.get('intelligence_depth', {}).get('total', 0))
    docs = len(kb.get('documents', []))
    print(f"{sid:<40} {name:<35} {depth:>6}  {docs}")
print(f"\nTotal: {len(kbs)} KBs\n")
