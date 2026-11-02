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
            # Stuck hierarchy — never closed Home / never drawer cache
            bridge.hierarchy_override = (
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

    def test_maestro_test_sh_cmd_omits_device_and_udid(self):
        cmd = self.m.build_maestro_test_sh_cmd(
            flow=self.m.FLOW_REL,
            out_dir="/tmp/d0702-out",
        )
        self.assertEqual(cmd[0:2], ["bash", "scripts/maestro-test.sh"])
        self.assertNotIn("--device", cmd)
        self.assertNotIn("--udid", cmd)
        self.assertIn("--test-output-dir", cmd)
        self.assertIn(self.m.FLOW_REL, cmd)

    def test_wrapper_injected_device_appears_exactly_once_for_5554(self):
        """Regression for root run.log: option '--device' should be specified only once.

        AdbBridge previously forwarded --device into maestro-test.sh, which always
        injects --device from ANDROID_SERIAL — yielding a duplicate on emulator-5554.
        """
        serial = "emulator-5554"
        runner_cmd = self.m.build_maestro_test_sh_cmd(
            flow=self.m.FLOW_REL,
            out_dir="/tmp/d0702-out",
        )
        # Precondition: runner argv must not already carry --device
        self.assertEqual(self.m.count_cli_option(runner_cmd, "--device"), 0)
        effective = self.m.simulate_maestro_test_sh_device_injection(
            runner_cmd, serial
        )
        self.assertEqual(self.m.count_cli_option(effective, "--device"), 1)
        idx = effective.index("--device")
        self.assertEqual(effective[idx + 1], serial)
        self.assertEqual(effective[0:4], ["maestro", "test", "-p", "android"])

    def test_duplicate_device_in_runner_argv_would_fail_wrapper_contract(self):
        """Guard: if someone re-adds --device to runner cmd, simulation shows 2."""
        serial = "emulator-5554"
        bad = self.m.build_maestro_test_sh_cmd(
            flow=self.m.FLOW_REL,
            out_dir="/tmp/d0702-out",
        )
        # Intentionally corrupt a copy the way the failed head did
        bad_dup = bad[:2] + ["--device", serial] + bad[2:]
        self.assertEqual(self.m.count_cli_option(bad_dup, "--device"), 1)
        effective = self.m.simulate_maestro_test_sh_device_injection(bad_dup, serial)
        self.assertEqual(self.m.count_cli_option(effective, "--device"), 2)

    def test_open_drawer_with_home_behind_is_not_closed_home(self):
        """Reproduce root false-positive: Home IDs + open drawer ≠ ready."""
        bridge = self.m.FakeBridge(drawer_open=True)
        nodes = self.m.dump_nodes(bridge, "open-drawer")
        self.assertTrue(self.m.is_drawer_open(nodes))
        self.assertTrue(self.m.has_id(nodes, "home-tab-my-work"))
        self.assertTrue(self.m.has_id(nodes, "home-settings-button"))
        self.assertTrue(self.m.has_id(nodes, "settings-menu-active-12"))
        self.assertFalse(self.m.is_closed_home(nodes))

    def test_normalize_closes_open_drawer_via_android_back(self):
        bridge = self.m.FakeBridge(drawer_open=True)
        result = self.m.normalize_to_closed_home(
            bridge, sleep_fn=lambda _s: None, label="t"
        )
        self.assertTrue(result["ok"], result)
        self.assertFalse(bridge.drawer_open)
        self.assertIn("android_back", result["log"])
        self.assertIn("closed_home", result["log"])
        nodes = self.m.dump_nodes(bridge, "after")
        self.assertTrue(self.m.is_closed_home(nodes))

    def test_normalize_continues_after_transient_dump_failure(self):
        bridge = self.m.FakeBridge(drawer_open=True)
        calls = {"n": 0}
        original = bridge.shell

        def flaky_shell(*a, timeout=40):
            joined = " ".join(a)
            if "uiautomator" in joined or joined.startswith("cat "):
                calls["n"] += 1
                if calls["n"] == 1:
                    raise RuntimeError("could not get idle state")
            return original(*a, timeout=timeout)

        bridge.shell = flaky_shell  # type: ignore[method-assign]
        result = self.m.normalize_to_closed_home(
            bridge, sleep_fn=lambda _s: None, label="t"
        )
        self.assertTrue(result["ok"], result)
        self.assertTrue(
            any(x.startswith("dump_fail_step_0:") for x in result["log"]),
            result["log"],
        )

    def test_wrong_active_user_is_baseline_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                ["--repo", str(ROOT), "--evidence-dir", tmp, "--execute"]
            )
            args.dry_run = False
            bridge = self.m.FakeBridge()
            bridge.kv_csv = (
                "key,value\n"
                "active_user_id,9\n"
                "known_user_ids,\"[10,9,12]\"\n"
                "pref_ui_version,legacy\n"
            )
            result = self.m.run(args, bridge=bridge, sleep_fn=lambda _s: None)
            self.assertEqual(result["outcome"], "BASELINE_FAIL")
            self.assertEqual(bridge.maestro_calls, [])
            self.assertFalse(result["runtime_pass_claimed"])

    def test_finally_leaves_closed_home_not_drawer_open(self):
        bridge = self.m.FakeBridge(drawer_open=True)
        result = self.m.bounded_ui_restore(bridge, sleep_fn=lambda _s: None)
        self.assertTrue(result["ok"], result)
        self.assertFalse(bridge.drawer_open)
        self.assertIn("verified_closed_home_active12_cache", result["log"])
        nodes = self.m.dump_nodes(bridge, "end")
        self.assertTrue(self.m.is_closed_home(nodes))
        self.assertFalse(self.m.is_drawer_open(nodes))

    def test_legacy_false_positive_condition_rejected(self):
        """Old success: home + active12 menus without requiring drawer closed."""
        bridge = self.m.FakeBridge(drawer_open=True)
        nodes = self.m.dump_nodes(bridge, "legacy")
        legacy_ok = (
            self.m.has_id(nodes, "home-tab-my-work")
            and self.m.has_id(nodes, "settings-menu-active-12")
            and self.m.has_id(nodes, "settings-menu-account-10")
            and self.m.has_id(nodes, "settings-menu-account-9")
            and self.m.has_id(nodes, "settings-menu-account-12")
        )
        self.assertTrue(legacy_ok)
        self.assertFalse(self.m.is_closed_home(nodes))

    def test_pref_ui_version_in_allowlist_and_fakebridge(self):
        self.assertIn("pref_ui_version", self.m.PREF_KEYS)
        self.assertNotIn("ui_version", self.m.PREF_KEYS)
        self.assertIn("pref_ui_version,legacy", self.m.FakeBridge.kv_csv)

    def test_missing_sha256_is_hash_drift(self):
        before = {
            "rows": [
                {"id": "t1", "sha256": "abc"},
                {"id": "t2", "sha256": ""},
            ]
        }
        after = {
            "rows": [
                {"id": "t1", "sha256": "abc"},
                {"id": "t2", "sha256": ""},
            ]
        }
        cmp = self.m.compare_snapshots(before, after)
        self.assertIn("t2", cmp["hash_drift_ids"])
        self.assertFalse(cmp["ok"])
        after_ok = {
            "rows": [
                {"id": "t1", "sha256": "abc"},
                {"id": "t2", "sha256": "def"},
            ]
        }
        before_ok = {
            "rows": [
                {"id": "t1", "sha256": "abc"},
                {"id": "t2", "sha256": "def"},
            ]
        }
        self.assertTrue(self.m.compare_snapshots(before_ok, after_ok)["ok"])

    def test_skipped_maestro_main_exits_2(self):
        """--execute that never runs Maestro must not exit 0."""
        self.assertEqual(
            self.m.decide_outcome(
                execute=True,
                maestro_exit=None,
                baseline_ok=True,
                finally_ok=True,
                takes_ok=True,
                prefs_ok=True,
                cleanup_error=None,
            ),
            "SKIPPED_MAESTRO",
        )
        with tempfile.TemporaryDirectory() as tmp:
            original_run = self.m.run

            def fake_run(args, bridge=None, sleep_fn=None):
                return {"outcome": "SKIPPED_MAESTRO", "execute": True}

            self.m.run = fake_run  # type: ignore[method-assign]
            try:
                code = self.m.main(
                    ["--repo", str(ROOT), "--evidence-dir", tmp, "--execute"]
                )
            finally:
                self.m.run = original_run  # type: ignore[method-assign]
            self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()