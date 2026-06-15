"""
STRATAGENT -- STRATAGORA Agent
Market intelligence layer. Watches sectors relevant to Jason's supplier portfolio
and surfaces signals that feed STRATASCOUT, STRATADAR, and STRATEGIST.

CRAWL PHASE: On-demand scan only. Weekly scheduling in WALK phase.

Signal types -- B2B Industrial:
  CAPEX | TENDER | REGULATORY | SECTOR_TREND | LEADERSHIP_CHANGE |
  STRATEGIC_SHIFT | NEWS_EVENT

Signal types -- Consumer/Retail (added Phase 1):
  MARKET_SATURATION | DEMAND_SIGNAL | CHANNEL_OPPORTUNITY |
  COMPETITOR_SIGNAL | PLATFORM_TREND

Signal flow:
  STRATAGORA -> Firestore market_intelligence
  STRATEGIST reads market_intelligence for Monday Brief context
  (STRATADAR + STRATASCOUT integration in WALK phase)
"""
import json
import re
import time
import uuid
from datetime import datetime, timezone

from services.gemini import generate_with_grounding, generate, generate_grounded_with_vision
from services import firestore as db



# ---------------------------------------------------------------------------
# JSON parsing helpers
# ---------------------------------------------------------------------------

def _parse_signal_array(text: str) -> list:
    """
    Extract a JSON array of signal dicts from a Gemini response.
    Handles markdown code fences and leading/trailing prose.
    Returns an empty list on any parse error.
    """
    if not text:
        return []
    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    # Try to find the outermost [ ... ] block
    start = cleaned.find("[")
    end   = cleaned.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        result = json.loads(cleaned[start:end + 1])
        if isinstance(result, list):
            return result
    except (json.JSONDecodeError, ValueError):
        pass
    return []


