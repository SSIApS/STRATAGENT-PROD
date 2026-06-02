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

    response = {
        "profile_id": profile_id,
        "company_name": payload.company_name,
        "convergence_index": score,
        "recommended_path": profile.get("recommended_path"),
        "profile": profile,
    }

    # If below 60, find alternatives
    if score < 60:
        alternatives = await find_alternative_prospects(kb, payload.company_name)
        response["honest_gate"] = (
            "We don't know enough about this company's world to approach them "
            "credibly yet. Here are stronger alternatives — or park this "
            "opportunity and we'll watch for the right moment."
        )
        response["alternatives"] = alternatives
        # Auto-park
        db.save_monitored_position(str(uuid.uuid4()), {
            "supplier_id": payload.supplier_id,
            "company_name": payload.company_name,
            "profile_id": profile_id,
            "reason_parked": "Convergence Index below 60",
            "convergence_index": score,
            "trigger": {"type": "threshold", "value": 60},
        })

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
