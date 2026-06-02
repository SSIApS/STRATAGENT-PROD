"""
STRATAGENT — Configuration
Loads secrets from Google Cloud Secret Manager in production,
falls back to environment variables for local development.
"""
import os
from google.cloud import secretmanager
from functools import lru_cache


PROJECT_ID = "gen-lang-client-0933865033"
GCS_BUCKET = "stratagent-documents"
FIRESTORE_DATABASE = "(default)"
GEMINI_MODEL = "gemini-2.5-flash-preview-05-20"  # Falls back gracefully to latest available
DEMO_PASSWORD = "DEMO2026"
DEMO_MAX_ACTIONS = 5


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
