"""
STRATAGENT -- Research Agent
Deep prospect research for Field Intelligence module.
Produces Relationship Profiles, Convergence Index scores, and Buying Signals.
"""
import json
import re
from datetime import datetime, timezone
from services.gemini import (
    generate_with_grounding,
    generate,
    generate_with_vision,
    generate_grounded_with_vision,
)

_WEBSITE_PATTERN = re.compile(r'^(https?://)?[a-zA-Z0-9][a-zA-Z0-9\-\.]*\.[a-zA-Z]{2,}([/?#].*)?$')

def _current_date_str() -> str:
    return datetime.now(timezone.utc).strftime("%B %Y")

def _cutoff_year_month() -> tuple[int, int]:
    """Returns (year, month) 12 months ago -- signals older than this are STALE."""
    now = datetime.now(timezone.utc)
    month = now.month - 12
    year = now.year
    while month <= 0:
        month += 12
        year -= 1
    return year, month


def _seed_val(seed: dict, block: str, field: str) -> str:
    """Safely extract a value from intelligence_seed block.field."""
    return (seed.get(block, {}).get(field, {}) or {}).get("value", "") or ""


def _summarise_kb(kb: dict) -> str:
    """
    Build a rich supplier-capability summary for the research prompt.

    Priority order:
    1. intelligence_seed (6-block agentic seed) -- fullest context
    2. manual_seed (4-field owner definition) -- identity anchor
    3. KB profile (AI-researched content) -- supporting detail

    The intelligence_seed gives the research agent Signal Recognition,
    Buyer Intelligence, Winning Conditions, and Commercial Reality context
    that was previously unavailable -- dramatically improving research quality.
    """
    profile = kb.get("profile", {})
    iseed = kb.get("intelligence_seed") or {}
    seed = kb.get("manual_seed", {})
    company = kb.get("company_name", "Unknown")
    website = kb.get("website_url", "")

    has_iseed = bool(iseed.get("identity", {}).get("product_plain", {}).get("value"))

    parts = ["== SUPPLIER INTELLIGENCE BRIEF =="]
    parts.append(f"Company: {company}")
    if website:
        parts.append(f"Website: {website}")

    # -- IDENTITY BLOCK --
    parts.append("")
    parts.append("-- WHAT THEY SELL (authoritative -- do not contradict) --")
    if has_iseed:
        product = _seed_val(iseed, "identity", "product_plain") or seed.get("product_plain", "")
        not_this = _seed_val(iseed, "identity", "not_this") or seed.get("not_this", "")
        problem = _seed_val(iseed, "identity", "problem_solved")
        specs = _seed_val(iseed, "identity", "key_specs")
        certs = _seed_val(iseed, "identity", "certifications")
    else:
        product = seed.get("product_plain", "")
        not_this = seed.get("not_this", "")
        problem = specs = certs = ""

    if product:
        parts.append(f"Product: {product}")
    if not_this:
        parts.append(f"NOT THIS (critical disambiguation): {not_this}")
    if problem:
        parts.append(f"Problem it solves: {problem}")
    if specs:
        parts.append(f"Key specifications: {specs}")
    if certs:
        parts.append(f"Certifications: {certs}")

    # -- BUYER INTELLIGENCE BLOCK --
    parts.append("")
    parts.append("-- WHO BUYS THIS AND HOW --")
    if has_iseed:
        buyer = _seed_val(iseed, "buyer_intelligence", "buyer_type") or seed.get("buyer_type", "")
        use_case = _seed_val(iseed, "buyer_intelligence", "use_case") or seed.get("use_case", "")
        decision_maker = _seed_val(iseed, "buyer_intelligence", "decision_maker")
        influencer = _seed_val(iseed, "buyer_intelligence", "influencer")
        proc_path = _seed_val(iseed, "buyer_intelligence", "procurement_path")
    else:
        buyer = seed.get("buyer_type", "")
        use_case = seed.get("use_case", "")
        decision_maker = influencer = proc_path = ""

    if buyer:
        parts.append(f"Buyer type: {buyer}")
    if use_case:
        parts.append(f"Use case: {use_case}")
    if decision_maker:
        parts.append(f"Decision maker role: {decision_maker}")
    if influencer:
        parts.append(f"Influencer/specifier role: {influencer}")
    if proc_path:
        parts.append(f"Procurement path: {proc_path}")

    # -- COMMERCIAL REALITY BLOCK --
    if has_iseed:
        deal_size = _seed_val(iseed, "commercial_reality", "deal_size")
        geography = _seed_val(iseed, "commercial_reality", "geography")
        rel_model = _seed_val(iseed, "commercial_reality", "relationship_model")
        min_thresh = _seed_val(iseed, "commercial_reality", "minimum_threshold")
        if any([deal_size, geography, rel_model, min_thresh]):
            parts.append("")
            parts.append("-- COMMERCIAL CONTEXT --")
            if deal_size:
                parts.append(f"Typical deal size: {deal_size}")
            if geography:
                parts.append(f"Target geography (preferred market -- note if prospect is outside this, but do not penalise CI for geography alone): {geography}")
            if rel_model:
                parts.append(f"Relationship model: {rel_model}")
            if min_thresh:
                parts.append(f"Minimum deal threshold (flag if prospect appears below this, but use as context not a hard cutoff): {min_thresh}")

    # -- WINNING CONDITIONS BLOCK (feeds SD scoring guidance) --
    if has_iseed:
        win_when = _seed_val(iseed, "winning_conditions", "we_win_when")
        diff = _seed_val(iseed, "winning_conditions", "differentiator")
        proofs = _seed_val(iseed, "winning_conditions", "proof_points")
        if any([win_when, diff, proofs]):
            parts.append("")
            parts.append("-- WINNING CONDITIONS (use these to calibrate SD scoring) --")
            if win_when:
                parts.append(f"We win when: {win_when}")
            if diff:
                parts.append(f"Key differentiator: {diff}")
            if proofs:
                parts.append(f"Proof points: {proofs}")

    # -- SIGNAL RECOGNITION BLOCK (tells the agent what to hunt for) --
    if has_iseed:
        triggers = _seed_val(iseed, "signal_recognition", "trigger_events")
        keywords = _seed_val(iseed, "signal_recognition", "tender_keywords")
        capex = _seed_val(iseed, "signal_recognition", "capex_indicators")
        regs = _seed_val(iseed, "signal_recognition", "regulatory_drivers")
        if any([triggers, keywords, capex, regs]):
            parts.append("")
            parts.append("-- SIGNAL RECOGNITION (hunt for these specifically) --")
            if triggers:
                parts.append(f"Buying trigger events: {triggers}")
            if keywords:
                parts.append(f"Tender/procurement keywords to search: {keywords}")
            if capex:
                parts.append(f"CAPEX indicators: {capex}")
            if regs:
                parts.append(f"Regulatory drivers: {regs}")

    # -- KB PROFILE DETAIL (supporting, does not override seed) --
    catalogue = profile.get("product_catalogue", "")
    if catalogue and not has_iseed:
        parts.append("")
        parts.append("-- PRODUCT CATALOGUE DETAIL --")
        parts.append(str(catalogue)[:500])

    if profile.get("competitive_positioning"):
        cp = str(profile["competitive_positioning"])[:300]
        if not has_iseed:
            parts.append(f"Competitive positioning: {cp}")

    return "\n".join(p for p in parts if p is not None)


