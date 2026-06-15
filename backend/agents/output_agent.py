"""
STRATAGENT -- Output Agent
Generates graduated documents using Gemini.
Uses section markers instead of JSON to avoid parse failures on large responses.
"""
import logging
import re
from datetime import date
from services.gemini import generate

logger = logging.getLogger(__name__)

TODAY = date.today().strftime('%d %B %Y')

_NO_FOOTER_RULE = (
    "CRITICAL: Do NOT include any SSI footer, contact block, or divider (---) in your output. "
    "The document builder adds the footer. End each section at the last word of real content."
)

_EMAIL_RULES = """
EMAIL -- ABSOLUTE RULES (violation = failure):

OPENER: The VERY FIRST WORD of the email must be the decision maker's first name followed by a comma.
  CORRECT: "Andreas,"
  WRONG: "Dear Andreas," / "Hi Andreas," / "Hello Andreas," / any greeting word before the name.
  If you write "Dear" anywhere in this email, you have failed.

LINE 1 (after the name): One sentence naming something SPECIFIC from the intelligence -- a real project name, facility, deadline, or regulatory requirement. Must be verifiable. Generic = rejected.
LINE 2: One sentence about what the supplier does, tied to their specific operational need.
LINE 3: One direct question -- reference a specific deadline, project, or decision.

SIGN-OFF: End with exactly:
  Best regards,
  Jason L. Smith | Strategic Sales International ApS

DO NOT add any contact details, footer, phone number, email address, CVR number, or STRATAGENT tagline after the sign-off. The sign-off ends at "ApS" and nothing follows.
DO NOT use placeholder text like [Your Name], [Name], [Your Company], or similar.

WORD COUNT: Under 100 words total. Count them. Cut ruthlessly if over.
BANNED PHRASES: "I'm writing to", "I've been following", "I believe there's", "impressive", "truly", "significant", "seamless", "comprehensive", "committed to", "I'd be happy", "looking forward", "strong alignment", "valuable partner", "don't hesitate".
"""


def _seed_block(kb: dict) -> str:
    """
    Renders the supplier's Manual Seed (Agent Definition) as a GROUND TRUTH block.
    The seed is Jason's plain-words description of what the product actually IS --
    it must override any conflicting text in product_catalogue / technical_differentiators,
    which can be stale, AI-guessed, or contaminated by a same-named real-world company
    (e.g. a coffee-filter-bag supplier whose enrichment pulled in a water-filtration
    company's site content because they happen to share a name).
    """
    seed = kb.get('manual_seed') or {}
    if not isinstance(seed, dict) or not seed:
        return ''
    plain = seed.get('product_plain', '')
    buyer = seed.get('buyer_type', '')
    use = seed.get('use_case', '')
    not_this = seed.get('not_this', '')
    if not plain and not not_this:
        return ''
    return (
        "GROUND TRUTH -- WHAT THIS SUPPLIER ACTUALLY SELLS (overrides Products/Differentiators below "
        "if they conflict; the catalogue text can be stale or pulled from an unrelated company with "
        "a similar name):\n"
        f"  What it is: {plain}\n"
        f"  Who buys it: {buyer}\n"
        f"  How it's used: {use}\n"
        f"  HARD EXCLUSIONS -- never write about these, even if mentioned elsewhere: {not_this}\n"
    )


def _parse_sections(response: str) -> dict:
    """
    Extract named sections from a response using ===SECTION=== markers.
    Robust to any content format, length, or special characters.
    """
    result = {}
    markers = {
        'email':            ('===EMAIL===',       '===END_EMAIL==='),
        'proposal':         ('===PROPOSAL===',    '===END_PROPOSAL==='),
        'engagement_brief': ('===ENGAGEMENT===',  '===END_ENGAGEMENT==='),
        'brief':            ('===BRIEF===',       '===END_BRIEF==='),
    }
    for key, (start_tag, end_tag) in markers.items():
        s = response.find(start_tag)
        e = response.find(end_tag)
        if s != -1 and e != -1 and e > s:
            result[key] = response[s + len(start_tag):e].strip()

    # Qualifying questions: numbered list after ===QUESTIONS===
    qs = response.find('===QUESTIONS===')
    qe = response.find('===END_QUESTIONS===')
    if qs != -1 and qe != -1:
        block = response[qs + len('===QUESTIONS==='):qe].strip()
        questions = []
        for line in block.splitlines():
            line = line.strip()
            # Strip leading number/dot/dash
            line = re.sub(r'^[\d]+[\.\)]\s*', '', line).strip()
            line = re.sub(r'^[-*]\s*', '', line).strip()
            if line:
                questions.append(line)
        result['qualifying_questions'] = questions

    return result


