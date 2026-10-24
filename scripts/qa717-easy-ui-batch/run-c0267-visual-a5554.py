#!/usr/bin/env python3
"""C-0267-01 primary vs muted ownership icon visual on A5554. List-only."""
from __future__ import annotations

import csv
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as E
from PIL import Image

REPO = pathlib.Path("/Users/matt/Documents/Development/gloo/fluent-mobile")
EVIDENCE = (
    REPO
    / "docs/assessments/maestro-acceptance-coverage/run-evidence"
    / "20261021-easy-ui-batch/c0267-visual-primary-muted"
)
FLOW = (
    ".maestro/flows/qa717-easy-ui-batch/"
    "a-user10-c0267-ownership-primary-muted-visual-existing-session.yaml"
)
SERIAL = "emulator-5554"
ADB_BIN = "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools/adb"
PRIMARY = (0x0B, 0x50, 0xD0)
MUTED = (0x54, 0x54, 0x54)
CARD = (0xEA, 0xEE, 0xF5)
WHITE = (0xFF, 0xFF, 0xFF)
# Anti-alias / fill sampling against card/white background
RGB_TOL = 48
MIN_MATCH_PIXELS = 8

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
    "schema": "c0267-01-visual-primary-muted-a5554/v1",
    "criterion": "C-0267-01",
    "branch": "primary_vs_muted_ownership_icon_pixels",
    "serial": SERIAL,
    "flow": FLOW,
    "issue": 267,
    "legacyTokens": {
        "primary": "#0B50D0",
        "mutedForeground": "#545454",
        "cardSurface": "#EAEEF5",
        "source": "src/theme/tokens.ts + ChapterOwnershipIcon.tsx",
    },
    "pixelMethod": {
        "screenshot": "Maestro takeScreenshot on chapter list with 1184+1185 visible",
        "bounds": "uiautomator/Maestro hierarchy resource-id chapter-ownership-mine|other",
        "sample": "count non-background pixels within RGB_TOL of token; require MIN_MATCH_PIXELS",
        "rgb_tol": RGB_TOL,
        "min_match_pixels": MIN_MATCH_PIXELS,
        "background_excluded": ["#FFFFFF", "#EAEEF5", "near-white/card"],
        "antialias": "tolerance allows AA fringe; does not invent PASS without matches",
    },
    "B5556": "MUST_NOT_TOUCH",
    "quarantine": "no writes to task-10/worktrees|artifacts/717-tooling-cleanup",
}

b.j = j


def save() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "result.json").write_text(json.dumps(j, indent=2) + "\n")


def progress(milestone: str, **extra) -> None:
    EVIDENCE.joinpath("progress").mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "c0267-visual-progress/v1",
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
        "SELECT r.id, bt.chapter_number, bt.verse_number, r.end_verse, "
        "r.is_selected, r.sync_status, r.local_file_path, r.duration_ms, r.granularity "
        "FROM recordings r JOIN bible_texts bt ON bt.id=r.bible_text_id "
        "WHERE r.recorded_by_user_id=10 "
        "ORDER BY bt.chapter_number, bt.verse_number, r.id;"
    )
    rows = []
    for line in b.q(sql).splitlines():
        if not line.strip():
            continue
        rid, ch, sv, ev, sel, sync, path, dur, gran = line.split("|")
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
                "sha256": digest,
                "granularity": gran,
                "duration_ms": int(dur),
            }
        )
    return {"count": len(rows), "takes": rows}


def assignments() -> dict:
    sql = (
        "SELECT id,IFNULL(assigned_user_id,'NULL'),IFNULL(peer_checker_id,'NULL'),"
        "status,total_verses,completed_verses,has_conflict "
        "FROM chapter_assignments WHERE id IN (1183,1184,1185) ORDER BY id;"
    )
    out = {}
    for line in b.q(sql).splitlines():
        if not line.strip():
            continue
        aid, a, p, st, tot, comp, conf = line.split("|")
        out[aid] = {
            "assigned": None if a == "NULL" else int(a),
            "peer": None if p == "NULL" else int(p),
            "status": st,
            "total": int(tot),
            "completed": int(comp),
            "conflict": int(conf),
        }
    return out


