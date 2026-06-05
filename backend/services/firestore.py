"""
STRATAGENT -- Firestore Service
All database operations. Schema is defined by collection structure below.

COLLECTIONS:
  knowledge_bases/          -- One doc per supplier
  relationship_profiles/    -- One doc per prospect
  monitored_positions/      -- Active Watch queue
  outcome_memory/           -- Learning layer records
  demo_sessions/            -- Demo gate counters
  product_images/           -- Tagged product/brand images per supplier
"""
from google.cloud import firestore
from typing import Optional
import time
import json

db = firestore.Client()


# -- KNOWLEDGE BASE --

def save_knowledge_base(supplier_id: str, data: dict) -> str:
    ref = db.collection("knowledge_bases").document(supplier_id)
    ref.set({**data, "updated_at": time.time()}, merge=True)
    return supplier_id


def get_knowledge_base(supplier_id: str) -> Optional[dict]:
    doc = db.collection("knowledge_bases").document(supplier_id).get()
    return doc.to_dict() if doc.exists else None


def list_knowledge_bases() -> list:
    docs = db.collection("knowledge_bases").stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]


def update_intelligence_depth(supplier_id: str, scores: dict, total: float):
    db.collection("knowledge_bases").document(supplier_id).update({
        "intelligence_depth": {
            "scores": scores,
            "total": total,
            "updated_at": time.time(),
        }
    })


# -- RELATIONSHIP PROFILE --

def save_relationship_profile(profile_id: str, data: dict) -> str:
    ref = db.collection("relationship_profiles").document(profile_id)
    ref.set({**data, "updated_at": time.time()}, merge=True)
    return profile_id


def get_relationship_profile(profile_id: str) -> Optional[dict]:
    doc = db.collection("relationship_profiles").document(profile_id).get()
    return doc.to_dict() if doc.exists else None


