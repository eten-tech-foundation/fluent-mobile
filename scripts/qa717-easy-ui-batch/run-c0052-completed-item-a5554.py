#!/usr/bin/env python3
"""C-0052-05 PART: completed-item green check on A5554 (no transfer).

Reuses D-0702 AdbBridge / FakeBridge / bounded_ui_restore / take+prefs snapshots.
Does NOT tap Download/Pause/Resume/Cancel. Counts-only cache proof (no fresh hash
unless --hash-takes). Records part criterion only — full C-0052-05 remains incomplete.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pathlib
import shlex
import sys
import time
from typing import Any

HERE = pathlib.Path(__file__).resolve().parent
REPO_DEFAULT = HERE.parents[1]
FLOW_REL = (
    ".maestro/flows/qa-warm-temp/"
    "c0052-completed-item-greencheck-existing-session.yaml"
)
SERIAL_DEFAULT = "emulator-5554"
EVIDENCE_REL = (
    "docs/assessments/maestro-acceptance-coverage/run-evidence/"
    "c0052-completed-item-20261021"
)
D0702_PATH = HERE / "run-d0702-a5554-external-finally.py"
ADB_DB_PATH = "databases/default/fluent.db"
CACHE_ROOT_REL = "files/downloads"
EXPECTED_COMPLETED = 205
EXPECTED_CACHE_TOTAL = 225
EXPECTED_CACHE_P13 = 206
EXPECTED_CACHE_OLD = 19
EXPECTED_ACTIVE_TRANSFER = 0


def load_d0702():
    spec = importlib.util.spec_from_file_location("d0702_runner", D0702_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def queue_status_counts(bridge, d0702) -> dict[str, int]:
    sql = (
        "SELECT status, COUNT(*) FROM download_queue GROUP BY status;"
    )
    raw = bridge.shell(
        "run-as",
        "com.eten.fluent",
        "/system/bin/sqlite3",
        "-readonly",
        ADB_DB_PATH,
        shlex.quote(sql),
    )
    out: dict[str, int] = {}
    for line in raw.splitlines():
        if "|" not in line:
            continue
        status, count = line.split("|", 1)
        out[status.strip()] = int(count.strip())
    return out


def project13_completed_ids(bridge) -> list[str]:
    sql = (
        "SELECT id FROM download_queue WHERE project_id=13 AND status='completed' "
        "ORDER BY queue_order, id;"
    )
    raw = bridge.shell(
        "run-as",
        "com.eten.fluent",
        "/system/bin/sqlite3",
        "-readonly",
        ADB_DB_PATH,
        shlex.quote(sql),
    )
    return [ln.strip() for ln in raw.splitlines() if ln.strip()]


def cache_file_paths(bridge) -> list[str]:
    raw = bridge.shell(
        "run-as",
        "com.eten.fluent",
        "find",
        CACHE_ROOT_REL,
        "-type",
        "f",
    )
    return [ln.strip() for ln in raw.splitlines() if ln.strip()]


def cache_counts(paths: list[str]) -> dict[str, int]:
    p13 = sum(1 for p in paths if "/13/" in p)
    old = sum(1 for p in paths if "/8/" in p or "/12/" in p)
    return {"total": len(paths), "project13": p13, "old_8_12": old}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="C-0052-05 completed green-check host")
    p.add_argument("--repo", type=pathlib.Path, default=REPO_DEFAULT)
    p.add_argument("--serial", default=SERIAL_DEFAULT)
    p.add_argument("--adb-bin", default=os.environ.get("ADB_BIN", "adb"))
    p.add_argument("--execute", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--evidence-dir", type=pathlib.Path, default=None)
    p.add_argument("--skip-maestro", action="store_true")
    p.add_argument(
        "--hash-takes",
        action="store_true",
        help="Also sha256 takes (default: counts-only).",
    )
    return p.parse_args(argv)


def run(args: argparse.Namespace) -> dict[str, Any]:
    d0702 = load_d0702()
    repo: pathlib.Path = args.repo
    evidence = args.evidence_dir or (repo / EVIDENCE_REL)
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "ui").mkdir(exist_ok=True)
    (evidence / "postflight").mkdir(exist_ok=True)
    flow = repo / FLOW_REL
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    result: dict[str, Any] = {
        "schema": "c0052-completed-item-a5554/v1",
        "case": "C-0052-05",
        "branch": "completed-item-green-check",
        "part_only": True,
        "full_criterion_complete": False,
        "remaining_branches": ["active progress ring", "untouched pre-download chrome"],
        "serial": args.serial,
        "flow": FLOW_REL,
        "started_utc": started,
        "execute": bool(args.execute) and not args.dry_run,
        "runtime_pass_claimed": False,
        "forbidden_actions": [
            "Download",
            "Pause",
            "Resume",
            "Cancel",
            "network",
            "permissions",
            "auth",
            "capture",
            "upload",
            "delete",
            "cacheclear",
            "Metroreload",
        ],
    }
    (evidence / "started.txt").write_text(f"STARTED={started}\n")

    if not flow.is_file():
        result["outcome"] = "MISSING_FLOW"
        result["error"] = f"flow not found: {flow}"
        _write(evidence, result)
        return result

    execute = bool(args.execute) and not args.dry_run
    if execute:
        bridge = d0702.AdbBridge(
            serial=args.serial, adb_bin=args.adb_bin, repo=repo
        )
    else:
        bridge = d0702.FakeBridge()
    result["bridge"] = type(bridge).__name__
    sleep = time.sleep if execute else (lambda _s: None)

    # --- readonly preflight ---
    try:
        if args.hash_takes:
            before_takes = d0702.snapshot_takes(bridge)
        else:
            sql = shlex.quote(d0702.TAKES_SQL)
            raw = bridge.shell(
                "run-as",
                "com.eten.fluent",
                "/system/bin/sqlite3",
                "-readonly",
                ADB_DB_PATH,
                sql,
            )
            before_takes = d0702.parse_takes(raw)
        before_prefs = d0702.snapshot_prefs(bridge)
        q_counts = queue_status_counts(bridge, d0702)
        completed_ids = project13_completed_ids(bridge)
        cache_paths = cache_file_paths(bridge)
        c_counts = cache_counts(cache_paths)
    except Exception as exc:  # noqa: BLE001
        result["outcome"] = "SNAPSHOT_FAIL"
        result["error"] = repr(exc)
        _write(evidence, result)
        return result

    active_transfer = sum(
        q_counts.get(s, 0) for s in ("queued", "downloading", "paused")
    )
    baseline_ok = d0702.counts_match_expected(before_takes["counts"])
    queue_ok = (
        q_counts.get("completed", 0) == EXPECTED_COMPLETED
        and len(completed_ids) == EXPECTED_COMPLETED
        and active_transfer == EXPECTED_ACTIVE_TRANSFER
    )
    cache_ok = (
        c_counts["total"] == EXPECTED_CACHE_TOTAL
        and c_counts["project13"] == EXPECTED_CACHE_P13
        and c_counts["old_8_12"] == EXPECTED_CACHE_OLD
    )
    prefs_probe = {
        "active_user_id": before_prefs.get("active_user_id"),
        "known_user_ids": before_prefs.get("known_user_ids"),
    }
    result["preflight"] = {
        "takeCounts": before_takes["counts"],
        "baselineOk": baseline_ok,
        "prefs": prefs_probe,
        "queueStatusCounts": q_counts,
        "project13CompletedCount": len(completed_ids),
        "activeTransferCount": active_transfer,
        "queueOk": queue_ok,
        "cacheCounts": c_counts,
        "cacheOk": cache_ok,
        "completedIdSample": completed_ids[:8],
        "completedIdTail": completed_ids[-4:],
    }
    (evidence / "preflight" / "host-preflight.json").write_text(
        json.dumps(result["preflight"], indent=2) + "\n"
    )
    (evidence / "preflight" / "completed-queue-ids.txt").write_text(
        "\n".join(completed_ids) + ("\n" if completed_ids else "")
    )

    if not (baseline_ok and queue_ok and cache_ok):
        result["outcome"] = "PREFLIGHT_FAIL"
        result["error"] = "baseline/queue/cache mismatch"
        _write(evidence, result)
        return result

    preflight_home = d0702.normalize_to_closed_home(
        bridge, sleep_fn=sleep, label="c0052-preflight"
    )
    result["preflightHome"] = {
        "ok": preflight_home.get("ok"),
        "error": preflight_home.get("error"),
        "log": preflight_home.get("log"),
    }
    if not preflight_home.get("ok"):
        result["outcome"] = "PREFLIGHT_FAIL"
        result["error"] = preflight_home.get("error")
        _write(evidence, result)
        return result

    # --- maestro (≤2 min budget tracked) ---
    maestro_exit: int | None = None
    nav_started = time.time()
    if execute and not args.skip_maestro:
        maestro_exit = bridge.run_maestro(FLOW_REL, evidence / "ui" / "maestro-run")
    elif not execute and not args.skip_maestro:
        maestro_exit = bridge.run_maestro(
            FLOW_REL, evidence / "ui" / "maestro-run-dry"
        )
    nav_elapsed = time.time() - nav_started
    result["maestroExit"] = maestro_exit
    result["navElapsedSec"] = round(nav_elapsed, 2)
    result["navBudgetSec"] = 120
    result["navWithinBudget"] = nav_elapsed <= 120

    # Hierarchy probe after maestro (best-effort; restore still required)
    greencheck: dict[str, Any] = {"probed": False}
    try:
        nodes = d0702.dump_nodes(bridge, "c0052-post-maestro")
        completed_nodes = [
            n
            for n in nodes
            if n.get("resource-id") == "resource-status-completed"
            or n.get("resource-id") == "resource-customize-on-device-check"
        ]
        greencheck = {
            "probed": True,
            "completedStatusNodeCount": len(completed_nodes),
            "hasResourceStatusCompleted": any(
                n.get("resource-id") == "resource-status-completed" for n in nodes
            ),
            "hasCustomizeOnDeviceCheck": any(
                n.get("resource-id") == "resource-customize-on-device-check"
                for n in nodes
            ),
            "sample": completed_nodes[:6],
        }
    except Exception as exc:  # noqa: BLE001
        greencheck = {"probed": True, "error": repr(exc)}
    result["greenCheckProbeAfterMaestro"] = greencheck

    # Maestro assert is the primary UI proof; post-nav probe may be after deselect.
    ui_ok = maestro_exit == 0
    result["completedGreenCheckUiOk"] = ui_ok
    result["correlation"] = {
        "retainedCompletedQueueIds": len(completed_ids),
        "expected": EXPECTED_COMPLETED,
        "matchedCount": len(completed_ids) == EXPECTED_COMPLETED,
        "note": (
            "UI assertVisible resource-status-completed while Matthew1 resources "
            "visible; correlated to retained project13 completed queue IDs "
            f"({EXPECTED_COMPLETED}). Not selection/Total/complete-banner substitute."
        ),
    }

    # --- external finally restore to Home12 ---
    cleanup_error: str | None = None
    finally_report: dict[str, Any] = {}
    after_takes: dict[str, Any] = {}
    after_prefs: dict[str, str] = {}
    takes_ok = False
    prefs_ok = False
    after_queue_ok = False
    after_cache_ok = False
    try:
        finally_report = d0702.bounded_ui_restore(bridge, sleep_fn=sleep)
        if args.hash_takes:
            after_takes = d0702.snapshot_takes(bridge)
            takes_cmp = d0702.compare_snapshots(before_takes, after_takes)
            takes_ok = bool(takes_cmp.get("ok"))
        else:
            sql = shlex.quote(d0702.TAKES_SQL)
            raw = bridge.shell(
                "run-as",
                "com.eten.fluent",
                "/system/bin/sqlite3",
                "-readonly",
                ADB_DB_PATH,
                sql,
            )
            after_takes = d0702.parse_takes(raw)
            takes_ok = after_takes["counts"] == before_takes["counts"]
            takes_cmp = {
                "ok": takes_ok,
                "mode": "counts_only",
                "before": before_takes["counts"],
                "after": after_takes["counts"],
            }
        after_prefs = d0702.snapshot_prefs(bridge)
        prefs_ok = after_prefs == before_prefs
        aq = queue_status_counts(bridge, d0702)
        ac = cache_counts(cache_file_paths(bridge))
        after_queue_ok = (
            aq.get("completed", 0) == EXPECTED_COMPLETED
            and sum(aq.get(s, 0) for s in ("queued", "downloading", "paused")) == 0
        )
        after_cache_ok = (
            ac["total"] == EXPECTED_CACHE_TOTAL
            and ac["project13"] == EXPECTED_CACHE_P13
        )
        result["postflight"] = {
            "takesCompare": takes_cmp,
            "prefsUnchanged": prefs_ok,
            "queueStatusCounts": aq,
            "queueOk": after_queue_ok,
            "cacheCounts": ac,
            "cacheOk": after_cache_ok,
        }
    except Exception as exc:  # noqa: BLE001
        cleanup_error = repr(exc)
        finally_report = {"ok": False, "error": cleanup_error}
        result["cleanupError"] = cleanup_error

    result["finally"] = finally_report
    ended = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    result["ended_utc"] = ended

    finally_ok = bool(finally_report.get("ok"))
    if not execute:
        outcome = "AUTHORING_ONLY"
    elif cleanup_error or not finally_ok or not takes_ok or not prefs_ok:
        outcome = "CLEANUP_UNCERTAIN"
    elif not ui_ok:
        outcome = "MAESTRO_FAIL_CLEANUP_OK" if finally_ok else "MAESTRO_FAIL"
    elif not (after_queue_ok and after_cache_ok):
        outcome = "CLEANUP_UNCERTAIN"
    else:
        outcome = "PART_COMPLETED_GREENCHECK_OK_CLEANUP_OK"

    result["outcome"] = outcome
    result["visible"] = (
        f"{outcome} — C-0052-05 PART completed-green-check only; "
        "active-ring + untouched still incomplete; not full criterion PASS"
    )
    _write(evidence, result)
    (evidence / "started.txt").write_text(
        f"STARTED={started}\nENDED={ended}\nOUTCOME={outcome}\n"
    )
    return result


def _write(evidence: pathlib.Path, result: dict[str, Any]) -> None:
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "host-runner-result.json").write_text(
        json.dumps(result, indent=2) + "\n"
    )
    print(
        json.dumps(
            {
                "started": result.get("started_utc"),
                "case": result.get("case"),
                "branch": result.get("branch"),
                "outcome": result.get("outcome"),
                "maestroExit": result.get("maestroExit"),
                "navElapsedSec": result.get("navElapsedSec"),
                "finallyOk": (result.get("finally") or {}).get("ok"),
            }
        ),
        flush=True,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    result = run(args)
    outcome = result.get("outcome")
    if outcome in {
        "AUTHORING_ONLY",
        "PART_COMPLETED_GREENCHECK_OK_CLEANUP_OK",
    }:
        return 0
    if outcome == "MAESTRO_FAIL_CLEANUP_OK":
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
