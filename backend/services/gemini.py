"""
STRATAGENT -- Gemini Service
Single entry point for all Gemini 2.5 Flash calls.

CRITICAL: model.generate_content() is synchronous.
All calls run via asyncio.to_thread() so they never block the event loop.
"""
import asyncio
import google.generativeai as genai
from config import get_gemini_api_key, GEMINI_MODEL
from functools import lru_cache


@lru_cache()
def get_model():
    genai.configure(api_key=get_gemini_api_key())
    return genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=_SYSTEM_PROMPT,
    )


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
    """Synchronous Gemini call — must be called via asyncio.to_thread()."""
    model = get_model()
    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=temperature,
            max_output_tokens=8192,
        ),
    )
    return _safe_text(response)


def _generate_grounded_sync(prompt: str) -> str:
    """Synchronous grounded Gemini call — must be called via asyncio.to_thread()."""
    genai.configure(api_key=get_gemini_api_key())

    # Try grounding with Google Search
    try:
        tool = genai.protos.Tool(
            google_search_retrieval=genai.protos.GoogleSearchRetrieval()
        )
        model = genai.GenerativeModel(
            model_name=GEMINI_MODEL,
            system_instruction=_SYSTEM_PROMPT,
        )
        response = model.generate_content(
            prompt,
            tools=[tool],
            generation_config=genai.types.GenerationConfig(
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
    "SSI ApS FOOTER (all client-facing documents):\n"
    "Jason L. Smith | Strategic Sales International ApS\n"
    "info@strategic.dk | www.strategic-dk.com | +45 24 99 23 93\n"
    "CVR: 41945621 | Roskilde, Denmark\n"
    "STRATAGENT -- The Intelligence Behind Agentic Sales."
)
