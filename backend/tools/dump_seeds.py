"""
STRATAMESH seed dump -- run from the backend folder inside venv.
Prints every supplier's full seed data so STRATAMESH can brief the team.

Usage:
  cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend"
  python tools/dump_seeds.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import firestore as db

kbs = db.list_knowledge_bases()

output = []
for kb in kbs:
    name = kb.get("company_name", kb.get("id", "?"))
    website = kb.get("website_url", "")
    iseed = kb.get("intelligence_seed") or {}
    mseed = kb.get("manual_seed") or {}

    def sv(block, field):
        return (iseed.get(block, {}).get(field, {}) or {}).get("value", "") or ""

    entry = {
        "name": name,
        "website": website,
        "product": sv("identity", "product_plain") or mseed.get("product_plain", ""),
        "not_this": sv("identity", "not_this") or mseed.get("not_this", ""),
        "problem_solved": sv("identity", "problem_solved"),
        "key_specs": sv("identity", "key_specs"),
        "buyer_type": sv("buyer_intelligence", "buyer_type") or mseed.get("buyer_type", ""),
        "decision_maker": sv("buyer_intelligence", "decision_maker"),
        "use_case": sv("buyer_intelligence", "use_case") or mseed.get("use_case", ""),
        "deal_size": sv("commercial_reality", "deal_size"),
        "geography": sv("commercial_reality", "geography"),
        "we_win_when": sv("winning_conditions", "we_win_when"),
        "differentiator": sv("winning_conditions", "differentiator"),
        "trigger_events": sv("signal_recognition", "trigger_events"),
        "tender_keywords": sv("signal_recognition", "tender_keywords"),
        "capex_indicators": sv("signal_recognition", "capex_indicators"),
        "completeness": (iseed.get("_meta") or {}).get("completeness_pct", "no seed"),
    }
    output.append(entry)

print(json.dumps(output, indent=2, ensure_ascii=False))
print(f"\n--- {len(output)} suppliers total ---", file=sys.stderr)