def _parse_json_response(response: str) -> dict:
    """Parse JSON from a Gemini response, stripping markdown code fences if present."""
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        return json.loads(cleaned)
    except Exception:
        return {}


async def _classify_prospect_industry(company_name: str, company_overview: str) -> dict:
    """
    Classify a prospect into NACE Rev.2 and SIC codes.
    Uses the company overview already generated -- no new grounded search.
    Non-blocking: returns empty dict on any failure.
    """
    if not company_overview or len(company_overview) < 30:
        return {}
    prompt = f"""Classify this company into industry codes based on what they DO (their primary business activity).

COMPANY: {company_name}
OVERVIEW: {company_overview}

Return a JSON object only:
{{
  "nace_code": "most specific NACE Rev.2 code, e.g. C20.1",
  "nace_label": "full label, e.g. Manufacture of basic chemicals",
  "nace_division": "letter + 2 digits only, e.g. C20",
  "nace_section": "single letter only, e.g. C",
  "sic_code": "US SIC 4-digit code, e.g. 2819",
  "sic_label": "SIC label, e.g. Industrial Inorganic Chemicals",
  "confidence": "high or medium or low",
  "classification_notes": "one sentence -- basis for this classification"
}}

Rules:
- Classify what they DO, not what they BUY
- Use NACE Rev. 2 (EU standard)
- nace_division = letter + 2 digits (e.g. C20, D35, I55)
- nace_section = single letter (e.g. C, D, I)
- If uncertain, pick the code best matching primary revenue activity
- Return only the JSON object, no other text"""
    try:
        response = await generate(prompt, temperature=0.1)
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(cleaned[start:end])
            # Normalise -- ensure section and division are always populated
            code = result.get("nace_code", "")
            if code and not result.get("nace_section"):
                result["nace_section"] = code[0].upper() if code else ""
            if code and not result.get("nace_division"):
                import re as _re2
                m = _re2.match(r'^([A-Z]\d{2})', code.upper())
                result["nace_division"] = m.group(1) if m else code[:3].upper()
            return result
    except Exception:
        pass
    return {}