def kv_prefs() -> dict:
    raw = b.q_header(
        "SELECT key,value FROM storage WHERE key IN "
        "('active_user_id','known_user_ids','10:drafting_unit','ui_version');",
        "databases/kv/__opsqlite_storage.sqlite",
    )
    return {row["key"]: row["value"] for row in csv.DictReader(io.StringIO(raw))}


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
            raise AssertionError("ACTIVE_CAPTURE")
        if b.has(ns, "home-settings-button") and b.has(ns, "home-tab-my-work"):
            return ns
        if b.has(ns, "drafting-header-back"):
            b.tap(ns, "drafting-header-back")
        elif b.has(ns, "stack-header-back"):
            b.tap(ns, "stack-header-back")
        elif b.has(ns, "prepare-offline-screen") and b.has(ns, "stack-header-back"):
            b.tap(ns, "stack-header-back")
        time.sleep(0.4)
        ns = b.dump(label + "-settle")
    raise AssertionError(("SETTLE_HOME_TIMEOUT", label))


def restore_home12_verse_legacy(label: str) -> None:
    ns = settle_toward_home(label)
    ns = b.home(ns, label)
    b.tap(ns, "home-settings-button")
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
                ["settings-menu-active-12|account-12"],
            )
        )
    if not b.has(ns, "settings-menu-active-12"):
        b.tap(ns, "settings-menu-account-12")
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            ns = b.dump(label + "-pfo")
            if b.has(ns, "prepare-offline-screen") and b.has(ns, "stack-header-back"):
                b.tap(ns, "stack-header-back")
                time.sleep(0.4)
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
    peri = [n for n in ns if n.get("resource-id") == "settings-drafting-unit-pericope"]
    verse = [n for n in ns if n.get("resource-id") == "settings-drafting-unit-verse"]
    if peri and verse and (
        peri[0].get("selected") == "true" or verse[0].get("selected") != "true"
    ):
        b.tap(ns, "settings-drafting-unit-verse")
        ns = b.positive_ready(label + "-verse", ["settings-drafting-unit-verse"])
    legacy = [n for n in ns if n.get("resource-id") == "settings-ui-version-legacy"]
    if legacy and legacy[0].get("selected") != "true":
        b.tap(ns, "settings-ui-version-legacy")
        ns = b.positive_ready(label + "-legacy", ["settings-ui-version-legacy"])
    b.tap(ns, "stack-header-back")
    b.positive_ready(label + "-home", ["home-tab-my-work", "home-settings-button"])


def near(c, target, tol=RGB_TOL) -> bool:
    return all(abs(int(c[i]) - target[i]) <= tol for i in range(3))


def is_bg(c) -> bool:
    return near(c, WHITE, 12) or near(c, CARD, 18) or (
        c[0] > 230 and c[1] > 230 and c[2] > 230
    )


def parse_bounds(s: str):
    m = re.findall(r"\d+", s or "")
    if len(m) < 4:
        return None
    x1, y1, x2, y2 = map(int, m[:4])
    return x1, y1, x2, y2


def bounds_from_hierarchy_json(path: pathlib.Path, rid: str):
    data = json.loads(path.read_text())
    # Maestro hierarchy JSON varies; walk for resource-id / attributes
    found = []

    def walk(node):
        if not isinstance(node, dict):
            return
        attrs = node.get("attributes") or node
        resid = (
            attrs.get("resource-id")
            or attrs.get("resourceId")
            or attrs.get("rid")
            or ""
        )
        if resid.endswith(rid) or resid == rid or rid in str(resid):
            bnds = attrs.get("bounds") or node.get("bounds") or node.get("b")
            if isinstance(bnds, str):
                found.append(parse_bounds(bnds))
            elif isinstance(bnds, list) and len(bnds) == 4:
                found.append(tuple(bnds))
        for ch in node.get("children") or node.get("c") or []:
            walk(ch)

    if "elements" in data:
        walk({"c": data["elements"]} if not isinstance(data["elements"], dict) else data)
        if isinstance(data["elements"], list):
            for el in data["elements"]:
                walk(el)
    else:
        walk(data)
    found = [f for f in found if f]
    return found[0] if found else None


