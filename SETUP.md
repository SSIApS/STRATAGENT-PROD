# STRATAGENT — First Push to GitHub

Run these commands in Antigravity CLI from the `stratagent/` directory:

```bash
git init
git add .
git commit -m "Initial STRATAGENT scaffold — all four modules"
git branch -M main
git remote add origin https://github.com/SSIApS/STRATAGENT-PROD.git
git push -u origin main
```

## After pushing — set up GitHub Secrets for CI/CD

In GitHub → Settings → Secrets and variables → Actions, add:
- `WIF_PROVIDER` — Workload Identity Federation provider (set up in GCP IAM)
- `WIF_SERVICE_ACCOUNT` — Service account email with Cloud Run + Secret Manager access

## Local development

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
export STRATAGENT_GEMINI_API_KEY=your_key_here
uvicorn main:app --reload --port 8080
```

API will be available at http://localhost:8080
Health check: http://localhost:8080/health
