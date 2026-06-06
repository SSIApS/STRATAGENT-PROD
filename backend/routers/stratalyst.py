"""
STRATAGENT — STRATALYST Router
Endpoints for the STRATALYST KB enrichment agent.

GET  /api/stratalyst/storage
  → Returns per-supplier storage breakdown sorted by usage

POST /api/stratalyst/{supplier_id}/research-gaps
  → Scans KB gaps, searches web, returns findings brief for user approval

POST /api/stratalyst/{supplier_id}/approve-sources
  → Ingests approved source URLs, updates KB profile and intelligence depth
"""
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import asyncio

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.stratalyst_agent import research_gaps, ingest_approved_sources, classify_human_intel, generate_interview_questions, synthesise_profile
from agents.extraction_agent import score_intelligence_depth


async def _background_synthesise(supplier_id: str, trigger_content: str, trigger_type: str):
    """
    Run silently after content is added.
    Synthesise new profile fields from existing content, re-score, save.
    Does not block the API response — runs after it returns.
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

        # Merge improvements — only fill thin/missing fields, never overwrite good content
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
        pass  # Background — never surface errors to user

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
    Does NOT consume an action — this is a research-only call.
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

    # Always trigger background synthesis — it builds on everything in the KB
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
    No approval step — it's the supplier's own site.
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

    # Merge into existing profile — longer content wins, never erase existing
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