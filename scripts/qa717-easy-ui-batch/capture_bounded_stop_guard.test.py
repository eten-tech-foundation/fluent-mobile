#!/usr/bin/env python3
"""Fake-clock / subprocess-timeout races for CaptureBoundedStopGuard.

No ADB. No emulator. Focused on deadline races, uncertainty latch, no third Start.
"""
from __future__ import annotations

import importlib.util
import pathlib
from pathlib import Path
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
MOD_PATH = ROOT / "capture_bounded_stop_guard.py"


def load():
    spec = importlib.util.spec_from_file_location("capture_bounded_stop_guard", MOD_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


HIER_STOP = (
    '<?xml version="1.0"?><hierarchy>'
    '<node resource-id="record-stop-button" bounds="[100,200][300,400]"/>'
    "</hierarchy>"
)
HIER_IDLE = (
    '<?xml version="1.0"?><hierarchy>'
    '<node resource-id="record-start-button" bounds="[100,200][300,400]"/>'
    "</hierarchy>"
)
# Stale coords from a prior dump would be (200,300); this dump moves the control.
HIER_STOP_MOVED = (
    '<?xml version="1.0"?><hierarchy>'
    '<node resource-id="record-stop-button" bounds="[500,600][700,800]"/>'
    "</hierarchy>"
)


class FakeBridge:
    def __init__(self):
        self.dumps: list[str] = [HIER_STOP, HIER_IDLE]
        self.dump_i = 0
        self.taps: list[tuple[int, int]] = []
        self.force_stops: list[str] = []
        self.dump_hang = False
        self.tap_hang = False
        self.force_hang = False
        self.dump_timeouts = 0
        self.tap_timeouts = 0
        self.force_timeouts = 0

    def dump_hierarchy(self, *, timeout_s: float) -> str:
        if self.dump_hang:
            self.dump_timeouts += 1
            raise TimeoutError(f"dump_timeout>{timeout_s}")
        xml = self.dumps[min(self.dump_i, len(self.dumps) - 1)]
        self.dump_i += 1
        return xml

    def tap_xy(self, x: int, y: int, *, timeout_s: float) -> None:
        if self.tap_hang:
            self.tap_timeouts += 1
            raise TimeoutError(f"tap_timeout>{timeout_s}")
        self.taps.append((x, y))

    def force_stop_app(self, package: str, *, timeout_s: float) -> None:
        if self.force_hang:
            self.force_timeouts += 1
            raise TimeoutError(f"force_timeout>{timeout_s}")
        self.force_stops.append(package)


class DeadlineRaces(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def _guard(self, bridge=None, **cfg_kw):
        sched = self.m.FakeClockScheduler(0.0)
        cfg = self.m.StopGuardConfig(**cfg_kw)
        bridge = bridge or FakeBridge()
        g = self.m.CaptureBoundedStopGuard(
            bridge=bridge,
            config=cfg,
            clock=sched.clock,
            schedule=sched.schedule,
        )
        return g, sched, bridge

    def test_deadline_ordinary_stop_uses_fresh_control_not_stale_coords(self):
        bridge = FakeBridge()
        # First dump at deadline: moved control; second dump: idle (stop worked)
        bridge.dumps = [HIER_STOP_MOVED, HIER_IDLE]
        g, sched, bridge = self._guard(
            bridge,
            max_recorded_seconds=30,
            safety_margin_seconds=7,
        )
        attempt = g.admit_attempt()
        g.arm_after_start(attempt)
        # Advance just past deadline_offset (30 - 7 = 23s)
        sched.advance(23.0)
        self.assertTrue(g._session.finished)
        self.assertEqual(g._session.result.kind, "ordinary_stop")
        self.assertTrue(g._session.result.ok)
        self.assertFalse(g._session.result.used_stale_coordinates)
        # Center of moved bounds [500,600][700,800] = (600,700) — not stale (200,300)
        self.assertEqual(bridge.taps, [(600, 700)])
        self.assertNotIn((200, 300), bridge.taps)

    def test_deadline_race_external_stop_before_timer_skips_second_tap(self):
        g, sched, bridge = self._guard()
        attempt = g.admit_attempt()
        g.arm_after_start(attempt)
        sched.advance(10.0)
        g.note_external_ordinary_stop()
        sched.advance(20.0)  # crosses cancelled deadline; must not tap
        self.assertEqual(bridge.taps, [])
        self.assertEqual(g.snapshot()["completedOk"], 1)
        self.assertTrue(g._session.finished)
        self.assertEqual(g._session.result.detail, "external_observed_stop")

    def test_dump_timeout_emergency_denied_uncertain_no_third_start(self):
        bridge = FakeBridge()
        bridge.dump_hang = True
        g, sched, bridge = self._guard(
            bridge, allow_emergency_app_process_stop=False
        )
        a1 = g.admit_attempt()
        g.arm_after_start(a1)
        sched.advance(25.0)
        self.assertFalse(g._session.result.ok)
        self.assertIn("UNCERTAIN_BOUND_UNENFORCEABLE", g._session.result.detail)
        self.assertTrue(g.snapshot()["reconcileRequired"])
        self.assertEqual(bridge.force_stops, [])
        # Second admit blocked until reconcile; after reconcile only one more (max 2)
        with self.assertRaises(self.m.CaptureLatched):
            g.admit_attempt()
        g.reconcile()
        a2 = g.admit_attempt()
        self.assertEqual(a2, 2)
        g.mark_uncertain_or_failed("uncertain_save")
        with self.assertRaises(self.m.CaptureLatched):
            g.admit_attempt()  # no third start
        self.assertEqual(g.snapshot()["started"], 2)

    def test_tap_timeout_with_emergency_authorized_force_stops(self):
        bridge = FakeBridge()
        bridge.dumps = [HIER_STOP]
        bridge.tap_hang = True
        g, sched, bridge = self._guard(
            bridge, allow_emergency_app_process_stop=True
        )
        a = g.admit_attempt()
        g.arm_after_start(a)
        sched.advance(25.0)
        self.assertEqual(g._session.result.kind, "emergency_app_stop")
        self.assertEqual(bridge.force_stops, ["com.eten.fluent"])
        self.assertIn("MAY_LEAVE_PARTIAL_TEMP_CAPTURE", g._session.result.detail)
        self.assertTrue(g.snapshot()["reconcileRequired"])

    def test_emergency_also_times_out_bound_unenforceable_fail_closed(self):
        bridge = FakeBridge()
        bridge.dumps = [HIER_STOP]
        bridge.tap_hang = True
        bridge.force_hang = True
        g, sched, bridge = self._guard(
            bridge, allow_emergency_app_process_stop=True
        )
        a = g.admit_attempt()
        g.arm_after_start(a)
        sched.advance(25.0)
        self.assertFalse(g._session.result.ok)
        self.assertIn("UNCERTAIN_BOUND_UNENFORCEABLE", g._session.result.detail)
        self.assertIn("emergency_failed", g._session.result.detail)
        self.assertTrue(g.snapshot()["latched"])
        with self.assertRaises(self.m.CaptureLatched):
            g.admit_attempt()

    def test_uncertain_save_blocks_additional_start_until_reconcile(self):
        g, sched, bridge = self._guard()
        a = g.admit_attempt()
        g.arm_after_start(a)
        g.mark_uncertain_or_failed("save_uncertain")
        with self.assertRaises(self.m.CaptureLatched):
            g.admit_attempt()
        g.reconcile()
        self.assertEqual(g.admit_attempt(), 2)

    def test_budget_two_then_exhausted_no_third(self):
        g, sched, bridge = self._guard()
        for _ in range(2):
            a = g.admit_attempt()
            g.arm_after_start(a)
            g.note_external_ordinary_stop()
        with self.assertRaises(self.m.CaptureBudgetExhausted):
            g.admit_attempt()

    def test_snapshot_denies_absolute_30s_if_adb_unresponsive(self):
        g, sched, bridge = self._guard()
        snap = g.snapshot()
        self.assertFalse(snap["absolute30sGuaranteedIfAdbUnresponsive"])
        self.assertEqual(snap["deadlineOffsetSeconds"], 23.0)
        self.assertFalse(snap["allowEmergencyAppProcessStop"])

    def test_parse_stop_control_rejects_wrong_id(self):
        xml = (
            '<hierarchy><node resource-id="record-pause-button" '
            'bounds="[100,200][300,400]"/></hierarchy>'
        )
        self.assertIsNone(self.m.parse_stop_control_center(xml))



class ConfigMarginHonesty(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def test_default_margin_covers_dump_plus_ordinary_stop(self):
        cfg = self.m.StopGuardConfig()
        self.assertGreaterEqual(
            cfg.safety_margin_seconds,
            cfg.dump_timeout_s + cfg.ordinary_stop_timeout_s,
        )

    def test_thin_margin_rejected(self):
        with self.assertRaises(ValueError):
            self.m.StopGuardConfig(safety_margin_seconds=5.0)


class DeadlineInFlightAndLateLatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def test_admit_blocked_while_deadline_callback_in_flight(self):
        m = self.m
        test = self
        events: list = []

        class Bridge:
            def dump_hierarchy(self, *, timeout_s: float) -> str:
                events.append("dump")
                with test.assertRaises(m.CaptureLatched) as ctx:
                    g.admit_attempt()
                test.assertIn("prior_deadline_still_active", str(ctx.exception))
                return (
                    '<?xml version="1.0"?><hierarchy>'
                    '<node resource-id="record-stop-button" '
                    'bounds="[100,200][300,400]"/>'
                    "</hierarchy>"
                )

            def tap_xy(self, x, y, *, timeout_s: float) -> None:
                events.append(("tap", x, y))

            def force_stop_app(self, package, *, timeout_s: float) -> None:
                raise RuntimeError("no")

        bridge = Bridge()
        sched = m.FakeClockScheduler(0.0)
        g = m.CaptureBoundedStopGuard(
            bridge=bridge,
            config=m.StopGuardConfig(
                max_recorded_seconds=15,
                safety_margin_seconds=6,
                dump_timeout_s=3,
                ordinary_stop_timeout_s=3,
            ),
            schedule=sched.schedule,
            clock=sched.clock,
        )
        attempt = g.admit_attempt()
        g.arm_after_start(attempt)
        sched.advance(9.0)
        self.assertIn("dump", events)
        self.assertTrue(g.snapshot()["session"]["finished"])

    def test_late_uncertain_after_external_stop_still_latches(self):
        m = self.m
        dumps = {"n": 0}

        class FlakyBridge:
            def dump_hierarchy(self, *, timeout_s: float) -> str:
                dumps["n"] += 1
                if dumps["n"] == 1:
                    g.note_external_ordinary_stop()
                    raise TimeoutError("dump_after_external")
                return "<hierarchy/>"

            def tap_xy(self, x, y, *, timeout_s: float) -> None:
                pass

            def force_stop_app(self, package, *, timeout_s: float) -> None:
                raise RuntimeError("no")

        bridge = FlakyBridge()
        sched = m.FakeClockScheduler(0.0)
        g = m.CaptureBoundedStopGuard(
            bridge=bridge,
            config=m.StopGuardConfig(
                max_recorded_seconds=15,
                safety_margin_seconds=6,
                dump_timeout_s=3,
                ordinary_stop_timeout_s=3,
                allow_emergency_app_process_stop=False,
            ),
            schedule=sched.schedule,
            clock=sched.clock,
        )
        attempt = g.admit_attempt()
        g.arm_after_start(attempt)
        sched.advance(9.0)
        snap = g.snapshot()
        self.assertTrue(snap["latched"])
        self.assertTrue(snap["reconcileRequired"])
        with self.assertRaises(m.CaptureLatched):
            g.admit_attempt()


class RealDefaultClock(unittest.TestCase):
    """REAL default clock value (no injected clock). Fake scheduler/bridge only."""

    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def test_default_clock_yields_float_not_monotonic_function(self):
        """Exact ARM TypeError repro: clock() must be float, not time.monotonic."""
        bridge = FakeBridge()
        sched = self.m.FakeClockScheduler(0.0)
        cfg = self.m.StopGuardConfig(
            max_recorded_seconds=15,
            safety_margin_seconds=6,
        )
        g = self.m.CaptureBoundedStopGuard(
            bridge=bridge,
            config=cfg,
            schedule=sched.schedule,
            # intentionally omit clock= — exercise dataclass default
        )
        now = g.clock()
        self.assertIsInstance(now, (int, float))
        # Demonstrated live failure: builtin_function_or_method + float
        deadline = now + cfg.deadline_offset_s
        self.assertIsInstance(deadline, float)

    def test_arm_after_start_with_real_default_clock(self):
        bridge = FakeBridge()
        sched = self.m.FakeClockScheduler(0.0)
        cfg = self.m.StopGuardConfig(
            max_recorded_seconds=15,
            safety_margin_seconds=6,
        )
        g = self.m.CaptureBoundedStopGuard(
            bridge=bridge,
            config=cfg,
            schedule=sched.schedule,
        )
        attempt = g.admit_attempt()
        session = g.arm_after_start(attempt)
        self.assertIsInstance(session.armed_at_mono, float)
        self.assertIsInstance(session.deadline_mono, float)
        self.assertGreater(session.deadline_mono, session.armed_at_mono)



class TestRecordIdleNewTake(unittest.TestCase):
    """Focused: generic idle predicate accepts New Take when Stop absent."""

    @classmethod
    def setUpClass(cls):
        import importlib.util
        import sys

        path = Path(__file__).resolve().parent / "capture_bounded_stop_guard.py"
        spec = importlib.util.spec_from_file_location("cbsg_idle_nt", path)
        cls.m = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        sys.modules["cbsg_idle_nt"] = cls.m
        spec.loader.exec_module(cls.m)

    def test_new_take_without_stop_is_idle(self):
        xml = (
            '<?xml version="1.0"?><hierarchy>'
            '<node resource-id="record-new-take-button" bounds="[1,1][2,2]"/>'
            "</hierarchy>"
        )
        self.assertTrue(self.m.is_record_idle(xml))

    def test_start_without_stop_is_idle(self):
        xml = (
            '<?xml version="1.0"?><hierarchy>'
            '<node resource-id="record-start-button" bounds="[1,1][2,2]"/>'
            "</hierarchy>"
        )
        self.assertTrue(self.m.is_record_idle(xml))

    def test_stop_visible_not_idle_even_with_new_take(self):
        xml = (
            '<?xml version="1.0"?><hierarchy>'
            '<node resource-id="record-new-take-button" bounds="[1,1][2,2]"/>'
            '<node resource-id="record-stop-button" bounds="[3,3][4,4]"/>'
            "</hierarchy>"
        )
        self.assertFalse(self.m.is_record_idle(xml))



if __name__ == "__main__":
    raise SystemExit(unittest.main(verbosity=2))
