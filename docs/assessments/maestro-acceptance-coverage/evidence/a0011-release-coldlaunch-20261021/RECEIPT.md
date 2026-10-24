# A-0011-01 authenticated offline cold launch — release APK reconciliation

Generated: `2026-10-21T19:35:00Z`

Narrow ledger write for **A-0011-01** only. No devices/tests/code/source-integration/git publication. Canonical inventory remains **202**.

## Artifact

Absolute: `/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/release-coldlaunch-20261021`

| File | sha256 |
| --- | --- |
| RECEIPT.md | `8b735d7a35ac593c7e00a4b58d7cfd6f7a07aea27f7049a1f87245f78af75518` |
| b-restoration-verification.txt | `6bb43619e68c3d9d2b92018e6b2624afdcd6859a2069bd7c35ec6989d9efd5a6` |
| connectivity-offline.txt | `96e413bb45b1e4f9dbb3f9f43615474d8c8cc105a020a765f7b4bf10d018446d` |
| pid-before.txt | `c05a5bccb0fa554c3a9257002d8827119501e8b3faaf2000970b0c4fb027c88c` |
| pid-after-stop.txt | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| pid-after-coldstart.txt | `905929055657d6a0992a4ca3715d8130ed4bbcdf0cf3327fdb729e58c58ae1a7` |
| temp-lifecycle.events | `ee18870922ef1782394c2b908b20382a0c2e8b3f7b3cec24deee46165e8c27f6` |
| offline-cold-home.xml | `1e11f1578e4ae2a907331a57bf78e54da60e92fb70e22bd934855e56ab5fdf5f` |
| offline-cold-settled.xml | `1e11f1578e4ae2a907331a57bf78e54da60e92fb70e22bd934855e56ab5fdf5f` |
| account-after-offline-coldstart.xml | `12cccebcd2a43115f864bfdecd2a88709a654f401f1451cdf46236c3b7e8cbd4` |

## Exact APK scope (source commit unattested)

- Package `com.eten.fluent` 1.0.0 code 1, nondebuggable, embedded QA API `https://qa.api.fluent.bible`
- Host SHA256 `28af24f767d43ff67dfb9743049de9fa3d718ce3d528314f81029d4329e36b6b` (128667201 bytes)
- Guest emulator5558 / Fluent_QA717_Release_API33; temporary lane only

## Literal observations

- Human signed in PM9; credentials not read/copied
- Offline: `Active default network: none`
- Force-stop: pid before `5611` → after-stop empty → coldstart `6158`
- `am start -W` LaunchState **COLD**, TotalTime **1241ms** (activity launch only; not login/full-sync; A-0025 unchanged)
- `am_proc_start` records new PID 6158 for MainActivity
- Offline cold Home: `home-tab-projects` / `home-tab-my-work` present; `login-email-input` absent; Offline · nothing pending; no Metro/devlauncher
- Drawer after cold: `settings-menu-active-9` / `settings-menu-account-9` retained offline
- Prior Expo development-launcher FAIL evidence retained on the row
- `b-restoration-verification.txt` present: original B5556 restored; temp 5558 stopped

## Status decisions

| ID | Before | After |
| --- | --- | --- |
| A-0011-01 | partial / BLOCKED | complete_for_requirement / PASS |
| A-0025-01 | not_run / BLOCKED | UNCHANGED |
| D-0447-01 | partial / UNTESTED | UNCHANGED (static partial) |

Eligible atomic execution coverage: **42/21/23 → 43/20/23**
