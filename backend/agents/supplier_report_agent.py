"""
STRATAGENT -- Supplier Report Agent
Three capabilities:
  1. Q&A        -- answer questions grounded in a specific supplier KB
  2. Audit      -- evaluate KB quality, identify gaps, recommend sources
  3. Synthesis  -- generate a branded capability document for the supplier
"""
import json
import re
from services.gemini import generate


# ── Q&A ENGINE ─────────────────────────────────────────────────────────────

async def answer_question(question: str, kb: dict) -> dict:
    """
    Answer a specific question grounded strictly in the supplier KB.
    Returns the answer plus confidence and the KB fields referenced.
    """
    profile = kb.get("profile", {})
    seed    = kb.get("manual_seed", {})
    company = kb.get("company_name", "Unknown Supplier")

    kb_summary = _format_kb_for_context(kb)

    prompt = f"""
You are STRATAGENT answering a specific question about a supplier called {company}.
Answer ONLY from the information provided below. Do not invent or infer beyond what is stated.
If the answer is not in the KB, say so clearly and suggest what source would contain it.

SUPPLIER KNOWLEDGE BASE:
{kb_summary}

QUESTION: {question}

Return JSON:
{{
  "answer": "direct answer to the question based on KB content",
  "confidence": "HIGH | MEDIUM | LOW",
  "confidence_reason": "why this confidence level -- what was found or what is missing",
  "kb_fields_used": ["field1", "field2"],
  "missing_intel": "what information would be needed to answer this more precisely, or null if fully answered"
}}

Return only the JSON object.
"""
    response = await generate(prompt, temperature=0.2)
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        result = json.loads(cleaned)
    except Exception:
        result = {
            "answer": response,
            "confidence": "LOW",
            "confidence_reason": "Could not parse structured response",
            "kb_fields_used": [],
            "missing_intel": None,
        }
    result["company_name"] = company
    result["question"] = question
    return result


# ── AUDIT REPORT ───────────────────────────────────────────────────────────

async def generate_audit_report(kb: dict) -> dict:
    """
    Evaluate KB quality across all intelligence elements.
    Identifies gaps and recommends specific sources to fill them.
    """
    company = kb.get("company_name", "Unknown Supplier")
    depth   = kb.get("intelligence_depth", {})
    scores  = depth.get("scores", {})
    total   = round(depth.get("total", 0))
    profile = kb.get("profile", {})
    seed    = kb.get("manual_seed", {})

    score_summary = "\n".join(
        f"  {field}: {round(score)}/100"
        for field, score in scores.items()
    ) if scores else "  No scores available"

    profile_summary = _format_kb_for_context(kb)

    prompt = f"""
You are STRATAGENT generating an Intelligence Audit Report for supplier: {company}
Overall Intelligence Depth: {total}/100

CURRENT SCORES PER ELEMENT:
{score_summary}

CURRENT KNOWLEDGE BASE CONTENT:
{profile_summary}

Generate a structured audit that:
1. Grades each element (STRONG / ADEQUATE / WEAK / MISSING)
2. Identifies the specific gaps that most reduce sales effectiveness
3. For each gap, recommends the EXACT source type to fix it (e.g. "Search for '{company} technical datasheet PDF'")
4. Prioritises the 3 most impactful gaps to fix first

Return JSON:
{{
  "company_name": "{company}",
  "overall_depth": {total},
  "overall_grade": "SINGULARITY READY (90+) | PROPOSAL READY (80-89) | VALUE BRIEF READY (50-79) | INTELLIGENCE GAP (<50)",
  "elements": [
    {{
      "field": "field_name",
      "score": 0,
      "grade": "STRONG | ADEQUATE | WEAK | MISSING",
      "what_is_there": "brief summary of what exists",
      "what_is_missing": "specific missing content",
      "recommended_source": "exact search query or document type to find the missing intel"
    }}
  ],
  "top_3_priorities": [
    {{
      "rank": 1,
      "field": "field_name",
      "why_it_matters": "sales impact of this gap",
      "action": "specific action to take"
    }}
  ],
  "strengths": ["what this KB does well"],
  "ready_for": "what this KB is currently strong enough to support"
}}

Return only the JSON object.
"""
    response = await generate(prompt, temperature=0.2)
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        return json.loads(cleaned)
    except Exception:
        return {"error": "Could not parse audit report", "raw": response}


# ── CAPABILITY SYNTHESIS REPORT ────────────────────────────────────────────

