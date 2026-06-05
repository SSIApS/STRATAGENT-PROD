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
uvicorn main:app --reload --port 8080
```

**Your Gemini API key** is at: aistudio.google.com/apikey  
→ Project: gen-lang-client-0933865033  
→ Copy the key starting with AIza...

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
