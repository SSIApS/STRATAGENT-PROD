"""
STRATAGENT -- STRATALYST Agent
Proactively enriches supplier Knowledge Bases by finding intelligence gaps
and searching the web for sources that fill them.

All search configuration lives in stratalyst_config.py -- update that file
during improvement sprints, no changes needed here.

Flow:
  1. Read current KB profile and gap list
  2. Build gap-specific search directives from config
  3. Search web via Gemini grounding
  4. Return findings brief with source candidates + estimated depth gain
  5. On approval, extract and ingest each approved source
"""
import json
import re
from services.gemini import generate_with_grounding, generate
from agents.extraction_agent import extract_from_url, score_intelligence_depth
from stratalyst_config import (
    SOURCE_TYPES,
    GAP_SEARCH_DIRECTIVES,
    ELEMENT_LABELS,
    SEARCH_PRIORITIES,
)


async def research_gaps(company_name: str, profile: dict, gaps: list, website_url: str = None) -> dict:
    """
    Given a supplier KB's current profile and gap list,
    search the web for sources that would fill the gaps.
    Returns a findings brief ready for user approval.
    """
    gap_elements = [g["element"] for g in gaps if g.get("element")]
    current_summary = _summarise_profile(profile)
    website_hint = f"\nKnown website: {website_url}" if website_url else ""

    # Build gap-specific search directives from config
    search_directives = ""
    for element in gap_elements:
        label = ELEMENT_LABELS.get(element, element)
        directive = GAP_SEARCH_DIRECTIVES.get(element, "")
        priorities = SEARCH_PRIORITIES.get(element, [])
        priority_str = ", ".join(priorities[:3]) if priorities else "any"
        search_directives += f"\n### {label}\nPriority source types: {priority_str}\n{directive.strip()}\n"

    # Build source type definitions for the prompt
    source_type_list = "\n".join(
        f'  "{k}": {v["description"]}' for k, v in SOURCE_TYPES.items() if k != "unknown"
    )

    prompt = f"""
You are STRATALYST, an intelligence research agent for STRATAGENT.
Your job: find specific, real, publicly accessible web sources that fill intelligence gaps for this supplier.

SUPPLIER: {company_name}{website_hint}

CURRENT INTELLIGENCE SUMMARY:
{current_summary}

GAPS TO FILL -- SEARCH DIRECTIVES:
{search_directives}

AVAILABLE SOURCE TYPES:
{source_type_list}

Search the web thoroughly using each gap's directives above.
Find real URLs that exist and are publicly accessible without login.

Return a JSON object:
{{
  "sources": [
    {{
      "url": "https://...",
      "title": "page or document title",
      "source_type": "one of the source type keys listed above",
      "fills_gaps": ["element_key1", "element_key2"],
      "what_it_contains": "one specific sentence -- what intelligence this URL provides for this supplier",
      "confidence": "high|medium|low"
    }}
  ],
  "not_found": ["element_key"],
  "search_notes": "brief note on what was searched and any access limitations found"
}}

Rules:
- Only include URLs you are confident actually exist and are publicly accessible
- Maximum 8 sources -- quality over quantity
- Each source must map to at least one gap element in fills_gaps
- If you cannot find a credible source for a gap, list the element key in not_found
- Return only the JSON object, no other text
"""

    response = await generate_with_grounding(prompt)
    findings = _parse_json_response(response)

    # Enrich each source with estimated gain from config
    sources = findings.get("sources", [])
    for source in sources:
        source_type = source.get("source_type", "unknown")
        config = SOURCE_TYPES.get(source_type, SOURCE_TYPES["unknown"])
        source["estimated_gain"] = config["estimated_gain"]
        source["source_type_label"] = source_type.replace("_", " ").title()

    total_estimated_gain = sum(s.get("estimated_gain", 0) for s in sources)

    return {
        "company_name": company_name,
        "gaps_addressed": gap_elements,
        "sources": sources,
        "not_found": findings.get("not_found", []),
        "search_notes": findings.get("search_notes", ""),
        "total_estimated_gain": total_estimated_gain,
        "source_count": len(sources),
    }