async def generate_synthesis_report(kb: dict, branding: dict | None = None) -> dict:
    """
    Generate a professional capability document for the supplier.
    branding = {
        "ssi_name": "Strategic Sales International ApS",
        "ssi_email": "info@strategic.dk",
        "ssi_phone": "+45 24 99 23 93",
        "ssi_web": "www.strategic-dk.com",
        "prepared_by": "Jason L. Smith",
        "show_ssi_as_author": True
    }
    Returns structured content for rendering as HTML or Word doc.
    """
    company = kb.get("company_name", "Unknown Supplier")
    profile = kb.get("profile", {})
    seed    = kb.get("manual_seed", {})

    branding = branding or {
        "ssi_name": "Strategic Sales International ApS",
        "ssi_email": "info@strategic.dk",
        "ssi_phone": "+45 24 99 23 93",
        "ssi_web": "www.strategic-dk.com",
        "prepared_by": "Jason L. Smith",
        "show_ssi_as_author": True,
    }

    kb_summary = _format_kb_for_context(kb)

    prompt = f"""
You are STRATAGENT generating a professional Capability Intelligence Report for supplier: {company}
This document is prepared by {branding['prepared_by']} at {branding['ssi_name']} and may be
shared with prospective buyers or presented to the supplier to validate the intelligence mapping.

KNOWLEDGE BASE:
{kb_summary}

Generate a comprehensive, professional capability document. Be specific -- use actual product names,
model numbers, certifications, and technical specifications found in the KB.
Do not use placeholder text. If data is missing, omit that section rather than guessing.

Return JSON:
{{
  "company_name": "{company}",
  "report_title": "Supplier Capability Intelligence Report",
  "executive_summary": "2-3 sentence summary of who this supplier is and their primary value proposition",
  "product_range": {{
    "headline": "one-line description of the product range",
    "products": [
      {{
        "name": "product or product line name",
        "description": "what it is and what it does",
        "operating_envelope": "key technical specs -- temperatures, pressures, sizes, materials",
        "applications": "where it is used"
      }}
    ]
  }},
  "technical_differentiators": [
    "specific differentiator with evidence from KB"
  ],
  "certifications": [
    {{
      "name": "certification name",
      "relevance": "what this means for buyers"
    }}
  ],
  "target_buyer_profiles": [
    {{
      "buyer_type": "type of buyer",
      "why_they_buy": "the operational need this solves",
      "typical_application": "specific use case"
    }}
  ],
  "competitive_positioning": "how this supplier compares to alternatives -- be specific",
  "common_objections": [
    {{
      "objection": "the objection a buyer might raise",
      "response": "how to handle it based on the KB"
    }}
  ],
  "case_studies_summary": "summary of known case studies and reference customers, or null",
  "geography_and_distribution": "where they operate and how they sell",
  "prepared_by": "{branding['prepared_by']}",
  "prepared_for_org": "{branding['ssi_name']}",
  "contact_email": "{branding['ssi_email']}",
  "contact_phone": "{branding['ssi_phone']}",
  "contact_web": "{branding['ssi_web']}"
}}

Return only the JSON object.
"""
    response = await generate(prompt, temperature=0.3)
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        return json.loads(cleaned)
    except Exception:
        return {"error": "Could not parse synthesis report", "raw": response}


# ── HELPERS ────────────────────────────────────────────────────────────────

def _format_kb_for_context(kb: dict) -> str:
    """Format KB content for Gemini context window."""
    profile = kb.get("profile", {})
    seed    = kb.get("manual_seed", {})
    lines   = [f"Company: {kb.get('company_name', 'Unknown')}"]

    if seed.get("product_plain"):
        lines.append(f"What they sell (authoritative): {seed['product_plain']}")
    if seed.get("buyer_type"):
        lines.append(f"Who buys this: {seed['buyer_type']}")
    if seed.get("use_case"):
        lines.append(f"Use case: {seed['use_case']}")
    if seed.get("not_this"):
        lines.append(f"NOT this product: {seed['not_this']}")

    field_labels = {
        "product_catalogue":        "Product Catalogue",
        "technical_differentiators":"Technical Differentiators",
        "certifications":           "Certifications",
        "case_studies":             "Case Studies",
        "buyer_profiles":           "Buyer Profiles",
        "competitive_positioning":  "Competitive Positioning",
        "operational_context":      "Operational Context",
        "recent_news":              "Recent News / Developments",
    }
    for field, label in field_labels.items():
        val = profile.get(field)
        if val:
            lines.append(f"{label}: {str(val)[:500]}")

    return "\n".join(lines)
