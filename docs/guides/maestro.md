# Maestro (Android E2E)

Opt-in **Android-only** Maestro suite for Fluent Mobile. Architecture: state-tolerant flows under `.maestro/flows/<area>/`, shared product steps in `.maestro/shared/`, device harness helpers in `.maestro/helpers/`.

**Not** a required PR merge gate. Hosted runs: EAS Workflow [`.eas/workflows/maestro-android.yml`](../../.eas/workflows/maestro-android.yml) (`schedule` against a matching APK when possible, paths-filtered PR harness, `workflow_dispatch`). Needs QA? / `@Roslin22` nightly handoff is unchanged — see [qa-process.md](qa-process.md). Agent emulator debug receipts are **not** human Nightly QA acceptance.

## QA vs Dev (read this first)

| Lane | Entrypoint | Env file | API base |
| --- | --- | --- | --- |
| **QA** (acceptance / QA API) | `bash scripts/maestro-test-qa.sh …` | `.env.maestro.qa` (from `.env.maestro.qa.example`) | Pinned `https://qa.api.fluent.bible` |
| **Dev / local eng** | `npm run maestro:test*` → `scripts/maestro-test.sh` | `.env.maestro` (from `.env.maestro.example`) | Usually hosted Dev or local Docker |

**Lead with the QA entrypoint** when the goal is QA-backend work. There is **no** `npm run maestro:test:qa` alias today — call `bash scripts/maestro-test-qa.sh …` (args after the script are Maestro args).

> **Session risk (read before any command):** `--include-tags smoke` is **not** session-preserving and is **not** “read-only.” Smoke includes `auth/login-happy-path` and `auth/session-restore`, which call `ensure-on-login` (`clearState: true` via `launch-android.yaml`) and/or `login-translator` — they **reset or replace** a manual signed-in session. `maestro:test:harness`, `logout`, and domain flows that use `ensure-warm-home` → `ensure-warm-session` can also Discard recovery and/or log in. Run broad smoke / auth / harness **only** on a **fresh or disposable** test session — never against a human session you must keep (e.g. user10).

**Secrets + env file (QA):**

```bash
cp .env.maestro.qa.example .env.maestro.qa   # emails only; leave *_PASSWORD blank
# inject passwords via secure user entry / CI secrets — never commit them
```

**Disposable / fresh QA session** (OK to wipe login) — example only; pick named flows you intend to burn:

```bash
# WIPES / re-logins: smoke tag pulls auth flows — disposable session only
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  --include-tags smoke .maestro
```

**Preserved manual session** (narrow path — documented helpers / YAML shape only; no suite alias):

1. Do **not** pass `--include-tags smoke`, `auth`, harness `launch.yaml`, or any flow that runs `ensure-on-login`, `login-translator`, `ensure-warm-session`, or `ensure-warm-home`.
2. Optional relaunch without wipe: [`.maestro/helpers/launch-android-warm.yaml`](../../.maestro/helpers/launch-android-warm.yaml) (`clearState: false` + Metro deep-link) — then stop; do **not** chain warm-session.
3. Prefer a **single named flow file** you control. Minimal shape (illustrative — assert signed-in, no login, no clear):

```yaml
# Preserved-session probe: no clearState, no login-*, no ensure-warm-session/home
appId: com.eten.fluent
---
- assertNotVisible:
    id: 'login-email-input'
- assertVisible:
    id: 'home-tab-my-work'
# …only taps that cannot navigate to login / Add User / sign-out
```

Point the QA entrypoint at that one file (not `.maestro` + smoke). If `login-email-input` appears, **abort** — do not run login helpers to “fix” it while preserving the human session.

Default `npm run maestro:test`, `maestro:test:harness`, `maestro:test:smokes`, area slices, and `maestro:test:stage1` load **Dev** `.env.maestro` unless you already went through the QA script. Treating those npm scripts as “QA acceptance” or as safe for a kept manual session is unsafe.

