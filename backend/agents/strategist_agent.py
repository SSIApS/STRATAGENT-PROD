"""
STRATAGENT -- STRATEGIST Agent
Cross-pipeline AI advisor. Reads all modules and produces:
  1. Monday Brief -- who to call, what changed, pipeline health
  2. Top 3 Actions -- prioritised tasks for right now
"""
import json
import re
import time
from services.gemini import generate
from services import firestore as db


def _depth_label(depth: float) -> str:
    if depth >= 90: return "SINGULARITY READY"
    if depth >= 80: return "PROPOSAL READY"
    if depth >= 50: return "VALUE BRIEF READY"
    return "INTELLIGENCE GAP"


def _ci_label(ci: float) -> str:
    if ci >= 90: return "CONVERGENCE PROPOSAL"
    if ci >= 75: return "MUTUAL VALUE BRIEF"
    if ci >= 60: return "FIRST SIGNAL"
    return "PARK"


async def generate_brief(pipeline_data: dict) -> dict:
    """
    Generate the STRATEGIST Monday Brief from cross-module data.
    pipeline_data contains: kbs, profiles, watched_positions, outcomes
    """
    kbs = pipeline_data.get("kbs", [])
    profiles = pipeline_data.get("profiles", [])
    watched = pipeline_data.get("watched", [])
    outcomes = pipeline_data.get("outcomes", [])
    market_signals = pipeline_data.get("market_signals", [])

    # Build structured context
    kb_summary = []
    for kb in kbs:
        depth = kb.get("intelligence_depth", {}).get("total", 0)
        seed = kb.get("manual_seed", {})
        kb_summary.append({
            "name": kb.get("company_name"),
            "depth": round(depth, 1),
            "status": _depth_label(depth),
            "has_seed": bool(seed.get("product_plain")),
            "product": seed.get("product_plain", ""),
        })

    prospect_summary = []
    for p in profiles:
        ci = p.get("convergence_index", 0)
        signals = p.get("profile", {}).get("buying_signals", [])
        high_signals = [s for s in signals if s.get("strength") == "HIGH"]
        prospect_summary.append({
            "company": p.get("company_name"),
            "supplier": p.get("supplier_id"),
            "ci": ci,
            "ci_label": _ci_label(ci),
            "high_signals": len(high_signals),
            "approach_window": p.get("profile", {}).get("approach_window", ""),
            "updated_at": p.get("updated_at", 0),
        })

    # Sort prospects by CI descending
    prospect_summary.sort(key=lambda x: -x["ci"])

    # Watched positions due / surfaced
    surfaced = [w for w in watched if w.get("status") == "surfaced"]
    time_due = [
        w for w in watched
        if w.get("trigger", {}).get("type") == "time"
        and (time.time() - w.get("parked_at", 0)) > w.get("trigger", {}).get("days", 14) * 86400
        and w.get("status") == "watching"
    ]

    # Weak KBs (depth < 50, no seed)
    weak_kbs = [kb for kb in kb_summary if kb["depth"] < 50 or not kb["has_seed"]]

    # Pre-compute JSON strings -- avoids f-string double-brace set confusion
    surfaced_json = json.dumps(
        [{"company": w.get("company_name"), "reason": w.get("surfaced_reason", "")} for w in surfaced],
        indent=2
    )
    time_due_json = json.dumps(
        [{"company": w.get("company_name"), "trigger": w.get("trigger", {})} for w in time_due],
        indent=2
    )
    if market_signals:
        market_signals_json = json.dumps(
            [{"sector": s.get("sector_label"), "signal_type": s.get("signal_type"),
              "headline": s.get("headline"), "relevance_score": s.get("relevance_score"),
              "affected_suppliers": s.get("affected_suppliers", []),
              "action_owner": s.get("action_owner")} for s in market_signals[:8]],
            indent=2
        )
    else:
        market_signals_json = "No market signals available -- run STRATAGORA scan to populate."

    prompt = f"""
You are STRATEGIST, the AI advisor for a solopreneur B2B sales operation run by Jason Smith at Strategic Sales International ApS (SSI), Denmark.

CRITICAL RULES FOR THIS BRIEF:
- Use ONLY the company names and CI scores from the data provided below. DO NOT invent companies or scores.
- Every recommendation must name a specific company, cite its CI, and reference a real signal or KB gap.
- "Week headline" must be a single punchy sentence that names the single most important thing to do THIS week.
- top_calls must be prospects Jason can actually call THIS week - cite WHY NOW with a specific signal or trigger.
- top_3_actions must be concrete tasks (e.g. "Run STRATALYST deep scan on Becker Insulation to push depth from 58 to 70+") not generic advice.
- pipeline_score must reflect REALITY: if no prospects are above CI 75, score cannot exceed 60. If KBs are weak, penalise.
- If STRATAGORA market signals are present, the single most actionable one MUST appear in top_3_actions.
- If STRATAGORA is empty, Action 3 should be "Run STRATAGORA market scan to identify sector signals".

Analyze this cross-pipeline snapshot and produce a structured JSON brief.

## SUPPLIER KNOWLEDGE BASES
{json.dumps(kb_summary, indent=2)}

## ACTIVE PROSPECTS (by Convergence Index)
{json.dumps(prospect_summary[:15], indent=2)}

## ACTIVE WATCH -- SURFACED TRIGGERS
{surfaced_json}

## TIME-DUE WATCH POSITIONS
{time_due_json}

## WEAK KNOWLEDGE BASES (limit pipeline quality)
{json.dumps(weak_kbs, indent=2)}

## STRATAGORA MARKET INTELLIGENCE (last 30 days)
{market_signals_json}

Produce a JSON object with this exact structure:
{{
  "week_headline": "One punchy sentence summarising the pipeline state this week",
  "pipeline_score": <integer 0-100, overall pipeline health>,
  "pipeline_score_reasoning": "Why this score",
  "top_calls": [
    {{
      "company": "company name",
      "supplier": "supplier name",
      "ci": <number>,
      "why_now": "One sentence -- the specific reason to call this week",
      "opening_line": "Suggested conversation opener",
      "urgency": "HIGH|MEDIUM|LOW"
    }}
  ],
  "top_3_actions": [
    {{
      "priority": 1,
      "action": "Imperative verb + specific task",
      "why": "Why this is the highest leverage action right now",
      "module": "KB|FI|WATCH|OUTPUT|SCOUT|STRATALINK",
      "effort": "15min|30min|1hr|2hr+"
    }}
  ],
  "what_changed": [
    "One sentence per notable change or signal this week"
  ],
  "kb_health": {{
    "strongest": "supplier name with deepest KB",
    "weakest": "supplier name most limiting pipeline",
    "fix_first": "What to do first to improve KB quality"
  }},
  "watch_alerts": [
    "One sentence per surfaced or time-due position"
  ],
  "market_intelligence": {{
    "active_sectors": ["sector names with signals this week"],
    "top_market_signal": "The single most actionable market signal -- name sector, signal type, and what it means for the pipeline",
    "stratagora_recommendation": "What action should STRATASCOUT or STRATADAR take based on market signals? Or null if no signals."
  }}
}}

Rules:
- top_calls: rank the 3-5 best prospects to contact THIS WEEK (CI 60+, or time-due watches, or surfaced signals)
- top_3_actions: exactly 3 actions, ordered by leverage. Action 1 should have the highest ROI per minute.
- what_changed: list anything notable (surfaced signals, prospects hitting thresholds, KB gains)
- Be concrete -- name companies, cite CIs, reference signals. No generic advice.
- If no prospects have CI 60+, flag it and recommend STRATALYST runs or STRATASCOUT hunt.

Respond with only the JSON object.
"""

    response = await generate(prompt, temperature=0.2)

    # Parse JSON -- strip fencing Gemini may wrap around the output
    try:
        text = response.strip()
        # Strip opening fences (backtick, single-quote, double-quote variants)
        for fence in ["```json", "```", "'''json", "'''", '"""json', '"""']:
            if text.startswith(fence):
                text = text[len(fence):].lstrip()
                break
        # Strip closing fences
        for fence in ["```", "'''", '"""']:
            if text.rstrip().endswith(fence):
                text = text.rstrip()[:-3].rstrip()
                break
        # Extract first { to last } as safety net
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start >= 0 and end > start:
            text = text[start:end]
        print("STRATEGIST JSON length:", len(text), "| preview:", text[:80])
        return json.loads(text)
    except Exception as parse_err:
        print("STRATEGIST JSON parse FAILED:", parse_err)
        print("STRATEGIST raw response:", response[:400])
        return {
            "week_headline": "Brief generation failed -- check pipeline data",
            "pipeline_score": 0,
            "pipeline_score_reasoning": response[:500],
            "top_calls": [],
            "top_3_actions": [],
            "what_changed": [],
            "kb_health": {"strongest": "", "weakest": "", "fix_first": ""},
            "watch_alerts": [],
            "market_intelligence": {
                "active_sectors": [],
                "top_market_signal": None,
                "stratagora_recommendation": None,
            },
        }
