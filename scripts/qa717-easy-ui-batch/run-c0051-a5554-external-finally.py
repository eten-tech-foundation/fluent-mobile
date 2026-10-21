#!/usr/bin/env python3
"""C-0051-06 host: static guard → runtime admit → Maestro → external finally.

Reuses D-0702 AdbBridge / FakeBridge / take+prefs / bounded_ui_restore via
importlib (unchanged dependency). Adds queue + files/downloads cache snapshots
and strict runtime admission against packaged baselines.

Never claims runtime PASS from dry-run / FakeBridge. --execute requires live
admission PASS then Maestro; Pause/Cancel not mandatory if transfer completes.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import tempfile
import urllib.parse
from typing import Any

HERE = pathlib.Path(__file__).resolve().parent
REPO_DEFAULT = HERE.parents[1]
FLOW_REL = (
    ".maestro/flows/offline/c0051-matthew1-small-download-existing-session.yaml"
)
SERIAL_DEFAULT = "emulator-5554"
EVIDENCE_REL = (
    "docs/assessments/maestro-acceptance-coverage/run-evidence/"
    "20261021-easy-ui-batch/c0051-matthew1-download"
)
MANIFEST_REL = ".maestro/fixtures/c0051-matthew1-small-download.manifest.json"
D0702_PATH = HERE / "run-d0702-a5554-external-finally.py"
GUARD_REL = "scripts/maestro-fixture-guard.cjs"

# App-relative DB path (run-as cwd = app data). Same as D-0702 / 755 helpers.
ADB_DB_PATH = "databases/default/fluent.db"
CACHE_ROOT_REL = "files/downloads"

# download_queue.status enum from src/types/download/types.ts + repository.
# Do NOT SELECT resume_data / credentials / token columns.
QUEUE_SQL = (
    "SELECT id, project_id, user_id, tier, kind, resource_name, label, "
    "source_url, status, progress, bytes_total, local_file_path, resource_id, "
    "book_code, start_chapter, end_chapter, file_ext "
    "FROM download_queue "
    "ORDER BY queue_order, id;"
)

# Active transfer statuses — poll until none remain for owned project13 rows.
QUEUE_ACTIVE_STATUSES = frozenset({"queued", "downloading"})
# Paused is terminal for this case (no auto-Resume); treat as uncertain.
QUEUE_PAUSED_STATUS = "paused"
QUEUE_FAILED_STATUSES = frozenset({"failed", "cancelled"})
QUEUE_OK_STATUS = "completed"
SETTLE_DEADLINE_S = 180
SETTLE_POLL_S = 2.0


def load_d0702():
    spec = importlib.util.spec_from_file_location("d0702_runner", D0702_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def strip_url(url: str | None) -> str | None:
    if not url:
        return url
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def serialize_adb_shell_argv(*args: str) -> str:
    """Mirror AdbBridge: ``adb shell`` space-joins argv; quoting must be in-band.

    Remote metacharacters (spaces, ``&&``, SQL) are unsafe unless embedded via
    ``shlex.quote`` inside an argv element (D-0702 / 755 pattern).
    """
    return " ".join(args)


def sanitize_remote_stderr(text: str) -> str:
    """Drop likely secrets from helper failure text (tokens, bearer, query keys)."""
    cleaned = re.sub(
        r"(?i)(authorization|bearer|token|password)=\S+", r"\1=***", text
    )
    cleaned = re.sub(
        r"[?&]([A-Za-z0-9_]*(?:token|key|secret|sig)[A-Za-z0-9_]*)=[^&\s]+",
        r"?\1=***",
        cleaned,
    )
    return cleaned[-800:]


def build_queue_sqlite_argv(sql: str = QUEUE_SQL) -> tuple[str, ...]:
    """Readonly queue SELECT argv — same shape as D-0702 snapshot_takes."""
    return (
        "run-as",
        "com.eten.fluent",
        "/system/bin/sqlite3",
        "-readonly",
        ADB_DB_PATH,
        shlex.quote(sql),
    )


def build_cache_find_argv() -> tuple[str, ...]:
    return (
        "run-as",
        "com.eten.fluent",
        "find",
        CACHE_ROOT_REL,
        "-type",
        "f",
    )


def build_sha256_argv(rel_path: str) -> tuple[str, ...]:
    return ("run-as", "com.eten.fluent", "/system/bin/sha256sum", rel_path)


def build_byte_count_argv(rel_path: str) -> tuple[str, ...]:
    # toybox/busybox ``wc -c PATH`` — discrete argv, no sh -c.
    return ("run-as", "com.eten.fluent", "wc", "-c", rel_path)


def assert_safe_queue_serialization(serialized: str) -> None:
    """Fail closed if queue argv would split SQL / use unsafe sh -c cd&& form."""
    if " sh -c " in f" {serialized} " or serialized.startswith("sh -c"):
        raise AssertionError("queue helper must not use sh -c")
    if "&&" in serialized:
        raise AssertionError("queue helper must not embed && (adb shell joins argv)")
    if "resume_data" in serialized.lower():
        raise AssertionError("queue SQL must not select resume_data")
    # SQL must appear as a single shlex-quoted token in the joined remote line.
    if shlex.quote(QUEUE_SQL) not in serialized:
        raise AssertionError("queue SQL missing in-band shlex.quote")
    if "-readonly" not in serialized:
        raise AssertionError("queue sqlite3 must pass -readonly")


def queue_rows_for_project(rows: list[dict[str, Any]], project_id: str = "13") -> list[dict[str, Any]]:
    out = []
    for r in rows or []:
        if str(r.get("project_id", "")).strip() == str(project_id):
            out.append(r)
    return out


def classify_queue_settle(
    rows: list[dict[str, Any]], *, project_id: str = "13"
) -> dict[str, Any]:
    """Classify project13 queue terminal state (no device I/O).

    Policy (DownloadQueueStatus):
      - active: queued|downloading → still settling
      - paused: not settled (auto-resume may continue); poll until terminal/deadline → CLEANUP_UNCERTAIN
      - any failed|cancelled → TRANSFER_FAILED (do not claim complete)
      - all completed (and ≥1 row) → TRANSFER_COMPLETED
      - no project13 rows → NO_PROJECT13_ROWS (uncertain after Download)
    """
    owned = queue_rows_for_project(rows, project_id)
    statuses = [str(r.get("status") or "") for r in owned]
    summary = {
        "projectId": project_id,
        "rowCount": len(owned),
        "statuses": statuses,
        "statusCounts": {
            s: statuses.count(s) for s in sorted(set(statuses))
        },
        "rows": [
            {
                "id": r.get("id"),
                "resource_id": r.get("resource_id"),
                "resource_name": r.get("resource_name"),
                "kind": r.get("kind"),
                "book_code": r.get("book_code"),
                "start_chapter": r.get("start_chapter"),
                "end_chapter": r.get("end_chapter"),
                "bytes_total": r.get("bytes_total"),
                "local_file_path": r.get("local_file_path"),
                "status": r.get("status"),
                "source_url_stripped": r.get("source_url_stripped"),
            }
            for r in owned
        ],
    }
    if not owned:
        return {
            **summary,
            "settled": True,
            "ok": False,
            "state": "NO_PROJECT13_ROWS",
            "uiRestoreSafe": False,
        }
    active = [s for s in statuses if s in QUEUE_ACTIVE_STATUSES]
    if active:
        return {
            **summary,
            "settled": False,
            "ok": False,
            "state": "ACTIVE",
            "uiRestoreSafe": False,
        }
    if QUEUE_PAUSED_STATUS in statuses:
        # Auto-resume may continue paused rows — keep polling until terminal/deadline.
        return {
            **summary,
            "settled": False,
            "ok": False,
            "state": "PAUSED",
            "uiRestoreSafe": False,
        }
    failed = [s for s in statuses if s in QUEUE_FAILED_STATUSES]
    if failed:
        return {
            **summary,
            "settled": True,
            "ok": False,
            "state": "TRANSFER_FAILED",
            "uiRestoreSafe": True,
        }
    if all(s == QUEUE_OK_STATUS for s in statuses):
        return {
            **summary,
            "settled": True,
            "ok": True,
            "state": "TRANSFER_COMPLETED",
            "uiRestoreSafe": True,
        }
    return {
        **summary,
        "settled": True,
        "ok": False,
        "state": "UNKNOWN_STATUSES",
        "uiRestoreSafe": False,
    }


def wait_for_queue_settle(
    *,
    poll_queue,
    project_id: str = "13",
    deadline_s: float = SETTLE_DEADLINE_S,
    poll_s: float = SETTLE_POLL_S,
    sleep_fn=None,
    clock_fn=None,
) -> dict[str, Any]:
    """Bounded poll until project13 has no queued/downloading rows."""
    import time as _time

    sleep = sleep_fn or _time.sleep
    now = clock_fn or _time.time
    start = now()
    polls: list[dict[str, Any]] = []
    last: dict[str, Any] = {
        "settled": False,
        "ok": False,
        "state": "ACTIVE",
        "uiRestoreSafe": False,
        "rows": [],
        "statuses": [],
    }
    while True:
        queue = poll_queue()
        rows = queue.get("rows") or []
        last = classify_queue_settle(rows, project_id=project_id)
        polls.append(
            {
                "elapsed": round(now() - start, 3),
                "state": last["state"],
                "statuses": list(last.get("statuses") or []),
            }
        )
        if last.get("settled"):
            return {
                **last,
                "deadlineExhausted": False,
                "polls": polls,
                "elapsedS": round(now() - start, 3),
            }
        if now() - start >= deadline_s:
            return {
                **last,
                "settled": False,
                "ok": False,
                "state": "DEADLINE_EXHAUSTED",
                "uiRestoreSafe": False,
                "deadlineExhausted": True,
                "polls": polls,
                "elapsedS": round(now() - start, 3),
            }
        sleep(poll_s)


def prefs_match_baseline(prefs: dict[str, str], baselines: dict[str, Any]) -> dict[str, Any]:
    active = str(prefs.get("active_user_id", "")).strip()
    known_raw = str(prefs.get("known_user_ids", "")).strip().strip('"')
    known_parts = [
        p.strip()
        for p in known_raw.replace("[", "").replace("]", "").split(",")
        if p.strip()
    ]
    active_ok = active == baselines["prefsActive"]
    known_ok = sorted(known_parts) == sorted(baselines["prefsKnown"])
    return {
        "ok": active_ok and known_ok,
        "active_user_id": active,
        "known_user_ids": known_parts,
        "wantActive": baselines["prefsActive"],
        "wantKnown": baselines["prefsKnown"],
    }


def load_manifest(repo: pathlib.Path) -> dict[str, Any]:
    return json.loads((repo / MANIFEST_REL).read_text(encoding="utf-8"))


def load_baselines(repo: pathlib.Path, manifest: dict[str, Any]) -> dict[str, Any]:
    b = manifest["baseline"]
    takes = json.loads((repo / b["takes"]).read_text(encoding="utf-8"))
    hashes_txt = (repo / b["cacheHashes"]).read_text(encoding="utf-8")
    bytes_txt = (repo / b["cacheBytes"]).read_text(encoding="utf-8")
    cache_hashes: dict[str, str] = {}
    for line in hashes_txt.splitlines():
        line = line.strip()
        if not line:
            continue
        digest, path = line.split(None, 1)
        cache_hashes[path.strip()] = digest.strip()
    cache_bytes: dict[str, int] = {}
    for line in bytes_txt.splitlines():
        line = line.strip()
        if not line:
            continue
        size_s, path = line.split(None, 1)
        cache_bytes[path.strip()] = int(size_s)
    return {
        "takes": takes,
        "cacheHashes": cache_hashes,
        "cacheBytes": cache_bytes,
        "queueRowsBefore": int(b["queueRowsBefore"]),
        "cacheFileCount": int(b["cacheFileCount"]),
        "prefsActive": str(b["prefsActive"]),
        "prefsKnown": [str(x) for x in b["prefsKnown"]],
        "maxBytes": int(manifest["admission"]["maxBytes"]),
    }


def admit_runtime_from_snapshots(
    *,
    queue: dict[str, Any],
    takes: dict[str, Any],
    cache: dict[str, Any],
    prefs: dict[str, str],
    baselines: dict[str, Any],
    manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure runtime admission — no device I/O."""
    reasons: list[str] = []
    adm = (manifest or {}).get("admission") or {}
    payload = (manifest or {}).get("payload") or {}

    # Unknown/incomplete catalog sizes are never admissible (#756).
    # Missing manifest / non all-known-complete / incomplete labels / incomplete
    # oracle → fail closed (do not skip gates when manifest is absent).
    completeness = str(
        adm.get("sizeCompleteness") or payload.get("sizeCompleteness") or ""
    ).strip()
    if manifest is None:
        reasons.append("manifest_missing_fail_closed")
    elif completeness != "all-known-complete":
        reasons.append(
            f"size_completeness_nonadmissible:{completeness or '(missing)'}"
        )
    if manifest is not None and adm.get("requireCompleteKnownSizes") is not True:
        reasons.append("requireCompleteKnownSizes_missing")
    for group in payload.get("observedGroups") or []:
        for raw in group.get("items") or []:
            label = str(raw)
            if re.search(r"\b0\s*B\b|\bUnknown\b|\bSize incomplete\b", label, re.I):
                reasons.append(f"unknown_zero_size_label:{label}")
                continue
            if "Included" in label:
                continue
            if not re.search(r"\b\d+(?:\.\d+)?\s*(?:B|KB|MB|GB)\b", label, re.I):
                reasons.append(f"size_label_not_known:{label}")
    # Never treat after-download bytes as a pre-download oracle.
    if payload.get("afterDownloadBytesUsedForAdmission") is True:
        reasons.append("after_download_bytes_backfill_forbidden")
    oracle = payload.get("predownloadSizeOracle")
    if manifest is None or not isinstance(oracle, dict) or oracle.get("complete") is not True:
        reasons.append("predownload_oracle_unavailable_fail_closed")

    row_count = int(queue.get("rowCount") or 0)
    if not queue.get("ok"):
        reasons.append(f"queue_snapshot_failed:{queue.get('error')}")
    elif row_count != baselines["queueRowsBefore"]:
        reasons.append(
            f"queue_rows={queue.get('rowCount')} want {baselines['queueRowsBefore']}"
        )
        # Current device retains the audited 205-row terminal queue — refuse rerun.
        if row_count >= 205:
            reasons.append("fresh_fixture_refused:terminal_queue_present")
    if row_count > baselines["queueRowsBefore"]:
        reasons.append("fresh_fixture_refused:queue_not_empty")

    take_ids = takes.get("ids") or [r.get("id") for r in takes.get("rows") or []]
    take_hashes = takes.get("hashes") or {
        r["id"]: r.get("sha256") for r in takes.get("rows") or [] if r.get("id")
    }
    exp = baselines["takes"]
    if sorted(take_ids) != sorted(exp["ids"]):
        reasons.append("take_ids_mismatch")
    for rid, digest in exp["hashes"].items():
        if take_hashes.get(rid) != digest:
            reasons.append(f"take_hash_mismatch:{rid}")

    cache_map = {
        f["path"]: f for f in cache.get("files") or [] if f.get("path")
    }
    if len(cache_map) != baselines["cacheFileCount"]:
        reasons.append(
            f"cache_count={len(cache_map)} want {baselines['cacheFileCount']}"
        )
    for path, digest in baselines["cacheHashes"].items():
        row = cache_map.get(path)
        if row is None:
            reasons.append(f"cache_missing:{path}")
        elif row.get("sha256") != digest:
            reasons.append(f"cache_hash_mismatch:{path}")
        else:
            try:
                got = int(row.get("bytes") or -1)
            except ValueError:
                got = -1
            want = baselines["cacheBytes"].get(path)
            if want is not None and got != want:
                reasons.append(f"cache_bytes_mismatch:{path}:{got}!={want}")

    # Preexisting only under 8/ and 12/; project13 must not already exist as
    # resource content (meta-only baselines). New 13/ content is post-download.
    for path in cache_map:
        if path.startswith("files/downloads/13/"):
            reasons.append(f"unexpected_project13_cache_before:{path}")

    active = str(prefs.get("active_user_id", "")).strip()
    known_raw = str(prefs.get("known_user_ids", "")).strip().strip('"')
    known_parts = [
        p.strip() for p in known_raw.replace("[", "").replace("]", "").split(",") if p.strip()
    ]
    if active != baselines["prefsActive"]:
        reasons.append(f"active_user={active} want {baselines['prefsActive']}")
    if sorted(known_parts) != sorted(baselines["prefsKnown"]):
        reasons.append(f"known_user_ids={known_parts} want {baselines['prefsKnown']}")

    ok = not reasons
    return {
        "ok": ok,
        "status": "PASS" if ok else "BLOCKED",
        "reasons": reasons,
        "maxBytesBound": baselines["maxBytes"],
    }