**Runner guard vs runtime proof:** `scripts/maestro-env-guard.cjs` (invoked by the QA entrypoint) fail-closes on lane, `.env.maestro.qa` basename, file `EXPO_PUBLIC_API_BASE_URL`, and Maestro `-e`/`--env` overrides **before** adb/Maestro. That proves the **runner env pin**, not that Metro / an installed APK was built with the QA URL. Preview/nightly EAS profiles bake QA; the hosted Maestro `e2e-test` profile in `eas.json` bakes **Dev** (`https://dev.api.fluent.bible`).

### Warm helpers (detail)

`ensure-warm-home` → `launch-android-warm` then `ensure-warm-session`. **`ensure-warm-session` can tap Discard on “Recovered recording” and run `login-translator` if the login screen is visible.** Cold harness / `ensure-on-login` use `clearState: true` and wipe local auth. See preserved-session path above.

## Playbook — eng vs QA

| Audience | Use Maestro for | Still do manually |
| --- | --- | --- |
| **Engineering (Dev)** | Local Debug + Metro (`maestro:android:up`, `npm run maestro:test*`) while building against Dev/local; optional EAS dispatch | Exploratory UX, hardware mics/cameras, store builds |
| **QA acceptance** | Prefer **nightly APK** + [qa-process.md](qa-process.md). If running Maestro against QA API: **only** `bash scripts/maestro-test-qa.sh …` | **Nightly APK** checklist residue — Maestro does **not** replace `@Roslin22` handoff |

### Journey → flow map

| Human / QA journey | Maestro flow | Command / tag |
| --- | --- | --- |
| Cold launch → login | `flows/harness/launch.yaml` | `npm run maestro:test:harness` |
| Login happy path | `flows/auth/login-happy-path.yaml` | `auth` / `smoke` |
| Session restore | `flows/auth/session-restore.yaml` | `auth` / `smoke` |
| Logout | `flows/auth/logout.yaml` | `auth` / `smoke` |
| Tab switching | `flows/navigation/tab-switching.yaml` | `nav` / `smoke` |
| My Work → drafting | `flows/navigation/my-work-to-drafting.yaml` | `nav` / `smoke` |
| Projects → drafting | `flows/navigation/projects-to-drafting.yaml` | `nav` / `smoke` |
| Empty assignments (Account B) | `flows/navigation/empty-assignments.yaml` | `npm run maestro:test:empty-assignments` |
| Drafting tabs / Bible→Record / Resources | `flows/drafting/*` | `drafting` / `smoke` |
| Record → stop → play → delete | `flows/recording/record-stop-play-delete.yaml` | `record` / `mutating` |
| Recording nav guard | `flows/recording/recording-nav-guard.yaml` | `edges` / `record` |
| Record then upload | `flows/sync/record-to-synced.yaml` | `sync` / `record` / `mutating` |
| Sync Now / prepare-offline / settings | `flows/sync/*` | `sync` / `smoke` |
| Validation / wrong creds / forgot / legal | `flows/edges/*` | `edges` / `smoke` |
| Mic denied | `flows/edges/mic-denied.yaml` | `permissions` (excluded from default) |
| Offline login | `flows/offline/login-offline.yaml` | `npm run maestro:test:offline-login` |
| Multi-account A–D | `flows/accounts/multi-account-isolation.yaml` | `npm run maestro:test:multi-account` |
| Ownership / taken-warning / auto-claim | `flows/ownership/*` | `npm run maestro:fixtures:seed` then `npm run maestro:test:ownership` |
| Stage 1 batch (once) | harness + auth + my-work + empty-assignments | `npm run maestro:test:stage1` |


### Nightly QA checklist → automation map

