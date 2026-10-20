# Maestro Sync navigation (#721) — automation assessment

Factual notes for Home → Sync header navigation under Maestro. **No application
behavior change** in this correction. Debug artifacts stay under
`~/.maestro/tests/` or `/tmp` (not committed).

Official `tapOn` command reference (selector + within-element `point`
percentages):  
https://docs.maestro.dev/reference/commands-available/tapon

## Environment

| Item | Value |
|------|--------|
| Agent | `bc-9c8695db-e3d3-4df1-bdbb-e0caa02685f0` |
| Branch | `mrace/chore/717-build-out-full-maestro-e2e-coverage` |
| HEAD (at run) | `c81bd86d44eecda91dcaf16bb056200bbcb2355c` |
| Device | `emulator-5554`, `com.eten.fluent` |
| Maestro | `2.10.0` |
| Session | QA `userId` / `active_user_id` **10** preserved |

## Observed evidence

### Failed prior Maestro tap (`~/.maestro/tests/2026-10-19_174838`)

- Selector matched `home-sync-button` (`android.widget.Button`,
  bounds `[933,116][1038,221]`, clickable).
- Log: hierarchy-based tap **aimed at (985, 168)** (element center).
- Log: **“Something has changed in the UI judging by view hierarchy. Proceed.”**
  then tap **COMPLETED**.
- Assert `sync-screen` **FAILED**; post-hierarchy still Home.
- **Do not call this a wrong-coordinate miss** — Maestro already aimed the same
  center later used by a successful native `adb shell input tap 985 168`.

### Native discriminator (same QA session, live Metro)

- `adb shell input tap 985 168` opened Sync (temporary markers:
  press → handler → route `sync`; then removed). Proves JS navigation can work
  at that hit target under that session — **not** a diagnosis of Maestro’s
  internal gesture timing by itself.

### Overlay

- Nodes at center: SVG / ViewGroups `clickable=false`; button clickable. No
  competing clickable overlay observed.

### Schema / docs

- Installed Maestro YAML (`YamlElementSelector`) accepts **`point`** (and
  `waitUntilVisible`, etc.).
- **`relativePoint` is not a valid YAML property** here (`Unknown Property`);
  docs use `point` with a selector for within-element percentages
  ([tapOn reference](https://docs.maestro.dev/reference/commands-available/tapon)).

## Inferred (limits — not isolated causality)

- The failed-run UI-change log is **observed**; attributing it specifically to
  TouchableOpacity opacity settle vs other hierarchy churn is **inferred**.
- Why plain id-tap completed without Sync while native center-tap succeeded is
  **not fully isolated** (gesture duration, settle wait, press delivery, flake).
- Therefore this write-up states a **tested automation correction that passed**,
  not a proven single root cause.

## Correction tested (automation-only)

| File | Change |
|------|--------|
| `.maestro/shared/nav/goto-sync.yaml` | Drop 4× tap `repeat` loop; `waitForAnimationToEnd`; one `tapOn` with `id: home-sync-button` + `point: '50%,50%'` + `waitUntilVisible: true`; single `extendedWaitUntil` for `sync-screen`. |
| `.maestro/flows/sync/sync-entry-existing-session.yaml` | **Tracked** reusable Home→Sync→Home for existing logged-in session (no auth/reset). |
| `.maestro/flows/qa-warm-temp/sync-once.yaml` | TEMP diagnostic that **passed** (~61s); excluded from tracked path name. |
| `.maestro/shared/nav/goto-home.yaml` | PFO stack dismissal left to `ensure-no-modal` (`stack-header-back` only; no system-`back` PFO branch). |

Tracked command (do not re-run Sync solely for path promotion):

```bash
maestro test .maestro/flows/sync/sync-entry-existing-session.yaml
```

## ONE focused automated pass (executed)

```bash
maestro test .maestro/flows/qa-warm-temp/sync-once.yaml -e MAESTRO_ENV_LANE=qa
```


| Check | Result |
|-------|--------|
| Outcome | **PASS** (`EXIT=0`, ~61s wall) |
| Tap step | `Tap on id: home-sync-button at 50%,50%... COMPLETED` |
| Debug aim (Sync tap) | hierarchyBasedTap **`(985, 168)`** — same center as the prior **failed** plain id-tap (not a different coordinate) |
| `sync-screen` | **visible** (assert COMPLETED) |
| Return Home | `home-tab-my-work` visible |
| Session after | `active_user_id=10`, `userId=10`; not on login |
| App PID | `7152` (unchanged for this session) |
| Debug out | `/tmp/maestro-sync721-out/` (not in git) |

Other `(84, 169)` taps in the same log are **back** / non-Sync chrome (left header), not the Sync control.

Remaining uncertainty: this **PASS** validates the **tested correction package**
(`waitForAnimationToEnd` + YAML `point: '50%,50%'` + single wait, no tap-retry
loop). Geometric aim matched the failed run; therefore success is **not**
explained by “wrong coordinates.” Which sub-factor (pre-settle, explicit
`point` mapping, no retry loop, or variance) was necessary remains
**unisolated**.

## Proposed factual #721 resolution (for human review)

> Maestro previously selected the correct Sync header control and tapped its
> center `(985,168)` but completed on a hierarchy UI-change without
> `sync-screen`. Native center tap opened Sync in the same QA session. Automation
> updated per [Maestro tapOn `point`](https://docs.maestro.dev/reference/commands-available/tapon):
> animation settle + one within-element `point: '50%,50%'` (no app code change).
> One warm automated Home→Sync→back pass **PASSED** with user10 preserved.
> Low-level gesture causality remains partially unisolated; human device QA
> optional for product confirmation.
