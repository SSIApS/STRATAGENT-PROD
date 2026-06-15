"""
STRATAGENT -- STRATALYST Router
Endpoints for the STRATALYST KB enrichment agent.

GET  /api/stratalyst/storage
  -> Returns per-supplier storage breakdown sorted by usage

POST /api/stratalyst/{supplier_id}/research-gaps
  -> Scans KB gaps, searches web, returns findings brief for user approval

POST /api/stratalyst/{supplier_id}/approve-sources
  -> Ingests approved source URLs, updates KB profile and intelligence depth
"""
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import asyncio

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.stratalyst_agent import (
    research_gaps, ingest_approved_sources, classify_human_intel,
    generate_interview_questions, synthesise_profile, build_intelligence_seed,
)
from agents.extraction_agent import score_intelligence_depth
from services.gemini import generate


def _threshold_label(total: float) -> str:
    """Map Intelligence Depth total (0-100) to readiness label."""
    if total >= 90: return "SINGULARITY READY"
    if total >= 80: return "PROPOSAL READY"
    if total >= 50: return "VALUE BRIEF READY"
    return "INTELLIGENCE GAP"


async def _background_synthesise(supplier_id: str, trigger_content: str, trigger_type: str):
    """
    Run silently after content is added.
    Synthesise new profile fields from existing content, re-score, save.
    Does not block the API response -- runs after it returns.
    """
    try:
        kb = db.get_knowledge_base(supplier_id)
        if not kb:
            return
        profile = kb.get("profile", {})
        seed = kb.get("manual_seed", {})

        improvements = await synthesise_profile(
            company_name=kb.get("company_name", ""),
            profile=profile,
            seed=seed,
            trigger_content=trigger_content,
            trigger_type=trigger_type,
        )

        if not improvements:
            return

        # Merge improvements -- only fill thin/missing fields, never overwrite good content
        for key, value in improvements.items():
            existing = str(profile.get(key) or "")
            if len(existing) < 150:  # Only improve thin fields
                profile[key] = value

        scores = score_intelligence_depth(profile)
        total = sum(scores.values())
        db.save_knowledge_base(supplier_id, {
            "profile": profile,
            "intelligence_depth": {"scores": scores, "total": total},
        })
    except Exception:
        pass  # Background -- never surface errors to user

router = APIRouter()


def _fmt(b: int) -> str:
    """Format bytes to human-readable string."""
    if b < 1024:
        return f"{b} B"
    if b < 1024 ** 2:
        return f"{b / 1024:.1f} KB"
    return f"{b / 1024 ** 2:.2f} MB"


@router.get("/storage")
async def get_storage_report():
    """
    Returns per-supplier storage usage across all Firestore collections,
    sorted largest first. Includes KB profile, product images, relationship
    profiles, and active watch positions.
    """
    stats = db.get_storage_stats()
    total_bytes = sum(s["total_bytes"] for s in stats)

    enriched = []
    for s in stats:
        enriched.append({
            **s,
            "kb_size": _fmt(s["kb_bytes"]),
            "image_size": _fmt(s["image_bytes"]),
            "profile_size": _fmt(s["profile_bytes"]),
            "watch_size": _fmt(s["watch_bytes"]),
            "total_size": _fmt(s["total_bytes"]),
            "pct_of_total": round(s["total_bytes"] / total_bytes * 100, 1) if total_bytes else 0,
        })

    return {
        "suppliers": enriched,
        "grand_total_bytes": total_bytes,
        "grand_total_size": _fmt(total_bytes),
        "supplier_count": len(stats),
    }


class ApprovedSource(BaseModel):
    url: str
    title: Optional[str] = ""
    fills_gaps: Optional[List[str]] = []


class ApproveSourcesRequest(BaseModel):
    sources: List[ApprovedSource]


