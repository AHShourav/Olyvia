"""Nutrition coach chat powered by Gemini."""

import logging
from datetime import timedelta

from django.utils import timezone

from accounts.models import FoodLog, UserProfile
from accounts.services.nutrition_summary import get_nutrition_summary
from accounts.services.stats_dashboard import get_health_risk, get_insights, get_trend_data
from products.services.gemini_client import (
    chat_text,
    public_provider_error,
    require_gemini_api_key,
)

logger = logging.getLogger(__name__)
MAX_MESSAGES = 12
MAX_MESSAGE_CHARS = 1500

SYSTEM_PROMPT = '''You are Olyvia, a nutrition coach inside a food-logging app.

Use only the profile, meals, and stats in the context. Do not invent foods, numbers, or diagnoses.
If a meal was not logged, say so. You are not a doctor. Do not give medical treatment advice.
Keep replies to a short paragraph or a few bullets. Be specific about their sugar, sodium, protein, and goals.
If they ask something unrelated to eating, bring the answer back to their logged intake.'''

FOOD_INSIGHT_SYSTEM = '''You are Olyvia, a nutrition coach inside a food-logging app.

The app already computed a deterministic verdict (Good, Caution, or Avoid) from the user's diet, health conditions, and nutrient rules. Your job is to explain that verdict for THIS specific food in plain language for THIS user.

Use their diet preferences, health conditions, goals, and today's intake when relevant. Give one practical suggestion (portion, swap, or what to pair it with). Do not contradict the verdict label. You are not a doctor. Keep it to 2-4 short sentences.'''


def build_coach_context(user) -> str:
    today = timezone.localdate()
    summary = get_nutrition_summary(user, today)
    risk = get_health_risk(user, today)
    trend = get_trend_data(user, 7)
    insights = get_insights(user, summary, trend, risk)
    profile = _profile_lines(user)
    meals = _recent_meals(user)

    parts = [
        'Profile:',
        profile or 'No profile saved yet.',
        '',
        f'Today ({today.isoformat()}) totals:',
        (
            f"calories {summary.get('energy_kcal', 0)}, "
            f"protein {summary.get('proteins', 0)}g, "
            f"carbs {summary.get('carbs', 0)}g, "
            f"fat {summary.get('fat', 0)}g, "
            f"sugar {summary.get('sugars', 0)}g, "
            f"sodium {summary.get('sodium', 0)}mg"
        ),
        '',
        f"Health risk: {risk.get('level', 'unknown')}. {risk.get('message', '')}".strip(),
    ]
    violations = risk.get('violations') or []
    if violations:
        parts.append('Rule hits: ' + '; '.join(
            f"{v.get('rule_type', 'rule')} ({v.get('severity', '')})" for v in violations[:5]
        ))
    if insights:
        parts.append('Calculated notes: ' + ' '.join(insights))
    parts.append('')
    parts.append('Recent logged meals:')
    parts.append(meals or 'None logged in the last 7 days.')
    return '\n'.join(parts)