async def ingest_approved_sources(
    supplier_id: str,
    company_name: str,
    profile: dict,
    approved_sources: list,
) -> dict:
    """
    Extract intelligence from each approved source URL and merge into the KB profile.
    Returns updated profile, new scores, and a per-source result log.
    """
    results = []
    updated_profile = dict(profile)

    for source in approved_sources:
        url = source.get("url", "")
        fills_gaps = source.get("fills_gaps", [])
        focus_element = fills_gaps[0] if fills_gaps else ""
        gap_labels = ", ".join(ELEMENT_LABELS.get(g, g) for g in fills_gaps)

        try:
            extracted = await extract_from_url(
                url=url,
                company_name=company_name,
                focus_element=focus_element,
                context_note=f"STRATALYST targeted source for: {gap_labels}",
            )

            merged_keys = []
            for key, value in extracted.items():
                if not value:
                    continue
                if not updated_profile.get(key):
                    updated_profile[key] = value
                    merged_keys.append(key)
                else:
                    updated_profile[key] = updated_profile[key] + "\n\n" + value
                    merged_keys.append(key)

            results.append({
                "url": url,
                "title": source.get("title", url),
                "status": "ingested",
                "elements_updated": merged_keys,
            })

        except Exception as e:
            results.append({
                "url": url,
                "title": source.get("title", url),
                "status": "failed",
                "error": str(e),
            })

    scores = score_intelligence_depth(updated_profile)
    total = sum(scores.values())

    return {
        "profile": updated_profile,
        "scores": scores,
        "total": total,
        "results": results,
        "ingested_count": sum(1 for r in results if r["status"] == "ingested"),
        "failed_count": sum(1 for r in results if r["status"] == "failed"),
    }


async def classify_human_intel(
    raw_note: str,
    company_name: str,
    profile: dict,
    existing_notes: list,
) -> dict:
    """
    Take a free-form human intel note and:
    - Classify into NEED TO KNOW or NICE TO KNOW
    - Map to relevant KB element(s)
    - Extract any scorable intelligence snippets
    - Return structured note ready for storage
    """
    import uuid

    existing_summary = ""
    if existing_notes:
        existing_summary = "\n".join(
            f"- [{n.get('classification','?')}] {n.get('raw_note','')[:100]}"
            for n in existing_notes[-5:]
        )

    prompt = f"""
You are STRATALYST processing a human intelligence note about a supplier.

SUPPLIER: {company_name}
CURRENT KB PROFILE SUMMARY:
{_summarise_profile(profile)}

RECENT FIELD NOTES (for context, avoid duplication):
{existing_summary or "None yet."}

NEW NOTE FROM FIELD:
\"\"\"{raw_note}\"\"\"

Classify this note and extract structured intelligence.

Return a JSON object:
{{
  "classification": "NEED TO KNOW" or "NICE TO KNOW",
  "classification_reason": "one sentence explaining why",
  "elements": ["element_key1", "element_key2"],
  "headline": "10-word summary of the key insight",
  "scorable_content": "the specific intelligence that should enrich the KB profile -- rewritten cleanly for use in proposals and research. Null if not applicable.",
  "tags": ["tag1", "tag2"]
}}

Classification rules:
- NEED TO KNOW: affects strategy, approach, proposal, timing, pricing, competitor awareness, buying trigger, decision maker identity
- NICE TO KNOW: relationship color, personal context, general observations, nice background

Element keys to use: {list(ELEMENT_LABELS.keys()) + ["buyer_profiles", "operational_context", "company_overview"]}

Return only the JSON object.
"""
    response = await generate(prompt, temperature=0.1)
    result = _parse_json_response(response)

    return {
        "note_id": str(uuid.uuid4())[:8],
        "raw_note": raw_note,
        "classification": result.get("classification", "NICE TO KNOW"),
        "classification_reason": result.get("classification_reason", ""),
        "elements": result.get("elements", []),
        "headline": result.get("headline", raw_note[:60]),
        "scorable_content": result.get("scorable_content"),
        "tags": result.get("tags", []),
        "source": "human_intel",
    }


