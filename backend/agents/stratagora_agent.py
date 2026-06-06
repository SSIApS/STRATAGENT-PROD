"""
STRATAGENT — STRATAGORA Agent
Market intelligence layer. Watches sectors relevant to Jason's supplier portfolio
and surfaces signals that feed STRATASCOUT, STRATADAR, and STRATEGIST.

CRAWL PHASE: On-demand scan only. Weekly scheduling in WALK phase.

Signal types (shared with Field Intelligence):
  CAPEX | TENDER | REGULATORY | SECTOR_TREND | LEADERSHIP_CHANGE |
  STRATEGIC_SHIFT | NEWS_EVENT

Signal flow:
  STRATAGORA → Firestore market_intelligence
  STRATEGIST reads market_intelligence for Monday Brief context
  (STRATADAR + STRATASCOUT integration in WALK phase)
"""
import json
import re
import time
import uuid
from datetime import datetime, timezone

from services.gemini import generate_with_grounding, generate
from services import firestore as db


# ---------------------------------------------------------------------------
# Sector derivation — reads KBs to build watchlist
# ---------------------------------------------------------------------------

def _derive_sectors_from_kbs(kbs: list) -> list[dict]:
    """
    Build a sector watchlist from the current KB portfolio.
    Groups suppliers by the markets they sell INTO (buyer_type + use_case).
    Returns list of sector dicts ready to scan.
    """
    sectors: dict[str, dict] = {}

    for kb in kbs:
        seed = kb.get("manual_seed", {})
        profile = kb.get("profile", {})
        company = kb.get("company_name", "")
        supplier_id = kb.get("id") or kb.get("supplier_id", "")

        # Use seed (authoritative) then fall back to profile
        buyer_type = seed.get("buyer_type") or profile.get("buyer_profiles", "")
        use_case   = seed.get("use_case") or profile.get("operational_context", "")
        product    = seed.get("product_plain") or profile.get("product_catalogue", "")
        not_this   = seed.get("not_this", "")

        if not buyer_type:
            continue

        # Map to a canonical sector key
        sector_key, sector_label = _classify_sector(buyer_type, use_case, product)

        if sector_key not in sectors:
            sectors[sector_key] = {
                "sector_key":    sector_key,
                "sector_label":  sector_label,
                "buyer_type":    buyer_type,
                "use_case":      use_case,
                "suppliers":     [],
                "supplier_ids":  [],
                "not_this":      not_this,
            }

        if company and company not in sectors[sector_key]["suppliers"]:
            sectors[sector_key]["suppliers"].append(company)
        if supplier_id and supplier_id not in sectors[sector_key]["supplier_ids"]:
            sectors[sector_key]["supplier_ids"].append(supplier_id)

    return list(sectors.values())


def _classify_sector(buyer_type: str, use_case: str, product: str) -> tuple[str, str]:
    """
    Map buyer_type + use_case text to a canonical sector.
    Returns (sector_key, sector_label).
    """
    combined = (buyer_type + " " + use_case + " " + product).lower()

    if any(w in combined for w in ["biogas", "hydrogen", "co2", "co₂", "carbon capture", "electrolyser"]):
        return "green_energy", "Green Energy & Hydrogen"
    if any(w in combined for w in ["oil", "offshore", "gas plant", "refinery", "petroleum"]):
        return "oil_gas", "Oil, Gas & Offshore"
    if any(w in combined for w in ["airbnb", "superhost", "short-term rental", "hospitality", "hotel", "guest"]):
        return "hospitality_str", "Hospitality & Short-Term Rentals"
    if any(w in combined for w in ["insulation", "thermal", "industrial heat", "refractory"]):
        return "industrial_insulation", "Industrial Insulation & Thermal"
    if any(w in combined for w in ["marking", "tag", "label", "sign", "identification", "traceab"]):
        return "industrial_marking", "Industrial Marking & Identification"
    if any(w in combined for w in ["electrical", "instrumentation", "automation", "scada", "plc", "switchboard"]):
        return "ei_automation", "Electrical, Instrumentation & Automation"
    if any(w in combined for w in ["3d print", "prototype", "additive", "consumer product", "bathroom"]):
        return "consumer_products", "Consumer Products & 3D Manufacturing"
    if any(w in combined for w in ["consult", "advisory", "b2b service"]):
        return "b2b_consulting", "B2B Consulting & Advisory"
    if any(w in combined for w in ["mining", "mineral", "wear", "ceramic"]):
        return "mining_wear", "Mining & Wear Solutions"
    if any(w in combined for w in ["filter", "coffee", "tea", "beverage", "biodegradable"]):
        return "eco_consumables", "Eco-Friendly Consumables"

    # Default: use first meaningful words from buyer_type
    label = buyer_type[:50].strip().title()
    key   = re.sub(r'\W+', '_', buyer_type[:30].lower()).strip('_')
    return key or "general", label or "General Industrial"


