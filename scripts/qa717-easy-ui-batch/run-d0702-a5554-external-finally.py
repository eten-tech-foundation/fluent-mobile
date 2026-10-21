#!/usr/bin/env python3
"""D-0702-01 host wrapper: snapshot → Maestro → external finally restore.

Self-contained (stdlib only). Does NOT import unpublished qa717 helpers.
Device I/O runs only under --execute with an injected or default AdbBridge.
Authoring / unit tests use FakeBridge — no ADB, no Maestro, no network.

Baseline takes (authoritative for this case, not stale-10):
  owner10 selected: 10
  owner9  selected: 1
  total: 11

Outcome rules:
  - Maestro exit 0 + finally verified → may report maestro_ok / cleanup_ok
  - Cleanup failure or take drift → CLEANUP_UNCERTAIN or FAIL; never PASS
  - --dry-run / missing --execute → AUTHORING_ONLY (no device claim)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

REPO_DEFAULT = pathlib.Path(__file__).resolve().parents[2]
FLOW_REL = (
    ".maestro/flows/offline/"
    "d0702-ee-gospel-ch1-download-persist-existing-session.yaml"
)
SERIAL_DEFAULT = "emulator-5554"
EVIDENCE_REL = (
    "docs/assessments/maestro-acceptance-coverage/run-evidence/"
    "20261021-easy-ui-batch/d0702-durable"
)

# Actual preserved takes — NOT a stale "10 only" assumption.
EXPECTED_TAKE_COUNTS = {"owner10": 10, "owner9": 1, "total": 11}

PREF_KEYS = (
    "active_user_id",
    "known_user_ids",
    "10:drafting_unit",
    "12:drafting_unit",
    "9:drafting_unit",
    "ui_version",
)

TAKES_SQL = (
    "SELECT recorded_by_user_id, id, is_selected, local_file_path, sync_status "
    "FROM recordings "
    "WHERE is_selected=1 AND recorded_by_user_id IN (9,10) "
    "ORDER BY recorded_by_user_id, id;"
)

KV_SQL = (
    "SELECT key,value FROM storage WHERE key IN ("
    + ",".join(f"'{k}'" for k in PREF_KEYS)
    + ");"
)


class Bridge(Protocol):
    def shell(self, *args: str, timeout: int = 40) -> str: ...
    def run_maestro(self, flow: str, out_dir: pathlib.Path) -> int: ...


@dataclass
class FakeBridge:
    """Unit-test / authoring bridge — no device calls."""

    takes_tsv: str = (
        "10|t1|1|file:///data/user/0/com.eten.fluent/files/a.m4a|synced\n"
        "10|t2|1|file:///data/user/0/com.eten.fluent/files/b.m4a|synced\n"
        "10|t3|1|file:///data/user/0/com.eten.fluent/files/c.m4a|synced\n"
        "10|t4|1|file:///data/user/0/com.eten.fluent/files/d.m4a|synced\n"
        "10|t5|1|file:///data/user/0/com.eten.fluent/files/e.m4a|synced\n"
        "10|t6|1|file:///data/user/0/com.eten.fluent/files/f.m4a|synced\n"
        "10|t7|1|file:///data/user/0/com.eten.fluent/files/g.m4a|synced\n"
        "10|t8|1|file:///data/user/0/com.eten.fluent/files/h.m4a|synced\n"
        "10|t9|1|file:///data/user/0/com.eten.fluent/files/i.m4a|synced\n"
        "10|t10|1|file:///data/user/0/com.eten.fluent/files/j.m4a|synced\n"
        "9|t11|1|file:///data/user/0/com.eten.fluent/files/k.m4a|synced\n"
    )
    kv_csv: str = (
        "key,value\n"
        "active_user_id,12\n"
        "known_user_ids,\"[10,9,12]\"\n"
        "10:drafting_unit,verse\n"
        "12:drafting_unit,verse\n"
        "9:drafting_unit,verse\n"
        "ui_version,legacy\n"
    )
    file_hashes: dict[str, str] = field(
        default_factory=lambda: {f"t{i}": f"hash{i:02d}" for i in range(1, 12)}
    )
    hierarchy_xml: str = (
        '<?xml version="1.0"?><hierarchy>'
        '<node resource-id="home-tab-my-work"/>'
        '<node resource-id="home-settings-button"/>'
        '<node resource-id="settings-menu-active-12"/>'
        '<node resource-id="settings-menu-account-10"/>'
        '<node resource-id="settings-menu-account-9"/>'
        '<node resource-id="settings-menu-account-12"/>'
        "</hierarchy>"
    )
    maestro_exit: int = 0
    shell_calls: list[tuple] = field(default_factory=list)
    maestro_calls: list[str] = field(default_factory=list)
    fail_shell_prefix: str | None = None

    def shell(self, *args: str, timeout: int = 40) -> str:
        self.shell_calls.append(args)
        joined = " ".join(args)
        if self.fail_shell_prefix and joined.startswith(self.fail_shell_prefix):
            raise RuntimeError(f"fake shell fail: {joined}")
        if "sqlite3" in joined and "recordings" in joined:
            return self.takes_tsv.strip()
        if "sqlite3" in joined and "storage" in joined:
            return self.kv_csv.strip()
        if "sha256sum" in joined:
            # path ends with files/X.m4a — map by take letter order via basename
            m = re.search(r"files/([a-z])\.m4a", joined)
            if m:
                idx = ord(m.group(1)) - ord("a") + 1
                return f"{self.file_hashes.get(f't{idx}', 'unknown')}  -\n"
            return "deadbeef  -\n"
        if "uiautomator" in joined or "/sdcard/d0702-" in joined or joined.startswith(
            "cat "
        ):
            return self.hierarchy_xml
        if joined.startswith("settings get"):
            return "0" if "airplane" in joined else "1"
        return ""

    def run_maestro(self, flow: str, out_dir: pathlib.Path) -> int:
        self.maestro_calls.append(flow)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "run.log").write_text(f"fake maestro exit={self.maestro_exit}\n")
        return self.maestro_exit


@dataclass
class AdbBridge:
    """Real device bridge — only constructed under --execute."""

    serial: str
    adb_bin: str
    repo: pathlib.Path
    host: str = "127.0.0.1"
    port: str = "5037"

    def _adb(self) -> list[str]:
        return [
            self.adb_bin,
            "-H",
            self.host,
            "-P",
            self.port,
            "-s",
            self.serial,
        ]

    def shell(self, *args: str, timeout: int = 40) -> str:
        proc = subprocess.run(
            self._adb() + ["shell", *args],
            check=True,
            capture_output=True,
            timeout=timeout,
        )
        return proc.stdout.decode()

    def run_maestro(self, flow: str, out_dir: pathlib.Path) -> int:
        out_dir.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        adb_dir = str(pathlib.Path(self.adb_bin).parent)
        maestro_bin = pathlib.Path.home() / ".maestro" / "bin"
        env["PATH"] = f"{adb_dir}:{maestro_bin}:{env.get('PATH', '')}"
        # Serial selection contract: ANDROID_SERIAL only. scripts/maestro-test.sh
        # resolves it and injects a single --device — do not pass --device here.
        env["ANDROID_SERIAL"] = self.serial
        env["ADB_SERVER_SOCKET"] = f"tcp:{self.host}:{self.port}"
        log_path = out_dir / "run.log"
        cmd = build_maestro_test_sh_cmd(flow=flow, out_dir=out_dir)
        with log_path.open("w") as log:
            proc = subprocess.Popen(
                cmd,
                cwd=self.repo,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                return proc.wait(timeout=900)
            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    proc.kill()
                return 124


def build_maestro_test_sh_cmd(
    *,
    flow: str,
    out_dir: pathlib.Path | str,
    config: str = ".maestro/config.yaml",
) -> list[str]:
    """Argv for scripts/maestro-test.sh — never includes --device/--udid.

    The wrapper always appends ``maestro test -p android --device "$SERIAL"``
    after resolving SERIAL from ANDROID_SERIAL (see scripts/maestro-test.sh).
    Passing --device here yields: option '--device' should be specified only once.
    """
    return [
        "bash",
        "scripts/maestro-test.sh",
        "--config",
        config,
        "--test-output-dir",
        str(out_dir),
        flow,
    ]


def simulate_maestro_test_sh_device_injection(
    runner_cmd: list[str], serial: str
) -> list[str]:
    """Effective ``maestro test`` argv after maestro-test.sh injects --device once.

    Mirrors scripts/maestro-test.sh line: maestro test -p android --device SERIAL ARGS...
    where ARGS are the runner-supplied tokens after the script path.
    """
    if len(runner_cmd) < 2 or runner_cmd[1] != "scripts/maestro-test.sh":
        raise ValueError(f"expected maestro-test.sh wrapper cmd, got {runner_cmd!r}")
    forwarded = list(runner_cmd[2:])
    return ["maestro", "test", "-p", "android", "--device", serial, *forwarded]


def count_cli_option(argv: list[str], option: str) -> int:
    return sum(1 for a in argv if a == option)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="D-0702 external finally host runner")
    p.add_argument("--repo", type=pathlib.Path, default=REPO_DEFAULT)
    p.add_argument("--serial", default=SERIAL_DEFAULT)
    p.add_argument("--adb-bin", default=os.environ.get("ADB_BIN", "adb"))
    p.add_argument(
        "--execute",
        action="store_true",
        help="Touch the real device (root-owned). Default is dry-run.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Force no device I/O (default when --execute omitted).",
    )
    p.add_argument(
        "--evidence-dir",
        type=pathlib.Path,
        default=None,
        help="Override evidence output directory",
    )
    p.add_argument(
        "--skip-maestro",
        action="store_true",
        help="Skip Maestro invoke (finally/snapshot path only; still not PASS).",
    )
    return p.parse_args(argv)


def parse_takes(tsv: str) -> dict[str, Any]:
    rows = []
    for line in tsv.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 5:
            continue
        owner, rid, selected, path, sync = parts[:5]
        rows.append(
            {
                "owner": int(owner),
                "id": rid,
                "is_selected": selected,
                "local_file_path": path,
                "sync_status": sync,
            }
        )
    owner10 = [r for r in rows if r["owner"] == 10]
    owner9 = [r for r in rows if r["owner"] == 9]
    return {
        "rows": rows,
        "counts": {
            "owner10": len(owner10),
            "owner9": len(owner9),
            "total": len(rows),
        },
    }


def parse_kv_csv(raw: str) -> dict[str, str]:
    lines = [ln for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return {}
    # header optional
    start = 1 if lines[0].lower().startswith("key,") else 0
    out: dict[str, str] = {}
    for ln in lines[start:]:
        if "," not in ln:
            continue
        key, value = ln.split(",", 1)
        out[key.strip()] = value.strip().strip('"')
    return out


def counts_match_expected(counts: dict[str, int]) -> bool:
    return (
        counts.get("owner10") == EXPECTED_TAKE_COUNTS["owner10"]
        and counts.get("owner9") == EXPECTED_TAKE_COUNTS["owner9"]
        and counts.get("total") == EXPECTED_TAKE_COUNTS["total"]
    )


def snapshot_takes(bridge: Bridge) -> dict[str, Any]:
    sql = shlex.quote(TAKES_SQL)
    raw = bridge.shell(
        "run-as",
        "com.eten.fluent",
        "/system/bin/sqlite3",
        "-readonly",
        "databases/default/fluent.db",
        sql,
    )
    parsed = parse_takes(raw)
    for row in parsed["rows"]:
        path = row["local_file_path"]
        rel = path.replace("file:///data/user/0/com.eten.fluent/", "")
        digest_line = bridge.shell(
            "run-as",
            "com.eten.fluent",
            "/system/bin/sha256sum",
            rel,
        )
        row["sha256"] = digest_line.split()[0] if digest_line.strip() else ""
    return parsed


def snapshot_prefs(bridge: Bridge) -> dict[str, str]:
    sql = shlex.quote(KV_SQL)
    raw = bridge.shell(
        "run-as",
        "com.eten.fluent",
        "/system/bin/sqlite3",
        "-readonly",
        "-header",
        "-csv",
        "databases/kv/__opsqlite_storage.sqlite",
        sql,
    )
    return parse_kv_csv(raw)


def dump_nodes(bridge: Bridge, label: str) -> list[dict[str, str]]:
    """Parse uiautomator hierarchy. Bridge.shell must return XML for dump/cat probes."""
    bridge.shell("uiautomator", "dump", f"/sdcard/d0702-{label}.xml")
    xml = bridge.shell("cat", f"/sdcard/d0702-{label}.xml")
    nodes: list[dict[str, str]] = []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return nodes
    for node in root.iter("node"):
        nodes.append(
            {
                "resource-id": node.attrib.get("resource-id", ""),
                "text": node.attrib.get("text", ""),
                "content-desc": node.attrib.get("content-desc", ""),
                "bounds": node.attrib.get("bounds", ""),
            }
        )
    return nodes


def has_id(nodes: list[dict[str, str]], rid: str) -> bool:
    return any(n.get("resource-id") == rid for n in nodes)


def _bounds_center(bounds: str) -> tuple[int, int] | None:
    m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds or "")
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2


def _tap_resource(
    bridge: Bridge, nodes: list[dict[str, str]], rid: str, log: list[str]
) -> bool:
    for n in nodes:
        if n.get("resource-id") != rid:
            continue
        center = _bounds_center(n.get("bounds", ""))
        if center is None:
            log.append(f"intent_tap_no_bounds:{rid}")
            return False
        x, y = center
        bridge.shell("input", "tap", str(x), str(y))
        log.append(f"tap:{rid}@{x},{y}")
        return True
    log.append(f"missing:{rid}")
    return False


def bounded_ui_restore(
    bridge: Bridge,
    *,
    max_steps: int = 24,
    sleep_fn: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    """Best-effort Home + active12 restore. No network/mic toggle, no DB writes."""
    sleep = sleep_fn or time.sleep
    log: list[str] = []
    for step in range(max_steps):
        nodes = dump_nodes(bridge, f"restore-{step}")
        if (
            has_id(nodes, "home-tab-my-work")
            and has_id(nodes, "settings-menu-active-12")
            and has_id(nodes, "settings-menu-account-10")
            and has_id(nodes, "settings-menu-account-9")
            and has_id(nodes, "settings-menu-account-12")
        ):
            log.append("verified_home_active12_cache")
            return {"ok": True, "steps": step + 1, "log": log}
        if has_id(nodes, "prepare-offline-screen") and has_id(
            nodes, "stack-header-back"
        ):
            _tap_resource(bridge, nodes, "stack-header-back", log)
            sleep(0.4)
            continue
        if has_id(nodes, "settings-menu-account-12") and not has_id(
            nodes, "settings-menu-active-12"
        ):
            _tap_resource(bridge, nodes, "settings-menu-account-12", log)
            sleep(0.5)
            continue
        if has_id(nodes, "home-settings-button") and not has_id(
            nodes, "settings-menu-account-12"
        ):
            _tap_resource(bridge, nodes, "home-settings-button", log)
            sleep(0.4)
            continue
        if has_id(nodes, "stack-header-back"):
            _tap_resource(bridge, nodes, "stack-header-back", log)
            sleep(0.4)
            continue
        log.append(f"no_progress_step_{step}")
        sleep(0.3)
    return {"ok": False, "steps": max_steps, "log": log, "error": "RESTORE_TIMEOUT"}

def compare_snapshots(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_ids = {r["id"]: r.get("sha256") for r in before.get("rows", [])}
    after_ids = {r["id"]: r.get("sha256") for r in after.get("rows", [])}
    missing = sorted(set(before_ids) - set(after_ids))
    added = sorted(set(after_ids) - set(before_ids))
    hash_drift = sorted(
        rid
        for rid in set(before_ids) & set(after_ids)
        if before_ids[rid] and after_ids[rid] and before_ids[rid] != after_ids[rid]
    )
    return {
        "missing_ids": missing,
        "added_ids": added,
        "hash_drift_ids": hash_drift,
        "ok": not missing and not added and not hash_drift,
    }


def decide_outcome(
    *,
    execute: bool,
    maestro_exit: int | None,
    baseline_ok: bool,
    finally_ok: bool,
    takes_ok: bool,
    prefs_ok: bool,
    cleanup_error: str | None,
) -> str:
    if not execute:
        return "AUTHORING_ONLY"
    if cleanup_error or not finally_ok or not takes_ok or not prefs_ok:
        return "CLEANUP_UNCERTAIN"
    if not baseline_ok:
        return "BASELINE_FAIL"
    if maestro_exit is None:
        return "SKIPPED_MAESTRO"
    if maestro_exit == 0:
        # Verified cleanup + maestro green — still not a product "PASS" claim for C51.
        return "MAESTRO_OK_CLEANUP_OK"
    return "MAESTRO_FAIL_CLEANUP_OK"


def run(
    args: argparse.Namespace,
    bridge: Bridge | None = None,
    *,
    sleep_fn: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    repo: pathlib.Path = args.repo
    evidence = args.evidence_dir or (repo / EVIDENCE_REL / "host-runner")
    evidence.mkdir(parents=True, exist_ok=True)
    flow = repo / FLOW_REL
    result: dict[str, Any] = {
        "schema": "d0702-a5554-external-finally/v1",
        "criterion": "D-0702-01",
        "serial": args.serial,
        "flow": FLOW_REL,
        "execute": bool(args.execute) and not args.dry_run,
        "expectedTakeCounts": EXPECTED_TAKE_COUNTS,
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runtime_pass_claimed": False,
        "c51_byte_arithmetic": "not_run",
    }

    if not flow.is_file():
        result["outcome"] = "MISSING_FLOW"
        result["error"] = f"flow not found: {flow}"
        _write(evidence, result)
        return result

    result["flowSha256"] = hashlib.sha256(flow.read_bytes()).hexdigest()

    execute = bool(args.execute) and not args.dry_run
    if bridge is None:
        if execute:
            bridge = AdbBridge(
                serial=args.serial, adb_bin=args.adb_bin, repo=repo
            )
        else:
            bridge = FakeBridge()

    result["bridge"] = type(bridge).__name__

    try:
        before_takes = snapshot_takes(bridge)
        before_prefs = snapshot_prefs(bridge)
    except Exception as exc:  # noqa: BLE001 — surface as uncertain, never PASS
        result["outcome"] = "SNAPSHOT_FAIL"
        result["error"] = repr(exc)
        result["runtime_pass_claimed"] = False
        _write(evidence, result)
        return result

    result["beforeTakes"] = {
        "counts": before_takes["counts"],
        "ids": [r["id"] for r in before_takes["rows"]],
        "hashes": {r["id"]: r.get("sha256") for r in before_takes["rows"]},
    }
    result["beforePrefs"] = before_prefs
    baseline_ok = counts_match_expected(before_takes["counts"])
    result["baselineOk"] = baseline_ok
    if not baseline_ok:
        result["outcome"] = "BASELINE_FAIL"
        result["error"] = (
            f"take counts {before_takes['counts']} != expected {EXPECTED_TAKE_COUNTS}"
        )
        _write(evidence, result)
        return result

    # Cache / active account soft check from KV
    active = str(before_prefs.get("active_user_id", ""))
    known = str(before_prefs.get("known_user_ids", ""))
    result["cacheProbe"] = {"active_user_id": active, "known_user_ids": known}

    maestro_exit: int | None = None
    maestro_error: str | None = None
    if execute and not args.skip_maestro:
        try:
            maestro_exit = bridge.run_maestro(
                FLOW_REL, evidence / "maestro-run"
            )
        except Exception as exc:  # noqa: BLE001
            maestro_error = repr(exc)
            maestro_exit = 1
    elif not execute:
        # dry-run simulates invoke path without device
        if not args.skip_maestro:
            maestro_exit = bridge.run_maestro(
                FLOW_REL, evidence / "maestro-run-dry"
            )
    result["maestroExit"] = maestro_exit
    if maestro_error:
        result["maestroError"] = maestro_error

    # EXTERNAL FINALLY — always attempted after Maestro (or dry-run invoke)
    cleanup_error: str | None = None
    finally_report: dict[str, Any] = {}
    after_takes: dict[str, Any] = {}
    after_prefs: dict[str, str] = {}
    takes_cmp: dict[str, Any] = {"ok": False}
    prefs_ok = False
    try:
        finally_report = bounded_ui_restore(bridge, sleep_fn=sleep_fn or (lambda _s: None))
        after_takes = snapshot_takes(bridge)
        after_prefs = snapshot_prefs(bridge)
        takes_cmp = compare_snapshots(before_takes, after_takes)
        prefs_ok = after_prefs == before_prefs
        # selections: ephemeral UI; flow restores ch1 to 0 — host cannot SQL-assert
        # chapter selection. Record UI restore result only.
        result["selectionsNote"] = (
            "Chapter selections are UI-ephemeral; nested flow restores each book "
            "to 0. Host finally guarantees Home/active12/prefs/takes, not PFO SQL."
        )
    except Exception as exc:  # noqa: BLE001
        cleanup_error = repr(exc)
        finally_report = {"ok": False, "error": cleanup_error}

    result["finally"] = finally_report
    result["afterTakes"] = {
        "counts": after_takes.get("counts"),
        "compare": takes_cmp,
    }
    result["afterPrefs"] = after_prefs
    result["prefsUnchanged"] = prefs_ok
    if cleanup_error:
        result["cleanupError"] = cleanup_error

    outcome = decide_outcome(
        execute=execute,
        maestro_exit=maestro_exit,
        baseline_ok=baseline_ok,
        finally_ok=bool(finally_report.get("ok")),
        takes_ok=bool(takes_cmp.get("ok")),
        prefs_ok=prefs_ok,
        cleanup_error=cleanup_error,
    )
    result["outcome"] = outcome
    result["runtime_pass_claimed"] = False
    if outcome == "CLEANUP_UNCERTAIN":
        result["visible"] = "CLEANUP_UNCERTAIN — do not treat as PASS"
    _write(evidence, result)
    return result


def _write(evidence: pathlib.Path, result: dict[str, Any]) -> None:
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "host-runner-result.json").write_text(
        json.dumps(result, indent=2) + "\n"
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    result = run(args)
    print(json.dumps({"outcome": result.get("outcome"), "execute": result.get("execute")}))
    outcome = result.get("outcome")
    if outcome in {"AUTHORING_ONLY", "MAESTRO_OK_CLEANUP_OK", "SKIPPED_MAESTRO"}:
        return 0 if outcome != "AUTHORING_ONLY" or not args.execute else 0
    if outcome == "AUTHORING_ONLY":
        return 0
    if outcome == "MAESTRO_FAIL_CLEANUP_OK":
        return 1
    if outcome in {"CLEANUP_UNCERTAIN", "BASELINE_FAIL", "SNAPSHOT_FAIL", "MISSING_FLOW"}:
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
