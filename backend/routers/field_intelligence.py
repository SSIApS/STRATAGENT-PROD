"""
STRATAGENT -- Field Intelligence Router
Prospect research, Relationship Profiles, and Convergence Index.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
import time
import uuid

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.research_agent import research_prospect, find_alternative_prospects
from agents.stratalink_agent import match_affiliates_to_prospect

router = APIRouter()


class ProspectResearchRequest(BaseModel):
    supplier_id: str
    company_name: str


async def _execute_research(supplier_id: str, company_name: str, x_session_id: str, queue_entry_id: str = None):
    """Core research flow, shared by /research and the retry-queue endpoint.

    On a Gemini/transient failure, instead of letting the exception bubble up
    and lose the request, we persist it to the pending_research queue so the
    user can retry with one click later -- nothing typed is lost.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    intel_total = kb.get("intelligence_depth", {}).get("total", 0)
    if intel_total < 50:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "INTELLIGENCE GAP -- Knowledge Base below 50%. Build supplier intelligence before researching prospects.",
                "intelligence_depth": intel_total,
                "required": 50,
            }
        )

    try:
        profile = await research_prospect(company_name, kb)
    except Exception as e:
        # Save (or update) the queue entry so this attempt isn't lost.
        entry_id = queue_entry_id or str(uuid.uuid4())
        existing = db.get_pending_research(entry_id) if queue_entry_id else None
        first_requested_at = existing.get("requested_at") if existing else None
        db.save_pending_research(entry_id, {
            "supplier_id": supplier_id,
            "company_name": company_name,
            "status": "failed",
            "error": str(e),
            "requested_at": first_requested_at or time.time(),
            "last_attempt_at": time.time(),
        })
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Research failed -- likely a temporary AI service overload (503 high demand). "
                           "Your request has been saved to the Retry Queue below -- you can retry it with one click once things settle.",
                "queue_entry_id": entry_id,
                "error": str(e),
            },
        )

    score = profile.get("convergence_index", {}).get("score", 0)

    profile_id = str(uuid.uuid4())
    db.save_relationship_profile(profile_id, {
        "profile_id": profile_id,
        "supplier_id": supplier_id,
        "company_name": company_name,
        "profile": profile,
        "convergence_index": score,
        "recommended_path": profile.get("recommended_path", "PARK"),
        "watch_status": "active" if score >= 60 else "monitoring",
    })

    # Success -- clear any queue entry for this attempt.
    if queue_entry_id:
        try:
            db.delete_pending_research(queue_entry_id)
        except Exception:
            pass

    # Check affiliate library for adjacent opportunities
    adjacent_opportunities = []
    try:
        active_partners = db.list_affiliate_partners(status="active")
        if active_partners:
            adjacent_opportunities = await match_affiliates_to_prospect(profile, active_partners)
    except Exception:
        pass  # Non-blocking -- affiliate match failure never breaks FI

    response = {
        "profile_id": profile_id,
        "company_name": company_name,
        "convergence_index": score,
        "recommended_path": profile.get("recommended_path"),
        "profile": profile,
        "adjacent_opportunities": adjacent_opportunities,
    }

    # If below 60, add alternative suggestions -- profile is always shown in full
    if score < 60:
        try:
            alternatives = await find_alternative_prospects(kb, company_name)
        except Exception:
            alternatives = []
        if alternatives:
            response["honest_gate"] = (
                "CI is below 60 based on current intelligence. Review the profile above -- "
                "if the fit is real, park and watch for a buying signal. "
                "These companies may also be worth approaching in parallel."
            )
            response["alternatives"] = alternatives

    return response


@router.post("/research")
async def research(
    payload: ProspectResearchRequest,
    x_session_id: str = Header(...),
):
    """Research a prospect and produce a Relationship Profile with Convergence Index."""
    await check_and_increment(x_session_id)
    return await _execute_research(payload.supplier_id, payload.company_name, x_session_id)


@router.get("/research-queue/{supplier_id}")
async def get_research_queue(supplier_id: str):
    """List failed/queued research attempts for a supplier -- nothing is lost on a 503."""
    return db.list_pending_research(supplier_id)


@router.post("/research-queue/{entry_id}/retry")
async def retry_research_queue(entry_id: str, x_session_id: str = Header(...)):
    """Retry a saved failed research attempt using its original supplier_id + company_name."""
    entry = db.get_pending_research(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")

    await check_and_increment(x_session_id)
    return await _execute_research(
        entry["supplier_id"], entry["company_name"], x_session_id, queue_entry_id=entry_id
    )


@router.delete("/research-queue/{entry_id}")
async def dismiss_research_queue(entry_id: str):
    """Remove a queue entry without retrying (e.g. no longer relevant)."""
    db.delete_pending_research(entry_id)
    return {"status": "dismissed", "id": entry_id}


@router.get("/profiles/{supplier_id}")
async def list_profiles(supplier_id: str):
    return db.list_relationship_profiles(supplier_id)


@router.get("/profile/{profile_id}")
async def get_profile(profile_id: str):
    profile = db.get_relationship_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Relationship Profile not found")
    return profile
