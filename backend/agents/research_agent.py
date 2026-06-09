"""
STRATAGENT -- Research Agent
Deep prospect research for Field Intelligence module.
Produces Relationship Profiles, Convergence Index scores, and Buying Signals.
"""
import json
import re
from datetime import datetime, timezone
from services.gemini import generate_with_grounding, generate

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
                parts.append(f"Geography (hard constraint): {geography}")
            if rel_model:
                parts.append(f"Relationship model: {rel_model}")
            if min_thresh:
                parts.append(f"Minimum threshold: {min_thresh}")

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


async def research_prospect(
    company_name: str,
    supplier_kb: dict,
) -> dict:
    """
    Research a prospect company and score alignment with supplier capability.
    Returns a full Relationship Profile with Convergence Index and Buying Signals.
    """
    supplier_summary = _summarise_kb(supplier_kb)

    current_date = _current_date_str()
    cutoff_year, cutoff_month = _cutoff_year_month()
    cutoff_str = datetime(cutoff_year, cutoff_month, 1).strftime("%B %Y")

    prompt = f"""
You are STRATAGENT conducting deep prospect research for an industrial supplier.

TODAY'S DATE: {current_date}
SIGNAL CUTOFF: {cutoff_str} -- signals older than this are STALE and must be excluded entirely.

SUPPLIER CAPABILITY SUMMARY:
{supplier_summary}

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
   (Decision maker role and Influencer/specifier role) -- find the specific person
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
    "name": "name or null",
    "title": "title or null",
    "linkedin": "url or null",
    "confidence": "high/medium/low"
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
    elif not _WEBSITE_PATTERN.match(site):
        site = ""
    elif not site.lower().startswith(("http://", "https://")):
        site = f"https://{site}"
    profile["website"] = site

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

    return profile


async def find_alternative_prospects(kb: dict, company_name: str) -> list:
    """
    Suggest alternative prospect companies when CI < 60.
    Stub -- returns empty list. Full implementation: STRATAGORA phase.
    """
    return []
