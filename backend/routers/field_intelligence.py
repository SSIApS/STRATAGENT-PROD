"""
STRATAGENT -- Field Intelligence Router
Prospect research, Relationship Profiles, and Convergence Index.
"""
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Header
from pydantic import BaseModel
import logging
import time
import uuid

logger = logging.getLogger(__name__)

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.research_agent import (
    research_prospect,
    research_distribution_channel,
    is_consumer_retail_kb,
    find_alternative_prospects,
)
from agents.stratalink_agent import match_affiliates_to_prospect
from agents.synergy_agent import cross_score_prospect

router = APIRouter()


def _check_industry_match(prospect_classification: dict, supplier_kb: dict) -> dict:
    """Compare prospect NACE against supplier target_nace list."""
    import re as _re
    iseed = supplier_kb.get("intelligence_seed") or {}
    targeting = iseed.get("industry_targeting") or {}
    target_nace = [c.upper() for c in (targeting.get("target_nace") or []) if c]

    def _prospect_base(cls: dict) -> dict:
        if not cls or not cls.get("nace_code"):
            return {}
        return {
            "prospect_nace": (cls.get("nace_code") or "").upper(),
            "prospect_nace_label": cls.get("nace_label", ""),
        }

    if not target_nace:
        return {"match_type": "unknown", "match_label": "No industry targeting set yet",
                **_prospect_base(prospect_classification)}

    if not prospect_classification or not prospect_classification.get("nace_code"):
        return {"match_type": "unknown", "match_label": "Prospect not classified"}

    p_code = (prospect_classification.get("nace_code") or "").upper()
    p_div  = (prospect_classification.get("nace_division") or p_code[:3]).upper()
    p_sec  = (prospect_classification.get("nace_section") or p_code[:1]).upper()
    p_label = prospect_classification.get("nace_label", "")
    base = {"prospect_nace": p_code, "prospect_nace_label": p_label,
            "target_nace": targeting.get("target_nace", [])}

    for code in target_nace:
        if code == p_code:
            return {**base, "match_type": "exact",
                    "match_label": f"Exact match -- {p_code} {p_label}", "matched_code": code}

    for code in target_nace:
        m = _re.match(r'^([A-Z]\d{2})', code)
        if m and m.group(1) == p_div:
            return {**base, "match_type": "division",
                    "match_label": f"Same industry group ({p_div})", "matched_code": code}

    for code in target_nace:
        if code[:1] == p_sec:
            return {**base, "match_type": "section",
                    "match_label": f"Same sector ({p_sec})", "matched_code": code}

    return {**base, "match_type": "none", "match_label": "Outside target industries"}


class ProspectResearchRequest(BaseModel):
    supplier_id: str
    company_name: str
    prospect_type: Optional[str] = "auto"
    # "auto"                 -- detect from KB Manual Seed (default)
    # "b2b_industrial"       -- force B2B industrial research mode
    # "distribution_channel" -- force channel evaluation mode
    product_context: Optional[dict] = None
    # Optional product signal context injected when FI is launched from PAM.
    # Shape: {product_name: str, archetype: str, signals: []}
    geography: Optional[str] = None
    # Optional geographic focus (e.g. "Denmark", "Scandinavia").
    prospect_url: Optional[str] = None
    # Optional official URL for the prospect -- when provided, Gemini visits this
    # site FIRST before any other search, preventing identity hallucination.
    # Falls back to supplier_location from KB if not provided.


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
            "status": "complete",
        })
    except Exception as e:
        # Save the error so it's visible -- synergy never blocks the primary FI
        try:
            db.save_synergy_matches(profile_id, {
                "profile_id": profile_id,
                "primary_supplier_id": primary_supplier_id,
                "prospect_name": prospect_profile.get("company_name", ""),
                "flags": [],
                "flag_count": 0,
                "status": "error",
                "error": str(e),
                "scored_at": time.time(),
            })
        except Exception:
            pass


def _resolve_prospect_type(requested: str, kb: dict) -> str:
    """
    Resolve the effective prospect type for a research request.
    "auto" inspects the KB Manual Seed and returns the detected type.
    Explicit values pass through unchanged.
    Returns "b2b_industrial" or "distribution_channel".
    """
    if requested == "distribution_channel":
        return "distribution_channel"
    if requested == "b2b_industrial":
        return "b2b_industrial"
    # auto: detect from KB
    return "distribution_channel" if is_consumer_retail_kb(kb) else "b2b_industrial"


