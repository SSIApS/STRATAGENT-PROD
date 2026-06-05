"""
STRATAGENT — Knowledge Base Router
Handles supplier onboarding, document ingestion, and Intelligence Depth scoring.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import uuid
import base64

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.extraction_agent import extract_from_pdf, extract_from_url, score_intelligence_depth

router = APIRouter()


async def _bg_synthesise(supplier_id: str, trigger_content: str, trigger_type: str):
    """Shared background synthesis helper for KB router endpoints."""
    from routers.stratalyst import _background_synthesise
    await _background_synthesise(supplier_id, trigger_content, trigger_type)


class SupplierCreate(BaseModel):
    company_name: str
    website_url: Optional[str] = None
    # Manual seed fields — set by Jason, take precedence over AI inference
    product_plain: Optional[str] = None      # "In one sentence, what does this company sell?"
    buyer_type: Optional[str] = None         # "Who buys this?"
    use_case: Optional[str] = None           # "What do buyers use it for?"
    not_this: Optional[str] = None           # "What is this product NOT?" (prevents AI misclassification)


@router.post("/create")
async def create_knowledge_base(
    payload: SupplierCreate,
    x_session_id: str = Header(...),
):
    """Create a new Knowledge Base and run initial web research."""

    # Duplicate guard — check before consuming an action
    existing = db.list_knowledge_bases()
    for kb in existing:
        if kb.get("company_name", "").strip().lower() == payload.company_name.strip().lower():
            raise HTTPException(
                status_code=409,
                detail=f"A Knowledge Base for '{kb['company_name']}' already exists. Open it from the supplier list."
            )

    await check_and_increment(x_session_id)

    supplier_id = str(uuid.uuid4())

    # Run web research via Gemini grounding
    from agents.extraction_agent import research_supplier_web
    profile = await research_supplier_web(
        payload.company_name,
        payload.website_url,
    )

    scores = score_intelligence_depth(profile)

    # Build manual seed from Jason's direct input — this anchors all future AI work
    manual_seed = {}
    if payload.product_plain: manual_seed["product_plain"] = payload.product_plain.strip()
    if payload.buyer_type:    manual_seed["buyer_type"]    = payload.buyer_type.strip()
    if payload.use_case:      manual_seed["use_case"]      = payload.use_case.strip()
    if payload.not_this:      manual_seed["not_this"]      = payload.not_this.strip()

    kb_data = {
        "supplier_id": supplier_id,
        "company_name": payload.company_name,
        "website_url": payload.website_url,
        "manual_seed": manual_seed,
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
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    focus_element: str = Form(""),
    context_note: str = Form(""),
    x_session_id: str = Header(...),
):
    """Add a URL as a knowledge source, with optional focus element and context note."""
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    extracted = await extract_from_url(url, kb["company_name"], focus_element, context_note)
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

    # Background synthesis: cross-pollinate other profile fields from what was just ingested
    url_content = " ".join(str(v) for v in extracted.values() if v)
    background_tasks.add_task(_bg_synthesise, supplier_id, url_content[:800], "url_source")

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


@router.patch("/{supplier_id}/rename")
async def rename_knowledge_base(supplier_id: str, company_name: str = Form(...)):
    """Rename a Knowledge Base."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    db.save_knowledge_base(supplier_id, {"company_name": company_name})
    return {"supplier_id": supplier_id, "company_name": company_name}


@router.patch("/{supplier_id}/update-seed")
async def update_manual_seed(
    supplier_id: str,
    background_tasks: BackgroundTasks,
    product_plain: str = Form(""),
    buyer_type: str = Form(""),
    use_case: str = Form(""),
    not_this: str = Form(""),
):
    """Save or update the manual seed fields. Re-scores and triggers background synthesis."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    seed = {
        "product_plain": product_plain.strip(),
        "buyer_type":    buyer_type.strip(),
        "use_case":      use_case.strip(),
        "not_this":      not_this.strip(),
    }
    # Re-score immediately with updated seed context
    profile = kb.get("profile", {})
    scores = score_intelligence_depth(profile)
    total = sum(scores.values())
    db.save_knowledge_base(supplier_id, {
        "manual_seed": seed,
        "intelligence_depth": {"scores": scores, "total": total},
    })
    # Trigger background synthesis using the new seed as anchor
    seed_summary = " | ".join(filter(None, [
        product_plain.strip(),
        buyer_type.strip(),
        use_case.strip(),
    ]))
    background_tasks.add_task(_bg_synthesise, supplier_id, seed_summary, "manual_seed")
    return {
        "supplier_id": supplier_id,
        "manual_seed": seed,
        "intelligence_depth": {"scores": scores, "total": total},
        "threshold_status": _threshold_label(total),
    }


@router.patch("/{supplier_id}/update-url")
async def update_website_url(
    supplier_id: str,
    background_tasks: BackgroundTasks,
    website_url: str = Form(...),
):
    """Update the website URL. Automatically triggers a deep scan in the background."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    url = website_url.strip() or None
    db.save_knowledge_base(supplier_id, {"website_url": url})
    # Auto-crawl the site — no need to click Deep Scan separately
    if url:
        background_tasks.add_task(_bg_deep_scan, supplier_id, url)
    return {"supplier_id": supplier_id, "website_url": url, "scan_triggered": bool(url)}


