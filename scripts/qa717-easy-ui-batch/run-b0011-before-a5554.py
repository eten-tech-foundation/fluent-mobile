#!/usr/bin/env python3
"""B-0011-01 PHASE=before only on A5554. Assertion-only; no web mutation."""
from __future__ import annotations

import csv
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import time

REPO = pathlib.Path("/Users/matt/Documents/Development/gloo/fluent-mobile")
EVIDENCE = (
    REPO
    / "docs/assessments/maestro-acceptance-coverage/run-evidence"
    / "20261021-easy-ui-batch/b0011-preparation"
)
FLOW = (
    ".maestro/flows/qa717-easy-ui-batch/"
    "a-user10-b0011-stage-refresh-chapter-list-existing-session.yaml"
)
SERIAL = "emulator-5554"
ADB_BIN = "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools/adb"
WEB_RECEIPT = "web-20261021T055329Z-p12-m19-1pe3-blank-notstarted"

_spec = importlib.util.spec_from_file_location(
    "_qa717_b0013_helpers",
    REPO / "scripts/qa717-easy-ui-batch/run-b0013-incomplete-pericope-guard.py",
)
b = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(b)

b.SERIAL = SERIAL
b.ADB = [ADB_BIN, "-H", "127.0.0.1", "-P", "5037", "-s", SERIAL]
b.REPO = REPO
b.EVIDENCE = EVIDENCE
b.FLOW = FLOW

j: dict = {
    "schema": "b0011-01-before-a5554/v1",
    "criterion": "B-0011-01",
    "phase": "before",
    "serial": SERIAL,
    "flow": FLOW,
    "webReceiptId": WEB_RECEIPT,
    "assignmentId": 1185,
    "expectedOwnership": "unassigned",
    "expectedStageLabel": "Not Started",
    "B5556": "MUST_NOT_TOUCH",
}
b.j = j


def save() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "before-result.json").write_text(json.dumps(j, indent=2) + "\n")


def progress(milestone: str, **extra) -> None:
    EVIDENCE.joinpath("progress").mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "b0011-before-progress/v1",
        "milestone": milestone,
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **extra,
    }
    (EVIDENCE / "progress" / f"{milestone}.json").write_text(
        json.dumps(payload, indent=2) + "\n"
    )
    print("PROGRESS", milestone, flush=True)


def all10_take_state() -> dict:
    sql = (
        "SELECT r.id, bt.chapter_number, bt.verse_number AS start_verse, r.end_verse, "
        "r.is_selected, r.sync_status, r.local_file_path, r.duration_ms, r.granularity "
        "FROM recordings r JOIN bible_texts bt ON bt.id=r.bible_text_id "
        "WHERE r.recorded_by_user_id=10 "
        "ORDER BY bt.chapter_number, bt.verse_number, r.id;"
    )
    rows = []
    for line in b.q(sql).splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        rid, ch, sv, ev, sel, sync, path, dur, gran = parts
        rel = path.replace("file:///data/user/0/com.eten.fluent/", "")
        digest = (
            b.r("shell", f"run-as com.eten.fluent /system/bin/sha256sum {rel}")
            .decode()
            .split()[0]
        )
        rows.append(
            {
                "id": rid,
                "chapter": int(ch),
                "start_verse": int(sv),
                "end_verse": int(ev),
                "is_selected": sel,
                "sync_status": sync,
                "local_file_path": path,
                "duration_ms": int(dur),
                "granularity": gran,
                "sha256": digest,
            }
        )
    return {"count": len(rows), "takes": rows}


def protected_and_target() -> dict:
    sql = (
        "SELECT id,project_unit_id,bible_id,book_id,chapter_number,"
        "IFNULL(assigned_user_id,'NULL'),IFNULL(peer_checker_id,'NULL'),"
        "status,total_verses,completed_verses,has_conflict "
        "FROM chapter_assignments WHERE id IN (1183,1184,1185) ORDER BY id;"
    )
    rows = {}
    for line in b.q(sql).splitlines():
        if not line.strip():
            continue
        (
            aid,
            puid,
            bible,
            book,
            ch,
            assigned,
            peer,
            status,
            total,
            completed,
            conflict,
        ) = line.split("|")
        rows[aid] = {
            "id": int(aid),
            "project_unit_id": int(puid),
            "bible_id": int(bible),
            "book_id": int(book),
            "chapter": int(ch),
            "assigned_user_id": None if assigned == "NULL" else int(assigned),
            "peer_checker_id": None if peer == "NULL" else int(peer),
            "status": status,
            "total_verses": int(total),
            "completed_verses": int(completed),
            "has_conflict": int(conflict),
        }
    ch3_takes = int(
        b.q(
            "SELECT COUNT(*) FROM recordings r JOIN bible_texts bt ON bt.id=r.bible_text_id "
            "WHERE bt.bible_id=178 AND bt.book_id=60 AND bt.chapter_number=3;"
        )
        or "0"
    )
    return {"assignments": rows, "chapter3RecordingCount": ch3_takes}


