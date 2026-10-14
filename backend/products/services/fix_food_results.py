"""
Fix food results pipeline: Gemini adjusts title and nutrients based on user correction.

Uses GEMINI_API_KEY with Gemini Flash. Falls back to OpenAI only when Gemini is not
configured or Gemini fails. Examples:
- "i ate 3 eggs" -> multiply nutrients by 3, title "Egg, whole, cooked, hard-boiled (x3)"
- "half portion" -> multiply by 0.5
"""

import json
import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

MAX_FIX_LEN = 500
GEMINI_MODELS = (
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest',
)
OPENAI_MODEL = 'gpt-4o-mini'

DANGEROUS_PATTERNS = re.compile(
    r'(ignore\s+(previous|above|all)|system\s*:|assistant\s*:|<\s*script|'
    r'(drop|delete|insert|update|alter|exec)\s+(table|database))',
    re.IGNORECASE,
)


def _sanitize(text: str, max_len: int = MAX_FIX_LEN) -> str:
    if not text or not isinstance(text, str):
        return ''
    text = text.strip()[:max_len]
    if DANGEROUS_PATTERNS.search(text):
        logger.warning('Blocked potentially dangerous fix input')
        return ''
    return text


def _strip_json_fences(content: str) -> str:
    if content.startswith('```'):
        content = re.sub(r'^```\w*\n?', '', content)
        content = re.sub(r'\n?```\s*$', '', content)
    return content.strip()


def _generate_with_gemini(system_prompt: str, user_prompt: str, api_key: str) -> str:
    try:
        import google.generativeai as genai
    except ImportError as e:
        raise RuntimeError(
            'Gemini package not installed. Run: pip install google-generativeai'
        ) from e

    genai.configure(api_key=api_key)
    model_errors = []

    for model_name in GEMINI_MODELS:
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_prompt,
            )
            response = model.generate_content(
                user_prompt,
                generation_config={'temperature': 0},
            )
            content = getattr(response, 'text', '') or ''
            if not content and getattr(response, 'candidates', None):
                parts = []
                for candidate in response.candidates:
                    candidate_content = getattr(candidate, 'content', None)
                    if not candidate_content:
                        continue
                    for part in getattr(candidate_content, 'parts', []) or []:
                        text = getattr(part, 'text', '') or ''
                        if text:
                            parts.append(text)
                content = '\n'.join(parts).strip()
            if content:
                logger.info('Fix results: Gemini model %s succeeded', model_name)
                return content
            model_errors.append(f'{model_name}: empty response')
        except Exception as e:
            model_errors.append(f'{model_name}: {e}')

    raise RuntimeError(' ; '.join(model_errors) or 'Gemini returned an empty response.')


def _generate_with_openai(system_prompt: str, user_prompt: str, api_key: str) -> str:
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError(
            'OpenAI package not installed. Run: pip install openai'
        ) from e

    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
        temperature=0,
    )
    content = (resp.choices[0].message.content or '').strip()
    if not content:
        raise RuntimeError('OpenAI returned an empty response.')
    return content


def fix_food_results(title: str, nutrients: dict, user_fix: str) -> tuple[Optional[dict], Optional[str]]:
    """
    Use Gemini first, then OpenAI fallback, to adjust title and nutrients.
    """
    user_fix = _sanitize(user_fix)
    if not user_fix:
        return None, 'Please provide a correction (e.g. "I ate 3 eggs").'

    gemini_key = (os.getenv('GEMINI_API_KEY') or '').strip()
    openai_key = (os.getenv('OPENAI_API_KEY') or '').strip()
    if not gemini_key and not openai_key:
        return None, 'No API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env'

    nutrients_clean = {k: v for k, v in nutrients.items() if v is not None}
    if not nutrients_clean:
        return None, 'No nutrient data to adjust. The food item may be missing nutrition info.'
    nutrients_str = json.dumps(nutrients_clean, indent=2)

    system_prompt = '''You adjust food nutrition data based on user corrections.

Input: original food title, current nutrients (per serving), and user's fix/correction.
Output: JSON only, no markdown, no explanation.

Rules:
- If user says quantity (e.g. "3 eggs", "2 servings", "half"), multiply all nutrients by that factor.
- If user corrects the food (e.g. "it was chicken not beef"), update title and nutrients accordingly.
- Round numbers: energy_kcal, proteins, carbs, fat, sugars to integers; sodium_mg to integer.
- Always return all nutrient keys: energy_kcal, proteins, carbs, fat, sugars, sodium_mg.
- Use null for unknown values; otherwise provide a number.
- Update the "name" field to reflect the correction (e.g. "Egg, whole, cooked, hard-boiled (x3)").
- Be conservative: if unclear, scale proportionally or keep original.'''

    user_prompt = f'''Original title: {title}

Current nutrients:
{nutrients_str}

User fix: {user_fix}

Return JSON: {{"name": "...", "energy_kcal": N, "proteins": N, "carbs": N, "fat": N, "sugars": N, "sodium_mg": N}}'''

    content = None
    provider_errors = []

    if gemini_key:
        try:
            content = _generate_with_gemini(system_prompt, user_prompt, gemini_key)
            logger.info('Fix results: Gemini succeeded')
        except Exception as e:
            err_msg = str(e) if str(e) else 'Gemini request failed'
            logger.warning('Gemini fix failed: %s', e)
            provider_errors.append(f'Gemini: {err_msg}')

    if content is None and openai_key:
        try:
            content = _generate_with_openai(system_prompt, user_prompt, openai_key)
            logger.info('Fix results: OpenAI succeeded')
        except Exception as e:
            err_msg = str(e) if str(e) else 'OpenAI request failed'
            logger.warning('OpenAI fix failed: %s', e)
            provider_errors.append(f'OpenAI: {err_msg}')

    if content is None:
        if provider_errors:
            return None, ' | '.join(provider_errors)
        return None, 'AI processing failed. Check API keys and quota.'

    try:
        content = _strip_json_fences(content)
        data = json.loads(content)
        # Validate and normalize; use LLM output or fall back to original
        def safe_val(v, orig):
            if v is None:
                return round(float(orig)) if orig is not None else 0
            try:
                return round(float(v))
            except (TypeError, ValueError):
                return round(float(orig)) if orig is not None else 0

        result = {
            'name': str(data.get('name', title))[:255],
            'energy_kcal': safe_val(data.get('energy_kcal'), nutrients.get('energy_kcal')),
            'proteins': safe_val(data.get('proteins'), nutrients.get('proteins')),
            'carbs': safe_val(data.get('carbs'), nutrients.get('carbs')),
            'fat': safe_val(data.get('fat'), nutrients.get('fat')),
            'sugars': safe_val(data.get('sugars'), nutrients.get('sugars')),
            'sodium_mg': safe_val(data.get('sodium_mg'), nutrients.get('sodium_mg')),
        }
        return result, None
    except json.JSONDecodeError as e:
        logger.error('Fix food results JSON parse failed: %s', e)
        return None, 'Could not parse AI response. Try a simpler correction.'
    except Exception as e:
        logger.error('Fix food results failed: %s', e)
        return None, str(e) if str(e) else 'AI processing failed. Try again.'