@router.post("/{supplier_id}/research-gaps")
async def run_research_gaps(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """
    STRATALYST: Scan this supplier's intelligence gaps and search for sources.
    Returns a findings brief with candidate URLs and estimated depth gains.
    Does NOT consume an action -- this is a research-only call.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    current_depth = kb.get("intelligence_depth", {}).get("total", 0)
    if current_depth >= 90:
        return {
            "status": "complete",
            "message": f"{kb['company_name']} is already at SINGULARITY READY ({round(current_depth)} depth). No gaps to fill.",
            "sources": [],
        }

    gaps = kb.get("gaps", [])
    if not gaps:
        # Recalculate gaps from scores
        scores = kb.get("intelligence_depth", {}).get("scores", {})
        gaps = [
            {"element": k, "label": k.replace("_", " ").title(), "score": v}
            for k, v in scores.items()
            if v < 8
        ]

    if not gaps:
        return {
            "status": "no_gaps",
            "message": "No significant gaps found.",
            "sources": [],
        }

    findings = await research_gaps(
        company_name=kb["company_name"],
        profile=kb.get("profile", {}),
        gaps=gaps,
        website_url=kb.get("website_url"),
    )

    return {
        "status": "found",
        "supplier_id": supplier_id,
        "company_name": kb["company_name"],
        "current_depth": round(current_depth),
        **findings,
    }


@router.post("/{supplier_id}/approve-sources")
async def approve_sources(
    supplier_id: str,
    payload: ApproveSourcesRequest,
    x_session_id: str = Header(...),
):
    """
    STRATALYST: Ingest the approved source URLs into the Knowledge Base.
    Extracts intelligence from each URL, merges into profile, recalculates depth.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    if not payload.sources:
        raise HTTPException(status_code=400, detail="No sources provided.")

    sources_data = [s.dict() for s in payload.sources]

    result = await ingest_approved_sources(
        supplier_id=supplier_id,
        company_name=kb["company_name"],
        profile=kb.get("profile", {}),
        approved_sources=sources_data,
    )

    # Persist updated profile and scores
    db.save_knowledge_base(supplier_id, {
        "profile": result["profile"],
        "intelligence_depth": {
            "scores": result["scores"],
            "total": result["total"],
        },
        "documents": kb.get("documents", []) + [s["url"] for s in sources_data],
    })

    return {
        "supplier_id": supplier_id,
        "company_name": kb["company_name"],
        "ingested_count": result["ingested_count"],
        "failed_count": result["failed_count"],
        "results": result["results"],
        "intelligence_depth": {
            "scores": result["scores"],
            "total": result["total"],
        },
        "threshold_status": _threshold_label(result["total"]),
    }


class HumanIntelRequest(BaseModel):
    note: str


@router.post("/{supplier_id}/human-intel")
async def submit_human_intel(
    supplier_id: str,
    payload: HumanIntelRequest,
    background_tasks: BackgroundTasks,
    x_session_id: str = Header(...),
):
    """
    Accept a free-form human intel note, classify it, and store it.
    NEED TO KNOW notes also contribute scorable content to the KB profile.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    if not payload.note.strip():
        raise HTTPException(status_code=400, detail="Note is empty.")

    existing_notes = db.get_human_intel(supplier_id)
    classified = await classify_human_intel(
        raw_note=payload.note.strip(),
        company_name=kb["company_name"],
        profile=kb.get("profile", {}),
        existing_notes=existing_notes,
    )

    # Persist the note
    db.save_human_intel_note(supplier_id, classified)

    # If NEED TO KNOW and scorable content exists, merge into KB profile
    new_depth = None
    if classified["classification"] == "NEED TO KNOW" and classified.get("scorable_content"):
        profile = kb.get("profile", {})
        for element in classified.get("elements", []):
            existing = profile.get(element, "")
            addition = f"[FIELD NOTE] {classified['scorable_content']}"
            profile[element] = (existing + "\n\n" + addition).strip() if existing else addition

        scores = score_intelligence_depth(profile)
        total = sum(scores.values())
        db.save_knowledge_base(supplier_id, {
            "profile": profile,
            "intelligence_depth": {"scores": scores, "total": total},
        })
        new_depth = {"scores": scores, "total": total}

    # Always trigger background synthesis -- it builds on everything in the KB
    background_tasks.add_task(
        _background_synthesise,
        supplier_id,
        payload.note.strip(),
        "field_note",
    )

    return {
        "note_id": classified["note_id"],
        "classification": classified["classification"],
        "classification_reason": classified["classification_reason"],
        "headline": classified["headline"],
        "elements": classified["elements"],
        "tags": classified["tags"],
        "contributed_to_depth": new_depth is not None,
        "intelligence_depth": new_depth,
    }


@router.get("/{supplier_id}/human-intel")
@router.get("/{supplier_id}/human-intel")
async def get_human_intel(supplier_id: str):
    """Return all human intel notes for a supplier, newest first."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    notes = db.get_human_intel(supplier_id)
    return {
        "supplier_id": supplier_id,
        "company_name": kb["company_name"],
        "notes": notes,
        "need_to_know_count": sum(1 for n in notes if n.get("classification") == "NEED TO KNOW"),
        "nice_to_know_count": sum(1 for n in notes if n.get("classification") == "NICE TO KNOW"),
    }


@router.post("/{supplier_id}/interview")
async def start_interview(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """Generate targeted interview questions based on KB gaps."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    gaps = kb.get("gaps", [])
    existing_notes = db.get_human_intel(supplier_id)

    questions = await generate_interview_questions(
        company_name=kb["company_name"],
        profile=kb.get("profile", {}),
        existing_notes=existing_notes,
        gaps=gaps,
    )

    return {
        "supplier_id": supplier_id,
        "company_name": kb["company_name"],
        "questions": questions,
        "question_count": len(questions),
    }


@router.post("/{supplier_id}/deep-scan")
async def deep_scan_website(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """
    STRATALYST Deep Scan: crawl the supplier's entire website automatically.
    Discovers all product/technical pages, extracts intelligence, auto-ingests.
    No approval step -- it's the supplier's own site.
    Designed to push KB depth significantly in one operation.
    """
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    website_url = kb.get("website_url")
    if not website_url:
        raise HTTPException(
            status_code=400,
            detail="No website URL set for this supplier. Set it in the KB first."
        )

    from agents.stratalyst_agent import crawl_supplier_website

    # Run the deep crawl
    crawl_result = await crawl_supplier_website(
        website_url=website_url,
        company_name=kb["company_name"],
        max_pages=14,
    )

    crawled_profile = crawl_result.get("profile", {})
    pages_crawled = crawl_result.get("pages_crawled", 0)

    if not crawled_profile:
        return {
            "status": "no_content",
            "message": "Crawl returned no extractable content. Try adding URLs manually.",
            "pages_crawled": pages_crawled,
        }

    # Merge into existing profile -- longer content wins, never erase existing
    existing_profile = kb.get("profile", {})
    merged = dict(existing_profile)
    fields_improved = 0
    for key, value in crawled_profile.items():
        if value and isinstance(value, str):
            existing = merged.get(key, "")
            if len(value) > len(existing):
                merged[key] = value
                fields_improved += 1
            elif value and existing and value not in existing:
                merged[key] = existing + "\n\n" + value
                fields_improved += 1

    # Score and save
    scores = score_intelligence_depth(merged)
    total = sum(scores.values())
    old_total = kb.get("intelligence_depth", {}).get("total", 0)

    db.save_knowledge_base(supplier_id, {
        "profile": merged,
        "intelligence_depth": {"scores": scores, "total": total},
        "documents": kb.get("documents", []) + crawl_result.get("urls", []),
    })

    # Propose a draft seed if none is set yet
    draft_proposed = False
    if not kb.get("manual_seed", {}).get("product_plain"):
        try:
            from agents.stratalyst_agent import propose_seed_from_profile
            draft = await propose_seed_from_profile(
                company_name=kb["company_name"],
                profile=merged,
                website_url=website_url,
            )
            if draft.get("product_plain"):
                db.save_knowledge_base(supplier_id, {"draft_seed": draft})
                draft_proposed = True
        except Exception:
            pass

    return {
        "status": "complete",
        "draft_seed_proposed": draft_proposed,
        "pages_crawled": pages_crawled,
        "fields_improved": fields_improved,
        "depth_before": round(old_total, 1),
        "depth_after": round(total, 1),
        "depth_gain": round(total - old_total, 1),
        "threshold_status": _threshold_label(total),
        "urls_crawled": crawl_result.get("urls", []),
    }


# ---------------------------------------------------------------------------
# Intelligence Seed endpoints (6-block agentic seed)
# ---------------------------------------------------------------------------

@router.post("/{supplier_id}/build-seed")
async def build_seed(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """
    STRATALYST Seed Builder: run 3 parallel grounded searches to populate
    all 6 intelligence blocks for this supplier.
    Stores result as intelligence_seed in Firestore alongside manual_seed.
    Takes 30-60s to complete.
    """
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    try:
        seed = await build_intelligence_seed(
            company_name=kb["company_name"],
            website_url=kb.get("website_url"),
            existing_profile=kb.get("profile", {}),
            existing_seed=kb.get("manual_seed", {}),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seed build failed: {str(e)}")

    # Preserve industry_targeting -- NACE codes are set manually and must survive rebuilds
    existing_seed = kb.get("intelligence_seed") or {}
    if existing_seed.get("industry_targeting"):
        seed["industry_targeting"] = existing_seed["industry_targeting"]

    db.save_knowledge_base(supplier_id, {"intelligence_seed": seed})

    completeness = seed.get("_meta", {}).get("completeness_pct", 0)
    filled = sum(
        1 for block in ["identity", "buyer_intelligence", "commercial_reality",
                         "winning_conditions", "signal_recognition"]
        for f in seed.get(block, {}).values()
        if f.get("value")
    )

    return {
        "status": "complete",
        "supplier_id": supplier_id,
        "company_name": kb["company_name"],
        "completeness_pct": completeness,
        "fields_populated": filled,
        "last_built": seed.get("_meta", {}).get("last_built", ""),
        "intelligence_seed": seed,
    }


class VerifyFieldRequest(BaseModel):
    block: str       # e.g. "identity"
    field: str       # e.g. "product_plain"
    value: str       # Jason's override value
    note: Optional[str] = ""


@router.patch("/{supplier_id}/verify-field")
async def verify_seed_field(
    supplier_id: str,
    payload: VerifyFieldRequest,
):
    """
    Jason verifies or overrides a single intelligence_seed field.
    Sets jason_verified=True and confidence=high on the field.
    The jason_verified flag means this value wins over any future agent re-build.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    seed = kb.get("intelligence_seed") or {}
    if not seed:
        raise HTTPException(
            status_code=400,
            detail="No intelligence seed found. Run Build Seed first."
        )

    block = payload.block
    field = payload.field
    if block not in seed or field not in seed.get(block, {}):
        raise HTTPException(
            status_code=400,
            detail=f"Field {block}.{field} not found in intelligence seed."
        )

    seed[block][field] = {
        "value": payload.value.strip(),
        "source": "jason_verified",
        "confidence": "high",
        "jason_verified": True,
        "jason_only": seed[block][field].get("jason_only", False),
    }
    if payload.note:
        seed[block][field]["note"] = payload.note.strip()

    db.save_knowledge_base(supplier_id, {"intelligence_seed": seed})

    return {
        "status": "verified",
        "block": block,
        "field": field,
        "value": payload.value.strip(),
    }


class RecommendFieldRequest(BaseModel):
    field_name: str
    rationale: str
    suggested_by: str   # agent name: "research_agent", "stratascout", "strategist"
    draft_value: Optional[str] = ""


@router.post("/{supplier_id}/recommend-field")
async def recommend_seed_field(
    supplier_id: str,
    payload: RecommendFieldRequest,
):
    """
    An agent recommends a new field that would improve seed quality.
    Adds to the recommended_fields queue for Jason to review.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    seed = kb.get("intelligence_seed") or {}
    if not seed:
        seed = {"recommended_fields": []}

    recommendations = seed.get("recommended_fields", [])

    # Avoid duplicates
    existing = [r for r in recommendations if r.get("field_name") == payload.field_name]
    if not existing:
        recommendations.append({
            "field_name": payload.field_name,
            "rationale": payload.rationale,
            "suggested_by": payload.suggested_by,
            "draft_value": payload.draft_value or "",
            "status": "pending",
        })
        seed["recommended_fields"] = recommendations
        db.save_knowledge_base(supplier_id, {"intelligence_seed": seed})

    return {
        "status": "queued",
        "field_name": payload.field_name,
        "suggested_by": payload.suggested_by,
    }


class IndustryTargetingRequest(BaseModel):
    target_nace: List[str] = []
    target_sic: List[str] = []
    notes: Optional[str] = ""


@router.post("/{supplier_id}/update-industry-targeting")
async def update_industry_targeting(supplier_id: str, payload: IndustryTargetingRequest):
    """Save NACE and SIC target code lists to the supplier's intelligence seed."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    seed = kb.get("intelligence_seed") or {}
    seed["industry_targeting"] = {
        "target_nace": [c.upper().strip() for c in payload.target_nace if c.strip()],
        "target_sic":  [c.strip() for c in payload.target_sic if c.strip()],
        "notes": payload.notes or "",
        "jason_verified": True,
    }
    db.save_knowledge_base(supplier_id, {"intelligence_seed": seed})

    return {
        "status": "saved",
        "target_nace": seed["industry_targeting"]["target_nace"],
        "target_sic":  seed["industry_targeting"]["target_sic"],
        "count": len(seed["industry_targeting"]["target_nace"]),
    }

# ---------------------------------------------------------------------------
# NACE industry targeting suggestion
# ---------------------------------------------------------------------------

_NACE_REFERENCE = """
A   Agriculture, Forestry and Fishing
A01 Crop and animal production, hunting and related service activities
A02 Forestry and logging
A03 Fishing and aquaculture
B   Mining and Quarrying
B05 Mining of coal and lignite
B06 Extraction of crude petroleum and natural gas
B07 Mining of metal ores
B08 Other mining and quarrying
B09 Mining support service activities
C   Manufacturing
C10 Manufacture of food products
C11 Manufacture of beverages
C12 Manufacture of tobacco products
C13 Manufacture of textiles
C14 Manufacture of wearing apparel
C15 Manufacture of leather and related products
C16 Manufacture of wood and wood products
C17 Manufacture of paper and paper products
C18 Printing and reproduction of recorded media
C19 Manufacture of coke and refined petroleum products
C20 Manufacture of chemicals and chemical products
C21 Manufacture of basic pharmaceutical products and preparations
C22 Manufacture of rubber and plastic products
C23 Manufacture of other non-metallic mineral products
C24 Manufacture of basic metals
C25 Manufacture of fabricated metal products (excl. machinery)
C26 Manufacture of computer, electronic and optical products
C27 Manufacture of electrical equipment
C28 Manufacture of machinery and equipment n.e.c.
C29 Manufacture of motor vehicles, trailers and semi-trailers
C30 Manufacture of other transport equipment
C31 Manufacture of furniture
C32 Other manufacturing
C33 Repair and installation of machinery and equipment
D   Electricity, Gas, Steam and Air Conditioning Supply
D35 Electricity, gas, steam and air conditioning supply
E   Water Supply; Sewerage, Waste Management and Remediation
E36 Water collection, treatment and supply
E37 Sewerage
E38 Waste collection, treatment and disposal; materials recovery
E39 Remediation activities and other waste management services
F   Construction
F41 Construction of buildings
F42 Civil engineering
F43 Specialised construction activities
G   Wholesale and Retail Trade; Repair of Motor Vehicles
G45 Wholesale and retail trade and repair of motor vehicles and motorcycles
G46 Wholesale trade (excl. motor vehicles and motorcycles)
G47 Retail trade (excl. motor vehicles and motorcycles)
H   Transportation and Storage
H49 Land transport and transport via pipelines
H50 Water transport
H51 Air transport
H52 Warehousing and support activities for transportation
H53 Postal and courier activities
I   Accommodation and Food Service Activities
I55 Accommodation
I56 Food and beverage service activities
J   Information and Communication
J58 Publishing activities
J61 Telecommunications
J62 Computer programming, consultancy and related activities
J63 Information service activities
K   Financial and Insurance Activities
K64 Financial service activities
K65 Insurance, reinsurance and pension funding
L   Real Estate Activities
L68 Real estate activities
M   Professional, Scientific and Technical Activities
M69 Legal and accounting activities
M70 Management consultancy activities
M71 Architectural and engineering activities; technical testing and analysis
M72 Scientific research and development
M73 Advertising and market research
N   Administrative and Support Service Activities
N77 Rental and leasing activities
N81 Services to buildings and landscape activities
N82 Office administrative and business support activities
O   Public Administration and Defence
O84 Public administration and defence; compulsory social security
P   Education
P85 Education
Q   Human Health and Social Work Activities
Q86 Human health activities
Q87 Residential care activities
R   Arts, Entertainment and Recreation
R93 Sports activities and amusement and recreation activities
S   Other Service Activities
S94 Activities of membership organisations
S95 Repair of computers and personal and household goods
"""


@router.post("/{supplier_id}/suggest-nace")
async def suggest_nace(supplier_id: str):
    """
    Use Gemini to suggest NACE Rev.2 division codes for this supplier's
    target customer industries, based on the intelligence seed.
    Returns a list of {code, label, rationale} objects.
    """
    import re as _re, json as _json

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    iseed = kb.get("intelligence_seed") or {}
    mseed = kb.get("manual_seed") or {}

    def sv(block: str, field: str) -> str:
        return ((iseed.get(block) or {}).get(field) or {}).get("value", "") or ""

    company = kb.get("company_name", "Unknown supplier")
    product = sv("identity", "product_plain") or mseed.get("product_plain", "")
    not_this = sv("identity", "not_this") or mseed.get("not_this", "")
    buyer_type = sv("buyer_intelligence", "buyer_type") or mseed.get("buyer_type", "")
    use_case = sv("buyer_intelligence", "use_case") or mseed.get("use_case", "")
    triggers = sv("signal_recognition", "trigger_events") or ""
    win_when = sv("winning_conditions", "we_win_when") or ""

    if not product and not buyer_type:
        raise HTTPException(
            status_code=422,
            detail="Build the intelligence seed first -- need product and buyer context to suggest NACE codes."
        )

    prompt = (
        "You are an industrial sales intelligence agent. Your task: given a supplier's\n"
        "product and buyer profile, identify which NACE Rev.2 industry divisions describe\n"
        "their TARGET CUSTOMER industries -- the industries their buyers BELONG TO.\n\n"
        f"SUPPLIER: {company}\n"
        f"Product/service: {product}\n"
        f"NOT this: {not_this or 'n/a'}\n"
        f"Buyer type: {buyer_type or 'n/a'}\n"
        f"Use case: {use_case or 'n/a'}\n"
        f"Trigger events: {triggers or 'n/a'}\n"
        f"Wins when: {win_when or 'n/a'}\n\n"
        "NACE Rev.2 Reference (code + label):\n"
        f"{_NACE_REFERENCE}\n"
        "Instructions:\n"
        "- Select 3-8 NACE DIVISION codes (3-char codes like C20, D35, F42 -- NOT single-letter sections)\n"
        "- Focus on the industries the CUSTOMERS belong to, not the supplier itself\n"
        "- Rank by relevance -- most important first\n"
        "- For each code give ONE sentence of rationale tied to the supplier's specific product/buyer context\n"
        "- Be specific -- avoid generic labels, reference the supplier's actual product or buyer trigger\n\n"
        "Return a JSON array only:\n"
        "[\n"
        "  {\n"
        "    \"code\": \"C20\",\n"
        "    \"label\": \"Manufacture of chemicals and chemical products\",\n"
        "    \"rationale\": \"One specific sentence.\"\n"
        "  }\n"
        "]\n\n"
        "Return only the JSON array, no other text."
    )

    try:
        response = await generate(prompt, temperature=0.2)
        cleaned = _re.sub(r"```(?:json)?\n?", "", response).strip()
        start = cleaned.find("[")
        end = cleaned.rfind("]") + 1
        if start < 0 or end <= start:
            raise ValueError("No JSON array in response")
        suggestions = _json.loads(cleaned[start:end])
        clean = []
        for s in suggestions:
            code = str(s.get("code", "")).upper().strip()
            if len(code) >= 2 and s.get("label") and s.get("rationale"):
                clean.append({
                    "code": code,
                    "label": s["label"],
                    "rationale": s["rationale"],
                })
        return {"supplier_id": supplier_id, "suggestions": clean}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"NACE suggestion failed: {exc}")


# ---------------------------------------------------------------------------
# Deal Triggers endpoints
# ---------------------------------------------------------------------------

from agents.stratalyst_agent import generate_deal_triggers as _gen_triggers


class DealTriggerItem(BaseModel):
    id: Optional[str] = None
    trigger_type: str
    title: str
    description: str
    scan_keywords: List[str] = []
    lead_time_days: int = 90
    rationale: Optional[str] = ""
    confidence: Optional[str] = "high"
    source: Optional[str] = "jason_verified"
    jason_verified: Optional[bool] = True


class SaveTriggersRequest(BaseModel):
    triggers: List[DealTriggerItem]


@router.post("/{supplier_id}/generate-deal-triggers")
async def generate_deal_triggers_endpoint(
    supplier_id: str,
    x_session_id: str = Header(...),
):
    """
    STRATALYST: Synthesise structured deal triggers from the intelligence seed.
    Returns typed trigger objects ready for STRATAGORA signal scoring.
    Saves results to deal_triggers field on the KB document.
    """
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    seed = kb.get("intelligence_seed") or {}
    if not seed:
        raise HTTPException(
            status_code=422,
            detail="Build the Intelligence Seed first -- deal triggers need the seed signal data."
        )

    triggers = await _gen_triggers(
        company_name=kb["company_name"],
        intelligence_seed=seed,
        profile=kb.get("profile", {}),
    )

    if not triggers:
        raise HTTPException(status_code=500, detail="Trigger generation returned no results. Try again.")

    db.save_knowledge_base(supplier_id, {"deal_triggers": triggers})

    return {
        "status": "generated",
        "supplier_id": supplier_id,
        "company_name": kb["company_name"],
        "trigger_count": len(triggers),
        "deal_triggers": triggers,
    }


@router.get("/{supplier_id}/deal-triggers")
async def get_deal_triggers(supplier_id: str):
    """Return saved deal triggers for a supplier."""
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")
    triggers = kb.get("deal_triggers") or []
    return {
        "supplier_id": supplier_id,
        "company_name": kb["company_name"],
        "deal_triggers": triggers,
        "trigger_count": len(triggers),
    }


@router.patch("/{supplier_id}/deal-triggers")
async def save_deal_triggers(
    supplier_id: str,
    payload: SaveTriggersRequest,
):
    """
    Save the full deal trigger list (after Jason edits/verifies in the UI).
    Overwrites the existing list -- send the complete current state.
    """
    import uuid as _uuid
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    triggers = []
    for t in payload.triggers:
        d = t.dict()
        if not d.get("id"):
            d["id"] = str(_uuid.uuid4())
        d["jason_verified"] = True
        d["source"] = "jason_verified"
        triggers.append(d)

    db.save_knowledge_base(supplier_id, {"deal_triggers": triggers})

    return {
        "status": "saved",
        "trigger_count": len(triggers),
    }