async def generate_convergence_proposal(profile: dict, kb: dict) -> dict:
    """PATH A -- CONVERGENCE PROPOSAL (SD 90-100)"""

    dm = profile.get('decision_maker', {})
    first_name = ''
    if isinstance(dm, dict):
        full = dm.get('name', '') or ''
        first_name = full.split()[0] if full else ''
    elif isinstance(dm, str):
        first_name = dm.split()[0] if dm else ''

    signals = profile.get('buying_signals', [])
    signal_summary = '\n'.join(
        f"  - [{s.get('type','')} / {s.get('strength','')}] {s.get('signal','')} -- {s.get('timing','')}"
        for s in signals[:5]
    ) or '  - No confirmed signals -- approach based on project/operational intelligence'

    proposal_structure = f"""## {kb.get('company_name')} Proposal for [Prospect Name]: [one-line value headline]

**Prepared for:** [Decision maker name, title, company]
**Prepared by:** Strategic Sales International ApS, on behalf of {kb.get('company_name')}
**Date:** {TODAY}
**Singularity Density:** 90/100

### Why Now
[4-5 bullet points -- the specific intelligence that triggered this proposal.
Reference the actual signals, commissioning dates, regulatory requirements.
This section proves the homework was done. Be factual and specific.]

### 1. Understanding [Prospect]'s Situation
[Operational context -- specific, references real projects]

### 2. Proposed Solution
[Supplier's integrated offering matched to the specific need]

#### 2.1. [Product category 1]
[Detail with specs and materials]

#### 2.2. [Product category 2]
[Detail]

### 3. Technical Differentiators
[3-4 specific differentiators relevant to this prospect's environment]

### 4. Certifications
[Only certifications that apply to this prospect's environment]

### 5. Next Steps
[Specific -- reference a commissioning deadline or meeting window]"""

    prompt = f"""You are STRATAGENT generating a CONVERGENCE PROPOSAL (SD 90/100).
Every document must be sign-ready without editing.

TODAY: {TODAY}
FIRST NAME: "{first_name}"

SUPPLIER: {kb.get('company_name')}
{_seed_block(kb)}
Products: {kb.get('profile', {}).get('product_catalogue', '')}
Differentiators: {kb.get('profile', {}).get('technical_differentiators', '')}
Certifications: {kb.get('profile', {}).get('certifications', '')}
Case studies: {kb.get('profile', {}).get('case_studies', '')}

PROSPECT: {profile.get('company_overview', '')}
Operational context: {profile.get('operational_context', '')}
Decision maker: {profile.get('decision_maker', '')}
Buying trigger: {profile.get('buying_trigger', '')}
Active projects: {profile.get('active_projects', '')}
Approach window: {profile.get('approach_window', '')}

BUYING SIGNALS (drove SD to 90):
{signal_summary}

=======================
SECTION 1 -- EMAIL RULES
=======================
{_EMAIL_RULES}

=========================================
SECTION 2 -- TECHNICAL PROPOSAL STRUCTURE
Use markdown headings (##, ###, ####) and bullet points (* item).
=========================================
{proposal_structure}

=========================================
SECTION 3 -- ENGAGEMENT BRIEF / RFQ FRAMEWORK
Use markdown (##, ###, **Label:**).
Reference the actual projects, environments, and requirements from the intelligence above.
Use {TODAY} as the date. Leave placeholders only where the prospect must supply data (e.g. quantities).
=========================================

{_NO_FOOTER_RULE}

===================================================================
OUTPUT INSTRUCTIONS -- READ CAREFULLY:
Your ENTIRE response must consist of the three sections below, wrapped in
these EXACT marker strings. Write NOTHING before ===EMAIL=== and NOTHING
after ===END_ENGAGEMENT===. Do not add commentary, preamble, or sign-offs
outside the markers.
===================================================================

===EMAIL===
[Write the outreach email here, following SECTION 1 EMAIL RULES above]
===END_EMAIL===

===PROPOSAL===
[Write the full technical proposal here, following SECTION 2 STRUCTURE above]
===END_PROPOSAL===

===ENGAGEMENT===
[Write the RFQ framework here, following SECTION 3 ENGAGEMENT BRIEF instructions above]
===END_ENGAGEMENT===
"""

    response = await generate(prompt, temperature=0.35)
    result = _parse_sections(response)

    if not result.get('email'):
        # Parsing failed -- log raw response so we can diagnose
        logger.error(
            "CONVERGENCE PROPOSAL: _parse_sections failed to extract email.\n"
            "Raw response (first 1000 chars):\n%s",
            response[:1000]
        )
        result['email'] = (
            "[Generation failed -- check backend logs]\n\n"
            f"Raw response:\n{response[:500]}"
        )

    return result


