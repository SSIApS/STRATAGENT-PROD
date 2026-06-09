"""
STRATAGENT -- Active Watch Router
Manages Monitored Positions and trigger-based opportunity surfacing.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import uuid

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.watch_agent import scan_for_triggers
from agents.stratadar_agent import run_full_scan, score_position

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


@router.get("/all")
async def get_all_monitored_positions(include_dismissed: bool = False):
    """List ALL Monitored Positions across all suppliers, with priority scoring."""
    positions = db.list_all_monitored_positions(include_dismissed=include_dismissed)
    scored = [score_position(p) for p in positions]
    counts = {
        "watching": sum(1 for p in scored if p["status"] == "watching"),
        "surfaced": sum(1 for p in scored if p["status"] == "surfaced"),
        "promoted": sum(1 for p in scored if p["status"] == "promoted"),
        "dismissed": sum(1 for p in scored if p["status"] == "dismissed"),
    }
    return {"positions": scored, "count": len(scored), "counts": counts}


@router.post("/scan-all")
async def scan_all_positions(x_session_id: str = Header(...)):
    """STRATADAR full scan -- checks all event triggers across all suppliers."""
    await check_and_increment(x_session_id)
    positions = db.list_all_monitored_positions()
    result = await run_full_scan(positions)
    return result


@router.post("/{position_id}/dismiss")
async def dismiss_position(position_id: str):
    """Dismiss a monitored position (remove from watch)."""
    db.dismiss_monitored_position(position_id)
    return {"status": "dismissed", "position_id": position_id}


@router.post("/{position_id}/promote")
async def promote_position(position_id: str):
    """Promote a surfaced position back to active pipeline."""
    db.promote_monitored_position(position_id)
    return {"status": "promoted", "position_id": position_id}


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
