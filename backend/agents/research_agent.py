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


def _summarise_kb(kb: dict) -> str:
    """Build a compact supplier-capability summary for the research prompt.
    Manual Seed (owner-defined) takes precedence over AI-researched profile detail."""
    profile = kb.get("profile", {})
    seed = kb.get("manual_seed", {})
    company = kb.get("company_name", "Unknown")
    website = kb.get("website_url", "")

    parts = ["SUPPLIER DEFINITION:"]

    if seed.get("product_plain"):
        parts.append(f"What they sell (owner-defined): {seed['product_plain']}")
    if seed.get("buyer_type"):
        parts.append(f"Who buys this (owner-defined): {seed['buyer_type']}")
    if seed.get("use_case"):
        parts.append(f"How buyers use it (owner-defined): {seed['use_case']}")
    if seed.get("not_this"):
        parts.append(f"THIS IS NOT (owner-defined -- do not confuse): {seed['not_this']}")

    if any(seed.values()):
        parts.append("")
        parts.append("AI-RESEARCHED DETAIL (supports the above -- does not override it):")

    catalogue = profile.get("product_catalogue", "")
    overview = profile.get("company_overview", "")
    if not any(seed.values()):
        if overview:
            parts.append(f"Company overview: {str(overview)[:300]}")
        parts.append(f"Products/services: {str(catalogue)[:500]}" if catalogue else f"Company: {company}")
    else:
        if catalogue:
            parts.append(f"Product catalogue detail: {str(catalogue)[:400]}")

    if website:
        parts.append(f"Website: {website}")
    if profile.get("technical_differentiators"):
        parts.append(f"Differentiators: {str(profile['technical_differentiators'])[:200]}")
    if profile.get("certifications"):
        parts.append(f"Certifications: {str(profile['certifications'])[:150]}")
    if profile.get("buyer_profiles"):
        parts.append(f"Buyer profiles: {str(profile['buyer_profiles'])[:200]}")
    if profile.get("distribution_channels"):
        parts.append(f"Distribution: {str(profile['distribution_channels'])[:150]}")

    return "\n".join(p for p in parts if p)


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
2. Buying signals -- ONLY include signals from {cutoff_str} or later:
   - Tender notices or awarded contracts in this product category
   - Leadership changes: new CPO, Procurement head, Plant Manager, Sustainability Director
   - Capital expenditure: new facilities, expansions, equipment investment
   - Budget announcements, fiscal year spending plans
   - Sustainability/decarbonisation commitments requiring product upgrades
   - Strategic shifts, M&A, new market entry
   - News events, regulatory requirements
3. Specific facilities, plants, or projects where the supplier's products would apply
4. Decision maker -- name, title, LinkedIn
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
