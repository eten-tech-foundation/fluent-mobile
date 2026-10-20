# Maestro acceptance coverage — runtime receipt

Dated runtime record for the existing-session flow packet. Scope is 15 live case variants across eleven new flow files. This receipt is separate from the historical 21-case ledger and from setup/assertion counts. It is **not** a whole-app coverage percentage, a live grant, audio-fidelity, human Nightly, or disposable-target claim.

Sources (read-only verified receipts):

- `/tmp/fluent-independent-home-tabs-user10-result.json`
- `/tmp/fluent-efficient-batch.json`
- `/tmp/fluent-affected-retry-batch.json`
- `/tmp/fluent-distinct-behavior-batch.json`

Recorded PASS artifact directories (exact receipt values):

- Home-tabs: `/tmp/maestro-independent-home-tabs-user10`
- Resources-empty: `/tmp/maestro-efficient-resources_empty_external`
- PFO viewport-fixed: `/tmp/maestro-efficient-pfo_viewport_fixed`
- Cached-switch viewport-fixed: `/tmp/maestro-efficient-cached_rows_viewport_fixed`
- Verse-boundary: `/tmp/maestro-efficient-verse_boundary_first_execution`
- Ownership peer-checker mine: `/tmp/maestro-efficient-ownership_peer_checker_mine_first_execution`

The source receipts retain their exact dated `commands_artifact` paths; Home-tabs records its `artifact_dir`.

## New distinct flow PASSes (6)

Each: exit 0, no timeout, no kills, `auth_values_read: false`, app PID 7152 unchanged.

| # | Flow | Source receipt | Elapsed | UI asserts | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | `navigation/home-tabs-existing-session.yaml` (user 10) | `fluent-independent-home-tabs-user10-result.json` | 21.732s | 13 | PASS |
| 2 | `drafting/resources-empty-existing-session.yaml` | `fluent-efficient-batch.json` | 67.835s | 23 | PASS |
| 3 | `offline/pfo-download-button-persist.yaml` (viewport-fixed) | `fluent-affected-retry-batch.json` | 80.096s | 37 | PASS |
| 4 | `accounts/cached-switch-existing-session.yaml` (viewport-fixed) | `fluent-affected-retry-batch.json` | 91.288s | 53 | PASS |
| 5 | `recording/verse-bounds-existing-session.yaml` | `fluent-distinct-behavior-batch.json` | 56.22s | 30 | PASS |
| 6 | `ownership/ownership-status-existing-session.yaml` (peer-checker mine) | `fluent-distinct-behavior-batch.json` | 43.042s | 23 | PASS |

Navigation/tabs new YAMLs (`my-work-to-drafting`, `drafting/tabs`, `sync/status`, etc.) have migration/static checks only and are **not** counted as runtime PASSes here. Home-tabs is the only navigation runtime PASS above and is counted once.

## Additional ownership variants (same flow, four new cases)

Source: `/tmp/fluent-ownership-state-batch.json`; durable aggregate: [runtime-evidence.json](runtime-evidence.json). All exit 0, no timeout, app PID 7152 preserved.

| Assignment | Stage / expected owner | Elapsed | UI asserts | Result |
| --- | --- | --- | --- | --- |
| 480, 1 Peter 1 | draft / other | 41.859s | 23 | PASS |
| 481, 1 Peter 2 | not_started / unassigned | 42.387s | 24 | PASS |
| 487, 2 Peter 3 | complete / unassigned | 41.637s | 24 | PASS |
| 488, 1 John 1 | draft / mine | 41.605s | 23 | PASS |

All use existing project 8 / Milestone Testing 2 with user 10. No assignment, stage, claim, or recording mutations. Final Home proof and account-12 restore both PASS; cached 10/9/12 preserved. These add variants, not flow files.

## Fixtures

