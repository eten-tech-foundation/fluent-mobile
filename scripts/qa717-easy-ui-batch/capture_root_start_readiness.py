#!/usr/bin/env python3
"""Select the ROOT start control from a Record hierarchy (host-only).

Proven correction (B-lane New Take readiness): after a saved take the UI exposes
``record-new-take-button`` (direct Start) rather than idle ``record-start-button``.
Callers must tap the returned control ID; this helper never Start/NewTake taps.

Distinct from ``capture_stop_readiness`` (fail-closed dump + expiry gate) and from
``capture_bounded_stop_guard`` (admit/arm/Stop deadline).

Sanitization: expected verse label is a **caller argument** — no serial, account,
target, or fixed verse pins live here. Public resource-ids only.
"""
from __future__ import annotations

import re
from typing import Callable

ROOT_START_CONTROL_IDLE = "record-start-button"
ROOT_START_CONTROL_NEW_TAKE = "record-new-take-button"
STOP_CONTROL_ID = "record-stop-button"
PAUSE_CONTROL_ID = "record-pause-button"
VERSE_REFERENCE_ID = "record-verse-reference"


def _default_control_present(hierarchy_xml: str, control_id: str) -> bool:
    pat = re.compile(
        rf'<node\b[^>]*resource-id="(?:[^"]*:id/)?{re.escape(control_id)}"',
        re.DOTALL,
    )
    return pat.search(hierarchy_xml) is not None


def verse_reference_ok(hierarchy_xml: str, expected: str) -> bool:
    """True when ``record-verse-reference`` text equals ``expected`` (exact)."""
    pat = re.compile(
        r'<node\b[^>]*resource-id="(?:[^"]*:id/)?record-verse-reference"[^>]*text="([^"]*)"',
        re.DOTALL,
    )
    pat_alt = re.compile(
        r'<node\b[^>]*text="([^"]*)"[^>]*resource-id="(?:[^"]*:id/)?record-verse-reference"',
        re.DOTALL,
    )
    m = pat.search(hierarchy_xml) or pat_alt.search(hierarchy_xml)
    if not m:
        return False
    return m.group(1).strip() == expected


def select_root_start_control(
    hierarchy_xml: str,
    *,
    expected_verse_label: str,
    control_present: Callable[[str, str], bool] | None = None,
) -> tuple[bool, str, str | None]:
    """Admit either idle Start or review New Take as the ROOT start control.

    Returns ``(ok, reason, rootStartControlID)``.
    Rejects active Stop, Pause, wrong verse, ambiguous both controls, or neither.
    """
    present = control_present or _default_control_present
    if present(hierarchy_xml, STOP_CONTROL_ID):
        return False, "reject_active_stop_visible", None
    if present(hierarchy_xml, PAUSE_CONTROL_ID):
        return False, "reject_paused_or_active_pause_visible", None
    if not verse_reference_ok(hierarchy_xml, expected_verse_label):
        return False, "verse_mismatch", None

    has_start = present(hierarchy_xml, ROOT_START_CONTROL_IDLE)
    has_new_take = present(hierarchy_xml, ROOT_START_CONTROL_NEW_TAKE)
    if has_start and has_new_take:
        return False, "ambiguous_start_and_new_take", None
    if has_start:
        return True, "idle_start", ROOT_START_CONTROL_IDLE
    if has_new_take:
        return True, "review_new_take", ROOT_START_CONTROL_NEW_TAKE
    return False, "no_root_start_control", None
