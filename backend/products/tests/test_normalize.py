import pytest

from products.services.normalize import normalize


@pytest.fixture
def raw_product():
    return {
        "code": "1234567890123",
        "product_name": "Test Cereal",
        "brands": "ACME",
        "image_url": "https://example.com/image.jpg",
        "nutriscore_grade": "b",
        "nova_group": 3,
        "ingredients_text": "Sugar, Corn",
        "categories": "Cereals",
        "nutriments": {
            "energy-kcal_100g": 380.0,
            "fat_100g": 5.0,
            "saturated-fat_100g": 1.0,
            "sugars_100g": 20.0,
            "salt_100g": 0.8,
            "proteins_100g": 8.0,
            "fiber_100g": 4.0,
        },
    }


def test_normalize_maps_basic_fields(raw_product):
    data = normalize(raw_product)

    assert data["barcode"] == raw_product["code"]
    assert data["name"] == raw_product["product_name"]
    assert data["brand"] == raw_product["brands"]
    assert data["image_url"] == raw_product["image_url"]
    assert data["nutriscore_grade"] == raw_product["nutriscore_grade"]
    assert data["nova_group"] == raw_product["nova_group"]
    assert data["ingredients_text"] == raw_product["ingredients_text"]
    assert data["categories"] == raw_product["categories"]
    assert data["source"] == "openfoodfacts"


def test_normalize_flattens_nutriments(raw_product):
    data = normalize(raw_product)
    nutriments = raw_product["nutriments"]

    assert data["energy_kcal"] == nutriments["energy-kcal_100g"]
    assert data["fat"] == nutriments["fat_100g"]
    assert data["saturated_fat"] == nutriments["saturated-fat_100g"]
    assert data["sugars"] == nutriments["sugars_100g"]
    assert data["salt"] == nutriments["salt_100g"]
    assert data["proteins"] == nutriments["proteins_100g"]
    assert data["fiber"] == nutriments["fiber_100g"]


def test_normalize_handles_missing_optional_fields():
    # Minimal payload – ensure defaults and missing keys don't explode
    raw = {
        "code": "9999999999999",
        "nutriments": {},
    }

    data = normalize(raw)

    # Required key should always be present
    assert data["barcode"] == "9999999999999"

    # Optional strings default to empty rather than None
    assert data["name"] == ""
    assert data["brand"] == ""
    assert data["image_url"] == ""
    assert data["nutriscore_grade"] == ""
    assert data["categories"] == ""

    # Numeric nutriments may be None when missing
    assert data["energy_kcal"] is None
    assert data["fat"] is None
    assert data["saturated_fat"] is None
    assert data["sugars"] is None
    assert data["salt"] is None
    assert data["proteins"] is None
    assert data["fiber"] is None

    # Raw JSON always echoes the original dict
    assert data["raw_json"] == raw


# --- Sodium conversion edge cases ---

def test_normalize_sodium_none_skips_conversion():
    raw = {"nutriments": {"sodium_100g": None}}
    out = normalize(raw)
    assert out["sodium_mg"] is None


def test_normalize_sodium_zero_stays_zero_mg():
    raw = {"nutriments": {"sodium_100g": 0.0}}
    out = normalize(raw)
    assert out["sodium_mg"] == 0.0


def test_normalize_large_sodium_value():
    raw = {"nutriments": {"sodium_100g": 5.0}}
    out = normalize(raw)
    assert out["sodium_mg"] == 5000.0


def test_normalize_negative_sodium_passes_through():
    """Unusual but ensures no crash; data quality is upstream."""
    raw = {"nutriments": {"sodium_100g": -0.001}}
    out = normalize(raw)
    assert out["sodium_mg"] == -1.0
