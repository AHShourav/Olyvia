from products.services.food_resolver import select_food_queries


def test_generic_food_label_is_skipped_for_a_burger():
    labels = [
        {"description": "Food", "score": 0.98},
        {"description": "Fast food", "score": 0.9},
        {"description": "Hamburger", "score": 0.72},
        {"description": "Dish", "score": 0.7},
    ]
    assert select_food_queries(labels) == ["Hamburger"]
