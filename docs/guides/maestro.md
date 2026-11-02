# Maestro (Android E2E)

Opt-in **Android-only** Maestro suite for Fluent Mobile. Architecture: state-tolerant flows under `.maestro/flows/<area>/`, shared product steps in `.maestro/shared/`, device harness helpers in `.maestro/helpers/`.

**Not** a required PR merge gate. Hosted runs: EAS Workflow [`.eas/workflows/maestro-android.yml`](../../.eas/workflows/maestro-android.yml) (`schedule` nightly against the **nightly** APK when possible, paths-filtered PR harness, `workflow_dispatch`). Needs QA? / `@Roslin22` nightly handoff is unchanged — see [qa-process.md](qa-process.md). Local or agent emulator Maestro runs are **not** human Nightly QA acceptance.

## QA vs Dev lanes (read this first)

| Lane | Entrypoint | Env file | API base |
| --- | --- | --- | --- |
| **QA** (QA API) | `bash scripts/maestro-test-qa.sh …` | `.env.maestro.qa` (from `.env.maestro.qa.example`) | Pinned `https://qa.api.fluent.bible` |
| **Dev / local eng** | `npm run maestro:test*` → `scripts/maestro-test.sh` | `.env.maestro` (from `.env.maestro.example`) | Usually hosted Dev or local Docker |

There is **no** `npm run maestro:test:qa` alias — call `bash scripts/maestro-test-qa.sh …` (arguments after the script are Maestro arguments). Every `npm run maestro:test*` script loads **Dev** `.env.maestro`; only `maestro:test:stage1` follows `MAESTRO_ENV_LANE=qa` (it then runs through the QA entrypoint).

```bash
cp .env.maestro.qa.example .env.maestro.qa   # emails only; leave *_PASSWORD blank
# inject passwords via secure user entry / CI secrets — never commit them
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml .maestro/flows/harness/launch.yaml
```

**Runner guard vs runtime proof:** `scripts/maestro-env-guard.cjs` (invoked by the QA entrypoint) fails closed on the lane, the `.env.maestro.qa` basename, the file's `EXPO_PUBLIC_API_BASE_URL`, and Maestro `-e` / `--env` overrides of that key — all **before** adb or Maestro. That proves the **runner env pin**, not that Metro or an installed APK was built with the QA URL. The `preview` / `nightly` EAS profiles bake QA; the `e2e-test` profile in `eas.json` bakes **Dev** (`https://dev.api.fluent.bible`).

> **Session risk:** `--include-tags smoke` is **not** session-preserving or read-only. Smoke includes `auth/login-happy-path` and `auth/session-restore`, which go through `ensure-on-login` / `launch-android.yaml` (`clearState: true`) and log in again. `maestro:test:harness` also clears state. Run broad smoke / auth / harness only on a fresh or disposable test session, never on a signed-in session you need to keep.

## Playbook — eng vs QA

| Audience | Use Maestro for | Still do manually |
| --- | --- | --- |
| **Engineering (Dev)** | Local Debug + Metro (`maestro:android:up`, `npm run maestro:test*`) while building against Dev/local; optional EAS dispatch (`npm run maestro:eas`) | Exploratory UX, hardware mics/cameras, store builds |
| **QA** | Optional: same flows when debugging a Maestro failure; EAS Insights Maestro tab for flake. Against the QA API, **only** via `bash scripts/maestro-test-qa.sh …` | **Nightly APK** checklist residue below — Maestro does **not** replace `@Roslin22` handoff |

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
| Record → stop → play → delete | `flows/recording/record-stop-play-delete.yaml` | `record` / `smoke` |
| Recording nav guard | `flows/recording/recording-nav-guard.yaml` | `edges` / `record` |
| Sync Now / prepare-offline / settings | `flows/sync/*` | `sync` / `smoke` |
| Validation / wrong creds / forgot / legal | `flows/edges/*` | `edges` / `smoke` |
| Mic denied | `flows/edges/mic-denied.yaml` | `permissions` (excluded from default) |
| Offline login | `flows/offline/login-offline.yaml` | `npm run maestro:test:offline-login` |
| Multi-account A–D | `flows/accounts/multi-account-isolation.yaml` | `npm run maestro:test:multi-account` |
| Ownership / taken-warning / auto-claim | `flows/ownership/*` | `npm run maestro:fixtures:seed` then `npm run maestro:test:ownership` |
| Stage 1 batch (± repeats) | harness + auth + my-work + empty-assignments | `npm run maestro:test:stage1` / `… 5` |


