#!/usr/bin/env python3
"""Incremental sanitized Metro / adb logcat reader for QA717 controllers.

Reuses redaction ideas from:
  - scripts/qa717-easy-ui-batch runners' sanitize_remote_stderr (token/query)
  - secret / URL / email / structured-payload patterns also seen in
    src/utils/sanitizeUploadError.ts (this helper does not mirror path scrubbing
    or length caps from that module)

Does not start Metro, tap devices, or print raw secrets to stdout.
Controller must call read at Maestro checkpoints with an explicit --action label.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
# Cursor state schema: secret-free offsets only (no raw log fragments).
STATE_SCHEMA_VERSION = 2

# Prefer these technical categories when classifying; unknown structured JSON fails closed.
ALLOWLIST_TAG_RE = re.compile(
    r"(?i)\b("
    r"SyncService|AuthSession|prepareOffline|PrepareOffline|"
    r"DownloadQueue|DownloadQueueWorker|ReactNativeJS|"
    r"KVStorage|httpClient|FluentAPI|expo|"
    r"AndroidRuntime|DEBUG|ERROR|WARN|INFO"
    r")\b"
)

# Avoid \\b before Authorization when preceded by literal \n in flattened dumps.
AUTH_HEADER_RE = re.compile(r"(?i)authorization\s*:\s*\S.*")
# Match token/password/api-key including accessToken/refreshToken suffixes and
# quoted JSON keys; consume complete quoted values (delimiters inside quotes).
SECRET_KV_RE = re.compile(
    r"""(?i)(token|password|api[_-]?key)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)"""
)
# Cookie / Set-Cookie: redact through end of line (multi-pair cookie headers).
COOKIE_HEADER_RE = re.compile(r"(?i)((?:set-)?cookie)[\"']?\s*[:=]\s*\S.*")
BEARER_RE = re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-+/=]+")
URL_WITH_QUERY_RE = re.compile(r"(https?://[^\s\"']+)\?[^\s\"']*")
SIGNED_QUERY_RE = re.compile(
    r"(?i)([?&])([A-Za-z0-9_]*(?:token|key|secret|sig|signature|X-Amz-)[A-Za-z0-9_]*)=[^&\s\"']+"
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Fail-closed markers for request/response / stack payloads.
STRUCTURED_FAIL_CLOSED_RE = re.compile(
    r"(?i)\b(requestBody|responseBody|response_body|request_body|"
    r"payload|headers|stack|stackTrace|stacktrace)\b"
)
JSONISH_RE = re.compile(r"^\s*[\{\[]")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def empty_state() -> dict[str, Any]:
    """Secret-free cursor: offset of next unread complete-line start only."""
    return {
        "schemaVersion": STATE_SCHEMA_VERSION,
        "byte_offset": 0,
        "inode": None,
        "size": 0,
        "prefix_sha256": None,
    }


def load_state(path: Path) -> dict[str, Any]:
    """Load cursor state. Never returns raw log fragments.

    Legacy v1 states stored an `incomplete` string and advanced `byte_offset`
    past that unfinished tail. Rewind by the UTF-8 byte length of that field
    so the next read re-fetches unfinished bytes from the restricted raw log.
    """
    if not path.is_file():
        return empty_state()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return empty_state()
    if not isinstance(data, dict):
        return empty_state()

    offset = int(data.get("byte_offset") or 0)
    legacy_incomplete = data.get("incomplete")
    if legacy_incomplete:
        try:
            rewind = len(str(legacy_incomplete).encode("utf-8"))
            offset = max(0, offset - rewind)
        except Exception:
            offset = 0

    return {
        "schemaVersion": STATE_SCHEMA_VERSION,
        "byte_offset": max(0, offset),
        "inode": data.get("inode"),
        "size": int(data.get("size") or 0),
        "prefix_sha256": data.get("prefix_sha256"),
    }


def save_state(path: Path, state: dict[str, Any]) -> None:
    """Persist secret-free cursor keys only — never raw log fragments."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": STATE_SCHEMA_VERSION,
        "byte_offset": int(state.get("byte_offset") or 0),
        "inode": state.get("inode"),
        "size": int(state.get("size") or 0),
        "prefix_sha256": state.get("prefix_sha256"),
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def split_complete_lines(chunk: str, incomplete: str = "") -> tuple[list[str], str]:
    """Pure line splitter for tests / callers. Incomplete tails are not persisted."""
    buf = incomplete + chunk
    if not buf:
        return [], ""
    parts = buf.split("\n")
    if buf.endswith("\n"):
        return [p for p in parts[:-1]], ""
    return [p for p in parts[:-1]], parts[-1]


def file_prefix_sha256(path: Path, length: int) -> str | None:
    """SHA-256 of the first `length` bytes (secret-free cursor fingerprint)."""
    digest = hashlib.sha256()
    if length <= 0:
        return digest.hexdigest()
    try:
        with path.open("rb") as fh:
            remaining = length
            while remaining:
                block = fh.read(min(1024 * 1024, remaining))
                if not block:
                    return None
                digest.update(block)
                remaining -= len(block)
    except OSError:
        return None
    return digest.hexdigest()


