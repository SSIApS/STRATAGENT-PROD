"""
STRATAGENT -- Knowledge Base Router
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
from agents.research_agent import analyze_product_visuals

router = APIRouter()


async def _bg_synthesise(supplier_id: str, trigger_content: str, trigger_type: str):
    """Shared background synthesis helper for KB router endpoints."""
    from routers.stratalyst import _background_synthesise
    await _background_synthesise(supplier_id, trigger_content, trigger_type)


# -- Intelligence Depth helpers --------------------------------------------------
# Element weights mirror WEIGHTS in agents/extraction_agent.py:score_intelligence_depth.
# Duplicated (read-only) here so gap identification can compare each element's
# score to its max. Keep in sync if the scoring model changes.
_ELEMENT_MAX = {
    "product_catalogue":       20,
    "technical_datasheets":    15,
    "certifications":          10,
    "case_studies":            20,
    "competitive_positioning": 10,
    "pricing_framework":        8,
    "distribution_channels":   12,
    "reference_projects":      10,
    "objections_responses":     5,
}

_ELEMENT_LABELS = {
    "product_catalogue":       "Product Catalogue",
    "technical_datasheets":    "Technical Datasheets",
    "certifications":          "Certifications",
    "case_studies":            "Case Studies",
    "competitive_positioning": "Competitive Positioning",
    "pricing_framework":       "Pricing Framework",
    "distribution_channels":   "Distribution Channels",
    "reference_projects":      "Reference Projects",
    "objections_responses":    "Objections & Responses",
}


def _threshold_label(total: float) -> str:
    """Map a total Intelligence Depth score (0-100) to its readiness label.
    Mirrors _depth_label in agents/strategist_agent.py -- keep both in sync."""
    if total >= 90:
        return "SINGULARITY READY"
    if total >= 80:
        return "PROPOSAL READY"
    if total >= 50:
        return "VALUE BRIEF READY"
    return "INTELLIGENCE GAP"


def _identify_gaps(scores: dict) -> list:
    """Return the weakest-scoring KB elements (below 40% of their max weight),
    weakest-ratio first, so the UI can prompt on what to fill in next."""
    gaps = []
    for key, max_weight in _ELEMENT_MAX.items():
        score = scores.get(key, 0) or 0
        if score < max_weight * 0.4:
            gaps.append({
                "element": key,
                "label": _ELEMENT_LABELS.get(key, key.replace("_", " ").title()),
                "score": round(score, 1),
                "max": max_weight,
            })
    gaps.sort(key=lambda g: (g["score"] / g["max"]) if g["max"] else 0)
    return gaps


def _newly_unlocked(old_total: float, new_total: float) -> list:
    """Return readiness labels crossed when total moved from old_total to new_total."""
    thresholds = [
        (50, "VALUE BRIEF READY"),
        (80, "PROPOSAL READY"),
        (90, "SINGULARITY READY"),
    ]
    return [label for value, label in thresholds if old_total < value <= new_total]


def _check_monitored_positions(supplier_id: str, scores: dict, total: float):
    """Re-evaluate this supplier's watching Monitored Positions after a KB update.
    Surfaces positions whose 'document' trigger fires on any new upload, or whose
    'threshold' trigger's target Intelligence Depth has now been reached."""
    try:
        positions = db.get_monitored_positions(supplier_id)
    except Exception:
        return
    for position in positions:
        trigger = position.get("trigger", {}) or {}
        ttype = trigger.get("type")
        position_id = position.get("id") or position.get("position_id")
        if not position_id:
            continue
        if ttype == "document":
            db.surface_monitored_position(
                position_id,
                "New document uploaded to the Knowledge Base."
            )
        elif ttype == "threshold":
            try:
                target = float(trigger.get("value", 0))
            except (TypeError, ValueError):
                continue
            if total >= target:
                db.surface_monitored_position(
                    position_id,
                    f"Intelligence Depth reached {round(total)} (target {round(target)})."
                )