- **Resources (484):** `none_for_verse`; empty-state fixture for `resources-empty`.
- **PFO:** project 8, book `1 Peter`, selection-only; no download.
- **Cached accounts:** 10/12 preserved; 9 remains known. Final active user 12.
- **Verse and ownership:** assignment 484, project 8, `1 Peter 5`, 14 verses, zero recordings, stage `peer_check`, peer_checker 10, drafter 11, `has_conflict` 0. Verse mode is default (not pericope).

## Historical failed attempts (preserved, not erased)

- PFO first attempt (`fluent-efficient-batch.json`): FAIL — `prepare-offline-download-button` not visible; harness/viewport issue, fixed by viewport-fixed rerun above.
- Cached-switch first attempt (`fluent-efficient-batch.json`): FAIL — `my-work-row-2` not visible; viewport issue, fixed by viewport-fixed rerun above.
- Home-after-PFO-failure (`fluent-efficient-batch.json`): INTERRUPTED — exec-server connection ended; no exit captured.

## Cleanup and state

- Distinct-behavior run finished with restore to account 12: `new_behavior_restore12` exit 0; final active 12, cached 10, 9, 12; app PID 7152.
- Home-tabs run identity: start 12, after prep 10, final 12; `cached_retry` NOT_RUN (informational).

## Remaining blockers (not PASS)

- Sync-status: no independently proven in-memory UI-state fixture.
- Resources populated: no proven section/body content marker.
- Take view: no multi-recorder recordings (known 484 recordings 0); not run.
- Pericope boundary: unproven; not run.
- 944: forbidden; not used.

## Hashes (flow SHA256 from receipts)

| Flow | SHA256 | Receipt |
| --- | --- | --- |
| `navigation/home-tabs-existing-session.yaml` | `5ff8820a00eac16a84ac98860df318cffeb52fe0b9917805eca335cd7faf3007` | home-tabs-user10 |
| `drafting/resources-empty-existing-session.yaml` | `3c4e7139ed95d103ba136e1de817cf570d9df738d1206b84a42ff2dc8676a67f` | efficient-batch |
| `offline/pfo-download-button-persist.yaml` (viewport-fixed) | `d239623de8d55e8a5986b659eebb6832417b8e6f90b3a32847fcc100c97a144f` | affected-retry-batch |
| `accounts/cached-switch-existing-session.yaml` (viewport-fixed) | `7327c2ffe2857c687b8df8f1f3b9c0e4af575bbac4b32cf9350c58dc7af76da3` | affected-retry-batch |
| `recording/verse-bounds-existing-session.yaml` | `9e4d99b717833e8c1eb338cd8dad9fc9e1022528aa5deee5581c45b8c80b1b10` | distinct-behavior-batch |
| `ownership/ownership-status-existing-session.yaml` | `ce0ebbd5faab0bf7aade5d91b5a4a0a096fb59bc85b1f472ab143973b9c510c5` | distinct-behavior-batch |

Note: the efficient-batch PFO hash (`5e53c0c5…`) is the pre-fix file and is superseded by the viewport-fixed hash above.

## Checkpoint metadata

Sync status is tagged `fixture-blocked` so ordinary sweeps exclude it until its required state is independently established. No runtime verdict is inferred. No production files changed. Full PR gates were not run for this local harness checkpoint; this is not a PR-ready or completed-AC claim.

## Subsequent distinct Bible-to-Record case

D-0564-01 (D-0408-03 alias counted once): `drafting/bible-verse-opens-record-existing-session.yaml` PASS, exit 0 in 53.167s with 23 UI assertions. Assignment 484 / verse 2 / exact `1 Peter 5:2`: tapped the Bible verse row and Record opened directly; no Record-tab tap or capture/playback. Source receipt: `/tmp/fluent-bible-record-direct-batch.json`; aggregate above includes this eleventh variant and seventh flow file. Home cleanup and cached-account-12 restore PASS; PID 7152 and cached 10/9/12 retained.