### Nightly QA checklist → automation map

| Nightly checklist area | Automated by | Residual (manual) |
| --- | --- | --- |
| Cold launch / login chrome | `harness/launch`, `auth/login-happy-path` | Boot splash polish |
| Session restore | `auth/session-restore` | — |
| My Work / Projects → drafting | `navigation/*`, `drafting/tabs` | Visual polish |
| Empty My Work (no assignments) | `navigation/empty-assignments` | — |
| Record happy path | `recording/record-stop-play-delete` | Mic fidelity, Bluetooth |
| Sync Now settles | `sync/sync-now` | — |
| Record → upload | `sync/record-to-synced` | Foreground-service notification |
| Prepare for Offline chrome | `sync/prepare-offline-entry` | Full download completion on slow networks |
| Settings persistence | `sync/settings-persistence` | — |
| Multi-account A–D | `accounts/multi-account-isolation` | A3 three-account cap; E sign-out-with-other-remaining |
| Forgot password / legal | `edges/forgot-password`, `edges/legal-pages` | — |
| Login validation | `edges/login-validation`, `edges/wrong-credentials` | — |
| Mic permission deny | `edges/mic-denied` | OEM permission variants |
| Offline login | `offline/login-offline` (+ adb helper) | Flaky airplane-mode OEMs |
| Ownership / taken-warning / auto-claim | `ownership/*` (+ API fixtures, including conflict + open Peer Check) | Claim reset depends on fluent-api #464 (`reset-selected`); local suite rotates if that route 404s |
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
    ensure/            # ensure-on-login, ensure-signed-in, ensure-home-settled, ensure-at-home, ensure-no-modal, ensure-take-capacity
  flows/
    harness|auth|navigation|drafting|recording|sync|offline|accounts|edges|ownership/
