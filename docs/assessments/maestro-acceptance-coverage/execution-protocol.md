# Existing-session QA execution and evidence protocol (#717)

This is an operator protocol for the existing flows, not a new runner. The compact [assertion evidence](evidence/assertion-evidence.json) preserves allowlisted command evidence from already completed runs. Read it with [runtime-evidence.json](runtime-evidence.json), [runtime-receipt.md](runtime-receipt.md), and [evidence-reconciliation.json](evidence-reconciliation.json). It does not make an authored flow, mock test, or entire requirement pass by association.

## Environment and ownership

- Use **QA only**: API `https://qa.api.fluent.bible`, web `https://qa.app.fluent.bible/`. Verify the public configured origin without printing environment files or credentials. The existing entrypoint is `scripts/maestro-test-qa.sh`.
- One named operator owns `emulator-5554` / `com.eten.fluent` and one named operator owns the web browser. Serialize device runs; do not duplicate an active or uncertain run. Independent source/test work must have distinct file ownership and must not hot-reload product changes during a frozen device check.
- Preserve existing cached users **10/9/12**, their sessions, and the operator's initial active account. Historical runs prepared user10 and restored active12; numeric IDs and candidate account email suffixes are **not role/grant proof**. The operator must supply current authoritative account/assignment expectations.
- **944 is forbidden.** Do not record, reassign, claim, change stages, or download on historical assignments. New recording targets require a clearly labeled disposable QA fixture created through the supported web UI, with independently recorded IDs and expected outputs. Do not alter another user's existing fixture or grants.
- Do not clear state, log out, add/remove accounts, reset databases, extract stored credentials, or invoke login/warm-session helpers to prepare these cases. If authorization/session state differs, stop dependent actions and preserve the user's changes. Use a supported secure sign-in flow only when separately needed and authorized.
- Keep Metro, the app process and shared ADB/Maestro services intact. A bounded timeout may stop only the owned test process group. No forced sync, direct storage reversal, or broad auth/mutation suite is part of this protocol.

## Before a targeted run

1. Confirm no other device test is running. Record issue/requirement, flow path, current Git checkpoint, installed Maestro version, Node version for any isolated tests, artifact directory and the sole device owner.
2. Verify logged-in Home, active account and cached-account preservation using supported UI and the existing allowlisted identity check. Do not read auth values. If starting on active12, prepare cached user10 through existing account-switch UI; retain before/after identity and the eventual restoration result. The historical `/tmp` prep/cleanup runners are local provenance, not required portable executables.
3. Confirm fixture IDs and exact expected UI outputs from a current authorized fixture manifest. Existing samples below are dated dependencies, not evergreen data. Record fixture creation origin and role mapping separately; role names require authoritative UI/API evidence.
4. Freeze the exact flow and helper hashes before execution. Verify the active viewport is clear of the Expo floating Tools control. A Dev Menu absence assertion alone does not prove its floating hit target is absent. Historical Tools relocation cleared the header; do not drag it back over the header.
5. Allocate a unique output directory and a bounded single attempt. Explicitly opt into `fixture-blocked` or preference mutation cases only after their preconditions are established. Do not run a broad suite to discover state.

## Reproducible command shape

Run from the repository root with the existing QA entrypoint. `ARTIFACT_DIR` is a new operator-chosen directory for this one case; it must not overwrite prior evidence. The commands below are examples for established fixture preconditions, **not instructions to rerun passing cases for packaging**.

```bash
ANDROID_SERIAL=emulator-5554 bash scripts/maestro-test-qa.sh \
  --test-output-dir "$ARTIFACT_DIR" \
  -e MAESTRO_EXPECT_EXPO_DEV_MENU_ABSENT=1 \
  -e MAESTRO_EXPECT_RESOURCES_EMPTY_FIXTURE=484 \
  -e MAESTRO_EXPECT_RESOURCES_EMPTY_KIND=none_for_verse \
  .maestro/flows/drafting/resources-empty-existing-session.yaml
```

