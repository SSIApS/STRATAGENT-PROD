"""
STRATAGENT — Active Watch Router
Manages Monitored Positions and trigger-based opportunity surfacing.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import uuid

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.watch_agent import scan_for_triggers

router = APIRouter()


class ParkRequest(BaseModel):
    supplier_id: str
    company_name: str
    profile_id: Optional[str] = None
    reason: str
    trigger_type: str  # "time", "document", "event", "threshold"
    trigger_value: Optional[str] = None  # days / element name / keyword / score
    notes: Optional[str] = None


@router.post("/park")
async def park_opportunity(
    payload: ParkRequest,
    x_session_id: str = Header(...),
):
    """Park an opportunity in Active Watch with a trigger condition."""
    position_id = str(uuid.uuid4())

    trigger = {"type": payload.trigger_type}
    if payload.trigger_value:
        if payload.trigger_type == "threshold":
            trigger["value"] = float(payload.trigger_value)
        elif payload.trigger_type == "time":
            trigger["days"] = int(payload.trigger_value)
        else:
            trigger["value"] = payload.trigger_value

    db.save_monitored_position(position_id, {
        "position_id": position_id,
        "supplier_id": payload.supplier_id,
        "company_name": payload.company_name,
        "profile_id": payload.profile_id,
        "reason_parked": payload.reason,
        "trigger": trigger,
        "notes": payload.notes,
    })

    return {
        "position_id": position_id,
        "status": "watching",
        "message": f"'{payload.company_name}' added to ACTIVE WATCH. "
                   f"Trigger: {payload.trigger_type}.",
    }


@router.get("/{supplier_id}")
async def get_monitored_positions(supplier_id: str):
    """List all Monitored Positions for a supplier."""
    positions = db.get_monitored_positions(supplier_id)
    return {"positions": positions, "count": len(positions)}


@router.post("/scan/{supplier_id}")
async def scan_positions(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """
    Actively scan all Monitored Positions for this supplier.
    Uses Gemini grounding to check for trigger events.
    """
    await check_and_increment(x_session_id)

    positions = db.get_monitored_positions(supplier_id)
    if not positions:
        return {"message": "No positions in Active Watch", "surfaced": []}

    kb = db.get_knowledge_base(supplier_id)
    surfaced = await scan_for_triggers(positions, kb)

    for s in surfaced:
        db.surface_monitored_position(s["position_id"], s["reason"])

    return {
        "scanned": len(positions),
        "surfaced": surfaced,
        "still_watching": len(positions) - len(surfaced),
    }
