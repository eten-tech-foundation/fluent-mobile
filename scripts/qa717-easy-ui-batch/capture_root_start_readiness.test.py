#!/usr/bin/env python3
"""Focused regressions for capture_root_start_readiness (no devices).

Retained B-lane proof (local receipts, not republished): New Take is ROOT start
after a saved take; guard never auto-taps. Fixture verse is a placeholder only.
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
# Placeholder label — not a live QA pin / private identity.
EXPECTED = "Ruth 1:1"


def load():
    path = HERE / "capture_root_start_readiness.py"
    spec = importlib.util.spec_from_file_location("capture_root_start_readiness", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def hier(*, verse: str, controls: list[str]) -> str:
    nodes = [
        f'<node resource-id="record-verse-reference" text="{verse}" '
        f'bounds="[0,20][400,80]"/>'
    ]
    for i, cid in enumerate(controls):
        nodes.append(
            f'<node resource-id="{cid}" bounds="[{i},{i}][{i+1},{i+1}]"/>'
        )
    return "<?xml version='1.0'?><hierarchy>" + "".join(nodes) + "</hierarchy>"


class RootStartReadiness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load()

    def test_idle_start_admits_start_control(self):
        ok, reason, cid = self.m.select_root_start_control(
            hier(verse=EXPECTED, controls=["record-start-button"]),
            expected_verse_label=EXPECTED,
        )
        self.assertTrue(ok)
        self.assertEqual(reason, "idle_start")
        self.assertEqual(cid, "record-start-button")

    def test_review_new_take_admits_new_take_control(self):
        ok, reason, cid = self.m.select_root_start_control(
            hier(verse=EXPECTED, controls=["record-new-take-button"]),
            expected_verse_label=EXPECTED,
        )
        self.assertTrue(ok)
        self.assertEqual(reason, "review_new_take")
        self.assertEqual(cid, "record-new-take-button")

    def test_active_stop_rejected(self):
        ok, reason, cid = self.m.select_root_start_control(
            hier(verse=EXPECTED, controls=["record-stop-button"]),
            expected_verse_label=EXPECTED,
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "reject_active_stop_visible")
        self.assertIsNone(cid)

    def test_paused_rejected(self):
        ok, reason, cid = self.m.select_root_start_control(
            hier(verse=EXPECTED, controls=["record-pause-button"]),
            expected_verse_label=EXPECTED,
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "reject_paused_or_active_pause_visible")
        self.assertIsNone(cid)

    def test_wrong_verse_rejected(self):
        ok, reason, cid = self.m.select_root_start_control(
            hier(verse="Ruth 4:1", controls=["record-new-take-button"]),
            expected_verse_label=EXPECTED,
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "verse_mismatch")
        self.assertIsNone(cid)

    def test_ambiguous_both_controls_rejected(self):
        ok, reason, cid = self.m.select_root_start_control(
            hier(
                verse=EXPECTED,
                controls=["record-start-button", "record-new-take-button"],
            ),
            expected_verse_label=EXPECTED,
        )
        self.assertFalse(ok)
        self.assertEqual(reason, "ambiguous_start_and_new_take")
        self.assertIsNone(cid)


if __name__ == "__main__":
    raise SystemExit(unittest.main(verbosity=2))
