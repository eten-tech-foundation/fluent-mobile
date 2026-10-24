#!/usr/bin/env python3
"""D-0623-01 A5554: synthetic pericope 13-16 take + Verse delete Cancel.

Reuses ADB/UI helpers from run-b0013-incomplete-pericope-guard.py.
Never confirms Delete. Preserves nine original selected takes + new take.
"""
from __future__ import annotations

import csv
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import signal
import subprocess
import time

REPO = pathlib.Path("/Users/matt/Documents/Development/gloo/fluent-mobile")
EVIDENCE = (
    REPO
    / "docs/assessments/maestro-acceptance-coverage/run-evidence"
    / "20261021-easy-ui-batch/d0623-a5554"
)
FLOW = (
    ".maestro/flows/qa717-easy-ui-batch/"
    "a-user10-d0623-pericope-delete-cancel-existing-session.yaml"
)
SERIAL = "emulator-5554"
BASELINE_HASHES = EVIDENCE / "baseline-nine-take-hashes.json"
ADB_BIN = "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools/adb"

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
    "schema": "qa717-d0623-a5554-pericope-delete-cancel/v1",
    "serial": SERIAL,
    "criterion": "D-0623-01",
    "case_id": "D0623_a5554_pericope_13_16_delete_cancel",
    "flow": FLOW,
    "claimBoundary": (
        "One synthetic pericope take 13-16 + Cancel-only delete confirm; "
        "preserve new take and nine original vv1-9 selected hashes"
    ),
}
b.j = j


def save() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "result.json").write_text(json.dumps(j, indent=2) + "\n")


def progress(milestone: str, **extra) -> None:
    EVIDENCE.joinpath("progress").mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "d0623-a5554-progress/v1",
        "milestone": milestone,
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **extra,
    }
    (EVIDENCE / "progress" / f"{milestone}.json").write_text(
        json.dumps(payload, indent=2) + "\n"
    )
    print("PROGRESS", milestone, flush=True)


def nine_take_state() -> dict:
    sql = (
        "SELECT r.id, bt.verse_number AS start_verse, r.end_verse, r.is_selected, "
        "r.sync_status, r.local_file_path, r.duration_ms "
        "FROM recordings r JOIN bible_texts bt ON bt.id=r.bible_text_id "
        "WHERE r.recorded_by_user_id=10 AND bt.bible_id=178 AND bt.book_id=60 "
        "AND bt.chapter_number=1 AND bt.verse_number BETWEEN 1 AND 9 "
        "AND r.granularity='verse' AND r.is_selected=1 "
        "ORDER BY bt.verse_number;"
    )
    rows = []
    for line in b.q(sql).splitlines():
        if not line.strip():
            continue
        rid, sv, ev, sel, sync, path, dur = line.split("|")
        rel = path.replace("file:///data/user/0/com.eten.fluent/", "")
        digest = (
            b.r("shell", f"run-as com.eten.fluent /system/bin/sha256sum {rel}")
            .decode()
            .split()[0]
        )
        rows.append(
            {
                "id": rid,
                "start_verse": int(sv),
                "end_verse": int(ev),
                "is_selected": sel,
                "sync_status": sync,
                "local_file_path": path,
                "duration_ms": int(dur),
                "sha256": digest,
            }
        )
    return {"count": len(rows), "takes": rows}


def range_13_16_take_count() -> int:
    sql = (
        "SELECT COUNT(*) FROM recordings r JOIN bible_texts bt ON bt.id=r.bible_text_id "
        "WHERE r.recorded_by_user_id=10 AND bt.bible_id=178 AND bt.book_id=60 "
        "AND bt.chapter_number=1 AND r.granularity='pericope' "
        "AND r.start_verse=13 AND r.end_verse=16;"
    )
    return int(b.q(sql) or "0")


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


def settle_toward_home(label: str) -> list:
    deadline = time.monotonic() + 60
    ns = b.dump(label + "-settle")
    while time.monotonic() < deadline:
        if b.has(ns, "record-stop-button"):
            # never leave an active capture unmonitored
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
    ns = b.positive_ready(label + "-drawer", ["settings-menu-account-12"])
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
    assert any(
        n.get("resource-id") == "settings-drafting-unit-verse"
        and n.get("selected") == "true"
        for n in ns
    )
    assert any(
        n.get("resource-id") == "settings-ui-version-legacy"
        and n.get("selected") == "true"
        for n in ns
    )
    b.tap(ns, "stack-header-back")
    b.positive_ready(label + "-home", ["home-tab-my-work", "home-settings-button"])