async def research_prospect(
    company_name: str,
    supplier_kb: dict,
    product_context: dict = None,
    geography: str = "",
    prospect_url: str = "",
) -> dict:
    """
    Research a prospect company and score alignment with supplier capability.
    Returns a full Relationship Profile with Convergence Index and Buying Signals.
    Optional product_context injects PAM signal intelligence when FI is launched from PAM.
    Optional geography scopes the search to a target region (e.g. Denmark, Scandinavia).
    """
    supplier_summary = _summarise_kb(supplier_kb)

    current_date = _current_date_str()
    cutoff_year, cutoff_month = _cutoff_year_month()
    cutoff_str = datetime(cutoff_year, cutoff_month, 1).strftime("%B %Y")

    # Build product context block if launched from PAM
    product_context_block = ""
    if product_context:
        pname = product_context.get("product_name", "")
        archetype = product_context.get("archetype", "")
        psignals = product_context.get("signals", [])[:6]
        sig_lines = []
        for s in psignals:
            headline = s.get("headline", "")
            stype = s.get("signal_type", "")
            if headline:
                sig_lines.append(f"  - [{stype}] {headline}")
        sig_text = "\n".join(sig_lines) if sig_lines else "  (none)"
        product_context_block = (
            "\n\nPRODUCT INTELLIGENCE CONTEXT (from PAM scan -- use to sharpen scoring):\n"
            f"Product: {pname}  |  Archetype: {archetype}\n"
            "Key buying signals already detected for this product:\n"
            + sig_text +
            "\nWhen scoring this prospect, look specifically for evidence that they:\n"
            "  - Have training, certification, or workforce development budgets\n"
            "  - Operate in the sectors flagged by these signals\n"
            "  - Show procurement patterns that match this product type\n"
            "  - Have roles (Training Manager, HSE Lead, Procurement) who would buy this\n"
        )

    # Build geography focus block -- scopes research to supplier region
    geo_str = (geography or "").strip()
    if not geo_str:
        # Fall back to KB supplier location if no explicit geography provided
        geo_str = (supplier_kb.get("supplier_location") or "").strip()
    geography_block = ""
    if geo_str:
        geography_block = (
            f"\n\nGEOGRAPHIC FOCUS: {geo_str}\n"
            "Prioritise companies that operate in, are headquartered in, or actively serve this geography.\n"
            "Companies with no presence or operations in this region are secondary prospects only.\n"
        )

    # Build URL anchor block -- when provided, forces Gemini to visit the official site first
    url_anchor_block = ""
    if prospect_url and prospect_url.strip():
        clean_url = prospect_url.strip()
        url_anchor_block = (
            f"\n\nOFFICIAL WEBSITE -- MANDATORY FIRST STEP:\n"
            f"Visit this URL IMMEDIATELY before forming any assessment: {clean_url}\n"
            f"Read the homepage, About/Company, Products/Services, and News pages.\n"
            f"This is the ground truth for what this company does. Do NOT rely on your training data\n"
            f"or search results to determine the company's identity -- the website is authoritative.\n"
            f"If the website content contradicts any search result, trust the website.\n"
        )

    prompt = f"""
You are STRATAGENT conducting deep prospect research for an industrial supplier.

TODAY'S DATE: {current_date}
SIGNAL CUTOFF: {cutoff_str} -- signals older than this are STALE and must be excluded entirely.

SUPPLIER CAPABILITY SUMMARY:
{supplier_summary}{product_context_block}{geography_block}{url_anchor_block}

PROSPECT TO RESEARCH: {company_name}

MANDATORY: Research this company thoroughly. Do NOT stop early. Do NOT return empty fields.
Go to their website. Search for their projects. Find their clients. Look for press releases and news.
The research quality depends on how hard you look -- shallow research is not acceptable.

BUYER TYPE AWARENESS -- CRITICAL:
Industrial insulation contractors and installers ARE buyers of insulation materials.
They buy raw insulation products (boards, shapes, fiber mats) from manufacturers and install them on client sites.
A company called an "entreprenørfirma", "installatør", "isoleringsvirksomhed", or "insulation contractor"
is a DIRECT BUYER for industrial insulation suppliers. Do not penalise alignment for these buyer types.

WHAT TO RESEARCH (search all of these):
1. Company website -- find their OFFICIAL website URL first, then visit it as a primary
   source before forming any assessment. Read their homepage, about/company, products/services,
   and projects/news pages. What they do, their projects, their clients, their size --
   all of this should be grounded in what the site actually says, not guessed from the name.
   Record the official URL exactly as found (e.g. https://www.example.com) -- this is
   REQUIRED, not optional. If you cannot find a verified official site, return null --
   never guess or fabricate a URL.
2. Buying signals -- ONLY include signals from {cutoff_str} or later.
   The SUPPLIER INTELLIGENCE BRIEF above includes specific trigger events, tender keywords,
   and CAPEX indicators to search for -- use those as your primary signal targets.
   General signal types to look for:
   - Tender notices or awarded contracts using the supplier's tender keywords
   - Leadership changes: new CPO, Procurement head, Plant Manager, Sustainability Director
   - Capital expenditure matching the supplier's CAPEX indicators
   - Budget announcements, fiscal year spending plans
   - Sustainability/decarbonisation commitments requiring product upgrades
   - Strategic shifts, M&A, new market entry
   - Regulatory compliance requirements matching the supplier's regulatory drivers
3. Specific facilities, plants, or projects where the supplier's products would apply
4. Decision maker -- search for the role titles listed in the Supplier Intelligence Brief
   (Decision maker role and Influencer/specifier role) -- find the specific person.
   CONTACT SOURCING RULES (CRITICAL -- non-negotiable):
   - Only name a contact if you can identify them from a specific, citeable external source:
     a LinkedIn profile URL, a company website bio/team page, a press release, a news article,
     or an industry directory.
   - You MUST record WHERE you found the name (source_url) and WHAT it said (source_snippet).
   - If you find a name only by inferring from a role title ("the procurement head is probably...")
     with no external source, set confidence to INFERRED -- never promote an inferred contact
     to PROBABLE or VERIFIED.
   - If no sourceable contact exists, return name as null and confidence as null.
     A null contact is far better than a hallucinated one.
   - The source must be recent enough to suggest the person is still in that role.
     A LinkedIn profile last updated 3+ years ago should be PROBABLE at best.
5. Current supplier relationships in this product category
6. Recent news and strategic developments

SIGNAL RECENCY RULES -- CRITICAL:
- EXCLUDE any signal older than {cutoff_str} entirely. Do not include it, do not mention it.
- A 2023 acquisition is ancient history. A Q4 2023 approach window has already closed. Do not surface it.
- If a signal is from {cutoff_str} or later: include it at full strength.
- If no signals within the cutoff exist: return buying_signals as an empty array. Do NOT invent or recycle old signals.
- The approach_window MUST be in the future from {current_date}. If the suggested window is already past, set approach_window to null.

SCORING RULES:
- Never return a score of 0 unless the company literally does not exist
- Insulation contractors installing at industrial sites: score 65-80 minimum
- Fresh signals (within cutoff) add 10-20 points each
- Stale signals add ZERO points -- do not include them at all
- Lack of recent signals does NOT mean low alignment -- it means PARK and WATCH
- Score reflects product-market fit, not the presence of signals

Return a JSON object:
{{
  "website": "official company website URL exactly as found, e.g. https://www.example.com -- or null if not verified",
  "company_overview": "verified description -- specific, not generic",
  "operational_context": "what they do and where it creates the need",
  "decision_maker": {{
    "name": "name or null -- only if found via a citeable external source",
    "title": "title or null",
    "linkedin": "LinkedIn profile URL if found, or null",
    "source_url": "URL where this contact was found -- LinkedIn, company website, press release, news article, industry directory -- REQUIRED if name is not null, null otherwise",
    "source_type": "one of: LINKEDIN | COMPANY_WEBSITE | PRESS_RELEASE | NEWS_ARTICLE | INDUSTRY_DIRECTORY | null",
    "source_date": "approximate recency of the source -- e.g. 'March 2026', 'last 30 days', '2024' -- or null",
    "source_snippet": "the exact text or context where the name appeared -- e.g. 'Lars Henriksen, Head of Procurement, quoted in...' -- or null",
    "confidence": "VERIFIED if found on LinkedIn with current role confirmed; PROBABLE if found on company website or press release from last 12 months; INFERRED if derived from role title without a named external source -- use INFERRED only as last resort; null if name is null"
  }},
  "buying_signals": [
    {{
      "type": "TENDER | LEADERSHIP_CHANGE | CAPEX | BUDGET | SUSTAINABILITY | STRATEGIC_SHIFT | NEWS_EVENT",
      "signal": "specific description of the signal -- factual, sourced",
      "timing": "when this was reported or when it takes effect -- e.g. Q3 2025, announced March 2026",
      "strength": "HIGH | MEDIUM | LOW",
      "source": "URL or publication where this was found, or null"
    }}
  ],
  "approach_window": "null if no clear window, or description of the optimal timing to approach -- e.g. Before Q2 budget freeze, While new CPO is onboarding",
  "buying_trigger": "primary reason they need this now, synthesised from signals -- or null if not found",
  "active_projects": "tenders, capex, expansions found -- or null",
  "current_suppliers": "known suppliers in this category -- or null",
  "recent_news": "relevant recent developments",
  "convergence_index": {{
    "score": 0-100,
    "reasoning": "honest explanation of the score -- reference specific signals if they contributed",
    "what_would_improve_it": "specific intelligence that would raise the score"
  }},
  "recommended_path": "CONVERGENCE_PROPOSAL | MUTUAL_VALUE_BRIEF | FIRST_SIGNAL | PARK",
  "confidence_notes": "what was found vs inferred -- be specific"
}}

Rules:
- Flag all inferences with [!]️
- Score the Convergence Index honestly -- buying signals should raise the score meaningfully
- A verified tender or leadership change should add 10-20 points to CI vs no signals
- Below 60: recommend PARK with specific watch triggers
- If no buying signals found, return buying_signals as an empty array []
- Return only the JSON object
"""
    response = await generate_with_grounding(prompt)
    profile = _parse_json_response(response)

    # Ensure score is an integer
    if "convergence_index" in profile:
        try:
            profile["convergence_index"]["score"] = int(
                profile["convergence_index"]["score"]
            )
        except (ValueError, TypeError):
            profile["convergence_index"]["score"] = 0

    # Ensure buying_signals is always a list
    if "buying_signals" not in profile or not isinstance(profile["buying_signals"], list):
        profile["buying_signals"] = []

    # Normalise the prospect website -- trim, drop placeholders/junk, add scheme if missing
    site = profile.get("website")
    if not isinstance(site, str):
        site = ""
    site = site.strip().strip('"').strip("'")
    if site.lower() in ("null", "none", "n/a", "unknown", ""):
        site = ""
    else:
        # Strip trailing commentary Gemini sometimes appends after the URL
        # e.g. "https://nobian.com (official site)" or "https://nobian.com."
        site = site.split()[0]
        site = site.rstrip('.,;:)')
        if not _WEBSITE_PATTERN.match(site):
            site = ""
        elif not site.lower().startswith(("http://", "https://")):
            site = f"https://{site}"
    profile["website"] = site

    # Post-process: derive contact_confidence and enforce sourcing rules
    dm = profile.get("decision_maker") or {}
    dm_name = dm.get("name")
    dm_conf = str(dm.get("confidence") or "").upper()

    if not dm_name or dm_name.lower() in ("null", "none", "n/a", "unknown"):
        # No contact found -- clean up
        dm["name"] = None
        dm["confidence"] = None
        dm["source_url"] = dm.get("source_url") or None
        contact_confidence = None
    elif dm_conf == "INFERRED":
        # Contact derived from role title only, no external source -- block from outreach
        contact_confidence = "inferred"
        dm["_outreach_blocked"] = True
        dm["_outreach_blocked_reason"] = "Contact is AI-inferred with no citeable source. Verify via LinkedIn or company website before use in outreach."
    elif dm_conf == "VERIFIED":
        contact_confidence = "verified"
    elif dm_conf == "PROBABLE":
        contact_confidence = "probable"
    else:
        # Fallback: if a source_url exists treat as probable, otherwise inferred
        if dm.get("source_url"):
            contact_confidence = "probable"
            dm["confidence"] = "PROBABLE"
        else:
            contact_confidence = "inferred"
            dm["confidence"] = "INFERRED"
            dm["_outreach_blocked"] = True
            dm["_outreach_blocked_reason"] = "No source URL recorded. Verify contact before use in outreach."

    profile["decision_maker"] = dm
    profile["contact_confidence"] = contact_confidence  # top-level convenience field

    # Post-process: separate stale signals into historical_signals (preserve, don't discard)
    import re as _re
    cutoff_year, cutoff_month = _cutoff_year_month()
    fresh_signals = []
    historical_signals = list(profile.get("historical_signals", []))

    def _signal_is_fresh(sig: dict) -> bool:
        timing = str(sig.get("timing", ""))
        years_found = [int(y) for y in _re.findall(r'\b(20\d\d)\b', timing)]
        if not years_found:
            return True
        sig_year = max(years_found)
        if sig_year > cutoff_year:
            return True
        if sig_year < cutoff_year:
            return False
        month_map = {
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
        }
        sig_month = 0
        for abbr, num in month_map.items():
            if abbr in timing.lower():
                sig_month = num
                break
        return sig_month == 0 or sig_month >= cutoff_month

    for sig in profile["buying_signals"]:
        if _signal_is_fresh(sig):
            fresh_signals.append(sig)
        else:
            sig["_stale"] = True
            already = any(
                h.get("signal") == sig.get("signal") and h.get("timing") == sig.get("timing")
                for h in historical_signals
            )
            if not already:
                historical_signals.append(sig)

    profile["buying_signals"] = fresh_signals
    profile["historical_signals"] = historical_signals

    # If approach_window references a past year, clear it
    window = str(profile.get("approach_window", "") or "")
    if window:
        past_years = [int(y) for y in _re.findall(r'\b(20\d\d)\b', window)]
        now = datetime.now(timezone.utc)
        if past_years and max(past_years) < now.year:
            profile["approach_window"] = None

    # Industry classification -- fast non-grounded pass, never blocks the profile
    try:
        overview = profile.get("company_overview", "")
        classification = await _classify_prospect_industry(company_name, overview)
        if classification:
            profile["industry_classification"] = classification
    except Exception:
        pass

    # Normalise recommended_path -- Gemini sometimes returns variants like PARK_AND_WATCH,
    # MONITOR, NO_FIT etc. Force to one of the four valid B2B UI values.
    _valid_b2b_paths = {"CONVERGENCE_PROPOSAL", "MUTUAL_VALUE_BRIEF", "FIRST_SIGNAL", "PARK"}
    _raw_path = str(profile.get("recommended_path", "")).upper().strip()
    if _raw_path not in _valid_b2b_paths:
        _ci = profile.get("convergence_index")
        _score_val = (_ci.get("score", 0) if isinstance(_ci, dict) else 0) or 0
        if _score_val >= 90:
            _raw_path = "CONVERGENCE_PROPOSAL"
        elif _score_val >= 75:
            _raw_path = "MUTUAL_VALUE_BRIEF"
        elif _score_val >= 60:
            _raw_path = "FIRST_SIGNAL"
        else:
            _raw_path = "PARK"
    profile["recommended_path"] = _raw_path

    return profile