async def generate_interview_questions(
    company_name: str,
    profile: dict,
    existing_notes: list,
    gaps: list,
) -> list:
    """
    Generate 4-6 targeted interview questions based on KB gaps
    and what human intel is still missing. Questions should extract
    intelligence that cannot be found on the web.
    """
    gap_elements = [g.get("element", "") for g in gaps]
    gap_labels = [ELEMENT_LABELS.get(e, e) for e in gap_elements]
    covered_topics = [n.get("headline", "") for n in existing_notes]

    prompt = f"""
You are STRATALYST preparing an interview with the account manager who knows {company_name} personally.

INTELLIGENCE GAPS (what web search couldn't find):
{chr(10).join(f"- {l}" for l in gap_labels) or "None -- KB is well populated."}

HUMAN INTEL ALREADY CAPTURED:
{chr(10).join(f"- {t}" for t in covered_topics) or "None yet."}

Generate 4-6 interview questions that will extract intelligence impossible to find online.
Focus on:
- Personal relationships with decision makers
- Unannounced plans, budgets, or projects
- Competitor intelligence learned in conversation
- Operational pain points heard directly
- Timing signals (when they buy, budget cycles)
- Internal politics or blockers

Rules:
- Questions must be specific to {company_name} and its industry context
- Do NOT ask about things already in the KB or already captured
- Each question should unlock a different type of intelligence
- Keep questions conversational, not formal

Return a JSON array:
[
  {{
    "question": "the question text",
    "element": "element_key this answer would fill",
    "why_valuable": "one sentence -- what this unlocks for sales strategy"
  }}
]

Return only the JSON array.
"""
    response = await generate_with_grounding(prompt)
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        start = cleaned.find("[")
        end = cleaned.rfind("]") + 1
        if start >= 0 and end > start:
            return json.loads(cleaned[start:end])
    except Exception:
        pass
    return []


def _summarise_profile(profile: dict) -> str:
    lines = []
    for key, label in ELEMENT_LABELS.items():
        value = profile.get(key)
        if value:
            preview = str(value)[:120].replace("\n", " ")
            lines.append(f"  {label}: {preview}...")
        else:
            lines.append(f"  {label}: [MISSING]")
    return "\n".join(lines)


def _parse_json_response(response: str) -> dict:
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(cleaned[start:end])
    except Exception:
        pass
    return {"sources": [], "not_found": [], "search_notes": "Could not parse response."}