async def _execute_research(
    supplier_id: str,
    company_name: str,
    x_session_id: str,
    prospect_type: str = "auto",
    product_context: dict = None,
    geography: str = "",
    queue_entry_id: str = None,
    background_tasks: BackgroundTasks = None,
    prospect_url: str = "",
):
    """
    Core research flow, shared by /research and the retry-queue endpoint.
    Routes to B2B industrial research or distribution channel evaluation
    based on KB type detection or explicit prospect_type parameter.
    """
    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge Base not found")

    intel_total = kb.get("intelligence_depth", {}).get("total", 0)
    if intel_total < 20:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "INTELLIGENCE GAP -- Knowledge Base below 20%. Add at least basic supplier info before researching prospects.",
                "intelligence_depth": intel_total,
                "required": 20,
            }
        )

    effective_type = _resolve_prospect_type(prospect_type, kb)

    try:
        if effective_type == "distribution_channel":
            # Pull any STRATAGORA signals that mention this channel name
            stratagora_signals = []
            try:
                all_signals = db.list_market_signals(limit=100, active_only=True)
                ch_lower = company_name.lower()
                stratagora_signals = [
                    s for s in all_signals
                    if ch_lower in str(s.get("channel", "")).lower()
                    or ch_lower in str(s.get("headline", "")).lower()
                ]
            except Exception:
                pass  # Signals are context, not required

            # Fetch product images for visual grounding of channel fit assessment
            product_images = []
            try:
                stored_images = db.get_product_images(supplier_id)
                product_images = [
                    {"data": img["data"], "mime_type": img.get("content_type", "image/jpeg")}
                    for img in stored_images[:3]
                    if img.get("data")
                ]
            except Exception:
                pass  # Images are enrichment, never block research

            # Auto-inject saved visual analysis from KB -- avoids re-running if already done
            saved_visual = kb.get("visual_analysis")
            if saved_visual and not product_images:
                # Pass saved analysis as context enrichment via supplier_kb field
                enriched_kb = {**kb, "_saved_visual_analysis": saved_visual}
            else:
                enriched_kb = kb

            # Resolve supplier location from KB for geo-aware scoring
            supplier_location = kb.get("supplier_location", "")

            profile = await research_distribution_channel(
                channel_name=company_name,
                supplier_kb=enriched_kb,
                stratagora_signals=stratagora_signals,
                product_images=product_images or None,
                supplier_location=supplier_location,
            )
        else:
            # Use explicit geography or fall back to KB supplier location
            effective_geography = geography.strip() if geography else (kb.get("supplier_location") or "")
            profile = await research_prospect(company_name, kb, product_context=product_context, geography=effective_geography, prospect_url=prospect_url)

    except BaseException as e:
        # BaseException catches CancelledError (Python 3.10+) not caught by except Exception
        if isinstance(e, (KeyboardInterrupt, SystemExit)):
            raise
        logger.error("Research exception for %s / %s: %s", supplier_id, company_name, e, exc_info=True)
        entry_id = queue_entry_id or str(uuid.uuid4())
        _etype = locals().get("effective_type") or prospect_type or "auto"
        try:
            existing = db.get_pending_research(entry_id) if queue_entry_id else None
            first_requested_at = existing.get("requested_at") if existing else None
            db.save_pending_research(entry_id, {
                "supplier_id": supplier_id,
                "company_name": company_name,
                "prospect_type": _etype,
                "status": "failed",
                "error": str(e),
                "requested_at": first_requested_at or time.time(),
                "last_attempt_at": time.time(),
            })
        except Exception as save_err:
            logger.warning("Could not save failed research to queue: %s", save_err)
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
        "prospect_type": effective_type,
        "recommended_path": profile.get("recommended_path", "PARK" if effective_type == "b2b_industrial" else "MONITOR"),
        "watch_status": "active" if score >= 60 else "monitoring",
    })

    # STRATAMESH -- fire cross-supplier synergy check in background (non-blocking)
    # Runs for both B2B and channel prospects -- may surface cross-sell opportunities
    prospect_for_synergy = {**profile, "company_name": company_name}
    if background_tasks:
        background_tasks.add_task(_run_synergy_check, profile_id, prospect_for_synergy, supplier_id)

    # Success -- clear any queue entry for this attempt
    if queue_entry_id:
        try:
            db.delete_pending_research(queue_entry_id)
        except Exception:
            pass

    # Build response -- shape differs by prospect type
    if effective_type == "distribution_channel":
        response = {
            "profile_id":       profile_id,
            "company_name":     company_name,
            "prospect_type":    "distribution_channel",
            "convergence_index": score,
            "recommended_path": profile.get("recommended_path"),
            "profile":          profile,
            # Channel-specific summary fields surfaced at top level for easy UI rendering
            "channel_scoring": {
                "audience_fit":       (profile.get("audience_fit") or {}).get("score"),
                "channel_health":     (profile.get("channel_health") or {}).get("score"),
                "competitive_density":(profile.get("competitive_density") or {}).get("score"),
                "commercial_openness":(profile.get("commercial_openness") or {}).get("score"),
                "margin_potential":   (profile.get("margin_potential") or {}).get("score"),
                "saturation_headroom":(profile.get("saturation_headroom") or {}).get("score"),
            },
            "priority_actions":  profile.get("priority_actions", []),
            "approach_strategy": profile.get("approach_strategy", ""),
            "key_requirements":  profile.get("key_requirements", ""),
        }
        # Low-score nudge: skip affiliate + alternatives for channel research
        if score < 45:
            response["skip_reason"] = (
                "This channel scores below 45. The competitive density or audience fit "
                "does not support entry at this time. Consider the priority actions above "
                "or run a STRATAGORA product scan to find better-fit channels."
            )
        return response

    # -- B2B industrial path (unchanged from original) --
    # Check affiliate library for adjacent opportunities
    adjacent_opportunities = []
    try:
        active_partners = db.list_affiliate_partners(status="active")
        if active_partners:
            adjacent_opportunities = await match_affiliates_to_prospect(profile, active_partners)
    except Exception:
        pass  # Non-blocking -- affiliate match failure never breaks FI

    # Industry classification match
    industry_match = _check_industry_match(
        profile.get("industry_classification", {}), kb
    )

    response = {
        "profile_id":           profile_id,
        "company_name":         company_name,
        "prospect_type":        "b2b_industrial",
        "convergence_index":    score,
        "recommended_path":     profile.get("recommended_path"),
        "profile":              profile,
        "adjacent_opportunities": adjacent_opportunities,
        "industry_match":       industry_match,
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
        prospect_type=payload.prospect_type or "auto",
        product_context=payload.product_context,
        geography=payload.geography or "",
        background_tasks=background_tasks,
        prospect_url=payload.prospect_url or "",
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
        prospect_type=entry.get("prospect_type", "auto"),
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


class ProfilePatch(BaseModel):
    website: Optional[str] = None


@router.patch("/profile/{profile_id}")
async def patch_profile(profile_id: str, payload: ProfilePatch):
    """Patch editable fields on a saved profile (e.g. manually entered website URL)."""
    profile = db.get_relationship_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    updates: dict = {}
    if payload.website is not None:
        url = payload.website.strip()
        if url and not url.lower().startswith(("http://", "https://")):
            url = f"https://{url}"
        updates["profile"] = {**profile.get("profile", {}), "website": url or None}
    if updates:
        db.save_relationship_profile(profile_id, updates)
    return {"profile_id": profile_id, **updates}


@router.delete("/profile/{profile_id}")
async def delete_profile(profile_id: str):
    """Delete a saved FI research result (and its synergy record if present)."""
    profile = db.get_relationship_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete_relationship_profile(profile_id)
    # Also clean up any synergy matches for this profile
    try:
        db.db.collection("synergy_matches").document(profile_id).delete()
    except Exception:
        pass
    return {"deleted": profile_id}


@router.get("/synergy/{profile_id}")
async def get_synergy_flags(profile_id: str):
    """Fetch STRATAMESH cross-supplier flags for a researched prospect."""
    result = db.get_synergy_matches(profile_id)
    if not result:
        return {"profile_id": profile_id, "flags": [], "flag_count": 0, "status": "pending"}
    return result
