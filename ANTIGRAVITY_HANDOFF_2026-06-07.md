# STRATAGENT — Antigravity Handoff (updated 2026-06-07)

## What STRATAGENT Is
Agentic B2B sales app for Jason Smith / Strategic Sales International ApS (SSI), Denmark.
Stack: React + Vite + TypeScript (localhost:5173) | FastAPI + Gemini 2.5 Flash + Firestore
Repo: https://github.com/SSIApS/STRATAGENT-PROD
Start: double-click START STRATAGENT.bat | Password: DEMO2026

## CRITICAL: Port Changed to 9000
Backend now runs on port 9000 (was 8080 -- something on the Windows machine intercepted 8080).
- uvicorn: `--host 127.0.0.1 --port 9000`
- frontend/src/services/api.ts: BASE_URL = `http://127.0.0.1:9000`
- frontend/vite.config.ts: proxy target = `http://127.0.0.1:9000`
- START STRATAGENT.bat: updated to port 9000
All working. Do not revert to 8080.

## CRITICAL: Auto-Reload Does Not Work
uvicorn --reload uses WatchFiles which monitors file mtime.
When files are written via the Linux CIFS mount (Claude's sandbox), mtime is NOT updated on Windows.
WatchFiles never detects changes. Stale code runs.
Rule: After ANY Claude edit session, always Ctrl+C and manually restart uvicorn.

## CRITICAL: ASCII-Only in Python Docstrings/Comments
Em dashes (--), curly arrows (->), subscripts etc. in Python docstrings/comments cause the
Windows Python tokenizer to fail when loading files via CIFS mount. Module import fails silently.
Use `--` and `->` in source files. Non-ASCII is only permitted in string literals that produce
formatted output (Word docs, Danish text in research prompts).
Run `python check_before_restart.py` before every restart to catch violations.

---

## Current Working State (as of 2026-06-07 end of session)

### All Modules -- Working
| Module | Route | Status |
|--------|-------|--------|
| Knowledge Base | /knowledge-base | Working |
| Field Intelligence | /field-intelligence | Working |
| Active Watch + STRATADAR | /active-watch | Working |
| Output Engine | /output | Working |
| STRATASCOUT | /stratascout | Working |
| STRATALINK | /stratalink | Working |
| STRATEGIST | /strategist | Working -- Monday Brief produces real output |
| STRATAGORA | /stratagora | Working -- market scan, signal storage, STRATEGIST integration |

### STRATAGORA (market intelligence)
- POST /api/stratagora/scan -- triggers parallel sector scan (up to 5 sectors, 50s timeout each)
- GET /api/stratagora/signals -- list stored signals
- GET /api/stratagora/summary -- signal count + sector brief for STRATEGIST
- Signals stored in Firestore `market_intelligence` collection with 90-day expiry
- Sectors derived from KB Manual Seeds (buyer_type + use_case)
- Confirmed working: Green Energy, Oil/Gas, Industrial Insulation sectors producing real signals

### STRATEGIST Monday Brief
- POST /api/strategist/brief -- reads all pipeline data + market signals, calls Gemini once, returns structured JSON
- Uses plain `generate()` NOT `generate_with_grounding()` (brief has all data in prompt, no web search needed)
- Returns: week_headline, pipeline_score (0-100), top_calls, top_3_actions, what_changed, kb_health, watch_alerts, market_intelligence
- Confirmed working: pipeline score 70, real prospect names (Dynelectro CI 97, Everfuel, GEA Group), STRATAGORA signals integrated
- Frontend: /strategist route, Strategist.tsx

---

## What Antigravity Still Needs to Build

### Supplier Reports Frontend (highest priority)
Backend is fully built and tested. AG builds the UI.
Endpoints:
- POST /api/supplier-reports/{id}/qa -- Q&A grounded in KB
- GET /api/supplier-reports/{id}/audit -- gap analysis with grades
- GET /api/supplier-reports/{id}/synthesis -- structured capability doc

Suggested UI: new tab in KB supplier view ("Reports"), three sections (QA, Audit, Synthesis).
Files to create: frontend/src/pages/SupplierReports.tsx (or add to KnowledgeBase.tsx)

---

## Recent Commits (pull these)
- `STRATEGIST brief working: fix generate(), f-string set bug, fence stripping, error handling`
- `STRATAGORA working: port 9000, str() dict fix, ASCII hardening, parallel scan, strategist brief improvements`
- Earlier commits: see git log

## Handoff Log (newest first)
| Date | Who | What |
|------|-----|------|
| 2026-06-07 | Claude | STRATEGIST brief fully working. STRATAGORA scan + signal storage confirmed. Port 9000. All bugs fixed. |
| 2026-06-07 | Claude | STRATAGORA built, ASCII hardening, check_before_restart.py, port migration to 9000. |
| 2026-06-06 | Claude | Supplier Reports backend, Value Brief export (.docx), Manual Seeds, Logo update, STRATAGORA crawl phase. |
| 2026-06-05 | Claude | STRATADAR, STRATEGIST (v1), auto-enrich, deep scan, FI inline output, signal recency, migration blocks 1-3+5. |
| 2026-06-04 | Claude | KB grid layout, drag reorder, STRATALYST enrichment agent. |
| 2026-06-03 | Claude | KB supplier list, FI supplier dropdown, folder sync, product images, buying signals. |

---

## Key Bug Patterns to Avoid

**f-string double-brace:** Inside `{expression}` in an f-string, `{{key: val}}` = a SET containing
a dict (TypeError). Pre-compute complex dicts as variables before the f-string.

**Gemini JSON fence:** Gemini wraps responses in backtick, `'''`, or `"""` fences unpredictably.
Strip all three styles before parsing. Use find("{")/rfind("}") as safety net.

**Firestore sort:** Never combine order_by + where in Firestore queries -- requires composite index.
Fetch all docs, sort in Python.

**CIFS mtime:** Auto-reload doesn't detect Claude's edits. Always full restart.
