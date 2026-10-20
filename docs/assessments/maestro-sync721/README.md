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

## Historical observed evidence (2026-10-19)

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

### Earlier overlay interpretation (superseded)

- The earlier assessment read SVG / ViewGroup `clickable=false` flags and
  described no competing clickable overlay. That interpretation is superseded
  by the retained native Compose target evidence below: an overlay can handle
  pointer input while its accessibility nodes report `clickable=false`.
- Correct coordinate aim alone does not exclude interception by an overlapping
  native debug control.

### Schema / docs

- Installed Maestro YAML (`YamlElementSelector`) accepts **`point`** (and
  `waitUntilVisible`, etc.).
- **`relativePoint` is not a valid YAML property** here (`Unknown Property`);
  docs use `point` with a selector for within-element percentages
  ([tapOn reference](https://docs.maestro.dev/reference/commands-available/tapon)).

## Historical timing inference (2026-10-19; superseded as current diagnosis)

- The failed-run UI-change log is **observed**; attributing it specifically to
  TouchableOpacity opacity settle vs other hierarchy churn is **inferred**.
- Why plain id-tap completed without Sync while native center-tap succeeded is
  **not fully isolated** (gesture duration, settle wait, press delivery, flake).
- The historical automation package passed, but that outcome did not isolate
  gesture timing or establish which native target received the original press.
  Retain the result as dated evidence; use the overlay geometry below for the
  current diagnostic limits.

## Historical correction tested (2026-10-19; automation-only)

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

## Historical ONE focused automated pass (2026-10-19; executed)

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

Historical interpretation: this **PASS** validates the **tested correction package**
(`waitForAnimationToEnd` + YAML `point: '50%,50%'` + single wait, no tap-retry
loop). Geometric aim matched the failed run; therefore success is **not**
explained by “wrong coordinates.” Which sub-factor (pre-settle, explicit
`point` mapping, no retry loop, or variance) was necessary remains
**unisolated**. The later native-overlay evidence also prevents attributing
this historical success to the timing package alone.

## Historical proposed #721 resolution (2026-10-19; superseded draft)

Retained for provenance. Do not post this earlier draft as the current finding:
its timing emphasis predates the native-overlay review.

> Maestro previously selected the correct Sync header control and tapped its
> center `(985,168)` but completed on a hierarchy UI-change without
> `sync-screen`. Native center tap opened Sync in the same QA session. Automation
> updated per [Maestro tapOn `point`](https://docs.maestro.dev/reference/commands-available/tapon):
> animation settle + one within-element `point: '50%,50%'` (no app code change).
> One warm automated Home→Sync→back pass **PASSED** with user10 preserved.
> Low-level gesture causality remains partially unisolated; human device QA
> optional for product confirmation.


## Retained-artifact correction (2026-10-20)

The original failed QA run used
`test_output/qa-warm-2026-10-19_163548/2026-10-19_163549/sync-once/`.
Its command metadata records the Home Sync tap at **2026-10-19T23:36:19.364+00:00**
(`timestamp: 1792452979364`, duration 3842 ms), followed by the 30-second
`sync-screen` assertion failure. This artifact packet is distinct from the
historical later native discriminator and automation-package PASS above.

The same failure hierarchy and screenshot establish overlapping targets:

| Original captured item | Bounds / point |
| --- | --- |
| Native tap aim | `(985,168)` |
| Home Sync button | `[933,116][1038,221]` |
| Tools native Compose ancestor | `[963,105][1080,242]` |
| Tools inner ancestor | `[969,111][1080,237]` |
| Smaller Tools gear icon | `[998,140][1066,208]` |

The tap lies inside both the Home Sync button and the Tools ancestor targets,
although it lies outside the smaller icon rectangle. The retained screenshot
visibly shows the gear over the Sync cloud. This is native-target overlap
evidence; accessibility `clickable=false` does not establish absence of an
intercepting control.

Installed Expo source explains why these bounds matter:

- `node_modules/expo-dev-menu/android/src/debug/java/expo/modules/devmenu/DevMenuFragment.kt:176`
  creates the overlay at `Float.MAX_VALUE` z-order; its floating control has its
  own `DevMenuAction.Open` callback.
- `node_modules/expo-dev-menu/android/src/debug/java/expo/modules/devmenu/fab/FloatingActionButtonContent.kt:86`
  defines a 52dp control target with a separate 26dp gear icon. The small icon's
  accessibility bounds are not the complete touch target.

Artifact SHA256 values (paths relative to the original run directory):

| File | SHA256 |
| --- | --- |
| `commands.json` | `ca380dfb83d627af8f0cd0b7c62642870259baad0174b6b61f40d2a0f991f21c` |
| `screen-hierarchy/step-007-assertCondition-sync-screen.json` | `4fd033a46c95ea76e70381832ef24ce81a91880f9979dd8e2bb1b85ffb242400` |
| `screenshots/step-007-assertCondition-sync-screen.png` | `cda506fbcf3845a75519a6fde581afc9067b771563fc064f6b3024982622b2f8` |

Current limits: the original JS handler invocation and exact press recipient
remain unproven. Moving the debug Tools control clear of the header provides a
materially changed navigation precondition; it does not by itself prove a
product fix. A subsequent check stopped in Settings before any Sync press, so
that check adds no navigation verdict. The first actual Home press with the relocated control subsequently opened
Sync, as recorded below. No original JS dispatch or final causal claim is
inferred, and the issue remains open pending review.


### First actual Home press after overlay relocation (2026-10-20)

Root's receipt `/tmp/fluent-sync721-actual-press.json` started at
`2026-10-20T14:48:09.511671+00:00` and finished at
`2026-10-20T14:48:55.237617+00:00`. After the earlier Settings precondition stop
and safe Home recovery, the first actual feature observation recorded:

| Check | Result |
| --- | --- |
| Home precondition | `home-tab-my-work` visible, assertion COMPLETED |
| Single Sync press | Plain `tapOn` with `id: home-sync-button`, COMPLETED; `retryIfNoChange: false`; no point override or repeat |
| Tap timestamp | `2026-10-20T14:48:19.302+00:00` |
| Destination | `sync-screen` visible, assertion COMPLETED |
| Sync content | `sync-upload-cellular-switch` visible, assertion COMPLETED; switch not tapped |
| Flow execution | **FAIL**, exit 1, **13.792s**; only failed command was `takeScreenshot` with an absolute `/tmp` path rejected outside the configured screenshot output folder |
| Feature assertions | **No feature assertion failed**; one press opened Sync in this observation |
| Separate Home cleanup | **PASS**, **31.299s**, exit 0 |
| Preserved state | Active12, cached10/9/12, app PID7152 unchanged |

The flow-level failure is retained as a screenshot-path harness failure; it is
not a navigation failure or a passing complete flow. No rerun was made merely
to package a green result. No Sync Now, upload, recording, preference, auth or
reset action was performed.

The successful plain one-press observation after relocating Tools, combined
with the original overlapping native target, strongly supports native debug
overlay obstruction as the explanation for the original occurrence. It does
not prove which callback received that original press, and the current check
used active12 while the original occurrence used active10. No product-code fix
or release/nightly QA claim follows. Keep #721 open for review.

Current evidence hashes:

| File | SHA256 |
| --- | --- |
| `/tmp/fluent-sync721-actual-press.json` | `e9a0d5ccd254bb9b9eba08e1e91e667e4d3917dd722d397b934fd55f2b390359` |
| Current `commands.json` | `98213f60de58e02dc7324d62ac4c87d491fef9e34aa124aa13eeadded2362857` |

Exact current commands artifact:
`/tmp/maestro-efficient-sync721_first_actual_press_after_home_proof/2026-10-20_074811/fluent-sync721-relocated-once/commands.json`.
