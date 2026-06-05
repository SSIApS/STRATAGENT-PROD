"""
STRATAGENT — Bulk Web Source Adder
Adds vendor/product URLs to KB suppliers via the running backend API.
Run from: C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend
  python ..\..\add_web_sources.py
"""
import sys, os, time, hashlib, requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "stratagent", "backend"))
from dotenv import load_dotenv
load_dotenv("stratagent/backend/.env")

BASE_URL = "http://localhost:8080/api"
PASSWORD = "DEMO2026"

# Generate session ID (same algorithm as demo_gate.py)
bucket = int(time.time() / 3600)
raw = f"{PASSWORD}:{bucket}"
SESSION_ID = hashlib.sha256(raw.encode()).hexdigest()[:16]
HEADERS = {"x-session-id": SESSION_ID}

def list_kbs():
    r = requests.get(f"{BASE_URL}/knowledge-base/", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def add_url(supplier_id, url, focus="", context=""):
    data = {"url": url, "focus_element": focus, "context_note": context}
    r = requests.post(
        f"{BASE_URL}/knowledge-base/{supplier_id}/add-url",
        data=data, headers=HEADERS, timeout=60
    )
    return r

# Find supplier IDs by name
print("Fetching KB list...")
kbs = list_kbs()
id_map = {kb["company_name"]: (kb.get("supplier_id") or kb.get("id")) for kb in kbs}
print(f"Found {len(kbs)} KBs: {list(id_map.keys())}\n")

# URLs to add
SOURCES = [
    # (KB name, URL, focus element, context note)
    ("STRATATIV3D", "https://www.strategic-dk.com/stratativ3d",
     "company_overview", "STRATATIV3D division of SSI ApS — 3D printing, additive manufacturing, product development"),

    ("MissBlue", "https://www.risteriet.dk/online-shop/164-filterbrygning/2698-mister-brew-engangskaffefiltre-100-stk/",
     "distribution_channels", "Risteriet sells MissBlue filter as private label 'Mister Brew' at 55 DKK / 100 stk"),

    ("MissBlue", "https://origreen.dk/products/te-kaffefilter-bionedbrydeligt",
     "distribution_channels", "Origreen sells MissBlue filter as private label at 60 DKK / 100 stk — also bulk 500+1000 pcs"),

    ("MissBlue", "https://kimberfoods.dk/koeb-te-online/59-te-tilbehoer/944-tefilter-til-tekruset/",
     "distribution_channels", "Kimber Foods sells MissBlue filter as private label at 47-79 DKK / 100 stk"),

    ("MissBlue", "https://www.lomax.dk/foedevarer-og-koekken/kaffe-te-og-kakao/kaffe-og-tefiltre/tefilter-med-kant-100-stk-60122770/",
     "distribution_channels", "Lomax sells under MissBlue brand at 62.44 DKK — volume: 56.19@15pk / 49.94@carton(30pk)"),
]

# Run
for kb_name, url, focus, context in SOURCES:
    supplier_id = id_map.get(kb_name)
    if not supplier_id:
        print(f"  ⚠️  KB '{kb_name}' not found — skipping {url}")
        continue
    print(f"  Adding to {kb_name}: {url}")
    try:
        r = add_url(supplier_id, url, focus, context)
        if r.status_code == 200:
            data = r.json()
            new_depth = round(data.get("intelligence_depth", {}).get("total", 0))
            print(f"     ✅ Done — new depth: {new_depth}")
        else:
            print(f"     ❌ Error {r.status_code}: {r.text[:120]}")
    except Exception as e:
        print(f"     ❌ Exception: {e}")
    time.sleep(2)  # brief pause between calls

print("\nDone.")