```bash
ANDROID_SERIAL=emulator-5554 bash scripts/maestro-test-qa.sh \
  --test-output-dir "$ARTIFACT_DIR" \
  -e MAESTRO_EXPECT_EXPO_DEV_MENU_ABSENT=1 \
  -e MAESTRO_FIXTURE_CHAPTER_ID=484 \
  -e MAESTRO_FIXTURE_VERSE_NUMBER=2 \
  -e 'MAESTRO_EXPECT_RECORD_REFERENCE=1 Peter 5:2' \
  .maestro/flows/drafting/bible-verse-opens-record-existing-session.yaml
```

Other passing paths use the same entrypoint and their source-declared exact parameters. Resolve selectors through the tracked `shared/scripts` helpers; do not reintroduce inline computed-selector expressions that previously evaluated undefined on the installed engine.

| Case family | Required fixture/configuration | Existing outputs retained in assertion evidence |
| --- | --- | --- |
| Home tabs | Signed-in user10; settled Home | Home/My Work/Projects reachability and login absence |
| Empty Resources / tab order | User10, project8, assignment484 (`1 Peter 5`); `none_for_verse` | Exact empty copy, absent sections; distinct order flow asserts Bible / Resources / Record positions |
| Verse boundaries | `MAESTRO_FIXTURE_CHAPTER_ID=484`, first `1 Peter 5:1`, next `1 Peter 5:2`; effective Verse | Prev disabled / Next enabled at first unit; first→next→first exact references |
| Bible→Record | Assignment484, verse2; exact `1 Peter 5:2` | Direct Bible verse tap opens Record at the requested reference |
| Ownership | `MAESTRO_FIXTURE_PROJECT_NAME=Milestone Testing 2`; chapter/expected ownership supplied | 484 `1 Peter 5` mine;480 `1 Peter 1` other;481 `1 Peter 2` unassigned;487 `2 Peter 3` complete/unassigned;488 `1 John 1` mine |
| Cached switch | Operator supplies distinct A/B/C numeric IDs, exact displayed email selectors, and authoritative My Work row/empty expectations | A→B→A identity/settings/My Work assertions; email selectors are hash-redacted in the portable extract |
| Three-account cap | Active10; cached10/9/12; known484 | Three cached rows/cap, no Add Account, close preserving identity; not an under-limit/grant matrix |
| Complete idle lock | Project8, `2 Peter 3`, `MAESTRO_EXPECT_COMPLETE_IDLE_FIXTURE=487`, status complete, no cached takes | Read-only idle controls; not populated Review or native playback |
| PFO selection | `MAESTRO_FIXTURE_PROJECT_ID=8`, `MAESTRO_PFO_BOOK_NAME=1 Peter` | Selection/count/footer visibility; no Download press |
| PFO copy | User10; project-picker row8, no project selected | Exact title/instruction completed; later return check failed (see below) |
| Preference persistence | User10 initially effective Verse, cached10/9/12; exact fixture484 | Approved Verse→Pericope→Verse, reopen drafting/Settings, same-user persistence and restoration |
| #721 navigation subset | User12 Home; header clear of relocated Tools target | One plain Sync press; `sync-screen` and `sync-upload-cellular-switch` visible; no Sync Now |

The compact file contains the exact executed path, executed hash, receipt/hash, original output/commands path, command indexes and UI targets for every retained variant. Original local paths are provenance; the embedded sanitized assertion records remain readable without those `/tmp` files.

## One attempt, explicit cleanup

A case may have one bounded precondition/probe, one feature attempt and the minimum conditional navigation cleanup. Record helpers separately from feature-case counts. Stop when an HTTP/error overlay invalidates preconditions; do not poll endpoints, repeat taps, or run a green unrelated suite. An aborted precondition is not a feature execution. Check an uncertain outcome before considering another attempt.

Return through the observed screen's supported Back/header controls. Legal pages and chapter lists need their exact observed header path; a generic Home helper does not cover every stack. Preserve the original failure and cleanup result. Restore the operator's initial active account only after safe Home proof. If restoration fails, report the exact screen/account/action and stop rather than force a reset.

