"""
STRATAGENT -- Extraction Agent
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
  "case_studies": "reference projects or applications found -- named or sector",
  "competitive_positioning": "how they compare to alternatives, where they win",
  "pricing_framework": "pricing structure or range if findable -- never guess",
  "reference_projects": "specific named projects or installations if findable",
  "objections_responses": "common objections in this product category",
  "buyer_profiles": "who buys this, why, what triggers a purchase",
  "supplier_location": "city, state/province, country where the company is headquartered or primarily operates -- use verified address or About/Contact page data",
  "confidence_notes": "what you found vs what you inferred -- be specific"
}}

Rules:
- Only include verified information. Flag inferences with [!]️
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
- Flag any inference with [!]️
- Return only the JSON object
"""
    response = await generate(prompt, temperature=0.1)
    return _parse_json_response(response)


async def extract_from_url(url: str, company_name: str, focus_element: str = "", context_note: str = "") -> dict:
    """Fetch a URL and extract intelligence from its content."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, follow_redirects=True)
            text = resp.text[:12000]
    except Exception:
        return {}

    focus_hint = ""
    if focus_element:
        focus_hint = f"\nPRIORITY FOCUS: This source was added specifically to address the intelligence gap in '{focus_element}'. Extract this element with extra detail."
    if context_note:
        focus_hint += f"\nUSER CONTEXT: {context_note}"

    prompt = f"""
Extract structured sales intelligence from this web page for {company_name}.

URL: {url}{focus_hint}
PAGE CONTENT:
{text}

Return a JSON object with these exact keys (null if not found):
{{
  "product_catalogue": "products and services described",
  "technical_datasheets": "technical specifications mentioned",
  "certifications": "certifications or standards mentioned",
  "case_studies": "case studies or customer references",
  "competitive_positioning": "competitive claims or differentiators",
  "pricing_framework": "pricing if mentioned -- include retail price, volume tiers, currency",
  "distribution_channels": "if this is a retailer or distributor page: channel name, brand used (original or private label), price point, buyer segment served, volume pricing tiers",
  "reference_projects": "named projects or clients",
  "objections_responses": "FAQs or common questions addressed"
}}