# ---------------------------------------------------------------------------
# Market scan — one per sector
# ---------------------------------------------------------------------------

async def scan_sector(sector: dict, geography: str = "Denmark, Scandinavia, Northern Europe") -> list[dict]:
    """
    Run a grounded market intelligence scan for one sector.
    Returns a list of structured signals.
    """
    now_str = datetime.now(timezone.utc).strftime("%B %Y")
    cutoff_year = datetime.now(timezone.utc).year - 1

    suppliers_str = ", ".join(sector["suppliers"]) if sector["suppliers"] else "Jason's suppliers"

    prompt = f"""You are STRATAGORA — the market intelligence layer of STRATAGENT.
Your mission: surface ACTIONABLE market signals in a specific sector that create sales opportunities.

TODAY: {now_str}
SECTOR: {sector["sector_label"]}
GEOGRAPHY: {geography}
SUPPLIERS WATCHING THIS SECTOR: {suppliers_str}
BUYER TYPE: {sector["buyer_type"]}
USE CASE: {sector["use_case"]}

Search the web for current signals in this sector from {cutoff_year}–{datetime.now(timezone.utc).year}.

Look specifically for:
1. CAPEX announcements — new facilities, expansions, capital investment programmes
2. TENDER — active procurement notices, framework agreements being established
3. REGULATORY — new compliance requirements, standards updates, deadlines approaching
4. SECTOR_TREND — technology shifts, sustainability mandates, market consolidation
5. LEADERSHIP_CHANGE — new procurement heads, operations directors, sustainability officers
6. STRATEGIC_SHIFT — M&A, new market entry, partnerships that create procurement need
7. NEWS_EVENT — major contracts awarded, facility inaugurations, policy announcements

SIGNAL QUALITY RULES:
- Every signal must be from {cutoff_year} or {datetime.now(timezone.utc).year}
- Every signal must be specific — name the company, facility, amount, or regulation
- A "trend" signal must name at least one concrete example, not just describe a trend
- Score relevance 0-100 based on: how directly does this create a buying opportunity for the named suppliers?

Return a JSON array of up to 8 signals:
[
  {{
    "signal_type": "CAPEX|TENDER|REGULATORY|SECTOR_TREND|LEADERSHIP_CHANGE|STRATEGIC_SHIFT|NEWS_EVENT",
    "headline": "One sentence — specific enough that Jason knows exactly what this is",
    "detail": "2-3 sentences: what happened, why it matters, what buying opportunity it creates",
    "company_name": "company name or null if sector-wide",
    "timing": "when this was reported or takes effect — must be {cutoff_year} or {datetime.now(timezone.utc).year}",
    "source_url": "URL where this was found, or null",
    "relevance_score": 0-100,
    "relevance_reason": "one sentence: why this is relevant to the named suppliers specifically",
    "action_owner": "STRATASCOUT|STRATADAR|STRATEGIST"
  }}
]

Action owner guidance:
- STRATASCOUT: new companies to hunt (CAPEX/TENDER at companies not yet in pipeline)
- STRATADAR: signals affecting companies already in Watch queue
- STRATEGIST: sector trends and regulatory context for the Monday Brief

Return only the JSON array. No preamble.
"""

    response = await generate_with_grounding(prompt)
    signals = _parse_signal_array(response)

    # Attach sector metadata and generate IDs
    result = []
    expires_at = time.time() + (90 * 86400)  # signals expire in 90 days
    for sig in signals:
        if not sig.get("headline"):
            continue
        signal_id = str(uuid.uuid4())[:12]
        result.append({
            "signal_id":       signal_id,
            "sector":          sector["sector_key"],
            "sector_label":    sector["sector_label"],
            "affected_suppliers": sector["suppliers"],
            "affected_kb_ids": sector["supplier_ids"],
            "signal_type":     sig.get("signal_type", "NEWS_EVENT"),
            "headline":        sig.get("headline", ""),
            "detail":          sig.get("detail", ""),
            "company_name":    sig.get("company_name"),
            "timing":          sig.get("timing", ""),
            "source_url":      sig.get("source_url"),
            "relevance_score": _safe_int(sig.get("relevance_score", 50)),
            "relevance_reason":sig.get("relevance_reason", ""),
            "action_owner":    sig.get("action_owner", "STRATEGIST"),
            "expires_at":      expires_at,
        })

    # Sort by relevance
    result.sort(key=lambda x: x["relevance_score"], reverse=True)
    return result


