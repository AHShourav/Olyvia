"""
Voice input pipeline: Gemini transcription -> food extraction -> USDA/OFF nutrition lookup.

Security: input sanitization, output validation, prompt injection mitigation.
"""

import logging
import re
from typing import Optional

from .gemini_client import extract_food_names, transcribe_audio
from .openfoodfacts import fetch_product, search_products
from .normalize import normalize as normalize_off
from .usda import search_foods, get_food
from .normalize_usda import normalize_usda_food

logger = logging.getLogger(__name__)

# Max lengths to limit abuse
MAX_TRANSCRIPT_LEN = 2000
MAX_FOOD_QUERY_LEN = 100
MAX_FOODS_EXTRACTED = 10

# Dangerous patterns (prompt injection, SQL-like, etc.)
DANGEROUS_PATTERNS = re.compile(
    r'(ignore\s+(previous|above|all)|system\s*:|assistant\s*:|user\s*:|'
    r'<\s*script|javascript:|on\w+\s*=|'
    r'(drop|delete|insert|update|alter|exec)\s+(table|database)|'
    r';\s*--|\'\s*;\s*--|/\*|\*/)',
    re.IGNORECASE,
)


def _sanitize_text(text: str, max_len: int = MAX_TRANSCRIPT_LEN) -> str:
    """Sanitize user input: strip, truncate, remove dangerous patterns."""
    if not text or not isinstance(text, str):
        return ''
    text = text.strip()[:max_len]
    if DANGEROUS_PATTERNS.search(text):
        logger.warning('Blocked potentially dangerous input pattern')
        return ''
    return text


def _extract_foods_with_llm(transcript: str) -> list[str]:
    """Extract food names from transcript using Gemini."""
    foods = extract_food_names(
        transcript,
        max_foods=MAX_FOODS_EXTRACTED,
        max_query_len=MAX_FOOD_QUERY_LEN,
    )
    if foods:
        return foods
    return _extract_foods_fallback(transcript)


def _extract_foods_fallback(transcript: str) -> list[str]:
    """Simple fallback: treat whole transcript as one search query if short enough."""
    t = transcript.strip()[:MAX_FOOD_QUERY_LEN]
    if t and re.match(r'^[\w\s\-\.]+$', t, re.IGNORECASE):
        return [t]
    return []


# Query word -> description words that mean a different food.
_FOOD_OPPOSITES = {
    'beef': {'veggie', 'vegetarian', 'vegan', 'plant', 'chicken', 'turkey', 'fish', 'salmon', 'shrimp', 'pork', 'bean', 'lentil', 'mushroom'},
    'burger': {'veggie', 'vegetarian', 'vegan', 'plant'},
    'hamburger': {'veggie', 'vegetarian', 'vegan', 'plant', 'chicken', 'turkey', 'fish'},
    'chicken': {'beef', 'pork', 'turkey', 'fish', 'salmon', 'veggie', 'vegetarian', 'vegan'},
    'pork': {'beef', 'chicken', 'turkey', 'fish', 'veggie', 'vegetarian'},
    'turkey': {'beef', 'chicken', 'pork', 'fish'},
    'fish': {'beef', 'chicken', 'pork', 'turkey', 'veggie'},
    'salmon': {'beef', 'chicken', 'pork', 'turkey'},
}

_NOISE_WORDS = {'relish', 'sauce', 'seasoning', 'ingredient', 'fries', 'rings', 'spice'}
_BRANDS = ('burger king', 'mcdonald', "mcdonald's", 'wendy', 'kfc', 'whopper')


def _food_words(text: str) -> list[str]:
    return re.findall(r'[a-z0-9]+', (text or '').lower())


def _word_in_description(word: str, desc_words: set[str]) -> bool:
    if word in desc_words:
        return True
    return any(word in token or token in word for token in desc_words if len(token) >= 4 and len(word) >= 4)