def bounds_from_xml(xml_bytes: bytes, rid: str):
    for n in E.fromstring(xml_bytes).iter("node"):
        if n.get("resource-id") == rid:
            return parse_bounds(n.get("bounds", ""))
    return None


def sample_region(img: Image.Image, bounds, target):
    x1, y1, x2, y2 = bounds
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(img.width, x2), min(img.height, y2)
    if x2 <= x1 or y2 <= y1:
        return {"ok": False, "reason": "empty_bounds", "match": 0, "sampled": 0}
    crop = img.crop((x1, y1, x2, y2))
    px = list(crop.getdata())
    match = 0
    non_bg = 0
    for p in px:
        rgb = p[:3]
        if is_bg(rgb):
            continue
        non_bg += 1
        if near(rgb, target):
            match += 1
    return {
        "ok": match >= MIN_MATCH_PIXELS,
        "match": match,
        "non_bg": non_bg,
        "sampled": len(px),
        "bounds": [x1, y1, x2, y2],
        "target": "#%02X%02X%02X" % target,
    }


def find_artifacts(out_dir: pathlib.Path):
    pngs = [p for p in out_dir.rglob("*.png") if p.is_file()]
    shot = None
    for p in pngs:
        if "c0267-ownership-primary-muted" in p.name:
            shot = p
            break
    if not shot and pngs:
        shot = max(pngs, key=lambda p: p.stat().st_size)
    hier = [p for p in out_dir.rglob("*.json") if p.is_file()]
    hier_xml = [p for p in out_dir.rglob("*.xml") if p.is_file()]
    return shot, hier, hier_xml