def snapshot_queue(bridge: Any, d0702: Any) -> dict[str, Any]:
    if isinstance(bridge, d0702.FakeBridge):
        return {"ok": True, "rows": [], "rowCount": 0, "bytesTotalSum": 0}
    argv = build_queue_sqlite_argv()
    assert_safe_queue_serialization(serialize_adb_shell_argv(*argv))
    try:
        raw = bridge.shell(*argv, timeout=60)
    except subprocess.CalledProcessError as exc:
        err = ""
        if exc.stderr:
            err = (
                exc.stderr.decode(errors="replace")
                if isinstance(exc.stderr, (bytes, bytearray))
                else str(exc.stderr)
            )
        return {
            "ok": False,
            "error": "QUEUE_SNAPSHOT_FAILED",
            "stderr": sanitize_remote_stderr(err or str(exc)),
            "rows": [],
            "rowCount": 0,
            "bytesTotalSum": 0,
            "dbPath": ADB_DB_PATH,
            "argvSerialized": serialize_adb_shell_argv(*argv),
        }
    rows = []
    for line in raw.splitlines():
        if not line.strip() or line.startswith("Error"):
            continue
        parts = line.split("|")
        if len(parts) < 10:
            continue
        cols = (parts + [""] * 17)[:17]
        rows.append(
            {
                "id": cols[0],
                "project_id": cols[1],
                "user_id": cols[2],
                "tier": cols[3],
                "kind": cols[4],
                "resource_name": cols[5],
                "label": cols[6],
                "source_url_stripped": strip_url(cols[7]),
                "status": cols[8],
                "progress": cols[9],
                "bytes_total": cols[10],
                "local_file_path": cols[11],
                "resource_id": cols[12],
                "book_code": cols[13],
                "start_chapter": cols[14],
                "end_chapter": cols[15],
                "file_ext": cols[16],
            }
        )
    byte_sum = 0
    for r in rows:
        try:
            byte_sum += int(r["bytes_total"] or 0)
        except ValueError:
            pass
    return {
        "ok": True,
        "dbPath": ADB_DB_PATH,
        "rows": rows,
        "rowCount": len(rows),
        "bytesTotalSum": byte_sum,
    }