```

**Rules:** one flow = one user-visible outcome; setup via `shared/`; `testID` selectors only (Alert button text allowed); `extendedWaitUntil` on signals (no bare sleeps); `when:` only for tolerated variance (Prepare-Offline auto-push, dev launcher, optional upload controls). A missing fixture or device is BLOCKED, not a pass.

## Fixture preflight

`scripts/maestro-test.sh` runs `scripts/maestro-fixture-guard.cjs --preflight` after env load and **before** `adb` / device selection. It reads the flows selected by the positional paths and `--include-tags` / `--exclude-tags`, and exits 2 (BLOCKED) when a selected flow:

- is tagged `mutating` but does not open the pinned fixture chapter helper, or
- is tagged `mutating` and `MAESTRO_FIXTURE_PROJECT_ID` is not on `MAESTRO_FIXTURE_PROJECT_ALLOWLIST` (or is on `MAESTRO_FIXTURE_PROJECT_DENYLIST` — denylist wins), or
- opens the fixture chapter helper while `MAESTRO_FIXTURE_CHAPTER_ID` (and, for the milestone helper, `MAESTRO_FIXTURE_MILESTONE_ID`) is empty, or
- is tagged `pfo-download` without a matching admission manifest (see [`maestro-fixture-guard.PROVENANCE.md`](../../scripts/maestro-fixture-guard.PROVENANCE.md)).

`maestro:test:smokes` excludes `mutating` and `fixture-blocked`; every area slice excludes `fixture-blocked`. Tag a flow `fixture-blocked` when it cannot run until a fixture exists. An unfiltered `.maestro` run selects every mutating flow and therefore needs the fixture env.

`MAESTRO_KEEP_EXPORTS=1` keeps already-exported values instead of overwriting them from the env file (for parallel workers that export their own account). Under the QA lane, `EXPO_PUBLIC_API_BASE_URL` still comes from `.env.maestro.qa` and the guard pin.

**Ordered journeys:** `--flow-list PATH` runs an explicit ordered list as one Maestro invocation, with recursive preflight over every nested `runFlow` — see [maestro-ordered-journeys.md](maestro-ordered-journeys.md).

**Upload receipt:** `scripts/maestro-verify-receipt.mjs` is a read-only `GET /verse-audio/{projectUnitId}/{bibleTextId}` check that a take reached the server. It refuses non-allowlisted / denylisted projects before any request and is not part of a flow run. Do not point it at a demo project.

## Hosted CI (EAS Workflows)

[`.eas/workflows/maestro-android.yml`](../../.eas/workflows/maestro-android.yml):

| Trigger | What runs |
| --- | --- |
| `schedule` (`30 23 * * *` GMT) / `suite=nightly` | `fingerprint` → `get-build` (nightly profile, QA-baked) → fallback `e2e-test` build (Dev-baked) → `smoke` suite excluding `offline,permissions,mutating,fixture-blocked`, `retries: 1`, `record_screen: true`, Slack `after_maestro_tests` |
| `pull_request` (paths-filtered) | `e2e-test` (Dev-baked) APK + harness only |
| `workflow_dispatch` `harness` / `smokes` / `multi-account` / `ownership` | `e2e-test` APK + selected suite |

Maestro **2.10.0**, `output_format: junit` (required for [EAS Insights Maestro](https://docs.expo.dev/eas-insights/maestro/)). Secrets: `MAESTRO_*` as **Secret** visibility on EAS **preview**. Optional `SLACK_WEBHOOK_URL` for summaries. `scripts/maestro-eas-slack-summary.sh` runs in `after_maestro_tests` for `maestro_nightly`, `maestro_smokes`, `maestro_multi_account` and `maestro_ownership`, and fails the job when the Maestro output dir is missing or contains no JUnit XML, even when `SLACK_WEBHOOK_URL` is unset. Each of those jobs selects at least one flow, so a run with no JUnit means Maestro did not report. Skipped jobs (`if:` false) do not run hooks, and the PR harness job has no Slack step.

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
- Ownership fixtures (#574 / #607): `MAESTRO_PM_*` must be a **Project Manager** on the disposable fixture project; `MAESTRO_EMAIL_2` must be a second **Project Translator** (do not alias it to the PM); plus `MAESTRO_FIXTURE_*` labels including conflict + open Peer Check (see below)

```bash
npm run maestro:install
npm run maestro:doctor
cp .env.maestro.example .env.maestro         # Dev / local eng; never commit
cp .env.maestro.qa.example .env.maestro.qa   # QA lane; blank *_PASSWORD; bash scripts/maestro-test-qa.sh …
```

### Ownership / claim disposable fixtures (#574 / #607)

Do **not** mutate shared QA projects. Use a dedicated project the PM owns (example: `Source Audio QA - BSB` / id `432`) with at least two Project Translators. `MAESTRO_EMAIL_2` must be that second translator - not the PM.

**API seed/reset:**

```bash
# .env.maestro needs MAESTRO_PM_* + MAESTRO_EMAIL + MAESTRO_EMAIL_2 + fixture labels
npm run maestro:fixtures:seed    # requires --yes / MAESTRO_FIXTURE_CONFIRM=1 (npm script passes --yes)
npm run maestro:fixtures:verify
npm run maestro:test:ownership
```

| Role | Example label | Seed behavior |
| --- | --- | --- |
| mine | `Mark 1` | `drafterId` = Maestro translator, `peerCheckerId` = other translator |
| other | `Mark 9` | `drafterId` = other translator (`MAESTRO_EMAIL_2`) |
| unassigned | `Mark 4` | No assignee (ownership icon absent; Record has no taken warning) |
| claim | `Mark 7` | Must stay **`not_started` + unassigned** for `POST /claim` / auto-claim. Seed calls `PATCH .../reset-selected` (fluent-api #464). If that route 404s, local `maestro:test:ownership` rotates to the next pristine chapter (`MAESTRO_FIXTURE_ALLOW_CLAIM_ROTATE=1`). EAS fails closed - update the preview `MAESTRO_FIXTURE_CLAIM_LABEL` secret when burned. |
| conflict | `Mark 2` | Assign translator, then upload three verse-audio takes; the third reuses a stale `baseVersionToken`. Verify reads `hasConflict` from `GET .../chapter-assignments/progress`. |
| open Peer Check | `Mark 3` | Manager `assign-selected` with `MAESTRO_EMAIL_2` as drafter and `peerCheckerId` null; that translator `PATCH /chapter-assignments/:id/submit`. |

**Safety:** `seed` refuses to run without `--yes` / `MAESTRO_FIXTURE_CONFIRM=1`, and refuses a `MAESTRO_FIXTURE_PROJECT_ID` that is not on the PM's project list (or that disagrees with `MAESTRO_FIXTURE_PROJECT_NAME` when both are set). Point env only at a dedicated disposable fixture project.

Endpoints used by seed:

- `PATCH /projects/:projectId/chapter-assignments/assign-selected` - `{ "assignments": [{ "chapterAssignmentId", "drafterId", "peerCheckerId" }] }`. Null `drafterId` / `peerCheckerId` clears assignees.
- `PUT /verse-audio/:projectUnitId/:bibleTextId` - conflict seed (stale `baseVersionToken` on the third take).
- `PATCH /chapter-assignments/:id/submit` - open Peer Check (second translator).
- `PATCH /projects/:projectId/chapter-assignments/reset-selected` - `{ "chapterAssignmentIds": number[] }` (fluent-api #464). Restores selected chapters to `not_started` + unassigned. A 404 means the route is not deployed yet; seed logs that and keeps the claim-label rotate fallback.
- `GET /projects/:projectId/chapter-assignments/progress` - verify reads `hasConflict` here.

Manifest: [`.maestro/fixtures/ownership-claim.manifest.json`](../../.maestro/fixtures/ownership-claim.manifest.json).

**Browser fallback:** only if `assign-selected` itself is unavailable - use Fluent web with Maestro env logins. Conflict, open Peer Check, and claim restore are seeded through the API above.

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

**Secret hygiene:** `scripts/maestro-test.sh` always passes `--test-output-dir` and scrubs `MAESTRO_*` values from `maestro.log` / `commands.json` / JUnit XML via `scripts/maestro-scrub-artifacts.sh`. `test_output/` and `.maestro/test_output/` are gitignored.

**Offline login:** `scripts/maestro-adb-network.sh` toggles airplane mode around `npm run maestro:test:offline-login`.

## Entrypoints and npm scripts

| Command | Lane | Purpose |
| --- | --- | --- |
| `bash scripts/maestro-test-qa.sh …` | **QA** | Only QA-lane wrapper (sets `MAESTRO_ENV_LANE=qa` + `.env.maestro.qa`, runs the env guard pin) |
| `maestro:install` / `maestro:doctor` | either | CLI pin + health |
| `maestro:metro` / `maestro:android:up` | Dev | Local Debug + Metro deep-link loop |
| `maestro:android:e2e-up` | either | Install embedded e2e/nightly APK (no Metro); check which API the APK baked |
| `maestro:test` | Dev | Default workspace (excludes accounts / offline / permissions / ownership / fixture-blocked) |
| `maestro:test:harness` | Dev | Cold launch (metro deep-link; clears state) |
| `maestro:test:harness:embedded` / `:smokes:embedded` | Dev | Same with `MAESTRO_LAUNCH_MODE=embedded` |
| `maestro:test:smokes` | Dev | All `smoke` tags (excludes offline / permissions / ownership / mutating / fixture-blocked) |
| `maestro:test:auth` / `:nav` / `:drafting` / `:record` / `:sync` / `:edges` | Dev | Area slices (exclude fixture-blocked) |
| `maestro:test:empty-assignments` / `:pm` | Dev | Account B empty My Work |
| `maestro:test:multi-account` | Dev | Isolation A–D |
| `maestro:test:ownership` | Dev | Ownership / taken-warning / auto-claim / conflict / open Peer Check (#574 / #607) |
| `maestro:fixtures:seed` / `:verify` / `:reset` | Dev | Disposable assignment fixtures (#574 / #607) |
| `maestro:test:offline-login` | Dev | Airplane-mode login error |
| `maestro:test:stage1` | follows `MAESTRO_ENV_LANE` | Stage 1 batch, one Maestro invocation per pass (`5` = five consecutive passes) |
| `maestro:eas` | hosted | Dispatch EAS workflow |

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
- Ownership claim pool: seed prefers `PATCH .../reset-selected` (fluent-api #464) to restore the same claim chapter. If that route 404s, local runs rotate `MAESTRO_FIXTURE_CLAIM_LABEL` to the next pristine `not_started` chapter.

## Out of scope

Auth bypass, iOS, merge-gating Maestro as a required check, replacing Needs QA? nightly handoff.
