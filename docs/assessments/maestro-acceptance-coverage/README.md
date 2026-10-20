# Maestro acceptance coverage — existing-session packet

**Living implementation packet** · dated **2026-10-20** (UTC) · live repo only.

Operator / reviewer guide for the **15 new `*-existing-session` flows** authored in this wave (includes **resources-populated**, already written and `fixture-blocked`). This is **not** a freeze of historical PASS notes and **does not** replace older assessment folders.

| Sibling (frozen / prior — do not duplicate here) | Path |
| --- | --- |
| PFO entry→back | `docs/assessments/maestro-existing-session/README.md` |
| Sync entry (#721) | `docs/assessments/maestro-sync721/README.md` |
| Settings Privacy | `docs/assessments/maestro-settings-privacy-existing-session/README.md` |
| Settings Terms | `docs/assessments/maestro-settings-terms-existing-session/README.md` |

**Out of this packet’s 15:** `prepare-offline-entry-existing-session`, `settings-privacy-existing-session`, `settings-terms-existing-session` (documented above).

---

## Companion artifacts

| Artifact | Role | Status |
| --- | --- | --- |
| [`coverage.json`](./coverage.json) | Provisional local acceptance→flow mapping | **Local working evidence** — not a final denominator |
| [`BACKLOG.md`](./BACKLOG.md) | Provisional local candidate backlog | **Local working evidence** — not a final denominator |
| [`runtime-receipt.md`](./runtime-receipt.md) | **B** (sole device owner) runtime receipt — 16 live variants across twelve flow files, plus recorded failed attempts | **Written** — see receipt for scope; not a whole-app coverage claim |

The runtime receipt and its [durable JSON aggregate](runtime-evidence.json) preserve this milestone. Mapping/backlog files remain a separate provisional workstream.

---

## Coverage honesty (no false % )

Current bounded [evidence reconciliation](evidence-reconciliation.json): 204 raw rows / 202 canonical candidates under the inherited alias policy; 86 current atomic candidates, with 9 complete, 14 partial, and 63 absent live execution evidence. Whole-requirement status: 9 PASS, 70 BLOCKED, 7 UNTESTED. Excluded from additive counting: 90 compound/parent groups, 19 outside current scope, 7 unresolved. The alias wording caveat is retained in the ledger. These are mapped-candidate counts; whole-app scope and percentage remain unestablished.

- Raw / canonical candidate requirement counts from the acceptance map (**204 raw / 202 canonical** under the inherited alias policy) are **provisional** and **will change** under D-refinement. They are **not** a global atomic denominator.
- **Do not** report a whole-app or suite coverage percentage from this packet.
- Authoring + official `check-syntax` ≠ runtime PASS. Closed issues / shipped source ≠ current device PASS.
- This packet documents **15 flows**. It does **not** claim full acceptance coverage.

---

## Syntax vs runtime (official distinction)

| Kind | What it proves | What it does **not** prove |
| --- | --- | --- |
| **Official syntax** | `maestro check-syntax <flow.yaml>` and/or `require('js-yaml').loadAll` parse the YAML | Device behavior, fixture truth, QA API state |
| **Runtime** | A dated device execution under the QA entrypoint with linked receipt | Authoring completeness alone |

**Current runtime:** 16 live case variants across twelve distinct flows have a recorded PASS in [`runtime-receipt.md`](./runtime-receipt.md) (Home-tabs, Resources-empty, PFO viewport-fixed, cached-switch viewport-fixed, verse-boundary, ownership peer-checker mine, direct Bible-verse-to-Record, three-account cap/dismissal, Complete-stage idle lock, empty Resources tab order, and user10 drafting preference persistence). Navigation/tabs YAMLs remain migration/static-check only. **Do not infer PASS** from authoring freeze, parser OK, or this README.

---

## Canonical verdicts + execution state

Use these labels only; do not invent synonyms that inflate PASS.

| Verdict | Meaning |
| --- | --- |
| **PASS** | Runtime completed; all mandatory asserts held; receipt linked |
| **FAIL** | Runtime ran; assert or crash failed |
| **BLOCKED** | Cannot run meaningfully (missing approved fixture, env, device, or product gate) — not a soft PASS |
| **SKIPPED** | Explicitly not run this batch (out of batch / deferred) — not PASS |

| Execution state (orthogonal) | Meaning |
| --- | --- |
| `not_run` | No device attempt yet (default for flows without a receipt entry) |
| `running` | Batch in progress |
| `completed` | Device attempt finished (pair with PASS/FAIL) |
| `aborted` | Stopped before verdict (session risk, operator stop) |

Authoring-only flows stay `not_run` + no PASS. `fixture-blocked` flows stay **BLOCKED** for ordinary sweeps until fixture approval — still may be run **singly** by B when env is known.

---

## Session preservation + 944 hold

**Preserve cached / manual QA sessions.** These 15 flows are written for an **already signed-in** session:

- **Do not** run smoke / auth / harness / `ensure-on-login` / `login-*` / `ensure-warm-session` / `ensure-warm-home` against a session you must keep.
- **Do not** run `npm run maestro:fixtures:seed` or `maestro:fixtures:reset` for this packet.
- **Do not** give broad suite mutation instructions (no `--include-tags smoke`, no directory-wide `.maestro` sweeps from this guide).

**944 hold:** chapter assignment **944** is **excluded** as a recording / disposable target (peer-checker policy). Recording chrome flows that take `MAESTRO_FIXTURE_CHAPTER_ID` **must not** use `944` (flows assert `!== '944'`).

---

## QA-only entry (single flow)

**Entrypoint:** `bash scripts/maestro-test-qa.sh`
Pins `MAESTRO_ENV_LANE=qa` + `.env.maestro.qa` (basename enforced). See `docs/guides/maestro.md`.

There is **no** `npm run maestro:test:qa` alias. Do **not** use Dev `npm run maestro:test*` for QA acceptance.

### Direct single-flow command (QA-pinned)

Replace `<flow.yaml>` with one path from the catalog below. Pass required `-e` / env exports for that flow. **Never** paste passwords or private emails into this doc or receipts.

```bash
bash scripts/maestro-test-qa.sh \
  --config .maestro/config.yaml \
  .maestro/flows/<area>/<flow>-existing-session.yaml
```

Example shape (env names only — values from local `.env.maestro.qa` or operator shell, not committed):

```bash
bash scripts/maestro-test-qa.sh \
  --config .maestro/config.yaml \
  -e MAESTRO_FIXTURE_CHAPTER_ID="<digits>" \
  .maestro/flows/drafting/tabs-existing-session.yaml
```

Official syntax only (no device):

```bash
maestro check-syntax .maestro/flows/<area>/<flow>-existing-session.yaml
```

---

## Catalog — 11 existing-session flows

Shared preconditions (all 11 unless a row tightens them):

1. App process already running; **login screen must not appear**.
2. Operator does **not** clearState / cold-login / Add User / seed / reset for the run.
3. Fail closed on missing/invalid env — no skip-green / auth fallback inside the flow.

`fixture-blocked` status: tag on the YAML **and** excluded from ordinary shared-runner sweeps via `--exclude-tags …,fixture-blocked` on `maestro:test` / area scripts. That is **not** a runtime PASS waiver.

### 1. `navigation/home-tabs-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `nav`, `existing-session` |
| **fixture-blocked** | No |
| **Env** | _(none)_ |
| **Preconditions** | Signed-in Home; ≥1 My Work row and ≥1 Projects milestone row |
| **State assertions** | `login-email-input` absent; My Work ↔ Projects roundtrip; `my-work-row-\d+` / `milestone-row-.*` visibility |
| **Mutation limits** | Tab switches only. No drawer account switch, sync, download, record, sign-out |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  .maestro/flows/navigation/home-tabs-existing-session.yaml
```

### 2. `navigation/my-work-to-drafting-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `nav`, `existing-session` |
| **fixture-blocked** | No |
| **Env** | `MAESTRO_FIXTURE_CHAPTER_ID` — digits `/^[1-9][0-9]*$/` |
| **Preconditions** | My Work contains `my-work-row-<id>` for that chapter |
| **State assertions** | Open chapter → `drafting-tab-bar` + Bible/Resources/Record tab ids; back to Home; no login |
| **Mutation limits** | Navigation only. No record-start, sync, download, account switch |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_FIXTURE_CHAPTER_ID="<digits>" \
  .maestro/flows/navigation/my-work-to-drafting-existing-session.yaml
```

### 3. `drafting/tabs-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `drafting`, `existing-session` |
| **fixture-blocked** | No |
| **Env** | `MAESTRO_FIXTURE_CHAPTER_ID` |
| **Preconditions** | Same chapter row on My Work |
| **State assertions** | Bible / Resources / Record tab hosts (`bible-tab`, `resources-tab`, `record-tab`) via drafting tab bar |
| **Mutation limits** | Tab chrome only. No capture, take delete, sync, PFO download |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_FIXTURE_CHAPTER_ID="<digits>" \
  .maestro/flows/drafting/tabs-existing-session.yaml
```

### 4. `drafting/resources-empty-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `drafting`, `existing-session`, `read-only` |
| **fixture-blocked** | No |
| **Env** | `MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE` (chapter assignment id); `MAESTRO_EXPECT_RESOURCES_EMPTY_KIND` (flow-documented enum) |
| **Preconditions** | Known **empty** Resources fixture chapter (authoring notes reference assignment **484** as empty UI — not mobile issue #484) |
| **State assertions** | Resources empty host / copy; no false populated chrome wildcard PASS |
| **Mutation limits** | Read-only. No PFO download, network airplane toggles, capture |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE="<digits>" \
  -e MAESTRO_EXPECT_RESOURCES_EMPTY_KIND="<kind>" \
  .maestro/flows/drafting/resources-empty-existing-session.yaml
```

### 5. `drafting/resources-populated-existing-session.yaml` (C populated — written)

| | |
| --- | --- |
| **Tags** | `drafting`, `existing-session`, **`fixture-blocked`** |
| **fixture-blocked** | **Yes** — populated fixture **unproven** until operator-approved chapter + marker |
| **Env** | `MAESTRO_EXPECT_RESOURCES_POPULATED_FIXTURE`; `MAESTRO_EXPECT_RESOURCES_POPULATED_SECTION` ∈ `translation_notes` \| `translation_questions` \| `images_maps`; `MAESTRO_EXPECT_RESOURCES_CONTENT_MARKER` (exact body text ≠ chrome labels) |
| **Preconditions** | Approved populated chapter for the chosen section (do **not** assume empty-484 is populated) |
| **State assertions** | Expand section → content marker visible → collapse; loading settles |
| **Mutation limits** | Expand/collapse only. No download / PFO / capture. Ordinary sweeps exclude via `fixture-blocked` |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_EXPECT_RESOURCES_POPULATED_FIXTURE="<digits>" \
  -e MAESTRO_EXPECT_RESOURCES_POPULATED_SECTION="<section_enum>" \
  -e MAESTRO_EXPECT_RESOURCES_CONTENT_MARKER="<exact body text>" \
  .maestro/flows/drafting/resources-populated-existing-session.yaml
```

### 6. `recording/verse-bounds-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `record`, `existing-session`, **`fixture-blocked`** |
| **fixture-blocked** | **Yes** |
| **Env** | `MAESTRO_FIXTURE_CHAPTER_ID` (**≠ 944**); `MAESTRO_FIXTURE_VERSE_REF_FIRST`; `MAESTRO_FIXTURE_VERSE_REF_NEXT` |
| **Preconditions** | Chapter on My Work; Record unit has ≥2 verse refs matching env |
| **State assertions** | Prev/next verse chrome; first/next label waits; bounds enablement — **no** record-start |
| **Mutation limits** | Verse navigation chrome only. No record / delete / sync. **944 forbidden** |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_FIXTURE_CHAPTER_ID="<digits≠944>" \
  -e MAESTRO_FIXTURE_VERSE_REF_FIRST="<label>" \
  -e MAESTRO_FIXTURE_VERSE_REF_NEXT="<label>" \
  .maestro/flows/recording/verse-bounds-existing-session.yaml
```

### 7. `recording/take-view-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `record`, `existing-session`, **`fixture-blocked`**, `multi-recorder` |
| **fixture-blocked** | **Yes** |
| **Env** | `MAESTRO_FIXTURE_CHAPTER_ID` (**≠ 944**); `MAESTRO_FIXTURE_TAKE_VIEW_ALL_MARKER` |
| **Preconditions** | Existing **multi-recorder** data on that chapter’s current Record unit |
| **State assertions** | Mine/all toggle; list/header visibility; marker regex — **no** record-start |
| **Mutation limits** | Toggle chrome only. No new take / delete / sync. **944 forbidden** |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_FIXTURE_CHAPTER_ID="<digits≠944>" \
  -e MAESTRO_FIXTURE_TAKE_VIEW_ALL_MARKER="<marker>" \
  .maestro/flows/recording/take-view-existing-session.yaml
```

### 8. `sync/sync-entry-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `sync`, `existing-session` |
| **fixture-blocked** | No |
| **Env** | _(none)_ |
| **Preconditions** | Signed-in; Home reachable (helpers may use stack-header-back only for PFO) |
| **State assertions** | Home → Sync (`sync-screen`, cellular chrome) → Home; login absent |
| **Mutation limits** | Entry/back only. **No** Sync Now / pause / resume / cancel / download / cellular toggle |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  .maestro/flows/sync/sync-entry-existing-session.yaml
```

### 9. `sync/status-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `sync`, `existing-session`, `read-only` |
| **fixture-blocked** | No |
| **Env (required)** | `MAESTRO_EXPECT_SYNC_STATUS_TITLE`; `MAESTRO_EXPECT_SYNC_CONTROLS` ∈ `pending` \| `syncing` \| `paused` \| `hidden` |
| **Env (optional; typo fails)** | `MAESTRO_EXPECT_UPLOAD_CHAPTER_COUNT_TEXT`; `MAESTRO_EXPECT_SYNC_ERROR` ∈ `none` \| `unuploadable` \| `failed` \| `metadata` \| `retry`; `MAESTRO_EXPECT_DOWNLOADS` ∈ `absent` \| `present` |
| **Preconditions** | Device Sync UI already matches the **declared** expected fixture state |
| **State assertions** | Escaped exact status title; control chrome ids; optional error/downloads visibility — assert only |
| **Mutation limits** | **No** Sync Now / pause / resume / cancel / download manage / cellular toggle |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_EXPECT_SYNC_STATUS_TITLE="<exact title>" \
  -e MAESTRO_EXPECT_SYNC_CONTROLS="<pending|syncing|paused|hidden>" \
  .maestro/flows/sync/status-existing-session.yaml
```

### 10. `ownership/ownership-status-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `ownership`, `existing-session`, `read-only` |
| **fixture-blocked** | No |
| **Env (required)** | `MAESTRO_FIXTURE_PROJECT_NAME`; `MAESTRO_FIXTURE_CHAPTER_LABEL`; `MAESTRO_EXPECT_OWNERSHIP` ∈ `mine` \| `other` \| `unassigned` \| `conflict` |
| **Env (optional)** | `MAESTRO_EXPECT_RECORD_WARNING` ∈ `none` \| `taken` \| `conflict` |
| **Preconditions** | Named project+chapter already show the expected ownership chrome |
| **State assertions** | Chapter-list ownership / conflict indicators; optional Record warning chrome then back — **no** claim |
| **Mutation limits** | Read-only. No auto-claim, record-start, stage advance, Sync Now, reassign. Exit chapter list via `stack-header-back` (not `goto-home` from list) |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_FIXTURE_PROJECT_NAME="<exact name>" \
  -e MAESTRO_FIXTURE_CHAPTER_LABEL="<exact label>" \
  -e MAESTRO_EXPECT_OWNERSHIP="<mine|other|unassigned|conflict>" \
  .maestro/flows/ownership/ownership-status-existing-session.yaml
```

### 11. `accounts/cached-switch-existing-session.yaml`

| | |
| --- | --- |
| **Tags** | `accounts`, `existing-session`, `cached-switch`, `guard` |
| **fixture-blocked** | No (excluded from ordinary sweeps via **`accounts`** / guard — not the `fixture-blocked` tag) |
| **Env (required)** | `MAESTRO_CACHED_ACCOUNT_{A,B,C}_ID` (numeric >0); `MAESTRO_CACHED_ACCOUNT_{A,B,C}_EMAIL`; `MAESTRO_CACHED_ACCOUNT_{A,B}_EXPECT_MY_WORK_ROW` ∈ digits \| literal `empty` |
| **Env (optional)** | `MAESTRO_CACHED_EXPECT_A_ROW_EXCLUSIVE=1` only when fixture proves A’s row cannot appear under B |
| **Preconditions** | **Three** accounts already cached on device; no Add User / login in-flow |
| **State assertions** | Drawer lists A/B/C; a11y `^Switch to <email>$`; My Work scoped asserts; Settings non-blank after both real switches; C preserved |
| **Mutation limits** | **Allowed:** cached account switch A→B→A + bounded auto-PFO dismiss via `stack-header-back` only. **Forbidden:** Add User, login helpers, clearState, Sync Now, ensure-no-modal/Discard, system Back for PFO. Normalize = unconditional tap account A while drawer open (already-active → `closeDrawer` only) |

```bash
bash scripts/maestro-test-qa.sh --config .maestro/config.yaml \
  -e MAESTRO_CACHED_ACCOUNT_A_ID="<id>" \
  -e MAESTRO_CACHED_ACCOUNT_B_ID="<id>" \
  -e MAESTRO_CACHED_ACCOUNT_C_ID="<id>" \
  -e MAESTRO_CACHED_ACCOUNT_A_EMAIL="<email>" \
  -e MAESTRO_CACHED_ACCOUNT_B_EMAIL="<email>" \
  -e MAESTRO_CACHED_ACCOUNT_C_EMAIL="<email>" \
  -e MAESTRO_CACHED_ACCOUNT_A_EXPECT_MY_WORK_ROW="<digits|empty>" \
  -e MAESTRO_CACHED_ACCOUNT_B_EXPECT_MY_WORK_ROW="<digits|empty>" \
  .maestro/flows/accounts/cached-switch-existing-session.yaml
```

---

## Operator checklist (B batch)

1. Confirm session to preserve (cached accounts / active user) — abort if login chrome appears.
2. Run **one** flow at a time via QA entrypoint; record verdict + execution state.
3. Never seed/reset; never smoke/auth harness against preserved session.
4. Honor **944** hold and `fixture-blocked` / unproven populated Resources.
5. Write final results only into [`runtime-receipt.md`](./runtime-receipt.md) — not into frozen history READMEs.
6. Root reviews **this** README before checkpoint; do not treat authoring as PASS.

---

## Explicit non-goals

- No private auth values, passwords, or hardcoded test credentials in this packet.
- No broad suite mutation runbooks; no seed/reset instructions.
- No runtime workers, public index edits, or git ops from this lane.
- No claim that syntax-clean YAML or “11 flows authored” equals acceptance PASS.

## Legal functional verification — 2026-10-20

[Durable legal receipt](evidence/legal-functional-checks.json): **Privacy and Terms page/body/header-back→Home PASS via direct device UI**, with active12 and cached10/9/12 unchanged. These two checks are separate from the15 Maestro PASS variants/11files. Twelve component tests across three suites pass at `9bcf837`; they are isolated evidence. The Privacy Maestro body delta timed out at drawer entry before body assertions; Terms was not attempted through Maestro. Its raw timeout is retained and is not a product failure.

Privacy wording remains a separate [known issue #725](https://github.com/eten-tech-foundation/fluent-mobile/issues/725); no policy text changed. Current text fits the preserved viewport; actual scroll movement is unproven and remains an owned conditional next check when genuine overflow exists. No viewport/font/content manipulation or whole-requirement PASS promotion.

## Latest Privacy Maestro validation

Checkpoint47288d0 drawer-settle guard was validated by one focused Privacy flow: **PASS45.967s,17UIassertions**, first/final body, headerBack and Home. Sessions/preferences unchanged. Current automated total is16variants/12files (baseline15/11 plus this legal variant); two direct-device checks and12component tests stay separate. Earlier failures remain retained; Terms guarded flow and actual overflow are not newly executed. Atomic counts remain9complete/14partial/63absent. Libraryv16 remains the prior frozen report until the next material milestone.
