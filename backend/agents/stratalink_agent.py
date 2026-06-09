"""
STRATAGENT -- STRATALINK Agent
Affiliate intelligence and revenue development.

STRATALINK is Jason's product expert for the affiliate division.
It researches affiliate programs, evaluates their quality, matches partners
to prospects based on adjacent needs, and helps build the affiliate library
slow and steady.

Crawl phase: research + library management + manual referral logging
Walk phase: auto-match on every FI run
Run phase: proactive category scouting + revenue analytics
"""
import json
import re
from services.gemini import generate_with_grounding, generate


AFFILIATE_CATEGORIES = {
    "property_management":  "Software and services for short-term rental and Airbnb operators",
    "hospitality_supplies": "Physical products for hotel, hostel, and STR guest experience",
    "eco_products":         "Sustainable, biodegradable, or eco-certified consumer products",
    "industrial_supplies":  "Industrial consumables, safety, maintenance, and facility products",
    "b2b_software":         "Business software for SMEs -- CRM, ERP, operations, procurement",
    "logistics":            "Shipping, fulfilment, and supply chain services",
    "marketing_tools":      "Digital marketing, SEO, email, social media tools for SMBs",
    "finance_payments":     "Payment processing, invoicing, accounting for small businesses",
    "training_consulting":  "Online courses, coaching, consulting services for B2B",
    "energy_sustainability":"Renewable energy, sustainability auditing, carbon offset services",
}


async def research_affiliate_category(
    category: str,
    geography: str = "europe",
    count: int = 5,
) -> list:
    """
    Research affiliate programs in a given category.
    Returns a list of programs worth evaluating for Jason's affiliate library.
    """
    category_desc = AFFILIATE_CATEGORIES.get(category, category)

    prompt = f"""
You are STRATALINK -- the affiliate intelligence agent for STRATAGENT.
Your job is to find high-quality affiliate programs that Jason Smith (solopreneur B2B sales, Denmark)
could join to earn commissions by referring his prospects and contacts.

CATEGORY TO RESEARCH: {category}
Description: {category_desc}
Geography focus: {geography} (prefer programs accepting European affiliates)

Search for {count} affiliate programs in this category. For each program, find:
1. The company name and what they sell
2. Their affiliate program structure (commission rate, cookie duration, payment terms)
3. The affiliate network they use (direct, Impact, CJ, ShareASale, PartnerStack, Awin, etc.)
4. The ideal buyer profile -- who should Jason refer to earn commissions
5. Whether the program is genuinely worth joining (reputation, payout reliability, conversion rate if findable)
6. The signup URL for their affiliate program

Focus on programs that complement Jason's existing supplier base:
- MissBlue (biodegradable tea/coffee filters) -> hospitality, Airbnb, eco-conscious buyers
- STRATATIV3D / Ungunk (3D printed bathroom products) -> hospitality, property managers
- Industrial suppliers -> facility managers, procurement teams, maintenance operations

Return a JSON array of {count} objects:
[
  {{
    "partner_name": "Company Name",
    "product_description": "What they sell in plain English",
    "target_buyer": "Who buys this -- the affiliate referral target",
    "commission_type": "one-time | recurring | hybrid",
    "commission_rate": "e.g. 20% recurring, $50 per signup, 15% of first order",
    "cookie_duration_days": 30,
    "affiliate_network": "direct | Impact | CJ | ShareASale | PartnerStack | Awin | other",
    "signup_url": "URL to their affiliate program signup page",
    "why_relevant": "Why this program suits Jason's prospect base specifically",
    "quality_rating": "HIGH | MEDIUM | LOW",
    "quality_notes": "Commission reliability, payout history, conversion rate if known"
  }}
]

Return only the JSON array.
"""
    response = await generate_with_grounding(prompt)
    programs = _parse_json_array(response)
    programs.sort(key=lambda x: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(x.get("quality_rating", "LOW"), 2))
    return programs