def kv_prefs() -> dict:
    raw = b.q_header(
        "SELECT key,value FROM storage WHERE key IN "
        "('active_user_id','known_user_ids','10:drafting_unit','12:drafting_unit',"
        "'ui_version');",
        "databases/kv/__opsqlite_storage.sqlite",
    )
    rows = list(csv.DictReader(io.StringIO(raw)))
    return {row["key"]: row["value"] for row in rows}


def mic_lines() -> list[str]:
    raw = b.r("shell", "dumpsys", "package", "com.eten.fluent").decode()
    return [
        x.strip()
        for x in raw.splitlines()
        if "android.permission.RECORD_AUDIO: granted=" in x
    ]


def settle_toward_home(label: str):
    deadline = time.monotonic() + 60
    ns = b.dump(label + "-settle")
    while time.monotonic() < deadline:
        if b.has(ns, "record-stop-button"):
            raise AssertionError("ACTIVE_CAPTURE_DURING_CLEANUP")
        if b.has(ns, "home-settings-button") and b.has(ns, "home-tab-my-work"):
            return ns
        if b.has(ns, "drafting-header-back"):
            b.tap(ns, "drafting-header-back")
        elif b.has(ns, "stack-header-back"):
            b.tap(ns, "stack-header-back")
        elif b.has(ns, "prepare-offline-screen") and b.has(ns, "stack-header-back"):
            b.tap(ns, "stack-header-back")
        time.sleep(0.5)
        ns = b.dump(label + "-settle")
    raise AssertionError(("SETTLE_HOME_TIMEOUT", label))


def restore_home12_verse_legacy(label: str) -> None:
    ns = settle_toward_home(label)
    ns = b.home(ns, label)
    b.tap(ns, "home-settings-button")
    # Already-active12 exposes settings-menu-active-12; inactive exposes account-12.
    deadline = time.monotonic() + 15
    ns = b.dump(label + "-drawer")
    while time.monotonic() < deadline:
        if b.has(ns, "settings-menu-active-12") or b.has(
            ns, "settings-menu-account-12"
        ):
            break
        time.sleep(0.4)
        ns = b.dump(label + "-drawer")
    else:
        raise AssertionError(
            (
                "PRECONDITION_READY_TIMEOUT",
                label + "-drawer",
                ["settings-menu-active-12|settings-menu-account-12"],
            )
        )
    active12 = [n for n in ns if n.get("resource-id") == "settings-menu-active-12"]
    if not active12:
        b.tap(ns, "settings-menu-account-12")
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            ns = b.dump(label + "-pfo")
            if b.has(ns, "prepare-offline-screen") and b.has(ns, "stack-header-back"):
                b.tap(ns, "stack-header-back")
                time.sleep(0.5)
                continue
            if b.has(ns, "home-settings-button"):
                break
            time.sleep(0.4)
        ns = b.positive_ready(label + "-home12", ["home-settings-button"])
        b.tap(ns, "home-settings-button")
        ns = b.positive_ready(label + "-drawer12", ["settings-menu-active-12"])
    b.tap(ns, "settings-menu-more-settings")
    ns = b.positive_ready(
        label + "-settings",
        ["settings-drafting-unit-verse", "settings-ui-version-legacy"],
    )
    verse = [n for n in ns if n.get("resource-id") == "settings-drafting-unit-verse"]
    peri = [n for n in ns if n.get("resource-id") == "settings-drafting-unit-pericope"]
    assert verse and peri
    if peri[0].get("selected") == "true" or verse[0].get("selected") != "true":
        b.tap(ns, "settings-drafting-unit-verse")
        ns = b.positive_ready(label + "-verse", ["settings-drafting-unit-verse"])
    legacy = [n for n in ns if n.get("resource-id") == "settings-ui-version-legacy"]
    if legacy and legacy[0].get("selected") != "true":
        b.tap(ns, "settings-ui-version-legacy")
        ns = b.positive_ready(label + "-legacy", ["settings-ui-version-legacy"])
    b.tap(ns, "stack-header-back")
    b.positive_ready(label + "-home", ["home-tab-my-work", "home-settings-button"])