def food_insight_for_item(user, food: dict) -> tuple[str, str]:
    """Personalized AI explanation for one logged or scanned food item."""
    name = (food.get('name') or food.get('food_name') or '').strip()
    if not name:
        raise ValueError('Food name is required.')

    nutrients = food.get('nutrients') or food
    if not isinstance(nutrients, dict):
        nutrients = {}

    today = timezone.localdate()
    summary = get_nutrition_summary(user, today)
    profile = _profile_lines(user)
    nutrient_bits = []
    for key, label in (
        ('energy_kcal', 'kcal'),
        ('proteins', 'g protein'),
        ('carbs', 'g carbs'),
        ('fat', 'g fat'),
        ('sugars', 'g sugar'),
        ('sodium_mg', 'mg sodium'),
    ):
        val = nutrients.get(key)
        if val is not None:
            nutrient_bits.append(f'{label}: {val}')

    user_prompt = '\n'.join([
        f'Food: {name}',
        'Nutrients (this serving): ' + (', '.join(nutrient_bits) or 'unknown'),
        f"App verdict: {food.get('verdict_label') or 'Good'} ({food.get('verdict') or 'safe'})",
        f"Rules reason: {food.get('verdict_reason') or 'No specific rule message.'}",
        '',
        f"User profile:\n{profile or 'No profile saved.'}",
        '',
        (
            f"Today's totals so far: "
            f"{summary.get('energy_kcal', 0)} kcal, "
            f"{summary.get('proteins', 0)}g protein, "
            f"{summary.get('sugars', 0)}g sugar, "
            f"{summary.get('sodium', 0)}mg sodium"
        ),
        '',
        'Write the personalized AI insight for this user and this food.',
    ])

    system = FOOD_INSIGHT_SYSTEM
    text, provider = generate_coach_reply(system, [{'role': 'user', 'content': user_prompt}])
    return text, provider


def reply_to_coach(user, messages: list[dict]) -> tuple[str, str]:
    cleaned = _clean_messages(messages)
    if not cleaned or cleaned[-1]['role'] != 'user':
        raise ValueError('Send a user message.')

    system = SYSTEM_PROMPT + '\n\nContext:\n' + build_coach_context(user)
    text, provider = generate_coach_reply(system, cleaned)
    return text, provider


def generate_coach_reply(system_prompt: str, messages: list[dict]) -> tuple[str, str]:
    require_gemini_api_key()
    try:
        return chat_text(system_prompt, messages, temperature=0.4, timeout=25), 'gemini'
    except Exception as exc:
        logger.warning('Coach Gemini failed: %s', exc)
        raise RuntimeError(public_provider_error('Gemini', exc)) from exc


def _clean_messages(messages: list[dict]) -> list[dict]:
    if not isinstance(messages, list):
        raise ValueError('messages must be a list.')
    cleaned = []
    for item in messages[-MAX_MESSAGES:]:
        if not isinstance(item, dict):
            continue
        role = item.get('role')
        content = (item.get('content') or '').strip()
        if role not in ('user', 'assistant') or not content:
            continue
        cleaned.append({'role': role, 'content': content[:MAX_MESSAGE_CHARS]})
    return cleaned


def _profile_lines(user) -> str:
    try:
        profile = user.profile
    except UserProfile.DoesNotExist:
        return ''
    lines = []
    if profile.goal_primary:
        lines.append(f'Goal: {profile.goal_primary}')
    if profile.goal_commitment:
        lines.append(f'Commitment: {profile.goal_commitment}')
    if profile.health_conditions:
        lines.append('Conditions: ' + ', '.join(profile.health_conditions))
    if profile.diet_preferences:
        lines.append('Diet: ' + ', '.join(profile.diet_preferences))
    if profile.nutrition_rules:
        lines.append(f'Nutrition rules: {profile.nutrition_rules}')
    if profile.condition_rules:
        lines.append(f'Condition rules: {profile.condition_rules}')
    return '\n'.join(lines)


def _recent_meals(user) -> str:
    since = timezone.now() - timedelta(days=7)
    logs = FoodLog.objects.filter(user=user, logged_at__gte=since).order_by('-logged_at')[:12]
    lines = []
    for log in logs:
        nutrients = log.nutrients or {}
        bits = []
        for key, label in (
            ('energy_kcal', 'kcal'),
            ('proteins', 'g protein'),
            ('sugars', 'g sugar'),
            ('sodium_mg', 'mg sodium'),
        ):
            value = nutrients.get(key)
            if value is not None:
                bits.append(f'{value} {label}')
        detail = ', '.join(bits) if bits else 'no nutrients stored'
        when = timezone.localtime(log.logged_at).strftime('%Y-%m-%d %H:%M')
        lines.append(f'- {when} {log.food_name}: {detail}')
    return '\n'.join(lines)