async def find_alternative_prospects(kb: dict, company_name: str) -> list:
    """
    Suggest alternative prospect companies when CI < 60.
    Stub -- returns empty list. Full implementation: STRATAGORA phase.
    """
    return []


# ---------------------------------------------------------------------------
# KB type detection (mirrors stratagora_agent._is_consumer_retail_kb)
# ---------------------------------------------------------------------------

_CONSUMER_KEYWORDS = [
    "gift", "retail", "poster", "art print", "wall art", "novelty", "collectible",
    "consumer", "e-commerce", "etsy", "amazon", "redbubble", "society6", "zazzle",
    "print on demand", "fandom", "pop culture", "merchandise", "merch", "pet product",
    "dog lover", "cat lover", "hobby", "lifestyle", "home decor", "greeting card",
    "sticker", "apparel", "souvenir", "gift shop", "specialty retail",
]


def is_consumer_retail_kb(kb: dict) -> bool:
    """
    Detect whether a KB is a consumer/retail product supplier vs B2B industrial.
    True = consumer/retail, route to research_distribution_channel().
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
# Distribution channel research (Phase 2 -- consumer/retail FI mode)
# ---------------------------------------------------------------------------

def _summarise_kb_for_channel(kb: dict) -> str:
    """
    Build a concise product + audience brief for the channel research prompt.
    Focuses on what the product IS and WHO buys it -- not industrial signals.
    """
    seed = kb.get("manual_seed", {})
    profile = kb.get("profile", {})
    iseed = kb.get("intelligence_seed") or {}
    company = kb.get("company_name", "Unknown Supplier")

    has_iseed = bool(iseed.get("identity", {}).get("product_plain", {}).get("value"))

    if has_iseed:
        product   = _seed_val(iseed, "identity", "product_plain") or seed.get("product_plain", "")
        not_this  = _seed_val(iseed, "identity", "not_this") or seed.get("not_this", "")
        problem   = _seed_val(iseed, "identity", "problem_solved")
        buyer     = _seed_val(iseed, "buyer_intelligence", "buyer_type") or seed.get("buyer_type", "")
        use_case  = _seed_val(iseed, "buyer_intelligence", "use_case") or seed.get("use_case", "")
        diff      = _seed_val(iseed, "winning_conditions", "differentiator")
        geography = _seed_val(iseed, "commercial_reality", "geography")
        deal_size = _seed_val(iseed, "commercial_reality", "deal_size")
    else:
        product   = seed.get("product_plain", "")
        not_this  = seed.get("not_this", "")
        buyer     = seed.get("buyer_type", "")
        use_case  = seed.get("use_case", "")
        problem = diff = geography = deal_size = ""

    # Append saved visual analysis summary if available (injected by FI router)
    saved_va = kb.get("_saved_visual_analysis") or {}
    visual_lines = []
    if saved_va:
        tier = saved_va.get("competitive_position", {}).get("tier", "")
        quality = saved_va.get("quality_indicators", {}).get("overall_quality", "")
        mkt_desc = saved_va.get("marketing_description", "")
        positioning = saved_va.get("recommended_positioning", "")
        if tier:
            visual_lines.append(f"VISUAL QUALITY TIER (from image analysis): {tier}")
        if quality:
            visual_lines.append(f"OVERALL QUALITY SCORE: {quality}/100")
        if mkt_desc:
            visual_lines.append(f"MARKETING DESCRIPTION: {mkt_desc}")
        if positioning:
            visual_lines.append(f"RECOMMENDED VISUAL POSITIONING: {positioning}")

    # Include supplier location if set directly on KB
    loc = kb.get("supplier_location", "")

    parts = [
        f"SUPPLIER: {company}",
        f"SUPPLIER LOCATION: {loc}" if loc else "",
        f"PRODUCT: {product}" if product else "",
        f"NOT THIS: {not_this}" if not_this else "",
        f"BUYER TYPE: {buyer}" if buyer else "",
        f"USE CASE / CONTEXT: {use_case}" if use_case else "",
        f"DIFFERENTIATOR: {diff}" if diff else "",
        f"GEOGRAPHY: {geography}" if geography else "",
        f"PRICE RANGE / DEAL SIZE: {deal_size}" if deal_size else "",
        f"PROBLEM SOLVED: {problem}" if problem else "",
    ] + visual_lines
    return "\n".join(p for p in parts if p)


def _format_stratagora_context(signals: list, channel_name: str) -> str:
    """
    Extract relevant STRATAGORA signals for a specific channel to inject into prompt.
    Returns formatted string or empty string if no relevant signals.
    """
    if not signals:
        return ""

    channel_lower = channel_name.lower()
    relevant = [
        s for s in signals
        if channel_lower in str(s.get("channel", "")).lower()
        or channel_lower in str(s.get("headline", "")).lower()
    ]

    if not relevant:
        return ""

    lines = ["STRATAGORA MARKET INTELLIGENCE (pre-scanned signals for this channel):"]
    for s in relevant[:5]:
        sat = s.get("saturation_score")
        sat_str = f"  Saturation score: {sat}/100" if sat is not None else ""
        lines.append(
            f"- [{s.get('signal_type', '')}] {s.get('headline', '')}"
            f"{sat_str}"
            f"\n  {s.get('detail', '')}"
        )
    return "\n".join(lines)


async def research_distribution_channel(
    channel_name: str,
    supplier_kb: dict,
    stratagora_signals: list = None,
    product_images: list = None,
    supplier_location: str = "",
) -> dict:
    """
    Evaluate a distribution channel for a consumer/retail product supplier.

    Scores on 6 dimensions:
      Audience Fit | Channel Health | Competitive Density |
      Commercial Openness | Margin Potential | Saturation Headroom

    Weighted SD score:
      Audience Fit:        25%
      Saturation Headroom: 25%
      Channel Health:      20%
      Margin Potential:    15%
      Commercial Openness: 15%

    Returns a profile dict compatible with the existing FI Firestore schema,
    with prospect_type = "distribution_channel".
    product_images: optional list of {"data": base64_str, "mime_type": str}
    """
    current_date = _current_date_str()
    supplier_brief = _summarise_kb_for_channel(supplier_kb)
    stratagora_context = _format_stratagora_context(stratagora_signals or [], channel_name)

    # Build geo context -- use passed location or fall back to KB field
    _loc = supplier_location or supplier_kb.get("supplier_location", "")
    if _loc:
        supplier_location_block = (
            f"{_loc}. "
            "Factor this into your channel evaluation: "
            "consider regional shipping costs and lead times from this origin, "
            "proximity to distribution hubs, regional consumer preferences and buying culture, "
            "local market saturation vs national/global opportunity, "
            "and any import/export or fulfilment friction for this geography."
        )
    else:
        supplier_location_block = (
            "Unknown -- evaluate assuming global supply capability."
        )

    prompt = f"""You are STRATAGENT evaluating a distribution channel for a consumer product supplier.