def snapshot_download_cache(bridge: Any, d0702: Any) -> dict[str, Any]:
    """List files/downloads/* via discrete run-as argv (no sh -c / &&)."""
    if isinstance(bridge, d0702.FakeBridge):
        return {
            "ok": True,
            "pwd": "/data/user/0/com.eten.fluent",
            "files": [],
            "fileCount": 0,
        }
    find_argv = build_cache_find_argv()
    try:
        listing = bridge.shell(*find_argv, timeout=60)
    except subprocess.CalledProcessError as exc:
        err = ""
        if exc.stderr:
            err = (
                exc.stderr.decode(errors="replace")
                if isinstance(exc.stderr, (bytes, bytearray))
                else str(exc.stderr)
            )
        # Missing downloads dir is a valid empty cache, not a hard fail.
        if "No such file" in err or "No such file" in str(exc):
            return {
                "ok": True,
                "pwd": "/data/user/0/com.eten.fluent",
                "files": [],
                "fileCount": 0,
                "note": "NO_DOWNLOADS_DIR",
            }
        return {
            "ok": False,
            "error": "CACHE_LIST_FAILED",
            "stderr": sanitize_remote_stderr(err or str(exc)),
            "files": [],
            "fileCount": 0,
        }
    files = []
    for rel in listing.splitlines():
        rel = rel.strip()
        if not rel.startswith(f"{CACHE_ROOT_REL}/"):
            continue
        try:
            digest_line = bridge.shell(*build_sha256_argv(rel), timeout=30)
            digest = digest_line.split()[0] if digest_line.strip() else ""
        except subprocess.CalledProcessError:
            digest = ""
        try:
            wc_line = bridge.shell(*build_byte_count_argv(rel), timeout=30)
            # ``wc -c path`` → ``<bytes> <path>``
            size_s = wc_line.split()[0] if wc_line.strip() else "0"
        except subprocess.CalledProcessError:
            size_s = "0"
        files.append({"path": rel, "bytes": size_s, "sha256": digest})
    return {
        "ok": True,
        "pwd": "/data/user/0/com.eten.fluent",
        "files": files,
        "fileCount": len(files),
    }


