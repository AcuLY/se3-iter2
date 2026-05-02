from travel_agent.llm import parse_goal


def test_parse_goal_extracts_city_and_days():
    p = parse_goal("杭州 3 天，预算 3000，偏好美食")
    assert p["city"] == "杭州"
    assert p["days"] == 3
    assert p["budget"] == 3000


def test_parse_goal_defaults():
    p = parse_goal("旅游一下")
    assert p["days"] == 3  # default
    assert p["budget"] is None
