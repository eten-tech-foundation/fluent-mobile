# Seven-feature assignment map —22 October2026

Verified code baseline: live `main` **200bb13c705f66cc00f107cc93095bee7247a8ba** matches inspected local `origin/main`. Primary audit checkout is `e2c88d27…`. Cursor Auto inspection was read-only; no source/test/device/PR mutation.

**Result:** six mobile feature paths are confirmed absent on the inspected current-main surfaces;#679 has partial foundation and is reserved for worker `01a1651e-4d88-7692-811f-eedeb273302a`. Backend support is explicitly unverified, not assumed absent.

[Detailed file/line evidence](/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/issue-history-reconciliation-20261022/seven-feature-readonly-code-result-20261022.md) · [Machine assignment map](seven-feature-assignment-map-20261022.json)

## Assignment boundaries

| Lane | Issues | Ownership and current gap |
| --- | --- | --- |
| A | #505, #703 | 01a16524-3ad6-7540-b31b-739e2354800d. Stage accordions and actual Observer/open-peer population; comment count/current-user marker binding only when real comment data exists. This lane alone integrates row download chips and Observer navigation supplied by B/D. |
| B | #452 | 01a16524-6252-74cb-9d89-35b26ed70002. Dedicated Observer Bible+Draft read-only view, canonical playback only, no Resources or recording/take mutation. Reuse current player rather than implementing a second engine. Expose entry contract to A; do not edit MyWorkRow. |
| C | #451 | 01a16524-6252-74cb-9d89-35b26ed70002. Real comment contract and local state plus entry/composer/panel on target-language draft only. No Bible comment affordance. Export aggregate contract to A/#703 and entry integration to B/#452. |
| D | #508, #704 | 01a16524-8976-7588-9006-2300646ea004. Build common #508 download behavior once, then #704 adaptation as the issue explicitly requires. Observer includes draft text/selected audio plus source scripture; peer excludes source scripture. Manual-only download, progress/retry, incomplete entry allowed, stage-specific cache cleanup. A owns MyWorkRow chip wiring. No PFO pipeline rewrite. |
| E | #679 | EXCLUSIVE worker01a1651e-4d88-7692-811f-eedeb273302a. Reserved. This lane does not implement, reverify or dispatch #679. Existing read-only finding: partial progressive-login foundation; full master wait remains. |

## Existing work to avoid duplicating

- Jonathan’s open[PR770](https://github.com/eten-tech-foundation/fluent-mobile/pull/770) owns stage-queue work and touches RecordTab, schema/migrations(v21), repository, API, sync and workflowStage. Reserve shared migrations/API/RecordTab integration with that owner. It does not directly change MyWorkTab.
- Historical[PR361](https://github.com/eten-tech-foundation/fluent-mobile/pull/361) is closed **unmerged**; do not confuse it with PR770 or a merged queue implementation.
- Josh/jskager’s open[PR727](https://github.com/eten-tech-foundation/fluent-mobile/pull/727) owns the Next route tree; respect its navigation boundary.
- No matching implementation PR/named feature branch for the remaining six was identified in the bounded searches. Code absence was independently inspected; absent links alone were not used.

## Blocking contracts

- Observer identity/grants: verify actual server contract, no role/email guessing and no new stage-scope backend field.
- Comments: verify backend thread/model/endpoints before claiming functional completion; comments apply to Draft/Record, never Bible.
- Downloads: verify server selected/canonical take listing plus usable URLs; upload response parsing alone does not prove a peer/Observer hydration contract.
- Keep MyWorkRow integration with A and draft-download service/component with D. No competing row edits or duplicate download engine.
- Preserve the explicit#505 pericope-versus-chapter row-label question; do not broaden it into an undecided whole feature.

Implementation has been dispatched to the named isolated lanes below. No programming or PR was started by the reconciliation lane; merging remains paused.

## Recorded implementation owners

- #505, #703: `01a16524-3ad6-7540-b31b-739e2354800d`
- #451, #452: `01a16524-6252-74cb-9d89-35b26ed70002`
- #508, #704: `01a16524-8976-7588-9006-2300646ea004`
- #679: `01a1651e-4d88-7692-811f-eedeb273302a`

Device audit ownership and scorecard statuses are unchanged; PR links remain pending actual publication.

## Mobile679 implementation delivered — 2026-10-22T19:53:11.500437+00:00

[PR771](https://github.com/eten-tech-foundation/fluent-mobile/pull/771) is open and ready, authored by mattrace-gloo, commit `e2c1d47ff58bdb91d70c1c211144ee6fbaf4b9a6`. It reuses existing by-ID API routes, seeds required FK parents and defers full catalogue after Tier1; no new API/schema work. API373/updatedAfter via379 is separate and not duplicated. Local108 targeted tests and260 suites/2302 tests are reported PASS; CI remains pending/reported, not read here. No merge, deploy, native QA or timing claim. A0025 live-login verification remains pending. Prior API-dependency text is historical and superseded by this delivery.

Readiness/board rejection and improper no-op readiness retry were disclosed by the implementation lane. No board change is authorized or performed by this documentation update.

PR771 evidence update (2026-10-22T20:02:24.450409+00:00): head `152a0d05` after a nonblocking test nit; production behavior unchanged. Focused sync file60/60 PASS and all4CI plus CodeRabbit terminal success **reported by implementation lane**. This supersedes the earlier CI-pending snapshot. Device/login performance and PR770 integration remain pending; no runtime PASS. Board owner `01a16532` handles external project status; no board action here.

PR771 merge update (2026-10-22T20:10:18.278873+00:00): verified merged by `mattrace-gloo` at **2026-10-22 20:07:09UTC**, merge commit `c9e82a905889f4c3cdc9d0916be944b4a3613925` now on main. This lane did not merge. Earlier open/ready snapshots are historical. Release deployment and native/login timing remain unproven; A0025 is not promoted. PR770 remains open draft at `85ddeed4`: future integration requirement, not a landed regression. Dedicated board owner handles external status; no board action here.
