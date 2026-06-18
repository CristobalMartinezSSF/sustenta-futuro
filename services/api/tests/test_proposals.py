"""Unit tests for proposal versioning helpers (offline)."""

from __future__ import annotations

from app.routers.proposals import _build_snapshot


def test_build_snapshot_freezes_evaluation_notes_and_lead():
    lead = {
        "full_name": "Paul",
        "company": "HCMFront",
        "email": "paul@example.com",
        "phone": "+569",  # extra lead field must NOT leak into the snapshot
    }
    evaluation = {"id": "e1", "project_title": "Bot", "client_price": 100}
    notes = [
        {"content": "n1", "created_at": "2026-01-01", "created_by": "u1", "extra": 1},
        {"content": "n2", "created_at": "2026-01-02", "created_by": None},
    ]

    snap = _build_snapshot(lead, evaluation, notes)

    # Evaluation copied verbatim.
    assert snap["evaluation"] == evaluation
    # Lead reduced to the three basics (no phone leak).
    assert snap["lead"] == {
        "full_name": "Paul",
        "company": "HCMFront",
        "email": "paul@example.com",
    }
    # Notes preserved in order, only the three whitelisted keys.
    assert [n["content"] for n in snap["notes"]] == ["n1", "n2"]
    assert set(snap["notes"][0].keys()) == {"content", "created_at", "created_by"}
    # A capture timestamp is always stamped.
    assert "captured_at" in snap


def test_build_snapshot_handles_no_notes():
    snap = _build_snapshot({"full_name": "A"}, {"id": "e"}, [])
    assert snap["notes"] == []
    assert snap["lead"]["full_name"] == "A"
