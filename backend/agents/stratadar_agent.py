"""
STRATAGENT -- STRATADAR Agent
Cross-KB Active Watch monitor. Scans all Monitored Positions across all suppliers
and surfaces triggers with priority scoring.
"""
import time
from agents.watch_agent import scan_for_triggers
from services import firestore as db


PRIORITY_RULES = {
    "surfaced": 100,   # Already fired -- show first
    "time_due": 80,    # Time trigger overdue
    "event": 60,       # Event trigger (needs Gemini scan)
    "threshold": 40,   # Waiting for CI threshold
    "document": 30,    # Waiting for document
    "time_pending": 20, # Time trigger not yet due
}


def score_position(position: dict) -> dict:
    """Add priority score and urgency label to a position."""
    status = position.get("status", "watching")
    trigger = position.get("trigger", {})
    trigger_type = trigger.get("type", "")
    parked_at = position.get("parked_at", 0)
    age_days = (time.time() - parked_at) / 86400

    if status == "surfaced":
        priority = PRIORITY_RULES["surfaced"]
        urgency = "ACTION REQUIRED"
        urgency_colour = "#22c55e"
    elif trigger_type == "time":
        days_limit = trigger.get("days", 14)
        if age_days >= days_limit:
            priority = PRIORITY_RULES["time_due"]
            urgency = "TIME DUE"
            urgency_colour = "#f59e0b"
        else:
            remaining = max(0, days_limit - age_days)
            priority = PRIORITY_RULES["time_pending"] + (1 / max(remaining, 0.1))
            urgency = f"{remaining:.0f}d REMAINING"
            urgency_colour = "#64748b"
    elif trigger_type == "event":
        priority = PRIORITY_RULES["event"]
        urgency = "AWAITING SIGNAL"
        urgency_colour = "#7c3aed"
    elif trigger_type == "threshold":
        priority = PRIORITY_RULES["threshold"]
        urgency = "CI THRESHOLD"
        urgency_colour = "#0ea5e9"
    else:
        priority = PRIORITY_RULES.get(trigger_type, 10)
        urgency = "WATCHING"
        urgency_colour = "#64748b"

    return {
        **position,
        "priority_score": priority,
        "urgency_label": urgency,
        "urgency_colour": urgency_colour,
        "age_days": round(age_days, 1),
    }


async def run_full_scan(positions: list) -> dict:
    """
    Scan all positions across all suppliers.
    Groups positions by supplier, fetches KBs, runs scan_for_triggers.
    Returns summary with newly surfaced positions.
    """
    # Group by supplier
    by_supplier: dict[str, list] = {}
    for p in positions:
        sid = p.get("supplier_id", "unknown")
        by_supplier.setdefault(sid, []).append(p)

    newly_surfaced = []
    errors = []

    for supplier_id, supplier_positions in by_supplier.items():
        # Only scan positions with event triggers (others are handled passively)
        event_positions = [p for p in supplier_positions if p.get("trigger", {}).get("type") == "event"]
        if not event_positions:
            continue

        try:
            kb = db.get_knowledge_base(supplier_id)
            if not kb:
                continue
            surfaced = await scan_for_triggers(event_positions, kb)
            for s in surfaced:
                db.surface_monitored_position(s["position_id"], s["reason"])
                newly_surfaced.append(s)
        except Exception as e:
            errors.append({"supplier_id": supplier_id, "error": str(e)})

    return {
        "scanned": len(positions),
        "newly_surfaced": len(newly_surfaced),
        "surfaced_details": newly_surfaced,
        "suppliers_scanned": len(by_supplier),
        "errors": errors,
    }
