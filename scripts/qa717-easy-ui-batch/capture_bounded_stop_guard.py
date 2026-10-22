#!/usr/bin/env python3
"""Standalone bounded capture stop guard (test-only host component).

Not an orchestration framework. Not wired to B-0016 execute / Maestro / devices
by default. Addresses: Maestro visible-wait timeouts do not bound active
recording if the driver thread stalls.

Mechanism (ordinary path):
  1. admit_attempt() BEFORE Start (budget / fail-closed latch).
  2. after Start: arm host monotonic deadline = now + (max_seconds - safety_margin).
  3. deadline callback (independent of Maestro): fresh UI dump → verify
     resource-id == record-stop-button → tap THAT dump's bounds once.
     Never reuse stale stop coordinates from a prior dump/attempt.
  4. ordinary stop shell/tap uses an explicit subprocess/call timeout.
  5. on failure / uncertain save / stop timeout: latch closed — no further
     Start until reconcile(). Partial attempts count toward max_attempts.

Emergency path (fail-closed unless explicitly authorized at construct time):
  If ordinary stop cannot complete within its timeout AND
  allow_emergency_app_process_stop=True, issue a bounded force-stop of the
  app process. May leave a partial temp capture on disk. Requires explicit
  runtime authorization before live use; default False.

Guarantee envelope (honest):
  - WHEN host→device control path responds within configured timeouts:
      at deadline_offset_s (= max - margin) the host *begins* ordinary Stop
      (fresh dump, then tap). The Stop tap therefore starts only after the
      first dump returns — up to dump_timeout_s after the deadline fires —
      and tap/verify may add ordinary_stop_timeout_s (+ another dump).
      safety_margin_seconds must be >= dump_timeout_s + ordinary_stop_timeout_s
      so the worst-case ordinary path still aims near max_recorded_seconds when
      the app honors Stop promptly. This is best-effort, not an absolute cap.
  - WHEN ordinary stop times out and emergency IS authorized and returns:
      recording ends via process death within deadline + ordinary_timeout +
      emergency_timeout wall time; may leave partial temp capture; NOT a clean
      save guarantee.
  - WHEN adb/app is unresponsive beyond those timeouts (or emergency denied):
      this component CANNOT enforce a reliable recorded-duration bound.
      Outcome UNCERTAIN_BOUND_UNENFORCEABLE; latch fail-closed; no next Start.
  - A scheduled thread alone does NOT provide an absolute ≤30s guarantee if
    app/adb ignore Stop and emergency is denied or also hangs.

No permissions, installs, product source hooks, or device I/O in this module
itself — callers inject a bridge. Unit tests use fake clock / fake bridge only.
"""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


STOP_CONTROL_ID = "record-stop-button"
START_CONTROL_ID = "record-start-button"
DEFAULT_PACKAGE = "com.eten.fluent"


class StopBridge(Protocol):
    """Minimal host bridge — implementations must honor call timeouts."""

    def dump_hierarchy(self, *, timeout_s: float) -> str: ...

    def tap_xy(self, x: int, y: int, *, timeout_s: float) -> None: ...

    def force_stop_app(self, package: str, *, timeout_s: float) -> None: ...


@dataclass(frozen=True)
class StopGuardConfig:
    max_recorded_seconds: float = 30.0
    # Default covers dump_timeout_s + ordinary_stop_timeout_s (3+3) with 1s slack.
    safety_margin_seconds: float = 7.0
    ordinary_stop_timeout_s: float = 3.0
    emergency_stop_timeout_s: float = 5.0
    dump_timeout_s: float = 3.0
    max_attempts_including_partial: int = 2
    allow_emergency_app_process_stop: bool = False  # fail-closed
    package: str = DEFAULT_PACKAGE

    def __post_init__(self) -> None:
        min_margin = self.dump_timeout_s + self.ordinary_stop_timeout_s
        if self.safety_margin_seconds < min_margin:
            raise ValueError(
                "safety_margin_seconds must be >= dump_timeout_s + "
                f"ordinary_stop_timeout_s ({min_margin})"
            )

    @property
    def deadline_offset_s(self) -> float:
        return max(0.1, self.max_recorded_seconds - self.safety_margin_seconds)


@dataclass
class StopActionResult:
    kind: str  # ordinary_stop | emergency_app_stop | uncertain | skipped
    ok: bool
    detail: str
    used_stale_coordinates: bool = False
    control_verified: bool = False
    tap_xy: tuple[int, int] | None = None
    wall_elapsed_s: float | None = None


