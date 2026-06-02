"""
STRATAGENT — Extraction Agent
Extracts structured intelligence from PDFs, URLs, and web research.
Feeds the Knowledge Base module.
"""
import json
import re
from services.gemini import generate, generate_with_grounding
import pypdf
import io
import httpx


async def research_supplier_web(company_name: str, website_url: str = None) -> dict:
    """Run deep web research on a supplier using Gemini grounding."""
    url_context = f"Website: {website_url}" if website_url else ""
    prompt = f"""
Research this industrial supplier deeply and return structured intelligence.

Company: {company_name}
{url_context}

Search the web thoroughly. Return a JSON object with these exact keys:
{{
  "company_overview": "verified description of what they make and where",
  "product_catalogue": "complete list of products, variants, applications",
  "technical_differentiators": "what makes them genuinely better in specific situations",
  "certifications": "ISO, ATEX, CE, REACH, DNV, and any others found",
  "case_studies": "reference projects or applications found — named or sector",
  "competitive_positioning": "how they compare to alternatives, where they win",
  "pricing_framework": "pricing structure or range if findable — never guess",
  "reference_projects": "specific named projects or installations if findable",
  "objections_responses": "common objections in this product category",
  "buyer_profiles": "who buys this, why, what triggers a purchase",
  "confidence_notes": "what you found vs what you inferred — be specific"
}}

Rules:
- Only include verified information. Flag inferences with ⚠️
- If a field cannot be populated from available sources, return null
- Do not invent or guess pricing
- Return only the JSON object, no other text
"""
    response = await generate_with_grounding(prompt)
    return _parse_json_response(response)


async def extract_from_pdf(content: bytes, company_name: str) -> dict:
    """Extract structured intelligence from a PDF document."""
    text = _extract_pdf_text(content)
    if not text:
        return {}

    prompt = f"""
Extract structured sales intelligence from this document for {company_name}.

DOCUMENT TEXT:
{text[:12000]}

Return a JSON object with these exact keys (null if not found in document):
{{
  "product_catalogue": "products, models, variants found",
  "technical_datasheets": "specifications, performance data, technical details",
  "certifications": "certifications and standards mentioned",
  "case_studies": "case studies, reference projects, application examples",
  "competitive_positioning": "competitive claims or differentiators",
  "pricing_framework": "pricing information if present",
  "reference_projects": "named projects or customers mentioned",
  "objections_responses": "FAQs, common questions, objection handling"
}}

Rules:
- Extract only what is explicitly stated in the document
- Flag any inference with ⚠️
- Return only the JSON object
"""
    response = await generate(prompt, temperature=0.1)
    return _parse_json_response(response)


async def extract_from_url(url: str, company_name: str) -> dict:
    """Fetch a URL and extract intelligence from its content."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, follow_redirects=True)
            text = resp.text[:12000]
    except Exception:
        return {}

    prompt = f"""
Extract structured sales intelligence from this web page for {company_name}.

URL: {url}
PAGE CONTENT:
{text}

Return a JSON object with these exact keys (null if not found):
{{
  "product_catalogue": "products and services described",
  "technical_datasheets": "technical specifications mentioned",
  "certifications": "certifications or standards mentioned",
  "case_studies": "case studies or customer references",
  "competitive_positioning": "competitive claims or differentiators",
  "pricing_framework": "pricing if mentioned",
  "reference_projects": "named projects or clients",
  "objections_responses": "FAQs or common questions addressed"
}}

Return only the JSON object.
"""
    response = await generate(prompt, temperature=0.1)
    return _parse_json_response(response)


def score_intelligence_depth(profile: dict) -> dict:
    """
    Score each KB element based on content presence and quality.
    Returns dict of element -> score (out of its weight).
    """
    weights = {
        "product_catalogue": 20,
        "technical_datasheets": 15,
        "certifications": 10,
        "case_studies": 20,
        "competitive_positioning": 10,
        "pricing_framework": 10,
        "reference_projects": 10,
        "objections_responses": 5,
    }

    scores = {}
    for element, max_score in weights.items():
        value = profile.get(element)
        if not value or value == "null":
            scores[element] = 0
        elif len(str(value)) < 50:
            scores[element] = max_score * 0.3  # Minimal content
        elif len(str(value)) < 200:
            scores[element] = max_score * 0.6  # Partial content
        else:
            scores[element] = max_score  # Full content
    return scores


def _extract_pdf_text(content: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""


def _parse_json_response(response: str) -> dict:
    """Parse JSON from Gemini response, handling markdown code blocks."""
    try:
        # Strip markdown code fences if present
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        return json.loads(cleaned)
    except Exception:
        return {}