def pick_best_usda_food(query: str, foods: list[dict]) -> Optional[dict]:
    """Choose the USDA hit whose name matches the query, not the first hit."""
    query_words = [w for w in _food_words(query) if w not in {'a', 'an', 'the', 'with', 'and', 'on', 'of'}]
    if not query_words or not foods:
        return None
    query_text = query.lower()
    best = None
    best_score = 0
    for food in foods:
        description = food.get('description') or ''
        desc_words = set(_food_words(description))
        if not desc_words:
            continue
        score = 0
        for word in query_words:
            if _word_in_description(word, desc_words):
                score += 12
            elif word == 'beef' and _word_in_description('hamburger', desc_words):
                score += 12
            else:
                score -= 8
        desc_text = description.lower()
        for word in query_words:
            opposites = _FOOD_OPPOSITES.get(word, set())
            if desc_words & opposites and word not in desc_words:
                score -= 100
        query_word_set = set(query_words)
        wants_french_fries = 'french' in query_word_set and ('fry' in query_word_set or 'fries' in query_word_set)
        if wants_french_fries:
            if 'french' in desc_words or 'fries' in desc_words:
                score += 30
            if 'seasoning' in desc_words or ('sauce' in desc_words and 'fries' not in desc_words):
                score -= 60
            if 'sticks' in desc_words and 'fries' not in desc_words:
                score -= 50
        elif desc_words & _NOISE_WORDS and not (query_word_set & _NOISE_WORDS):
            score -= 40
        if ('cheese' in desc_words or 'cheeseburger' in desc_text) and 'cheese' not in query_words and 'cheeseburger' not in query_text:
            score -= 15
        if any(brand in desc_text and brand not in query_text for brand in _BRANDS):
            score -= 20
        if ', nfs' in desc_text:
            score += 10
        if score > best_score:
            best = food
            best_score = score
    return best


def _usda_search_queries(query: str) -> list[str]:
    words = set(_food_words(query))
    queries = [query]
    if {'beef', 'burger'} <= words:
        queries.append('hamburger')
    # USDA search ranks "french fries" (plural) far better than singular "french fry".
    if 'french' in words and ('fry' in words or 'fries' in words):
        queries.append('french fries')
    return queries


def _lookup_usda(query: str) -> Optional[dict]:
    """Search USDA and keep the result that matches the query words."""
    foods = []
    seen = set()
    for search_query in _usda_search_queries(query):
        result = search_foods(search_query, page_size=15, page_number=1)
        for food in (result or {}).get('foods') or []:
            fdc_id = food.get('fdcId')
            if fdc_id in seen:
                continue
            seen.add(fdc_id)
            foods.append(food)
    chosen = pick_best_usda_food(query, foods)
    if not chosen:
        return None
    fdc_id = chosen.get('fdcId')
    if not fdc_id:
        return normalize_usda_food(chosen)
    raw = get_food(fdc_id)
    if raw:
        return normalize_usda_food(raw)
    return normalize_usda_food(chosen)


def _lookup_off(query: str) -> Optional[dict]:
    """Try OpenFoodFacts search. Return first matching product or None."""
    products = search_products(query, page_size=5)
    for p in products:
        if not p.get('product_name'):
            continue
        # OFF search returns products; ensure we have nutriments for normalize
        if not p.get('nutriments') and p.get('code'):
            # Fetch full product by barcode for complete nutrition
            full = fetch_product(p['code'])
            if full:
                p = full
        data = normalize_off(p)
        if data.get('name'):
            return data
    return None


# Generic whole foods – USDA is preferred; don't treat as branded
GENERIC_FOODS = frozenset({
    "apple", "apples", "banana", "bread", "rice", "pasta", "pizza", "salad",
    "chicken", "beef", "fish", "milk", "egg", "eggs", "cheese", "yogurt",
    "oatmeal", "cereal", "soup", "sandwich", "burger", "cheeseburger",
    "salmon", "tuna", "broccoli", "carrot", "potato", "tomato", "onion",
})