Return only the JSON object.
"""
    response = await generate(prompt, temperature=0.1)
    return _parse_json_response(response)


def score_intelligence_depth(profile: dict) -> dict:
    """
    Score each KB element based on content quality, not just length.

    Scoring model (per element):
      - Presence tier  (0 -> 0.5): is anything there at all?
      - Depth bonus    (up to 0.2): multiple paragraphs / accumulated sources
      - Key terms      (up to 0.15): domain-specific terms that signal real intelligence
      - Specificity    (up to 0.15): numbers, model codes, named entities, measurements

    Each element score = quality_ratio (0.0-1.0) × element max weight.
    Total max = 100.
    """
    import re

    WEIGHTS = {
        "product_catalogue":      20,
        "technical_datasheets":   15,
        "certifications":         10,
        "case_studies":           20,
        "competitive_positioning":10,
        "pricing_framework":       8,
        "distribution_channels":  12,
        "reference_projects":     10,
        "objections_responses":    5,
    }

    # Key terms that signal genuine intelligence per element
    KEY_TERMS = {
        "product_catalogue": [
            "series", "model", "range", "variant", "type", "grade", "version",
            "standard", "custom", "OEM", "capacity", "size", "format", "option",
        ],
        "technical_datasheets": [
            "temperature", "pressure", "voltage", "current", "flow", "speed",
            "tolerance", "dimension", "weight", "rating", "resistance", "IP",
            "operating", "specification", "performance", "output", "input",
        ],
        "certifications": [
            "ISO", "ATEX", "CE", "DNV", "UL", "FDA", "REACH", "RoHS", "IECEx",
            "NORSOK", "API", "ASME", "PED", "GOST", "EN", "certified", "approved",
            "compliant", "accredited", "certificate", "directive",
        ],
        "case_studies": [
            "customer", "client", "project", "installation", "deployed", "reduced",
            "increased", "saved", "improved", "result", "outcome", "challenge",
            "solution", "reference", "sector", "plant", "facility", "site",
        ],
        "competitive_positioning": [
            "competitor", "alternative", "advantage", "superior", "outperform",
            "versus", "compared", "market", "unique", "leader", "difference",
            "benchmark", "better", "preferred", "win", "loss",
        ],
        "pricing_framework": [
            "price", "cost", "rate", "fee", "quote", "budget", "contract",
            "volume", "discount", "minimum", "order", "MOQ", "EUR", "USD",
            "GBP", "DKK", "per unit", "per metre", "annual",
        ],
        "reference_projects": [
            "project", "installation", "site", "plant", "facility", "named",
            "completed", "delivered", "commissioned", "awarded", "contract",
            "country", "region", "GW", "MW", "km", "tonnes", "units",
        ],
        "objections_responses": [
            "concern", "question", "objection", "FAQ", "why", "how", "what if",
            "warranty", "support", "lead time", "availability", "minimum",
            "alternative", "comparison", "limitation",
        ],
        "distribution_channels": [
            "distributor", "reseller", "retailer", "webshop", "stockist", "vendor",
            "private label", "white label", "channel", "wholesale", "direct",
            "partner", "dealer", "agent", "catalogue", "listing", "DKK", "EUR",
            "per pack", "stk", "carton", "pallet", "bulk", "volume",
        ],
    }

    # Patterns that indicate specific, verifiable data
    SPECIFICITY_PATTERNS = [
        r"\b\d+[\.,]?\d*\s*(?:°C|°F|K|bar|psi|MPa|kPa|V|A|W|kW|MW|GW|Hz|rpm|m/s|km/h|mm|cm|m|km|kg|g|l|ml|%)\b",
        r"\b(?:ISO|EN|ATEX|IEC|NORSOK|API|ASME|CE|UL|DNV)\s*[\d\w\-]+",
        r"\b[A-Z]{2,6}[\-\s]?\d{3,}[A-Z]?\b",  # model/part numbers
        r"\b(?:19|20)\d{2}\b",                   # years
        r"\b\d+\s*(?:years?|months?|weeks?|days?)\b",
        r"\b(?:€|£|\$|USD|EUR|GBP|DKK)\s*[\d,\.]+",
        r"\b\d+[\.,]\d+\b",                       # decimal numbers = measurements
    ]

    def _quality_ratio(text, element: str) -> float:
        if text is None:
            return 0.0
        if not isinstance(text, str):
            text = str(text)
        if not text or text.strip().lower() in ("null", "none", "n/a", ""):
            return 0.0
        length = len(text)

        # 1. Presence tier -- baseline from length
        if length < 30:
            presence = 0.15
        elif length < 100:
            presence = 0.30
        elif length < 300:
            presence = 0.45
        else:
            presence = 0.50   # max from presence alone

        # 2. Depth bonus -- reward accumulated content (multiple paragraphs/sources)
        paragraph_count = len([p for p in text.split("\n\n") if p.strip()])
        depth = min(0.20, paragraph_count * 0.04)

        # 3. Key terms -- domain-specific vocabulary for this element
        terms = KEY_TERMS.get(element, [])
        text_lower = text.lower()
        term_hits = sum(1 for t in terms if t.lower() in text_lower)
        key_term_score = min(0.15, term_hits * 0.025)

        # 4. Specificity -- numbers, codes, measurements, named entities
        spec_hits = sum(
            len(re.findall(pattern, text, re.IGNORECASE))
            for pattern in SPECIFICITY_PATTERNS
        )
        specificity = min(0.15, spec_hits * 0.03)

        return min(1.0, presence + depth + key_term_score + specificity)

    scores = {}
    for element, max_weight in WEIGHTS.items():
        value = profile.get(element)
        ratio = _quality_ratio(value, element)
        scores[element] = round(ratio * max_weight, 2)

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