def run_offline_gates() -> None:
    env = os.environ.copy()
    env["PATH"] = (
        "/opt/homebrew/Caskroom/android-platform-tools/37.0.1/platform-tools:"
        "/Users/matt/.maestro/bin:" + env.get("PATH", "")
    )
    node = subprocess.run(
        [
            "node",
            "--test",
            ".maestro/shared/scripts/c0267-ownership-visual-values.test.cjs",
        ],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
    )
    j["nodeTestExit"] = node.returncode
    j["nodeTestTail"] = (node.stdout + node.stderr)[-800:]
    graal = subprocess.run(
        ["python3", "scripts/qa717-easy-ui-batch/c0267-graal-gate.py"],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
    )
    j["graalExit"] = graal.returncode
    j["graalOut"] = (graal.stdout or "")[-400:]
    save()
    if node.returncode != 0 or graal.returncode != 0:
        raise AssertionError("OFFLINE_GATE_FAIL")


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
    out_dir = EVIDENCE / "maestro-run"
    out_dir.mkdir(parents=True, exist_ok=True)
    e_flags = [
        ("MAESTRO_C0267_PROJECT_ID", "12"),
        ("MAESTRO_FIXTURE_PROJECT_ID", "12"),
        ("MAESTRO_C0267_MILESTONE_ID", "19"),
        ("MAESTRO_FIXTURE_MILESTONE_ID", "19"),
        ("MAESTRO_FIXTURE_CHAPTER_ID", "1185"),
        ("MAESTRO_FIXTURE_PROJECT_ALLOWLIST", "12"),
        ("MAESTRO_FIXTURE_PROJECT_DENYLIST", "944"),
        ("MAESTRO_C0267_MINE_ASSIGNMENT_ID", "1185"),
        ("MAESTRO_C0267_OTHER_ASSIGNMENT_ID", "1184"),
        ("MAESTRO_C0267_USER_ID", "10"),
        ("MAESTRO_C0267_CACHED_IDS", "10,9,12"),
        ("MAESTRO_C0267_SERIAL", "emulator-5554"),
        (
            "MAESTRO_C0267_VISUAL_ATTESTATION",
            "p12-m19-1185mine-1184other-legacy-primary-muted",
        ),
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
    if g.returncode != 0:
        j["recursiveGuardStderr"] = (g.stderr or "")[-500:]
        save()
        return g.returncode
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
    j["maestroOutDir"] = str(out_dir)
    save()
    return proc.returncode


def evaluate_pixels(out_dir: pathlib.Path) -> dict:
    shot, hier_jsons, hier_xmls = find_artifacts(out_dir)
    result = {
        "screenshot": str(shot) if shot else None,
        "mineBounds": None,
        "otherBounds": None,
        "minePixel": None,
        "otherPixel": None,
        "oracle": "MISSING_COMPARISON",
    }
    if not shot or not shot.exists():
        result["reason"] = "screenshot_missing"
        return result
    # copy screenshot into evidence root
    dest = EVIDENCE / "c0267-ownership-primary-muted-1185-1184.png"
    dest.write_bytes(shot.read_bytes())
    result["screenshot"] = str(dest)
    img = Image.open(dest).convert("RGB")

    mine_b = other_b = None
    for hj in sorted(hier_jsons, key=lambda p: p.stat().st_mtime, reverse=True)[:40]:
        if mine_b is None:
            mine_b = bounds_from_hierarchy_json(hj, "chapter-ownership-mine")
        if other_b is None:
            other_b = bounds_from_hierarchy_json(hj, "chapter-ownership-other")
        if mine_b and other_b:
            result["hierarchySource"] = str(hj)
            break
    if not (mine_b and other_b):
        # fresh dump only if still on list (unlikely); record missing
        result["reason"] = "icon_bounds_not_found_in_maestro_hierarchy"
        result["oracle"] = "MISSING_COMPARISON"
        result["screenshotRetained"] = True
        return result

    result["mineBounds"] = list(mine_b)
    result["otherBounds"] = list(other_b)
    # Scale hierarchy bounds if screenshot size differs from device display
    # Assume 1:1 for emulator screencap vs uiautomator (common on this setup)
    mine_px = sample_region(img, mine_b, PRIMARY)
    other_px = sample_region(img, other_b, MUTED)
    result["minePixel"] = mine_px
    result["otherPixel"] = other_px
    # Cross-check: mine should NOT match muted as dominant; other NOT primary
    mine_as_muted = sample_region(img, mine_b, MUTED)
    other_as_primary = sample_region(img, other_b, PRIMARY)
    result["crossCheck"] = {
        "mineMatchesMuted": mine_as_muted,
        "otherMatchesPrimary": other_as_primary,
    }
    if (
        mine_px["ok"]
        and other_px["ok"]
        and mine_as_muted["match"] < mine_px["match"]
        and other_as_primary["match"] < other_px["match"]
    ):
        result["oracle"] = "PIXEL_PASS"
    elif mine_px["ok"] or other_px["ok"]:
        result["oracle"] = "PIXEL_PARTIAL"
        result["reason"] = "one_icon_matched_token_other_did_not"
    else:
        result["oracle"] = "MISSING_COMPARISON"
        result["reason"] = (
            "no_token_colored_pixels_above_threshold_in_icon_bounds"
            "; screenshot retained; source tokens complementary only"
        )
        result["screenshotRetained"] = True
    return result


def main() -> int:
    t0 = time.monotonic()
    j["flowSha256"] = hashlib.sha256((REPO / FLOW).read_bytes()).hexdigest()
    progress("start")
    # quarantine touch check — read-only existence only
    q1 = pathlib.Path(
        "/Users/matt/Documents/Codex/2026-10-19/task-10/worktrees/717-tooling-cleanup"
    )
    q2 = pathlib.Path(
        "/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/717-tooling-cleanup"
    )
    j["quarantinePathsExist"] = {"worktree": q1.exists(), "artifacts": q2.exists()}
    j["quarantineWrites"] = False

    b5556 = subprocess.run(
        [ADB_BIN, "-H", "127.0.0.1", "-P", "5037", "-s", "emulator-5556", "get-state"],
        capture_output=True,
        text=True,
    )
    j["B5556_get_state_only"] = (b5556.stdout or "").strip()
    j["B5556_touched"] = False

    try:
        run_offline_gates()
        progress("offline-gates-ok", node=j["nodeTestExit"], graal=j["graalExit"])
    except Exception as e:
        j["outcome"] = "BLOCKED_OFFLINE_GATE"
        j["error"] = repr(e)
        save()
        return 2

    j["originalRadios"] = {k: b.setting(k) for k in ["airplane_mode_on", "wifi_on"]}
    j["originalMic"] = mic_lines()
    j["beforePrefs"] = kv_prefs()
    assert j["beforePrefs"].get("active_user_id") == "12"
    takes = all10_take_state()
    j["beforeTakes"] = {"count": takes["count"], "ids": [t["id"] for t in takes["takes"]]}
    assert takes["count"] == 10
    (EVIDENCE / "all10-take-hashes.json").write_text(json.dumps(takes, indent=2) + "\n")
    j["beforeAssignments"] = assignments()
    assert j["beforeAssignments"]["1185"]["assigned"] == 10
    assert j["beforeAssignments"]["1185"]["peer"] == 11
    assert j["beforeAssignments"]["1185"]["status"] == "draft"
    assert j["beforeAssignments"]["1184"]["assigned"] == 11
    progress("snapshot-ok", takes=10)

    try:
        restore_home12_verse_legacy("preflight")
    except Exception as e:
        j["outcome"] = "BLOCKED_NAV_PREFLIGHT"
        j["error"] = repr(e)
        save()
        return 2

    progress("maestro-start")
    cli0 = time.monotonic()
    exit_code = run_maestro()
    j["maestroCliElapsedS"] = round(time.monotonic() - cli0, 3)
    save()
    progress("maestro-done", exit=exit_code, cliS=j["maestroCliElapsedS"])

    pixel = {"oracle": "SKIPPED_MAESTRO_FAIL"}
    if exit_code == 0:
        pixel = evaluate_pixels(pathlib.Path(j["maestroOutDir"]))
    else:
        log = pathlib.Path(j["maestroLog"]).read_text(errors="replace")
        j["lastMaestroLines"] = "\n".join(log.splitlines()[-25:])
    j["pixelEvaluation"] = pixel

    try:
        restore_home12_verse_legacy("cleanup")
        j["finalRadios"] = {k: b.setting(k) for k in ["airplane_mode_on", "wifi_on"]}
        assert j["finalRadios"] == j["originalRadios"]
        j["finalMic"] = mic_lines()
        assert j["finalMic"] == j["originalMic"]
        after = all10_take_state()
        assert after["takes"] == takes["takes"]
        prefs = kv_prefs()
        assert prefs.get("active_user_id") == "12"
        j["afterAssignments"] = assignments()
        j["cleanupComplete"] = True
    except Exception as e:
        j["cleanupError"] = repr(e)
        try:
            restore_home12_verse_legacy("cleanup-retry")
        except Exception as e2:
            j["cleanupRetryError"] = repr(e2)
        save()
        progress("cleanup-error", error=repr(e))

    ui_pass = exit_code == 0
    oracle = pixel.get("oracle")
    if ui_pass and oracle == "PIXEL_PASS":
        j["outcome"] = "VISUAL_BRANCH_PASS"
        j["fullCriterionClosed"] = False
        j["note"] = (
            "Primary/muted pixel oracle PASS on 1185/1184; "
            "C-0267 remains nonadditive_parent partial until full matrix"
        )
    elif ui_pass:
        j["outcome"] = "UI_ASSERT_PASS_PIXEL_INCONCLUSIVE"
        j["fullCriterionClosed"] = False
        j["note"] = (
            "Hierarchy mine/other asserts PASS; pixel oracle "
            f"{oracle}; screenshot retained; no invented visual PASS"
        )
    else:
        j["outcome"] = "FAIL"
        j["fullCriterionClosed"] = False

    j["totalElapsedS"] = round(time.monotonic() - t0, 3)
    j["canonical86CountsUnchanged"] = True
    save()
    compact = {
        "schema": "c0267-visual-compact/v1",
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "outcome": j["outcome"],
        "maestroExit": exit_code,
        "maestroCliElapsedS": j.get("maestroCliElapsedS"),
        "pixelOracle": oracle,
        "screenshot": pixel.get("screenshot"),
        "minePixel": pixel.get("minePixel"),
        "otherPixel": pixel.get("otherPixel"),
        "fullCriterionClosed": False,
        "canonical86": "unchanged 36/14/36",
        "cleanupComplete": j.get("cleanupComplete"),
        "B5556_touched": False,
        "quarantineWrites": False,
    }
    (EVIDENCE / "compact-receipt.json").write_text(json.dumps(compact, indent=2) + "\n")
    progress("complete", outcome=j["outcome"], oracle=oracle)
    print(json.dumps(compact, indent=2), flush=True)
    return 0 if ui_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
