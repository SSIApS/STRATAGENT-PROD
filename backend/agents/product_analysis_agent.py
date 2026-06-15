"""
STRATAGENT -- Product Analysis Agent
Handles all four product archetypes through a single structured pipeline.

Archetypes:
  consumer_art_novelty        -- art prints, posters, collectibles, novelty gifts
  consumer_design_product     -- lifestyle/design objects, sustainable consumer goods
  b2b_training_professional   -- training tools, card decks, certification aids
  b2b_industrial_supply       -- components, materials, industrial systems

Pipeline:
  Intake -> Archetype routing (keyword -> Gemini fallback) -> STRATAGORA scan -> Vault -> Brief

Signal types by archetype:
  consumer_art_novelty:
    MARKET_SATURATION | DEMAND_SIGNAL | CHANNEL_OPPORTUNITY |
    COMPETITOR_SIGNAL | PLATFORM_TREND | SEASONAL_SIGNAL

  consumer_design_product:
    DISTRIBUTION_OPPORTUNITY | DESIGN_SIGNAL | HOSPITALITY_SIGNAL |
    SUSTAINABILITY_SIGNAL | COMPETITOR_SIGNAL | PRICING_SIGNAL

  b2b_training_professional:
    BUYER_SIGNAL | CERTIFICATION_OPPORTUNITY | COMPETITOR_SIGNAL |
    INDUSTRY_TREND | LICENSING_OPPORTUNITY | EVENT_SIGNAL

  b2b_industrial_supply:
    CAPEX | TENDER | REGULATORY | SECTOR_TREND |
    LEADERSHIP_CHANGE | STRATEGIC_SHIFT | NEWS_EVENT
"""
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from services.gemini import generate_with_grounding, generate
from services import firestore as db


# ---------------------------------------------------------------------------
# Signal type definitions per archetype
# ---------------------------------------------------------------------------

ARCHETYPE_SIGNALS = {
    "consumer_art_novelty": [
        "MARKET_SATURATION", "DEMAND_SIGNAL", "CHANNEL_OPPORTUNITY",
        "COMPETITOR_SIGNAL", "PLATFORM_TREND", "SEASONAL_SIGNAL",
    ],
    "consumer_design_product": [
        "DISTRIBUTION_OPPORTUNITY", "DESIGN_SIGNAL", "HOSPITALITY_SIGNAL",
        "SUSTAINABILITY_SIGNAL", "COMPETITOR_SIGNAL", "PRICING_SIGNAL",
    ],
    "b2b_training_professional": [
        "BUYER_SIGNAL", "CERTIFICATION_OPPORTUNITY", "COMPETITOR_SIGNAL",
        "INDUSTRY_TREND", "LICENSING_OPPORTUNITY", "EVENT_SIGNAL",
    ],
    "b2b_industrial_supply": [
        "CAPEX", "TENDER", "REGULATORY", "SECTOR_TREND",
        "LEADERSHIP_CHANGE", "STRATEGIC_SHIFT", "NEWS_EVENT",
    ],
}

ARCHETYPE_LABELS = {
    "consumer_art_novelty": "Consumer Art / Novelty",
    "consumer_design_product": "Consumer Design Product",
    "b2b_training_professional": "B2B Training / Professional",
    "b2b_industrial_supply": "B2B Industrial Supply",
}


# ---------------------------------------------------------------------------
# Prompt builders per archetype
# ---------------------------------------------------------------------------

