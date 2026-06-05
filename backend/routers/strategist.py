"""
STRATAGENT — STRATEGIST Router
Cross-pipeline AI advisor. Monday Brief + Top 3 Actions.
"""
from fastapi import APIRouter, Header
from services import firestore as db
from services.demo_gate import check_and_increment
from agents.strategist_agent import generate_brief

router = APIRouter()


@router.get("/pipeline-snapshot")
async def get_pipeline_snapshot():
    """
    Aggregate cross-module data for the STRATEGIST.
    No AI calls — just data collection. Fast.
    """
    kbs = db.list_knowledge_bases()
    profiles = db.list_all_relationship_profiles(limit=100)
    watched = db.list_all_monitored_positions(include_dismissed=False)
    outcomes = db.list_all_outcomes(limit=30)

    # Build KB name map for profile enrichment
    kb_map = {kb["id"]: kb.get("company_name", "") for kb in kbs}
    for p in profiles:
        p["supplier_name"] = kb_map.get(p.get("supplier_id", ""), p.get("supplier_id", ""))

    return {
        "kbs": kbs,
        "kbs_count": len(kbs),
        "profiles": profiles,
        "profiles_count": len(profiles),
        "watched": watched,
        "watched_count": len(watched),
        "outcomes": outcomes,
    }


@router.post("/brief")
async def generate_monday_brief(x_session_id: str = Header(...)):
    """
    Generate the STRATEGIST Monday Brief.
    Reads all modules, calls Gemini once, returns structured brief.
    """
    await check_and_increment(x_session_id)

    # Aggregate data
    kbs = db.list_knowledge_bases()
    profiles = db.list_all_relationship_profiles(limit=100)
    watched = db.list_all_monitored_positions(include_dismissed=False)
    outcomes = db.list_all_outcomes(limit=30)

    pipeline_data = {
        "kbs": kbs,
        "profiles": profiles,
        "watched": watched,
        "outcomes": outcomes,
    }

    brief = await generate_brief(pipeline_data)
    return {"brief": brief, "generated_at": __import__("time").time()}
