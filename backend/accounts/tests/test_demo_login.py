import pytest
from django.contrib.auth import get_user_model

from accounts.models import FoodLog

User = get_user_model()


@pytest.mark.django_db
def test_demo_login_skips_onboarding_and_seeds_meals(client):
    response = client.post('/api/auth/demo/')
    assert response.status_code == 200
    body = response.json()
    assert body['user']['email'] == 'demo@olyvia.app'
    assert body['profile']['onboarding_completed'] is True
    assert body['tokens']['access']
    user = User.objects.get(email='demo@olyvia.app')
    assert FoodLog.objects.filter(user=user).count() == 4

    again = client.post('/api/auth/demo/')
    assert again.status_code == 200
    assert FoodLog.objects.filter(user=user).count() == 4