class SupplierCreate(BaseModel):
    company_name: str
    website_url: Optional[str] = None
    supplier_location: Optional[str] = None  # "City, State, Country" -- anchors all geo-aware research
    # Manual seed fields -- set by Jason, take precedence over AI inference
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

    # Duplicate guard -- check before consuming an action
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

    # Build manual seed from Jason's direct input -- this anchors all future AI work
    manual_seed = {}
    if payload.product_plain: manual_seed["product_plain"] = payload.product_plain.strip()
    if payload.buyer_type:    manual_seed["buyer_type"]    = payload.buyer_type.strip()
    if payload.use_case:      manual_seed["use_case"]      = payload.use_case.strip()
    if payload.not_this:      manual_seed["not_this"]      = payload.not_this.strip()

    # Resolve supplier location: manual input beats web-extracted
    supplier_location = (
        payload.supplier_location.strip()
        if payload.supplier_location
        else (profile or {}).get("supplier_location", "")
    )

    kb_data = {
        "supplier_id": supplier_id,
        "company_name": payload.company_name,
        "website_url": payload.website_url,
        "supplier_location": supplier_location,
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
        if not value:
            continue
        existing = profile.get(key, "")
        if not existing:
            profile[key] = value          # fill empty field
        elif str(value).strip() not in str(existing):
            profile[key] = str(existing).rstrip() + "\n\n" + str(value)  # append new content

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


@router.patch("/{supplier_id}/profile-fields")
async def patch_profile_fields(
    supplier_id: str,
    fields: dict,
):
    """Directly update one or more profile fields and re-score. Used by Quick Fill panel."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    ALLOWED = {
        "product_catalogue", "technical_datasheets", "certifications",
        "case_studies", "competitive_positioning", "pricing_framework",
        "distribution_channels", "reference_projects", "objections_responses",
    }
    # Top-level KB fields -- stored directly on KB doc, not inside kb.profile
    TOP_LEVEL = {"supplier_location", "website_url"}

    top_updates = {}
    profile = kb.get("profile", {})
    for key, value in fields.items():
        if key in TOP_LEVEL and isinstance(value, str):
            top_updates[key] = value.strip()
        elif key in ALLOWED and isinstance(value, str):
            profile[key] = value  # direct overwrite -- user owns this content

    scores = score_intelligence_depth(profile)
    total = sum(scores.values())
    save_payload = {
        "profile": profile,
        "intelligence_depth": {"scores": scores, "total": total},
    }
    save_payload.update(top_updates)
    db.save_knowledge_base(supplier_id, save_payload)
    return {
        "supplier_id": supplier_id,
        "intelligence_depth": {"scores": scores, "total": total},
        "threshold_status": _threshold_label(total),
        "gaps": _identify_gaps(scores),
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
    if url and not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    db.save_knowledge_base(supplier_id, {"website_url": url})
    # Auto-crawl the site -- no need to click Deep Scan separately
    if url:
        background_tasks.add_task(_bg_deep_scan, supplier_id, url)
    return {"supplier_id": supplier_id, "website_url": url, "scan_triggered": bool(url)}


async def _bg_deep_scan(supplier_id: str, website_url: str):
    """Background deep scan -- triggered automatically when website URL is set."""
    try:
        from agents.stratalyst_agent import crawl_supplier_website, propose_seed_from_profile
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
        # Propose a draft seed if none is set yet
        if not kb.get("manual_seed", {}).get("product_plain"):
            draft = await propose_seed_from_profile(
                company_name=kb["company_name"],
                profile=profile,
                website_url=website_url,
            )
            if draft.get("product_plain"):
                db.save_knowledge_base(supplier_id, {"draft_seed": draft})
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

    # Firestore document limit is 1 MB. Base64 adds ~33% overhead.
    # Auto-resize if image would exceed safe limit (~700 KB original).
    FIRESTORE_SAFE_BYTES = 700 * 1024
    if len(content) > FIRESTORE_SAFE_BYTES:
        try:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(content))
            # Resize to max 1200px wide, preserving aspect ratio
            max_w = 1200
            if img.width > max_w:
                ratio = max_w / img.width
                img = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)
            buf = io.BytesIO()
            fmt = "PNG" if file.content_type == "image/png" else "JPEG"
            img.save(buf, format=fmt, optimize=True, quality=82)
            content = buf.getvalue()
        except ImportError:
            # Pillow not installed -- enforce hard size limit
            raise HTTPException(
                status_code=400,
                detail=f"Image is too large for storage ({len(content)//1024} KB). Please resize to under 700 KB and re-upload."
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not process image: {e}")

    image_id = str(uuid.uuid4())
    encoded = base64.b64encode(content).decode("utf-8")

    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

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


@router.delete("/{supplier_id}/images/{image_id}")
async def delete_product_image(supplier_id: str, image_id: str):
    """Remove a tagged product image (e.g. to clear out duplicates)."""
    images = db.get_product_images(supplier_id)
    img = next((i for i in images if i.get("id") == image_id), None)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    db.delete_product_image(image_id)
    return {"status": "deleted", "image_id": image_id}


class VisualAnalysisRequest(BaseModel):
    competitor_context: Optional[str] = ""
    force_rerun: bool = False  # bypass cached result and re-analyze
    selected_image_ids: Optional[list] = None  # if provided, analyse only these image IDs
    # Optional free-text description of known competitors / market context
    # to help Gemini calibrate the comparison.
    # Example: "Main competitors: Persy Prints (Etsy), GalacticPaws (Redbubble)"


@router.post("/{supplier_id}/visual-analysis")
async def run_visual_analysis(
    supplier_id: str,
    payload: VisualAnalysisRequest,
    x_session_id: str = Header(...),
):
    """
    Run a deep visual quality and competitive comparison analysis against
    all stored product images for this supplier.

    Gemini visually assesses:
    - Art style, technique, print quality indicators
    - Where the product sits vs competitors (commodity to premium tier)
    - Commercial appeal for gift, wall art, collector, and retail contexts
    - Channel aesthetic fit for Etsy, POD platforms, Amazon, specialty retail
    - Generates a marketing-ready product description paragraph

    Requires at least one uploaded product image.
    Use POST /{supplier_id}/images/upload to add images first.
    """
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    stored_images = db.get_product_images(supplier_id)
    if not stored_images:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No product images found for this supplier. "
                           "Upload at least one image using POST /images/upload first.",
                "supplier_id": supplier_id,
            }
        )

    # Filter to selected images if caller specified; otherwise use all (up to 5)
    if payload.selected_image_ids:
        sel = set(payload.selected_image_ids)
        filtered = [
            img for img in stored_images
            if (img.get("image_id") or img.get("id", "")) in sel
        ]
    else:
        filtered = stored_images

    images = [
        {"data": img["data"], "mime_type": img.get("content_type", "image/jpeg")}
        for img in filtered[:5]
        if img.get("data")
    ]

    if not images:
        raise HTTPException(
            status_code=400,
            detail="Stored images have no data. Please re-upload product images."
        )

    # Return cached result unless force_rerun requested
    import time as _time
    cached_at = kb.get("visual_analysis_at")
    if cached_at and not payload.force_rerun:
        cached = kb.get("visual_analysis")
        if cached:
            return {
                "supplier_id":   supplier_id,
                "supplier_name": kb.get("company_name", ""),
                "images_used":   len(images),
                "analysis":      cached,
                "cached":        True,
                "analyzed_at":   cached_at,
            }

    try:
        result = await analyze_product_visuals(
            images=images,
            supplier_kb=kb,
            competitor_context=payload.competitor_context or "",
        )
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"Visual analysis error: {str(exc)[:300]}",
                "traceback": tb[-800:],
            }
        ) from exc

    # Persist result to KB so FI and future requests can use it without re-running
    db.save_kb_analysis(supplier_id, "visual_analysis", result)
    db.save_knowledge_base(supplier_id, {"visual_analysis_images_used": len(images)})

    return {
        "supplier_id":   supplier_id,
        "supplier_name": kb.get("company_name", ""),
        "images_used":   len(images),
        "analysis":      result,
        "cached":        False,
        "analyzed_at":   _time.time(),
    }


class ChannelBriefRequest(BaseModel):
    visual_analysis: Optional[dict] = None
    # Full analysis dict from POST /{supplier_id}/visual-analysis response
    scan_result: Optional[dict] = None
    # Full result dict from POST /stratagora/product-scan/{supplier_id} response


@router.post("/{supplier_id}/channel-brief")
async def generate_channel_brief(
    supplier_id: str,
    payload: ChannelBriefRequest,
    x_session_id: str = Header(...),
):
    """
    Synthesise a 1-page channel strategy brief from visual analysis + market scan data.
    Gemini combines quality tier, saturation scores, and open channels into a concrete
    launch plan: which channels, what angle, what to do first.
    """
    await check_and_increment(x_session_id)

    from services.gemini import generate

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    supplier_name = kb.get("company_name", "Unknown Supplier")
    seed = kb.get("manual_seed") or {}
    product_plain = seed.get("product_plain") or (kb.get("profile") or {}).get("product_catalogue", "")

    # Build context blocks from whatever data was passed in
    visual_block = ""
    if payload.visual_analysis:
        a = payload.visual_analysis
        qi = a.get("quality_indicators") or {}
        cp = a.get("competitive_position") or {}
        visual_block = f"""
VISUAL QUALITY ASSESSMENT:
- Competitive tier: {cp.get("tier", "unknown")}
- Overall quality score: {qi.get("overall_quality", "N/A")}/100
- Print clarity: {qi.get("print_clarity", "N/A")}, Color richness: {qi.get("color_richness", "N/A")}
- Key differentiators: {", ".join(cp.get("differentiators") or []) or "none identified"}
- Watch points: {", ".join(cp.get("weaknesses") or []) or "none identified"}
- Current marketing description: {a.get("marketing_description", "not available")}
- Quality verdict: {a.get("quality_verdict", "")}
- Recommended positioning: {a.get("recommended_positioning", "")}
"""

    scan_block = ""
    if payload.scan_result:
        sr = payload.scan_result
        sat = sr.get("saturation_by_channel") or {}
        open_ch = sr.get("open_channels") or []
        signals = sr.get("top_signals") or []
        _sat_parts = []
        for ch, score in sorted(sat.items(), key=lambda x: x[1]):
            level = "HIGH -- crowded" if score >= 70 else ("MEDIUM" if score >= 50 else "LOW -- open opportunity")
            _sat_parts.append(f"  - {ch}: {score}/100 saturation ({level})")
        sat_lines = chr(10).join(_sat_parts)
        _opp_parts = [
            f"  - {s['channel']}: {s['headline']}"
            for s in signals if s.get("signal_type") == "CHANNEL_OPPORTUNITY"
        ]
        opp_lines = chr(10).join(_opp_parts) if _opp_parts else "  (none found)"
        NL = chr(10)
        open_ch_str = ", ".join(open_ch) if open_ch else "none -- all channels saturated"
        scan_block = (
            NL + "MARKET SCAN DATA:" + NL
            + f"- Open channels (saturation <50): {open_ch_str}" + NL
            + "- Saturation by channel:" + NL
            + sat_lines + NL
            + "- Channel opportunities:" + NL
            + opp_lines + NL
        )

    prompt = f"""You are a specialist channel strategist for consumer/retail products.

Supplier: {supplier_name}
Product: {product_plain}
{visual_block}
{scan_block}

Generate a CHANNEL STRATEGY BRIEF with these exact sections:

## STRATEGIC POSITION
One paragraph. Where does this product sit in the market? What is its honest competitive edge based on the quality data?

## RECOMMENDED LAUNCH CHANNELS (top 3)
For each channel: name, why it fits (specific to this product and quality tier), saturation risk level, and the one thing to get right on entry.

## VISUAL POSITIONING ANGLE
How should this product be positioned visually and in copy? What is the specific angle that turns the product's quality tier into a sales advantage?

## FIRST MOVE
Concrete: what is the single first action? Which channel, what format, what message.

## WHAT TO AVOID
Two or three specific risks to sidestep given the market scan data.

Be direct and specific. No generic advice. Base every claim on the data provided above."""

    try:
        brief_text = await generate(prompt, temperature=0.3)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Brief generation failed: {e}")

    return {
        "supplier_id":   supplier_id,
        "supplier_name": supplier_name,
        "product":       product_plain,
        "brief":         brief_text,
        "has_visual":    payload.visual_analysis is not None,
        "has_scan":      payload.scan_result is not None,
    }



# ---------------------------------------------------------------------------
# Visual Intelligence Client Report
# ---------------------------------------------------------------------------

from fastapi.responses import HTMLResponse


def _score_bar_html(label: str, value: int, max_val: int = 10) -> str:
    """Render one score row as HTML."""
    pct = int((value / max_val) * 100)
    if pct >= 75:
        color = "#10b981"
    elif pct >= 50:
        color = "#f59e0b"
    else:
        color = "#ef4444"
    return f"""
      <div class="score-row">
        <span class="score-label">{label}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:{pct}%; background:{color}"></div>
        </div>
        <span class="score-val" style="color:{color}">{value}</span>
      </div>"""


def _fit_badge(fit: str) -> str:
    colors = {"high": "#10b981", "medium": "#f59e0b", "low": "#ef4444"}
    c = colors.get(fit, "#94a3b8")
    return f'<span class="fit-badge" style="color:{c};border-color:{c}">{fit.upper()}</span>'


def _tier_style(tier: str) -> tuple:
    """Return (bg, color, label) for a tier string."""
    mapping = {
        "premium":        ("#fffbeb", "#92400e", "PREMIUM"),
        "above_average":  ("#ecfdf5", "#065f46", "ABOVE AVERAGE"),
        "market_average": ("#f1f5f9", "#334155", "MARKET AVERAGE"),
        "below_average":  ("#fff7ed", "#9a3412", "BELOW AVERAGE"),
        "commodity":      ("#fef2f2", "#991b1b", "COMMODITY"),
    }
    return mapping.get(tier, mapping["market_average"])


def _build_visual_report_html(kb: dict, analysis: dict, image_data: str | None,
                               image_mime: str, analyzed_at: float | None) -> str:
    """Build a complete standalone HTML report from visual analysis data."""
    import time as _time

    company    = kb.get("company_name", "Supplier")
    location   = kb.get("supplier_location", "")
    website    = kb.get("website_url", "")
    report_date = _time.strftime("%B %d, %Y") if not analyzed_at \
                  else _time.strftime("%B %d, %Y", _time.localtime(analyzed_at))

    qi = analysis.get("quality_indicators", {})
    cp = analysis.get("competitive_position", {})
    ca = analysis.get("commercial_appeal", {})
    cf = analysis.get("channel_aesthetic_fit", {})

    tier_bg, tier_color, tier_label = _tier_style(cp.get("tier", "market_average"))

    # Quality score bars
    quality_bars = ""
    for label, key in [
        ("Print Clarity",    "print_clarity"),
        ("Color Richness",   "color_richness"),
        ("Composition",      "composition_score"),
        ("Production Value", "production_value"),
        ("Overall Quality",  "overall_quality"),
    ]:
        v = qi.get(key)
        if v is not None:
            quality_bars += _score_bar_html(label, int(v))

    # Appeal score bars
    appeal_bars = ""
    for label, key in [
        ("Gift Potential",    "gift_potential"),
        ("Wall Art Appeal",   "wall_art_appeal"),
        ("Collector Appeal",  "collector_appeal"),
        ("Retail Display",    "retail_display_impact"),
    ]:
        v = ca.get(key)
        if v is not None:
            appeal_bars += _score_bar_html(label, int(v))

    # Differentiators
    diffs_html = ""
    for d in (cp.get("differentiators") or []):
        diffs_html += f'<li class="strength-item"><span class="bullet-green">+</span>{d}</li>'

    # Watch points
    watch_html = ""
    for w in (cp.get("weaknesses") or []):
        watch_html += f'<li class="watch-item"><span class="bullet-amber">!</span>{w}</li>'

    # Channel fit table
    channel_rows = ""
    channel_names = {
        "etsy":               "Etsy",
        "redbubble_society6": "Redbubble / Society6",
        "amazon":             "Amazon",
        "specialty_retail":   "Specialty Retail",
        "social_commerce":    "Social Commerce",
    }
    for key, name in channel_names.items():
        ch = cf.get(key, {})
        if ch:
            fit   = ch.get("fit", "")
            reason = ch.get("reason", "")
            channel_rows += f"""
      <tr>
        <td class="ch-name">{name}</td>
        <td class="ch-fit">{_fit_badge(fit)}</td>
        <td class="ch-reason">{reason}</td>
      </tr>"""

    # Competitive comparisons
    comp_rows = ""
    comp_map = {
        "vs_pod_platforms": "vs POD Platforms (Redbubble / Society6 avg)",
        "vs_etsy_artisan":  "vs Top Etsy Artisan Sellers",
        "vs_licensed_novelty": "vs Licensed Novelty (Hot Topic tier)",
    }
    for key, label in comp_map.items():
        val = cp.get(key)
        if val:
            comp_rows += f'<tr><td class="comp-label">{label}</td><td class="comp-val">{val}</td></tr>'

    # Product image block
    img_html = ""
    if image_data:
        img_html = f'<img class="product-img" src="data:{image_mime};base64,{image_data}" alt="Product image" />'

    loc_line = f'<div class="meta-line">{location}</div>' if location else ""
    web_line = f'<div class="meta-line"><a href="{website}">{website}</a></div>' if website else ""
    verdict  = analysis.get("quality_verdict", "")
    marketing = analysis.get("marketing_description", "")
    positioning = analysis.get("recommended_positioning", "")
    quality_notes = qi.get("quality_notes", "")
    appeal_notes  = ca.get("notes", "")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Visual Intelligence Report — {company}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap');
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #ffffff;
    color: #0f172a;
    font-size: 13px;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  a {{ color: #0ea5e9; text-decoration: none; }}

  /* ---- Layout ---- */
  .page {{ max-width: 900px; margin: 0 auto; padding: 48px 48px 72px; }}
  @media print {{
    .page {{ padding: 0; }}
    .no-print {{ display: none !important; }}
    body {{ font-size: 11px; }}
  }}

  /* ---- Header ---- */
  .report-header {{
    border-bottom: 3px solid #0f172a;
    padding-bottom: 24px;
    margin-bottom: 36px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }}
  .brand-name {{
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #64748b;
  }}
  .brand-sub {{
    font-size: 9px;
    letter-spacing: 0.15em;
    color: #94a3b8;
    margin-top: 2px;
  }}
  .report-title {{
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -0.02em;
    color: #0f172a;
    margin-bottom: 4px;
  }}
  .report-meta {{
    font-size: 11px;
    color: #64748b;
  }}
  .meta-line {{ color: #64748b; font-size: 11px; margin-top: 1px; }}

  /* ---- Tier badge ---- */
  .tier-block {{
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-radius: 6px;
    margin-bottom: 28px;
    background: {tier_bg};
  }}
  .tier-badge {{
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.15em;
    color: {tier_color};
  }}
  .tier-sub {{ font-size: 11px; color: #64748b; }}

  /* ---- Two-column intro ---- */
  .intro-grid {{
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 32px;
    margin-bottom: 36px;
    align-items: start;
  }}
  .product-img {{
    width: 220px;
    height: 220px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }}
  .verdict {{
    font-size: 13px;
    font-style: italic;
    color: #475569;
    margin-bottom: 16px;
    padding-left: 12px;
    border-left: 3px solid #e2e8f0;
  }}
  .marketing-box {{
    background: #f8fafc;
    border-left: 3px solid #f59e0b;
    padding: 16px 18px;
    border-radius: 0 6px 6px 0;
    margin-bottom: 16px;
  }}
  .box-title {{
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #f59e0b;
    margin-bottom: 8px;
  }}
  .marketing-text {{
    font-size: 13px;
    line-height: 1.7;
    color: #1e293b;
  }}
  .positioning-box {{
    background: #f0f9ff;
    border-left: 3px solid #0ea5e9;
    padding: 16px 18px;
    border-radius: 0 6px 6px 0;
    margin-top: 16px;
  }}
  .positioning-text {{
    font-size: 12px;
    line-height: 1.7;
    color: #1e293b;
  }}

  /* ---- Section ---- */
  .section {{ margin-bottom: 32px; }}
  .section-title {{
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 14px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f1f5f9;
  }}
  .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }}

  /* ---- Score bars ---- */
  .score-row {{
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }}
  .score-label {{ width: 130px; font-size: 12px; color: #475569; flex-shrink: 0; }}
  .bar-track {{
    flex: 1;
    height: 5px;
    background: #e2e8f0;
    border-radius: 9999px;
    overflow: hidden;
  }}
  .bar-fill {{ height: 100%; border-radius: 9999px; }}
  .score-val {{ width: 24px; text-align: right; font-size: 12px; font-weight: 600; }}

  /* ---- Strengths / Watch ---- */
  ul.item-list {{ list-style: none; padding: 0; }}
  .strength-item, .watch-item {{
    font-size: 12px;
    line-height: 1.6;
    color: #1e293b;
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    align-items: flex-start;
  }}
  .bullet-green {{ color: #10b981; font-weight: 700; flex-shrink: 0; }}
  .bullet-amber  {{ color: #f59e0b; font-weight: 700; flex-shrink: 0; }}

  /* ---- Channel fit table ---- */
  table.channel-table {{ width: 100%; border-collapse: collapse; }}
  .channel-table th {{
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #94a3b8;
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid #e2e8f0;
  }}
  .channel-table td {{ padding: 10px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
  .ch-name {{ font-size: 12px; font-weight: 600; color: #1e293b; width: 180px; }}
  .ch-fit  {{ width: 80px; }}
  .ch-reason {{ font-size: 12px; color: #475569; }}
  .fit-badge {{
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    border: 1px solid;
    border-radius: 4px;
    padding: 2px 7px;
  }}

  /* ---- Competitive comparison ---- */
  table.comp-table {{ width: 100%; border-collapse: collapse; }}
  .comp-table td {{ padding: 10px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; vertical-align: top; }}
  .comp-label {{ color: #64748b; width: 280px; font-size: 11px; font-style: italic; }}
  .comp-val   {{ color: #1e293b; }}

  /* ---- Notes ---- */
  .notes-text {{ font-size: 12px; color: #475569; line-height: 1.7; }}

  /* ---- Footer ---- */
  .report-footer {{
    margin-top: 56px;
    padding-top: 18px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }}
  .footer-brand {{ font-size: 9px; font-weight: 700; letter-spacing: 0.2em; color: #94a3b8; text-transform: uppercase; }}
  .footer-date  {{ font-size: 10px; color: #94a3b8; }}
  .footer-conf  {{ font-size: 9px; color: #cbd5e1; text-align: right; }}

  /* ---- Print button ---- */
  .print-btn {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #0f172a;
    color: #f59e0b;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.04em;
    margin-bottom: 32px;
    font-family: inherit;
  }}
  .print-btn:hover {{ background: #1e293b; }}
</style>
</head>
<body>
<div class="page">

  <!-- Print button (screen only) -->
  <button class="print-btn no-print" onclick="window.print()">
    &#x2193;&nbsp; Save as PDF &nbsp;·&nbsp; Ctrl+P / ⌘P
  </button>

  <!-- Header -->
  <div class="report-header">
    <div>
      <div class="report-title">Visual Intelligence Report</div>
      <div class="report-meta">{company}</div>
      {loc_line}
      {web_line}
    </div>
    <div style="text-align:right">
      <div class="brand-name">Strategic Sales International</div>
      <div class="brand-sub">STRATAGENT · Visual Intelligence</div>
      <div class="footer-date" style="margin-top:6px">{report_date}</div>
    </div>
  </div>

  <!-- Tier badge -->
  <div class="tier-block">
    <span class="tier-badge">{tier_label}</span>
    <span class="tier-sub">Competitive Market Position</span>
  </div>

  <!-- Intro grid: copy left, image right -->
  <div class="intro-grid">
    <div>
      {f'<p class="verdict">{verdict}</p>' if verdict else ""}
      {f'<div class="marketing-box"><div class="box-title">Marketing Description</div><p class="marketing-text">{marketing}</p></div>' if marketing else ""}
      {f'<div class="positioning-box"><div class="box-title" style="color:#0ea5e9">Recommended Positioning</div><p class="positioning-text">{positioning}</p></div>' if positioning else ""}
    </div>
    <div>
      {img_html}
    </div>
  </div>

  <!-- Quality + Appeal scores (two column) -->
  <div class="section two-col">
    <div>
      <div class="section-title">Quality Indicators</div>
      {quality_bars}
      {f'<p class="notes-text" style="margin-top:12px">{quality_notes}</p>' if quality_notes else ""}
    </div>
    <div>
      <div class="section-title">Commercial Appeal</div>
      {appeal_bars}
      {f'<p class="notes-text" style="margin-top:12px">{appeal_notes}</p>' if appeal_notes else ""}
    </div>
  </div>

  <!-- Strengths / Watch points -->
  {f'''<div class="section two-col">
    <div>
      <div class="section-title">Competitive Strengths</div>
      <ul class="item-list">{diffs_html}</ul>
    </div>
    <div>
      <div class="section-title">Watch Points</div>
      <ul class="item-list">{watch_html}</ul>
    </div>
  </div>''' if diffs_html or watch_html else ""}

  <!-- Competitive comparisons -->
  {f'''<div class="section">
    <div class="section-title">Competitive Benchmarks</div>
    <table class="comp-table"><tbody>{comp_rows}</tbody></table>
  </div>''' if comp_rows else ""}

  <!-- Channel fit -->
  {f'''<div class="section">
    <div class="section-title">Channel Aesthetic Fit</div>
    <table class="channel-table">
      <thead><tr>
        <th>Channel</th><th>Fit</th><th>Assessment</th>
      </tr></thead>
      <tbody>{channel_rows}</tbody>
    </table>
  </div>''' if channel_rows else ""}

  <!-- Footer -->
  <div class="report-footer">
    <div>
      <div class="footer-brand">Strategic Sales International ApS</div>
      <div class="footer-date">STRATAGENT Visual Intelligence · {report_date}</div>
    </div>
    <div class="footer-conf">Prepared for client review.<br>Confidential.</div>
  </div>

</div>
</body>
</html>"""


@router.get("/{supplier_id}/visual-report", response_class=HTMLResponse)
async def get_visual_report(supplier_id: str):
    """
    Generate a printable HTML Visual Intelligence Report for a supplier.
    Opens directly in the browser -- user can print to PDF.
    Uses the most recently saved visual analysis from the KB.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    analysis = kb.get("visual_analysis")
    if not analysis:
        raise HTTPException(
            status_code=400,
            detail="No visual analysis found. Run Visual Intelligence analysis first."
        )

    analyzed_at = kb.get("visual_analysis_at")

    # Fetch first available product image for the report
    image_data = None
    image_mime = "image/jpeg"
    try:
        images = db.get_product_images(supplier_id)
        if images:
            first = images[0]
            image_data = first.get("data")
            image_mime = first.get("content_type", "image/jpeg")
    except Exception:
        pass

    html = _build_visual_report_html(kb, analysis, image_data, image_mime, analyzed_at)
    return HTMLResponse(content=html, status_code=200)