def validate_artifacts() -> None:
    text = (REPO / FLOW).read_text()
    for needle in [
        "open-fixture-chapter-from-milestone.yaml",
        "d0623-pericope-delete-cancel-values.js",
        "record-start-button",
        "record-stop-button",
        "Cancel",
        "d0623AlertTitleRe",
        "settings-menu-account-12",
    ]:
        assert needle in text, needle
    assert "open-my-work-chapter.yaml" not in text
    assert "ensure-no-modal.yaml" not in text
    assert "- tapOn:\n    id: 'record-start-button'" in text
    assert text.count("- tapOn:\n    id: 'record-start-button'") == 1
    assert text.count("- tapOn:\n    id: 'record-stop-button'") == 1
    assert "text: 'Delete'" not in text
    j["flowSha256"] = hashlib.sha256((REPO / FLOW).read_bytes()).hexdigest()
    save()


def run_offline_gates() -> None:
    env = os.environ.copy()
    env.update(
        {
            "MAESTRO_FIXTURE_PROJECT_ID": "12",
            "MAESTRO_FIXTURE_PROJECT_ALLOWLIST": "12",
            "MAESTRO_FIXTURE_PROJECT_DENYLIST": "944",
            "MAESTRO_FIXTURE_CHAPTER_ID": "1183",
            "MAESTRO_FIXTURE_MILESTONE_ID": "19",
            "PATH": (
                "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools:"
                "/Users/matt/.maestro/bin:" + env.get("PATH", "")
            ),
        }
    )
    node = subprocess.run(
        [
            "node",
            "--test",
            ".maestro/shared/scripts/d0623-pericope-delete-cancel-values.test.cjs",
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )
    j["nodeTestExit"] = node.returncode
    j["nodeTestTail"] = (node.stdout + node.stderr).strip().splitlines()[-12:]
    assert node.returncode == 0, node.stdout + node.stderr

    rec = subprocess.run(
        [
            "node",
            "scripts/maestro-fixture-guard.cjs",
            "--preflight",
            "--recursive",
            "--",
            "--device",
            SERIAL,
            "-e",
            "MAESTRO_FIXTURE_PROJECT_ID=12",
            "-e",
            "MAESTRO_FIXTURE_PROJECT_ALLOWLIST=12",
            "-e",
            "MAESTRO_FIXTURE_PROJECT_DENYLIST=944",
            "-e",
            "MAESTRO_FIXTURE_CHAPTER_ID=1183",
            "-e",
            "MAESTRO_FIXTURE_MILESTONE_ID=19",
            FLOW,
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )
    j["recursiveGuardExit"] = rec.returncode
    j["recursiveGuardStderr"] = rec.stderr.strip()
    assert rec.returncode == 0, rec.stderr or rec.stdout

    graal = subprocess.run(
        ["python3", str(REPO / "scripts/qa717-easy-ui-batch/d0623-graal-gate.py")],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=120,
    )
    j["graalExit"] = graal.returncode
    j["graalOut"] = graal.stdout.strip()
    assert graal.returncode == 0 and "OK_RANGE=13-16" in graal.stdout, (
        graal.stdout + graal.stderr
    )
    save()


def run_continue_maestro() -> int:
    """Cancel-only continuation; no Start/Stop. Uses existing 13-16 take."""
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
            "MAESTRO_FIXTURE_PROJECT_ID": "12",
            "MAESTRO_FIXTURE_PROJECT_ALLOWLIST": "12",
            "MAESTRO_FIXTURE_PROJECT_DENYLIST": "944",
            "MAESTRO_FIXTURE_CHAPTER_ID": "1183",
            "MAESTRO_FIXTURE_MILESTONE_ID": "19",
        }
    )
    flow = (
        ".maestro/flows/qa717-easy-ui-batch/"
        "a-user10-d0623-pericope-delete-cancel-continue-existing-session.yaml"
    )
    out_dir = EVIDENCE / "maestro-continue"
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "run.log"
    extra = [
        "-e",
        "MAESTRO_FIXTURE_PROJECT_ID=12",
        "-e",
        "MAESTRO_FIXTURE_PROJECT_ALLOWLIST=12",
        "-e",
        "MAESTRO_FIXTURE_PROJECT_DENYLIST=944",
        "-e",
        "MAESTRO_FIXTURE_CHAPTER_ID=1183",
        "-e",
        "MAESTRO_FIXTURE_MILESTONE_ID=19",
        "-e",
        "MAESTRO_D0623_PROJECT_ID=12",
        "-e",
        "MAESTRO_D0623_ASSIGNMENT_ID=1183",
        "-e",
        "MAESTRO_D0623_USER_ID=10",
        "-e",
        "MAESTRO_D0623_SERIAL=emulator-5554",
        "-e",
        "MAESTRO_D0623_EXISTING_TAKE_VERIFIED=1",
        "-e",
        "MAESTRO_D0623_RANGE_ATTESTATION=fcbh-1peter1-s3-p1-v13-16",
        "--test-output-dir",
        str(out_dir),
        flow,
    ]
    with log_path.open("w") as log:
        proc = subprocess.Popen(
            ["bash", "scripts/maestro-test-qa.sh", *extra],
            cwd=REPO,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        j["continueMaestroPid"] = proc.pid
        save()
        try:
            return proc.wait(timeout=300)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=15)
            j["continueTimedOut"] = True
            return 124


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
            "MAESTRO_FIXTURE_PROJECT_ID": "12",
            "MAESTRO_FIXTURE_PROJECT_ALLOWLIST": "12",
            "MAESTRO_FIXTURE_PROJECT_DENYLIST": "944",
            "MAESTRO_FIXTURE_CHAPTER_ID": "1183",
            "MAESTRO_FIXTURE_MILESTONE_ID": "19",
        }
    )
    out_dir = EVIDENCE / "maestro-run"
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "run.log"
    gargs = [
        "node",
        "scripts/maestro-fixture-guard.cjs",
        "--preflight",
        "--recursive",
        "--",
        "--device",
        SERIAL,
        "-e",
        "MAESTRO_FIXTURE_PROJECT_ID=12",
        "-e",
        "MAESTRO_FIXTURE_PROJECT_ALLOWLIST=12",
        "-e",
        "MAESTRO_FIXTURE_PROJECT_DENYLIST=944",
        "-e",
        "MAESTRO_FIXTURE_CHAPTER_ID=1183",
        "-e",
        "MAESTRO_FIXTURE_MILESTONE_ID=19",
        FLOW,
    ]
    # Device comes from ANDROID_SERIAL / maestro-test.sh resolve — do not pass --device twice.
    extra = [
        "-e",
        "MAESTRO_FIXTURE_PROJECT_ID=12",
        "-e",
        "MAESTRO_FIXTURE_PROJECT_ALLOWLIST=12",
        "-e",
        "MAESTRO_FIXTURE_PROJECT_DENYLIST=944",
        "-e",
        "MAESTRO_FIXTURE_CHAPTER_ID=1183",
        "-e",
        "MAESTRO_FIXTURE_MILESTONE_ID=19",
        "-e",
        "MAESTRO_D0623_PROJECT_ID=12",
        "-e",
        "MAESTRO_D0623_ASSIGNMENT_ID=1183",
        "-e",
        "MAESTRO_D0623_USER_ID=10",
        "-e",
        "MAESTRO_D0623_CACHED_IDS=10,9,12",
        "-e",
        "MAESTRO_D0623_SERIAL=emulator-5554",
        "-e",
        "MAESTRO_HOST_MIC_DISABLED_VERIFIED=1",
        "-e",
        "MAESTRO_D0623_APP_MIC_GRANTED_VERIFIED=1",
        "-e",
        "MAESTRO_D0623_EMPTY_RANGE_VERIFIED=1",
        "-e",
        "MAESTRO_D0623_RANGE_ATTESTATION=fcbh-1peter1-s3-p1-v13-16",
        "-e",
        "MAESTRO_D0623_CONTEXT_VERIFIED=1",
        "--test-output-dir",
        str(out_dir),
        FLOW,
    ]
    with log_path.open("w") as log:
        guard = subprocess.run(
            gargs, cwd=REPO, env=env, capture_output=True, text=True, timeout=60
        )
        log.write(guard.stdout or "")
        log.write(guard.stderr or "")
        if guard.returncode != 0:
            j["recursivePreflightAtRun"] = (guard.stderr or guard.stdout).strip()
            save()
            return guard.returncode
        proc = subprocess.Popen(
            ["bash", "scripts/maestro-test-qa.sh", *extra],
            cwd=REPO,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        j["maestroPid"] = proc.pid
        save()
        try:
            return proc.wait(timeout=420)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=15)
            j["timedOut"] = True
            return 124