Separately, four new isolated contract cases passed in a focused 55-test / two-suite run (Node 24.14.0, 3.988s): populated notes/questions/images pass-through, and late previous-verse All Takes response isolation. These do not prove populated live Resources or multi-recorder fixtures. No broad PR gates were run.

## Developer-overlay correction and two subsequent live branches

Expo's floating Tools control was dragged from the header hit area (1010, 170) to the clear right edge (1010, 560), with before/after screenshots. No settings, product, or auth changes were made.

After explicit authorization, three-account cap/dismissal passed in 44.217s with 39 UI assertions. A healthy Home/error-absence check passed in 11.286s before the Complete-stage idle lock passed in 58.195s with 38 UI assertions. No record, play, claim, or stage controls were tapped. Source: `/tmp/fluent-after-tools-drag-batch.json`. Final Home cleanup passed in 18.181s; restoring cached account 12 passed in 24.896s. PID 7152 and cached accounts 10/9/12 were preserved. Earlier failed attempts remain in the reconciliation. Neither passing case was repeated.

These add two live variants and two flow files. Broader compound role, stage, and native playback requirements remain incomplete, so the 86-current-atomic subset stays at 5 complete, 17 partial, and 64 absent. Two additional isolated mock contracts (account dismissal and Complete-stage scrubbing) passed focused runs of 11/11 and 75/75 tests; local checkpoint `d3f2274` preserves those additions. Mock evidence remains separate from live behavior.

## Missing-assertion milestone

Two new read-only cases each ran once: PFO flow FAIL after exact header/instruction assertions completed; incorrect return-to-Settings check failed because captured hierarchy showed Home. Elapsed 36.942s (11 UI assertions); empty Resources relative tab order PASS 31.827s (19 UI assertions). Sources `/tmp/fluent-next-assertion-batch.json` (PFO) and `/tmp/fluent-resources-order-only-batch.json` (Resources); frozen hashes and exact commands paths retained in runtime-evidence.json. PFO required-copy evidence is complete despite the separate harness return failure. Corrected flow now asserts Home after Back; correction was not rerun. Resources ran only after safe cleanup and account restoration. No download, recording, playback, preference, credential or shared-state changes. Final Home cleanup and cached12 restoration PASS; PID 7152, cached 10/9/12 preserved. Relocated Expo Tools control remains clear of header.

D-0235-02 also upgrades using already successful Projects and My Work navigation evidence, with no new run. Current bounded 86 candidates: 8 complete, 14 partial, 64 absent; 8 PASS / 70 BLOCKED / 8 UNTESTED. Historical 5/17/64 above describes the earlier milestone. The remaining eight UNTESTED rows retain explicit oracle/scope limits in evidence-reconciliation.json; no app-wide percentage. Existing pericope seed contracts already cover lookup/version behavior, so no duplicate isolated test was added or rerun.

## Approved user10 preference persistence

D-0407-02 PASS: 68.111s, 33 UI assertions, exit0, no timeout. Source `/tmp/fluent-preference-persistence-batch.json`. Initially active12, cached10/9/12, user10 preference override absent (effective Verse); UI selected Verse required before mutation. Changed only user10 drafting unit to Pericope, reopened drafting with Pericope-driven UI, then reopened Settings and asserted Pericope remained selected. Restored Verse through UI, reopened drafting with verse rows and no pericope warning; Home cleanup and active12 restore PASS. Other cached-user preference keys unchanged. The initially absent override is now explicit `verse` with the normal preference dirty flag; no direct storage edits. No other setting, recording, playback, sync, auth, reset, rebuild or sharedQA action.

Current bounded86: 9 complete / 14 partial / 63 absent; 9 PASS / 70 BLOCKED / 7 UNTESTED. Total successful live variants15 across11 flow files. Historical milestones above remain dated evidence. Pericope cards-or-unavailable fallback verifies preference application, not populated pericope segmentation or seed provenance. PFO required-copy PASS remains separate from its failed return-harness execution.
