"""
STRATAGENT — STRATALINK Router
Affiliate partner library, revenue development, referral tracking.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import uuid, time

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.stratalink_agent import (
    research_affiliate_category,
    evaluate_affiliate_program,
    match_affiliates_to_prospect,
    AFFILIATE_CATEGORIES,
)

router = APIRouter()


# ── Category list ─────────────────────────────────────────────────────────────

@router.get("/categories")
async def list_categories():
    return [{"key": k, "label": v} for k, v in AFFILIATE_CATEGORIES.items()]


# ── Partner Library ───────────────────────────────────────────────────────────

class PartnerCreate(BaseModel):
    partner_name: str
    category: str
    product_description: str
    target_buyer: str
    commission_type: str                 # one-time | recurring | hybrid
    commission_rate: str
    cookie_duration_days: Optional[int] = 30
    affiliate_network: Optional[str] = "direct"
    referral_url: Optional[str] = None
    signup_url: Optional[str] = None
    tracking_code: Optional[str] = None
    why_relevant: Optional[str] = None
    quality_rating: Optional[str] = "MEDIUM"
    quality_notes: Optional[str] = None
    program_status: Optional[str] = "active"   # active | pending | research | paused
    notes: Optional[str] = None


@router.post("/partners")
async def add_partner(payload: PartnerCreate, x_session_id: str = Header(...)):
    """Add a new affiliate partner to the library."""
    await check_and_increment(x_session_id)
    partner_id = str(uuid.uuid4())
    record = {
        "partner_id":           partner_id,
        **payload.model_dump(),
        "created_at":           time.time(),
    }
    db.save_affiliate_partner(partner_id, record)
    return record


@router.get("/partners")
async def list_partners(category: Optional[str] = None, status: Optional[str] = None):
    """List all affiliate partners, optionally filtered."""
    return db.list_affiliate_partners(category=category, status=status)


@router.get("/partners/{partner_id}")
async def get_partner(partner_id: str):
    p = db.get_affiliate_partner(partner_id)
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    return p


@router.patch("/partners/{partner_id}")
async def update_partner(partner_id: str, updates: dict):
    """Update any fields on a partner record."""
    p = db.get_affiliate_partner(partner_id)
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    db.save_affiliate_partner(partner_id, updates)
    return {**p, **updates}


@router.delete("/partners/{partner_id}")
async def delete_partner(partner_id: str):
    db.delete_affiliate_partner(partner_id)
    return {"deleted": partner_id}


# ── Research assistance ───────────────────────────────────────────────────────

@router.post("/research-category")
async def research_category(
    category: str,
    geography: str = "europe",
    count: int = 5,
    x_session_id: str = Header(...),
):
    """Ask STRATALINK to research affiliate programs in a category."""
    await check_and_increment(x_session_id)

    if category not in AFFILIATE_CATEGORIES and len(category) < 3:
        raise HTTPException(status_code=400, detail="Unknown category")

    programs = await research_affiliate_category(category, geography, min(count, 8))
    return {
        "category":  category,
        "geography": geography,
        "programs":  programs,
        "count":     len(programs),
    }


@router.post("/evaluate")
async def evaluate_program(
    program_url: str,
    partner_name: str = "",
    x_session_id: str = Header(...),
):
    """Deep-evaluate a specific affiliate program before adding it."""
    await check_and_increment(x_session_id)
    evaluation = await evaluate_affiliate_program(program_url, partner_name)
    return evaluation


# ── Referral log (revenue tracking) ──────────────────────────────────────────

class ReferralCreate(BaseModel):
    partner_id: str
    partner_name: str
    prospect_company: str
    prospect_profile_id: Optional[str] = None
    commission_expected: Optional[float] = None
    commission_currency: Optional[str] = "EUR"
    notes: Optional[str] = None


@router.post("/referrals")
async def log_referral(payload: ReferralCreate):
    """Log a referral made — manual entry for crawl phase."""
    referral_id = str(uuid.uuid4())
    record = {
        "referral_id":        referral_id,
        **payload.model_dump(),
        "status":             "referred",
        "referred_at":        time.time(),
        "commission_earned":  None,
        "converted_at":       None,
    }
    db.save_affiliate_referral(referral_id, record)
    return record


@router.get("/referrals")
async def list_referrals(status: Optional[str] = None):
    return db.list_affiliate_referrals(status=status)


@router.patch("/referrals/{referral_id}/convert")
async def mark_converted(
    referral_id: str,
    commission_earned: float = 0,
    commission_currency: str = "EUR",
    notes: str = "",
):
    """Mark a referral as converted and log the commission."""
    r = db.get_affiliate_referral(referral_id)
    if not r:
        raise HTTPException(status_code=404, detail="Referral not found")
    updates = {
        "status":            "converted",
        "commission_earned": commission_earned,
        "commission_currency": commission_currency,
        "converted_at":      time.time(),
        "notes":             notes,
    }
    db.save_affiliate_referral(referral_id, {**r, **updates})
    return {**r, **updates}


@router.patch("/referrals/{referral_id}/status")
async def update_referral_status(referral_id: str, status: str, notes: str = ""):
    """Update referral status: referred | in_progress | converted | lost"""
    r = db.get_affiliate_referral(referral_id)
    if not r:
        raise HTTPException(status_code=404, detail="Referral not found")
    db.save_affiliate_referral(referral_id, {**r, "status": status, "notes": notes})
    return {**r, "status": status}


# ── Revenue summary ───────────────────────────────────────────────────────────

@router.get("/revenue-summary")
async def revenue_summary():
    """Lightweight revenue summary — referral counts and commission totals."""
    referrals = db.list_affiliate_referrals()
    total_referred  = len(referrals)
    total_converted = sum(1 for r in referrals if r.get("status") == "converted")
    total_earned    = sum(
        r.get("commission_earned") or 0
        for r in referrals if r.get("status") == "converted"
    )
    in_progress = sum(1 for r in referrals if r.get("status") in ("referred", "in_progress"))

    by_partner: dict = {}
    for r in referrals:
        name = r.get("partner_name", "Unknown")
        if name not in by_partner:
            by_partner[name] = {"referred": 0, "converted": 0, "earned": 0.0}
        by_partner[name]["referred"] += 1
        if r.get("status") == "converted":
            by_partner[name]["converted"] += 1
            by_partner[name]["earned"] += r.get("commission_earned") or 0

    return {
        "total_referred":   total_referred,
        "total_converted":  total_converted,
        "conversion_rate":  round(total_converted / total_referred * 100, 1) if total_referred else 0,
        "total_earned_eur": round(total_earned, 2),
        "in_progress":      in_progress,
        "by_partner":       by_partner,
    }