@dataclass
class CaptureSession:
    attempt: int
    armed_at_mono: float
    deadline_mono: float
    finished: bool = False
    result: StopActionResult | None = None


class BoundUnenforceable(RuntimeError):
    """Host/device path could not complete stop within timeouts."""


class CaptureBudgetExhausted(RuntimeError):
    pass


class CaptureLatched(RuntimeError):
    pass


def _control_bounds(
    hierarchy_xml: str, control_id: str
) -> tuple[int, int, int, int] | None:
    pattern = re.compile(
        rf'<node\b[^>]*resource-id="(?:[^"]*:id/)?{re.escape(control_id)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        re.DOTALL,
    )
    pattern_alt = re.compile(
        rf'<node\b[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*resource-id="(?:[^"]*:id/)?{re.escape(control_id)}"',
        re.DOTALL,
    )
    m = pattern.search(hierarchy_xml) or pattern_alt.search(hierarchy_xml)
    if not m:
        return None
    return tuple(map(int, m.groups()))  # type: ignore[return-value]


def parse_stop_control_center(hierarchy_xml: str, control_id: str = STOP_CONTROL_ID) -> tuple[int, int] | None:
    """Return center of the named control from a fresh hierarchy, or None."""
    b = _control_bounds(hierarchy_xml, control_id)
    if not b:
        return None
    x1, y1, x2, y2 = b
    return (x1 + x2) // 2, (y1 + y2) // 2


def control_present(hierarchy_xml: str, control_id: str) -> bool:
    return _control_bounds(hierarchy_xml, control_id) is not None


def is_record_idle(hierarchy_xml: str) -> bool:
    """Idle Record: Start visible, Stop absent — do not tap Start."""
    return control_present(hierarchy_xml, START_CONTROL_ID) and not control_present(
        hierarchy_xml, STOP_CONTROL_ID
    )


