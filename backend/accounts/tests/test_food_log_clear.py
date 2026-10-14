import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import FoodLog

User = get_user_model()


@pytest.mark.django_db
def test_clear_food_logs_for_date():
    user = User.objects.create_user('clear@example.com', 'password123')
    today = timezone.localdate()
    FoodLog.objects.create(user=user, food_name='Apple', source='manual', nutrients={'energy_kcal': 95})
    FoodLog.objects.create(user=user, food_name='Old', source='manual', nutrients={'energy_kcal': 1})
    old = FoodLog.objects.filter(user=user).order_by('id').last()
    old.logged_at = timezone.now() - timezone.timedelta(days=3)
    old.save(update_fields=['logged_at'])

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.delete(f'/api/auth/food-log/?date={today.isoformat()}')
    assert response.status_code == 200
    assert response.json()['deleted'] >= 1
    assert FoodLog.objects.filter(user=user, logged_at__date=today).count() == 0
    assert FoodLog.objects.filter(user=user).count() == 1
