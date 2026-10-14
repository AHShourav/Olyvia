"""
Resolve Vision API labels to food items and nutrition via USDA / OpenFoodFacts.

Flow:
  1. Vision API detects labels (e.g. "chicken salad", "Oreo")
  2. For each food-like label, lookup_nutrition_for_food() is called
  3. Lookup: branded products -> OFF first, then USDA fallback
             generic foods -> USDA first, then OFF fallback
  4. If both fail, simplified query (e.g. "cheeseburger" from "McDonalds cheeseburger")
     is tried with USDA then OFF
"""

import logging
import re
from typing import Optional

from .voice_pipeline import lookup_nutrition_for_food

logger = logging.getLogger(__name__)

# Category words. They confirm the picture is food, but they are not a dish name.
GENERIC_FOOD_LABELS = {
    "food", "dish", "cuisine", "meal", "recipe", "ingredient",
    "fruit", "vegetable", "meat", "dairy", "grain", "bread",
    "breakfast", "lunch", "dinner", "snack", "dessert",
    "fast food", "junk food", "comfort food", "side dish",
    "staple food", "produce", "finger food", "fried food",
}

FOOD_WORDS = {
    "salad", "pizza", "pasta", "rice", "soup", "sandwich",
    "burger", "hamburger", "cheeseburger", "fries", "chicken",
    "beef", "steak", "fish", "egg", "cheese", "apple", "banana",
}
SKIP_LABELS = {
    "person", "people", "hand", "face", "finger", "table",
    "furniture", "indoor", "outdoor", "room", "kitchen",
    "plate", "bowl", "cutlery", "spoon", "fork", "knife",
    "tableware", "ceramic", "glass", "container",
}

# Min score to consider a label
MIN_LABEL_SCORE = 0.5


def _is_food_like(description: str) -> bool:
    """Heuristic: does this label look like a food/dish?"""
    d = description.lower().strip()
    if not d or len(d) < 2:
        return False
    if d in SKIP_LABELS or d in GENERIC_FOOD_LABELS:
        return False
    if re.match(r"^[a-z0-9][a-z0-9 '\-]+$", d) and len(d) >= 3:
        return True
    return False


def _normalize_label(desc: str) -> str:
    """Clean label for search: strip, truncate, allow only safe chars."""
    s = (desc or "").strip()[:80]
    if not s:
        return ""
    # Allow alphanumeric, spaces, hyphens, apostrophes
    s = re.sub(r"[^\w\s\-']", "", s, flags=re.IGNORECASE)
    return s.strip()


def select_food_queries(labels: list[dict]) -> list[str]:
    """Pick dish names from Vision labels. Skip category words like Food or Meal."""
    ranked = []
    for label in labels:
        if label.get("score", 0) < MIN_LABEL_SCORE:
            continue
        desc = _normalize_label(label.get("description", ""))
        key = desc.lower()
        if not desc or key in GENERIC_FOOD_LABELS or key in SKIP_LABELS:
            continue
        if not _is_food_like(desc):
            continue
        words = set(key.split())
        boost = 0.35 if words & FOOD_WORDS else 0
        ranked.append((label.get("score", 0) + boost, desc))
    ranked.sort(key=lambda item: item[0], reverse=True)
    queries = []
    seen = set()
    for _, desc in ranked:
        if desc.lower() in seen:
            continue
        seen.add(desc.lower())
        queries.append(desc)
        if len(queries) == 5:
            break
    return queries


def resolve_labels_to_nutrition(labels: list[dict]) -> list[dict]:
    """
    Resolve Vision labels to nutrition data.
    Uses specific dish labels such as Hamburger, and ignores the generic Food label.
    """
    nutrition = []

    for desc in select_food_queries(labels):
        data = lookup_nutrition_for_food(desc)
        if not data:
            continue
        resolved_name = (data.get("name") or "").strip().lower()
        if resolved_name in GENERIC_FOOD_LABELS:
            continue
        data["query"] = desc
        data["confidence"] = next(
            (label.get("score", 0) for label in labels if (label.get("description") or "").strip().lower() == desc.lower()),
            0,
        )
        nutrition.append(data)
        logger.info("Resolved label %r -> %s", desc, data.get("name"))

    return nutrition
