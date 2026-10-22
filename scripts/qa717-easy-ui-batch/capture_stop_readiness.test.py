#!/usr/bin/env python3
"""Focused regressions for capture_stop_readiness (no devices)."""
from __future__ import annotations

import importlib.util
import pathlib
import subprocess
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent


def load():
    path = HERE / "capture_stop_readiness.py"
    spec = importlib.util.spec_from_file_location("capture_stop_readiness", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class SafeDumpFailClosed(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def test_timeout_expired_returns_tag_does_not_raise(self):
        class Boom:
            def dump_hierarchy(self, *, timeout_s: float) -> str:
                raise subprocess.TimeoutExpired(
                    cmd=["uiautomator", "dump"], timeout=timeout_s
                )

        xml, err = self.m.safe_dump(Boom(), timeout_s=3.0)
        self.assertIsNone(xml)
        self.assertEqual(err, "TimeoutExpired")

    def test_success_returns_xml(self):
        class Ok:
            def dump_hierarchy(self, *, timeout_s: float) -> str:
                return "<hierarchy/>"

        xml, err = self.m.safe_dump(Ok())
        self.assertEqual(xml, "<hierarchy/>")
        self.assertIsNone(err)


class ReadinessExpiryGate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def test_valid_inside_window(self):
        self.assertTrue(
            self.m.readiness_valid_for_root_start(
                armed_at_mono=100.0, now_mono=110.0, expires_offset_s=15.0
            )
        )

    def test_expired_rejects_late_start(self):
        """Historical late-Start risk: readiness age ≥ expiry must deny Start."""
        self.assertFalse(
            self.m.readiness_valid_for_root_start(
                armed_at_mono=100.0, now_mono=115.0, expires_offset_s=15.0
            )
        )


if __name__ == "__main__":
    raise SystemExit(unittest.main(verbosity=2))