def detect_truncation(path: Path, state: dict[str, Any]) -> bool:
    try:
        st = path.stat()
    except OSError:
        return False
    prev = int(state.get("byte_offset") or 0)
    prev_inode = state.get("inode")
    cur_inode = getattr(st, "st_ino", None)
    if prev_inode is not None and cur_inode is not None and prev_inode != cur_inode:
        return True
    if st.st_size < prev:
        return True
    # Same inode + non-decreasing size can still be a full rewrite
    # (e.g. `adb logcat -d > raw-logcat.txt`). Compare prefix hash.
    expected = state.get("prefix_sha256")
    if prev and (expected is None or file_prefix_sha256(path, prev) != expected):
        return True
    return False


def read_incremental(
    path: Path, state: dict[str, Any]
) -> tuple[list[str], dict[str, Any], dict[str, Any]]:
    """Read newly completed lines since cursor.

    State stores only the byte offset of the last complete line (next read
    start). Unfinished tails stay in the restricted raw log and are re-read on
    the next call — never copied into state JSON.
    """
    meta: dict[str, Any] = {"truncated": False, "path": str(path)}
    if not path.is_file():
        meta["missing"] = True
        return [], {
            "schemaVersion": STATE_SCHEMA_VERSION,
            "byte_offset": int(state.get("byte_offset") or 0),
            "inode": state.get("inode"),
            "size": int(state.get("size") or 0),
            "prefix_sha256": state.get("prefix_sha256"),
        }, meta

    if detect_truncation(path, state):
        meta["truncated"] = True
        state = empty_state()

    st = path.stat()
    offset = int(state.get("byte_offset") or 0)
    with path.open("rb") as fh:
        fh.seek(offset)
        raw = fh.read()

    last_nl = raw.rfind(b"\n")
    if last_nl < 0:
        # Unfinished line only — leave cursor; do not persist the fragment.
        complete_raw = b""
        new_offset = offset
    else:
        complete_raw = raw[: last_nl + 1]
        new_offset = offset + len(complete_raw)

    try:
        chunk = complete_raw.decode("utf-8", errors="replace")
    except Exception:
        chunk = complete_raw.decode("latin-1", errors="replace")

    lines, _tail = split_complete_lines(chunk, "")
    new_state = {
        "schemaVersion": STATE_SCHEMA_VERSION,
        "byte_offset": new_offset,
        "inode": getattr(st, "st_ino", None),
        "size": st.st_size,
        "prefix_sha256": file_prefix_sha256(path, new_offset),
    }
    meta["bytes_read"] = len(raw)
    meta["lines"] = len(lines)
    return lines, new_state, meta


def redact_secrets(text: str) -> str:
    out = AUTH_HEADER_RE.sub("Authorization: ***", text)
    out = COOKIE_HEADER_RE.sub(lambda m: f"{m.group(1)}: ***", out)
    out = BEARER_RE.sub("Bearer ***", out)
    out = SECRET_KV_RE.sub(lambda m: f"{m.group(1)}=***", out)
    out = URL_WITH_QUERY_RE.sub(r"\1?<redacted-query>", out)
    out = SIGNED_QUERY_RE.sub(r"\1\2=***", out)
    out = EMAIL_RE.sub("<redacted-email>", out)
    return out


def sanitize_line(line: str) -> str:
    """Sanitize one log line. Fail closed on unknown structured payloads."""
    if line is None:
        return ""
    text = line.replace("\r", "")
    # Multiline native blobs may arrive as one logical line with embedded \\n
    text = text.replace("\x00", "")

    if STRUCTURED_FAIL_CLOSED_RE.search(text) and (
        JSONISH_RE.search(text) or ":" in text
    ):
        tag = "unknown"
        m = ALLOWLIST_TAG_RE.search(text)
        if m:
            tag = m.group(1)
        return f"[{tag}] <redacted:structured-payload>"

    # Entire JSON-looking line with no allowlisted tag → fail closed
    stripped = text.lstrip()
    if JSONISH_RE.match(stripped):
        try:
            obj = json.loads(stripped)
        except json.JSONDecodeError:
            # Malformed JSONish — still treat as opaque if it smells like a body
            if STRUCTURED_FAIL_CLOSED_RE.search(stripped) or '"' in stripped:
                return "<redacted:malformed-structured>"
        else:
            if isinstance(obj, (dict, list)):
                # Allow only tiny technical dictionaries of allowlisted keys
                if isinstance(obj, dict):
                    allowed = {
                        "error",
                        "code",
                        "itemId",
                        "projectId",
                        "userId",
                        "status",
                        "category",
                        "attempt",
                        "timestamp",
                        "ok",
                    }
                    keys = set(obj.keys())
                    if keys and keys.issubset(allowed):
                        return redact_secrets(json.dumps(obj, sort_keys=True))
                return "<redacted:structured-payload>"

    return redact_secrets(text)


def classify_category(line: str) -> str | None:
    m = ALLOWLIST_TAG_RE.search(line)
    return m.group(1) if m else None