def _build_art_novelty_prompt(product: dict, scan_focus: str = '') -> str:
    _focus = ("\n\nSCAN FOCUS (agent priority -- read first):\n" + scan_focus) if scan_focus else ""
    return f"""
You are STRATAGORA, a market intelligence agent for STRATAGENT (Strategic Sales International ApS).

Analyse the following consumer art/novelty product and return structured market intelligence.

PRODUCT PROFILE:
Name: {product.get('product_name')}
Category: {product.get('category')}
Theme/Subject: {product.get('theme_subject')}
Price point: {product.get('price_point')}
Production method: {product.get('production_method')}
Target buyer: {product.get('buyer_type')}
Geography: {product.get('geography', 'US, Global')}
{_focus}

CHANNELS TO EVALUATE (score saturation 0-100 per channel, 100=fully saturated):
Etsy, Amazon POD/FBA, Redbubble, Society6, TikTok Shop, Instagram Shop,
Specialty Gift Retail (physical), Fandom/Pop Culture Stores, Independent Boutiques

Return a JSON array of signal objects. Each signal must have:
  signal_type: one of MARKET_SATURATION | DEMAND_SIGNAL | CHANNEL_OPPORTUNITY |
               COMPETITOR_SIGNAL | PLATFORM_TREND | SEASONAL_SIGNAL
  channel: the specific channel or "general" if not channel-specific
  saturation_score: integer 0-100 (for MARKET_SATURATION signals only, else null)
  headline: 1 sentence summary of the signal
  detail: 2-4 sentences with specific, grounded intelligence
  action: what SSI/the client should do with this signal
  urgency: HIGH | MEDIUM | LOW
  confidence: HIGH | MEDIUM | LOW (based on how grounded the data is)

Return ONLY the JSON array. No preamble, no markdown fences.
""".strip()


def _build_design_product_prompt(product: dict, scan_focus: str = '') -> str:
    _focus = ("\n\nSCAN FOCUS (agent priority -- read first):\n" + scan_focus) if scan_focus else ""
    return f"""
You are STRATAGORA, a market intelligence agent for STRATAGENT (Strategic Sales International ApS).

Analyse the following consumer design product for distribution channel opportunities,
retail fit, and market positioning intelligence.

PRODUCT PROFILE:
Name: {product.get('product_name')}
Description: {product.get('description', 'Not specified')}
Category: {product.get('category')}
Design story: {product.get('design_story')}
Sustainability claims: {product.get('sustainability_claims', 'None specified')}
Retail price point: {product.get('price_point')}
Production location: {product.get('production_location', 'Not specified')}
B2B potential (hospitality/corporate): {product.get('b2b_potential', 'Unknown')}
Target consumer: {product.get('target_consumer')}
Geography: {product.get('geography', 'Scandinavia, Europe, Global')}
{_focus}

EVALUATE:
- Retail channel fit: eco/sustainable retailers, Nordic design stores, bathroom/lifestyle
  specialists, gift shops, department stores, premium D2C
- Hospitality B2B channel: hotel chains, spa operators, corporate gifting programmes
- Design media: which publications, blogs, influencers cover this product intersection
- Sustainability retail landscape: which eco retailers are actively buying new products
- Competitor positioning: comparable products, price points, distribution
- Price architecture: retail, wholesale, and hospitality tier benchmarks

Return a JSON array of signal objects. Each signal must have:
  signal_type: one of DISTRIBUTION_OPPORTUNITY | DESIGN_SIGNAL | HOSPITALITY_SIGNAL |
               SUSTAINABILITY_SIGNAL | COMPETITOR_SIGNAL | PRICING_SIGNAL
  channel: the specific channel, retailer type, or "general"
  headline: 1 sentence summary
  detail: 2-4 sentences with specific, grounded intelligence
  action: concrete next step for SSI/the client
  urgency: HIGH | MEDIUM | LOW
  confidence: HIGH | MEDIUM | LOW

Return ONLY the JSON array. No preamble, no markdown fences.
""".strip()


