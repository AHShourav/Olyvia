from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from accounts.models import FoodLog, UserProfile
from accounts.services.coach_chat import build_coach_context
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_coach_context_includes_logged_meal():
    user = User.objects.create_user('coach@example.com', 'password123')
    UserProfile.objects.create(
        user=user,
        onboarding_completed=True,
        goal_primary='reduce_sugar',
        health_conditions=['diabetes'],
    )
    FoodLog.objects.create(
        user=user,
        food_name='Greek yogurt',
        source='manual',
        nutrients={'energy_kcal': 97, 'sugars': 3.2, 'proteins': 9},
    )
    context = build_coach_context(user)
    assert 'Greek yogurt' in context
    assert 'reduce_sugar' in context
    assert 'diabetes' in context


@pytest.mark.django_db
def test_coach_chat_returns_mocked_reply():
    user = User.objects.create_user('coach2@example.com', 'password123')
    UserProfile.objects.create(user=user, onboarding_completed=True)
    client = APIClient()
    client.force_authenticate(user=user)
    with patch(
        'accounts.services.coach_chat.generate_coach_reply',
        return_value=('Sugar is moderate in the meals you logged.', 'gemini'),
    ):
        response = client.post(
            '/api/auth/coach-chat/',
            {'messages': [{'role': 'user', 'content': 'How is my sugar?'}]},
            format='json',
        )
    assert response.status_code == 200
    body = response.json()
    assert body['provider'] == 'gemini'
    assert 'Sugar is moderate' in body['reply']


@pytest.mark.django_db
def test_food_insight_returns_mocked_insight():
    user = User.objects.create_user('insight@example.com', 'password123')
    UserProfile.objects.create(
        user=user,
        onboarding_completed=True,
        diet_preferences=['vegetarian'],
        health_conditions=['hypertension'],
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with patch(
        'accounts.services.coach_chat.generate_coach_reply',
        return_value=('Sodium is high for your blood pressure goal; try half a portion.', 'gemini'),
    ):
        response = client.post(
            '/api/auth/food-insight/',
            {
                'name': 'Deli sandwich',
                'nutrients': {'sodium_mg': 980, 'energy_kcal': 420},
                'verdict': 'caution',
                'verdict_label': 'Caution',
                'verdict_reason': 'High sodium',
            },
            format='json',
        )
    assert response.status_code == 200
    body = response.json()
    assert body['provider'] == 'gemini'
    assert 'Sodium is high' in body['insight']


@pytest.mark.django_db
def test_coach_chat_rejects_empty_thread():
    user = User.objects.create_user('coach3@example.com', 'password123')
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post('/api/auth/coach-chat/', {'messages': []}, format='json')
    assert response.status_code == 400
