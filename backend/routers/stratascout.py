"""
STRATAGENT -- STRATASCOUT Router
Proactive prospect hunting, Prospect Pool management.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import uuid, time, asyncio

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.stratascout_agent import hunt_prospects, GEOGRAPHY_ZONES

router = APIRouter()


class HuntRequest(BaseModel):
    supplier_id: str
    geography: str          # denmark | scandinavia | northern_europe | europe | global
    sector_focus: Optional[str] = ""
    count: Optional[int] = 5


@router.get("/geographies")
async def list_geographies():
    """Return available geography zones."""
    return [
        {"key": k, "label": v}
        for k, v in GEOGRAPHY_ZONES.items()
    ]


@router.post("/hunt")
async def run_hunt(payload: HuntRequest, x_session_id: str = Header(...)):
    """
    Run a STRATASCOUT hunt -- find prospects matching the supplier KB
    within the specified geography zone.
    Deposits results to the Prospect Pool.
    """
    await check_and_increment(x_session_id)

    if payload.geography not in GEOGRAPHY_ZONES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown geography '{payload.geography}'. Valid: {list(GEOGRAPHY_ZONES.keys())}"
        )

    kb = db.get_knowledge_base(payload.supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    intel_total = kb.get("intelligence_depth", {}).get("total", 0)
    if intel_total < 50:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "INTELLIGENCE GAP -- Knowledge Base below 50%. Enrich the supplier KB before hunting prospects.",
                "intelligence_depth": intel_total,
                "required": 50,
            }
        )

    HUNT_TIMEOUT_SECONDS = 120  # 2 minutes hard ceiling

    count = max(1, min(10, payload.count or 5))
    try:
        candidates = await asyncio.wait_for(
            hunt_prospects(
                kb,
                payload.geography,
                payload.sector_focus or "",
                count,
            ),
            timeout=HUNT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=408,
            detail={
                "message": f"STRATASCOUT hunt timed out after {HUNT_TIMEOUT_SECONDS}s. Try a narrower geography or add a sector focus.",
                "timeout": HUNT_TIMEOUT_SECONDS,
            }
        )
    except Exception as e:
        # Catch-all -- return the real error instead of crashing the server
        raise HTTPException(
            status_code=500,
            detail={"message": f"STRATASCOUT error: {type(e).__name__}: {str(e)}"}
        )

    deposited = []
    for c in candidates:
        pool_id = str(uuid.uuid4())
        record = {
            "pool_id":            pool_id,
            "supplier_id":        payload.supplier_id,
            "supplier_name":      kb.get("company_name", ""),
            "geography":          payload.geography,
            "sector_focus":       payload.sector_focus or "",
            "company_name":       c["company_name"],
            "country":            c["country"],
            "city":               c.get("city", ""),
            "industry":           c.get("industry", ""),
            "operational_need":   c.get("operational_need", ""),
            "discovery_signal":   c.get("discovery_signal", {}),
            "decision_maker":     c.get("decision_maker", {}),
            "estimated_ci":       c["estimated_ci"],
            "discovery_reason":   c.get("discovery_reason", ""),
            "confidence":         c.get("confidence", "MEDIUM"),
            "status":             "new",
            "discovered_at":      time.time(),
        }
        db.save_prospect_pool_entry(pool_id, record)
        deposited.append(record)

    return {
        "hunt_id":        str(uuid.uuid4()),
        "supplier_id":    payload.supplier_id,
        "supplier_name":  kb.get("company_name", ""),
        "geography":      payload.geography,
        "candidates_found": len(deposited),
        "candidates":     deposited,
    }


@router.get("/pool")
async def get_pool(supplier_id: Optional[str] = None, status: Optional[str] = None):
    """List Prospect Pool entries, optionally filtered by supplier or status."""
    entries = db.list_prospect_pool(supplier_id=supplier_id, status=status)
    return entries


@router.post("/pool/{pool_id}/promote")
async def promote_prospect(pool_id: str, x_session_id: str = Header(...)):
    """
    Promote a prospect from the pool -- marks it for full Field Intelligence run.
    Returns the supplier_id and company_name needed to trigger FI.
    """
    entry = db.get_prospect_pool_entry(pool_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Prospect Pool entry not found")

    db.update_prospect_pool_entry(pool_id, {"status": "promoted", "promoted_at": time.time()})

    return {
        "pool_id":      pool_id,
        "status":       "promoted",
        "supplier_id":  entry["supplier_id"],
        "company_name": entry["company_name"],
        "message":      f"Ready to run Field Intelligence on {entry['company_name']}. Use supplier_id and company_name to trigger /field-intelligence/research.",
    }


@router.post("/pool/{pool_id}/dismiss")
async def dismiss_prospect(pool_id: str):
    """Dismiss a prospect -- removed from active pool, logged for pattern learning."""
    entry = db.get_prospect_pool_entry(pool_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Prospect Pool entry not found")

    db.update_prospect_pool_entry(pool_id, {"status": "dismissed", "dismissed_at": time.time()})
    return {"pool_id": pool_id, "status": "dismissed"}


@router.post("/pool/{pool_id}/park")
async def park_prospect(pool_id: str):
    """Park a prospect to Active Watch without running full FI."""
    entry = db.get_prospect_pool_entry(pool_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Prospect Pool entry not found")

    watch_id = str(uuid.uuid4())
    db.save_monitored_position(watch_id, {
        "supplier_id":  entry["supplier_id"],
        "company_name": entry["company_name"],
        "profile_id":   None,
        "reason_parked": "Parked from STRATASCOUT Prospect Pool",
        "convergence_index": entry.get("estimated_ci", 0),
        "trigger": {"type": "threshold", "value": 60},
        "source": "stratascout",
    })
    db.update_prospect_pool_entry(pool_id, {"status": "parked", "watch_id": watch_id, "parked_at": time.time()})

    return {"pool_id": pool_id, "status": "parked", "watch_id": watch_id}
