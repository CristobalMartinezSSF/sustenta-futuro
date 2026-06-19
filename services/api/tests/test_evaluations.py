"""Unit tests for evaluation historical-suggestion helpers (offline)."""

from __future__ import annotations

from app.routers.evaluations import _compute_suggestions, _median_num, _most_common


def test_median_and_mode_helpers_ignore_missing():
    assert _median_num([10, None, 20, 30]) == 20.0
    assert _median_num([None, "x", []]) is None
    assert _most_common(["a", "a", "b", None]) == "a"
    assert _most_common([None, ""]) is None


def test_compute_suggestions_medians_over_snapshots():
    evals = [
        {"client_price": 100, "internal_cost": 40, "estimated_hours": 80,
         "monthly_maintenance": 10, "complexity": "medium", "price_currency": "UF"},
        {"client_price": 200, "internal_cost": 60, "estimated_hours": 120,
         "monthly_maintenance": 20, "complexity": "high", "price_currency": "UF"},
        {"client_price": 300, "internal_cost": 80, "estimated_hours": 100,
         "monthly_maintenance": None, "complexity": "high", "price_currency": "CLP"},
    ]
    s = _compute_suggestions(evals, "Chatbots")

    assert s.service_type == "Chatbots"
    assert s.sample_size == 3
    assert s.client_price == 200.0          # median of 100/200/300
    assert s.internal_cost == 60.0
    assert s.estimated_hours == 100          # int, median of 80/120/100
    assert s.monthly_maintenance == 15.0     # median of present 10/20
    assert s.complexity == "high"            # most common
    assert s.price_currency == "UF"          # most common


def test_compute_suggestions_empty_returns_zero_sample():
    s = _compute_suggestions([], "Automatizaciones")
    assert s.sample_size == 0
    assert s.service_type == "Automatizaciones"
    assert s.client_price is None
