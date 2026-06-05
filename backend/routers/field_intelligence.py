"""
STRATAGENT — Field Intelligence Router
Prospect research, Relationship Profiles, and Convergence Index.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
import uuid

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.research_agent import research_prospect, find_alternative_prospects
from agents.stratalink_agent import match_affiliates_to_prospect

router = APIRouter()


class ProspectResearchRequest(BaseModel):
    supplier_id: str
    company_name: str


@router.post("/research")
async def research(
    payload: ProspectResearchRequest,
    x_session_id: str = Header(...),
):
    """Research a prospect and produce a Relationship Profile with Convergence Index."""
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(payload.supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    intel_total = kb.get("intelligence_depth", {}).get("total", 0)
    if intel_total < 50:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "INTELLIGENCE GAP — Knowledge Base below 50%. Build supplier intelligence before researching prospects.",
                "intelligence_depth": intel_total,
                "required": 50,
            }
        )

    profile = await research_prospect(payload.company_name, kb)
    score = profile.get("convergence_index", {}).get("score", 0)

    profile_id = str(uuid.uuid4())
    db.save_relationship_profile(profile_id, {
        "profile_id": profile_id,
        "supplier_id": payload.supplier_id,
        "company_name": payload.company_name,
        "profile": profile,
        "convergence_index": score,
        "recommended_path": profile.get("recommended_path", "PARK"),
        "watch_status": "active" if score >= 60 else "monitoring",
    })

    # Check affiliate library for adjacent opportunities
    adjacent_opportunities = []
    try:
        active_partners = db.list_affiliate_partners(status="active")
        if active_partners:
            adjacent_opportunities = await match_affiliates_to_prospect(profile, active_partners)
    except Exception:
        pass  # Non-blocking — affiliate match failure never breaks FI

    response = {
        "profile_id": profile_id,
        "company_name": payload.company_name,
        "convergence_index": score,
        "recommended_path": profile.get("recommended_path"),
        "profile": profile,
        "adjacent_opportunities": adjacent_opportunities,
    }

    # If below 60, add alternative suggestions — profile is always shown in full
    if score < 60:
        try:
            alternatives = await find_alternative_prospects(kb, payload.company_name)
        except Exception:
            alternatives = []
        if alternatives:
            response["honest_gate"] = (
                "CI is below 60 based on current intelligence. Review the profile above — "
                "if the fit is real, park and watch for a buying signal. "
                "These companies may also be worth approaching in parallel."
            )
            response["alternatives"] = alternatives

    return response


@router.get("/profiles/{supplier_id}")
async def list_profiles(supplier_id: str):
    return db.list_relationship_profiles(supplier_id)


@router.get("/profile/{profile_id}")
async def get_profile(profile_id: str):
    profile = db.get_relationship_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Relationship Profile not found")
    return profile