def _build_training_product_prompt(product: dict, scan_focus: str = '') -> str:
    industries = ", ".join(product.get('target_industries', ['Process industry']))
    functions = ", ".join(product.get('target_functions', ['Training managers', 'HSE', 'Operators']))
    _focus = ("\n\nSCAN FOCUS (agent priority -- read first):\n" + scan_focus) if scan_focus else ""
    return f"""
You are STRATAGORA, a market intelligence agent for STRATAGENT (Strategic Sales International ApS).

Analyse the following B2B training/professional product for market opportunity,
certification pathways, enterprise licensing potential, and buyer access strategy.

PRODUCT PROFILE:
Name: {product.get('product_name')}
Description: {product.get('description', 'Not specified')}
Training subject: {product.get('training_subject')}
Format: {product.get('format', 'Physical')}
Target industries: {industries}
Target job functions: {functions}
Certification relevance: {product.get('certification_relevance', 'Not specified')}
Anchor client: {product.get('anchor_client', 'Not specified')}
Licensing model: {product.get('licensing_model', 'Per unit')}
Price point (unit): {product.get('price_point_unit', 'Not specified')}
Price point (site licence): {product.get('price_point_site', 'Not specified')}
Companion app: {product.get('companion_app', 'No')}
Geography: {product.get('geography', 'Europe, Global')}
{_focus}

EVALUATE:
- Industry vertical prioritisation: training budget size, regulatory pressure, workforce scale
- Competing training formats: online courses, manuals, instructor-led, simulation -- and gaps
- Certification body landscape: ISA, IChemE, national HSE bodies, industry associations
- Enterprise licensing: multi-site operators, procurement entry points, training budget cycles
- Regulatory trends: new regulations driving training demand in target industries
- Trade shows and events: where training buyers congregate
- LinkedIn buyer signals: training manager and HSE decision-maker activity

Return a JSON array of signal objects. Each signal must have:
  signal_type: one of BUYER_SIGNAL | CERTIFICATION_OPPORTUNITY | COMPETITOR_SIGNAL |
               INDUSTRY_TREND | LICENSING_OPPORTUNITY | EVENT_SIGNAL
  industry_vertical: the specific industry or "general"
  headline: 1 sentence summary
  detail: 2-4 sentences with specific, grounded intelligence
  action: concrete next step for SSI/the client
  urgency: HIGH | MEDIUM | LOW
  confidence: HIGH | MEDIUM | LOW

Return ONLY the JSON array. No preamble, no markdown fences.
""".strip()


def _build_industrial_standalone_prompt(product: dict, scan_focus: str = '') -> str:
    """Standalone industrial scan -- no KB required. Works for prototypes with no history."""
    _focus_block = (
        "\nSCAN FOCUS (agent priority -- read first):\n" + scan_focus + "\n"
    ) if scan_focus else ""
    return (
        "You are STRATAGORA, a market intelligence agent for STRATAGENT "
        "(Strategic Sales International ApS).\n\n"
        "Analyse the following B2B industrial/technical product for market opportunity, "
        "sector demand, competitive landscape, and procurement signals. "
        "This is a standalone product scan with no existing supplier history -- "
        "base your analysis on current market knowledge.\n\n"
        "PRODUCT PROFILE:\n"
        f"Name: {product.get('product_name')}\n"
        f"Description: {product.get('description', 'Not specified')}\n"
        + _focus_block
        + f"Geography: {product.get('geography', 'Europe, Global')}\n\n"
        "EVALUATE:\n"
        "- Sector demand: which industries need this product type now and why\n"
        "- Procurement signals: CAPEX cycles, tenders, regulatory drivers\n"
        "- Competitive landscape: incumbent suppliers, pricing norms, differentiation\n"
        "- Strategic opportunity: whitespace, new entrant viability\n"
        "- Key buyer personas and current pain points\n\n"
        "Return a JSON array of signal objects. Each signal must have:\n"
        "  signal_type: one of CAPEX | TENDER | REGULATORY | SECTOR_TREND |\n"
        "               LEADERSHIP_CHANGE | STRATEGIC_SHIFT | NEWS_EVENT\n"
        "  industry_vertical: the specific industry sector or 'general'\n"
        "  headline: 1 sentence summary\n"
        "  detail: 2-4 sentences with specific, grounded intelligence\n"
        "  action: concrete next step\n"
        "  urgency: HIGH | MEDIUM | LOW\n"
        "  confidence: HIGH | MEDIUM | LOW\n\n"
        "Return ONLY the JSON array. No preamble, no markdown fences."
    )


# ---------------------------------------------------------------------------
# Gemini archetype classifier (fallback when keyword router finds no match)
# ---------------------------------------------------------------------------

