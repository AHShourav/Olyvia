"""
Fix food results pipeline: Gemini adjusts title and nutrients based on user correction.

Uses GEMINI_API_KEY with Gemini Flash. Examples:
- "i ate 3 eggs" -> multiply nutrients by 3, title "Egg, whole, cooked, hard-boiled (x3)"
- "half portion" -> multiply by 0.5
"""

import json
import logging
import re
from typing import Optional

from products.services.gemini_client import generate_text, require_gemini_api_key, strip_json_fences

logger = logging.getLogger(__name__)

MAX_FIX_LEN = 500

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


def fix_food_results(title: str, nutrients: dict, user_fix: str) -> tuple[Optional[dict], Optional[str]]:
    """Use Gemini to adjust title and nutrients from a user correction."""
    user_fix = _sanitize(user_fix)
    if not user_fix:
        return None, 'Please provide a correction (e.g. "I ate 3 eggs").'

    try:
        require_gemini_api_key()
    except RuntimeError as exc:
        return None, str(exc)

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

    try:
        content = generate_text(system_prompt, user_prompt, temperature=0)
        logger.info('Fix results: Gemini succeeded')
    except Exception as e:
        err_msg = str(e) if str(e) else 'Gemini request failed'
        logger.warning('Gemini fix failed: %s', e)
        return None, f'Gemini: {err_msg}'

    try:
        content = strip_json_fences(content)
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
