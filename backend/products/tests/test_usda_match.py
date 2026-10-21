from products.services.voice_pipeline import pick_best_usda_food


def test_beef_burger_skips_veggie_and_branded_hits():
    foods = [
        {'fdcId': 1, 'description': 'Veggie burger, on bun', 'dataType': 'Survey (FNDDS)'},
        {'fdcId': 2, 'description': 'Hamburger (Burger King)', 'dataType': 'Survey (FNDDS)'},
        {'fdcId': 3, 'description': 'Cheeseburger (Burger King)', 'dataType': 'Survey (FNDDS)'},
        {'fdcId': 4, 'description': 'Hamburger, NFS', 'dataType': 'Survey (FNDDS)'},
        {'fdcId': 5, 'description': 'Pickle relish, hamburger', 'dataType': 'SR Legacy'},
    ]
    chosen = pick_best_usda_food('beef burger', foods)
    assert chosen['fdcId'] == 4


def test_named_brand_keeps_that_brand():
    foods = [
        {'fdcId': 1, 'description': 'Hamburger, NFS', 'dataType': 'Survey (FNDDS)'},
        {'fdcId': 2, 'description': 'Hamburger (Burger King)', 'dataType': 'Survey (FNDDS)'},
    ]
    chosen = pick_best_usda_food('burger king hamburger', foods)
    assert chosen['fdcId'] == 2


def test_french_fry_prefers_fries_over_sticks_or_seasoning():
    foods = [
        {'fdcId': 1, 'description': 'FRENCH FRY SEASONING, FRENCH FRY', 'dataType': 'Branded'},
        {'fdcId': 2, 'description': 'Potato sticks, fry shaped', 'dataType': 'Survey (FNDDS)'},
        {'fdcId': 3, 'description': 'Potato, french fries, from fresh, fried', 'dataType': 'Survey (FNDDS)'},
        {'fdcId': 4, 'description': 'Fry sauce', 'dataType': 'Survey (FNDDS)'},
    ]
    chosen = pick_best_usda_food('french fry', foods)
    assert chosen['fdcId'] == 3