| Nightly checklist area | Automated by | Residual (manual) |
| --- | --- | --- |
| Cold launch / login chrome | `harness/launch`, `auth/login-happy-path` | Boot splash polish |
| Session restore | `auth/session-restore` | — |
| My Work / Projects → drafting | `navigation/*`, `drafting/tabs` | Visual polish |
| Empty My Work (no assignments) | `navigation/empty-assignments` | — |
| Record happy path | `recording/record-stop-play-delete` | Mic fidelity, Bluetooth |
| Sync Now settles | `sync/sync-now` (Maestro) | Human single-press open of Sync screen: open bug [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721) (not a Nightly pass) |
| Record → upload | `sync/record-to-synced` | Foreground-service notification |
| Prepare for Offline chrome | `sync/prepare-offline-entry` | Full download completion on slow networks |
| Settings persistence | `sync/settings-persistence` | — |
| Multi-account A–D | `accounts/multi-account-isolation` | A3 three-account cap; E sign-out-with-other-remaining |
| Forgot password / legal | `edges/forgot-password`, `edges/legal-pages` | — |
| Login validation | `edges/login-validation`, `edges/wrong-credentials` | — |
| Mic permission deny | `edges/mic-denied` | OEM permission variants |
| Offline login | `offline/login-offline` (+ adb helper) | Flaky airplane-mode OEMs |
| Ownership / taken-warning / auto-claim | `ownership/*` (+ API fixtures) | Conflict / open Peer Check until status seeds exist |
| Forced reauth mid-session | — (blocked) | Needs backend token-revoke / E2E hook |
| Production / Play Store | — | Never set `EXPO_PUBLIC_E2E_MODE` on production |

## Layout

```
.maestro/
  config.yaml          # discovers flows/**; excludes helpers/** and shared/**
  helpers/             # launch, boot-past-dev-launcher, connect-metro, dismiss-dev-menu
  shared/
    auth/              # login-as, login-translator, login-account-b, logout
    nav/               # goto-home/sync/settings, open-any-chapter, sync-now-and-return
    ensure/            # ensure-warm-home/session, ensure-on-login, ensure-signed-in, ensure-home-settled, …
  flows/
    harness|auth|navigation|drafting|recording|sync|offline|accounts|edges|ownership/
```

**Rules:** one flow = one user-visible outcome; setup via `shared/`; `testID` selectors only (Alert button text allowed); `extendedWaitUntil` on signals (no bare sleeps); `when:` only for tolerated variance (Prepare-Offline auto-push, dev launcher). Domain flows use `ensure-warm-home` (no `clearState`) — see warm warning above for manual sessions. Auth, signed-out, and mic-deny flows still clear state. A missing fixture or device is BLOCKED, not a pass. Do not run the suite when no Android device is online.

## Warm entry and fixtures (#717)

`ensure-warm-home` relaunches without wiping data, then `ensure-warm-session` may discard a Recovered recording alert and log in if the login screen is showing. Flows tagged `mutating` (`record-stop-play-delete`, `record-to-synced`, `recording-nav-guard`) open `open-my-work-chapter` and are excluded from default `maestro:test:smokes` via `--exclude-tags …,mutating`. The `smoke` tag itself is **not** a session-safe or read-only lane — it still includes auth clearState/login flows (see QA vs Dev). Fixture preflight (`scripts/maestro-fixture-guard.cjs`) runs after env load and before adb. A selected mutating flow exits 2 BLOCKED unless `MAESTRO_FIXTURE_CHAPTER_ID` is set and `assertProjectAllowed` accepts `MAESTRO_FIXTURE_PROJECT_ID` against the allowlist and denylist. Invocations that only include `smoke` / `auth` still do not select `mutating` flows, but they **can** wipe or re-login.

Env selection: **QA** → `bash scripts/maestro-test-qa.sh` + `.env.maestro.qa`; **Dev** → `scripts/maestro-test.sh` + `.env.maestro`. `MAESTRO_KEEP_EXPORTS=1` keeps already-exported non-base values; under QA the runner still pins `EXPO_PUBLIC_API_BASE_URL` from the QA file/guard.

`scripts/maestro-verify-receipt.mjs` is read-only `GET /verse-audio/{projectUnitId}/{bibleTextId}`. It is not part of a flow run. Do not point it at a demo project.

