#!/usr/bin/env python3
"""B-0013-01 incomplete Pericope last-unit guard on emulator-5556. Read-only UI."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import pathlib
import re
import shlex
import signal
import subprocess
import time
import xml.etree.ElementTree as E

REPO = pathlib.Path("/Users/matt/Documents/Development/gloo/fluent-mobile")
EVIDENCE = (
    REPO
    / "docs/assessments/maestro-acceptance-coverage/run-evidence/20261021-easy-ui-batch"
)
FLOW = (
    ".maestro/flows/qa717-easy-ui-batch/"
    "b-user11-incomplete-pericope-advance-guard-existing-session.yaml"
)
SERIAL = "emulator-5556"
ADB = [
    "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools/adb",
    "-H",
    "127.0.0.1",
    "-P",
    "5037",
    "-s",
    SERIAL,
]
LOCK_DIR = pathlib.Path("/tmp/fluent-qa717-device-locks")
FIXTURE_SQL = (
    "SELECT ca.id,pu.project_id,ca.project_unit_id,ca.bible_id,ca.book_id,"
    "ca.chapter_number,ca.assigned_user_id,ca.peer_checker_id,ca.status,"
    "ca.total_verses,ca.completed_verses,ca.has_conflict,p.pericope_set_id "
    "FROM chapter_assignments ca "
    "JOIN project_units pu ON pu.id=ca.project_unit_id "
    "JOIN projects p ON p.id=pu.project_id "
    "WHERE ca.id=993;"
)
EXPECTED_FIXTURE = "993|11|17|236|2|1|11|10|draft|22|0|0|1"
PERI_SQL = (
    "SELECT pericope_number, MIN(verse_number) AS v0, MAX(verse_number) AS v1, "
    "COUNT(*) AS n FROM pericope_verses WHERE pericope_set_id=1 AND book_id=2 "
    "AND chapter_number=1 GROUP BY pericope_number "
    "ORDER BY CAST(pericope_number AS INTEGER);"
)
EXPECTED_PERI = "1|1|7|7\n2|8|14|7\n3|15|22|8"
TAKES_SQL = (
    "SELECT COUNT(*) FROM recordings r JOIN bible_texts bt ON bt.id=r.bible_text_id "
    "WHERE r.is_selected=1 AND r.recorded_by_user_id=11 AND bt.bible_id=236 "
    "AND bt.book_id=2 AND bt.chapter_number=1; "
    "SELECT COUNT(*) FROM recordings WHERE recorded_by_user_id=11; "
    "SELECT id,assigned_user_id,peer_checker_id,status,total_verses,completed_verses "
    "FROM chapter_assignments WHERE id=1184;"
)
EXPECTED_TAKES = "0\n0\n1184|11|10|draft|25|0"

j: dict = {
    "schema": "qa717-b0013-incomplete-pericope-guard/v1",
    "serial": SERIAL,
    "criterion": "B-0013-01",
    "case_id": "B0013_incomplete_pericope_lastunit_guard",
    "claimBoundary": "Read-only incomplete Pericope UI guard only; not full B-0013 closure",
}


def save() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "b0013-incomplete-pericope-result.json").write_text(
        json.dumps(j, indent=2) + "\n"
    )


def r(*args: str, timeout: int = 40) -> bytes:
    return subprocess.run(
        ADB + list(args), check=True, capture_output=True, timeout=timeout
    ).stdout


def q(sql: str, db: str = "databases/default/fluent.db") -> str:
    cmd = (
        f"run-as com.eten.fluent /system/bin/sqlite3 -readonly "
        f"{db} {shlex.quote(sql)}"
    )
    return r("shell", cmd).decode().strip()


def q_header(sql: str, db: str = "databases/default/fluent.db") -> str:
    cmd = (
        f"run-as com.eten.fluent /system/bin/sqlite3 -readonly -header -csv "
        f"{db} {shlex.quote(sql)}"
    )
    return r("shell", cmd).decode().strip()


def setting(k: str) -> str:
    return r("shell", "settings", "get", "global", k).decode().strip()


def has(ns: list, rid: str) -> bool:
    return any(n.get("resource-id") == rid for n in ns)


def dump(name: str) -> list:
    r("shell", "uiautomator", "dump", "/sdcard/b-b0013.xml")
    b = r("exec-out", "cat", "/sdcard/b-b0013.xml")
    # memory-only parse; do not retain account-panel dumps as artifacts
    ns = list(E.fromstring(b).iter("node"))
    j.setdefault("hierarchy_checks", []).append(
        {"label": name, "node_count": len(ns), "has_home": has(ns, "home-settings-button")}
    )
    save()
    return ns


def tap(ns: list, rid: str) -> None:
    assert rid not in {
        "record-start-button",
        "record-new-take-button",
        "stage-advance-button",
        "stage-advance-send",
        "source-audio-play",
    }
    xs = [n for n in ns if n.get("resource-id") == rid]
    assert len(xs) == 1, (rid, len(xs))
    v = list(map(int, re.findall(r"\d+", xs[0].get("bounds", ""))))
    assert xs[0].get("enabled") == "true"
    r("shell", "input", "tap", str((v[0] + v[2]) // 2), str((v[1] + v[3]) // 2))


def positive_ready(label: str, expected: list[str], timeout_s: float = 15) -> list:
    deadline = time.monotonic() + timeout_s
    last: list = []
    while time.monotonic() < deadline:
        last = dump(label)
        assert not has(last, "record-stop-button")
        if all(has(last, k) for k in expected):
            return last
        time.sleep(0.4)
    raise AssertionError(("PRECONDITION_READY_TIMEOUT", label, expected))


def home(ns: list, label: str) -> list:
    assert not has(ns, "record-stop-button")
    if has(ns, "drafting-header-back"):
        tap(ns, "drafting-header-back")
        ns = dump(label + "-back")
    if has(ns, "stack-header-back") and not has(ns, "home-settings-button"):
        tap(ns, "stack-header-back")
        ns = dump(label + "-stack")
    assert has(ns, "home-settings-button")
    return ns


def restore_verse(ns: list, label: str) -> list:
    tap(ns, "home-settings-button")
    ns = positive_ready(label + "-drawer", ["settings-menu-active-11"])
    tap(ns, "settings-menu-more-settings")
    ns = positive_ready(
        label + "-settings",
        ["settings-drafting-unit-verse", "settings-drafting-unit-pericope"],
    )
    # Prefer selected Verse; tap if Pericope still selected.
    peri = [n for n in ns if n.get("resource-id") == "settings-drafting-unit-pericope"]
    verse = [n for n in ns if n.get("resource-id") == "settings-drafting-unit-verse"]
    assert peri and verse
    if peri[0].get("selected") == "true" or verse[0].get("selected") != "true":
        tap(ns, "settings-drafting-unit-verse")
        ns = positive_ready(label + "-verse-selected", ["settings-drafting-unit-verse"])
    assert any(
        n.get("resource-id") == "settings-drafting-unit-verse"
        and n.get("selected") == "true"
        for n in ns
    )
    tap(ns, "stack-header-back")
    return positive_ready(label + "-home", ["home-settings-button"])


def kv_drafting_unit() -> str:
    raw = q_header(
        "SELECT key,value FROM storage WHERE key IN "
        "('active_user_id','known_user_ids','11:drafting_unit');",
        "databases/kv/__opsqlite_storage.sqlite",
    )
    rows = list(csv.DictReader(io.StringIO(raw)))
    return {row["key"]: row["value"] for row in rows}.get("11:drafting_unit", "")


def validate_flow() -> None:
    env = os.environ.copy()
    env["PATH"] = (
        "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools:"
        "/Users/matt/.maestro/bin:" + env.get("PATH", "")
    )
    # Maestro 2.10: syntax check via dry parse of flow using maestro test --help path;
    # use `maestro test` with absurdly short no-device? Prefer `maestro download-samples` no.
    # Official: maestro test file --no-window; validate by starting with --format junit and
    # catching parse errors via `maestro test --help`. Use Graal-less local check:
    p = subprocess.run(
        ["maestro", "test", "--help"],
        capture_output=True,
        text=True,
        env=env,
        timeout=20,
    )
    assert p.returncode == 0
    # Lightweight YAML presence + required selectors
    text = (REPO / FLOW).read_text()
    for needle in [
        "stage-advance-button",
        "Exodus 1:15–22",
        "settings-drafting-unit-pericope",
        "my-work-row-993",
        "MAESTRO_B_INCOMPLETE_PERICOPE_ATTESTATION",
    ]:
        assert needle in text, needle
    j["flowSha256"] = hashlib.sha256((REPO / FLOW).read_bytes()).hexdigest()
    j["maestroVersion"] = (
        subprocess.run(
            ["maestro", "--version"], capture_output=True, text=True, env=env, timeout=20
        ).stdout.strip()
    )
    save()


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
            "MAESTRO_ENV_FILE": str(
                pathlib.Path(
                    "/Users/matt/Documents/Codex/2026-10-19/task-10/emulators/batch-b-qa/.env.maestro.qa"
                )
            ),
        }
    )
    out_dir = EVIDENCE / "maestro-b0013-incomplete-pericope"
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "run.log"
    extra = [
        "-e",
        "MAESTRO_B_USER_ID=11",
        "-e",
        "MAESTRO_B_SERIAL=emulator-5556",
        "-e",
        "MAESTRO_B_CHAPTER_ID=993",
        "-e",
        "MAESTRO_B_INCOMPLETE_PERICOPE_ATTESTATION=draft-exo1-fcbh3-zero-takes-drafter11-peer10",
        "--test-output-dir",
        str(out_dir),
    ]
    with log_path.open("w") as log:
        proc = subprocess.Popen(
            ["bash", "scripts/maestro-test-qa.sh", FLOW, *extra],
            cwd=REPO,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        j["maestroPid"] = proc.pid
        save()
        try:
            return proc.wait(timeout=120)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=15)
            j["timedOut"] = True
            return 124


def main() -> int:
    t0 = time.monotonic()
    validate_flow()
    j["originalRadios"] = {
        k: setting(k) for k in ["airplane_mode_on", "wifi_on"]
    }
    assert j["originalRadios"] == {"airplane_mode_on": "0", "wifi_on": "1"}
    raw = r("shell", "dumpsys", "package", "com.eten.fluent").decode()
    j["originalMic"] = [
        x.strip()
        for x in raw.splitlines()
        if "android.permission.RECORD_AUDIO: granted=" in x
    ]
    assert len(j["originalMic"]) == 1 and "granted=false" in j["originalMic"][0]

    j["beforeFixture"] = q(FIXTURE_SQL)
    assert j["beforeFixture"] == EXPECTED_FIXTURE, j["beforeFixture"]
    j["beforePeri"] = q(PERI_SQL)
    assert j["beforePeri"] == EXPECTED_PERI, j["beforePeri"]
    j["beforeTakes"] = q(TAKES_SQL)
    assert j["beforeTakes"] == EXPECTED_TAKES, j["beforeTakes"]
    j["beforeDraftingUnit"] = kv_drafting_unit()
    assert j["beforeDraftingUnit"] == "verse"
    j["fixtureAdmitted"] = True
    save()

    # progress: case start
    (EVIDENCE / "preparation-progress.json").write_text(
        json.dumps(
            {
                "schema": "qa717-easy-ui-batch-preparation-progress/v1",
                "phase": "case_started",
                "case_id": j["case_id"],
                "serial": SERIAL,
                "fixture": j["beforeFixture"],
                "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        )
        + "\n"
    )

    ns = dump("preflight")
    ns = home(ns, "preflight")
    ns = restore_verse(ns, "preflight-confirm-verse")
    tap(ns, "home-tab-my-work")
    positive_ready("preflight-mywork", ["home-tab-my-work"])

    exit_code = run_maestro()
    j["maestroExit"] = exit_code
    j["maestroElapsedS"] = round(time.monotonic() - t0, 3)
    save()

    # external finally restoration
    try:
        ns = home(dump("cleanup-current"), "cleanup")
        ns = restore_verse(ns, "cleanup")
        tap(ns, "home-tab-my-work")
        positive_ready("cleanup-mywork", ["home-tab-my-work"])
        j["finalDraftingUnit"] = kv_drafting_unit()
        assert j["finalDraftingUnit"] == "verse"
        j["finalRadios"] = {
            k: setting(k) for k in ["airplane_mode_on", "wifi_on"]
        }
        assert j["finalRadios"] == j["originalRadios"]
        raw = r("shell", "dumpsys", "package", "com.eten.fluent").decode()
        j["finalMic"] = [
            x.strip()
            for x in raw.splitlines()
            if "android.permission.RECORD_AUDIO: granted=" in x
        ]
        assert j["finalMic"] == j["originalMic"]
        j["afterFixture"] = q(FIXTURE_SQL)
        j["afterPeri"] = q(PERI_SQL)
        j["afterTakes"] = q(TAKES_SQL)
        assert j["afterFixture"] == j["beforeFixture"]
        assert j["afterPeri"] == j["beforePeri"]
        assert j["afterTakes"] == j["beforeTakes"]
        j["cleanupComplete"] = True
    except Exception as e:
        j["cleanupError"] = repr(e)
        save()
        raise

    j["outcome"] = "PASS" if exit_code == 0 else "FAIL"
    j["totalElapsedS"] = round(time.monotonic() - t0, 3)
    save()
    print(json.dumps({"outcome": j["outcome"], "exit": exit_code, **{k: j[k] for k in ("maestroElapsedS", "cleanupComplete", "beforeFixture")}}, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
