"""
STRATAGENT -- STRATAGORA Router
Market intelligence endpoints.

POST /api/stratagora/scan                        -- trigger full portfolio market scan (B2B + consumer)
POST /api/stratagora/product-scan/{supplier_id}  -- targeted product market scan for one consumer/retail KB
GET  /api/stratagora/signals                     -- list stored signals
GET  /api/stratagora/summary                     -- summary for STRATEGIST Monday Brief
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional, List

from services import firestore as db
from services.demo_gate import check_and_increment
from agents.stratagora_agent import (
    run_full_scan,
    run_product_scan,
    generate_sector_brief,
    _is_consumer_retail_kb,
)

router = APIRouter()


class ScanRequest(BaseModel):
    geography: Optional[str] = "Denmark, Scandinavia, Northern Europe"


class ProductScanRequest(BaseModel):
    geography: Optional[str] = None  # None = auto from KB supplier_location
    channels: Optional[List[str]] = None
    force_rerun: bool = False  # bypass cached scan result


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
    Auto-detects B2B vs consumer/retail KBs and routes each to the right scan mode.
    Stores signals in market_intelligence collection.
    Returns scan summary.
    """
    await check_and_increment(x_session_id)

    kbs = db.list_knowledge_bases()
    if not kbs:
        raise HTTPException(status_code=400, detail="No Knowledge Bases found. Add suppliers first.")

    result = await run_full_scan(kbs, geography=payload.geography)
    return result


@router.post("/product-scan/{supplier_id}")
async def scan_product_market(
    supplier_id: str,
    payload: ProductScanRequest,
    x_session_id: str = Header(...),
):
    """
    Targeted product market scan for a single consumer/retail KB.

    Evaluates:
    - MARKET_SATURATION: how crowded is each channel for this product?
    - DEMAND_SIGNAL: growing consumer appetite, search trends, social signals
    - CHANNEL_OPPORTUNITY: underserved distribution channels to enter
    - COMPETITOR_SIGNAL: competitor pricing, gaps, review patterns
    - PLATFORM_TREND: platform policy and algorithm changes

    Returns per-channel saturation scores + top opportunities ranked by relevance.
    Stores signals in market_intelligence collection for STRATEGIST to consume.
    """
    await check_and_increment(x_session_id)

    kb = db.get_knowledge_base(supplier_id)
    if not kb:
        raise HTTPException(status_code=404, detail=f"Knowledge Base not found: {supplier_id}")

    # Return cached scan unless force_rerun requested
    import time as _time
    cached_scan_at = kb.get("last_scan_at")
    if cached_scan_at and not payload.force_rerun:
        cached_scan = kb.get("last_scan")
        if cached_scan:
            cached_scan["cached"] = True
            cached_scan["scanned_at"] = cached_scan_at
            return cached_scan

    # Use supplier_location as geography default if not explicitly provided
    supplier_location = kb.get("supplier_location", "")
    effective_geography = payload.geography or supplier_location or "Global"

    # Warn if this looks like a B2B KB -- scan still runs but results may be less relevant
    is_consumer = _is_consumer_retail_kb(kb)
    try:
        result = await run_product_scan(
            kb=kb,
            channels=payload.channels,
            geography=effective_geography,
        )
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"Product scan error: {str(exc)[:300]}",
                "traceback": tb[-800:],
            }
        ) from exc

    result["kb_type_detected"] = "consumer_retail" if is_consumer else "b2b_industrial"
    result["geography_used"] = effective_geography
    result["cached"] = False
    result["scanned_at"] = _time.time()
    if not is_consumer:
        result["warning"] = (
            "This KB appears to be a B2B industrial supplier. "
            "Product market scan results may be less accurate. "
            "Check that Manual Seed buyer_type describes consumer/retail buyers."
        )

    # Persist scan result to KB for FI auto-injection
    db.save_kb_analysis(supplier_id, "last_scan", result)

    return result


@router.get("/signals")
async def get_signals(
    sector: Optional[str] = Query(None),
    scan_mode: Optional[str] = Query(None, description="Filter by scan_mode: b2b_industrial or consumer_retail"),
    limit: int = Query(50, ge=1, le=200),
    x_session_id: str = Header(...),
):
    """
    List stored market intelligence signals.
    Optionally filter by sector key or scan_mode.
    """
    signals = db.list_market_signals(sector=sector, limit=limit, active_only=True)

    # Filter by scan_mode if requested
    if scan_mode:
        signals = [s for s in signals if s.get("scan_mode") == scan_mode]

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
    Includes both B2B industrial and consumer/retail signals.
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

    # Separate B2B and consumer signals for structured response
    b2b_signals = [s for s in signals if s.get("scan_mode") == "b2b_industrial"]
    consumer_signals = [s for s in signals if s.get("scan_mode") == "consumer_retail"]

    return {
        "signal_count":         len(signals),
        "sectors_active":       len(by_sector),
        "b2b_signal_count":     len(b2b_signals),
        "consumer_signal_count":len(consumer_signals),
        "brief":                brief,
        "by_sector": {
            sector: [
                {
                    "headline":        s["headline"],
                    "signal_type":     s["signal_type"],
                    "relevance_score": s["relevance_score"],
                    "action_owner":    s["action_owner"],
                    "timing":          s.get("timing", ""),
                    "scan_mode":       s.get("scan_mode", "b2b_industrial"),
                }
                for s in sigs[:3]
            ]
            for sector, sigs in by_sector.items()
        },
        "top_signals": [
            {
                "sector_label":     s["sector_label"],
                "signal_type":      s["signal_type"],
                "headline":         s["headline"],
                "detail":           s.get("detail", ""),
                "channel":          s.get("channel", ""),
                "relevance_score":  s["relevance_score"],
                "saturation_score": s.get("saturation_score"),
                "action_owner":     s["action_owner"],
                "company_name":     s.get("company_name"),
                "timing":           s.get("timing", ""),
                "source_url":       s.get("source_url"),
                "affected_suppliers": s.get("affected_suppliers", []),
                "scan_mode":        s.get("scan_mode", "b2b_industrial"),
            }
            for s in signals[:10]
        ],
    }