Conflict and open-peer flows stay out of hosted ownership until fluent-api seed support lands (draft #368, confirm-gated reset #369, docs #370). PM assignment PATCH cannot set an arbitrary status, and clearing an assignee does not restore `not_started`. fluent-api claim-conflict / audio-range work is tracked upstream; this repo does not add a second seed API.

Source-audio and multi-recorder flows are not in `smoke` until those fixtures exist. `sync-now` requires a pending Sync Now control and is not in `smoke`.

**Proof status (do not conflate):** agent emulator / Debug+Metro receipts exist for some #717 flows; they are **not** human Nightly QA on the nightly APK. Below-UI follow-ups: real SQLite migrations (#718), non-silent remux audio (#719), physical-device checklist (#720). Sync screen single-press open on QA: [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721).

## Hosted CI (EAS Workflows)

[`.eas/workflows/maestro-android.yml`](../../.eas/workflows/maestro-android.yml):

| Trigger | What runs |
| --- | --- |
| `schedule` (`30 23 * * *` GMT) / `suite=nightly` | `fingerprint` → `get-build` (nightly / QA-baked APK when available) → named `e2e-test` fallback → `smoke` with `retries: 0`. Fallback `e2e-test` profile bakes **Dev** API — not QA acceptance. Commit/hash mismatch rules BLOCKED per workflow. Slack `after_maestro_tests` |
| `pull_request` (paths-filtered) | `e2e-test` (Dev-baked) APK + harness only |
| `workflow_dispatch` `harness` / `smokes` / `multi-account` / `ownership` | `e2e-test` APK + selected suite |

Maestro CLI pin **2.10.0** (`scripts/maestro-install.sh`, workflow `maestro_version`), `output_format: junit` (required for [EAS Insights Maestro](https://docs.expo.dev/eas-insights/maestro/)). Secrets: `MAESTRO_*` as **Secret** visibility on EAS **preview**. Optional `SLACK_WEBHOOK_URL` for summaries.

```bash
npm run maestro:eas -- -F suite=harness
npm run maestro:eas -- -F suite=smokes
npm run maestro:eas -- -F suite=ownership
npm run maestro:eas -- -F suite=nightly
```

## Prerequisites

- JDK **17+**, Android SDK `platform-tools`, emulator/device
- **Local:** Debug / expo-dev-client + Metro — not Expo Go
- Maestro CLI **2.10.0** (`npm run maestro:install` upgrades if an older pin is present)
- Account A (translator shape): `MAESTRO_EMAIL` / `MAESTRO_PASSWORD` — ≥1 chapter assignment, under 5-take cap
- Account B (member-without-assignments): `MAESTRO_EMAIL_2` / `MAESTRO_PASSWORD_2` — project membership, no assignee rows
- Optional aliases: `MAESTRO_TRANSLATOR_*`, `MAESTRO_PM_*` (resolved onto EMAIL(_2))
- Ownership fixtures (#574): `MAESTRO_PM_*` must be a **Project Manager** on the disposable fixture project; plus `MAESTRO_FIXTURE_*` labels (see below)

```bash
npm run maestro:install
npm run maestro:doctor
# Dev / local eng:
cp .env.maestro.example .env.maestro   # never commit; prefer secure secret injection for passwords
# QA API lane (acceptance tooling — not a substitute for Nightly human QA):
cp .env.maestro.qa.example .env.maestro.qa   # blank *_PASSWORD; bash scripts/maestro-test-qa.sh …
```

### Ownership / claim disposable fixtures (#574)

Do **not** mutate shared demo or production QA projects. Use a dedicated disposable project the PM owns, on the **same API base** as the runner (Dev seed scripts are Dev-only; QA needs QA credentials + allowlisted fixture ids in `.env.maestro.qa`).

**API seed/reset (Dev engineering — proven against Dev):**

```bash
# .env.maestro needs MAESTRO_PM_* + MAESTRO_EMAIL + fixture labels
npm run maestro:fixtures:seed    # requires --yes / MAESTRO_FIXTURE_CONFIRM=1 (npm script passes --yes)
npm run maestro:fixtures:verify
npm run maestro:test:ownership   # Dev .env.maestro path unless invoked via maestro-test-qa.sh
```

| Role | Example label | Seed behavior |
| --- | --- | --- |
| mine | `Mark 1` | `drafterId` = Maestro translator, `peerCheckerId` = other translator |
| other | `Mark 9` | `drafterId` = other translator |
| unassigned | `Mark 4` | No assignee (ownership icon absent; Record has no taken warning) |
| claim | `Mark 7` | Must stay **`not_started` + unassigned** for `POST /claim` / auto-claim. Local `maestro:test:ownership` may rotate to the next pristine chapter (`MAESTRO_FIXTURE_ALLOW_CLAIM_ROTATE=1`). EAS fails closed — update the preview `MAESTRO_FIXTURE_CLAIM_LABEL` secret when burned. |

**Safety:** `seed` refuses to run without `--yes` / `MAESTRO_FIXTURE_CONFIRM=1`, and refuses a `MAESTRO_FIXTURE_PROJECT_ID` that is not on the PM's project list (or that disagrees with `MAESTRO_FIXTURE_PROJECT_NAME` when both are set). Point env only at a dedicated disposable fixture project.

Endpoint used by seed (discovered from Fluent web Assign → Save):

`PATCH /projects/:projectId/chapter-assignments/assign-selected`  
`{ "assignments": [{ "chapterAssignmentId", "drafterId", "peerCheckerId" }] }`  
Null `drafterId` / `peerCheckerId` clears assignees. Clearing a claimed chapter leaves status `draft` (claim pool is one-shot per chapter). After auto-claim, burned chapters stay assigned/`draft` — rotate `MAESTRO_FIXTURE_CLAIM_LABEL` or reset Status in Fluent web; the suite does not restore `not_started`.

Manifest: [`.maestro/fixtures/ownership-claim.manifest.json`](../../.maestro/fixtures/ownership-claim.manifest.json).

**Browser fallback:** only if assign-selected is unavailable — use Fluent web with Maestro env logins. Conflict / open Peer Check roles still need status seeds the assignment API cannot set.

## Debug APK + Metro + reverse

```bash
npm run maestro:android:up
npm run maestro:metro        # EXPO_PUBLIC_E2E_MODE=1
npm run android              # separate terminal if needed
```

Without Metro + `adb reverse`, Debug APKs cannot load JS. Flows **deep-link** via
`exp+fluent-mobile://expo-development-client/?url=http://10.0.2.2:8081…`
([`open-metro-deeplink.yaml`](../../.maestro/helpers/open-metro-deeplink.yaml)) so the Dev Client
launcher UI is skipped. Residual cleanup: [`boot-past-dev-launcher.yaml`](../../.maestro/helpers/boot-past-dev-launcher.yaml).

**Do not** start Metro with `--localhost` / `--host localhost`. That binds IPv6
`::1` only; the emulator's `10.0.2.2` then gets connection refused. Use
`npm run maestro:metro` (listens on all interfaces / `*:8081`).

### Embedded APK (no Metro) — matches EAS

```bash
MAESTRO_E2E_APK=/path/to/e2e.apk npm run maestro:android:e2e-up
# or: npm run maestro:android:e2e-up -- --eas
MAESTRO_LAUNCH_MODE=embedded npm run maestro:test:harness
# shorthand: npm run maestro:test:harness:embedded
```

Set `MAESTRO_LAUNCH_MODE=embedded` in `.env.maestro` to make it the local default.

**Secret hygiene:** `scripts/maestro-test.sh` always passes `--test-output-dir` and scrubs `MAESTRO_*` values from `maestro.log` / `commands.json` via `scripts/maestro-scrub-artifacts.sh`. `test_output/` and `.maestro/test_output/` are gitignored.

**Offline login:** `scripts/maestro-adb-network.sh` toggles airplane mode around `npm run maestro:test:offline-login`.

## Entrypoints and npm scripts

| Command | Lane | Purpose |
| --- | --- | --- |
| `bash scripts/maestro-test-qa.sh …` | **QA** | Only supported QA-lane wrapper (sets `MAESTRO_ENV_LANE=qa` + `.env.maestro.qa`, runs guard pin) |
| `npm run maestro:install` / `maestro:doctor` | either | CLI pin **2.10.0** + health |
| `npm run maestro:metro` / `maestro:android:up` | Dev eng | Local Debug + Metro deep-link loop |
| `npm run maestro:android:e2e-up` | eng | Install embedded e2e/nightly APK (no Metro); check which profile/URL the APK baked |
| `npm run maestro:test` | **Dev** default | Workspace via `maestro-test.sh` + `.env.maestro` (excludes accounts / offline / permissions / ownership) |
| `npm run maestro:test:harness` | **Dev** default | Cold launch (`clearState`) — **wipes** session |
| `npm run maestro:test:harness:embedded` / `:smokes:embedded` | eng | Same with `MAESTRO_LAUNCH_MODE=embedded` |
| `npm run maestro:test:smokes` | **Dev** default | All `smoke` tags (excludes offline, permissions, ownership, mutating) |
| `npm run maestro:test:auth` / `:nav` / `:drafting` / `:record` / `:sync` / `:edges` | **Dev** default | Area slices |
| `npm run maestro:test:empty-assignments` / `:pm` | **Dev** default | Account B empty My Work |
| `npm run maestro:test:multi-account` | **Dev** default | Isolation A–D |
| `npm run maestro:test:ownership` | **Dev** default | Ownership / taken-warning / auto-claim (#574) |
| `npm run maestro:fixtures:seed` / `:verify` / `:reset` | Dev eng | Disposable assignment fixtures (#574) |
| `npm run maestro:test:offline-login` | **Dev** default | Airplane-mode login error |
| `npm run maestro:test:stage1` | follows `MAESTRO_ENV_LANE` | Stage 1 batch; under QA lane forwards args into the QA assert |
| `npm run maestro:eas` | hosted | Dispatch EAS workflow (often `e2e-test` = Dev-baked APK) |

## Selector contract (additions)

| Surface | testID |
| --- | --- |
| Bible verses | `bible-verse-row-{n}` |
| Take rows | `record-take-row-{id}`, `record-play-button-{id}`, `record-delete-*-{id}` |
| Headers | `drafting-header-back`, `stack-header-back`, `stack-header-sync-button` |
| Home loading | `home-loading` |
| My Work empty | `my-work-empty` |
| View project error | `view-project-retry` |
| Sync cellular | `sync-upload-cellular` (+ `-switch`) |
| Ownership | `chapter-ownership-mine`, `chapter-ownership-other` (a11y: `Assigned to you` / `Assigned to another translator`) |
| Conflict | `chapter-conflict-indicator`, `record-conflict-warning`, `record-taken-warning` |

## Known flakes / residuals

- First Home after `clearState`: wait up to 180s for `home-tab-my-work`.
- Post-login Prepare-for-Offline auto-push: settle via `ensure-signed-in` / `ensure-home-settled` (dismiss PFO, then assert Home) — do not wait for `home-tab-my-work` alone before dismiss.
- Reauth forced path: blocked without backend token-revoke — residual manual.
- Three-account cap / sign-out-with-other-remaining: residual manual ([qa-multi-account-nightly.md](qa-multi-account-nightly.md)).
- Record at 5-take cap: fail-fast via `ensure-take-capacity`.
- Ownership claim pool: after auto-claim, clearing assignees leaves `draft`; rotate `MAESTRO_FIXTURE_CLAIM_LABEL` to another pristine `not_started` chapter and re-seed.

## Out of scope

Auth bypass, iOS, merge-gating Maestro as a required check, replacing Needs QA? nightly handoff.