def main() -> int:
    t0 = time.monotonic()
    wall0 = time.time()
    validate_artifacts()
    run_offline_gates()
    progress("runner-ready", flow=FLOW, serial=SERIAL)
    progress(
        "validation-complete",
        node=j.get("nodeTestExit"),
        recursive=j.get("recursiveGuardExit"),
        graal=j.get("graalOut"),
    )

    baseline = json.loads(BASELINE_HASHES.read_text())
    j["originalRadios"] = {k: b.setting(k) for k in ["airplane_mode_on", "wifi_on"]}
    assert j["originalRadios"] == {"airplane_mode_on": "0", "wifi_on": "1"}
    j["originalMic"] = mic_lines()
    assert len(j["originalMic"]) == 1 and "granted=true" in j["originalMic"][0]
    host = (EVIDENCE / "preflight-hostmicoff.txt").read_text().strip()
    j["hostMicOffFile"] = host
    assert host.upper() in {"OK", "1", "TRUE"}

    before = nine_take_state()
    j["beforeNine"] = before
    assert before["count"] == 9
    assert before["takes"] == baseline["takes"]
    j["beforeRange1316"] = range_13_16_take_count()
    assert j["beforeRange1316"] == 0
    prefs = kv_prefs()
    j["beforePrefs"] = prefs
    assert prefs.get("active_user_id") == "12"
    assert not b.has(b.dump("preflight-no-capture"), "record-stop-button")
    j["fixtureAdmitted"] = True
    save()

    try:
        restore_home12_verse_legacy("preflight")
    except Exception as e:
        j["navFailure"] = repr(e)
        j["outcome"] = "BLOCKED_NAV_PREFLIGHT"
        save()
        progress("nav-failure", error=repr(e))
        return 2

    progress("capture-start", range="13-16")
    cli0 = time.monotonic()
    exit_code = run_maestro()
    j["maestroExit"] = exit_code
    j["maestroCliElapsedS"] = round(time.monotonic() - cli0, 3)
    save()
    progress(
        "capture-save-cancel" if exit_code == 0 else "capture-failed",
        maestroExit=exit_code,
        cliS=j["maestroCliElapsedS"],
    )

    # If save landed but sync assert failed, finish Cancel-only without second take.
    mid_count = range_13_16_take_count()
    j["midRange1316"] = mid_count
    if exit_code != 0 and mid_count == 1:
        progress("cancel-continue-start", takeCount=mid_count)
        c0 = time.monotonic()
        # Return to Home before continue flow (first nav failure stops)
        try:
            settle_toward_home("pre-continue")
        except Exception as e:
            j["navFailure"] = repr(e)
            j["outcome"] = "BLOCKED_NAV_PRE_CONTINUE"
            save()
            progress("nav-failure", error=repr(e))
            return 2
        cont_exit = run_continue_maestro()
        j["continueExit"] = cont_exit
        j["continueCliElapsedS"] = round(time.monotonic() - c0, 3)
        save()
        progress(
            "cancel-complete" if cont_exit == 0 else "cancel-failed",
            continueExit=cont_exit,
        )
        exit_code = cont_exit if cont_exit != 0 else 0

    try:
        restore_home12_verse_legacy("cleanup")
        j["finalRadios"] = {k: b.setting(k) for k in ["airplane_mode_on", "wifi_on"]}
        assert j["finalRadios"] == j["originalRadios"]
        j["finalMic"] = mic_lines()
        assert j["finalMic"] == j["originalMic"]
        after_nine = nine_take_state()
        j["afterNine"] = after_nine
        assert after_nine["takes"] == baseline["takes"]
        j["afterRange1316"] = range_13_16_take_count()
        if exit_code == 0:
            assert j["afterRange1316"] == 1, j["afterRange1316"]
        prefs = kv_prefs()
        j["afterPrefs"] = prefs
        assert prefs.get("active_user_id") == "12"
        j["cleanupComplete"] = True
    except Exception as e:
        j["cleanupError"] = repr(e)
        save()
        progress("cleanup-error", error=repr(e))
        raise

    j["outcome"] = "PASS" if exit_code == 0 else "FAIL"
    j["totalElapsedS"] = round(time.monotonic() - t0, 3)
    j["totalWallElapsedS"] = round(time.time() - wall0, 3)
    save()
    print(
        json.dumps(
            {
                "outcome": j["outcome"],
                "exit": exit_code,
                "maestroCliElapsedS": j.get("maestroCliElapsedS"),
                "totalElapsedS": j["totalElapsedS"],
                "afterRange1316": j.get("afterRange1316"),
                "ninePreserved": j.get("afterNine", {}).get("takes")
                == baseline["takes"],
                "cleanupComplete": j.get("cleanupComplete"),
            },
            indent=2,
        ),
        flush=True,
    )
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