async def run_full_scan(kbs: list, geography: str = "Denmark, Scandinavia, Northern Europe") -> dict:
    """
    Full STRATAGORA market scan across all KB sectors.
    Stores all signals in Firestore market_intelligence collection.
    Returns summary of what was found.
    """
    import asyncio

    # Derive sectors from KB portfolio
    sectors = _derive_sectors_from_kbs(kbs)
    if not sectors:
        return {
            "sectors_scanned": 0,
            "signals_found": 0,
            "signals_stored": 0,
            "sectors": [],
            "error": "No sectors derived from KBs — ensure Manual Seeds are set",
        }

    # Clear expired signals before adding new ones
    db.clear_expired_signals()

    # Scan each sector (sequential to avoid rate limits)
    all_signals = []
    sector_summaries = []

    for sector in sectors:
        try:
            signals = await scan_sector(sector, geography)
            all_signals.extend(signals)
            sector_summaries.append({
                "sector":        sector["sector_key"],
                "sector_label":  sector["sector_label"],
                "suppliers":     sector["suppliers"],
                "signals_found": len(signals),
                "top_signal":    signals[0]["headline"] if signals else None,
            })
        except Exception as e:
            sector_summaries.append({
                "sector":        sector["sector_key"],
                "sector_label":  sector["sector_label"],
                "suppliers":     sector["suppliers"],
                "signals_found": 0,
                "error":         str(e),
            })

    # Store all signals in Firestore
    stored = 0
    for sig in all_signals:
        try:
            db.save_market_signal(sig["signal_id"], sig)
            stored += 1
        except Exception:
            pass

    return {
        "sectors_scanned": len(sectors),
        "signals_found":   len(all_signals),
        "signals_stored":  stored,
        "sectors":         sector_summaries,
        "top_signals": [
            {
                "headline":       s["headline"],
                "sector_label":   s["sector_label"],
                "relevance_score":s["relevance_score"],
                "action_owner":   s["action_owner"],
            }
            for s in sorted(all_signals, key=lambda x: x["relevance_score"], reverse=True)[:5]
        ],
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "geography":  geography,
    }


async def generate_sector_brief(signals: list) -> str:
    """
    Summarise a set of STRATAGORA signals into a brief paragraph for STRATEGIST.
    Called when generating the Monday Brief.
    """
    if not signals:
        return ""

    signal_list = "\n".join([
        f"- [{s.get('sector_label', '')} / {s.get('signal_type', '')}] {s.get('headline', '')} — {s.get('relevance_reason', '')}"
        for s in signals[:10]
    ])

    prompt = f"""You are STRATAGORA summarising market intelligence for a sales advisor's Monday Brief.

RECENT MARKET SIGNALS:
{signal_list}

Write a 3-5 sentence market intelligence summary:
- What sectors are most active right now?
- What is the single most actionable opportunity?
- What regulatory or trend signal should shape this week's outreach?

Be specific. Name sectors and signal types. No generic observations.
Return only the summary paragraph, no headers.
"""
    return await generate(prompt, temperature=0.3)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_signal_array(response: str) -> list:
    try:
        cleaned = re.sub(r"```(?:json)?\s*", "", response).strip()
        result = json.loads(cleaned)
        return result if isinstance(result, list) else []
    except Exception:
        # Try to find array in response
        start = response.find("[")
        end   = response.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(response[start:end])
            except Exception:
                pass
    return []


def _safe_int(val, default: int = 50) -> int:
    try:
        return max(0, min(100, int(val)))
    except (TypeError, ValueError):
        return default
