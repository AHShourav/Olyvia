"""Shared demo account so a reviewer can open the app without signing up."""

from datetime import timedelta

from django.utils import timezone

from accounts.models import CustomUser, FoodLog, UserProfile

DEMO_EMAIL = 'demo@olyvia.app'

DEMO_FOODS = [
    {
        'food_name': 'Greek yogurt',
        'days_ago': 0,
        'nutrients': {
            'energy_kcal': 97,
            'proteins': 9.0,
            'carbs': 3.6,
            'fat': 5.0,
            'sugars': 3.2,
            'sodium_mg': 36,
        },
    },
    {
        'food_name': 'Banana',
        'days_ago': 0,
        'nutrients': {
            'energy_kcal': 105,
            'proteins': 1.3,
            'carbs': 27.0,
            'fat': 0.4,
            'sugars': 14.0,
            'sodium_mg': 1,
        },
    },
    {
        'food_name': 'Grilled chicken',
        'days_ago': 1,
        'nutrients': {
            'energy_kcal': 165,
            'proteins': 31.0,
            'carbs': 0.0,
            'fat': 3.6,
            'sugars': 0.0,
            'sodium_mg': 74,
        },
    },
    {
        'food_name': 'Oatmeal',
        'days_ago': 1,
        'nutrients': {
            'energy_kcal': 150,
            'proteins': 5.0,
            'carbs': 27.0,
            'fat': 2.5,
            'sugars': 1.0,
            'fiber': 4.0,
            'sodium_mg': 2,
        },
    },
]


def get_or_create_demo_user():
    user, created = CustomUser.objects.get_or_create(
        email=DEMO_EMAIL,
        defaults={'full_name': 'Olyvia Demo'},
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=['password'])

    profile, _ = UserProfile.objects.get_or_create(user=user)
    if not profile.onboarding_completed:
        profile.goal_primary = 'reduce_sugar'
        profile.goal_commitment = 'exploring'
        profile.health_conditions = ['diabetes']
        profile.condition_rules = [
            {'condition': 'diabetes', 'sugar_strictness': 'moderate'},
        ]
        profile.nutrition_rules = [
            {'type': 'sugar', 'strictness': 'moderate'},
        ]
    profile.onboarding_completed = True
    profile.save()
    _seed_food_logs(user)
    return user


def _seed_food_logs(user):
    if FoodLog.objects.filter(user=user).exists():
        return
    now = timezone.now()
    for item in DEMO_FOODS:
        log = FoodLog.objects.create(
            user=user,
            food_name=item['food_name'],
            source='manual',
            nutrients=item['nutrients'],
        )
        FoodLog.objects.filter(pk=log.pk).update(
            logged_at=now - timedelta(days=item['days_ago']),
        )
