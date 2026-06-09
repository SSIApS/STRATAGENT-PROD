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
