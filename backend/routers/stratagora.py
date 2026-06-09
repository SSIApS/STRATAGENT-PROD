"""
STRATAGENT -- STRATAGORA Router
Market intelligence endpoints.

POST /api/stratagora/scan          -- trigger full market scan
GET  /api/stratagora/signals       -- list stored signals
GET  /api/stratagora/signals/summary -- summary for STRATEGIST
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.stratagora_agent import run_full_scan, generate_sector_brief

router = APIRouter()


class ScanRequest(BaseModel):
    geography: Optional[str] = "Denmark, Scandinavia, Northern Europe"


@router.get("/ping")
async def ping():
    """Instant health check -- no Gemini, no Firestore. Proves router loaded."""
    return {"status": "STRATAGORA router OK", "message": "Router is loaded and reachable."}


@router.post("/scan")
async def scan_markets(
    payload: ScanRequest,
    x_session_id: str = Header(...),
):
    """
    Trigger a full STRATAGORA market scan across all KB sectors.
    Stores signals in market_intelligence collection.
    Returns scan summary.
    """
    await check_and_increment(x_session_id)

    kbs = db.list_knowledge_bases()
    if not kbs:
        raise HTTPException(status_code=400, detail="No Knowledge Bases found. Add suppliers first.")

    result = await run_full_scan(kbs, geography=payload.geography)
    return result


@router.get("/signals")
async def get_signals(
    sector: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    x_session_id: str = Header(...),
):
    """List stored market intelligence signals."""
    signals = db.list_market_signals(sector=sector, limit=limit, active_only=True)
    return {
        "count": len(signals),
        "signals": signals,
    }


@router.get("/summary")
async def get_signals_summary(
    x_session_id: str = Header(...),
):
    """
    Return recent high-relevance signals + AI summary for STRATEGIST Monday Brief.
    Does NOT consume an action (read-only).
    """
    signals = db.get_recent_signals_for_strategist(days=30)

    # Group by sector for the summary view
    by_sector: dict = {}
    for sig in signals:
        sector = sig.get("sector_label", "General")
        by_sector.setdefault(sector, []).append(sig)

    # Generate brief summary if signals exist
    brief = ""
    if signals:
        try:
            brief = await generate_sector_brief(signals)
        except Exception:
            brief = f"{len(signals)} market signals active across {len(by_sector)} sectors."

    return {
        "signal_count":   len(signals),
        "sectors_active": len(by_sector),
        "brief":          brief,
        "by_sector":      {
            sector: [
                {
                    "headline":        s["headline"],
                    "signal_type":     s["signal_type"],
                    "relevance_score": s["relevance_score"],
                    "action_owner":    s["action_owner"],
                    "timing":          s.get("timing", ""),
                }
                for s in sigs[:3]
            ]
            for sector, sigs in by_sector.items()
        },
        "top_signals": [
            {
                "sector_label":    s["sector_label"],
                "signal_type":     s["signal_type"],
                "headline":        s["headline"],
                "detail":          s.get("detail", ""),
                "relevance_score": s["relevance_score"],
                "action_owner":    s["action_owner"],
                "company_name":    s.get("company_name"),
                "timing":          s.get("timing", ""),
                "source_url":      s.get("source_url"),
                "affected_suppliers": s.get("affected_suppliers", []),
            }
            for s in signals[:10]
        ],
    }
