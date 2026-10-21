#!/usr/bin/env python3
"""Unit tests for D-0702 external finally runner — no device, no ADB, no Maestro."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOD_PATH = pathlib.Path(__file__).resolve().parent / "run-d0702-a5554-external-finally.py"


def load_mod():
    import sys

    spec = importlib.util.spec_from_file_location("d0702_runner", MOD_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class D0702ExternalFinallyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load_mod()

    def test_expected_takes_are_eleven_split_10_and_1(self):
        self.assertEqual(
            self.m.EXPECTED_TAKE_COUNTS,
            {"owner10": 10, "owner9": 1, "total": 11},
        )

    def test_parse_args_default_is_not_execute(self):
        args = self.m.parse_args([])
        self.assertFalse(args.execute)
        self.assertEqual(args.serial, "emulator-5554")

    def test_parse_takes_counts(self):
        fake = self.m.FakeBridge()
        parsed = self.m.parse_takes(fake.takes_tsv)
        self.assertTrue(self.m.counts_match_expected(parsed["counts"]))

    def test_dry_run_outcome_authoring_only_never_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                ["--repo", str(ROOT), "--evidence-dir", tmp, "--dry-run"]
            )
            result = self.m.run(args, bridge=self.m.FakeBridge(), sleep_fn=lambda _s: None)
            self.assertEqual(result["outcome"], "AUTHORING_ONLY")
            self.assertFalse(result["runtime_pass_claimed"])
            self.assertEqual(result["c51_byte_arithmetic"], "not_run")
            self.assertTrue((pathlib.Path(tmp) / "host-runner-result.json").is_file())

    def test_maestro_failure_still_runs_finally(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                [
                    "--repo",
                    str(ROOT),
                    "--evidence-dir",
                    tmp,
                    "--execute",
                    "--dry-run",  # force FakeBridge path via run() when bridge injected
                ]
            )
            # Inject execute semantics manually: call decide path via custom bridge
            bridge = self.m.FakeBridge(maestro_exit=7)
            # Simulate execute=True with injected bridge
            args.execute = True
            args.dry_run = False
            result = self.m.run(args, bridge=bridge, sleep_fn=lambda _s: None)
            self.assertEqual(bridge.maestro_calls, [self.m.FLOW_REL])
            self.assertEqual(result["maestroExit"], 7)
            self.assertTrue(result["finally"]["ok"])
            self.assertEqual(result["outcome"], "MAESTRO_FAIL_CLEANUP_OK")
            self.assertFalse(result["runtime_pass_claimed"])

    def test_cleanup_failure_marks_uncertain_not_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                ["--repo", str(ROOT), "--evidence-dir", tmp, "--execute"]
            )
            args.dry_run = False
            bridge = self.m.FakeBridge()
            # Hierarchy never reaches active12 / home together
            bridge.hierarchy_xml = (
                '<?xml version="1.0"?><hierarchy>'
                '<node resource-id="prepare-offline-screen"/>'
                "</hierarchy>"
            )
            result = self.m.run(args, bridge=bridge, sleep_fn=lambda _s: None)
            self.assertEqual(result["outcome"], "CLEANUP_UNCERTAIN")
            self.assertFalse(result["runtime_pass_claimed"])
            self.assertIn("CLEANUP_UNCERTAIN", result.get("visible", ""))

    def test_take_drift_marks_uncertain(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                ["--repo", str(ROOT), "--evidence-dir", tmp, "--execute"]
            )
            args.dry_run = False
            bridge = self.m.FakeBridge()
            original = bridge.takes_tsv

            def shell_mut(*a, timeout=40):
                joined = " ".join(a)
                if "recordings" in joined and len(bridge.shell_calls) > 6:
                    # After maestro, drop owner9 row
                    bridge.takes_tsv = "\n".join(original.strip().splitlines()[:-1])
                return self.m.FakeBridge.shell(bridge, *a, timeout=timeout)

            bridge.shell = shell_mut  # type: ignore[method-assign]
            result = self.m.run(args, bridge=bridge, sleep_fn=lambda _s: None)
            self.assertEqual(result["outcome"], "CLEANUP_UNCERTAIN")
            self.assertFalse(result["afterTakes"]["compare"]["ok"])

    def test_decide_outcome_matrix(self):
        d = self.m.decide_outcome
        self.assertEqual(
            d(
                execute=False,
                maestro_exit=0,
                baseline_ok=True,
                finally_ok=True,
                takes_ok=True,
                prefs_ok=True,
                cleanup_error=None,
            ),
            "AUTHORING_ONLY",
        )
        self.assertEqual(
            d(
                execute=True,
                maestro_exit=0,
                baseline_ok=True,
                finally_ok=False,
                takes_ok=True,
                prefs_ok=True,
                cleanup_error=None,
            ),
            "CLEANUP_UNCERTAIN",
        )
        self.assertEqual(
            d(
                execute=True,
                maestro_exit=0,
                baseline_ok=True,
                finally_ok=True,
                takes_ok=True,
                prefs_ok=True,
                cleanup_error=None,
            ),
            "MAESTRO_OK_CLEANUP_OK",
        )

    def test_result_json_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                ["--repo", str(ROOT), "--evidence-dir", tmp, "--skip-maestro"]
            )
            result = self.m.run(args, bridge=self.m.FakeBridge(), sleep_fn=lambda _s: None)
            saved = json.loads(
                (pathlib.Path(tmp) / "host-runner-result.json").read_text()
            )
            self.assertEqual(saved["outcome"], result["outcome"])
            self.assertEqual(saved["expectedTakeCounts"]["total"], 11)


if __name__ == "__main__":
    unittest.main()