async def synthesise_profile(
    company_name: str,
    profile: dict,
    seed: dict,
    trigger_content: str = "",
    trigger_type: str = "",
) -> dict:
    """
    Auto-enrich: cross-pollinate the existing KB profile using Gemini reasoning only.
    No web search. Reads all existing content and fills thin/missing fields by inference.

    Called automatically after seed update, URL ingest, or field note addition.
    Returns dict of updated profile fields (only those improved, not full profile).
    """
    PROFILE_FIELDS = [
        ("product_catalogue",       "What products and variants does this supplier offer?"),
        ("technical_datasheets",    "What are the technical specifications, dimensions, ratings, or performance data?"),
        ("certifications",          "What certifications, standards, or compliance approvals apply?"),
        ("case_studies",            "What customer types, use cases, or deployment contexts are known?"),
        ("competitive_positioning", "What are the differentiators or competitive advantages?"),
        ("pricing_framework",       "What is known about pricing, volume tiers, or commercial terms?"),
        ("distribution_channels",   "How does the supplier sell and deliver -- direct, distributors, regions?"),
        ("reference_projects",      "What reference customers, installations, or projects are known?"),
        ("objections_responses",    "What common objections or questions arise, and how are they answered?"),
    ]

    # Identify thin fields (less than 150 chars or missing)
    thin_fields = [
        (key, question)
        for key, question in PROFILE_FIELDS
        if len(str(profile.get(key) or "")) < 150
    ]

    if not thin_fields:
        return {}  # Nothing to improve

    # Build context from existing content
    seed_block = ""
    if seed:
        seed_parts = []
        if seed.get("product_plain"):
            seed_parts.append(f"What it sells: {seed['product_plain']}")
        if seed.get("buyer_type"):
            seed_parts.append(f"Who buys it: {seed['buyer_type']}")
        if seed.get("use_case"):
            seed_parts.append(f"How it's used: {seed['use_case']}")
        if seed.get("not_this"):
            seed_parts.append(f"NOT this: {seed['not_this']}")
        seed_block = "OWNER DEFINITION (authoritative):\n" + "\n".join(seed_parts)

    existing_block = "EXISTING PROFILE CONTENT:\n"
    for key, _ in PROFILE_FIELDS:
        val = profile.get(key)
        if val:
            existing_block += f"- {key.replace('_', ' ').title()}: {str(val)[:300]}\n"

    trigger_block = ""
    if trigger_content:
        trigger_block = f"\nJUST ADDED ({trigger_type}):\n{trigger_content[:600]}\n"

    thin_block = "\n".join([
        f'  "{key}": "{question}"'
        for key, question in thin_fields
    ])

    prompt = f"""You are helping build a sales intelligence Knowledge Base for: {company_name}

{seed_block}

{existing_block}
{trigger_block}

Using ONLY the information above -- no web search, no assumptions beyond what is stated -- fill in as many of these thin fields as you can:

{thin_block}

Rules:
- Only use facts that can be directly inferred from the content above
- If you cannot fill a field with real substance from the existing content, leave it empty ("")
- Do not invent, assume, or hallucinate. Accuracy over completeness.
- Keep each filled field concise but specific -- 1-4 sentences
- The seed definition is authoritative -- do not contradict it

Return a JSON object with only the fields you can genuinely fill:
{{
  "product_catalogue": "...",
  "technical_datasheets": "...",
  ...
}}

Only include keys you actually filled. Empty string = omit the key.
"""

    from services.gemini import generate
    response = await generate(prompt)

    # Parse result
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response.strip())
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(cleaned[start:end])
            # Filter: only return non-empty strings for valid fields
            valid_keys = {k for k, _ in PROFILE_FIELDS}
            return {
                k: v for k, v in result.items()
                if k in valid_keys and isinstance(v, str) and v.strip()
            }
    except Exception:
        pass
    return {}


# ---------------------------------------------------------------------------
# Deep Website Crawl
# ---------------------------------------------------------------------------

CRAWL_SKIP_PATTERNS = [
    "login", "cart", "checkout", "account", "cookie", "privacy", "imprint",
    "impressum", "datenschutz", "agb", "gtc", "karriere", "job", "career",
    "application", "kontakt", "contact", "#", "javascript:", "mailto:",
    "tel:", ".pdf", ".jpg", ".png", ".zip",
]

CRAWL_PRIORITY_PATTERNS = [
    "product", "produkt", "solution", "losung", "technical", "technisch",
    "application", "anwendung", "certification", "zertif", "material",
    "service", "about", "company", "overview",
]


def _extract_links(html: str, base_url: str) -> list[str]:
    """Pull hrefs from HTML and normalise to absolute URLs."""
    import re
    from urllib.parse import urljoin, urlparse

    base = urlparse(base_url)
    base_origin = f"{base.scheme}://{base.netloc}"

    raw = re.findall(r'href=["\']([^"\']+)["\']', html)
    seen, links = set(), []
    for href in raw:
        # Skip unwanted patterns
        if any(p in href.lower() for p in CRAWL_SKIP_PATTERNS):
            continue
        # Make absolute
        if href.startswith("http"):
            url = href
        elif href.startswith("/"):
            url = base_origin + href
        else:
            continue
        # Must be same domain
        if urlparse(url).netloc != base.netloc:
            continue
        # Deduplicate
        clean = url.split("?")[0].split("#")[0].rstrip("/")
        if clean not in seen and clean != base_origin:
            seen.add(clean)
            links.append(clean)
    return links