async def classify_archetype_with_gemini(description: str, product_name: str = "") -> Optional[str]:
    """
    Use Gemini to classify a product into one of the four PAM archetypes.
    Called when the keyword router returns None (no token match).
    Works for prototypes and novel products with no comparable history.
    Returns None on failure -- caller should default to consumer_design_product.
    """
    prompt = (
        "Classify this product into exactly one archetype from the list below.\n\n"
        "ARCHETYPES:\n"
        "consumer_art_novelty -- art prints, posters, collectibles, novelty gifts, fandom items\n"
        "consumer_design_product -- lifestyle/design objects, sustainable consumer goods, home "
        "accessories, personal care, bathroom accessories, gifts with design story\n"
        "b2b_training_professional -- training tools, card decks, certification aids, "
        "professional development materials, technical reference products\n"
        "b2b_industrial_supply -- industrial components, raw materials, B2B manufacturer "
        "products, engineering supplies, process equipment\n\n"
        f"Product name: {product_name}\n"
        f"Description: {description}\n\n"
        "Reply with ONLY the archetype key, nothing else. Example: consumer_design_product"
    )
    try:
        result = (await generate(prompt)).strip().lower()
        for a in ARCHETYPE_LABELS:
            if a in result:
                return a
    except Exception:
        pass
    return None


def classify_archetype_with_gemini_sync(description: str, product_name: str = "") -> Optional[str]:
    """
    Synchronous wrapper for classify_archetype_with_gemini.
    Used by the router endpoint (sync FastAPI route) during product registration.
    """
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, classify_archetype_with_gemini(description, product_name))
                return future.result(timeout=30)
        else:
            return loop.run_until_complete(classify_archetype_with_gemini(description, product_name))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Signal parser (shared)
# ---------------------------------------------------------------------------

def _parse_signals(text: str) -> list:
    if not text:
        return []
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        result = json.loads(cleaned[start:end + 1])
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, ValueError):
        return []


# ---------------------------------------------------------------------------
# Core scan dispatcher (async -- called from async FastAPI endpoint)
# ---------------------------------------------------------------------------

