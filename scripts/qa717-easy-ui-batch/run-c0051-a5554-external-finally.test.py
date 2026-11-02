#!/usr/bin/env python3
"""Unit tests for C-0051 host — no device, no ADB, no Maestro."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOD_PATH = pathlib.Path(__file__).resolve().parent / "run-c0051-a5554-external-finally.py"


def load_mod():
    spec = importlib.util.spec_from_file_location("c0051_runner", MOD_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class C0051AdmissionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load_mod()
        cls.d0702 = cls.m.load_d0702()
        cls.manifest = cls.m.load_manifest(ROOT)
        cls.baselines = cls.m.load_baselines(ROOT, cls.manifest)

    def _matching_snapshots(self):
        b = self.baselines
        takes = {
            "ids": list(b["takes"]["ids"]),
            "hashes": dict(b["takes"]["hashes"]),
            "counts": b["takes"]["counts"],
            "rows": [
                {"id": i, "sha256": h, "owner": 10 if n < 10 else 9}
                for n, (i, h) in enumerate(b["takes"]["hashes"].items())
            ],
        }
        cache = {
            "ok": True,
            "files": [
                {
                    "path": p,
                    "bytes": str(b["cacheBytes"][p]),
                    "sha256": digest,
                }
                for p, digest in b["cacheHashes"].items()
            ],
            "fileCount": b["cacheFileCount"],
        }
        prefs = {
            "active_user_id": b["prefsActive"],
            "known_user_ids": ",".join(b["prefsKnown"]),
        }
        queue = {"ok": True, "rows": [], "rowCount": 0, "bytesTotalSum": 0}
        return {
            "queue": queue,
            "takes": takes,
            "cache": cache,
            "prefs": prefs,
        }

    def _settle_path_manifest(self) -> dict:
        """Synthetic admitted catalog for settle/finally unit tests only.

        Production original fixture stays NONADMISSIBLE; this stub supplies a
        complete predownload oracle so post-transfer settle can be exercised
        without waiving the size guard for the real packet.
        """
        m = json.loads(json.dumps(self.manifest))
        m["admission"]["requireCompleteKnownSizes"] = True
        m["admission"]["sizeCompleteness"] = "all-known-complete"
        m["admission"].pop("admissionStatus", None)
        m["payload"]["sizeCompleteness"] = "all-known-complete"
        m["payload"]["observedGroups"] = [
            g
            for g in m["payload"]["observedGroups"]
            if g.get("name") != "Reference Images"
        ]
        m["payload"]["predownloadSizeOracle"] = {
            "kind": "unit-test-stub",
            "complete": True,
            "note": "settle-path unit test only; not a live transfer authorization",
        }
        return m

    def test_strip_url(self):
        self.assertEqual(
            self.m.strip_url("https://x/a.mp3?tok=SECRET#f"),
            "https://x/a.mp3",
        )

    def test_runtime_admit_exact_baseline_blocked_without_manifest(self):
        """Missing manifest fail-closes size/oracle gates (not a baseline-only PASS)."""
        snap = self._matching_snapshots()
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
        )
        self.assertFalse(adm["ok"], adm)
        self.assertEqual(adm["status"], "BLOCKED")
        self.assertTrue(
            any("manifest_missing_fail_closed" in r for r in adm["reasons"]),
            adm["reasons"],
        )

    def test_runtime_admit_original_manifest_nonadmissible(self):
        snap = self._matching_snapshots()
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
            manifest=self.manifest,
        )
        self.assertFalse(adm["ok"])
        joined = " ".join(adm["reasons"])
        self.assertTrue(
            "size_completeness_nonadmissible" in joined
            or "unknown_zero_size_label" in joined
            or "predownload_oracle_unavailable" in joined,
            adm["reasons"],
        )

    def test_runtime_admit_fresh_fixture_refused_on_terminal_queue_205(self):
        snap = self._matching_snapshots()
        snap["queue"] = {
            "ok": True,
            "rows": [{"id": str(i)} for i in range(205)],
            "rowCount": 205,
            "bytesTotalSum": 26957219,
        }
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
        )
        self.assertFalse(adm["ok"])
        self.assertTrue(
            any("fresh_fixture_refused" in r for r in adm["reasons"]),
            adm["reasons"],
        )

    def test_runtime_admit_known_complete_still_fail_closed_without_oracle(self):
        snap = self._matching_snapshots()
        known = json.loads(
            (
                ROOT
                / ".maestro/fixtures/c0051-matthew1-known-complete-bounded.manifest.json"
            ).read_text(encoding="utf-8")
        )
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
            manifest=known,
        )
        self.assertFalse(adm["ok"])
        self.assertTrue(
            any("predownload_oracle_unavailable" in r for r in adm["reasons"]),
            adm["reasons"],
        )

    def test_runtime_admit_blank_completeness_incomplete_labels_fail_closed(self):
        """Blank sizeCompleteness + Unknown/Included 0 B must not PASS via oracle.complete."""
        snap = self._matching_snapshots()
        manifest = {
            "admission": {
                "requireCompleteKnownSizes": True,
                # blank / missing completeness
            },
            "payload": {
                "observedGroups": [
                    {"name": "Reference Images", "items": ["Image Unknown"]},
                    {"name": "Also", "items": ["Image Included 0 B"]},
                ],
                "predownloadSizeOracle": {"complete": True, "kind": "unit-stub"},
            },
        }
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
            manifest=manifest,
        )
        self.assertFalse(adm["ok"])
        joined = " ".join(adm["reasons"])
        self.assertIn("size_completeness_nonadmissible", joined)
        self.assertTrue(
            any("unknown_zero_size_label" in r for r in adm["reasons"]),
            adm["reasons"],
        )

    def test_runtime_admit_wrong_project13_preexisting_blocked(self):
        snap = self._matching_snapshots()
        snap["cache"]["files"].append(
            {
                "path": "files/downloads/13/evil.bin",
                "bytes": "1",
                "sha256": "abcd",
            }
        )
        snap["cache"]["fileCount"] = len(snap["cache"]["files"])
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
        )
        self.assertFalse(adm["ok"])
        self.assertTrue(
            any("project13" in r or "cache_count" in r for r in adm["reasons"])
        )

    def test_runtime_admit_pending_queue_blocked(self):
        snap = self._matching_snapshots()
        snap["queue"] = {"ok": True, "rows": [{"id": "x"}], "rowCount": 1}
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
        )
        self.assertFalse(adm["ok"])
        self.assertTrue(any("queue_rows" in r for r in adm["reasons"]))

    def test_runtime_admit_changed_take_hash_blocked(self):
        snap = self._matching_snapshots()
        rid = snap["takes"]["ids"][0]
        snap["takes"]["hashes"][rid] = "0" * 64
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
        )
        self.assertFalse(adm["ok"])
        self.assertTrue(any("take_hash_mismatch" in r for r in adm["reasons"]))

    def test_runtime_admit_missing_cache_file_blocked(self):
        snap = self._matching_snapshots()
        snap["cache"]["files"] = snap["cache"]["files"][:-1]
        snap["cache"]["fileCount"] = len(snap["cache"]["files"])
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
        )
        self.assertFalse(adm["ok"])

    def test_runtime_admit_wrong_active_prefs_blocked(self):
        snap = self._matching_snapshots()
        snap["prefs"]["active_user_id"] = "9"
        adm = self.m.admit_runtime_from_snapshots(
            queue=snap["queue"],
            takes=snap["takes"],
            cache=snap["cache"],
            prefs=snap["prefs"],
            baselines=self.baselines,
        )
        self.assertFalse(adm["ok"])
        self.assertTrue(any("active_user" in r for r in adm["reasons"]))

    def test_dry_run_original_fixture_static_nonadmissible(self):
        """Original 2.4MB+Images0B packet must not author a transfer."""
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                ["--repo", str(ROOT), "--evidence-dir", tmp, "--dry-run"]
            )
            result = self.m.run(args, bridge=self.d0702.FakeBridge())
            self.assertEqual(result["outcome"], "STATIC_GUARD_BLOCKED")
            self.assertFalse(result["runtime_pass_claimed"])
            self.assertFalse(result["staticGuard"]["ok"])

    def test_dry_run_default_evidence_does_not_clobber_tracked_receipt(self):
        """Default --dry-run must not overwrite tracked host-runner-result.json."""
        tracked = (
            ROOT
            / "docs/assessments/maestro-acceptance-coverage/run-evidence/"
            / "20261021-easy-ui-batch/c0051-matthew1-download"
            / "host-runner-result.json"
        )
        before = tracked.read_bytes()
        before_mtime = tracked.stat().st_mtime_ns
        args = self.m.parse_args(["--repo", str(ROOT), "--dry-run"])
        result = self.m.run(args, bridge=self.d0702.FakeBridge())
        self.assertEqual(result["outcome"], "STATIC_GUARD_BLOCKED")
        after = tracked.read_bytes()
        self.assertEqual(after, before)
        self.assertEqual(tracked.stat().st_mtime_ns, before_mtime)
        resolved = self.m.resolve_evidence_dir(args, ROOT.resolve())
        tracked_dir = (ROOT / self.m.EVIDENCE_REL).resolve()
        self.assertNotEqual(resolved, tracked_dir)
        self.assertTrue((resolved / "host-runner-result.json").is_file())

    def test_execute_blocked_by_static_nonadmissible_original_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                ["--repo", str(ROOT), "--evidence-dir", tmp, "--execute"]
            )
            bad = self._matching_snapshots()
            bad["queue"]["rowCount"] = 3
            result = self.m.run(
                args,
                bridge=self.d0702.FakeBridge(),
                snapshots=bad,
                sleep_fn=lambda _s: None,
            )
            # Original packet is NONADMISSIBLE at static guard — never reaches transfer.
            self.assertEqual(result["outcome"], "STATIC_GUARD_BLOCKED")
            self.assertFalse(result["runtime_pass_claimed"])

    def test_execute_original_fixture_never_admits_even_with_matching_baselines(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                [
                    "--repo",
                    str(ROOT),
                    "--evidence-dir",
                    tmp,
                    "--execute",
                    "--skip-maestro",
                ]
            )
            snap = self._matching_snapshots()
            result = self.m.run(
                args,
                bridge=self.d0702.FakeBridge(),
                snapshots=snap,
                sleep_fn=lambda _s: None,
            )
            self.assertEqual(result["outcome"], "STATIC_GUARD_BLOCKED")
            self.assertFalse(result["runtime_pass_claimed"])

    def test_baselines_are_nineteen_and_eleven(self):
        self.assertEqual(self.baselines["cacheFileCount"], 19)
        self.assertEqual(len(self.baselines["cacheHashes"]), 19)
        self.assertEqual(len(self.baselines["takes"]["ids"]), 11)
        self.assertEqual(self.manifest["admission"]["maxBytes"], 5242880)

    def _p13_row(self, status: str, rid: str = "r1") -> dict:
        return {
            "id": rid,
            "project_id": "13",
            "user_id": "9",
            "tier": "1",
            "kind": "audio",
            "resource_name": "Source Bible Audio",
            "label": "Audio",
            "source_url_stripped": "https://cdn.example/a.mp3",
            "status": status,
            "progress": "1" if status == "completed" else "0.2",
            "bytes_total": "1000",
            "local_file_path": "files/downloads/13/a.mp3",
            "resource_id": rid,
            "book_code": "MAT",
            "start_chapter": "1",
            "end_chapter": "1",
            "file_ext": "mp3",
        }

    def test_classify_pending_then_completed(self):
        active = self.m.classify_queue_settle([self._p13_row("downloading")])
        self.assertFalse(active["settled"])
        self.assertEqual(active["state"], "ACTIVE")
        self.assertFalse(active["uiRestoreSafe"])
        done = self.m.classify_queue_settle([self._p13_row("completed")])
        self.assertTrue(done["settled"])
        self.assertTrue(done["ok"])
        self.assertEqual(done["state"], "TRANSFER_COMPLETED")
        self.assertTrue(done["uiRestoreSafe"])

    def test_classify_failed_terminal(self):
        failed = self.m.classify_queue_settle([self._p13_row("failed")])
        self.assertTrue(failed["settled"])
        self.assertFalse(failed["ok"])
        self.assertEqual(failed["state"], "TRANSFER_FAILED")
        self.assertTrue(failed["uiRestoreSafe"])

    def test_classify_paused_not_settled_keeps_polling(self):
        paused = self.m.classify_queue_settle([self._p13_row("paused")])
        self.assertFalse(paused["settled"])
        self.assertEqual(paused["state"], "PAUSED")
        self.assertFalse(paused["uiRestoreSafe"])

    def test_wait_paused_polls_until_deadline(self):
        polls = {"n": 0}
        t = {"v": 0.0}

        def clock():
            cur = t["v"]
            t["v"] += 100.0
            return cur

        def poll():
            polls["n"] += 1
            return {
                "ok": True,
                "rows": [self._p13_row("paused")],
                "rowCount": 1,
            }

        settle = self.m.wait_for_queue_settle(
            poll_queue=poll,
            sleep_fn=lambda _s: None,
            poll_s=0,
            deadline_s=10,
            clock_fn=clock,
        )
        self.assertEqual(settle["state"], "DEADLINE_EXHAUSTED")
        self.assertTrue(settle["deadlineExhausted"])
        self.assertGreaterEqual(polls["n"], 1)

    def test_wait_pending_to_completed(self):
        polls = [
            {"ok": True, "rows": [self._p13_row("queued")], "rowCount": 1},
            {"ok": True, "rows": [self._p13_row("downloading")], "rowCount": 1},
            {"ok": True, "rows": [self._p13_row("completed")], "rowCount": 1},
        ]
        i = {"n": 0}

        def poll():
            q = polls[min(i["n"], len(polls) - 1)]
            i["n"] += 1
            return q

        settle = self.m.wait_for_queue_settle(
            poll_queue=poll,
            sleep_fn=lambda _s: None,
            poll_s=0,
            deadline_s=10,
        )
        self.assertEqual(settle["state"], "TRANSFER_COMPLETED")
        self.assertTrue(settle["ok"])
        self.assertFalse(settle["deadlineExhausted"])

    def test_wait_deadline_exhausted(self):
        t = {"v": 0.0}

        def clock():
            # First call = start; subsequent calls jump past deadline.
            cur = t["v"]
            t["v"] += 100.0
            return cur

        settle = self.m.wait_for_queue_settle(
            poll_queue=lambda: {
                "ok": True,
                "rows": [self._p13_row("downloading")],
                "rowCount": 1,
            },
            sleep_fn=lambda _s: None,
            poll_s=0,
            deadline_s=10,
            clock_fn=clock,
        )
        self.assertEqual(settle["state"], "DEADLINE_EXHAUSTED")
        self.assertTrue(settle["deadlineExhausted"])
        self.assertFalse(settle["uiRestoreSafe"])

    def test_execute_settle_completed_preserves_cache_and_prefs(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                [
                    "--repo",
                    str(ROOT),
                    "--evidence-dir",
                    tmp,
                    "--execute",
                    "--skip-maestro",
                ]
            )
            snap = self._matching_snapshots()
            completed_row = self._p13_row("completed")
            snap["settle_queue_polls"] = [
                {"ok": True, "rows": [completed_row], "rowCount": 1}
            ]
            snap["settle_deadline_s"] = 10
            snap["settle_poll_s"] = 0
            snap["after"] = {
                "takes": snap["takes"],
                "cache": snap["cache"],
                "prefs": snap["prefs"],
                "queue": {"ok": True, "rows": [completed_row], "rowCount": 1},
            }
            result = self.m.run(
                args,
                bridge=self.d0702.FakeBridge(),
                snapshots=snap,
                sleep_fn=lambda _s: None,
                manifest_override=self._settle_path_manifest(),
                force_static_ok=True,
            )
            self.assertEqual(result["transferSettle"]["state"], "TRANSFER_COMPLETED")
            self.assertTrue(result["afterCache"]["preexistingOk"])
            self.assertTrue(result["afterPrefsCheck"]["ok"])
            self.assertEqual(
                result["afterPrefsCheck"]["known_user_ids"],
                ["10", "9", "12"],
            )

    def test_execute_settle_failed_is_transfer_failed_not_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                [
                    "--repo",
                    str(ROOT),
                    "--evidence-dir",
                    tmp,
                    "--execute",
                    "--skip-maestro",
                ]
            )
            snap = self._matching_snapshots()
            failed_row = self._p13_row("failed")
            snap["settle_queue_polls"] = [
                {"ok": True, "rows": [failed_row], "rowCount": 1}
            ]
            snap["settle_poll_s"] = 0
            snap["after"] = {
                "takes": snap["takes"],
                "cache": snap["cache"],
                "prefs": snap["prefs"],
                "queue": {"ok": True, "rows": [failed_row], "rowCount": 1},
            }
            result = self.m.run(
                args,
                bridge=self.d0702.FakeBridge(),
                snapshots=snap,
                sleep_fn=lambda _s: None,
                manifest_override=self._settle_path_manifest(),
                force_static_ok=True,
            )
            self.assertEqual(result["outcome"], "TRANSFER_FAILED")
            self.assertFalse(result["runtime_pass_claimed"])

    def test_execute_settle_deadline_skips_account_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self.m.parse_args(
                [
                    "--repo",
                    str(ROOT),
                    "--evidence-dir",
                    tmp,
                    "--execute",
                    "--skip-maestro",
                ]
            )
            snap = self._matching_snapshots()
            snap["settle_queue_polls"] = [
                {
                    "ok": True,
                    "rows": [self._p13_row("downloading")],
                    "rowCount": 1,
                }
            ]
            snap["settle_deadline_s"] = 0
            snap["settle_poll_s"] = 0
            snap["after"] = {
                "takes": snap["takes"],
                "cache": snap["cache"],
                "prefs": snap["prefs"],
            }
            result = self.m.run(
                args,
                bridge=self.d0702.FakeBridge(),
                snapshots=snap,
                sleep_fn=lambda _s: None,
                manifest_override=self._settle_path_manifest(),
                force_static_ok=True,
            )
            self.assertEqual(result["outcome"], "CLEANUP_UNCERTAIN")
            self.assertTrue(result["finally"].get("skipped"))
            self.assertFalse(result["runtime_pass_claimed"])

    def test_queue_sql_excludes_resume_and_credentials(self):
        self.assertNotIn("resume_data", self.m.QUEUE_SQL)
        self.assertNotIn("token", self.m.QUEUE_SQL.lower())
        self.assertNotIn("auth", self.m.QUEUE_SQL.lower())

    def test_queue_argv_serialization_matches_d0702_pattern(self):
        argv = self.m.build_queue_sqlite_argv()
        serialized = self.m.serialize_adb_shell_argv(*argv)
        self.m.assert_safe_queue_serialization(serialized)
        self.assertIn("/system/bin/sqlite3", serialized)
        self.assertIn("-readonly", serialized)
        self.assertIn(self.m.ADB_DB_PATH, serialized)
        self.assertNotIn("sh -c", serialized)
        self.assertNotIn("&&", serialized)
        # Bare unquoted SELECT would split on spaces after adb join — require quotes.
        self.assertIn("'SELECT", serialized)
        self.assertTrue(serialized.endswith(";'") or "';'" in serialized)

    def test_legacy_unsafe_sh_c_queue_form_rejected(self):
        unsafe = self.m.serialize_adb_shell_argv(
            "run-as",
            "com.eten.fluent",
            "sh",
            "-c",
            f'cd /data/user/0/com.eten.fluent && sqlite3 "{self.m.ADB_DB_PATH}" "{self.m.QUEUE_SQL}"',
        )
        with self.assertRaises(AssertionError):
            self.m.assert_safe_queue_serialization(unsafe)

    def test_cache_find_argv_is_discrete(self):
        ser = self.m.serialize_adb_shell_argv(*self.m.build_cache_find_argv())
        self.assertEqual(
            ser,
            "run-as com.eten.fluent find files/downloads -type f",
        )
        self.assertNotIn("sh -c", ser)
        self.assertNotIn("&&", ser)

    def test_sanitize_stderr_strips_tokenish(self):
        raw = "fail bearer=supersecret token=abc ?access_token=xyz&x=1"
        out = self.m.sanitize_remote_stderr(raw)
        self.assertNotIn("supersecret", out)
        self.assertNotIn("access_token=xyz", out)


if __name__ == "__main__":
    unittest.main()