Your mission: give an honest, grounded assessment of whether this channel is worth pursuing,
how competitive it is, and what the supplier needs to do to succeed there.

TODAY: {current_date}

SUPPLIER & PRODUCT:
{supplier_brief}

CHANNEL TO EVALUATE: {channel_name}

SUPPLIER ORIGIN: {supplier_location_block}

{stratagora_context}

RESEARCH THIS CHANNEL THOROUGHLY. Go to the platform or retailer website. Search for:
- How the platform works for sellers/suppliers
- Current state of this product category on the platform (how many sellers, competition level)
- Platform growth/decline trends
- Commission structure, fee schedule, revenue share terms
- Onboarding requirements, approval process, restrictions
- Success stories or case studies for similar products
- Any recent policy changes affecting this product category

SCORING GUIDE:
Score each dimension 0-100. Be realistic -- do not inflate scores. A score of 50 means average/neutral.

1. AUDIENCE_FIT (0-100)
   - 90+: This channel's core audience is the exact buyer for this product
   - 70-89: Strong overlap -- most buyers here would recognise and want this product
   - 50-69: Partial fit -- some buyers here want this, but it is not the channel's focus
   - 30-49: Weak fit -- this product is off-category for this channel
   - <30: Wrong channel -- buyers here are unlikely to want this product

