# STRATAGENT — Daily Startup Guide

## Step 1 — Open two PowerShell windows

---

## Window 1 — Frontend

```
cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\frontend"
npm run dev
```

Then open: **http://localhost:5173**

---

## Window 2 — Backend

Run these one at a time:

```
cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend"
```
```
venv\Scripts\activate
```
```
$env:GOOGLE_CLOUD_PROJECT="gen-lang-client-0933865033"
```
```
$env:STRATAGENT_GEMINI_API_KEY="YOUR_GEMINI_KEY_HERE"
```
```
uvicorn main:app --reload --port 9000
```

**Your Gemini API key** is at: aistudio.google.com/apikey  
→ Project: gen-lang-client-0933865033  
→ Copy the key starting with AIza...

---

## Before you start (or restart) the backend — run the watchdog

STRATAGENT has a pre-startup watchdog script that catches the bug classes that
have crashed the backend before (undefined helpers, Firestore query errors,
non-ASCII in source files, etc.). Run it from the backend folder before
`uvicorn` every time:

```
cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent\backend"
venv\Scripts\activate
python check_before_startup.py
```

It runs 12 checks: syntax validity, non-ASCII in docstrings/comments, router
registration, router prefix collisions, undefined helper functions, live
import resolution, direct Gemini calls outside `services/gemini.py`, f-string
double-brace dict bugs, Firestore `where()` + `order_by()` chains, required
env vars/secrets, port availability, and a recently-modified-files summary.

- **Exit 0 ("All clean")** → safe to start/restart
- **Exit 1 ("ERRORS")** → fix the listed issues before running `uvicorn`

There's also a faster syntax-only version, `check_before_restart.py`, for
quick checks between small edits. When in doubt, run the fuller
`check_before_startup.py`.

---

## Login

URL: **http://localhost:5173**  
Password: **DEMO2026**

---

## Key types — never mix these up

| Key | Starts with | Used for | Found at |
|-----|-------------|----------|----------|
| Gemini API Key | AIza... | Running STRATAGENT | aistudio.google.com/apikey |
| GitHub Token | ghp_ | Pushing code only | github.com/settings/tokens |

---

## To push code changes to GitHub

```
cd "C:\Claude Code Folder\STRATAGENT SALES APP\STRATAGENT Sales App\stratagent"
git add .
git commit -m "your message"
git push
```

---

## Coming next — Cloud Run deployment
Once deployed, STRATAGENT runs permanently online.  
No startup sequence needed. Access from any device, anywhere.


---

## Consumer/Retail MVR Workflow (n8wc and future clients)

The full pipeline for evaluating a consumer product's market position and channel fit:

### Step 1 -- Set up the Knowledge Base
1. Create or open the supplier KB
2. Set **Supplier Location** (pin icon next to the URL, or on create form)
   - Example: `Omaha, Nebraska, USA`
   - This anchors all geo-aware research -- channel scoring, market scanning, Gemini prompts all use it
3. Set **Agent Definition** (Manual Seed) -- product_plain, buyer_type, use_case, not_this

### Step 2 -- Upload product images
- KB -> Product Images -> upload 1-5 images
- These feed the visual analysis (Stage 1) and channel research (Stage 3)

### Step 3 -- Run Visual Analysis (Stage 1)
- KB -> Visual Intelligence panel -> **Analyse Images**
- Returns: quality scores, competitive tier, marketing description, strengths/watch points
- Result is **cached** -- button shows date badge + "Re-analyse" on subsequent opens
- No need to re-run unless product images change

### Step 4 -- Run Market Scan (Stage 2)
- KB -> Visual Intelligence panel -> **Market Scan**
- Returns: per-channel saturation scores, open channels, top consumer signals
- Result is **cached** -- button shows date badge + "Re-scan Market"
- Uses supplier_location as geography context automatically

### Step 5 -- Channel Deep-Dives (Stage 3)
- Go to **Field Intelligence** module
- Select supplier from dropdown
- Set mode to **Channel Research**
- Type a channel name (e.g. `Etsy`, `Society6`, `Amazon Handmade`, `Fine Art America`)
- Click **Run Channel Deep-Dive**
- Returns: CHANNEL PITCH BRIEF / EXPLORE / MONITOR / SKIP path label, 6-dimension scores,
  approach strategy, key requirements, priority actions
- Gemini automatically uses your saved visual analysis + location -- no extra setup
- Run this for each open channel from the market scan

### Step 6 -- Generate Channel Brief (Stage 4)
- KB -> Visual Intelligence panel -> **Generate Channel Brief**
- Synthesises visual analysis + scan into 5-section brief:
  Strategic Position, Recommended Launch Channels, Visual Positioning Angle, First Move, What to Avoid

### How to pick up after a session break
- Visual analysis and market scan results are saved to Firestore -- reopening KB pre-loads both
- FI channel research history is in the Research History panel
- Images show "ANALYSED" overlay badge when covered by a saved analysis

---

## Key files (built/modified 2026-06-10)
| File | What changed |
|------|--------------|
| `backend/agents/research_agent.py` | Channel research geo context + visual analysis in prompts |
| `backend/agents/stratagora_agent.py` | Scan geography resolution + visual grounding |
| `backend/agents/extraction_agent.py` | supplier_location extracted from web research |
| `backend/routers/knowledge_base.py` | Analysis cache + channel brief endpoint + supplier_location |
| `backend/routers/stratagora.py` | Scan cache + force_rerun + geography from KB |
| `backend/routers/field_intelligence.py` | Auto-injects visual analysis + location |
| `backend/services/firestore.py` | save_kb_analysis() persists to KB doc |
| `frontend/src/pages/KnowledgeBase.tsx` | Cache UX, image badges, location field |
| `frontend/src/pages/FieldIntelligence.tsx` | Mode selector, channel result panel |
| `STRATAGENT_MVR_Methodology.docx` | Client briefing doc (workspace root) |