For the approved user10 preference case, first require selected **Verse**. Change only drafting unit to **Pericope**, leave Settings and reopen drafting, then reopen Settings and assert Pericope remains selected. Restore **Verse** through UI and verify verse rows on drafting reentry; restore active12. The original absent override (implicit default Verse) is now explicit stored `verse` with the application's normal dirty flag. That is the recorded restoration detail. **Do not delete the key, directly reverse storage, or force sync** to recreate byte-for-byte initial storage. Other cached-user preference keys were unchanged. Pericope cards or its explicit unavailable fallback proves preference application; it does not establish populated pericope segmentation.

## Keep execution and requirement outcomes separate

- The packet contains **15 passing live variants across11 flow files**, not17 passing variants and not whole-app completion. Full current requirements are counted only by the separate reconciliation ledger. Six isolated added contract cases are mock evidence and are excluded from these live counts.
- **PFO:** required exact header/instruction assertions completed. The **flow failed** after Back when its return assertion expected an offscreen/noncurrent Settings row; captured hierarchy showed Home. The current return check was corrected but **not rerun**. Preserve executed and current hashes separately; do not label the corrected file runtime PASS.
- **#721:** the actual single header tap and both Sync-screen UI assertions completed. The **flow failed** on a later `takeScreenshot` command whose absolute path was outside Maestro's output folder. This is assertion-level navigation evidence, not a passing flow or proof of Sync Now/queue/upload behavior. See [the dated #721 assessment](../maestro-sync721/README.md) and its retained original overlay evidence; no rerun was performed just to repair screenshot packaging.
- Preserve earlier failures, interrupted/precondition attempts and later valid evidence. Do not infer new product defects from missing fixtures or mocked behavior, or count helper assertions as requirements.

## Capture and retain future evidence portably

For each uniquely named run, retain its `commands.json`, flow/helper hashes, sanitized receipt, configuration and fixture manifest in the CI/job artifact directory. Use a relative name inside Maestro's screenshot output folder for any screenshots. Upload that run directory as a CI artifact under the repository's normal artifact policy; no new workflow or runner is added here.

Before retaining or attaching raw artifacts, review them for credentials, auth/storage values, request/response payloads, unrelated UI text and account information. Never publish auth profiles, SQLite auth stores or arbitrary process/log dumps. For a compact extraction, retain only:

1. UI `visible` / `notVisible` assertions and tap command type/target;
2. command status, source index/sequence and source timestamp;
3. source receipt ID/hash, commands artifact hash, and exact executed flow hash;
4. allowlisted fixture/account IDs and before/after preservation outcomes;
5. separate flow and requirement verdicts, including any unrelated harness failure.

The checked-in extract uses this allowlist, hashes email/sensitive text selectors instead of embedding them, and stores no raw logs or screenshots. Its validation checks existing receipt UI counts for all15 PASS records, exact required PFO strings, the actual #721 tap/screen assertions, and every input hash at extraction. Hashes identify historical inputs; source clock values are retained without assuming host and device clocks agree.

## Remaining dependencies and delivery gates

Populated Resources needs a known content marker; take-view needs known multi-author disposable recordings; Sync status needs an independently established in-memory state. Exhaustive assignments/membership need authoritative current sets. Web fixture setup and verified role mapping must establish those oracles before mobile runs. Candidate QA emails and existing assignment IDs alone do not establish grants or safe recording targets. APK provenance remains deferred; legal short-content overflow must not be fabricated by changing the viewport or writing new content.

This artifact does not waive required PR checks. Before declaring a focused change set ready, follow the repository format/lint/architecture/typecheck/test gates, exact staged/secret review, standard PR template, issue-specific AC/waivers, and Needs-QA policy. Keep #717 harness, #721 findings and #724 theme implementation separate; local checkpoint provenance is not authorization to push or merge. Root owns the aggregate ledgers and integrates their current totals once.
