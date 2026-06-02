"""
STRATAGENT — Research Agent
Deep prospect research for Field Intelligence module.
Produces Relationship Profiles and Convergence Index scores.
"""
import json
import re
from services.gemini import generate_with_grounding, generate


async def research_prospect(
    company_name: str,
    supplier_kb: dict,
) -> dict:
    """
    Research a prospect company and score alignment with supplier capability.
    Returns a full Relationship Profile with Convergence Index.
    """
    supplier_summary = _summarise_kb(supplier_kb)

    prompt = f"""
You are STRATAGENT conducting deep prospect research for an industrial supplier.

SUPPLIER CAPABILITY SUMMARY:
{supplier_summary}

PROSPECT TO RESEARCH: {company_name}

Search the web thoroughly. Find:
1. What this company makes, processes, or operates — be specific about their industry
2. Specific facilities, plants, or operations where the supplier's products would apply
3. Decision maker — name, title, LinkedIn if findable
4. Regulatory or compliance pressures creating a buying trigger right now
5. Active projects, tenders, capex announcements, or expansion plans
6. Current supplier relationships in this product category if findable
7. Recent news, strategic shifts, or operational changes

Then assess alignment:
- How well does the supplier's capability match this prospect's known needs?
- Is there a specific buying trigger visible right now?
- What is the quality of available intelligence?

Return a JSON object:
{{
  "company_overview": "verified description — specific, not generic",
  "operational_context": "what they do and where it creates the need",
  "decision_maker": {{
    "name": "name or null",
    "title": "title or null",
    "linkedin": "url or null",
    "confidence": "high/medium/low"
  }},
  "buying_trigger": "specific reason they need this now, or null if not found",
  "active_projects": "tenders, capex, expansions found — or null",
  "current_suppliers": "known suppliers in this category — or null",
  "recent_news": "relevant recent developments",
  "convergence_index": {{
    "score": 0-100,
    "reasoning": "honest explanation of the score",
    "what_would_improve_it": "specific intelligence that would raise the score"
  }},
  "recommended_path": "CONVERGENCE_PROPOSAL / MUTUAL_VALUE_BRIEF / FIRST_SIGNAL / PARK",
  "confidence_notes": "what was found vs inferred — be specific"
}}

Rules:
- Flag all inferences with ⚠️
- Score the Convergence Index honestly — do not inflate
- Below 60: recommend PARK with specific watch triggers
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

    return profile


async def find_alternative_prospects(
    supplier_kb: dict,
    failed_prospect: str,
    count: int = 3,
) -> list:
    """
    When Convergence Index is below 60, find better-aligned alternatives.
    """
    supplier_summary = _summarise_kb(supplier_kb)

    prompt = f"""
A prospect research attempt for "{failed_prospect}" returned insufficient alignment.

SUPPLIER CAPABILITY:
{supplier_summary}

Find {count} alternative prospect companies that would be a stronger match.
Focus on companies with:
- Active operations requiring this type of product
- Visible buying triggers or regulatory pressure
- Accessible decision makers
- Geography: Europe preferred but global acceptable

Return a JSON array of {count} objects:
[
  {{
    "company_name": "Company Name",
    "country": "Country",
    "reason": "Why this is a better match — specific operational reason",
    "buying_trigger": "What creates the need right now",
    "estimated_convergence": 0-100
  }}
]

Return only the JSON array.
"""
    response = await generate_with_grounding(prompt)
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        return json.loads(cleaned)
    except Exception:
        return []


def _summarise_kb(kb: dict) -> str:
    profile = kb.get("profile", {})
    return f"""
Company: {kb.get('company_name', 'Unknown')}
Products: {profile.get('product_catalogue', 'Not specified')}
Differentiators: {profile.get('technical_differentiators', 'Not specified')}
Certifications: {profile.get('certifications', 'Not specified')}
Buyer profiles: {profile.get('buyer_profiles', 'Not specified')}
"""


def _parse_json_response(response: str) -> dict:
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        return json.loads(cleaned)
    except Exception:
        return {}
