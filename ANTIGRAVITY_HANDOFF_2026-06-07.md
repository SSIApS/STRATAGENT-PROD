# STRATAGENT — Antigravity Handoff (updated 2026-06-15)

## What STRATAGENT Is
Agentic B2B sales app for Jason Smith / Strategic Sales International ApS (SSI), Denmark.
Stack: React + Vite + TypeScript (localhost:5173) | FastAPI + Gemini 2.5 Flash + Firestore
Repo: https://github.com/SSIApS/STRATAGENT-PROD
Branch: feature/seed-intelligence (latest -- pull this)
Start: double-click START STRATAGENT.bat | Password: DEMO2026

## CRITICAL: Port 9000
Backend runs on port 9000 (NOT 8080 -- IIS conflict on this machine).
- uvicorn: `--host 127.0.0.1 --port 9000`
- frontend/src/services/api.ts: BASE_URL = `http://127.0.0.1:9000`
- frontend/vite.config.ts: proxy target = `http://127.0.0.1:9000`

## CRITICAL: Auto-Reload Does Not Work
uvicorn --reload does not detect edits written via Claude's Linux sandbox (CIFS mtime not updated).
Rule: After ANY Claude edit session, always Ctrl+C and manually restart uvicorn.

## CRITICAL: ASCII-Only in Python Source Files
Non-ASCII chars in Python docstrings/comments cause the Windows tokenizer to fail when loading
files via CIFS mount. Use plain `--` and `->` in source. Non-ASCII only permitted in string
literals that generate formatted output (Word docs, Danish research prompts).
Run `python check_before_startup.py` from backend/ before every restart. Exit 0 = safe.
The import-fail lines in the watchdog output are false positives (it runs outside the venv).
Only SYNTAX ERR and NON-ASCII errors in the ERRORS block require action.

---

## All Modules -- Current State (2026-06-15)

| Module | Route | Backend | Frontend | Notes |
|--------|-------|---------|----------|-------|
| Knowledge Base | /knowledge-base | Done | Done | Intelligence Seed, Product Library, Folder Sync |
| Field Intelligence | /field-intelligence | Done | Done | STRATAMESH synergy panel, Research Queue |
| Active Watch | /active-watch | Done | Done | STRATADAR cross-supplier monitor |
| Output Engine | /output | Done | Done | Proposals at SD 60/75/90, .docx export |
| STRATASCOUT | /stratascout | Done | Done | Geography+sector scoped prospect hunter |
| STRATALINK | /stratalink | Done | Done | Affiliate intelligence + saved searches |
| STRATEGIST | /strategist | Done | Done | Monday Brief with STRATAGORA signals |
| STRATAGORA | /stratagora | Done | Done | Market intelligence scan, signal storage |
| Supplier Reports | /supplier-reports | Done | NEEDED | AG builds the frontend (see below) |
| Product Analysis (PAM) | /product-analysis | Done | Done | Archetype-based product market scans |

---

## What Antigravity Needs to Build

### 1. Supplier Reports Frontend (highest priority)
Backend fully built and tested. AG builds the UI.
Endpoints:
- POST /api/supplier-reports/{id}/qa -- Q&A grounded in KB (body: {question: string})
- GET /api/supplier-reports/{id}/audit -- gap analysis with letter grades + top 3 priorities
- GET /api/supplier-reports/{id}/synthesis -- structured capability doc with SSI branding fields

Suggested UI: tab labelled "Reports" inside the KB supplier view, three accordion sections.
File to create: frontend/src/pages/SupplierReports.tsx (or extend KnowledgeBase.tsx)
Must be accessible from the KB supplier panel the same way other tabs are.

### 2. STRATAPIPE -- Engagement Pipeline (next Claude build, spec ready)
Full spec in STRATAPIPE_Build_Spec.md at workspace root.
This is the next module Claude will build. AG should NOT start this -- Claude owns it.
Rough schema: prospect -> pipeline stage (qualify/propose/negotiate/closed) -> revenue tracking.

---

## Agent Team (all backend-complete)

