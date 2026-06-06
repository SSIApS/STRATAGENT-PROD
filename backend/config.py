"""
STRATAGENT — Configuration
Reads from environment variables. In production (Cloud Run), secrets are
injected via --set-secrets flag — no Python Secret Manager client needed.
For local dev, values are loaded from backend/.env via python-dotenv.
"""
import os
import pathlib
from dotenv import load_dotenv

load_dotenv()

# ── GCP ────────────────────────────────────────────────────────────────────
PROJECT_ID        = "gen-lang-client-0933865033"
FIRESTORE_DATABASE = "(default)"
GCS_BUCKET        = "stratagent-documents"

# ── AI ─────────────────────────────────────────────────────────────────────
GEMINI_MODEL = "gemini-2.5-flash"

def get_gemini_api_key() -> str:
    """
    In production: Cloud Run injects STRATAGENT_GEMINI_API_KEY via --set-secrets.
    In local dev:  set STRATAGENT_GEMINI_API_KEY in backend/.env
    """
    key = os.getenv("STRATAGENT_GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError(
            "STRATAGENT_GEMINI_API_KEY not set. "
            "Add it to backend/.env for local dev, or configure --set-secrets on Cloud Run."
        )
    return key

# -- Demo gate -----------------------------------------------------------
DEMO_PASSWORD    = os.getenv("STRATAGENT_DEMO_PASSWORD", "DEMO2026")
DEMO_MAX_ACTIONS = int(os.getenv("STRATAGENT_MAX_ACTIONS", "999999"))

# -- Local folder sync (local dev only -- disabled on Cloud Run) ---------
_BACKEND_DIR         = pathlib.Path(__file__).parent
_APP_ROOT            = _BACKEND_DIR.parent.parent
LOCAL_SUPPLIERS_ROOT = os.getenv("LOCAL_SUPPLIERS_ROOT", str(_APP_ROOT / "Suppliers"))
LOCAL_PRODUCTS_ROOT  = os.getenv("LOCAL_PRODUCTS_ROOT",  str(_APP_ROOT / "Products"))