2. CHANNEL_HEALTH (0-100)
   - 90+: Platform growing fast, strong seller success stories, algorithm favours new products
   - 70-89: Healthy growth, stable environment for new sellers
   - 50-69: Mature/stable -- viable but not accelerating
   - 30-49: Flat or declining -- tough to grow without existing audience
   - <30: Platform in decline or hostile to new sellers

3. COMPETITIVE_DENSITY (0-100)
   - This is the SATURATION score -- higher = more crowded
   - 90+: Extremely crowded, thousands of similar products, price war conditions
   - 70-89: High competition, need strong differentiation to stand out
   - 50-69: Moderate competition -- winnable with good product and positioning
   - 30-49: Low competition -- clear opportunity
   - <30: Near-empty -- first mover advantage available

4. COMMERCIAL_OPENNESS (0-100)
   - 90+: Open platform, easy onboarding, no approval needed
   - 70-89: Standard process, straightforward to enter
   - 50-69: Some requirements, moderate effort to get started
   - 30-49: Significant barriers -- approval, minimum order, exclusivity requirements
   - <30: Closed or extremely difficult to enter

5. MARGIN_POTENTIAL (0-100)
   - 90+: High margin, low platform fees, premium pricing possible
   - 70-89: Good margin -- platform fees reasonable, price integrity maintainable
   - 50-69: Average -- standard platform fees, some price pressure
   - 30-49: Thin margin -- high fees or strong price competition
   - <30: Margin-destructive -- not viable at reasonable price points