def _score_url_relevance(url: str) -> int:
    """Higher = more worth crawling."""
    url_lower = url.lower()
    score = 0
    for p in CRAWL_PRIORITY_PATTERNS:
        if p in url_lower:
            score += 2
    # Penalise very deep paths (>4 segments)
    depth = len([s for s in url_lower.split("/") if s]) 
    if depth > 5:
        score -= 1
    return score


async def crawl_supplier_website(
    website_url: str,
    company_name: str,
    max_pages: int = 12,
) -> dict:
    """
    Systematically crawl the supplier's website and extract intelligence.

    1. Fetches homepage to discover navigation
    2. Ranks pages by relevance (products, technical, applications first)
    3. Runs extract_from_url in parallel on top N pages
    4. Merges all extracted intelligence, longest wins per field
    5. Returns merged profile dict

    This is the STRATALYST deep scan -- runs automatically, no approval needed.
    """
    import asyncio
    import httpx
    from agents.extraction_agent import extract_from_url

    # Step 1: fetch homepage and discover links
    discovered_urls = []
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(website_url)
            html = resp.text

        # Try English version if site has one
        en_urls = [u for u in _extract_links(html, website_url) if "/en" in u.lower()]
        all_links = _extract_links(html, website_url)

        # If English sub-site found, fetch that too
        if en_urls:
            en_base = en_urls[0]
            try:
                async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                    en_resp = await client.get(en_base)
                all_links += _extract_links(en_resp.text, en_base)
            except Exception:
                pass

        # Deduplicate
        seen = set()
        for url in all_links:
            clean = url.rstrip("/")
            if clean not in seen:
                seen.add(clean)
                discovered_urls.append(clean)

    except Exception:
        # If homepage fetch fails, fall back to known product path patterns
        discovered_urls = [website_url]

    # Step 2: rank by relevance
    ranked = sorted(discovered_urls, key=_score_url_relevance, reverse=True)
    to_crawl = ranked[:max_pages]

    # Always include the homepage / English homepage if not already there
    for must_have in [website_url, website_url.rstrip("/") + "/en"]:
        clean = must_have.rstrip("/")
        if clean not in to_crawl and len(to_crawl) < max_pages:
            to_crawl.insert(0, clean)

    # Step 3: extract from all pages in parallel
    async def safe_extract(url):
        try:
            return await extract_from_url(url, company_name)
        except Exception:
            return {}

    results = await asyncio.gather(*[safe_extract(url) for url in to_crawl])

    # Step 4: merge -- longest content wins per field
    merged: dict = {}
    for result in results:
        for key, value in result.items():
            if value and isinstance(value, str):
                existing = merged.get(key, "")
                if len(value) > len(existing):
                    merged[key] = value
                elif existing and value and value not in existing:
                    # Append supplementary content
                    merged[key] = existing + "\n\n" + value

    return {
        "profile": merged,
        "pages_crawled": len(to_crawl),
        "urls": to_crawl,
    }


def _field(value: str, source: str, confidence: str, jason_only: bool = False) -> dict:
    """Build a standard intelligence_seed field entry."""
    return {
        "value": value,
        "source": source,
        "confidence": confidence,
        "jason_verified": jason_only,
        "jason_only": jason_only,
    }


def _empty_field(reason: str = "") -> dict:
    """Empty field placeholder -- agent could not populate this."""
    return {
        "value": "",
        "source": "not_found",
        "confidence": "low",
        "jason_verified": False,
        "jason_only": False,
        "note": reason,
    }


