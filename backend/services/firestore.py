"""
STRATAGENT — Firestore Service
All database operations. Schema is defined by collection structure below.

COLLECTIONS:
  knowledge_bases/          — One doc per supplier
  relationship_profiles/    — One doc per prospect
  monitored_positions/      — Active Watch queue
  outcome_memory/           — Learning layer records
  demo_sessions/            — Demo gate counters
"""
from google.cloud import firestore
from typing import Optional
import time

db = firestore.Client()


# ── KNOWLEDGE BASE ──────────────────────────────────────────────────────────

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


# ── RELATIONSHIP PROFILE ─────────────────────────────────────────────────────

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


# ── MONITORED POSITIONS (ACTIVE WATCH) ───────────────────────────────────────

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


# ── OUTCOME MEMORY ────────────────────────────────────────────────────────────

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