async def evaluate_affiliate_program(
    program_url: str,
    partner_name: str = "",
) -> dict:
    """
    Deep-research a specific affiliate program before adding it to the library.
    Returns a structured evaluation.
    """
    prompt = f"""
You are STRATALINK evaluating a specific affiliate program for STRATAGENT.

Program: {partner_name or program_url}
URL: {program_url}

Research this affiliate program thoroughly. Find:
1. Commission structure -- exact rates, tiers, recurring vs one-time
2. Cookie duration
3. Payment schedule and minimum payout threshold
4. Affiliate network used
5. Reputation -- are affiliates paid reliably? Any complaints?
6. Average conversion rate if findable (industry benchmarks if not)
7. Promotional materials available (banners, links, email templates)
8. Restrictions -- any geographic restrictions for European affiliates?
9. Contact details for the affiliate manager

Return a JSON object:
{{
  "partner_name": "Company Name",
  "product_description": "What they sell",
  "target_buyer": "Ideal referral target",
  "commission_type": "one-time | recurring | hybrid",
  "commission_rate": "Exact rate details",
  "cookie_duration_days": 0,
  "payment_schedule": "e.g. monthly, net-30",
  "minimum_payout": "e.g. $50",
  "affiliate_network": "Network name",
  "signup_url": "Direct signup URL",
  "geo_restrictions": "Any restrictions for EU/Danish affiliates",
  "quality_rating": "HIGH | MEDIUM | LOW",
  "quality_notes": "Reliability, reputation, conversion notes",
  "affiliate_manager": "Name and contact if findable",
  "recommendation": "JOIN | WATCH | SKIP",
  "recommendation_reason": "Why"
}}

Return only the JSON object.
"""
    response = await generate_with_grounding(prompt)
    return _parse_json_response(response)


async def match_affiliates_to_prospect(
    prospect_profile: dict,
    affiliate_partners: list,
) -> list:
    """
    Given a researched prospect profile and the affiliate partner library,
    find which partners are a relevant adjacent match.

    Returns ranked list of affiliate recommendations for this prospect.
    """
    if not affiliate_partners:
        return []

    # Build a concise partner summary for the prompt
    partner_list = "\n".join([
        f"- {p.get('partner_name')}: {p.get('product_description', '')} | Buyer: {p.get('target_buyer', '')} | Commission: {p.get('commission_rate', '')}"
        for p in affiliate_partners if p.get('program_status') == 'active'
    ])

    if not partner_list:
        return []

    overview   = prospect_profile.get("company_overview", "")
    context    = prospect_profile.get("operational_context", "")
    buyer_type = prospect_profile.get("buyer_profiles", "")
    company    = prospect_profile.get("company_name", "this prospect")

    prompt = f"""
You are STRATALINK identifying adjacent affiliate opportunities for a researched prospect.

PROSPECT: {company}
Overview: {overview[:300]}
Operational context: {context[:200]}

AFFILIATE PARTNER LIBRARY:
{partner_list}

Which of these affiliate partners are a genuine adjacent fit for this prospect?
Consider: would this prospect plausibly need or benefit from this partner's product or service,
given what we know about their operations?

Only include partners where the match is real and specific -- not generic.
Return up to 3 matches, ranked by relevance.

Return a JSON array:
[
  {{
    "partner_name": "Partner Name",
    "match_reason": "One sentence: specifically why this prospect would benefit from this partner's product",
    "referral_angle": "How Jason could naturally introduce this in conversation with the prospect",
    "relevance_score": 1-10
  }}
]

Return only the JSON array. Empty array if no genuine matches.
"""
    response = await generate(prompt, temperature=0.2)
    matches = _parse_json_array(response)
    matches.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
    return matches


def _parse_json_array(response: str) -> list:
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        result = json.loads(cleaned)
        return result if isinstance(result, list) else []
    except Exception:
        return []


def _parse_json_response(response: str) -> dict:
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        return json.loads(cleaned)
    except Exception:
        return {}