def list_relationship_profiles(supplier_id: str) -> list:
    docs = (
        db.collection("relationship_profiles")
        .where("supplier_id", "==", supplier_id)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def list_all_relationship_profiles(limit: int = 200) -> list:
    """List all relationship profiles across all suppliers."""
    docs = db.collection("relationship_profiles").stream()
    results = [{"id": d.id, **d.to_dict()} for d in docs]
    # Sort by CI descending, then by updated_at descending
    results.sort(key=lambda x: (-x.get("convergence_index", 0), -x.get("updated_at", 0)))
    return results[:limit]


def list_all_outcomes(limit: int = 50) -> list:
    """List recent outcome memory records across all suppliers."""
    docs = db.collection("outcome_memory").stream()
    results = [{"id": d.id, **d.to_dict()} for d in docs]
    results.sort(key=lambda x: -x.get("recorded_at", 0))
    return results[:limit]


# -- MONITORED POSITIONS (ACTIVE WATCH) --

def save_monitored_position(position_id: str, data: dict) -> str:
    ref = db.collection("monitored_positions").document(position_id)
    ref.set({
        **data,
        "status": "watching",
        "parked_at": time.time(),
        "updated_at": time.time(),
    }, merge=True)
    return position_id


def get_monitored_positions(supplier_id: str) -> list:
    docs = (
        db.collection("monitored_positions")
        .where("supplier_id", "==", supplier_id)
        .where("status", "==", "watching")
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def surface_monitored_position(position_id: str, reason: str):
    db.collection("monitored_positions").document(position_id).update({
        "status": "surfaced",
        "surfaced_reason": reason,
        "surfaced_at": time.time(),
    })


def dismiss_monitored_position(position_id: str):
    db.collection("monitored_positions").document(position_id).update({
        "status": "dismissed",
        "dismissed_at": time.time(),
    })


def promote_monitored_position(position_id: str):
    db.collection("monitored_positions").document(position_id).update({
        "status": "promoted",
        "promoted_at": time.time(),
    })


def list_all_monitored_positions(include_dismissed: bool = False) -> list:
    """List all monitored positions across all suppliers."""
    docs = db.collection("monitored_positions").stream()
    results = []
    for d in docs:
        data = {"id": d.id, **d.to_dict()}
        if not include_dismissed and data.get("status") == "dismissed":
            continue
        results.append(data)
    # Sort: surfaced first, then watching, by parked_at descending
    status_order = {"surfaced": 0, "watching": 1, "promoted": 2, "dismissed": 3}
    results.sort(key=lambda x: (status_order.get(x.get("status", "watching"), 9), -x.get("parked_at", 0)))
    return results


# -- PRODUCT IMAGES --

def save_product_image(image_id: str, data: dict) -> str:
    ref = db.collection("product_images").document(image_id)
    ref.set({**data, "uploaded_at": time.time()})
    return image_id


def get_product_images(supplier_id: str) -> list:
    docs = (
        db.collection("product_images")
        .where("supplier_id", "==", supplier_id)
        .order_by("uploaded_at", direction=firestore.Query.DESCENDING)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def search_product_images(supplier_id: str, query: str) -> list:
    all_images = get_product_images(supplier_id)
    q = query.lower()
    return [
        img for img in all_images
        if q in img.get("product_name", "").lower()
        or q in img.get("brand", "").lower()
        or q in img.get("tags", "").lower()
    ]


# -- OUTCOME MEMORY --

def record_outcome(data: dict) -> str:
    ref = db.collection("outcome_memory").document()
    ref.set({**data, "recorded_at": time.time()})
    return ref.id


def get_outcomes(supplier_id: str, limit: int = 100) -> list:
    docs = (
        db.collection("outcome_memory")
        .where("supplier_id", "==", supplier_id)
        .order_by("recorded_at", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# -- HUMAN INTEL --

def save_human_intel_note(supplier_id: str, note: dict) -> str:
    """Append a classified human intel note to the supplier's KB."""
    ref = db.collection("knowledge_bases").document(supplier_id)
    doc = ref.get()
    if not doc.exists:
        return ""
    existing = doc.to_dict().get("human_intel", [])
    existing.append({**note, "captured_at": time.time()})
    ref.update({"human_intel": existing})
    return note.get("note_id", "")


def get_human_intel(supplier_id: str) -> list:
    """Return all human intel notes for a supplier, newest first."""
    doc = db.collection("knowledge_bases").document(supplier_id).get()
    if not doc.exists:
        return []
    notes = doc.to_dict().get("human_intel", [])
    return sorted(notes, key=lambda n: n.get("captured_at", 0), reverse=True)


# -- AFFILIATE PARTNERS (STRATALINK) --

def save_affiliate_partner(partner_id: str, data: dict) -> str:
    db.collection("affiliate_partners").document(partner_id).set(
        {**data, "updated_at": time.time()}, merge=True
    )
    return partner_id

def get_affiliate_partner(partner_id: str) -> Optional[dict]:
    doc = db.collection("affiliate_partners").document(partner_id).get()
    return doc.to_dict() if doc.exists else None

def list_affiliate_partners(category: str = None, status: str = None) -> list:
    query = db.collection("affiliate_partners")
    if category:
        query = query.where("category", "==", category)
    if status:
        query = query.where("program_status", "==", status)
    docs = [{"id": d.id, **d.to_dict()} for d in query.stream()]
    docs.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return docs

def delete_affiliate_partner(partner_id: str):
    db.collection("affiliate_partners").document(partner_id).delete()

def save_affiliate_referral(referral_id: str, data: dict) -> str:
    db.collection("affiliate_referrals").document(referral_id).set(
        {**data, "updated_at": time.time()}, merge=True
    )
    return referral_id

def get_affiliate_referral(referral_id: str) -> Optional[dict]:
    doc = db.collection("affiliate_referrals").document(referral_id).get()
    return doc.to_dict() if doc.exists else None

def list_affiliate_referrals(status: str = None) -> list:
    query = db.collection("affiliate_referrals")
    if status:
        query = query.where("status", "==", status)
    docs = [{"id": d.id, **d.to_dict()} for d in query.stream()]
    docs.sort(key=lambda x: x.get("referred_at", 0), reverse=True)
    return docs


# -- PROSPECT POOL (STRATASCOUT) --

def save_prospect_pool_entry(pool_id: str, data: dict) -> str:
    ref = db.collection("prospect_pool").document(pool_id)
    ref.set({**data, "updated_at": time.time()})
    return pool_id


def get_prospect_pool_entry(pool_id: str) -> Optional[dict]:
    doc = db.collection("prospect_pool").document(pool_id).get()
    return doc.to_dict() if doc.exists else None


def update_prospect_pool_entry(pool_id: str, updates: dict):
    db.collection("prospect_pool").document(pool_id).update({
        **updates, "updated_at": time.time()
    })


def list_prospect_pool(supplier_id: str = None, status: str = None) -> list:
    query = db.collection("prospect_pool")
    if supplier_id:
        query = query.where("supplier_id", "==", supplier_id)
    if status:
        query = query.where("status", "==", status)
    # Sort in Python to avoid requiring a Firestore composite index
    docs = [{"id": d.id, **d.to_dict()} for d in query.stream()]
    docs.sort(key=lambda x: x.get("discovered_at", 0), reverse=True)
    return docs


# -- STORAGE STATS --

def _doc_size_bytes(data: dict) -> int:
    """Estimate document size by JSON serialisation."""
    try:
        return len(json.dumps(data, default=str).encode("utf-8"))
    except Exception:
        return 0


def get_storage_stats() -> list:
    """
    Calculate storage usage per supplier across all collections.
    Returns a list sorted by total_bytes descending.
    """
    kb_docs = {d.id: d.to_dict() for d in db.collection("knowledge_bases").stream()}

    image_stats: dict = {}
    for doc in db.collection("product_images").stream():
        data = doc.to_dict()
        sid = data.get("supplier_id", "")
        if sid not in image_stats:
            image_stats[sid] = {"count": 0, "bytes": 0}
        image_bytes = len((data.get("data", "")).encode("utf-8"))
        meta_bytes = _doc_size_bytes({k: v for k, v in data.items() if k != "data"})
        image_stats[sid]["count"] += 1
        image_stats[sid]["bytes"] += image_bytes + meta_bytes

    profile_stats: dict = {}
    for doc in db.collection("relationship_profiles").stream():
        data = doc.to_dict()
        sid = data.get("supplier_id", "")
        if sid not in profile_stats:
            profile_stats[sid] = {"count": 0, "bytes": 0}
        profile_stats[sid]["count"] += 1
        profile_stats[sid]["bytes"] += _doc_size_bytes(data)

    watch_stats: dict = {}
    for doc in db.collection("monitored_positions").stream():
        data = doc.to_dict()
        sid = data.get("supplier_id", "")
        if sid not in watch_stats:
            watch_stats[sid] = {"count": 0, "bytes": 0}
        watch_stats[sid]["count"] += 1
        watch_stats[sid]["bytes"] += _doc_size_bytes(data)

    results = []
    for supplier_id, kb_data in kb_docs.items():
        kb_bytes = _doc_size_bytes({k: v for k, v in kb_data.items() if k != "data"})
        img = image_stats.get(supplier_id, {"count": 0, "bytes": 0})
        prof = profile_stats.get(supplier_id, {"count": 0, "bytes": 0})
        watch = watch_stats.get(supplier_id, {"count": 0, "bytes": 0})
        total_bytes = kb_bytes + img["bytes"] + prof["bytes"] + watch["bytes"]
        results.append({
            "supplier_id": supplier_id,
            "company_name": kb_data.get("company_name", supplier_id),
            "kb_bytes": kb_bytes,
            "image_count": img["count"],
            "image_bytes": img["bytes"],
            "profile_count": prof["count"],
            "profile_bytes": prof["bytes"],
            "watch_count": watch["count"],
            "watch_bytes": watch["bytes"],
            "total_bytes": total_bytes,
        })

    results.sort(key=lambda x: -x["total_bytes"])
    return results
