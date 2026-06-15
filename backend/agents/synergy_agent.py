"""
STRATAGENT -- STRATAMESH Synergy Agent
Cross-supplier opportunity flagging.

When a prospect is researched for Supplier A, STRATAMESH silently checks
every other SSI supplier's intelligence_seed to see if the same prospect
is also a candidate for them.

No new grounded searches are made -- this runs entirely on:
  - The prospect profile already returned by research_agent.py
  - The intelligence_seed (or manual_seed fallback) of each other supplier

Output is a short list of flags: supplier name, score, one sentence why.
The primary MVB is untouched -- these flags appear as additive context.
"""
import json
import re
from services.gemini import generate


def _nace_match_level(prospect_nace: str, target_nace_list: list) -> str:
    """Return EXACT, DIVISION, SECTION, or NONE based on NACE code overlap."""
    if not prospect_nace or not target_nace_list:
        return "UNKNOWN"
    p = prospect_nace.upper()
    p_div = p[:3] if len(p) >= 3 else p
    p_sec = p[:1]
    targets = [c.upper() for c in target_nace_list if c]
    if p in targets:
        return "EXACT"
    for t in targets:
        if t[:3] == p_div:
            return "DIVISION"
    for t in targets:
        if t[:1] == p_sec:
            return "SECTION"
    return "NONE"


def _seed_summary(kb: dict) -> str:
    """Build a compact supplier identity string for scoring."""
    iseed = kb.get("intelligence_seed") or {}
    seed = kb.get("manual_seed") or {}

    def sv(block: str, field: str) -> str:
        return (iseed.get(block, {}).get(field, {}) or {}).get("value", "") or ""

    product = sv("identity", "product_plain") or seed.get("product_plain", "")
    not_this = sv("identity", "not_this") or seed.get("not_this", "")
    buyer = sv("buyer_intelligence", "buyer_type") or seed.get("buyer_type", "")
    use_case = sv("buyer_intelligence", "use_case") or seed.get("use_case", "")
    triggers = sv("signal_recognition", "trigger_events")
    keywords = sv("signal_recognition", "tender_keywords")
    win_when = sv("winning_conditions", "we_win_when")
    targeting = (iseed.get("industry_targeting") or {})
    target_nace = targeting.get("target_nace") or []

    parts = []
    if product:
        parts.append(f"Sells: {product}")
    if not_this:
        parts.append(f"NOT: {not_this}")
    if buyer:
        parts.append(f"Buyer: {buyer}")
    if use_case:
        parts.append(f"Use case: {use_case}")
    if target_nace:
        parts.append(f"Target industries (NACE): {', '.join(target_nace)}")
    if triggers:
        parts.append(f"Trigger events: {triggers}")
    if keywords:
        parts.append(f"Tender keywords: {keywords}")
    if win_when:
        parts.append(f"Wins when: {win_when}")
    return "\n".join(parts) if parts else "No seed data available"


def _parse_json(response: str) -> list:
    try:
        cleaned = re.sub(r"```(?:json)?\n?", "", response).strip()
        result = json.loads(cleaned)
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "flags" in result:
            return result["flags"]
        return []
    except Exception:
        return []


