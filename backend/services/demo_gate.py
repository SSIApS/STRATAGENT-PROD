"""
STRATAGENT -- Demo Gate
Controls demo mode: password enforcement and 5-action hard limit per session.
Cost protection for XPRIZE demonstration phase.
"""
from google.cloud import firestore
from config import DEMO_PASSWORD, DEMO_MAX_ACTIONS
from fastapi import HTTPException
import hashlib
import time


db = firestore.Client()


def verify_password(password: str) -> bool:
    return password == DEMO_PASSWORD


async def check_and_increment(session_id: str) -> dict:
    """
    Check remaining actions for a session and increment the counter.
    Raises 429 if limit reached.
    Returns remaining count.
    """
    ref = db.collection("demo_sessions").document(session_id)
    doc = ref.get()

    if not doc.exists:
        ref.set({
            "actions_used": 0,
            "created_at": time.time(),
            "active": True,
        })
        doc = ref.get()

    data = doc.to_dict()
    used = data.get("actions_used", 0)

    if used >= DEMO_MAX_ACTIONS:
        raise HTTPException(
            status_code=429,
            detail={
                "message": (
                    "This is a controlled demonstration. "
                    "Contact info@strategic.dk to discuss full access."
                ),
                "actions_used": used,
                "limit": DEMO_MAX_ACTIONS,
            }
        )

    ref.update({"actions_used": firestore.Increment(1)})
    remaining = DEMO_MAX_ACTIONS - (used + 1)

    return {
        "actions_used": used + 1,
        "actions_remaining": remaining,
        "limit": DEMO_MAX_ACTIONS,
    }


def create_session_id(password: str) -> str:
    """Generate a deterministic session ID from password + timestamp bucket."""
    bucket = int(time.time() / 3600)  # New session every hour
    raw = f"{password}:{bucket}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]
