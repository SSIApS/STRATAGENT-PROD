"""
STRATAGENT — Output Agent
Generates graduated documents using Gemini.
All outputs must meet the standard the operator would sign without editing.
"""
import json
import re
from datetime import date
from services.gemini import generate

TODAY = date.today().strftime('%d %B %Y')

_NO_FOOTER_RULE = (
    "IMPORTANT: Do NOT include any signature block, footer, or divider (---) in your JSON output. "
    "The document builder adds the SSI footer separately. "
    "Sign emails as: 'Jason L. Smith | Strategic Sales International ApS' — no contact details after the name."
)


def _parse_json(response: str) -> dict:
    """
    Robustly extract a JSON object from a Gemini response.
    Handles: markdown fences, trailing text after closing brace, whitespace.
    Falls back to empty dict rather than returning raw text.
    """
    cleaned = re.sub(r'```(?:json)?\s*', '', response).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError:
            pass
    return {}


async def generate_convergence_proposal(profile: dict, kb: dict) -> dict:
    """
    PATH A — CONVERGENCE PROPOSAL
    Full technical proposal for Convergence Index 90-100.
    """
    prompt = f"""
You are STRATAGENT generating a CONVERGENCE PROPOSAL — a full technical proposal
matched to a specific confirmed need. This must be at the standard the operator
would sign without editing.

TODAY'S DATE: {TODAY}

SUPPLIER KNOWLEDGE BASE:
Company: {kb.get('company_name')}
Products: {kb.get('profile', {}).get('product_catalogue')}
Technical differentiators: {kb.get('profile', {}).get('technical_differentiators')}
Certifications: {kb.get('profile', {}).get('certifications')}
Case studies: {kb.get('profile', {}).get('case_studies')}
Competitive positioning: {kb.get('profile', {}).get('competitive_positioning')}

PROSPECT RELATIONSHIP PROFILE:
Company: {profile.get('company_overview')}
Operational context: {profile.get('operational_context')}
Decision maker: {profile.get('decision_maker')}
Buying trigger: {profile.get('buying_trigger')}
Active projects: {profile.get('active_projects')}

Generate three documents:

1. OUTREACH EMAIL
   - Reference the specific project or situation by name
   - Peer-to-peer tone. Demonstrates we understand their world. Under 200 words.
   - Address the decision maker by first name if known
   - Sign off as: "Best regards,\\nJason L. Smith | Strategic Sales International ApS"
   - Do NOT add any contact details or dividers after the sign-off

2. TECHNICAL PROPOSAL
   - Full proposal matched to their specific need, built from supplier's actual capabilities
   - Use markdown headings (##, ###) and bullet points (* item) for structure
   - Use today's date: {TODAY}
   - Reference the supplier by name (not "we" or "our company") — this is written by Jason on behalf of the supplier

3. ENGAGEMENT BRIEF
   - Pre-completed RFQ framework based on project intelligence
   - Specific to their application and known projects
   - Use markdown structure (###, **Label:**) for clarity

{_NO_FOOTER_RULE}

Return as JSON:
{{
  "email": "full email text",
  "proposal": "full proposal text",
  "engagement_brief": "full RFQ framework text"
}}
"""
    response = await generate(prompt, temperature=0.4)
    result = _parse_json(response)
    if not result.get("email"):
        result["email"] = response
    return result


async def generate_mutual_value_brief(profile: dict, kb: dict) -> dict:
    """
    PATH B — MUTUAL VALUE BRIEF
    Value proposition + insight email for Convergence Index 75-89.
    """
    prompt = f"""
You are STRATAGENT generating a MUTUAL VALUE BRIEF — for a prospect where genuine
alignment exists but a specific project hasn't been confirmed yet.

TODAY'S DATE: {TODAY}

SUPPLIER:
Company: {kb.get('company_name')}
Products: {kb.get('profile', {}).get('product_catalogue')}
Differentiators: {kb.get('profile', {}).get('technical_differentiators')}
Case studies: {kb.get('profile', {}).get('case_studies')}

PROSPECT:
Company: {profile.get('company_overview')}
Operational context: {profile.get('operational_context')}
Buying trigger: {profile.get('buying_trigger')}
Decision maker: {profile.get('decision_maker')}

Generate three documents:

1. FIRST SIGNAL EMAIL
   - Peer-to-peer. One sharp observation about their world.
   - One sentence on what the supplier offers. One low-friction question. Under 150 words.
   - Address the decision maker by first name if known
   - Sign off as: "Best regards,\\nJason L. Smith | Strategic Sales International ApS"
   - Do NOT add any contact details or dividers after the sign-off

2. MUTUAL VALUE BRIEF
   - Value proposition built around their known situation
   - Demonstrates genuine understanding. Professional standard.
   - Use markdown headings (##, ###) and bullet points (* item) for structure
   - Use today's date: {TODAY}

3. QUALIFYING QUESTIONS
   - 5 questions to uncover the specific need in a first call
   - Questions that reveal where Path A (full proposal) is justified

{_NO_FOOTER_RULE}

Return as JSON:
{{
  "email": "full email text",
  "brief": "full value brief text",
  "qualifying_questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}}
"""
    response = await generate(prompt, temperature=0.4)
    result = _parse_json(response)
    if not result.get("email"):
        result["email"] = response
    return result


async def generate_first_signal(profile: dict, kb: dict) -> dict:
    """
    PATH C — FIRST SIGNAL
    Insight email only for Convergence Index 60-74.
    Under 150 words. Always.
    """
    prompt = f"""
You are STRATAGENT generating a FIRST SIGNAL — an insight email that opens a door
without walking through it. This is for a prospect where alignment is possible
but not yet confirmed.

SUPPLIER: {kb.get('company_name')}
Products: {kb.get('profile', {}).get('product_catalogue')}

PROSPECT:
{profile.get('company_overview')}
Context: {profile.get('operational_context')}
Trigger: {profile.get('buying_trigger', 'Not identified')}
Decision maker: {profile.get('decision_maker', {}).get('name', 'Unknown')}

Write ONE email:
- One sharp, specific observation about the prospect's world (not generic)
- One sentence on what the supplier offers — specific, not promotional
- One low-friction question that invites a conversation
- Under 150 words total
- Peer-to-peer tone — not a sales pitch
- No buzzwords, no superlatives, no "I hope this finds you well"
- Address the decision maker by first name if known
- Sign off as: "Best regards,\\nJason L. Smith | Strategic Sales International ApS"
- Do NOT add any contact details or dividers after the sign-off

{_NO_FOOTER_RULE}

Return as JSON:
{{
  "email": "full email text",
  "word_count": 0
}}
"""
    response = await generate(prompt, temperature=0.5)
    result = _parse_json(response)
    if not result.get("email"):
        result["email"] = response
    result["word_count"] = len(result.get("email", "").split())
    return result