6. SATURATION_HEADROOM (0-100)
   - Inverse of competitive density -- how much room exists for a new entrant
   - Derived from COMPETITIVE_DENSITY if no STRATAGORA signal: headroom = 100 - competitive_density
   - If STRATAGORA has a saturation_score for this channel, use: headroom = 100 - saturation_score
   - 70+: Clear room to enter and grow
   - 40-69: Possible but requires differentiation
   - <40: Very little room -- only enter with a strong unique angle
"""

    if product_images:
        prompt += """
PRODUCT IMAGE PROVIDED: You can see the actual product above.
Use the visual style, art quality, and aesthetic to inform your scoring --
specifically audience fit (does the visual style suit this channel's aesthetic?)
and competitive density (how does this product visually compare to what already
exists on this channel?). A visually distinctive product earns higher audience
fit and saturation headroom scores than a commodity-looking one.
"""

    prompt += f"""
Return a JSON object:
{{
  "prospect_type": "distribution_channel",
  "channel_name": "{channel_name}",
  "channel_url": "official URL of the platform or retailer, or null",
  "channel_overview": "2-3 sentence description of this channel and how it works for sellers",
  "audience_fit": {{
    "score": 0,
    "reasoning": "why this channel's audience does or does not match the product's buyers"
  }},
  "channel_health": {{
    "score": 0,
    "trend": "growing | stable | declining",
    "reasoning": "evidence for this channel's current health and trajectory"
  }},
  "competitive_density": {{
    "score": 0,
    "reasoning": "how crowded this product category is on this channel right now",
    "notable_competitors": "names of 2-3 top competitors if found, or null"
  }},
  "commercial_openness": {{
    "score": 0,
    "entry_requirements": "what a new supplier needs to do to list or sell here",
    "commission_structure": "fee percentage or revenue share if known, or null",
    "reasoning": "how easy or hard it is to enter this channel"
  }},
  "margin_potential": {{
    "score": 0,
    "estimated_margin": "estimated net margin percentage range after platform fees, or null if unknown",
    "reasoning": "why margin is strong or weak on this channel"
  }},
  "saturation_headroom": {{
    "score": 0,
    "source": "stratagora | estimated",
    "reasoning": "how much room remains for a new entrant"
  }},
  "convergence_index": {{
    "score": 0,
    "reasoning": "weighted summary: Audience Fit 25%%, Saturation Headroom 25%%, Channel Health 20%%, Margin Potential 15%%, Commercial Openness 15%%",
    "what_would_improve_it": "what information or change would raise this score"
  }},
  "recommended_path": "CHANNEL_PITCH_BRIEF | EXPLORE | MONITOR | SKIP",
  "approach_strategy": "2-3 sentences: how to position the product for this channel specifically",
  "key_requirements": "what the supplier must have ready to enter this channel",
  "priority_actions": ["action 1", "action 2", "action 3"],
  "confidence_notes": "what was found vs estimated -- be specific about data gaps"
}}

Recommended path rules:
- CHANNEL_PITCH_BRIEF: SD >= 75 -- strong fit, low competition, worth an immediate approach
- EXPLORE: SD 60-74 -- worth investigating further, prepare a soft approach
- MONITOR: SD 45-59 -- not ready yet, watch for conditions to improve
- SKIP: SD < 45 -- poor fit or too crowded, move on

IMPORTANT: Compute the convergence_index.score as the weighted average:
  score = round( (audience_fit * 0.25) + (saturation_headroom * 0.25) + (channel_health * 0.20) + (margin_potential * 0.15) + (commercial_openness * 0.15) )

Return only the JSON object. No preamble.
"""

    if product_images:
        response = await generate_grounded_with_vision(prompt, product_images)
    else:
        response = await generate_with_grounding(prompt)
    profile = _parse_json_response(response)

    if not profile:
        profile = {}

    profile["prospect_type"] = "distribution_channel"
    profile["channel_name"] = channel_name

    # Compute / validate weighted SD score
    try:
        af = int(profile.get("audience_fit", {}).get("score", 50))
        sh = int(profile.get("saturation_headroom", {}).get("score", 50))
        ch = int(profile.get("channel_health", {}).get("score", 50))
        mp = int(profile.get("margin_potential", {}).get("score", 50))
        co = int(profile.get("commercial_openness", {}).get("score", 50))
        computed = round(af * 0.25 + sh * 0.25 + ch * 0.20 + mp * 0.15 + co * 0.15)
        if "convergence_index" not in profile or not isinstance(profile["convergence_index"], dict):
            profile["convergence_index"] = {}
        profile["convergence_index"]["score"] = max(0, min(100, computed))
    except (TypeError, ValueError):
        if "convergence_index" not in profile:
            profile["convergence_index"] = {"score": 50, "reasoning": "Score could not be computed."}

    try:
        profile["convergence_index"]["score"] = int(profile["convergence_index"]["score"])
    except (ValueError, TypeError, KeyError):
        profile["convergence_index"]["score"] = 50

    score = profile["convergence_index"]["score"]
    path_map = {
        score >= 75: "CHANNEL_PITCH_BRIEF",
        60 <= score < 75: "EXPLORE",
        45 <= score < 60: "MONITOR",
        score < 45: "SKIP",
    }
    correct_path = next((v for k, v in path_map.items() if k), "MONITOR")
    profile["recommended_path"] = correct_path

    if not isinstance(profile.get("priority_actions"), list):
        profile["priority_actions"] = []

    return profile


# ---------------------------------------------------------------------------
# Visual quality analysis -- product image intelligence
# ---------------------------------------------------------------------------

async def analyze_product_visuals(
    images: list,
    supplier_kb: dict,
    competitor_context: str = "",
) -> dict:
    """
    Deep visual quality and competitive comparison analysis for a product.

    Gemini looks at the actual uploaded product image and assesses:
    - Art style, technique, and production quality indicators
    - How it compares visually to typical competitors in this category
    - Commercial appeal for gift, wall art, collector, and retail contexts
    - Channel aesthetic fit for each distribution channel
    - Generates a marketing-ready product description paragraph

    images: [{"data": base64_str, "mime_type": "image/jpeg"}, ...]
    """
    if not images:
        return {"error": "No product images provided for visual analysis."}

    supplier_brief = _summarise_kb_for_channel(supplier_kb)

    competitor_section = (
        f"\nCOMPETITOR CONTEXT PROVIDED:\n{competitor_context}\n"
        if competitor_context
        else (
            "\nNo competitor images provided. Compare visually against your knowledge of "
            "typical novelty art posters, print-on-demand products, and gift/collectible "
            "artwork sold on Etsy, Redbubble, Society6, and Amazon Handmade.\n"
        )
    )

    prompt = f"""You are STRATAGENT's visual intelligence analyst.
You are looking at one or more product images from this supplier.
Your job is to give an honest, detailed visual quality and market positioning assessment.
This is NOT a general description -- it is a competitive analysis.

SUPPLIER & PRODUCT CONTEXT:
{supplier_brief}
{competitor_section}

ANALYSIS FRAMEWORK -- assess each dimension based on what you actually see:

1. VISUAL STYLE: Identify the art technique (digital illustration, watercolor, vector,
   photorealistic, hand-drawn, collage, mixed media, etc.). Note the color palette
   (vibrant, muted, monochrome, high-contrast, etc.). Describe the composition.

2. PRINT QUALITY INDICATORS: Assess:
   - Line clarity and sharpness
   - Color richness and depth
   - Detail level (simple vs complex)
   - Perceived production value (premium or commodity?)

3. COMPETITIVE POSITION: Compare to typical competitors:
   - Mass market POD (Redbubble/Society6 average)
   - Etsy artisan/independent prints
   - Licensed novelty merchandise (Hot Topic/Spencer's tier)
   - Premium limited art prints (Mondo tier)
   Where does this sit? Be specific.

4. DIFFERENTIATORS: What visual elements are genuinely distinctive vs generic?

5. COMMERCIAL APPEAL by context:
   - Gift potential
   - Wall art appeal
   - Collector appeal
   - Retail display impact

6. CHANNEL AESTHETIC FIT based on visual style alone:
   - Etsy (handmade/artisan vs polished commercial)
   - Redbubble/Society6 (POD marketplace standards)
   - Amazon (product photography standards)
   - Specialty retail / gift shops (shelf appeal)
   - Social commerce / Instagram (scroll-stopping visual)

7. MARKETING DESCRIPTION: Write one compelling, professional product description
   paragraph (60-90 words) in third person. Make it specific to what you see.
   Focus on emotional appeal and visual impact. No generic language.

8. QUALITY VERDICT: One honest sentence. Above, at, or below market standard? Why?

Return a JSON object:
{{
  "visual_style": {{
    "technique": "art technique identified",
    "color_palette": "description of color palette",
    "composition": "description of composition and layout",
    "detail_level": "simple | moderate | complex | highly detailed"
  }},
  "quality_indicators": {{
    "print_clarity": 0,
    "color_richness": 0,
    "composition_score": 0,
    "production_value": 0,
    "overall_quality": 0,
    "quality_notes": "specific observations driving the quality score"
  }},
  "competitive_position": {{
    "tier": "premium | above_average | market_average | below_average | commodity",
    "vs_pod_platforms": "how this compares to Redbubble/Society6 average",
    "vs_etsy_artisan": "how this compares to top Etsy sellers in this category",
    "vs_licensed_novelty": "how this compares to Hot Topic / Spencer's tier",
    "differentiators": ["list of genuine visual differentiators"],
    "weaknesses": ["honest list of any visual weaknesses or generic elements"]
  }},
  "commercial_appeal": {{
    "gift_potential": 0,
    "wall_art_appeal": 0,
    "collector_appeal": 0,
    "retail_display_impact": 0,
    "notes": "what drives appeal or limits it"
  }},
  "channel_aesthetic_fit": {{
    "etsy": {{"fit": "high | medium | low", "reason": "why"}},
    "redbubble_society6": {{"fit": "high | medium | low", "reason": "why"}},
    "amazon": {{"fit": "high | medium | low", "reason": "why"}},
    "specialty_retail": {{"fit": "high | medium | low", "reason": "why"}},
    "instagram_social": {{"fit": "high | medium | low", "reason": "why"}}
  }},
  "marketing_description": "compelling 60-90 word product description -- specific to what is seen, not generic",
  "quality_verdict": "one honest sentence: above / at / below market standard and why"
}}
"""

    response = await generate_grounded_with_vision(prompt, images)
    result = _parse_json_response(response)
    if not result:
        result = {}
    return result
