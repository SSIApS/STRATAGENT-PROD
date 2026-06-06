# STRATAGENT — Environment Variables

All variables are read from `backend/.env` for local development.
In production (Cloud Run), inject via `--set-secrets` or `--set-env-vars` flags.

---

## Required

### `STRATAGENT_GEMINI_API_KEY`
The Google Gemini API key. Used for all AI calls across every agent.

- **Get it from:** Google AI Studio (aistudio.google.com) or GCP → APIs & Services → Credentials
- **Local dev:** Add to `backend/.env`
- **Cloud Run:** `--set-secrets STRATAGENT_GEMINI_API_KEY=STRATAGENT_GEMINI_API_KEY:latest`
  (secret must be created in GCP Secret Manager under that name first)
- **Alternative name:** `GOOGLE_API_KEY` also accepted (config.py checks both)

### `GOOGLE_APPLICATION_CREDENTIALS`
Path to a GCP service account JSON key file. Required for Firestore access.

- **Get it from:** GCP → IAM & Admin → Service Accounts → Create Key (JSON)
- **Required roles:** Cloud Datastore User (Firestore), optionally Secret Manager Secret Accessor
- **Local dev:** Add path to `backend/.env`, e.g. `GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json`
- **Cloud Run:** Not needed — Cloud Run uses the attached service account automatically.
  Ensure the Cloud Run service account has Firestore access.

---

## Optional (have safe defaults)

### `STRATAGENT_DEMO_PASSWORD`
Login password for the demo gate.

- **Default:** `DEMO2026`
- **Change for production:** Set to a strong password before any public-facing deploy

### `STRATAGENT_MAX_ACTIONS`
Maximum actions per session for the demo gate counter.

- **Default:** `999999` (effectively unlimited — internal tool)
- **Change for public demo:** Set to e.g. `20` to limit free usage

---

## Local-only (not applicable on Cloud Run)

### `LOCAL_SUPPLIERS_ROOT`
Absolute path to the local `Suppliers/` folder used by Folder Sync.

- **Default:** Auto-resolved relative to backend dir (`../../Suppliers`)
- **Cloud Run:** Folder Sync is disabled in production — this var is ignored

### `LOCAL_PRODUCTS_ROOT`
Absolute path to the local `Products/` folder used by Folder Sync.

- **Default:** Auto-resolved relative to backend dir (`../../Products`)
- **Cloud Run:** Same as above — ignored

---

## Hardcoded (not configurable via env)

These values are set directly in `backend/config.py` and do not need env vars:

| Variable | Value | Notes |
|----------|-------|-------|
| `PROJECT_ID` | `gen-lang-client-0933865033` | GCP project — change if project changes |
| `FIRESTORE_DATABASE` | `(default)` | Default Firestore database |
| `GEMINI_MODEL` | `gemini-2.5-flash` | AI model — update here to change model |
| `GCS_BUCKET` | `stratagent-documents` | Reserved for future document storage |

---

## Example `backend/.env` for local development

```
STRATAGENT_GEMINI_API_KEY=your-gemini-api-key-here
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your-service-account-key.json
STRATAGENT_DEMO_PASSWORD=DEMO2026
```

> **Never commit `.env` to git.** It is listed in both `.gitignore` and `backend/.dockerignore`.