def _looks_branded(query: str) -> bool:
    """
    Heuristic: does this query look like a branded/packaged product?
    USDA focuses on generic/whole foods; OFF has branded products.
    """
    q = (query or "").strip()
    if not q or len(q) < 2:
        return False
    q_lower = q.lower()
    first_word = q_lower.split()[0] if q_lower.split() else ""
    if first_word in GENERIC_FOODS:
        return False
    # Contains apostrophe (McDonald's, Ben & Jerry's)
    if "'" in q or "&" in q:
        return True
    # Common brand prefixes – try OFF first for these
    brand_prefixes = ("mc", "mcdonald", "burger king", "wendy", "kfc", "subway",
                     "coca", "pepsi", "nestle", "kraft", "kellogg", "general mills",
                     "lays", "doritos", "cheetos", "frito", "nabisco", "oreo",
                     "hershey", "mars", "snickers", "twix", "kit kat", "m&m")
    if first_word in brand_prefixes or any(first_word.startswith(p) for p in brand_prefixes):
        return True
    # Single-word product names (Oreo, Doritos) – exclude generic foods above
    if len(q.split()) == 1 and 4 <= len(q) <= 25:
        return True
    return False


def _simplify_query_for_fallback(query: str) -> Optional[str]:
    """
    For branded queries like "McDonalds cheeseburger", extract the food part.
    USDA/OFF often fail on brand+food; generic "cheeseburger" works better.
    """
    q = query.strip().lower()
    if not q or len(q) < 3:
        return None
    # Common brand patterns: "brand food" -> try "food"
    parts = q.split()
    if len(parts) >= 2:
        # Last word(s) often the food; skip first if it looks like a brand (capitalized, short)
        for i in range(1, len(parts)):
            candidate = ' '.join(parts[i:]).strip()
            if len(candidate) >= 3:
                return candidate
    return q


def lookup_nutrition_for_food(query: str) -> Optional[dict]:
    """
    Lookup nutrition: USDA first for generic foods, OFF first for branded products.
    Always falls back to the other source if the primary fails.
    If both fail, retry with simplified query (e.g. "cheeseburger" from "McDonalds cheeseburger").
    Returns Product-compatible dict or None.
    """
    query = _sanitize_text(query, MAX_FOOD_QUERY_LEN)
    if not query:
        return None

    # Branded/packaged products: try OFF first (USDA rarely has them)
    if _looks_branded(query):
        result = _lookup_off(query)
        if result:
            return result
        result = _lookup_usda(query)
        if result:
            return result
    else:
        # Generic foods/dishes: try USDA first, then OFF fallback
        result = _lookup_usda(query)
        if result:
            return result
        result = _lookup_off(query)
        if result:
            return result

    # Fallback: simplify query for branded items (e.g. "McDonalds cheeseburger" -> "cheeseburger")
    simplified = _simplify_query_for_fallback(query)
    if simplified and simplified != query:
        result = _lookup_usda(simplified)
        if result:
            return result
        result = _lookup_off(simplified)
    return result


def process_voice_input(audio_bytes: Optional[bytes] = None, transcript: Optional[str] = None) -> dict:
    """
    Process voice input: transcribe (if audio) or use transcript, extract foods, lookup nutrition.
    Returns dict with transcript, foods, and nutrition results.
    """
    if audio_bytes:
        transcript = _transcribe_audio(audio_bytes)
    transcript = _sanitize_text(transcript or '', MAX_TRANSCRIPT_LEN)
    if not transcript:
        return {'transcript': '', 'foods': [], 'nutrition': [], 'error': 'No valid input'}

    foods = _extract_foods_with_llm(transcript)
    nutrition = []
    for q in foods:
        data = lookup_nutrition_for_food(q)
        if data:
            data['query'] = q
            nutrition.append(data)
            _log_nutrition(data, q)

    # Strip raw_json from response to reduce payload
    for n in nutrition:
        n.pop('raw_json', None)

    return {
        'transcript': transcript,
        'foods': foods,
        'nutrition': nutrition,
    }


def _transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe audio using Gemini."""
    return transcribe_audio(audio_bytes, mime_type='audio/webm')


def _log_nutrition(data: dict, query: str) -> None:
    """Print nutrition to console."""
    name = data.get('name', 'Unknown')
    source = data.get('source', 'unknown')
    print(f'\n--- Nutrition for "{query}" ({name}, source: {source}) ---')
    for k in ['energy_kcal', 'fat', 'saturated_fat', 'sugars', 'salt', 'proteins', 'fiber']:
        v = data.get(k)
        if v is not None:
            unit = 'g' if k != 'energy_kcal' else 'kcal'
            print(f'  {k}: {v} {unit}')
    print('---\n')
