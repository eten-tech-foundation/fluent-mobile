#!/usr/bin/env python3
"""Focused tests for live-log-reader — no device, no Metro, no app launch."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

MOD_PATH = pathlib.Path(__file__).resolve().parent / "live-log-reader.py"


def load_mod():
    spec = importlib.util.spec_from_file_location("live_log_reader", MOD_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


class LiveLogReaderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = load_mod()

    def test_split_lines_cursor_no_duplicate(self):
        lines, inc = self.m.split_complete_lines("a\nb\n", "")
        self.assertEqual(lines, ["a", "b"])
        self.assertEqual(inc, "")
        lines2, inc2 = self.m.split_complete_lines("c", "partial")
        self.assertEqual(lines2, [])
        self.assertEqual(inc2, "partialc")
        lines3, inc3 = self.m.split_complete_lines("d\ne\n", "partialc")
        self.assertEqual(lines3, ["partialcd", "e"])
        self.assertEqual(inc3, "")

    def test_incremental_no_reread_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            log = tmp_p / "metro.log"
            state = tmp_p / "state.json"
            log.write_text("one\ntwo\n", encoding="utf-8")
            s0 = self.m.load_state(state)
            lines1, s1, _ = self.m.read_incremental(log, s0)
            self.assertEqual(lines1, ["one", "two"])
            self.m.save_state(state, s1)
            lines2, s2, _ = self.m.read_incremental(log, s1)
            self.assertEqual(lines2, [])
            log.write_text(log.read_text(encoding="utf-8") + "three\n", encoding="utf-8")
            lines3, s3, _ = self.m.read_incremental(log, s2)
            self.assertEqual(lines3, ["three"])
            self.assertGreater(s3["byte_offset"], s2["byte_offset"])

    def test_truncation_resets_cursor(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            log = tmp_p / "metro.log"
            log.write_text("aaaaaaaaaa\n", encoding="utf-8")
            s0 = self.m.empty_state()
            _, s1, _ = self.m.read_incremental(log, s0)
            self.assertGreater(s1["byte_offset"], 0)
            log.write_text("x\n", encoding="utf-8")  # shrink
            lines, s2, meta = self.m.read_incremental(log, s1)
            self.assertTrue(meta["truncated"])
            self.assertEqual(lines, ["x"])
            self.assertNotIn("incomplete", s2)

    def test_same_inode_equal_size_replacement_rereads(self):
        """adb logcat -d rewrite at same inode/size must not skip new records."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            log = tmp_p / "raw-logcat.txt"
            original = "AAAA\nBBBB\n"
            replacement = "CCCC\nDDDD\n"
            self.assertEqual(len(original.encode("utf-8")), len(replacement.encode("utf-8")))
            log.write_text(original, encoding="utf-8")
            inode_before = log.stat().st_ino
            s0 = self.m.empty_state()
            lines1, s1, _ = self.m.read_incremental(log, s0)
            self.assertEqual(lines1, ["AAAA", "BBBB"])
            self.assertIsNotNone(s1.get("prefix_sha256"))
            # In-place rewrite (same inode), equal size — documented logcat dump pattern.
            with log.open("r+b") as fh:
                fh.write(replacement.encode("utf-8"))
                fh.truncate()
            self.assertEqual(log.stat().st_ino, inode_before)
            self.assertEqual(log.stat().st_size, len(replacement.encode("utf-8")))
            lines2, s2, meta = self.m.read_incremental(log, s1)
            self.assertTrue(meta["truncated"])
            self.assertEqual(lines2, ["CCCC", "DDDD"])
            self.assertNotEqual(s2["prefix_sha256"], s1["prefix_sha256"])

    def test_state_secret_free_across_split_secret_line(self):
        """Split secret/signed URL/payload line must not land in state JSON."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            log = tmp_p / "metro.log"
            state = tmp_p / "cursor.json"
            receipts = tmp_p / "receipts.jsonl"
            secret_frag = (
                "LOG GET https://cdn.example/x?X-Amz-Signature=deadbeefsecret"
                "&token=abc123leak password=hunter2leak "
                '{"payload":{"nest":"bodysecret"}}'
            )
            # Incomplete line — no terminator yet
            log.write_text(secret_frag, encoding="utf-8")

            s0 = self.m.load_state(state)
            lines1, s1, _ = self.m.read_incremental(log, s0)
            self.assertEqual(lines1, [])
            self.m.save_state(state, s1)

            state_bytes = state.read_bytes()
            for banned in (
                b"deadbeefsecret",
                b"abc123leak",
                b"hunter2leak",
                b"bodysecret",
                b"incomplete",
                b"payload",
            ):
                self.assertNotIn(banned, state_bytes)
            state_obj = json.loads(state_bytes.decode("utf-8"))
            self.assertEqual(set(state_obj.keys()), {
                "schemaVersion",
                "byte_offset",
                "inode",
                "size",
                "prefix_sha256",
            })
            self.assertEqual(state_obj["byte_offset"], 0)

            # Append terminator → next call emits exactly one sanitized receipt
            with log.open("ab") as fh:
                fh.write(b"\n")

            py = sys.executable
            script = str(MOD_PATH)

            def run(action: str) -> dict:
                proc = subprocess.run(
                    [
                        py,
                        script,
                        "metro-read",
                        "--log",
                        str(log),
                        "--state",
                        str(state),
                        "--run-id",
                        "privacy-run",
                        "--action",
                        action,
                        "--receipts",
                        str(receipts),
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                return json.loads(proc.stdout.strip())

            second = run("checkpoint_secret_complete")
            self.assertEqual(second["newLines"], 1)
            third = run("checkpoint_idle")
            self.assertEqual(third["newLines"], 0)

            # State still secret-free after completion
            state_bytes2 = state.read_bytes()
            for banned in (
                b"deadbeefsecret",
                b"abc123leak",
                b"hunter2leak",
                b"bodysecret",
                b"incomplete",
            ):
                self.assertNotIn(banned, state_bytes2)

            rows = [
                json.loads(x)
                for x in receipts.read_text(encoding="utf-8").splitlines()
                if x.strip()
            ]
            self.assertEqual(len(rows), 1)
            sanitized = rows[0]["sanitizedLine"]
            self.assertNotIn("deadbeefsecret", sanitized)
            self.assertNotIn("hunter2leak", sanitized)
            self.assertNotIn("abc123leak", sanitized)
            self.assertNotIn("bodysecret", sanitized)
            # Fail-closed structured / query redaction
            self.assertTrue(
                "redacted" in sanitized.lower()
                or "?<redacted-query>" in sanitized
                or "***" in sanitized
            )

    def test_legacy_incomplete_state_rewinds_without_keeping_secret(self):
        """v1 state with incomplete secret must rewind and not rewrite the secret."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            log = tmp_p / "metro.log"
            state = tmp_p / "cursor.json"
            secret = "token=legacysecretleak"
            # Simulate v1: offset past unfinished tail, secret in incomplete
            log.write_text(secret, encoding="utf-8")
            state.write_text(
                json.dumps(
                    {
                        "byte_offset": len(secret.encode("utf-8")),
                        "incomplete": secret,
                        "inode": None,
                        "size": len(secret.encode("utf-8")),
                    }
                ),
                encoding="utf-8",
            )
            loaded = self.m.load_state(state)
            self.assertEqual(loaded["byte_offset"], 0)
            self.assertNotIn("incomplete", loaded)

            with log.open("a", encoding="utf-8") as fh:
                fh.write("\n")
            lines, s1, _ = self.m.read_incremental(log, loaded)
            self.assertEqual(len(lines), 1)
            self.m.save_state(state, s1)
            self.assertNotIn(b"legacysecretleak", state.read_bytes())
            self.assertNotIn("incomplete", json.loads(state.read_text()))

    def test_receipt_utc_run_action(self):
        r = self.m.make_receipt(
            run_id="run-abc",
            source="metro",
            action="tap_download",
            sanitized_line="hello",
            observed_at="2026-10-23T03:00:00+00:00",
            category="SyncService",
        )
        self.assertEqual(r["runId"], "run-abc")
        self.assertEqual(r["maestroAction"], "tap_download")
        self.assertEqual(r["source"], "metro")
        self.assertEqual(r["observedAtUtc"], "2026-10-23T03:00:00+00:00")
        self.assertEqual(r["sanitizedLine"], "hello")
        self.assertIn("T", r["observedAtUtc"])

    def test_multiline_native_error_sanitized(self):
        raw = (
            "AndroidRuntime: FATAL EXCEPTION: main\\n"
            "java.io.IOException: No download object available\\n"
            "Authorization: Bearer supersecret\\n"
            "at com.eten.fluent.Download.cancel(Download.java:1)"
        )
        out = self.m.sanitize_line(raw)
        self.assertNotIn("supersecret", out)
        self.assertIn("Authorization: ***", out)
        self.assertIn("IOException", out)

    def test_redact_signed_url_authorization_token_password_payload(self):
        cases = [
            (
                "GET https://cdn.example/x?X-Amz-Signature=deadbeef&token=abc",
                ["?<redacted-query>", "deadbeef"],
            ),
            ("Authorization: Bearer eyJhbGciOi.abc", ["Authorization: ***", "eyJhbGciOi"]),
            ("password=hunter2 login ok", ["password=***", "hunter2"]),
            ('{"token":"abc","password":"x"}', ["redacted:structured", "abc"]),
            (
                '{"responseBody":{"secret":"x"},"code":"ERR"}',
                ["redacted:structured", "secret"],
            ),
            ("{not-json password=z token=y", ["password=***", "password=z"]),
            ("user qa+fluent@fluent.local ok", ["<redacted-email>", "@fluent.local"]),
        ]
        for raw, (must_have, must_not) in cases:
            with self.subTest(raw=raw[:40]):
                out = self.m.sanitize_line(raw)
                self.assertIn(must_have, out)
                self.assertNotIn(must_not, out)

    def test_redact_quoted_json_token_access_refresh_cookie(self):
        """Regression: quoted JSON keys, access/refreshToken, Cookie full line."""
        cases = [
            (
                'LOG session {"token":"abc123"}',
                "abc123",
            ),
            (
                "accessToken=access-secret-value",
                "access-secret-value",
            ),
            (
                "refreshToken: refresh-secret-value",
                "refresh-secret-value",
            ),
            (
                "Cookie: a=1; sid=COOKIESECRET",
                "COOKIESECRET",
            ),
            (
                "Set-Cookie: sid=SETCOOKIESECRET; Path=/",
                "SETCOOKIESECRET",
            ),
            (
                'token="abc,def"',
                "abc,def",
            ),
            (
                "password='x,y;z'",
                "x,y;z",
            ),
        ]
        for raw, banned in cases:
            with self.subTest(raw=raw[:50]):
                out = self.m.sanitize_line(raw)
                self.assertNotIn(banned, out)
                self.assertIn("***", out)

    def test_allowlisted_tiny_json_kept_redacted(self):
        raw = '{"code":"ERR_UNEXPECTED","itemId":"13-9-aquifer-2699-image","ok":false}'
        out = self.m.sanitize_line(raw)
        self.assertIn("ERR_UNEXPECTED", out)
        self.assertIn("13-9-aquifer-2699-image", out)

    def test_emit_receipts_skips_empty(self):
        receipts = self.m.emit_receipts(
            ["", "LOG [SyncService] done", ""],
            run_id="r1",
            source="metro",
            action="after_cancel",
        )
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0]["maestroAction"], "after_cancel")
        self.assertEqual(receipts[0]["category"], "SyncService")

    def test_recommended_logcat_argv_buffers_and_utc(self):
        argv = self.m.recommended_logcat_argv("emulator-5556")
        self.assertEqual(argv[0], "adb")
        self.assertIn("-s", argv)
        self.assertIn("emulator-5556", argv)
        self.assertIn("-d", argv)
        self.assertIn("main,system,crash", argv)
        self.assertIn("threadtime,UTC", argv)

    def test_missing_log_distinct_from_quiet_nonzero(self):
        """Missing --log must report missing and fail nonzero (not quiet ok)."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            state = tmp_p / "cursor.json"
            receipts = tmp_p / "receipts.jsonl"
            missing_log = tmp_p / "does-not-exist.log"
            py = sys.executable
            script = str(MOD_PATH)
            proc = subprocess.run(
                [
                    py,
                    script,
                    "metro-read",
                    "--log",
                    str(missing_log),
                    "--state",
                    str(state),
                    "--run-id",
                    "missing-run",
                    "--action",
                    "checkpoint_missing",
                    "--receipts",
                    str(receipts),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(proc.returncode, 0)
            summary = json.loads(proc.stdout.strip())
            self.assertTrue(summary["missing"])
            self.assertFalse(summary["ok"])
            self.assertEqual(summary["newLines"], 0)

            # Quiet existing log still succeeds with missing=false.
            quiet = tmp_p / "quiet.log"
            quiet.write_text("", encoding="utf-8")
            proc2 = subprocess.run(
                [
                    py,
                    script,
                    "metro-read",
                    "--log",
                    str(quiet),
                    "--state",
                    str(state),
                    "--run-id",
                    "quiet-run",
                    "--action",
                    "checkpoint_quiet",
                    "--receipts",
                    str(receipts),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(proc2.returncode, 0)
            summary2 = json.loads(proc2.stdout.strip())
            self.assertFalse(summary2["missing"])
            self.assertTrue(summary2["ok"])
            self.assertEqual(summary2["newLines"], 0)

    def test_receipts_written_before_cursor_advances_on_failure(self):
        """If receipts append fails, cursor must not advance past those lines."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            log = tmp_p / "metro.log"
            state = tmp_p / "cursor.json"
            receipts = tmp_p / "receipts.jsonl"
            log.write_text("LOG [SyncService] keep-me\n", encoding="utf-8")
            ns = self.m.argparse.Namespace(
                log=str(log),
                state=str(state),
                run_id="receipt-order",
                action="checkpoint_fail",
                receipts=str(receipts),
            )
            with mock.patch.object(
                self.m, "append_receipts", side_effect=OSError("disk full")
            ):
                with self.assertRaises(OSError):
                    self.m.cmd_metro_read(ns)
            self.assertFalse(state.exists())
            # Retry without failure must still emit the line.
            code = self.m.cmd_metro_read(ns)
            self.assertEqual(code, 0)
            rows = [
                json.loads(x)
                for x in receipts.read_text(encoding="utf-8").splitlines()
                if x.strip()
            ]
            self.assertEqual(len(rows), 1)
            self.assertIn("keep-me", rows[0]["sanitizedLine"])

    def test_cli_synthetic_increment_twice_new_only(self):
        """Append harmless synthetic lines; invoke reader twice → new-only counts."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_p = pathlib.Path(tmp)
            log = tmp_p / "sample-metro.log"
            state = tmp_p / "cursor.json"
            receipts = tmp_p / "receipts.jsonl"
            log.write_text(
                "LOG [SyncService] baseline line\n", encoding="utf-8"
            )
            py = sys.executable
            script = str(MOD_PATH)

            def run(action: str) -> dict:
                proc = subprocess.run(
                    [
                        py,
                        script,
                        "metro-read",
                        "--log",
                        str(log),
                        "--state",
                        str(state),
                        "--run-id",
                        "synthetic-run",
                        "--action",
                        action,
                        "--receipts",
                        str(receipts),
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                return json.loads(proc.stdout.strip())

            first = run("checkpoint_a")
            self.assertEqual(first["newLines"], 1)
            # Harmless synthetic increment (no secrets)
            with log.open("a", encoding="utf-8") as fh:
                fh.write("LOG [DownloadQueueWorker] synthetic progress item=demo\n")
                fh.write("LOG [prepareOffline] synthetic cancel restored CTA\n")
            second = run("checkpoint_b")
            self.assertEqual(second["newLines"], 2)
            third = run("checkpoint_c")
            self.assertEqual(third["newLines"], 0)

            lines = receipts.read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 3)
            actions = [json.loads(x)["maestroAction"] for x in lines]
            self.assertEqual(
                actions, ["checkpoint_a", "checkpoint_b", "checkpoint_b"]
            )
            for x in lines:
                obj = json.loads(x)
                self.assertEqual(obj["runId"], "synthetic-run")
                self.assertIn("observedAtUtc", obj)
                self.assertNotIn("password=", obj["sanitizedLine"].lower())


if __name__ == "__main__":
    unittest.main()
