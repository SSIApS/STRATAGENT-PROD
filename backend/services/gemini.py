"""
STRATAGENT -- Gemini Service
Single entry point for all Gemini 2.5 Flash calls.
Migrated from google-generativeai to google-genai (Block 5).

CRITICAL: client.models.generate_content() is synchronous.
All calls run via asyncio.to_thread() so they never block the event loop.

Vision calls accept a list of image dicts:
  [{"data": base64_str, "mime_type": "image/jpeg"}, ...]
Gemini 2.5 Flash is fully multimodal -- vision + grounding can be combined.

asyncio.CancelledError is BaseException (not Exception) in Python 3.10+.
All async wrappers use asyncio.wait_for(timeout=120) so that slow or hanging
Gemini calls raise TimeoutError (an Exception subclass) instead of silently
dropping the uvicorn worker TCP connection on task cancellation.
"""
import asyncio
import base64
import time
from functools import lru_cache
from google import genai
from google.genai import types
from config import get_gemini_api_key, GEMINI_MODEL

_RETRYABLE_MARKERS = ("503", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "high demand", "rate limit")
_MAX_RETRIES = 3
_BASE_DELAY_SECONDS = 2


@lru_cache()
def _get_client() -> genai.Client:
    return genai.Client(api_key=get_gemini_api_key())


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc)
    return any(marker in msg for marker in _RETRYABLE_MARKERS)


def _call_with_retry(fn, *args, **kwargs):
    last_exc = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_exc = e
            if attempt < _MAX_RETRIES and _is_retryable(e):
                time.sleep(_BASE_DELAY_SECONDS * (2 ** attempt))
                continue
            raise
    raise last_exc


def _safe_text(response) -> str:
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


def _generate_sync(prompt: str, temperature: float = 0.3, max_output_tokens: int = 16384) -> str:
    client = _get_client()
    def _call():
        return client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            ),
        )
    response = _call_with_retry(_call)
    return _safe_text(response)


def _generate_grounded_sync(prompt: str) -> str:
    client = _get_client()
    def _call():
        return client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.3,
                max_output_tokens=8192,
            ),
        )
    try:
        response = _call_with_retry(_call)
        text = _safe_text(response)
        if text:
            return text
    except Exception:
        pass
    return _generate_sync(prompt)


async def generate(prompt: str, temperature: float = 0.3, max_output_tokens: int = 16384) -> str:
    """Non-blocking async wrapper. wait_for(180s) prevents CancelledError worker crash.
    Default max_output_tokens raised to 16384 -- convergence proposals can approach 8192."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_generate_sync, prompt, temperature, max_output_tokens),
            timeout=180.0,
        )
    except asyncio.TimeoutError:
        raise RuntimeError("Gemini generate timed out after 180s") from None
    except Exception as e:
        raise RuntimeError(f"Gemini generate failed: {e}") from e


async def generate_with_grounding(prompt: str) -> str:
    """Google Search grounding. wait_for(120s) prevents CancelledError worker crash."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_generate_grounded_sync, prompt),
            timeout=120.0,
        )
    except asyncio.TimeoutError:
        raise RuntimeError("Gemini grounding timed out after 120s") from None
    except Exception as e:
        raise RuntimeError(f"Gemini grounding failed: {e}") from e


def _build_image_parts(images: list) -> list:
    parts = []
    for img in images:
        raw = img["data"]
        if isinstance(raw, str):
            raw = base64.b64decode(raw)
        parts.append(
            types.Part.from_bytes(data=raw, mime_type=img.get("mime_type", "image/jpeg"))
        )
    return parts


def _generate_vision_sync(prompt: str, images: list, temperature: float = 0.3) -> str:
    client = _get_client()
    parts = _build_image_parts(images)
    parts.append(types.Part.from_text(text=prompt))
    def _call():
        return client.models.generate_content(
            model=GEMINI_MODEL,
            contents=parts,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                temperature=temperature,
                max_output_tokens=8192,
            ),
        )
    response = _call_with_retry(_call)
    return _safe_text(response)


def _generate_grounded_vision_sync(prompt: str, images: list) -> str:
    client = _get_client()
    parts = _build_image_parts(images)
    parts.append(types.Part.from_text(text=prompt))
    def _call():
        return client.models.generate_content(
            model=GEMINI_MODEL,
            contents=parts,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.3,
                max_output_tokens=8192,
            ),
        )
    try:
        response = _call_with_retry(_call)
        text = _safe_text(response)
        if text:
            return text
    except Exception:
        pass
    return _generate_vision_sync(prompt, images)


async def generate_with_vision(prompt: str, images: list, temperature: float = 0.3) -> str:
    """Vision (no grounding). wait_for(120s) prevents CancelledError worker crash."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_generate_vision_sync, prompt, images, temperature),
            timeout=120.0,
        )
    except asyncio.TimeoutError:
        raise RuntimeError("Gemini vision timed out after 120s") from None
    except Exception as e:
        raise RuntimeError(f"Gemini vision failed: {e}") from e


async def generate_grounded_with_vision(prompt: str, images: list) -> str:
    """Grounding + vision. wait_for(120s) prevents CancelledError worker crash."""
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_generate_grounded_vision_sync, prompt, images),
            timeout=120.0,
        )
    except asyncio.TimeoutError:
        raise RuntimeError("Gemini grounded vision timed out after 120s") from None
    except Exception as e:
        raise RuntimeError(f"Gemini grounded vision failed: {e}") from e


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

