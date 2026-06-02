"""
STRATAGENT — Output Engine Router
Graduated document generation based on Convergence Index.
Path A: CONVERGENCE PROPOSAL (90-100)
Path B: MUTUAL VALUE BRIEF (75-89)
Path C: FIRST SIGNAL (60-74)
Below 60: Honest Gate
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.output_agent import (
    generate_convergence_proposal,
    generate_mutual_value_brief,
    generate_first_signal,
)

router = APIRouter()

SSI_FOOTER = """
---
Jason L. Smith | Strategic Sales International ApS
info@strategic.dk | www.strategic-dk.com | +45 24 99 23 93
CVR: 41945621 | Roskilde, Denmark
STRATAGENT — The Intelligence Behind Agentic Sales.
"""


class GenerateRequest(BaseModel):
    profile_id: str


@router.post("/generate")
async def generate_output(
    payload: GenerateRequest,
    x_session_id: str = Header(...),
):
    """Generate the appropriate output based on Convergence Index."""
    await check_and_increment(x_session_id)

    profile_doc = db.get_relationship_profile(payload.profile_id)
    if not profile_doc:
        raise HTTPException(status_code=404, detail="Relationship Profile not found")

    kb = db.get_knowledge_base(profile_doc["supplier_id"])
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    score = profile_doc.get("convergence_index", 0)
    profile = profile_doc.get("profile", {})

    if score >= 90:
        output = await generate_convergence_proposal(profile, kb)
        path = "A"
        label = "CONVERGENCE PROPOSAL"
    elif score >= 75:
        output = await generate_mutual_value_brief(profile, kb)
        path = "B"
        label = "MUTUAL VALUE BRIEF"
    elif score >= 60:
        output = await generate_first_signal(profile, kb)
        path = "C"
        label = "FIRST SIGNAL"
    else:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "We don't know enough about this company's world to approach "
                    "them credibly yet. Park this opportunity or find a better prospect."
                ),
                "convergence_index": score,
                "minimum_required": 60,
            }
        )

    # Append SSI footer to all client-facing documents
    if "email" in output:
        output["email"] += SSI_FOOTER
    if "proposal" in output:
        output["proposal"] += SSI_FOOTER
    if "brief" in output:
        output["brief"] += SSI_FOOTER

    # Record in Outcome Memory
    db.record_outcome({
        "supplier_id": profile_doc["supplier_id"],
        "profile_id": payload.profile_id,
        "company_name": profile_doc["company_name"],
        "convergence_index": score,
        "output_path": path,
        "output_label": label,
        "status": "generated",
    })

    return {
        "path": path,
        "label": label,
        "convergence_index": score,
        "company_name": profile_doc["company_name"],
        "output": output,
    }
