"""
STRATAGENT -- Field Intelligence Router
Prospect research, Relationship Profiles, and Convergence Index.
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel
import time
import uuid

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.research_agent import research_prospect, find_alternative_prospects
from agents.stratalink_agent import match_affiliates_to_prospect
from agents.synergy_agent import cross_score_prospect

router = APIRouter()


class ProspectResearchRequest(BaseModel):
    supplier_id: str
    company_name: str


async def _run_synergy_check(profile_id: str, prospect_profile: dict, primary_supplier_id: str) -> None:
    """Background task -- score the prospect against all other SSI suppliers."""
    try:
        all_kbs = db.list_knowledge_bases()
        flags = await cross_score_prospect(
            prospect_profile=prospect_profile,
            primary_supplier_id=primary_supplier_id,
            all_kbs=all_kbs,
        )
        db.save_synergy_matches(profile_id, {
            "profile_id": profile_id,
            "primary_supplier_id": primary_supplier_id,
            "prospect_name": prospect_profile.get("company_name", ""),
            "flags": flags,
            "flag_count": len(flags),
            "scored_at": time.time(),
        })
    except Exception:
        pass  # Synergy check is non-blocking -- never fails the primary FI


async def _execute_research(
    supplier_id: str,
    company_name: str,
    x_session_id: str,
    queue_entry_id: str = None,
    background_tasks: BackgroundTasks = None,
):
    """Core research flow, shared by /research and the retry-queue endpoint."""
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
                "message": "Research failed -- likely a temporary AI service overload. "
                           "Your request has been saved to the Retry Queue -- retry with one click once things settle.",
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

    # STRATAMESH -- fire cross-supplier synergy check in background (non-blocking)
    prospect_for_synergy = {**profile, "company_name": company_name}
    if background_tasks:
        background_tasks.add_task(_run_synergy_check, profile_id, prospect_for_synergy, supplier_id)

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
    background_tasks: BackgroundTasks,
    x_session_id: str = Header(...),
):
    """Research a prospect and produce a Relationship Profile with Convergence Index."""
    await check_and_increment(x_session_id)
    return await _execute_research(
        payload.supplier_id, payload.company_name, x_session_id,
        background_tasks=background_tasks,
    )


@router.get("/research-queue/{supplier_id}")
async def get_research_queue(supplier_id: str):
    """List failed/queued research attempts for a supplier."""
    return db.list_pending_research(supplier_id)


@router.post("/research-queue/{entry_id}/retry")
async def retry_research_queue(
    entry_id: str,
    background_tasks: BackgroundTasks,
    x_session_id: str = Header(...),
):
    """Retry a saved failed research attempt."""
    entry = db.get_pending_research(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Queue entry not found")
    await check_and_increment(x_session_id)
    return await _execute_research(
        entry["supplier_id"], entry["company_name"], x_session_id,
        queue_entry_id=entry_id, background_tasks=background_tasks,
    )


@router.delete("/research-queue/{entry_id}")
async def dismiss_research_queue(entry_id: str):
    """Remove a queue entry without retrying."""
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


@router.get("/synergy/{profile_id}")
async def get_synergy_flags(profile_id: str):
    """Fetch STRATAMESH cross-supplier flags for a researched prospect."""
    result = db.get_synergy_matches(profile_id)
    if not result:
        return {"profile_id": profile_id, "flags": [], "flag_count": 0, "status": "pending"}
    return result