def _safe_int(value, default: int = 0) -> int:
    """Safely coerce a value to int; return default on failure."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

B2B_SIGNAL_TYPES = {
    "CAPEX", "TENDER", "REGULATORY", "SECTOR_TREND",
    "LEADERSHIP_CHANGE", "STRATEGIC_SHIFT", "NEWS_EVENT",
}

CONSUMER_SIGNAL_TYPES = {
    "MARKET_SATURATION", "DEMAND_SIGNAL", "CHANNEL_OPPORTUNITY",
    "COMPETITOR_SIGNAL", "PLATFORM_TREND",
}

ALL_SIGNAL_TYPES = B2B_SIGNAL_TYPES | CONSUMER_SIGNAL_TYPES

# Keywords that identify a consumer/retail KB from its Manual Seed
_CONSUMER_KEYWORDS = [
    "gift", "retail", "poster", "art print", "wall art", "novelty", "collectible",
    "consumer", "e-commerce", "etsy", "amazon", "redbubble", "society6", "zazzle",
    "print on demand", "fandom", "pop culture", "merchandise", "merch", "pet product",
    "dog lover", "cat lover", "hobby", "lifestyle", "home decor", "greeting card",
    "sticker", "apparel", "souvenir", "gift shop", "specialty retail",
]


# ---------------------------------------------------------------------------
# KB type detection
# ---------------------------------------------------------------------------

def _is_consumer_retail_kb(kb: dict) -> bool:
    """
    Detect whether a KB is a consumer/retail product supplier vs B2B industrial.
    Uses Manual Seed buyer_type, use_case, and product_plain as signals.
    Returns True if consumer/retail keywords are found.
    """
    seed = kb.get("manual_seed", {})
    profile = kb.get("profile", {})

    combined = " ".join([
        str(seed.get("buyer_type", "")),
        str(seed.get("use_case", "")),
        str(seed.get("product_plain", "")),
        str(profile.get("buyer_profiles", "")),
        str(profile.get("product_catalogue", "")),
    ]).lower()

    return any(kw in combined for kw in _CONSUMER_KEYWORDS)


# ---------------------------------------------------------------------------
# Sector derivation -- reads KBs to build watchlist
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
                "scan_mode":     _get_scan_mode(buyer_type, use_case, product),
            }

        if company and company not in sectors[sector_key]["suppliers"]:
            sectors[sector_key]["suppliers"].append(company)
        if supplier_id and supplier_id not in sectors[sector_key]["supplier_ids"]:
            sectors[sector_key]["supplier_ids"].append(supplier_id)

    return list(sectors.values())


def _get_scan_mode(buyer_type: str, use_case: str, product: str) -> str:
    """
    Returns 'consumer_retail' or 'b2b_industrial' based on seed text.
    Used to select the right scan prompt at run time.
    """
    combined = (str(buyer_type) + " " + str(use_case) + " " + str(product)).lower()
    if any(kw in combined for kw in _CONSUMER_KEYWORDS):
        return "consumer_retail"
    return "b2b_industrial"


def _classify_sector(buyer_type: str, use_case: str, product: str) -> tuple[str, str]:
    """
    Map buyer_type + use_case text to a canonical sector.
    Returns (sector_key, sector_label).
    """
    combined = (str(buyer_type) + " " + str(use_case) + " " + str(product)).lower()

    # -- Consumer / Retail sectors (checked first -- more specific) --
    if any(w in combined for w in ["poster", "wall art", "art print", "print on demand"]):
        return "consumer_art_prints", "Consumer Art Prints & Posters"
    if any(w in combined for w in ["novelty", "gift shop", "fandom", "pop culture", "merch", "merchandise", "collectible"]):
        return "novelty_gifts", "Novelty Gifts & Pop Culture Merchandise"
    if any(w in combined for w in ["pet product", "dog lover", "cat lover", "pet gift", "pet accessory"]):
        return "pet_gifts", "Pet Products & Animal-Themed Gifts"
    if any(w in combined for w in ["home decor", "lifestyle", "interior", "home gift"]):
        return "home_decor_gifts", "Home Decor & Lifestyle Gifts"
    if any(w in combined for w in ["apparel", "clothing", "t-shirt", "wearable"]):
        return "consumer_apparel", "Consumer Apparel & Wearables"
    if any(w in combined for w in ["greeting card", "stationery", "sticker"]):
        return "stationery_print", "Stationery, Cards & Print Products"

    # -- B2B Industrial sectors --
    if any(w in combined for w in ["biogas", "hydrogen", "co2", "carbon capture", "electrolyser"]):
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
    buyer_str = str(buyer_type)
    label = buyer_str[:50].strip().title()
    key   = re.sub(r'\W+', '_', buyer_str[:30].lower()).strip('_')
    return key or "general", label or "General Industrial"


# ---------------------------------------------------------------------------
# B2B market scan -- one per sector
# ---------------------------------------------------------------------------

async def scan_sector(sector: dict, geography: str = "Denmark, Scandinavia, Northern Europe") -> list[dict]:
    """
    Run a grounded market intelligence scan for one B2B sector.
    Returns a list of structured signals.
    """
    now_str = datetime.now(timezone.utc).strftime("%B %Y")
    cutoff_year = datetime.now(timezone.utc).year - 1

    suppliers_str = ", ".join(sector["suppliers"]) if sector["suppliers"] else "Jason's suppliers"

    prompt = f"""You are STRATAGORA -- the market intelligence layer of STRATAGENT.
Your mission: surface ACTIONABLE market signals in a specific sector that create sales opportunities.

TODAY: {now_str}
SECTOR: {sector["sector_label"]}
GEOGRAPHY: {geography}
SUPPLIERS WATCHING THIS SECTOR: {suppliers_str}
BUYER TYPE: {sector["buyer_type"]}
USE CASE: {sector["use_case"]}

Search the web for current signals in this sector from {cutoff_year}-{datetime.now(timezone.utc).year}.

Look specifically for:
1. CAPEX announcements -- new facilities, expansions, capital investment programmes
2. TENDER -- active procurement notices, framework agreements being established
3. REGULATORY -- new compliance requirements, standards updates, deadlines approaching
4. SECTOR_TREND -- technology shifts, sustainability mandates, market consolidation
5. LEADERSHIP_CHANGE -- new procurement heads, operations directors, sustainability officers
6. STRATEGIC_SHIFT -- M&A, new market entry, partnerships that create procurement need
7. NEWS_EVENT -- major contracts awarded, facility inaugurations, policy announcements

