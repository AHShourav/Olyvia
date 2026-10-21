"""Shared Gemini API helpers (text, chat, audio). Requires GEMINI_API_KEY in environment."""

import json
import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Free-tier keys no longer get gemini-2.x. Google routes new keys to the 3.x lite models.
GEMINI_MODELS = (
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
)


def get_gemini_api_key() -> str:
    return (os.getenv('GEMINI_API_KEY') or '').strip()


def require_gemini_api_key() -> str:
    key = get_gemini_api_key()
    if not key:
        raise RuntimeError('No API key configured. Set GEMINI_API_KEY in .env')
    return key


def strip_json_fences(content: str) -> str:
    if content.startswith('```'):
        content = re.sub(r'^```\w*\n?', '', content)
        content = re.sub(r'\n?```\s*$', '', content)
    return content.strip()


def _response_text(response) -> str:
    text = (getattr(response, 'text', '') or '').strip()
    if text:
        return text
    parts = []
    for candidate in getattr(response, 'candidates', []) or []:
        content = getattr(candidate, 'content', None)
        if not content:
            continue
        for part in getattr(content, 'parts', []) or []:
            piece = getattr(part, 'text', '') or ''
            if piece:
                parts.append(piece)
    return '\n'.join(parts).strip()


def generate_text(
    system_instruction: str,
    user_prompt: str,
    *,
    temperature: float = 0,
    timeout: int = 60,
) -> str:
    """Single-turn text generation with model fallback."""
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise RuntimeError(
            'Gemini package not installed. Run: pip install google-generativeai'
        ) from exc

    api_key = require_gemini_api_key()
    genai.configure(api_key=api_key)
    errors = []
    for model_name in GEMINI_MODELS:
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
            )
            response = model.generate_content(
                user_prompt,
                generation_config={'temperature': temperature},
                request_options={'timeout': timeout},
            )
            text = _response_text(response)
            if text:
                return text
            errors.append(f'{model_name}: empty response')
        except Exception as exc:
            errors.append(f'{model_name}: {exc}')
    raise RuntimeError(' ; '.join(errors) or 'Gemini returned an empty response.')


def chat_text(
    system_instruction: str,
    messages: list[dict],
    *,
    temperature: float = 0.4,
    timeout: int = 25,
) -> str:
    """Multi-turn chat; messages are {role: user|assistant, content: str}."""
    if not messages:
        raise ValueError('messages required')
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise RuntimeError('Gemini package not installed.') from exc

    api_key = require_gemini_api_key()
    genai.configure(api_key=api_key)
    history = [
        {
            'role': 'user' if item['role'] == 'user' else 'model',
            'parts': [item['content']],
        }
        for item in messages[:-1]
    ]
    errors = []
    for model_name in GEMINI_MODELS:
        try:
            model = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            chat = model.start_chat(history=history)
            response = chat.send_message(
                messages[-1]['content'],
                generation_config={'temperature': temperature},
                request_options={'timeout': timeout},
            )
            text = _response_text(response)
            if text:
                return text
            errors.append(f'{model_name}: empty response')
        except Exception as exc:
            errors.append(f'{model_name}: {exc}')
    raise RuntimeError(' ; '.join(errors) or 'Gemini returned an empty response.')


def transcribe_audio(audio_bytes: bytes, mime_type: str = 'audio/webm') -> str:
    """Transcribe short speech audio with Gemini."""
    if not audio_bytes:
        return ''
    try:
        import google.generativeai as genai
    except ImportError:
        logger.warning('google-generativeai not installed')
        return ''

    api_key = get_gemini_api_key()
    if not api_key:
        logger.warning('GEMINI_API_KEY not set')
        return ''

    genai.configure(api_key=api_key)
    prompt = (
        'Transcribe the spoken words in this audio. '
        'Reply with only the transcript text, no labels or commentary.'
    )
    errors = []
    for model_name in GEMINI_MODELS:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                [
                    {'mime_type': mime_type, 'data': audio_bytes},
                    prompt,
                ],
                generation_config={'temperature': 0},
                request_options={'timeout': 90},
            )
            text = _response_text(response)
            if text:
                return text
            errors.append(f'{model_name}: empty transcript')
        except Exception as exc:
            errors.append(f'{model_name}: {exc}')
    logger.error('Gemini transcription failed: %s', ' ; '.join(errors))
    return ''


def extract_food_names(transcript: str, *, max_foods: int = 10, max_query_len: int = 100) -> list[str]:
    """Parse a meal description into searchable food name strings."""
    system = '''You extract food and dish names from user speech about what they ate.
Output ONLY a JSON object with a "foods" array of strings. Each string is a searchable food/dish name.
Examples: "chicken salad", "apple", "grilled salmon with rice".
Do not include quantities, brands, or instructions. Only food names.'''
    user = f'User said:\n{transcript}\n\nReturn JSON: {{"foods": ["..."]}}'
    try:
        raw = generate_text(system, user, temperature=0, timeout=45)
        data = json.loads(strip_json_fences(raw))
        foods = data.get('foods') or []
    except Exception as exc:
        logger.warning('Gemini food extraction failed: %s', exc)
        return []

    validated = []
    for item in foods[:max_foods]:
        name = str(item).strip()[:max_query_len]
        if name and re.match(r'^[\w\s\-\.]+$', name, re.IGNORECASE):
            validated.append(name)
    return validated


def public_provider_error(name: str, exc: Exception) -> str:
    text = str(exc).lower()
    if '429' in text or 'credit' in text or 'quota' in text or 'billing' in text:
        return f'{name} is out of credits.'
    if '401' in text or 'api key' in text or 'incorrect api key' in text:
        return f'{name} rejected the API key.'
    if '404' in text or 'no longer available' in text:
        return f'{name} model is unavailable.'
    return f'{name} could not reply.'