def _build_empty_seed() -> dict:
    """Return the full intelligence_seed skeleton with all fields empty."""
    empty = lambda: _empty_field()
    return {
        "_meta": {"last_built": "", "build_method": "agentic", "completeness_pct": 0},
        "identity": {
            "product_plain": empty(), "not_this": empty(),
            "problem_solved": empty(), "key_specs": empty(), "certifications": empty(),
        },
        "buyer_intelligence": {
            "buyer_type": empty(), "decision_maker": empty(),
            "influencer": empty(), "use_case": empty(), "procurement_path": empty(),
        },
        "commercial_reality": {
            "deal_size": empty(), "relationship_model": empty(),
            "sales_cycle": empty(), "geography": empty(), "minimum_threshold": empty(),
        },
        "winning_conditions": {
            "we_win_when": empty(), "we_lose_when": empty(),
            "differentiator": empty(), "common_objections": empty(), "proof_points": empty(),
        },
        "signal_recognition": {
            "trigger_events": empty(), "tender_keywords": empty(),
            "capex_indicators": empty(), "regulatory_drivers": empty(), "seasonal_patterns": empty(),
        },
        "ssi_context": {
            "why_ssi": _field("", "jason_only", "low", jason_only=True),
            "target_markets": _field("", "jason_only", "low", jason_only=True),
            "ssi_positioning": _field("", "jason_only", "low", jason_only=True),
            "existing_customer_types": empty(),
        },
        "recommended_fields": [],
    }


def _parse_block_response(response: str) -> dict:
    """Parse a block-level JSON response from Gemini."""
    import json, re
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(cleaned[start:end])
    except Exception:
        pass
    return {}


def _wrap_fields(raw: dict, source: str = "web_search") -> dict:
    """
    Take a flat dict of {field_name: "value string"} from Gemini
    and wrap each value in the standard field structure.
    Empty/null values become _empty_field().
    """
    wrapped = {}
    for key, val in raw.items():
        if val and isinstance(val, str) and val.strip():
            confidence = "high" if len(val) > 80 else "medium"
            wrapped[key] = _field(val.strip(), source, confidence)
        else:
            wrapped[key] = _empty_field()
    return wrapped