async def cross_score_prospect(
    prospect_profile: dict,
    primary_supplier_id: str,
    all_kbs: list,
    min_score: int = 45,
) -> list:
    """
    Score a researched prospect against all suppliers OTHER than the primary.

    Args:
        prospect_profile: the full profile dict from research_agent.py
        primary_supplier_id: exclude this supplier (already has the full FI)
        all_kbs: list of KB dicts from db.list_knowledge_bases()
        min_score: only return matches at or above this threshold

    Returns:
        List of synergy flags, sorted by score descending:
        [
          {
            "supplier_id": "...",
            "supplier_name": "...",
            "score": 72,
            "rationale": "One sentence why this prospect fits.",
            "signal_hook": "The specific signal or context that triggers this.",
          },
          ...
        ]
    """
    # Filter out the primary supplier and any KBs with no seed data
    candidates = [
        kb for kb in all_kbs
        if kb.get("id") != primary_supplier_id
        and kb.get("company_name")
        and (kb.get("intelligence_seed") or kb.get("manual_seed"))
    ]
    if not candidates:
        return []

    # Build compact prospect summary from existing research (no new API calls)
    prospect_name = prospect_profile.get("company_name", "Unknown")
    overview = prospect_profile.get("company_overview", "")
    operational = prospect_profile.get("operational_context", "")
    active_projects = prospect_profile.get("active_projects", "")
    signals_raw = prospect_profile.get("buying_signals", [])
    signals_text = "; ".join(
        s.get("signal", "") for s in signals_raw if s.get("signal")
    ) if signals_raw else "None found"

    # Prospect industry code (if classified)
    prospect_nace = (prospect_profile.get("industry_classification") or {}).get("nace_code", "")
    prospect_nace_label = (prospect_profile.get("industry_classification") or {}).get("nace_label", "")

    # Build supplier summaries block
    supplier_blocks = []
    for kb in candidates:
        sid = kb.get("id", "")
        name = kb.get("company_name", sid)
        summary = _seed_summary(kb)
        # Industry match level -- gives Gemini a concrete structural signal
        target_nace = ((kb.get("intelligence_seed") or {}).get("industry_targeting") or {}).get("target_nace") or []
        match_level = _nace_match_level(prospect_nace, target_nace) if prospect_nace else "UNKNOWN"
        industry_line = f"Industry match vs prospect: {match_level}"
        if prospect_nace:
            industry_line += f" (prospect NACE {prospect_nace} -- {prospect_nace_label})"
        supplier_blocks.append(f"SUPPLIER_ID: {sid}\nNAME: {name}\n{industry_line}\n{summary}")

    suppliers_text = "\n\n---\n\n".join(supplier_blocks)

    prompt = f"""
You are STRATAMESH, the cross-supplier synergy engine for SSI (Strategic Sales International).

SSI represents multiple industrial suppliers. Your job: given a prospect that has already been
researched for one supplier, quickly score whether that same prospect is also a relevant target
for SSI's OTHER suppliers.

This is NOT a full research exercise. You are scoring fit based solely on what is already known
about the prospect and the supplier's seed data. No guessing, no padding.

PROSPECT: {prospect_name}
Overview: {overview}
Operational context: {operational}
Active projects / CAPEX: {active_projects or "Not identified"}
Buying signals found: {signals_text}

SSI SUPPLIERS TO SCORE (excluding the primary supplier already being briefed):
{suppliers_text}

For each supplier, score the prospect's alignment from 0-100:
- 80-100: Strong fit -- clear product-market match AND the prospect's context suggests active need
- 60-79: Good fit -- product-market match, possible need
- 45-59: Weak fit -- partial match, worth watching
- Below 45: No flag needed

Rules:
- Only include suppliers scoring 45+
- One sentence rationale maximum -- be specific, not generic
- signal_hook: the specific thing in the prospect's profile that creates the opening (a project, a signal, their buyer type, etc.)
- If nothing in the prospect profile creates a hook, score below 45 and exclude

Return a JSON array only:
[
  {{
    "supplier_id": "the supplier_id string",
    "supplier_name": "the supplier name",
    "score": 72,
    "rationale": "One specific sentence explaining the fit.",
    "signal_hook": "The specific context that creates the opening."
  }}
]

If no suppliers score 45+, return an empty array: []
Return only the JSON array, no other text.
"""
    try:
        response = await generate(prompt)
        flags = _parse_json(response)
    except Exception:
        return []

    # Filter, cap score range, sort
    clean_flags = []
    for f in flags:
        try:
            score = int(f.get("score", 0))
        except (ValueError, TypeError):
            score = 0
        if score >= min_score and f.get("supplier_id") and f.get("rationale"):
            clean_flags.append({
                "supplier_id": f["supplier_id"],
                "supplier_name": f.get("supplier_name", f["supplier_id"]),
                "score": score,
                "rationale": f.get("rationale", ""),
                "signal_hook": f.get("signal_hook", ""),
            })

    clean_flags.sort(key=lambda x: x["score"], reverse=True)
    return clean_flags
