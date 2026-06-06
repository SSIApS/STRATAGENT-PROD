"""
STRATAGENT -- Gemini Service
Single entry point for all Gemini 2.5 Flash calls.
Migrated from google-generativeai to google-genai (Block 5).

CRITICAL: client.models.generate_content() is synchronous.
All calls run via asyncio.to_thread() so they never block the event loop.
"""
import asyncio
from functools import lru_cache
from google import genai
from google.genai import types
from config import get_gemini_api_key, GEMINI_MODEL


@lru_cache()
def _get_client() -> genai.Client:
    """Create and cache the Gemini client."""
    return genai.Client(api_key=get_gemini_api_key())


def _safe_text(response) -> str:
    """Extract text from a Gemini response without ever raising."""
    try:
        return response.text
    except Exception:
        pass
    try:
        for candidate in response.candidates:
            parts = [p.text for p in candidate.content.parts if hasattr(p, "text") and p.text]
            if parts:
                return "\n".join(parts)
    except Exception:
        pass
    return ""


def _generate_sync(prompt: str, temperature: float = 0.3) -> str:
    """Synchronous Gemini call -- must be called via asyncio.to_thread()."""
    client = _get_client()
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            temperature=temperature,
            max_output_tokens=8192,
        ),
    )
    return _safe_text(response)


def _generate_grounded_sync(prompt: str) -> str:
    """Synchronous grounded Gemini call -- must be called via asyncio.to_thread()."""
    client = _get_client()

    # Try grounding with Google Search
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.3,
                max_output_tokens=8192,
            ),
        )
        text = _safe_text(response)
        if text:
            return text
    except Exception:
        pass

    # Fallback: ungrounded
    return _generate_sync(prompt)


async def generate(prompt: str, temperature: float = 0.3) -> str:
    """Non-blocking async wrapper around synchronous Gemini generate."""
    try:
        return await asyncio.to_thread(_generate_sync, prompt, temperature)
    except Exception as e:
        raise RuntimeError(f"Gemini generate failed: {e}") from e


async def generate_with_grounding(prompt: str) -> str:
    """Non-blocking async wrapper with Google Search grounding."""
    try:
        return await asyncio.to_thread(_generate_grounded_sync, prompt)
    except Exception as e:
        raise RuntimeError(f"Gemini grounding failed: {e}") from e


_SYSTEM_PROMPT = (
    "You are STRATAGENT -- the institutional intelligence of a modern industrial "
    "sales operation built by Strategic Sales International ApS.\n\n"
    "ABSOLUTE RULES:\n"
    "- Never ask for information that can be found by searching\n"
    "- Never generate a proposal when intelligence only supports an email\n"
    "- Always score confidence honestly\n"
    "- Always search the prospect before generating Stage 2 or Stage 3 documents\n\n"
    "NOMENCLATURE:\n"
    "- Supplier profile -> KNOWLEDGE BASE | Profile strength -> INTELLIGENCE DEPTH\n"
    "- Prospect research -> FIELD INTELLIGENCE | Alignment score -> CONVERGENCE INDEX\n"
    "- Full proposal -> CONVERGENCE PROPOSAL | Profile ready -> SINGULARITY READY\n\n"
    "OUTPUT FORMAT:\n"
    "- Return only the content requested. No meta-commentary, no headers outside the structure asked for.\n"
    "- Do NOT append any signature block, contact details, or footer to your output unless the prompt explicitly asks for it."
)