def make_receipt(
    *,
    run_id: str,
    source: str,
    action: str,
    sanitized_line: str,
    observed_at: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "observedAtUtc": observed_at or utc_now_iso(),
        "runId": run_id,
        "source": source,
        "maestroAction": action,
        "category": category,
        "sanitizedLine": sanitized_line,
    }


def emit_receipts(
    lines: list[str],
    *,
    run_id: str,
    source: str,
    action: str,
) -> list[dict[str, Any]]:
    observed = utc_now_iso()
    out: list[dict[str, Any]] = []
    for line in lines:
        if line == "":
            continue
        sanitized = sanitize_line(line)
        out.append(
            make_receipt(
                run_id=run_id,
                source=source,
                action=action,
                sanitized_line=sanitized,
                observed_at=observed,
                category=classify_category(line),
            )
        )
    return out


def append_receipts(path: Path, receipts: list[dict[str, Any]]) -> None:
    """Append JSONL receipts (sanitized only)."""
    if not receipts:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        for r in receipts:
            fh.write(json.dumps(r, separators=(",", ":")) + "\n")


def recommended_logcat_argv(serial: str) -> list[str]:
    """Read-only recommended argv. Supports threadtime + UTC when adb confirms."""
    return [
        "adb",
        "-s",
        serial,
        "logcat",
        "-d",
        "-b",
        "main,system,crash",
        "-v",
        "threadtime,UTC",
    ]


def _summary(
    *,
    source: str,
    run_id: str,
    action: str,
    receipts: list[dict[str, Any]],
    meta: dict[str, Any],
    new_state: dict[str, Any],
) -> dict[str, Any]:
    missing = bool(meta.get("missing"))
    return {
        "ok": not missing,
        "source": source,
        "runId": run_id,
        "maestroAction": action,
        "newLines": len(receipts),
        "truncated": meta.get("truncated", False),
        "missing": missing,
        "bytesRead": meta.get("bytes_read", 0),
        "stateByteOffset": new_state["byte_offset"],
    }


def cmd_metro_read(args: argparse.Namespace) -> int:
    log_path = Path(args.log)
    state_path = Path(args.state)
    state = load_state(state_path)
    lines, new_state, meta = read_incremental(log_path, state)
    receipts = emit_receipts(
        lines,
        run_id=args.run_id,
        source="metro",
        action=args.action,
    )
    # Persist sanitized receipts before advancing the cursor so a receipts
    # write failure leaves the input eligible for reread.
    if args.receipts:
        append_receipts(Path(args.receipts), receipts)
    save_state(state_path, new_state)
    summary = _summary(
        source="metro",
        run_id=args.run_id,
        action=args.action,
        receipts=receipts,
        meta=meta,
        new_state=new_state,
    )
    print(json.dumps(summary))
    return 1 if summary["missing"] else 0


def cmd_file_read(args: argparse.Namespace) -> int:
    """Same incremental path for a pre-captured logcat dump file."""
    log_path = Path(args.log)
    state_path = Path(args.state)
    state = load_state(state_path)
    lines, new_state, meta = read_incremental(log_path, state)
    receipts = emit_receipts(
        lines,
        run_id=args.run_id,
        source=args.source,
        action=args.action,
    )
    if args.receipts:
        append_receipts(Path(args.receipts), receipts)
    save_state(state_path, new_state)
    summary = _summary(
        source=args.source,
        run_id=args.run_id,
        action=args.action,
        receipts=receipts,
        meta=meta,
        new_state=new_state,
    )
    print(json.dumps(summary))
    return 1 if summary["missing"] else 0


def cmd_logcat_argv(args: argparse.Namespace) -> int:
    argv = recommended_logcat_argv(args.serial)
    print(
        json.dumps(
            {
                "ok": True,
                "argv": argv,
                "note": (
                    "Read-only dump (-d). Controller may redirect to a local "
                    "restricted raw file then call file-read. Live device "
                    "ingestion that requires launching Fluent is NOT performed "
                    "by this helper — mark that gate unverified if app is closed."
                ),
                "buffers": "main,system,crash",
                "format": "threadtime,UTC",
            }
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("metro-read", help="Incremental sanitized Metro log read")
    m.add_argument("--log", required=True, help="Owned Metro log file path")
    m.add_argument("--state", required=True, help="Cursor state JSON path")
    m.add_argument("--run-id", required=True)
    m.add_argument("--action", required=True, help="Maestro checkpoint label")
    m.add_argument("--receipts", help="Append JSONL sanitized receipts here")
    m.set_defaults(func=cmd_metro_read)

    f = sub.add_parser(
        "file-read",
        help="Incremental sanitized read of a local dump (e.g. logcat -d file)",
    )
    f.add_argument("--log", required=True)
    f.add_argument("--state", required=True)
    f.add_argument("--run-id", required=True)
    f.add_argument("--action", required=True)
    f.add_argument("--source", default="logcat-file")
    f.add_argument("--receipts")
    f.set_defaults(func=cmd_file_read)

    l = sub.add_parser(
        "logcat-argv",
        help="Print recommended adb logcat argv (no device mutation)",
    )
    l.add_argument("--serial", required=True)
    l.set_defaults(func=cmd_logcat_argv)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