@dataclass
class CaptureBoundedStopGuard:
    """Host monotonic deadline stop — independent of a blocked Maestro thread."""

    bridge: StopBridge
    config: StopGuardConfig = field(default_factory=StopGuardConfig)
    # Must be the callable time.monotonic itself. A default=lambda: time.monotonic
    # makes clock() return the function object → TypeError on now + offset.
    clock: Callable[[], float] = field(default=time.monotonic)
    # schedule(delay_s, callback) -> cancel handle with .cancel()
    schedule: Callable[[float, Callable[[], None]], Any] | None = None
    _started: int = 0
    _partial_or_failed: int = 0
    _completed_ok: int = 0
    _latched: bool = False
    _latch_reason: str | None = None
    _reconcile_required: bool = False
    _session: CaptureSession | None = None
    _timer_handle: Any | None = None
    _deadline_in_flight: CaptureSession | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock)
    events: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.schedule is None:
            self.schedule = self._thread_schedule

    def _thread_schedule(self, delay_s: float, callback: Callable[[], None]) -> Any:
        timer = threading.Timer(delay_s, callback)
        timer.daemon = True
        timer.start()
        return timer

    def snapshot(self) -> dict[str, Any]:
        cfg = self.config
        return {
            "component": "capture_bounded_stop_guard/v1",
            "maxRecordedSeconds": cfg.max_recorded_seconds,
            "safetyMarginSeconds": cfg.safety_margin_seconds,
            "deadlineOffsetSeconds": cfg.deadline_offset_s,
            "ordinaryStopTimeoutS": cfg.ordinary_stop_timeout_s,
            "emergencyStopTimeoutS": cfg.emergency_stop_timeout_s,
            "allowEmergencyAppProcessStop": cfg.allow_emergency_app_process_stop,
            "maxAttemptsIncludingPartial": cfg.max_attempts_including_partial,
            "started": self._started,
            "completedOk": self._completed_ok,
            "partialOrFailed": self._partial_or_failed,
            "latched": self._latched,
            "latchReason": self._latch_reason,
            "reconcileRequired": self._reconcile_required,
            "absolute30sGuaranteedIfAdbUnresponsive": False,
            "events": list(self.events),
            "session": None
            if self._session is None
            else {
                "attempt": self._session.attempt,
                "armedAt": self._session.armed_at_mono,
                "deadline": self._session.deadline_mono,
                "finished": self._session.finished,
                "result": None
                if self._session.result is None
                else self._session.result.__dict__,
            },
        }

    def admit_attempt(self) -> int:
        """Count attempt BEFORE Start. Raises if latched or budget exhausted."""
        with self._lock:
            if self._latched or self._reconcile_required:
                raise CaptureLatched(self._latch_reason or "reconcile_required")
            if self._deadline_in_flight is not None:
                raise CaptureLatched("prior_deadline_still_active")
            if self._started >= self.config.max_attempts_including_partial:
                self._latched = True
                self._latch_reason = "attempt_budget_exhausted"
                self._reconcile_required = True
                raise CaptureBudgetExhausted("attempt_budget_exhausted")
            if self._session is not None and not self._session.finished:
                raise CaptureLatched("prior_session_still_active")
            self._started += 1
            attempt = self._started
            self.events.append(f"admit#{attempt}")
            return attempt

    def arm_after_start(self, attempt: int) -> CaptureSession:
        """Arm host deadline after Start pressed. Independent of Maestro."""
        with self._lock:
            if attempt != self._started:
                raise RuntimeError("arm_attempt_mismatch")
            if self._latched:
                raise CaptureLatched(self._latch_reason or "latched")
            now = self.clock()
            session = CaptureSession(
                attempt=attempt,
                armed_at_mono=now,
                deadline_mono=now + self.config.deadline_offset_s,
            )
            self._session = session
            self.events.append(f"arm#{attempt}@+{self.config.deadline_offset_s}")
            delay = self.config.deadline_offset_s
            assert self.schedule is not None
            self._timer_handle = self.schedule(delay, self._deadline_fire)
            return session

    def note_external_ordinary_stop(self) -> None:
        """Maestro/host already observed a clean Stop/save before deadline."""
        with self._lock:
            self._cancel_timer_unlocked()
            if self._session is None or self._session.finished:
                return
            self._session.finished = True
            self._session.result = StopActionResult(
                kind="ordinary_stop",
                ok=True,
                detail="external_observed_stop",
                control_verified=True,
            )
            self._completed_ok += 1
            self.events.append(f"external_stop_ok#{self._session.attempt}")

    def mark_uncertain_or_failed(self, reason: str) -> None:
        """Terminate capture stream: latch, no additional Start until reconcile."""
        with self._lock:
            self._cancel_timer_unlocked()
            if self._session and not self._session.finished:
                self._session.finished = True
                self._session.result = StopActionResult(
                    kind="uncertain", ok=False, detail=reason
                )
            self._partial_or_failed += 1
            self._latched = True
            self._latch_reason = reason
            self._reconcile_required = True
            self.events.append(f"uncertain:{reason}")

    def reconcile(self) -> None:
        """Clear latch after human/runtime reconciliation — required before next Start."""
        with self._lock:
            self._cancel_timer_unlocked()
            self._deadline_in_flight = None
            self._latched = False
            self._latch_reason = None
            self._reconcile_required = False
            self._session = None
            self.events.append("reconcile")

    def _cancel_timer_unlocked(self) -> None:
        handle = self._timer_handle
        self._timer_handle = None
        if handle is not None and hasattr(handle, "cancel"):
            try:
                handle.cancel()
            except Exception:  # noqa: BLE001
                pass

    def _deadline_fire(self) -> None:
        """Timer thread entry — must not share stale coordinates."""
        with self._lock:
            session = self._session
            if session is None or session.finished:
                self.events.append("deadline_ignored_session_done")
                return
            self._deadline_in_flight = session
        try:
            try:
                result = self._perform_bounded_stop()
            except Exception as exc:  # noqa: BLE001
                result = StopActionResult(
                    kind="uncertain",
                    ok=False,
                    detail=f"deadline_exception:{exc!r}",
                )
        finally:
            with self._lock:
                in_flight = self._deadline_in_flight
                self._deadline_in_flight = None
                clean = result.ok and result.kind in {"ordinary_stop", "skipped"}
                if self._session is None:
                    self.events.append("deadline_ignored_session_done")
                    return
                if in_flight is not None and self._session is not in_flight:
                    # Session was replaced; never commit onto the new capture.
                    self.events.append("deadline_ignored_stale_session")
                    if not clean and not self._latched:
                        self._partial_or_failed += 1
                        self._latched = True
                        self._reconcile_required = True
                        self._latch_reason = result.detail
                    return
                if self._session.finished:
                    self.events.append("deadline_ignored_session_done")
                    # Late non-clean result must still fail-closed (no lost latch).
                    if not clean and not self._latched:
                        self._partial_or_failed += 1
                        self._latched = True
                        self._reconcile_required = True
                        self._latch_reason = result.detail
                    return
                self._session.finished = True
                self._session.result = result
                if clean:
                    self._completed_ok += 1
                    self.events.append(
                        f"deadline_{result.kind}_ok#{self._session.attempt}"
                    )
                    return
                # Emergency success still counts as partial/uncertain save path
                self._partial_or_failed += 1
                self._latched = True
                self._reconcile_required = True
                self._latch_reason = result.detail
                self.events.append(f"deadline_{result.kind}:{result.detail}")

    def _perform_bounded_stop(self) -> StopActionResult:
        """Ordinary stop with fresh control identity; optional emergency."""
        t0 = self.clock()
        try:
            xml = self.bridge.dump_hierarchy(timeout_s=self.config.dump_timeout_s)
        except Exception as exc:  # noqa: BLE001
            return self._after_ordinary_failure(f"dump_failed:{exc!r}", t0)

        center = parse_stop_control_center(xml, STOP_CONTROL_ID)
        if center is None:
            # Root already stopped → idle Record: no tap (never Start).
            if is_record_idle(xml):
                return StopActionResult(
                    kind="skipped",
                    ok=True,
                    detail="already_idle_no_action",
                    control_verified=True,
                    wall_elapsed_s=self.clock() - t0,
                    used_stale_coordinates=False,
                )
            return self._after_ordinary_failure("stop_control_missing_or_unverified", t0)

        x, y = center
        try:
            self.bridge.tap_xy(x, y, timeout_s=self.config.ordinary_stop_timeout_s)
        except Exception as exc:  # noqa: BLE001
            return self._after_ordinary_failure(f"ordinary_tap_failed:{exc!r}", t0)

        # Verify stop control gone (or pause absent) with a fresh dump — not coords.
        try:
            xml2 = self.bridge.dump_hierarchy(timeout_s=self.config.dump_timeout_s)
            still = parse_stop_control_center(xml2, STOP_CONTROL_ID)
        except Exception as exc:  # noqa: BLE001
            return self._after_ordinary_failure(f"post_stop_dump_failed:{exc!r}", t0)

        if still is not None:
            return self._after_ordinary_failure("stop_control_still_present", t0)

        return StopActionResult(
            kind="ordinary_stop",
            ok=True,
            detail="fresh_control_tap_verified",
            control_verified=True,
            tap_xy=(x, y),
            wall_elapsed_s=self.clock() - t0,
            used_stale_coordinates=False,
        )

    def _after_ordinary_failure(self, detail: str, t0: float) -> StopActionResult:
        if not self.config.allow_emergency_app_process_stop:
            return StopActionResult(
                kind="uncertain",
                ok=False,
                detail=(
                    f"UNCERTAIN_BOUND_UNENFORCEABLE:{detail};"
                    "emergency_denied_fail_closed"
                ),
                wall_elapsed_s=self.clock() - t0,
            )
        try:
            self.bridge.force_stop_app(
                self.config.package,
                timeout_s=self.config.emergency_stop_timeout_s,
            )
        except Exception as exc:  # noqa: BLE001
            return StopActionResult(
                kind="uncertain",
                ok=False,
                detail=(
                    f"UNCERTAIN_BOUND_UNENFORCEABLE:{detail};"
                    f"emergency_failed:{exc!r}"
                ),
                wall_elapsed_s=self.clock() - t0,
            )
        return StopActionResult(
            kind="emergency_app_stop",
            ok=True,
            detail=(
                f"emergency_after:{detail};"
                "MAY_LEAVE_PARTIAL_TEMP_CAPTURE;"
                "requires_explicit_runtime_authorization"
            ),
            wall_elapsed_s=self.clock() - t0,
            control_verified=False,
        )


class FakeClockScheduler:
    """Deterministic clock + due-callback runner for unit tests (no threads)."""

    def __init__(self, start: float = 0.0):
        self.now = start
        self._pending: list[tuple[float, Callable[[], None], list[bool]]] = []

    def clock(self) -> float:
        return self.now

    def schedule(self, delay_s: float, callback: Callable[[], None]) -> Any:
        cancelled = [False]

        class Handle:
            def cancel(self_inner) -> None:
                cancelled[0] = True

        self._pending.append((self.now + delay_s, callback, cancelled))
        return Handle()

    def advance(self, dt: float) -> None:
        target = self.now + dt
        while True:
            due = [
                item
                for item in self._pending
                if not item[2][0] and item[0] <= target + 1e-12
            ]
            if not due:
                break
            due.sort(key=lambda item: item[0])
            when, cb, cancelled = due[0]
            self._pending.remove((when, cb, cancelled))
            self.now = when
            if not cancelled[0]:
                cb()
        self.now = target
