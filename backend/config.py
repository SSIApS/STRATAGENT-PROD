"""
STRATAGENT — Configuration
Loads secrets from Google Cloud Secret Manager in production,
falls back to environment variables for local development.
"""
import os
import pathlib
from google.cloud import secretmanager
from functools import lru_cache
from dotenv import load_dotenv
load_dotenv()


PROJECT_ID = "gen-lang-client-0933865033"

# Local folder structure — root of the STRATAGENT Sales App directory
_BACKEND_DIR = pathlib.Path(__file__).parent      # .../stratagent/backend
_APP_ROOT = _BACKEND_DIR.parent.parent            # .../STRATAGENT Sales App
LOCAL_SUPPLIERS_ROOT = str(_APP_ROOT / "Suppliers")
LOCAL_PRODUCTS_ROOT = str(_APP_ROOT / "Products")
GCS_BUCKET = "stratagent-documents"
FIRESTORE_DATABASE = "(default)"
GEMINI_MODEL = "gemini-2.5-flash"
DEMO_PASSWORD = "DEMO2026"
DEMO_MAX_ACTIONS = 999999  # Internal tool — no action limit


def get_secret(secret_name: str) -> str:
    """Fetch a secret from Secret Manager, fall back to env var."""
    env_val = os.getenv(secret_name)
    if env_val:
        return env_val
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")


@lru_cache()
def get_gemini_api_key() -> str:
    return get_secret("STRATAGENT_GEMINI_API_KEY")