def takes_from_d0702_snapshot(parsed: dict[str, Any]) -> dict[str, Any]:
    rows = parsed.get("rows") or []
    ids = [r["id"] for r in rows]
    hashes = {r["id"]: r.get("sha256") or "" for r in rows}
    return {
        "rows": rows,
        "ids": ids,
        "hashes": hashes,
        "counts": parsed.get("counts")
        or {
            "owner10": sum(1 for r in rows if r.get("owner") == 10),
            "owner9": sum(1 for r in rows if r.get("owner") == 9),
            "total": len(rows),
        },
    }


def run_static_guard(repo: pathlib.Path, manifest: dict[str, Any]) -> dict[str, Any]:
    env = os.environ.copy()
    for key, value in (manifest.get("fixtureGuard") or {}).get("env", {}).items():
        env[str(key)] = str(value)
    cmd = [
        "node",
        str(repo / GUARD_REL),
        "--preflight",
        "--recursive",
        "--",
        FLOW_REL,
    ]
    proc = subprocess.run(
        cmd,
        cwd=str(repo),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    return {
        "ok": proc.returncode == 0,
        "exit": proc.returncode,
        "stdout": (proc.stdout or "")[-500:],
        "stderr": (proc.stderr or "")[-800:],
        "env": (manifest.get("fixtureGuard") or {}).get("env", {}),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="C-0051 Matthew1 download external finally")
    p.add_argument("--repo", type=pathlib.Path, default=REPO_DEFAULT)
    p.add_argument("--serial", default=SERIAL_DEFAULT)
    p.add_argument("--adb-bin", default=os.environ.get("ADB_BIN", "adb"))
    p.add_argument("--adb-host", default="127.0.0.1")
    p.add_argument("--adb-port", default="5037")
    p.add_argument("--execute", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--readonly-smoke",
        action="store_true",
        help="Read-only ADB helper validation only (no Maestro/UI/Download).",
    )
    p.add_argument("--evidence-dir", type=pathlib.Path, default=None)
    p.add_argument("--skip-maestro", action="store_true")
    return p.parse_args(argv)


def resolve_evidence_dir(args: argparse.Namespace, repo: pathlib.Path) -> pathlib.Path:
    """Tracked EVIDENCE_REL only when explicitly requested; dry-run defaults to temp."""
    if args.evidence_dir:
        return args.evidence_dir.resolve()
    cached = getattr(args, "_resolved_evidence_dir", None)
    if cached is not None:
        return cached
    if args.dry_run:
        path = pathlib.Path(tempfile.mkdtemp(prefix="c0051-dry-run-"))
    else:
        path = (repo / EVIDENCE_REL).resolve()
    setattr(args, "_resolved_evidence_dir", path)
    return path


def run_readonly_smoke(
    args: argparse.Namespace,
    *,
    bridge: Any | None = None,
    d0702: Any | None = None,
) -> dict[str, Any]:
    """Exclusive read-only probe: queue / 19 cache / 11 takes / prefs. No UI."""
    d0702 = d0702 or load_d0702()
    repo = args.repo.resolve()
    evidence = resolve_evidence_dir(args, repo)
    evidence.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(repo)
    baselines = load_baselines(repo, manifest)

    # Command-construction gate (no device).
    q_argv = build_queue_sqlite_argv()
    q_ser = serialize_adb_shell_argv(*q_argv)
    assert_safe_queue_serialization(q_ser)
    find_ser = serialize_adb_shell_argv(*build_cache_find_argv())
    if " sh -c " in f" {find_ser} " or "&&" in find_ser:
        raise AssertionError("cache find must be discrete argv without sh -c/&&")

    use_bridge = bridge
    if use_bridge is None:
        use_bridge = d0702.AdbBridge(
            serial=args.serial,
            adb_bin=args.adb_bin,
            repo=repo,
            host=args.adb_host,
            port=args.adb_port,
        )

    result: dict[str, Any] = {
        "mode": "readonly-smoke",
        "serial": args.serial,
        "runtime_pass_claimed": False,
        "queueArgvSerialized": q_ser,
        "cacheFindArgvSerialized": find_ser,
    }

    queue = snapshot_queue(use_bridge, d0702)
    takes = takes_from_d0702_snapshot(d0702.snapshot_takes(use_bridge))
    cache = snapshot_download_cache(use_bridge, d0702)
    prefs = d0702.snapshot_prefs(use_bridge)

    result["queue"] = {
        "ok": queue.get("ok"),
        "rowCount": queue.get("rowCount"),
        "bytesTotalSum": queue.get("bytesTotalSum"),
        "error": queue.get("error"),
        "stderr": queue.get("stderr"),
    }
    result["takes"] = {
        "counts": takes.get("counts"),
        "ids": takes.get("ids"),
        "hashMatch": sorted(takes.get("ids") or []) == sorted(baselines["takes"]["ids"])
        and all(
            takes.get("hashes", {}).get(i) == h
            for i, h in baselines["takes"]["hashes"].items()
        ),
    }
    cache_map = {f["path"]: f for f in cache.get("files") or []}
    cache_ok = cache.get("ok") and len(cache_map) == baselines["cacheFileCount"]
    cache_reasons = []
    if cache_ok:
        for path, digest in baselines["cacheHashes"].items():
            row = cache_map.get(path)
            if row is None:
                cache_ok = False
                cache_reasons.append(f"missing:{path}")
            elif row.get("sha256") != digest:
                cache_ok = False
                cache_reasons.append(f"hash:{path}")
            else:
                try:
                    if int(row.get("bytes") or -1) != baselines["cacheBytes"].get(path):
                        cache_ok = False
                        cache_reasons.append(f"bytes:{path}")
                except ValueError:
                    cache_ok = False
                    cache_reasons.append(f"bytes:{path}")
    else:
        cache_reasons.append(f"count={len(cache_map)}")
    result["cache"] = {
        "ok": cache.get("ok"),
        "fileCount": cache.get("fileCount"),
        "matchBaseline19": cache_ok,
        "reasons": cache_reasons[:12],
    }
    prefs_check = prefs_match_baseline(prefs, baselines)
    result["prefs"] = {"values": prefs, "check": prefs_check}

    # rowCount 0 is valid — do not use ``or -1`` (0 is falsy).
    row_count = queue.get("rowCount")
    queue_ok = (
        bool(queue.get("ok"))
        and row_count is not None
        and int(row_count) == 0
    )
    takes_ok = bool(result["takes"]["hashMatch"])
    prefs_ok = bool(prefs_check["ok"])
    all_ok = queue_ok and takes_ok and cache_ok and prefs_ok
    result["outcome"] = "READONLY_SMOKE_OK" if all_ok else "READONLY_SMOKE_FAIL"
    result["checks"] = {
        "queue0": queue_ok,
        "takes11": takes_ok,
        "cache19": cache_ok,
        "prefs": prefs_ok,
    }

    (evidence / "readonly-smoke-result.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    return result


def run(
    args: argparse.Namespace,
    *,
    bridge: Any | None = None,
    d0702: Any | None = None,
    snapshots: dict[str, Any] | None = None,
    sleep_fn=None,
    manifest_override: dict[str, Any] | None = None,
    force_static_ok: bool = False,
) -> dict[str, Any]:
    d0702 = d0702 or load_d0702()
    repo = args.repo.resolve()
    evidence = resolve_evidence_dir(args, repo)
    evidence.mkdir(parents=True, exist_ok=True)
    manifest = manifest_override if manifest_override is not None else load_manifest(repo)
    baselines = load_baselines(repo, manifest)
    want_execute = bool(args.execute and not args.dry_run)

    result: dict[str, Any] = {
        "criterion": "C-0051-06",
        "companionObserve": ["C-0052-02"],
        "flowRel": FLOW_REL,
        "stackBase": manifest.get("stackBase"),
        "packaging": manifest.get("packaging"),
        "admission": manifest.get("admission"),
        "serial": args.serial,
        "execute": want_execute,
        "expectedTakes": d0702.EXPECTED_TAKE_COUNTS,
        "runtime_pass_claimed": False,
        "c52_pause_cancel_mandatory": False,
    }

    if force_static_ok:
        # Unit-test only: exercise settle/finally after a synthetic admitted start.
        # Production CLI never sets this — original fixture stays NONADMISSIBLE.
        static = {
            "ok": True,
            "exit": 0,
            "stderr": "",
            "env": (manifest.get("fixtureGuard") or {}).get("env", {}),
            "forced": True,
        }
    else:
        static = run_static_guard(repo, manifest)
    result["staticGuard"] = {
        "ok": static["ok"],
        "exit": static["exit"],
        "stderr": static["stderr"],
        "env": static["env"],
    }
    if not static["ok"]:
        result["outcome"] = "STATIC_GUARD_BLOCKED"
        result["visible"] = f"STOP — static fixture-guard blocked: {static['stderr']}"
        (evidence / "host-runner-result.json").write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8"
        )
        return result

    use_bridge = bridge
    if use_bridge is None:
        if want_execute:
            use_bridge = d0702.AdbBridge(
                serial=args.serial,
                adb_bin=args.adb_bin,
                repo=repo,
            )
        else:
            use_bridge = d0702.FakeBridge()
    result["bridge"] = type(use_bridge).__name__

    if snapshots is not None:
        before_queue = snapshots["queue"]
        before_takes = snapshots["takes"]
        before_cache = snapshots["cache"]
        before_prefs = snapshots["prefs"]
    elif isinstance(use_bridge, d0702.FakeBridge):
        # Authoring path: do not invent matching device state → no PASS.
        before_queue = {"ok": True, "rows": [], "rowCount": 0, "bytesTotalSum": 0}
        parsed = d0702.parse_takes(use_bridge.takes_tsv)
        before_takes = {
            "ids": [r["id"] for r in parsed["rows"]],
            "hashes": {r["id"]: "" for r in parsed["rows"]},
            "counts": parsed["counts"],
            "rows": parsed["rows"],
        }
        before_cache = {"ok": True, "files": [], "fileCount": 0}
        before_prefs = d0702.parse_kv_csv(use_bridge.kv_csv)
    else:
        before_queue = snapshot_queue(use_bridge, d0702)
        before_takes = takes_from_d0702_snapshot(d0702.snapshot_takes(use_bridge))
        before_cache = snapshot_download_cache(use_bridge, d0702)
        before_prefs = d0702.snapshot_prefs(use_bridge)

    result["beforeQueue"] = {
        "rowCount": before_queue.get("rowCount"),
        "bytesTotalSum": before_queue.get("bytesTotalSum"),
    }
    result["beforeTakes"] = {
        "counts": before_takes.get("counts"),
        "ids": before_takes.get("ids"),
    }
    result["beforeCache"] = {"fileCount": before_cache.get("fileCount")}
    result["beforePrefs"] = before_prefs

    admission = admit_runtime_from_snapshots(
        queue=before_queue,
        takes=before_takes,
        cache=before_cache,
        prefs=before_prefs,
        baselines=baselines,
        manifest=manifest,
    )
    result["runtimeAdmission"] = admission

    if not want_execute:
        result["outcome"] = "AUTHORING_ONLY"
        result["visible"] = (
            "Authoring dry-run: static guard evaluated; runtime admission not "
            "claimed as device truth (FakeBridge / no --execute)."
        )
        result["finally"] = {"ok": True, "log": ["dry-run-skip"]}
        (evidence / "host-runner-result.json").write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8"
        )
        return result

    if not admission["ok"]:
        result["outcome"] = "RUNTIME_ADMISSION_BLOCKED"
        result["visible"] = (
            "STOP — runtime admission blocked before Download: "
            + "; ".join(admission["reasons"][:12])
        )
        (evidence / "host-runner-result.json").write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8"
        )
        return result

    maestro_exit = None
    if not args.skip_maestro:
        out_dir = evidence / "maestro-out"
        maestro_exit = use_bridge.run_maestro(FLOW_REL, out_dir)
    result["maestroExit"] = maestro_exit

    # Settle transfer BEFORE account switch / UI restore / success claim.
    settle_injected = (snapshots or {}).get("settle_queue_polls")
    if settle_injected is not None:
        poll_i = {"n": 0}

        def poll_queue():
            seq = settle_injected
            idx = min(poll_i["n"], len(seq) - 1)
            poll_i["n"] += 1
            return seq[idx]

        settle = wait_for_queue_settle(
            poll_queue=poll_queue,
            sleep_fn=sleep_fn or (lambda _s: None),
            deadline_s=float((snapshots or {}).get("settle_deadline_s", SETTLE_DEADLINE_S)),
            poll_s=float((snapshots or {}).get("settle_poll_s", 0)),
        )
    else:

        def poll_queue():
            return snapshot_queue(use_bridge, d0702)

        settle = wait_for_queue_settle(
            poll_queue=poll_queue,
            sleep_fn=sleep_fn or (lambda _s: None),
        )
    result["transferSettle"] = {
        "state": settle.get("state"),
        "ok": settle.get("ok"),
        "settled": settle.get("settled"),
        "uiRestoreSafe": settle.get("uiRestoreSafe"),
        "deadlineExhausted": settle.get("deadlineExhausted"),
        "elapsedS": settle.get("elapsedS"),
        "statusCounts": settle.get("statusCounts"),
        "statuses": settle.get("statuses"),
        "rowCount": settle.get("rowCount"),
        "rows": settle.get("rows"),
        "polls": settle.get("polls"),
    }

    finally_result: dict[str, Any]
    if settle.get("uiRestoreSafe"):
        finally_result = d0702.bounded_ui_restore(
            use_bridge, sleep_fn=sleep_fn or (lambda _s: None)
        )
    else:
        finally_result = {
            "ok": False,
            "log": ["ui-restore-skipped-transfer-not-safe"],
            "error": f"TRANSFER_NOT_SAFE:{settle.get('state')}",
            "skipped": True,
        }
    result["finally"] = finally_result

    # Postflight snapshots — only after settle decision; never invent PASS.
    if snapshots is not None and snapshots.get("after"):
        after_takes = snapshots["after"]["takes"]
        after_cache = snapshots["after"]["cache"]
        after_prefs = snapshots["after"]["prefs"]
        after_queue = snapshots["after"].get("queue") or {
            "ok": True,
            "rows": settle.get("rows") or [],
            "rowCount": settle.get("rowCount") or 0,
        }
    else:
        after_takes = takes_from_d0702_snapshot(d0702.snapshot_takes(use_bridge))
        after_cache = snapshot_download_cache(use_bridge, d0702)
        after_prefs = d0702.snapshot_prefs(use_bridge)
        after_queue = snapshot_queue(use_bridge, d0702)

    post_take_ok = sorted(after_takes.get("ids") or []) == sorted(
        baselines["takes"]["ids"]
    ) and all(
        after_takes.get("hashes", {}).get(i) == h
        for i, h in baselines["takes"]["hashes"].items()
    )
    post_cache_ok = True
    after_map = {f["path"]: f for f in after_cache.get("files") or []}
    for path, digest in baselines["cacheHashes"].items():
        row = after_map.get(path)
        if row is None or row.get("sha256") != digest:
            post_cache_ok = False
            break
    prefs_check = prefs_match_baseline(after_prefs, baselines)
    prefs_ok = prefs_check["ok"]

    result["afterTakes"] = {"counts": after_takes.get("counts"), "ok": post_take_ok}
    result["afterCache"] = {
        "fileCount": after_cache.get("fileCount"),
        "preexistingOk": post_cache_ok,
    }
    result["afterPrefs"] = after_prefs
    result["afterPrefsCheck"] = prefs_check
    result["afterQueue"] = {
        "rowCount": after_queue.get("rowCount"),
        "rows": [
            {
                "resource_id": r.get("resource_id"),
                "resource_name": r.get("resource_name"),
                "kind": r.get("kind"),
                "book_code": r.get("book_code"),
                "start_chapter": r.get("start_chapter"),
                "end_chapter": r.get("end_chapter"),
                "bytes_total": r.get("bytes_total"),
                "local_file_path": r.get("local_file_path"),
                "status": r.get("status"),
                "source_url_stripped": r.get("source_url_stripped"),
            }
            for r in (after_queue.get("rows") or [])
        ],
    }

    settle_state = settle.get("state")
    if settle_state == "DEADLINE_EXHAUSTED" or (
        not settle.get("settled") and settle.get("deadlineExhausted")
    ):
        result["outcome"] = "CLEANUP_UNCERTAIN"
        result["runtime_pass_claimed"] = False
        result["visible"] = (
            "CLEANUP_UNCERTAIN — settle deadline exhausted; queue statuses="
            + ",".join(settle.get("statuses") or [])
        )
    elif settle_state == "PAUSED":
        result["outcome"] = "CLEANUP_UNCERTAIN"
        result["runtime_pass_claimed"] = False
        result["visible"] = (
            "CLEANUP_UNCERTAIN — queue still paused after settle wait; statuses="
            + ",".join(settle.get("statuses") or [])
        )
    elif settle_state in ("NO_PROJECT13_ROWS", "UNKNOWN_STATUSES", "ACTIVE"):
        result["outcome"] = "CLEANUP_UNCERTAIN"
        result["runtime_pass_claimed"] = False
        result["visible"] = (
            f"CLEANUP_UNCERTAIN — transfer state={settle_state}; statuses="
            + ",".join(settle.get("statuses") or [])
        )
    elif settle_state == "TRANSFER_FAILED":
        result["outcome"] = "TRANSFER_FAILED"
        result["runtime_pass_claimed"] = False
        result["visible"] = (
            "TRANSFER_FAILED — terminal failed/cancelled queue rows; "
            "not claiming download complete; statuses="
            + ",".join(settle.get("statuses") or [])
        )
        if not finally_result.get("ok") or not post_take_ok or not post_cache_ok:
            result["outcome"] = "CLEANUP_UNCERTAIN"
            result["visible"] = (
                "CLEANUP_UNCERTAIN — transfer failed and cleanup/preservation drifted"
            )
    elif not finally_result.get("ok") or not post_take_ok or not post_cache_ok or not prefs_ok:
        result["outcome"] = "CLEANUP_UNCERTAIN"
        result["runtime_pass_claimed"] = False
        result["visible"] = (
            "CLEANUP_UNCERTAIN — inspect takes/cache/prefs/finally after settle"
        )
    elif maestro_exit not in (0, None):
        result["outcome"] = "MAESTRO_FAIL_CLEANUP_OK"
        result["runtime_pass_claimed"] = False
        result["visible"] = f"Maestro exit {maestro_exit}; transfer settled; cleanup ok"
    elif args.skip_maestro:
        result["outcome"] = "ADMISSION_OK_MAESTRO_SKIPPED"
        result["runtime_pass_claimed"] = False
        result["visible"] = "Admission+settle+finally only; Maestro skipped"
    elif settle_state == "TRANSFER_COMPLETED" and settle.get("ok"):
        result["outcome"] = "MAESTRO_OK_CLEANUP_OK"
        result["runtime_pass_claimed"] = True
        result["visible"] = (
            "C-0051-06 download completed (queue terminal completed); "
            "C-0052-02 Pause/Cancel only if observed (not mandatory on fast finish)."
        )
    else:
        result["outcome"] = "CLEANUP_UNCERTAIN"
        result["runtime_pass_claimed"] = False
        result["visible"] = f"CLEANUP_UNCERTAIN — unexpected settle state={settle_state}"

    (evidence / "host-runner-result.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    return result


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.readonly_smoke:
        result = run_readonly_smoke(args)
        print(
            json.dumps(
                {
                    "outcome": result["outcome"],
                    "checks": result.get("checks"),
                    "runtime_pass_claimed": False,
                    "queueStderr": (result.get("queue") or {}).get("stderr"),
                }
            )
        )
        return 0 if result["outcome"] == "READONLY_SMOKE_OK" else 2

    result = run(args)
    print(
        json.dumps(
            {
                "outcome": result["outcome"],
                "runtime_pass_claimed": result["runtime_pass_claimed"],
                "staticGuard": result.get("staticGuard", {}).get("ok"),
                "runtimeAdmission": (result.get("runtimeAdmission") or {}).get(
                    "status"
                ),
            }
        )
    )
    if result["outcome"] in (
        "STATIC_GUARD_BLOCKED",
        "RUNTIME_ADMISSION_BLOCKED",
    ):
        print(result.get("visible", ""), file=sys.stderr)
        return 2
    if result["outcome"] in ("CLEANUP_UNCERTAIN", "TRANSFER_FAILED"):
        return 3
    if result["outcome"] == "MAESTRO_FAIL_CLEANUP_OK":
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