def run_maestro() -> int:
    env = os.environ.copy()
    env.update(
        {
            "PATH": (
                "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools:"
                "/Users/matt/.maestro/bin:" + env.get("PATH", "")
            ),
            "ANDROID_SERIAL": SERIAL,
            "ADB_SERVER_SOCKET": "tcp:127.0.0.1:5037",
            "MAESTRO_ENV_FILE": str(REPO / ".env.maestro.qa"),
            "MAESTRO_ENV_LANE": "qa",
        }
    )
    out_dir = EVIDENCE / "maestro-before"
    out_dir.mkdir(parents=True, exist_ok=True)
    e_flags = [
        ("MAESTRO_B0011_PROJECT_ID", "12"),
        ("MAESTRO_B0011_MILESTONE_ID", "19"),
        ("MAESTRO_B0011_ASSIGNMENT_ID", "1185"),
        ("MAESTRO_FIXTURE_CHAPTER_ID", "1185"),
        ("MAESTRO_FIXTURE_MILESTONE_ID", "19"),
        ("MAESTRO_FIXTURE_PROJECT_ID", "12"),
        ("MAESTRO_FIXTURE_PROJECT_ALLOWLIST", "12"),
        ("MAESTRO_FIXTURE_PROJECT_DENYLIST", "944"),
        ("MAESTRO_B0011_USER_ID", "10"),
        ("MAESTRO_B0011_CACHED_IDS", "10,9,12"),
        ("MAESTRO_B0011_SERIAL", "emulator-5554"),
        ("MAESTRO_B0011_PHASE", "before"),
        ("MAESTRO_B0011_EXPECT_OWNERSHIP", "unassigned"),
        ("MAESTRO_B0011_EXPECT_STAGE_LABEL", "Not Started"),
        ("MAESTRO_B0011_CHAPTER_LABEL", "1 Peter 3"),
        ("MAESTRO_B0011_ADMISSION", "ADMITTED"),
        ("MAESTRO_B0011_OWNERSHIP_PREFLIGHT_VERIFIED", "1"),
        ("MAESTRO_B0011_EMPTY_RECORDINGS_VERIFIED", "1"),
        ("MAESTRO_B0011_LIVE_MUTATION_HOLD", "approved-at-execution"),
        ("MAESTRO_B0011_WEB_RECEIPT_ID", WEB_RECEIPT),
    ]
    gargs = [
        "node",
        "scripts/maestro-fixture-guard.cjs",
        "--preflight",
        "--recursive",
        "--",
        "--device",
        SERIAL,
    ]
    for k, v in e_flags:
        gargs.extend(["-e", f"{k}={v}"])
    gargs.append(FLOW)
    g = subprocess.run(gargs, cwd=REPO, env=env, capture_output=True, text=True)
    j["recursiveGuardExit"] = g.returncode
    j["recursiveGuardStderr"] = (g.stderr or "")[-500:]
    if g.returncode != 0:
        save()
        return g.returncode
    # Device from ANDROID_SERIAL via maestro-test-qa.sh — do not pass --device.
    extra = ["--test-output-dir", str(out_dir), "--debug-output", str(out_dir)]
    for k, v in e_flags:
        extra.extend(["-e", f"{k}={v}"])
    extra.append(FLOW)
    log_path = out_dir / "run.log"
    with log_path.open("w") as log:
        proc = subprocess.run(
            ["bash", "scripts/maestro-test-qa.sh", *extra],
            cwd=REPO,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    j["maestroExit"] = proc.returncode
    j["maestroLog"] = str(log_path)
    save()
    return proc.returncode


def main() -> int:
    t0 = time.monotonic()
    j["flowSha256"] = hashlib.sha256((REPO / FLOW).read_bytes()).hexdigest()
    progress("start")

    # Never touch B5556
    b5556 = subprocess.run(
        [ADB_BIN, "-H", "127.0.0.1", "-P", "5037", "-s", "emulator-5556", "get-state"],
        capture_output=True,
        text=True,
    )
    j["B5556_get_state_only"] = (b5556.stdout or "").strip()
    j["B5556_touched"] = False

    j["originalRadios"] = {
        k: b.setting(k) for k in ["airplane_mode_on", "wifi_on"]
    }
    j["originalMic"] = mic_lines()
    j["beforePrefs"] = kv_prefs()
    assert j["beforePrefs"].get("active_user_id") == "12", j["beforePrefs"]
    known = j["beforePrefs"].get("known_user_ids", "")
    assert "10" in known and "9" in known and "12" in known, known

    fixture = protected_and_target()
    j["beforeFixture"] = fixture
    target = fixture["assignments"].get("1185")
    assert target, fixture
    assert target["project_unit_id"] == 19
    assert target["bible_id"] == 178
    assert target["book_id"] == 60
    assert target["chapter"] == 3
    assert target["assigned_user_id"] is None
    assert target["peer_checker_id"] is None
    assert target["status"] == "not_started"
    assert target["has_conflict"] == 0
    assert target["completed_verses"] == 0
    assert fixture["chapter3RecordingCount"] == 0

    takes = all10_take_state()
    j["beforeTakes"] = {"count": takes["count"], "ids": [t["id"] for t in takes["takes"]]}
    j["beforeTakeHashes"] = takes
    assert takes["count"] == 10, takes["count"]
    assert all(t["chapter"] != 3 for t in takes["takes"])
    (EVIDENCE / "before-all10-take-hashes.json").write_text(
        json.dumps(takes, indent=2) + "\n"
    )
    progress("snapshot-ok", takeCount=takes["count"], assignment1185="fresh")

    try:
        restore_home12_verse_legacy("preflight")
    except Exception as e:
        j["navFailure"] = repr(e)
        j["outcome"] = "BLOCKED_NAV_PREFLIGHT"
        j["webReadyForMutation"] = False
        save()
        progress("nav-failure", error=repr(e))
        return 2

    progress("maestro-before-start")
    cli0 = time.monotonic()
    exit_code = run_maestro()
    j["maestroCliElapsedS"] = round(time.monotonic() - cli0, 3)
    save()
    progress(
        "maestro-before-done",
        maestroExit=exit_code,
        cliS=j["maestroCliElapsedS"],
    )

    try:
        restore_home12_verse_legacy("cleanup")
        j["finalRadios"] = {
            k: b.setting(k) for k in ["airplane_mode_on", "wifi_on"]
        }
        assert j["finalRadios"] == j["originalRadios"]
        j["finalMic"] = mic_lines()
        assert j["finalMic"] == j["originalMic"]
        after_takes = all10_take_state()
        j["afterTakes"] = {
            "count": after_takes["count"],
            "ids": [t["id"] for t in after_takes["takes"]],
        }
        assert after_takes["takes"] == takes["takes"], "ALL10 hashes changed"
        after_fix = protected_and_target()
        j["afterFixture"] = after_fix
        assert after_fix == fixture
        prefs = kv_prefs()
        j["afterPrefs"] = prefs
        assert prefs.get("active_user_id") == "12"
        j["cleanupComplete"] = True
    except Exception as e:
        j["cleanupError"] = repr(e)
        j["webReadyForMutation"] = False
        save()
        progress("cleanup-error", error=repr(e))
        # still attempt restore once more
        try:
            restore_home12_verse_legacy("cleanup-retry")
        except Exception as e2:
            j["cleanupRetryError"] = repr(e2)
            save()
        return 3

    j["outcome"] = "BEFORE_PASS" if exit_code == 0 else "BEFORE_FAIL"
    j["webReadyForMutation"] = exit_code == 0
    j["totalElapsedS"] = round(time.monotonic() - t0, 3)
    save()
    progress(
        "complete",
        outcome=j["outcome"],
        webReadyForMutation=j["webReadyForMutation"],
    )
    print(
        json.dumps(
            {
                "outcome": j["outcome"],
                "maestroExit": exit_code,
                "webReadyForMutation": j["webReadyForMutation"],
                "webReceiptId": WEB_RECEIPT,
                "assignmentId": 1185,
                "expectedOwnership": "unassigned",
                "expectedStageLabel": "Not Started",
                "all10Preserved": True,
                "cleanupComplete": j.get("cleanupComplete"),
                "maestroCliElapsedS": j.get("maestroCliElapsedS"),
                "B5556_touched": False,
            },
            indent=2,
        ),
        flush=True,
    )
    return 0 if exit_code == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
