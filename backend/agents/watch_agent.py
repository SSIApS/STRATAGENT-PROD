"""
STRATAGENT — Watch Agent
Scans Monitored Positions for trigger events using Gemini grounding.
This is the agentic core of Active Watch.
"""
import json
import re
import time
from services.gemini import generate_with_grounding


async def scan_for_triggers(positions: list, kb: dict) -> list:
    """
    Scan a list of Monitored Positions for trigger events.
    Returns list of positions that should be surfaced.
    """
    surfaced = []

    for position in positions:
        trigger = position.get("trigger", {})
        trigger_type = trigger.get("type")

        if trigger_type == "time":
            days = trigger.get("days", 14)
            parked_at = position.get("parked_at", 0)
            if time.time() - parked_at > days * 86400:
                surfaced.append({
                    "position_id": position["id"],
                    "company_name": position["company_name"],
                    "reason": f"Time trigger: {days} days have passed",
                })

        elif trigger_type == "event":
            # Use Gemini grounding to check for trigger events
            found = await _check_event_trigger(position, kb)
            if found:
                surfaced.append({
                    "position_id": position["id"],
                    "company_name": position["company_name"],
                    "reason": found,
                })

        # "document" and "threshold" triggers are handled by KB upload
        # (see knowledge_base.py _check_monitored_positions)

    return surfaced


async def _check_event_trigger(position: dict, kb: dict) -> str | None:
    """
    Use Gemini grounding to check if an event trigger has fired.
    Returns description of the event if found, None otherwise.
    """
    company = position["company_name"]
    trigger_value = position.get("trigger", {}).get("value", "")
    supplier_product = kb.get("profile", {}).get("product_catalogue", "")

    prompt = f"""
Search for recent news about {company} that would create a buying opportunity
for a supplier of: {supplier_product}

Specifically look for:
- Tender announcements or RFQ publications
- Capex announcements or expansion plans
- Regulatory compliance deadlines
- New facility construction or upgrades
- Operational incidents requiring equipment replacement
{f'- Also watch for: {trigger_value}' if trigger_value else ''}

Search the web for news from the last 30 days.

If you find a relevant trigger event, describe it concisely in one sentence.
If you find nothing relevant, respond with exactly: NO_TRIGGER

Response (one sentence or NO_TRIGGER):
"""
    response = await generate_with_grounding(prompt)
    response = response.strip()

    if response == "NO_TRIGGER" or not response:
        return None
    return response