SIGNAL QUALITY RULES:
- Every signal must be from {cutoff_year} or {datetime.now(timezone.utc).year}
- Every signal must be specific -- name the company, facility, amount, or regulation
- A "trend" signal must name at least one concrete example, not just describe a trend
- Score relevance 0-100 based on: how directly does this create a buying opportunity for the named suppliers?

Return a JSON array of up to 8 signals:
[
  {{
    "signal_type": "CAPEX|TENDER|REGULATORY|SECTOR_TREND|LEADERSHIP_CHANGE|STRATEGIC_SHIFT|NEWS_EVENT",
    "headline": "One sentence -- specific enough that Jason knows exactly what this is",
    "detail": "2-3 sentences: what happened, why it matters, what buying opportunity it creates",
    "company_name": "company name or null if sector-wide",
    "timing": "when this was reported or takes effect -- must be {cutoff_year} or {datetime.now(timezone.utc).year}",
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

    return _attach_metadata(signals, sector)


# ---------------------------------------------------------------------------
# Consumer / Retail product market scan
# ---------------------------------------------------------------------------

async def scan_product_market(
    supplier_name: str,
    product_plain: str,
    buyer_type: str,
    use_case: str,
    channels: list[str] | None = None,
    geography: str = "Global",
    product_images: list | None = None,
) -> list[dict]:
    """
    Run a grounded product market intelligence scan for a consumer/retail supplier.
    Evaluates channel saturation, demand signals, competitor density, and
    distribution opportunities for a specific product.
    Returns a list of structured consumer signals.
    """
    now_str = datetime.now(timezone.utc).strftime("%B %Y")
    cutoff_year = datetime.now(timezone.utc).year - 1

    # Build channel context -- default to the main consumer retail platforms
    if not channels:
        channels = [
            "Etsy", "Amazon Marketplace", "Redbubble", "Society6",
            "Zazzle", "Specialty retail (gift shops, pet stores, fandom stores)",
            "Print-on-demand platforms", "Social commerce (Instagram, Pinterest, TikTok Shop)",
        ]
    channels_str = "\n".join(f"  - {c}" for c in channels)

    sector = {
        "sector_key":   "consumer_product_scan",
        "sector_label": f"Consumer Product Market: {product_plain[:60]}",
        "suppliers":    [supplier_name],
        "supplier_ids": [],
    }

    prompt = f"""You are STRATAGORA -- the market intelligence layer of STRATAGENT, running a PRODUCT MARKET SCAN.
Your mission: give a clear, data-driven picture of market conditions for a specific consumer product.

TODAY: {now_str}
SUPPLIER: {supplier_name}
PRODUCT: {product_plain}
BUYER TYPE: {buyer_type}
USE CASE / CONTEXT: {use_case}
GEOGRAPHY: {geography}
DISTRIBUTION CHANNELS TO EVALUATE:
{channels_str}

Search the web for current market intelligence about this product category and these channels.

Evaluate and return signals across FIVE types:

1. MARKET_SATURATION
   -- How crowded is each channel for this product type?
   -- Look for: number of competing listings, average review counts, price compression signals,
      platform algorithm changes that reward or penalise new sellers.
   -- Score 0-100: 80+ = very crowded (hard to enter), 40-60 = moderate, <40 = open opportunity.

2. DEMAND_SIGNAL
   -- Is there growing consumer appetite for this product type?
   -- Look for: Google Trends data, social media virality, seasonal demand patterns,
      gift guide features, press coverage, influencer engagement, search volume trends.

3. CHANNEL_OPPORTUNITY
   -- Which specific channels are underserved for this product type?
   -- Look for: niche retailers with no clear supplier of this product,
      emerging platforms where competition hasn't arrived yet,
      wholesale buyer categories that buy products like this regularly.

4. COMPETITOR_SIGNAL
   -- Who is already selling this product type, and where are the gaps?
   -- Look for: top-selling competitors, their price points, review scores, delivery models,
      product variants that are NOT being offered (format, size, style gaps).

5. PLATFORM_TREND
   -- Are any relevant platforms changing their policies, algorithms, or commission structures?
   -- Look for: print-on-demand fee changes, marketplace rule updates, new affiliate
      programme launches, platform growth or decline signals.

SIGNAL QUALITY RULES:
- Every signal must reference real, verifiable data from {cutoff_year}-{now_str}
- Be specific -- name the platform, competitor, or trend with concrete evidence
- Do NOT invent statistics. If you cannot find a specific figure, describe what you observed qualitatively
- MARKET_SATURATION signals must include a saturation_score (0-100) in the detail field

Return a JSON array of up to 10 signals:
[
  {{
    "signal_type": "MARKET_SATURATION|DEMAND_SIGNAL|CHANNEL_OPPORTUNITY|COMPETITOR_SIGNAL|PLATFORM_TREND",
    "channel": "which specific channel or platform this signal is about",
    "headline": "one sentence -- concrete and specific",
    "detail": "2-4 sentences: what you found, what it means for this product, what action it suggests",
    "saturation_score": 0-100 or null (MARKET_SATURATION only -- 100 = completely saturated),
    "timing": "when this data is from",
    "source_url": "URL or null",
    "relevance_score": 0-100,
    "relevance_reason": "why this matters specifically for {supplier_name}'s {product_plain}",
    "action_owner": "STRATALINK|STRATASCOUT|STRATEGIST"
  }}
]

Action owner guidance:
- STRATALINK: affiliate programme or partner channel worth investigating
- STRATASCOUT: a specific retailer or distributor to hunt as a prospect
- STRATEGIST: market context for the Monday Brief and overall strategy

Return only the JSON array. No preamble.
"""

    # If product images are available, inject a visual context note and use vision-grounded call.
    # Gemini can see the actual product, which makes COMPETITOR_SIGNAL and
    # CHANNEL_OPPORTUNITY signals significantly more accurate.
    if product_images:
        visual_note = (
            "\nPRODUCT IMAGE PROVIDED: You can see the actual product above. "
            "Use the visual style, art quality, and aesthetic to inform your "
            "COMPETITOR_SIGNAL and CHANNEL_OPPORTUNITY signals -- specifically note "
            "how the product's visual identity compares to what you know of competing "
            "products on each channel. A visually distinctive, high-quality product "
            "has more channel headroom than a commodity-looking one.\n"
        )
        prompt = prompt + visual_note
        response = await generate_grounded_with_vision(prompt, product_images)
    else:
        response = await generate_with_grounding(prompt)
    signals = _parse_signal_array(response)

    result = []
    expires_at = time.time() + (90 * 86400)
    for sig in signals:
        if not sig.get("headline"):
            continue
        signal_id = str(uuid.uuid4())[:12]
        result.append({
            "signal_id":          signal_id,
            "sector":             "consumer_product_scan",
            "sector_label":       sector["sector_label"],
            "affected_suppliers": [supplier_name],
            "affected_kb_ids":    [],
            "signal_type":        sig.get("signal_type", "DEMAND_SIGNAL"),
            "channel":            sig.get("channel", ""),
            "headline":           sig.get("headline", ""),
            "detail":             sig.get("detail", ""),
            "saturation_score":   _safe_int(sig.get("saturation_score")) if sig.get("saturation_score") is not None else None,
            "timing":             sig.get("timing", ""),
            "source_url":         sig.get("source_url"),
            "relevance_score":    _safe_int(sig.get("relevance_score", 50)),
            "relevance_reason":   sig.get("relevance_reason", ""),
            "action_owner":       sig.get("action_owner", "STRATEGIST"),
            "expires_at":         expires_at,
            "scan_mode":          "consumer_retail",
        })

    result.sort(key=lambda x: x["relevance_score"], reverse=True)
    return result


async def run_product_scan(kb: dict, channels: list[str] | None = None, geography: str = "") -> dict:
    """
    Run a targeted product market scan for a single consumer/retail KB.
    Stores signals in Firestore market_intelligence collection.
    Returns scan summary with per-channel saturation scores.
    """
    seed = kb.get("manual_seed", {})
    profile = kb.get("profile", {})
    company = kb.get("company_name", "Unknown Supplier")
    supplier_id = kb.get("id") or kb.get("supplier_id", "")

    # Resolve geography: explicit param > KB supplier_location > global default
    supplier_location = kb.get("supplier_location", "")
    effective_geography = geography or supplier_location or "Global"
    if supplier_location and supplier_location not in effective_geography:
        # Append origin context so Gemini knows where product ships from
        effective_geography = f"{effective_geography} (supplier origin: {supplier_location})"

    product_plain = seed.get("product_plain") or profile.get("product_catalogue", "")
    buyer_type    = seed.get("buyer_type") or profile.get("buyer_profiles", "")
    use_case      = seed.get("use_case") or profile.get("operational_context", "")

    if not product_plain:
        return {
            "supplier": company,
            "signals_found": 0,
            "signals_stored": 0,
            "error": "No product description found. Set Manual Seed product_plain first.",
        }

    # Fetch stored product images to pass as visual context to the scan
    product_images = []
    if supplier_id:
        try:
            stored_images = db.get_product_images(supplier_id)
            # Pass up to 3 images -- enough visual context without overloading the prompt
            product_images = [
                {"data": img["data"], "mime_type": img.get("content_type", "image/jpeg")}
                for img in stored_images[:3]
                if img.get("data")
            ]
        except Exception:
            pass  # Images are enrichment, never required

    signals = await scan_product_market(
        supplier_name=company,
        product_plain=product_plain,
        buyer_type=buyer_type,
        use_case=use_case,
        channels=channels,
        geography=effective_geography,
        product_images=product_images or None,
    )

    # Attach supplier_id now that we have it
    for sig in signals:
        if supplier_id:
            sig["affected_kb_ids"] = [supplier_id]

    # Store in Firestore
    stored = 0
    for sig in signals:
        try:
            db.save_market_signal(sig["signal_id"], sig)
            stored += 1
        except Exception:
            pass

    # Build per-channel saturation summary
    saturation_by_channel: dict[str, int] = {}
    for sig in signals:
        if sig["signal_type"] == "MARKET_SATURATION" and sig.get("saturation_score") is not None:
            ch = sig.get("channel", "Unknown Channel")
            saturation_by_channel[ch] = sig["saturation_score"]

    # Identify best opportunities (CHANNEL_OPPORTUNITY + low saturation channels)
    opportunities = [
        s for s in signals if s["signal_type"] == "CHANNEL_OPPORTUNITY"
    ]
    open_channels = [
        ch for ch, score in saturation_by_channel.items() if score < 50
    ]

    return {
        "supplier":            company,
        "supplier_id":         supplier_id,
        "product":             product_plain,
        "geography":           geography,
        "signals_found":       len(signals),
        "signals_stored":      stored,
        "saturation_by_channel": saturation_by_channel,
        "open_channels":       open_channels,
        "opportunity_count":   len(opportunities),
        "top_signals": [
            {
                "signal_type":     s["signal_type"],
                "channel":         s.get("channel", ""),
                "headline":        s["headline"],
                "relevance_score": s["relevance_score"],
                "saturation_score":s.get("saturation_score"),
                "action_owner":    s["action_owner"],
            }
            for s in signals[:8]
        ],
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "scan_mode":  "consumer_retail",
    }


# ---------------------------------------------------------------------------
# Full portfolio scan (B2B + consumer, auto-routed by sector scan_mode)
# ---------------------------------------------------------------------------

async def run_full_scan(kbs: list, geography: str = "Denmark, Scandinavia, Northern Europe") -> dict:
    """
    Full STRATAGORA market scan across all KB sectors.
    Auto-detects B2B vs consumer/retail KBs and routes to the right scan function.
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
            "error": "No sectors derived from KBs -- ensure Manual Seeds are set",
        }

    # Clear expired signals before adding new ones
    db.clear_expired_signals()

    # Limit to 5 sectors max to stay within reasonable time budget
    sectors = sectors[:5]

    SECTOR_TIMEOUT = 50  # seconds per sector

    async def scan_with_timeout(sector: dict) -> tuple[dict, list]:
        try:
            mode = sector.get("scan_mode", "b2b_industrial")
            if mode == "consumer_retail":
                # Find the first matching KB for this sector to pass full context
                matching_kb = next(
                    (kb for kb in kbs if kb.get("company_name") in sector["suppliers"]),
                    None
                )
                if matching_kb:
                    # Run product market scan, but don't re-store (handled below)
                    signals = await asyncio.wait_for(
                        scan_product_market(
                            supplier_name=sector["suppliers"][0],
                            product_plain=(matching_kb.get("manual_seed") or {}).get("product_plain", ""),
                            buyer_type=sector["buyer_type"],
                            use_case=sector["use_case"],
                        ),
                        timeout=SECTOR_TIMEOUT
                    )
                else:
                    signals = []
            else:
                signals = await asyncio.wait_for(
                    scan_sector(sector, geography),
                    timeout=SECTOR_TIMEOUT
                )
            return sector, signals
        except asyncio.TimeoutError:
            return sector, []
        except Exception:
            return sector, []

    results = await asyncio.gather(*[scan_with_timeout(s) for s in sectors])

    all_signals = []
    sector_summaries = []
    for sector, signals in results:
        all_signals.extend(signals)
        sector_summaries.append({
            "sector":        sector["sector_key"],
            "sector_label":  sector["sector_label"],
            "suppliers":     sector["suppliers"],
            "scan_mode":     sector.get("scan_mode", "b2b_industrial"),
            "signals_found": len(signals),
            "top_signal":    signals[0]["headline"] if signals else None,
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
    Handles both B2B industrial and consumer/retail signal types.
    Called when generating the Monday Brief.
    """
    if not signals:
        return ""

    signal_list = "\n".join([
        f"- [{s.get('sector_label', '')} / {s.get('signal_type', '')}] {s.get('headline', '')} -- {s.get('relevance_reason', '')}"
        for s in signals[:10]
    ])

    prompt = f"""You are STRATAGORA summarising market intelligence for a sales advisor's Monday Brief.
Signals may be from B2B industrial sectors OR consumer/retail product markets.

RECENT MARKET SIGNALS:
{signal_list}

Write a 3-5 sentence market intelligence summary:
- What sectors are most active right now?
- What is the single most actionable opportunity?
- What signal should shape this week's outreach or channel strategy?

Be specific. Name sectors and signal types. No generic observations.
Return only the summary paragraph, no headers.
"""
    return await generate(prompt, temperature=0.3)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _attach_metadata(signals: list, sector: dict) -> list:
    """
    Attach sector metadata and generate IDs for B2B scan results.
    """
    result = []
    expires_at = time.time() + (90 * 86400)
    for sig in signals:
        if not sig.get("headline"):
            continue
        signal_id = str(uuid.uuid4())[:12]
        result.append({
            "signal_id":        signal_id,
            "sector":           sector["sector_key"],
            "sector_label":     sector["sector_label"],
            "affected_suppliers": sector.get("suppliers", []),
            "affected_kb_ids":    sector.get("supplier_ids", []),
            "signal_type":        sig.get("signal_type", "SECTOR_TREND"),
            "channel":            "",
            "headline":           sig.get("headline", ""),
            "detail":             sig.get("detail", ""),
            "saturation_score":   None,
            "timing":             sig.get("timing", ""),
            "source_url":         sig.get("source_url"),
            "relevance_score":    _safe_int(sig.get("relevance_score", 50)),
            "relevance_reason":   sig.get("relevance_reason", ""),
            "action_owner":       sig.get("action_owner", "STRATEGIST"),
            "company_name":       sig.get("company_name"),
            "expires_at":         expires_at,
            "scan_mode":          "b2b_industrial",
        })

    result.sort(key=lambda x: x["relevance_score"], reverse=True)
    return result