async def run_product_analysis(product_id: str, trigger_reason: str = "CLIENT_REQUEST", scan_focus: str = "") -> dict:
    """
    Run a full product analysis for the given product_id.
    Pulls product profile from registry, runs the correct scan mode,
    stores result in Analysis Vault, and returns the vault entry.

    trigger_reason must be a valid VALID_TRIGGER_REASONS value.
    Raises ValueError if product not found or trigger reason invalid.
    Works for all archetypes including industrial prototypes with no KB linked.
    """
    product = db.get_product_registry(product_id)
    if not product:
        raise ValueError(f"Product not found in registry: {product_id}")

    archetype = product.get("archetype", "consumer_design_product")

    if trigger_reason not in db.VALID_TRIGGER_REASONS:
        raise ValueError(f"Invalid trigger reason: {trigger_reason}")

    # Build prompt based on archetype
    if archetype == "consumer_art_novelty":
        prompt = _build_art_novelty_prompt(product, scan_focus=scan_focus)
    elif archetype == "consumer_design_product":
        prompt = _build_design_product_prompt(product, scan_focus=scan_focus)
    elif archetype == "b2b_training_professional":
        prompt = _build_training_product_prompt(product, scan_focus=scan_focus)
    else:
        # b2b_industrial_supply -- use STRATAGORA KB scan if a KB is linked,
        # otherwise fall back to standalone description-based scan (no KB required).
        from agents.stratagora_agent import scan_sector
        kb_id = product.get("kb_id") or product.get("supplier_id")
        kb = db.get_knowledge_base(kb_id) if kb_id else None
        if kb:
            signals = await scan_sector(kb)
        else:
            prompt = _build_industrial_standalone_prompt(product, scan_focus=scan_focus)
            raw = await generate_with_grounding(prompt)
            signals = _parse_signals(raw)
            for sig in signals:
                sig["archetype"] = archetype
                sig["product_id"] = product_id
                sig["product_name"] = product.get("product_name")
                sig["generated_at"] = datetime.now(timezone.utc).isoformat()
        analysis = {
            "archetype": archetype,
            "archetype_label": ARCHETYPE_LABELS.get(archetype, archetype),
            "product_name": product.get("product_name"),
            "signals": signals,
            "signal_count": len(signals),
            "scan_timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return db.save_vault_entry(
            product_id=product_id,
            analysis=analysis,
            trigger_reason=trigger_reason,
            triggered_by="product_analysis_agent",
        )

    # Run Gemini with grounding (consumer and training archetypes)
    raw = await generate_with_grounding(prompt)
    signals = _parse_signals(raw)

    # Enrich signals with archetype metadata
    for sig in signals:
        sig["archetype"] = archetype
        sig["product_id"] = product_id
        sig["product_name"] = product.get("product_name")
        sig["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Build saturation summary for art/novelty archetype
    saturation_by_channel = {}
    if archetype == "consumer_art_novelty":
        for sig in signals:
            if sig.get("signal_type") == "MARKET_SATURATION" and sig.get("saturation_score"):
                ch = sig.get("channel", "unknown")
                saturation_by_channel[ch] = sig["saturation_score"]

    analysis = {
        "archetype": archetype,
        "archetype_label": ARCHETYPE_LABELS.get(archetype, archetype),
        "product_name": product.get("product_name"),
        "signals": signals,
        "signal_count": len(signals),
        "saturation_by_channel": saturation_by_channel,
        "open_channels": [
            sig.get("channel") for sig in signals
            if sig.get("signal_type") == "CHANNEL_OPPORTUNITY"
        ],
        "scan_timestamp": datetime.now(timezone.utc).isoformat(),
        "raw_response_length": len(raw) if raw else 0,
        "scan_focus": scan_focus or None,
    }

    return db.save_vault_entry(
        product_id=product_id,
        analysis=analysis,
        trigger_reason=trigger_reason,
        triggered_by="product_analysis_agent",
    )



async def extract_buyer_targets(signals: list, product: dict) -> dict:
    """
    Lightweight Gemini pass on vault signals.
    Extracts named organisations and aggregates sector/channel info
    so the PAM vault can suggest direct FI targets.
    Returns:
      sectors        - deduplicated list of industry verticals from signals
      geography      - product geography string
      suggested_prospects - list of {name, signal_type, rationale, website} dicts
    """
    if not signals:
        return {"sectors": [], "geography": product.get("geography", ""), "suggested_prospects": []}

    # Aggregate sectors directly from signal metadata (no Gemini needed)
    seen = set()
    sectors = []
    for s in signals:
        ch = s.get("channel") or s.get("industry_vertical") or ""
        if ch and ch.lower() not in ("general", "unknown", "") and ch not in seen:
            seen.add(ch)
            sectors.append(ch)

    # Build signal summary for Gemini prospect extraction
    sig_lines = []
    for s in signals:
        parts = [
            s.get("signal_type", "SIGNAL"),
            s.get("headline", ""),
            s.get("detail", ""),
            s.get("action", ""),
        ]
        sig_lines.append(" | ".join(p for p in parts if p))

    sig_block = "\n".join(f"- {l}" for l in sig_lines[:20])  # cap at 20 signals

    prompt = f"""You are analysing product market signals to extract potential B2B buyer organisations.

PRODUCT: {product.get("product_name", "")}
ARCHETYPE: {product.get("archetype", "")}
GEOGRAPHY: {product.get("geography", "")}

MARKET SIGNALS:
{sig_block}

TASK: From the signals above, extract any specifically named organisations, companies,
training bodies, industry associations, or clearly implied company types that represent
high-probability buyers for this product. Include only where there is real signal evidence
-- do NOT invent generic company types without signal backing.

Return ONLY a JSON array of up to 8 objects:
[
  {{
    "name": "Company or organisation name (string, required)",
    "signal_type": "The signal type that identified them (string)",
    "rationale": "One sentence explaining why they are a likely buyer (string)",
    "website": "Official website URL if you know it with confidence (e.g. https://www.hay.dk) -- or null if uncertain. Do NOT guess or fabricate."
  }}
]
If no specific organisations are identifiable from the signals, return an empty array [].
Return only the JSON -- no markdown fences, no commentary."""

    try:
        raw = await generate(prompt)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        prospects = json.loads(raw)
        if not isinstance(prospects, list):
            prospects = []
    except Exception:
        prospects = []

    return {
        "sectors": sectors,
        "geography": product.get("geography", ""),
        "suggested_prospects": prospects,
    }

async def get_or_return_vault(product_id: str) -> Optional[dict]:
    """
    Return the current locked vault entry for a product.
    Does NOT run a new scan. Returns None if no analysis exists yet.
    """
    