async def build_intelligence_seed(
    company_name: str,
    website_url: str = None,
    existing_profile: dict = None,
    existing_seed: dict = None,
) -> dict:
    """
    Agentic seed builder -- populates all 6 intelligence blocks for a supplier.

    Runs 3 parallel grounded searches:
    - Block A: Identity + Buyer Intelligence
    - Block B: Commercial Reality + Winning Conditions
    - Block C: Signal Recognition

    SSI Context fields are marked jason_only -- only Jason can fill these.

    Returns a complete intelligence_seed dict ready for Firestore storage.
    """
    import asyncio
    from datetime import datetime, timezone

    seed = _build_empty_seed()
    profile = existing_profile or {}
    prior_seed = existing_seed or {}

    # Build context from existing data to avoid re-inventing what we know
    site_hint = f"Website: {website_url}" if website_url else ""
    prior_hint = ""
    if prior_seed.get("product_plain"):
        prior_hint = f"Known: {prior_seed['product_plain']}"

    profile_context = ""
    for key in ["product_catalogue", "company_overview", "technical_datasheets", "certifications"]:
        val = profile.get(key)
        if val:
            profile_context += f"\n- {key}: {str(val)[:300]}"

    # -- PROMPT A: Identity + Buyer Intelligence --
    prompt_a = f"""
You are STRATALYST building a commercial intelligence seed for a supplier.
COMPANY: {company_name}
{site_hint}
{prior_hint}
EXISTING PROFILE EXTRACTS:{profile_context or " None yet."}

Search the web thoroughly. Visit their website. Find technical documents, case studies, brochures,
LinkedIn company page, industry directories, and any published certification lists.

Extract and return ONLY this JSON -- no other text:
{{
  "product_plain": "What does this company literally sell? 1-2 plain sentences, no marketing.",
  "not_this": "What could someone confuse this product with? Name the most likely misclassification and rule it out explicitly.",
  "problem_solved": "What operational or business problem does the buyer have before finding this product?",
  "key_specs": "The 2-4 technical or commercial specifications that matter most in a sales conversation. Be specific -- temperatures, ratings, sizes, capacities, materials.",
  "certifications": "List all quality, safety, or industry certifications found. Include standard numbers if available.",
  "buyer_type": "Who are the actual buyers? Job titles and company types.",
  "decision_maker": "Who typically has purchasing authority? Job title(s).",
  "influencer": "Who specifies or recommends this product internally? Engineers, consultants, safety managers?",
  "use_case": "What do buyers do with this product? One literal sentence.",
  "procurement_path": "How does a typical purchase happen? Tender, direct order, framework agreement, distributor?"
}}

Rules:
- Specific facts only -- no vague marketing language
- If you cannot find a field with confidence, return an empty string ""
- Never invent or hallucinate. Accuracy over completeness.
- Return only the JSON object.
"""

    # -- PROMPT B: Commercial Reality + Winning Conditions --
    prompt_b = f"""
You are STRATALYST building a commercial intelligence seed for a supplier.
COMPANY: {company_name}
{site_hint}
{prior_hint}

Search for commercial terms, competitor comparisons, case studies, distributor information,
and any published information about deal sizes, project scopes, or geographic reach.

Extract and return ONLY this JSON -- no other text:
{{
  "deal_size": "Rough order magnitude of a typical deal. e.g. EUR 5k-50k per project. Base on known project types, not guesses.",
  "relationship_model": "One-off purchase, recurring/repeat, project-based, retainer, or framework contract?",
  "sales_cycle": "Typical time from first contact to signed order. Estimate based on product complexity.",
  "geography": "Where does this supplier sell and service? List countries or regions. Include hard constraints if known.",
  "minimum_threshold": "Any minimum order quantity, project size, or scope that would disqualify a prospect?",
  "we_win_when": "Under what specific conditions does this supplier win against alternatives? What situations favour them?",
  "we_lose_when": "When do competitors win? What situations disfavour this supplier?",
  "differentiator": "The single most important thing this supplier does better than alternatives.",
  "common_objections": "What objections or concerns typically come up from buyers? List 2-3.",
  "proof_points": "Reference case types that demonstrate credibility. Describe by type/industry, not client names."
}}

Rules:
- Specific facts from real sources only
- Empty string "" if not found with confidence
- Never invent or hallucinate
- Return only the JSON object.
"""

    # -- PROMPT C: Signal Recognition --
    prompt_c = f"""
You are STRATALYST identifying buying signal patterns for a supplier.
COMPANY: {company_name}
{site_hint}
{prior_hint}

Research the market context: what drives demand for this supplier's products?
Look at industry publications, regulatory bodies, tender databases, trade associations,
and news sources relevant to this product category.

Extract and return ONLY this JSON -- no other text:
{{
  "trigger_events": "What events in a prospect's world create demand? e.g. new plant construction, fire damage, regulatory audit, leadership change in procurement, sustainability mandate. List 3-5 specific triggers.",
  "tender_keywords": "Specific search terms to find relevant tenders or procurement notices. List 5-8 keywords.",
  "capex_indicators": "What capital investment announcements signal a relevant project? e.g. new facility, equipment upgrade, expansion.",
  "regulatory_drivers": "Any regulations, standards, or compliance deadlines that force procurement of this product type? Include regulation names/numbers if known.",
  "seasonal_patterns": "Any timing patterns in when orders typically happen? Budget cycles, project seasons, maintenance windows?"
}}

Rules:
- Industry-specific and factual
- Empty string "" if not found
- Return only the JSON object.
"""

    # Run all 3 in parallel
    results = await asyncio.gather(
        generate_with_grounding(prompt_a),
        generate_with_grounding(prompt_b),
        generate_with_grounding(prompt_c),
        return_exceptions=True,
    )

    raw_a = _parse_block_response(results[0]) if not isinstance(results[0], Exception) else {}
    raw_b = _parse_block_response(results[1]) if not isinstance(results[1], Exception) else {}
    raw_c = _parse_block_response(results[2]) if not isinstance(results[2], Exception) else {}

    # -- Assemble identity block --
    for key in ["product_plain", "not_this", "problem_solved", "key_specs", "certifications"]:
        val = raw_a.get(key, "")
        if val:
            seed["identity"][key] = _field(val, "web_search", "high" if len(val) > 60 else "medium")

    # -- Assemble buyer_intelligence block --
    for key in ["buyer_type", "decision_maker", "influencer", "use_case", "procurement_path"]:
        val = raw_a.get(key, "")
        if val:
            seed["buyer_intelligence"][key] = _field(val, "web_search", "high" if len(val) > 60 else "medium")

    # -- Assemble commercial_reality block --
    for key in ["deal_size", "relationship_model", "sales_cycle", "geography", "minimum_threshold"]:
        val = raw_b.get(key, "")
        if val:
            seed["commercial_reality"][key] = _field(val, "web_search", "medium")

    # -- Assemble winning_conditions block --
    for key in ["we_win_when", "we_lose_when", "differentiator", "common_objections", "proof_points"]:
        val = raw_b.get(key, "")
        if val:
            seed["winning_conditions"][key] = _field(val, "web_search", "medium")

    # -- Assemble signal_recognition block --
    for key in ["trigger_events", "tender_keywords", "capex_indicators", "regulatory_drivers", "seasonal_patterns"]:
        val = raw_c.get(key, "")
        if val:
            seed["signal_recognition"][key] = _field(val, "web_search", "medium")

    # -- Carry forward existing manual_seed values as jason_verified --
    if prior_seed.get("product_plain"):
        seed["identity"]["product_plain"] = _field(prior_seed["product_plain"], "jason_manual", "high", jason_only=False)
        seed["identity"]["product_plain"]["jason_verified"] = True
    if prior_seed.get("buyer_type"):
        seed["buyer_intelligence"]["buyer_type"] = _field(prior_seed["buyer_type"], "jason_manual", "high")
        seed["buyer_intelligence"]["buyer_type"]["jason_verified"] = True
    if prior_seed.get("use_case"):
        seed["buyer_intelligence"]["use_case"] = _field(prior_seed["use_case"], "jason_manual", "high")
        seed["buyer_intelligence"]["use_case"]["jason_verified"] = True
    if prior_seed.get("not_this"):
        seed["identity"]["not_this"] = _field(prior_seed["not_this"], "jason_manual", "high")
        seed["identity"]["not_this"]["jason_verified"] = True

    # -- Calculate completeness --
    all_fields = []
    for block_key in ["identity", "buyer_intelligence", "commercial_reality", "winning_conditions", "signal_recognition"]:
        for field in seed[block_key].values():
            all_fields.append(1 if field.get("value") else 0)
    completeness = int(sum(all_fields) / len(all_fields) * 100) if all_fields else 0

    from datetime import datetime, timezone
    seed["_meta"]["last_built"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    seed["_meta"]["completeness_pct"] = completeness

    return seed


async def propose_seed_from_profile(
    company_name: str,
    profile: dict,
    website_url: str = None,
) -> dict:
    """
    After a deep scan, propose a draft Manual Seed from the enriched profile.
    Returns {product_plain, buyer_type, use_case, not_this} -- all plain English.
    Jason confirms, edits, or rejects in the KB Agent Definition panel.
    """
    profile_summary = _summarise_profile(profile)

    prompt = f"""
You have just crawled the website and enriched the Knowledge Base for the company:
**{company_name}**
{"Website: " + website_url if website_url else ""}

ENRICHED PROFILE SUMMARY:
{profile_summary}

Your task: propose a Manual Seed -- a short, plain-English anchor that prevents AI
from misidentifying what this company sells. This will be reviewed and confirmed by
the operator before use.

RULES:
- product_plain: What does this company literally sell? One or two sentences. No marketing language.
  Describe the physical product or service in the plainest possible terms.
- buyer_type: Who are the actual buyers? Job titles or company types.
- use_case: What do buyers use it for? One sentence, literal.
- not_this: What could someone mistake this for? Name the most likely misclassification
  and explicitly rule it out. This field is critical.

Return JSON only:
{{
  "product_plain": "...",
  "buyer_type": "...",
  "use_case": "...",
  "not_this": "..."
}}
"""
    from services.gemini import generate
    import json, re
    response = await generate(prompt, temperature=0.2)
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        result = json.loads(cleaned)
        return {
            "product_plain": str(result.get("product_plain", "")),
            "buyer_type": str(result.get("buyer_type", "")),
            "use_case": str(result.get("use_case", "")),
            "not_this": str(result.get("not_this", "")),
        }
    except Exception:
        return {}