async def _bg_deep_scan(supplier_id: str, website_url: str):
    """Background deep scan — triggered automatically when website URL is set."""
    try:
        from agents.stratalyst_agent import crawl_supplier_website
        from agents.extraction_agent import score_intelligence_depth
        crawl_result = await crawl_supplier_website(website_url, supplier_id, max_pages=14)
        crawled_profile = crawl_result.get("profile", {})
        if not crawled_profile:
            return
        kb = db.get_knowledge_base(supplier_id)
        if not kb:
            return
        profile = kb.get("profile", {})
        for key, value in crawled_profile.items():
            if value and isinstance(value, str):
                existing = profile.get(key, "")
                if len(value) > len(str(existing)):
                    profile[key] = value
                elif existing and value and value not in str(existing):
                    profile[key] = str(existing) + "\n\n" + value
        scores = score_intelligence_depth(profile)
        total = sum(scores.values())
        db.save_knowledge_base(supplier_id, {
            "profile": profile,
            "intelligence_depth": {"scores": scores, "total": total},
            "documents": kb.get("documents", []) + crawl_result.get("urls", []),
        })
    except Exception:
        pass


@router.get("/")
async def list_knowledge_bases():
    return db.list_knowledge_bases()


# ── Product Image endpoints ───────────────────────────────────────────────────

@router.post("/{supplier_id}/images/upload")
async def upload_product_image(
    supplier_id: str,
    file: UploadFile = File(...),
    product_name: str = Form(...),
    brand: str = Form(""),
    tags: str = Form(""),
    x_session_id: str = Header(...),
):
    """Upload an image tied to a product or brand name."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Image files only (JPEG, PNG, WebP, GIF)")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    image_id = str(uuid.uuid4())
    encoded = base64.b64encode(content).decode("utf-8")

    db.save_product_image(image_id, {
        "image_id": image_id,
        "supplier_id": supplier_id,
        "product_name": product_name,
        "brand": brand,
        "tags": tags,
        "filename": file.filename,
        "content_type": file.content_type,
        "data": encoded,
    })

    return {
        "image_id": image_id,
        "product_name": product_name,
        "brand": brand,
        "tags": tags,
        "filename": file.filename,
        "message": "Image saved and tagged successfully.",
    }


@router.get("/{supplier_id}/images")
async def list_product_images(supplier_id: str):
    """List all product images for a supplier (without binary data)."""
    images = db.get_product_images(supplier_id)
    return [
        {k: v for k, v in img.items() if k != "data"}
        for img in images
    ]


@router.get("/{supplier_id}/images/search")
async def search_product_images(supplier_id: str, q: str):
    """Search product images by product name, brand, or tags."""
    images = db.search_product_images(supplier_id, q)
    return [
        {k: v for k, v in img.items() if k != "data"}
        for img in images
    ]


@router.get("/{supplier_id}/images/{image_id}")
async def get_product_image(supplier_id: str, image_id: str):
    """Get a single image including base64 data (for rendering)."""
    images = db.get_product_images(supplier_id)
    img = next((i for i in images if i.get("id") == image_id), None)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    return img


def _threshold_label(total: float) -> dict:
    if total >= 90:
        return {"label": "SINGULARITY READY", "level": 4, "can_propose": True}
    if total >= 80:
        return {"label": "PROPOSAL READY", "level": 3, "can_propose": True}
    if total >= 50:
        return {"label": "VALUE BRIEF READY", "level": 2, "can_propose": False}
    return {"label": "INTELLIGENCE GAP", "level": 1, "can_propose": False}


def _newly_unlocked(old_total: float, new_total: float):
    thresholds = [(90, "SINGULARITY READY"), (80, "PROPOSAL READY"), (50, "VALUE BRIEF READY")]
    for threshold, label in thresholds:
        if old_total < threshold <= new_total:
            return f"New threshold reached: {label}"
    return None


def _identify_gaps(scores: dict) -> list:
    WEIGHTS = {
        "product_catalogue": 20, "technical_datasheets": 15, "certifications": 10,
        "case_studies": 20, "competitive_positioning": 10, "pricing_framework": 8,
        "distribution_channels": 12, "reference_projects": 10, "objections_responses": 5,
    }
    gaps = []
    for key, weight in WEIGHTS.items():
        score = scores.get(key, 0)
        if score < weight * 0.6:
            gaps.append({
                "element": key,
                "label": key.replace("_", " ").title(),
                "current": round(score, 1),
                "target": weight,
                "impact": f"Adding this would unlock {weight - score:.0f} more depth points",
            })
    return sorted(gaps, key=lambda x: x["target"] - x["current"], reverse=True)


def _check_monitored_positions(supplier_id: str, scores: dict, total: float):
    try:
        positions = db.get_monitored_positions(supplier_id)
        for p in positions:
            trigger = p.get("trigger", {})
            if trigger.get("type") == "threshold":
                threshold_val = float(trigger.get("value", 60))
                if total >= threshold_val:
                    db.surface_monitored_position(
                        p["id"],
                        f"KB reached {round(total)} depth -- threshold {threshold_val} met"
                    )
    except Exception:
        pass
