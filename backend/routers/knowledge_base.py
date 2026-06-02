"""
STRATAGENT — Knowledge Base Router
Handles supplier onboarding, document ingestion, and Intelligence Depth scoring.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import uuid

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.extraction_agent import extract_from_pdf, extract_from_url, score_intelligence_depth

router = APIRouter()


class SupplierCreate(BaseModel):
    company_name: str
    website_url: Optional[str] = None


@router.post("/create")
async def create_knowledge_base(
    payload: SupplierCreate,
    x_session_id: str = Header(...),
):
    """Create a new Knowledge Base and run initial web research."""
    await check_and_increment(x_session_id)

    supplier_id = str(uuid.uuid4())

    # Run web research via Gemini grounding
    from agents.extraction_agent import research_supplier_web
    profile = await research_supplier_web(
        payload.company_name,
        payload.website_url,
    )

    scores = score_intelligence_depth(profile)

    kb_data = {
        "supplier_id": supplier_id,
        "company_name": payload.company_name,
        "website_url": payload.website_url,
        "profile": profile,
        "intelligence_depth": {
            "scores": scores,
            "total": sum(scores.values()),
        },
        "documents": [],
    }

    db.save_knowledge_base(supplier_id, kb_data)

    return {
        "supplier_id": supplier_id,
        "company_name": payload.company_name,
        "intelligence_depth": kb_data["intelligence_depth"],
        "threshold_status": _threshold_label(sum(scores.values())),
        "gaps": _identify_gaps(scores),
    }


@router.post("/{supplier_id}/upload")
async def upload_document(
    supplier_id: str,
    file: UploadFile = File(...),
    x_session_id: str = Header(...),
):
    """Upload a PDF document and extract intelligence from it."""
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF files only at this stage")

    content = await file.read()
    extracted = await extract_from_pdf(content, kb["company_name"])

    # Merge extracted intelligence into existing profile
    profile = kb.get("profile", {})
    for key, value in extracted.items():
        if value and not profile.get(key):
            profile[key] = value
        elif value and profile.get(key):
            # Append new information rather than overwrite
            profile[key] = f"{profile[key]}\n\n{value}"

    scores = score_intelligence_depth(profile)
    total = sum(scores.values())

    db.save_knowledge_base(supplier_id, {
        "profile": profile,
        "intelligence_depth": {"scores": scores, "total": total},
        "documents": kb.get("documents", []) + [file.filename],
    })

    # Check if any Monitored Positions can now be re-evaluated
    _check_monitored_positions(supplier_id, scores, total)

    return {
        "supplier_id": supplier_id,
        "document": file.filename,
        "intelligence_depth": {"scores": scores, "total": total},
        "threshold_status": _threshold_label(total),
        "newly_unlocked": _newly_unlocked(
            kb["intelligence_depth"]["total"], total
        ),
        "gaps": _identify_gaps(scores),
    }


@router.post("/{supplier_id}/add-url")
async def add_url(
    supplier_id: str,
    url: str = Form(...),
    x_session_id: str = Header(...),
):
    """Add a URL as a knowledge source."""
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    extracted = await extract_from_url(url, kb["company_name"])
    profile = kb.get("profile", {})
    for key, value in extracted.items():
        if value and not profile.get(key):
            profile[key] = value

    scores = score_intelligence_depth(profile)
    total = sum(scores.values())

    db.save_knowledge_base(supplier_id, {
        "profile": profile,
        "intelligence_depth": {"scores": scores, "total": total},
        "documents": kb.get("documents", []) + [url],
    })

    return {
        "supplier_id": supplier_id,
        "intelligence_depth": {"scores": scores, "total": total},
        "threshold_status": _threshold_label(total),
        "gaps": _identify_gaps(scores),
    }


@router.get("/{supplier_id}")
async def get_knowledge_base(supplier_id: str):
    """Retrieve a Knowledge Base."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    total = kb.get("intelligence_depth", {}).get("total", 0)
    return {
        **kb,
        "threshold_status": _threshold_label(total),
        "gaps": _identify_gaps(kb.get("intelligence_depth", {}).get("scores", {})),
    }


@router.get("/")
async def list_knowledge_bases():
    return db.list_knowledge_bases()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _threshold_label(total: float) -> dict:
    if total >= 90:
        return {"label": "SINGULARITY READY", "level": 4, "can_propose": True}
    elif total >= 80:
        return {"label": "PROPOSAL READY", "level": 3, "can_propose": True}
    elif total >= 50:
        return {"label": "VALUE BRIEF READY", "level": 2, "can_propose": False}
    else:
        return {"label": "INTELLIGENCE GAP", "level": 1, "can_propose": False}


INTELLIGENCE_WEIGHTS = {
    "product_catalogue": 20,
    "technical_datasheets": 15,
    "certifications": 10,
    "case_studies": 20,
    "competitive_positioning": 10,
    "pricing_framework": 10,
    "reference_projects": 10,
    "objections_responses": 5,
}


def _identify_gaps(scores: dict) -> list:
    gaps = []
    for element, weight in INTELLIGENCE_WEIGHTS.items():
        score = scores.get(element, 0)
        if score < weight * 0.7:
            gaps.append({
                "element": element.replace("_", " ").title(),
                "current": score,
                "target": weight,
                "impact": f"Adding this would unlock {weight - score:.0f} more depth points",
            })
    return sorted(gaps, key=lambda x: x["target"] - x["current"], reverse=True)


def _newly_unlocked(old_total: float, new_total: float) -> Optional[str]:
    thresholds = [(90, "SINGULARITY READY — full proposals now available"),
                  (80, "CONVERGENCE PROPOSAL unlocked"),
                  (50, "MUTUAL VALUE BRIEF and FIRST SIGNAL unlocked")]
    for threshold, message in thresholds:
        if old_total < threshold <= new_total:
            return message
    return None


def _check_monitored_positions(supplier_id: str, scores: dict, total: float):
    """Re-evaluate monitored positions when KB improves."""
    positions = db.get_monitored_positions(supplier_id)
    for position in positions:
        trigger = position.get("trigger", {})
        if trigger.get("type") == "threshold" and total >= trigger.get("value", 100):
            db.surface_monitored_position(
                position["id"],
                f"Knowledge Base reached {total:.0f}% Intelligence Depth"
            )
        elif trigger.get("type") == "document":
            required_element = trigger.get("element")
            if scores.get(required_element, 0) > 0:
                db.surface_monitored_position(
                    position["id"],
                    f"Required intelligence element now available: {required_element}"
                )
