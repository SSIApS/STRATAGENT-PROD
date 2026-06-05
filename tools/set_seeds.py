"""
STRATAGENT — Set Manual Seeds (Agent Definitions)
Writes seed fields directly to Firestore for MissBlue and STRATATIV3D.

Run from the STRATAGENT Sales App root:
  cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend"
  python ..\..\set_seeds.py

The app does NOT need to be running. This writes directly to Firestore.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from services import firestore as db

# ------------------------------------------------------------------
# Seed definitions — Jason's plain words, not AI guesses
# ------------------------------------------------------------------

SEEDS = {
    "MissBlue": {
        "product_plain": (
            "Biodegradable paper tea and coffee filter bags (100-pack). "
            "You put loose-leaf tea or ground coffee inside the bag, seal the top, "
            "and brew in a cup or pot. Fully compostable. Can be private-labelled."
        ),
        "buyer_type": (
            "Airbnb Superhosts and short-term rental operators, hotels, hostels, "
            "serviced apartments, offices, cafés, gift shops, and hospitality businesses "
            "that serve tea or coffee to guests."
        ),
        "use_case": (
            "Providing guests with a convenient, premium, and sustainable way to brew "
            "loose-leaf tea or ground coffee without a machine. Used as a guest amenity "
            "or sold as a retail product."
        ),
        "not_this": (
            "NOT a water filter. NOT a water purification product. NOT an industrial filter. "
            "NOT an air filter. NOT a coffee machine filter basket. "
            "The word 'filter' refers to the paper bag used for brewing tea/coffee, "
            "not any kind of filtration system."
        ),
    },
    "STRATATIV3D": {
        "product_plain": (
            "3D-printed consumer products. First product: Ungunk — a small plastic guard "
            "that snaps onto an electric toothbrush charger to prevent toothpaste buildup "
            "on the charging pins. Sold direct-to-consumer online."
        ),
        "buyer_type": (
            "Individual consumers who own electric toothbrushes (Oral-B, Philips Sonicare). "
            "Airbnb Superhosts who supply guest bathrooms with electric toothbrushes. "
            "Gift buyers looking for practical bathroom accessories."
        ),
        "use_case": (
            "Protect the charging contacts of an electric toothbrush charger from toothpaste "
            "residue and corrosion, extending the life of the charger and keeping it clean."
        ),
        "not_this": (
            "NOT a 3D printing service for clients. NOT industrial additive manufacturing. "
            "NOT custom printing on demand. NOT replacement toothbrush heads or brush attachments. "
            "STRATATIV3D designs and sells its own finished consumer products — it does not "
            "print things for other companies."
        ),
    },
}

# ------------------------------------------------------------------
# Find KBs by name and apply seeds
# ------------------------------------------------------------------

print("\n=== STRATAGENT — Setting Manual Seeds ===\n")

kbs = db.list_knowledge_bases()
by_name = {kb.get("company_name", ""): kb for kb in kbs}

updated = []
not_found = []

for target_name, seed in SEEDS.items():
    kb = by_name.get(target_name)
    if not kb:
        # Try case-insensitive match
        for name, k in by_name.items():
            if name.lower() == target_name.lower():
                kb = k
                break

    if not kb:
        not_found.append(target_name)
        print(f"  ✗  NOT FOUND: {target_name} — check KB name in app exactly matches")
        continue

    supplier_id = kb.get("supplier_id") or kb.get("id")
    print(f"  → Updating: {target_name}  (ID: {supplier_id})")

    # Write seed fields into the KB document (merge=True so no other data is touched)
    db.save_knowledge_base(supplier_id, {"manual_seed": seed})

    updated.append(target_name)
    print(f"       product_plain : {seed['product_plain'][:80]}...")
    print(f"       buyer_type    : {seed['buyer_type'][:80]}...")
    print(f"       use_case      : {seed['use_case'][:80]}...")
    print(f"       not_this      : {seed['not_this'][:80]}...")
    print()

print("=== Done ===")
print(f"  Updated : {updated}")
if not_found:
    print(f"  Missing : {not_found}  — check company_name spelling in app")
print()
print("Next steps:")
print("  1. Open the app → Knowledge Base → click MissBlue → check Agent Definition panel shows green")
print("  2. Same for STRATATIV3D")
print("  3. Run FI on Persolit to test the fixed research agent")
