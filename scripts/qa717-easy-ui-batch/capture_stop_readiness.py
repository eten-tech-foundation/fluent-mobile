#!/usr/bin/env python3
"""Generic readiness helpers for bounded capture stop guards (host-only).

Extracted from proven B-lane lifecycle corrections without target pins:
  - fail-closed UIA dump (never raises TimeoutExpired to callers)
  - root Start validity window after arm (no late Start after expiry)

Not a batch planner, Maestro runner, or product change. Callers inject bridges.
No serial / account / verse pins live here.
"""
from __future__ import annotations

import subprocess
from typing import Protocol


DEFAULT_UIA_DUMP_TIMEOUT_S = 5.0


class HierarchyBridge(Protocol):
    def dump_hierarchy(self, *, timeout_s: float) -> str: ...


def safe_dump(
    bridge: HierarchyBridge, *, timeout_s: float = DEFAULT_UIA_DUMP_TIMEOUT_S
) -> tuple[str | None, str | None]:
    """Fail-closed hierarchy dump.

    Returns ``(xml, None)`` on success or ``(None, error_tag)`` on failure.
    Never raises ``subprocess.TimeoutExpired`` — that historical uncaught path
    skipped arm-before-READY and lost the independent Stop timer.
    """
    try:
        return bridge.dump_hierarchy(timeout_s=timeout_s), None
    except subprocess.TimeoutExpired:
        return None, "TimeoutExpired"
    except Exception as exc:  # noqa: BLE001 — host bridges vary; fail closed
        return None, f"dump_error:{type(exc).__name__}"


def readiness_valid_for_root_start(
    *,
    armed_at_mono: float,
    now_mono: float,
    expires_offset_s: float,
) -> bool:
    """Return True only while ``now_mono < armed_at_mono + expires_offset_s``.

    Root/manual Start must re-check this immediately before tapping Start.
    The guard never taps Start itself.
    """
    return now_mono < (armed_at_mono + expires_offset_s)