async def generate_mutual_value_brief(profile: dict, kb: dict) -> dict:
    """PATH B -- MUTUAL VALUE BRIEF (SD 75-89)"""

    dm = profile.get('decision_maker', {})
    first_name = ''
    if isinstance(dm, dict):
        full = dm.get('name', '') or ''
        first_name = full.split()[0] if full else ''

    brief_structure = f"""## Value Brief: {kb.get('company_name')} for [Prospect Name]
**Date:** {TODAY} | **Prepared by:** Strategic Sales International ApS

### The Situation
[2-3 sentences: what we know about their context and why this supplier is relevant]

### What {kb.get('company_name')} Offers
[3-4 specific capabilities matched to their situation -- with real product names and specs]

### The Fit
[Why this is a strong match -- specific, not generic]"""

    prompt = f"""You are STRATAGENT generating a MUTUAL VALUE BRIEF (SD 75-89).
Every document must be sign-ready without editing.

TODAY: {TODAY}
FIRST NAME: "{first_name}"

SUPPLIER: {kb.get('company_name')}
{_seed_block(kb)}
Products: {kb.get('profile', {}).get('product_catalogue', '')}
Differentiators: {kb.get('profile', {}).get('technical_differentiators', '')}
Case studies: {kb.get('profile', {}).get('case_studies', '')}

PROSPECT: {profile.get('company_overview', '')}
Operational context: {profile.get('operational_context', '')}
Buying trigger: {profile.get('buying_trigger', '')}
Decision maker: {profile.get('decision_maker', '')}

SECTION 1 -- EMAIL RULES
{_EMAIL_RULES}

SECTION 2 -- VALUE BRIEF STRUCTURE
Use markdown headings and bullet points.
{brief_structure}

SECTION 3 -- QUALIFYING QUESTIONS
Write 5 qualifying questions for the first discovery call.
Number each question on its own line.
Each must be specific to what we know about this prospect.

{_NO_FOOTER_RULE}

OUTPUT INSTRUCTIONS -- READ CAREFULLY:
Your ENTIRE response must consist of the three sections below, wrapped in
these EXACT marker strings. Write NOTHING before ===EMAIL=== and NOTHING
after ===END_QUESTIONS===. Do not add commentary, preamble, or sign-offs
outside the markers.

===EMAIL===
[Write the outreach email here, following SECTION 1 EMAIL RULES above]
===END_EMAIL===

===BRIEF===
[Write the value brief here, following SECTION 2 STRUCTURE above]
===END_BRIEF===

===QUESTIONS===
[Write 5 numbered qualifying questions here, following SECTION 3 instructions above]
===END_QUESTIONS===
"""

    response = await generate(prompt, temperature=0.4)
    result = _parse_sections(response)

    if not result.get('email'):
        import logging as _logging
        _logging.getLogger(__name__).error(
            "MUTUAL VALUE BRIEF: _parse_sections failed to extract email.\n"
            "Raw response (first 1000 chars):\n%s",
            response[:1000]
        )
        result['email'] = f"[Generation failed]\n\n{response[:300]}"

    return result


async def generate_first_signal(profile: dict, kb: dict) -> dict:
    """PATH C -- FIRST SIGNAL (SD 60-74). One email only."""

    dm = profile.get('decision_maker', {})
    first_name = ''
    if isinstance(dm, dict):
        full = dm.get('name', '') or ''
        first_name = full.split()[0] if full else ''

    prompt = f"""You are STRATAGENT generating a FIRST SIGNAL email (SD 60-74).
One email. Under 100 words. Sign-ready.

TODAY: {TODAY}
FIRST NAME: "{first_name}"

SUPPLIER: {kb.get('company_name')}
{_seed_block(kb)}
Products: {kb.get('profile', {}).get('product_catalogue', '')}

PROSPECT: {profile.get('company_overview', '')}
Context: {profile.get('operational_context', '')}
Trigger: {profile.get('buying_trigger', 'Not identified')}

EMAIL RULES
{_EMAIL_RULES}

{_NO_FOOTER_RULE}

OUTPUT INSTRUCTIONS: Your ENTIRE response must be the email wrapped in
these EXACT markers. Write NOTHING before ===EMAIL=== and NOTHING after
===END_EMAIL===.

===EMAIL===
[Write the outreach email here, following the EMAIL RULES above]
===END_EMAIL===
"""

    response = await generate(prompt, temperature=0.45)
    result = _parse_sections(response)

    if not result.get('email'):
        import logging as _logging
        _logging.getLogger(__name__).error(
            "FIRST SIGNAL: _parse_sections failed to extract email.\n"
            "Raw response (first 1000 chars):\n%s",
            response[:1000]
        )
        result['email'] = f"[Generation failed]\n\n{response[:300]}"

    result['word_count'] = len(result.get('email', '').split())
    return result
