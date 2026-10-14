from products.services.rules_engine import evaluate


def test_vegetarian_rejects_hamburger():
    result = evaluate(
        {'sugars': 4, 'sodium_mg': 400, 'carbs': 30, 'proteins': 15},
        {'diet_preferences': ['vegetarian']},
        'Hamburger, NFS',
    )
    assert result['verdict'] == 'avoid'
    assert 'meat' in result['reason']


def test_none_does_not_flag_hamburger():
    result = evaluate(
        {'sugars': 4, 'sodium_mg': 400, 'carbs': 30, 'proteins': 15},
        {'diet_preferences': ['none']},
        'Hamburger, NFS',
    )
    assert result['verdict'] == 'safe'


def test_keto_flags_high_carbs():
    result = evaluate(
        {'carbs': 27, 'proteins': 1, 'sugars': 14},
        {'diet_preferences': ['keto']},
        'Banana',
    )
    assert result['verdict'] == 'avoid'
    assert 'keto' in result['reason']
