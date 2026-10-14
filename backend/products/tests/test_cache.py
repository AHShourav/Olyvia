import pytest
from django.utils import timezone

from products.models import Product
from products.services.cache import cache_product, get_cached_product


@pytest.mark.django_db
def test_cache_product_creates_new_product():
    payload = {
        "barcode": "1111111111111",
        "name": "Fresh Juice",
        "brand": "ACME",
        "image_url": "https://example.com/juice.jpg",
        "nutriscore_grade": "a",
        "nova_group": 1,
        "energy_kcal": 45.0,
        "fat": 0.5,
        "saturated_fat": 0.1,
        "sugars": 9.0,
        "salt": 0.02,
        "proteins": 0.5,
        "fiber": 0.3,
        "ingredients_text": "Orange juice from concentrate",
        "categories": "Beverages",
        "source": "openfoodfacts",
        "raw_json": {"code": "1111111111111"},
    }

    product = cache_product(payload.copy())

    assert Product.objects.count() == 1
    stored = Product.objects.get(barcode="1111111111111")
    assert stored.id == product.id
    assert stored.name == "Fresh Juice"
    assert stored.brand == "ACME"


@pytest.mark.django_db
def test_cache_product_updates_existing_product():
    product = Product.objects.create(
        barcode="2222222222222",
        name="Old Name",
        brand="Old Brand",
    )

    updated_payload = {
        "barcode": "2222222222222",
        "name": "New Name",
        "brand": "New Brand",
        "image_url": "",
        "nutriscore_grade": "",
        "nova_group": None,
        "energy_kcal": None,
        "fat": None,
        "saturated_fat": None,
        "sugars": None,
        "salt": None,
        "proteins": None,
        "fiber": None,
        "ingredients_text": "",
        "categories": "",
        "source": "openfoodfacts",
        "raw_json": {"code": "2222222222222"},
    }

    # Ensure updated_at difference is observable
    before_update = product.updated_at or timezone.now()

    result = cache_product(updated_payload.copy())
    product.refresh_from_db()

    assert result.id == product.id
    assert product.name == "New Name"
    assert product.brand == "New Brand"
    assert product.updated_at >= before_update


@pytest.mark.django_db
def test_get_cached_product_returns_existing_product():
    product = Product.objects.create(
        barcode="3333333333333",
        name="Cached Product",
    )

    found = get_cached_product("3333333333333")
    assert found is not None
    assert found.id == product.id


@pytest.mark.django_db
def test_get_cached_product_returns_none_for_missing():
    assert get_cached_product("0000000000000") is None
