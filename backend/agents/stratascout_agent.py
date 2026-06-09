"""
STRATAGENT -- STRATASCOUT Agent
Proactive prospect hunter. Geography-scoped, capability-matched.
Finds companies that need the supplier's capability AND show active buying signals.
Deposits candidates to the Prospect Pool for Jason to review.
"""
import json
import re
from services.gemini import generate_with_grounding


GEOGRAPHY_ZONES = {
    "denmark":        "Denmark only",
    "scandinavia":    "Denmark, Sweden, Norway, Finland",
    "northern_europe":"Denmark, Sweden, Norway, Finland, Germany, Netherlands, Belgium, UK, Ireland",
    "europe":         "All EU member states plus UK, Norway, Switzerland",
    "global":         "Worldwide -- no geographic restriction",
}


async def hunt_prospects(
    supplier_kb: dict,
    geography: str,
    sector_focus: str = "",
    count: int = 5,
) -> list:
    """
    Hunt for prospect companies matching the supplier capability within a geography zone.

    Returns a list of prospect candidates for the Prospect Pool.
    Each candidate includes discovery signal, matched capability, and estimated CI.
    """
    from datetime import datetime
    current_year = datetime.now().year
    cutoff_year = current_year - 1  # signals must be from last 18 months

    zone_description = GEOGRAPHY_ZONES.get(geography, GEOGRAPHY_ZONES["scandinavia"])
    supplier_summary = _summarise_kb(supplier_kb)
    if sector_focus:
        sector_hint = f"""
SECTOR FOCUS -- THIS IS A HARD CONSTRAINT:
You are hunting specifically within this sector/buyer type: "{sector_focus}"
Only return prospects that belong to this sector or buyer profile.
Do not stray into adjacent sectors. If you cannot find {count} matches within this sector, return fewer -- do not pad with off-sector results.
Examples of how to interpret a sector focus:
  "Airbnb Superhost operators" -> multi-property short-term rental hosts, property management companies running STR portfolios, Airbnb co-hosts managing 5+ properties
  "hotel chains" -> branded hotel groups, boutique hotel operators, serviced apartment operators
  "food service" -> cafes, restaurants, catering companies, canteen operators
  "offshore energy" -> oil platform operators, offshore wind installation contractors
Apply the same interpretive logic to: "{sector_focus}"
"""
    else:
        sector_hint = ""

    prompt = f"""
You are STRATASCOUT -- an elite proactive prospect hunter for an industrial supplier.
Your mission: find companies that NEED this supplier's EXACT capability AND are in active motion RIGHT NOW.

TODAY'S DATE: {datetime.now().strftime("%B %Y")}

SUPPLIER CAPABILITY -- READ THIS CAREFULLY:
{supplier_summary}

CRITICAL -- PRODUCT MATCHING RULES:
1. Match prospects to the EXACT products described above. Read the description literally.
2. Do NOT infer product type from individual words -- use the FULL description.
3. Do NOT substitute adjacent or similar-sounding products.

WORD DISAMBIGUATION -- apply this logic before every match:
- "filter" in the context of tea/coffee = paper filter for brewing beverages (like a teabag or drip coffee filter). This is NOT a water filter, NOT an RO system, NOT industrial filtration, NOT water treatment.
- "filter" in the context of industrial/technical = filtration system. NOT a beverage filter.
- "biodegradable" = compostable material product. NOT recycling infrastructure. NOT waste management.
- "3D printed" = additive manufactured physical parts. NOT digital design software. NOT general manufacturing.

SELF-CHECK before including any prospect: Ask -- "Would the procurement manager for THIS specific product (exactly as described) contact this supplier?" If the answer requires a stretch of logic, do not include the prospect.

Example of a WRONG match: MissBlue (biodegradable coffee filter paper) -> Novo Nordisk (needs water treatment infrastructure). WRONG. Novo Nordisk does not buy filter paper from MissBlue.
Example of a RIGHT match: MissBlue (biodegradable coffee filter paper) -> a hotel chain buying eco-certified coffee supplies for guest rooms. RIGHT.

GEOGRAPHY ZONE: {zone_description}
{sector_hint}
RECENCY REQUIREMENT -- THIS IS MANDATORY:
Every buying signal MUST be from {cutoff_year} or {current_year}.
Signals from {cutoff_year - 1} or earlier are REJECTED -- do not include them.
If you cannot find a recent signal for a prospect, skip that prospect entirely.
Old news is not a buying signal. A 2021 announcement is not actionable in {current_year}.

Search the web for CURRENT news, tenders, and announcements. You are hunting for {count} prospects.

For each prospect you need:
1. A company with genuine operational need for THIS SPECIFIC SUPPLIER'S products
2. A RECENT buying signal (from {cutoff_year}-{current_year} only). Search ALL of these sources:

   FORMAL SIGNALS (high confidence):
   - Active published tender or procurement notice
   - Capital expenditure announced recently (new facility, expansion, equipment investment)
   - New leadership hire in procurement, sustainability, or operations
   - Regulatory compliance deadline requiring this product category
   - Strategic announcement creating procurement need

   SOCIAL & COMMUNITY SIGNALS (early-stage but highly valuable):
   - Reddit posts or threads where operators in this sector complain about the exact problem this supplier solves
     Search: site:reddit.com + sector keywords + problem keywords
   - X (Twitter) posts from companies or operators in this sector describing frustrations or unmet needs
   - Blog posts or industry articles where operators describe pain points this supplier addresses
   - Review sites (Trustpilot, Google Reviews) where customers of similar products complain about gaps
   - LinkedIn posts from procurement managers or operations heads describing a challenge

   A complaint on Reddit saying "we can't find a reliable supplier for X" is a stronger signal than a vague capex announcement.
   A thread of 50 Airbnb hosts complaining about the same problem is a market signal, not just one lead.

3. An identifiable decision maker or contact route
4. Company within geography zone: {zone_description}

Quality over quantity. Return fewer prospects if recent, specific matches are scarce.
Do not pad with old or vague results.

Return a JSON array of up to {count} objects:
[
  {{
    "company_name": "Company Name",
    "country": "Country",
    "city": "City or region",
    "industry": "Specific industry sector",
    "operational_need": "Exactly why they need THIS supplier's specific products -- be direct and literal",
    "discovery_signal": {{
      "type": "TENDER | CAPEX | LEADERSHIP_CHANGE | REGULATORY | STRATEGIC_SHIFT | NEWS_EVENT | SOCIAL_SIGNAL",
      "description": "What was found -- be specific and factual",
      "timing": "Month and year this was reported -- must be {cutoff_year} or {current_year}",
      "source": "URL or publication where this was found"
    }},
    "decision_maker": {{
      "name": "Name or null",
      "title": "Title or null",
      "linkedin": "URL or null"
    }},
    "estimated_ci": 0-100,
    "discovery_reason": "One sentence: why this company was surfaced -- connect THIS supplier's exact product to their specific need and the recent signal",
    "confidence": "HIGH | MEDIUM | LOW"
  }}
]

Scoring guidance for estimated_ci:
- 80-100: Recent verified signal + direct product match + identified decision maker
- 60-79: Direct product match + recent signal but less specific
- 40-59: Good match but signal is indirect or confidence is lower
- Below 40: Do not include

Return only the JSON array. No preamble or explanation.
"""
    response = await generate_with_grounding(prompt)
    candidates = _parse_json_array(response)

    # Normalise and validate each candidate
    clean = []
    for c in candidates:
        if not c.get("company_name"):
            continue
        clean.append({
            "company_name":    c.get("company_name", ""),
            "country":         c.get("country", ""),
            "city":            c.get("city", ""),
            "industry":        c.get("industry", ""),
            "operational_need":c.get("operational_need", ""),
            "discovery_signal":c.get("discovery_signal", {}),
            "decision_maker":  c.get("decision_maker", {}),
            "estimated_ci":    _safe_int(c.get("estimated_ci", 0)),
            "discovery_reason":c.get("discovery_reason", ""),
            "confidence":      c.get("confidence", "MEDIUM"),
        })

    # Sort by estimated CI descending
    clean.sort(key=lambda x: x["estimated_ci"], reverse=True)
    return clean


def _summarise_kb(kb: dict) -> str:
    profile = kb.get("profile", {})
    seed = kb.get("manual_seed", {})
    company = kb.get("company_name", "Unknown")
    website = kb.get("website_url", "")

    parts = ["SUPPLIER DEFINITION:"]

    # Manual seed takes absolute precedence -- Jason's own words
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
    overview  = profile.get("company_overview", "")
    if not any(seed.values()):
        # No seed -- use overview as the lead to prevent name-based inference
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


def _safe_int(val) -> int:
    try:
        return max(0, min(100, int(val)))
    except (TypeError, ValueError):
        return 0


def _parse_json_array(response: str) -> list:
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        result = json.loads(cleaned)
        return result if isinstance(result, list) else []
    except Exception:
        return []