| Agent | Role |
|-------|------|
| STRATALYST | KB enrichment -- fills intelligence gaps via web crawl |
| STRATASCOUT | Prospect hunter -- geography + sector scoped |
| STRATALINK | Affiliate intelligence -- revenue development |
| STRATADAR | Active Watch monitor -- cross-supplier scan, priority scoring |
| STRATEGIST | Monday Brief + Top 3 Actions -- cross-pipeline AI advisor |
| STRATAGORA | Market intelligence -- sector scanning, signal storage |
| STRATAMESH | Cross-supplier synergy scoring -- fires after every FI run |

---

## Firestore Collections

- `knowledge_bases` -- supplier KB profiles
- `relationship_profiles` -- FI prospect research results
- `monitored_positions` -- Active Watch queue
- `outcome_memory` -- learning layer
- `demo_sessions` -- session counters
- `product_images` -- tagged product images per supplier
- `prospect_pool` -- STRATASCOUT discoveries
- `affiliate_partners` -- STRATALINK partner library
- `affiliate_referrals` -- referral log with commission tracking
- `pending_research` -- Research Queue: failed FI runs saved for one-click retry
- `affiliate_research_runs` -- STRATALINK saved searches
- `synergy_matches` -- STRATAMESH cross-supplier flags per prospect
- `market_intelligence` -- STRATAGORA signals (90-day expiry)
- `intelligence_seeds` -- 6-block agentic seed per supplier
- `product_registry` -- PAM product registrations
- `analysis_vault` -- PAM scan results (versioned)

---

## Key Bug Patterns to Avoid

**Non-ASCII in Python source:** Box-drawing chars (━, ─), em dashes, arrows in docstrings/comments
cause silent module-import failures on Windows via CIFS. Use ASCII only. This broke the app after
the June 12 session -- orphaned prompt block with ━ characters caused SyntaxError in output_agent.py.

**f-string double-brace:** Inside `{expression}` in an f-string, `{{key: val}}` = a SET containing
a dict (TypeError). Pre-compute complex dicts as variables before the f-string.

**Gemini JSON fence:** Gemini wraps responses in backtick, `'''`, or `"""` fences unpredictably.
Strip all three styles before parsing. Use find("{")/rfind("}") as safety net.

**Firestore sort:** Never combine order_by + where in one Firestore chain -- needs composite index.
Fetch docs, sort in Python.

**Profile fields as dicts:** Gemini sometimes returns dicts instead of strings for profile fields.
Always wrap with str() before slicing or string operations.

**Gemini 503:** Free-tier key gets rate-limited. services/gemini.py retries 3x with exponential
backoff. Research Queue saves failed FI requests for one-click retry.

---

## Handoff Log (newest first)

| Date | Who | What |
|------|-----|------|
| 2026-06-15 | Claude | Fixed output_agent.py SyntaxError (orphan block + non-ASCII). Pushed branch. Handoff updated. |
| 2026-06-12 | Claude | PAM Session 2: scan_focus field, Scan Instructions UI, vault docx export with STRATAGENT branding. |
| 2026-06-11 | Claude | PAM built: product_analysis_agent.py, product_registry.py router, ProductAnalysis.tsx, 4 archetypes. |
| 2026-06-09 | Claude | STRATAMESH built. Intelligence Seed built. STRATAGORA consumer extension. NACE classification planned. |
| 2026-06-08 | Claude | Research Queue, Gemini retry backoff, check_before_startup.py, output agent seed block fix. |
| 2026-06-07 | Claude | STRATEGIST brief working. STRATAGORA confirmed. Port 9000. ASCII hardening. |
| 2026-06-06 | Claude | Supplier Reports backend, Value Brief .docx export, Manual Seeds, STRATAGORA crawl phase. |
| 2026-06-05 | Claude | STRATADAR, STRATEGIST v1, auto-enrich, deep scan, FI inline output, signal recency. |
| 2026-06-04 | Claude | KB grid layout, drag reorder, STRATALYST enrichment agent. |
| 2026-06-03 | Claude | KB supplier list, FI supplier dropdown, folder sync, product images, buying signals. |
