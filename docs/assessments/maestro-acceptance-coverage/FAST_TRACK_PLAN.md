# Fluent mobile: fixed fast-track execution plan

Prepared by Astra at 18:55 UTC on 20 October 2026.
Target checkpoint: 00:00 UTC on 21 October, which is 17:00 Phoenix on 20 October.
Approximately five hours remain. This is an execution plan, not a promise that the presently unbounded full acceptance scope fits that time.

## 1. Objective and honest starting point

Finish as much of the full issue-derived mobile acceptance scope as the deadline permits, with durable Maestro proof, real product fixes and issue-separated local changes. Do not substitute unit tests, command counts, a web parity checklist or a smaller denominator for full completion.

The existing audit has 308 issues and 356 comments, yielding 202 canonical candidates. The currently atomized, applicable subset is 86 requirements: 10 complete, 15 partial and 61 absent. Compound groups outside that subset remain part of the scope until explicitly decomposed or dispositioned. These numbers are not a whole-app completion percentage.

Already valuable evidence includes live recording/save/playback/recovery/offline-upload checks, a 13.56-second durable background-pause checkpoint, and isolated fail-before/pass-after fixes through #734. Some of these still lack an end-to-end durable flow or independent server confirmation. The exact current Maestro variant/file count must come from the existing ledger, not a new estimate.

Existing device state:
- 5554: account 12 active; cached accounts 10/9/12 intact; five synthetic takes preserved; no active capture, playback or upload.
- Verse 5 is safely saved as rec_mvh163w0_gs1x0vp9, owner 10, 2.695 seconds and 35,276 bytes. Its pause marker is cleared; upload remains pending. Preserve it and do not create a duplicate retry.
- 5556: fresh, isolated API 33 ARM64 device has booted, with 1.5 GiB/2-core configuration. Existing APK installation and logged-out readiness checks are in progress. It is not yet an authenticated, proven-throughput QA lane.

## 2. Capacity decision: two devices, not more

The Mac has 32 GiB RAM and 10 cores. Before launch: 70.6% CPU idle, 6.61 GiB swap and 65 GiB disk free. During second-device startup: 17.9% idle, 9.16 GiB swap, with the second emulator at 3.53 GiB RSS and startup CPU still settling. Startup measurements do not prove sustained headroom.

Keep 5556 as a monitored trial. Measure settled pressure, swap delta, UI responsiveness and comparable batch timings after installation. Retain it only if useful concurrent throughput improves and 5554 remains reliable. Sustained critical memory pressure, continuing swap growth accompanied by UI stalls, or more than 25% degradation in the primary batch is grounds to retire the second lane safely. Historical swap size alone is not the decision.

No third emulator, new image downloads, duplicated writable AVD, credential/session copying, host network/VPN changes or global desktop input. Serialize native builds and heavy dependency work. Use one integration-owned Metro/build revision and explicit device-scoped automation. Never kill the shared adb server.

If 5556 is not useful, keep its worker on flow authoring and code checks. Run the B queue on 5554 between A batches. Do not spend the evening tuning emulators.

## 3. Ownership and collision rules

Use existing workers where they already own the relevant work, and add only the missing core-fix owner. The main local executor coordinates all Mac work.

- Integration lead / device A: main executor owns emulator-5554, safe state restoration, integration checkout, shared runner/configuration, Metro/build changes and final acceptance decisions.
- Device B: emulator_capacity finishes readiness, then owns emulator-5556 and B-lane runs. It may author B-only Maestro files, but cannot operate 5554.
- Core fix owner: owns assigned persistence, sync, resource/storage and account-boundary application files plus their focused regressions. No UI/theme edits or device control.
- Surface fix owner: theme_isolation owns assigned screen/component/theme/accessibility files and their focused regressions. Preserve independent Legacy and Next token scopes. No persistence changes or device control.
- Harness/packaging owner: coverage_map_report owns A-only Maestro files, shared evidence reconciliation and local issue-branch preparation. It does not redo the audit or regenerate the PDF after each result.
- Browser fixture owner: existing dedicated browser task owns the verified Chrome tab and creates the missing disposable fixtures through the supported web UI. It does not use global desktop focus or mutate either emulator.

Before work starts, the lead records each worker's actual file allowlist from the existing checkout. The two source workers use isolated worktrees or equivalent isolated branches, not simultaneous edits in the served checkout. One owner per file, one owner per device, one owner per mutable fixture. Shared-file changes go to the integration lead, not concurrent edits.

Integrate at batch boundaries only. Freeze the served code revision while either device is running a batch; no surprise hot reloads. Record app revision with every run. Source fixes land through the lead after focused checks, followed by affected device reruns. Keep a single evidence ledger at docs/assessments/maestro-acceptance-coverage/evidence-reconciliation.json.

## 4. Fixed queue and time budget

The order below is fixed. Within a batch, use the existing issue/requirement IDs, with data-loss and unauthorized-cross-account behavior first. Assign existing ledger rows to these batches once; do not start another broad audit. The harness owner attaches applicable compound criteria as the corresponding surface is processed, so they cannot silently disappear.

### Batch 0 — now to 19:10 UTC: unblock safe execution

A: Diagnose host-health-200 versus guest/app-unreachable using supported guest connectivity and app evidence. Verify Android connectivity, the actual supported service route and app state without extracting secrets or bypassing TLS. Preserve the pending owner-10 take. If reachability is restored, observe its normal upload once; confirm count/identity before any retry and restore account 12.

B: Finish APK-only install, run logged-out launch/navigation smoke, and decide whether the settled two-emulator trial is useful.

Browser: Prepare a separate B-lane disposable project/assignment with populated resources and the required verified role pairing. Do not concurrently reuse project 12 / milestone 19 / assignment 1183 for mutation. Prepare fresh supported login for B; no copied sessions. If authenticated B access needs the user, raise that exact handoff immediately while B continues logged-out checks.

Harness: Import current ledger IDs into this queue, record latest durable-flow count and distinguish implemented, executed, blocked and failed assertions. No report redesign.

Exit: Stable owner/serial/fixture assignments; guest reachability resolved or precisely blocked; second-device retain/retire decision; runnable next batches ready.

### Batch 1 — 19:10 to 20:00 UTC: durable core plus app entry

A: Execute the prepared full HOME/return recording driver and fill the missing durable segments around active capture, background pause, save, recovery and offline-pending to reconnect. Reuse known fixtures and existing checkpoints; do not rerun every already-proven setup step separately. Exercise relevant leave/account-switch guards through real supported entries. Keep drawer-specific proof blocked where there is no supported Drafting drawer entry.

B: Auth/onboarding interruption and retry, logged-out entry, Home navigation, loading/empty/error states and reachable primary routes. Once authenticated, traverse project → milestone → assignment using the B fixture and assert actual content and allowed actions, not just screen titles.

Core: Close reproducible data-loss/account-boundary defects found by these batches, with fail-before tests.

Surface: Fix only concrete B-lane functional failures and missing stable test selectors. No speculative theme redesign.

Exit: One durable recording lifecycle batch and one app-entry/hierarchy batch have an executed result or exact blocker for every scheduled assertion.

### Batch 2 — 20:00 to 20:50 UTC: resources, storage and role isolation

A: Account changes/sign-out around pending work; old-account data must not appear, upload or continue resource deletion under the new account. Validate #734 on disposable fixture data if the supported UI permits it. Never delete existing user resources as a test. Include restart and offline transitions that materially affect ownership.

B: Populated Resources/catalogue → download → open/source playback → offline reopen → reconnect; empty and failed-download states; retry/cancel only where supported. Use authorized disposable data for deletion and assert the remaining items and storage/UI state.

Browser: Resolve missing role/fixture prerequisites once, then verify role assignments through supported UI.

Both: Cover each actual issue-derived role's allowed and denied actions using separately owned fixtures. qa-t1/qa-t2 identity is not itself proof of role semantics. Test multi-author boundaries without concurrent mutation of the same assignment.

Exit: Resource lifecycle and role/account safety have executable flows, observed results and explicit missing fixture/auth capabilities.

### Batch 3 — 20:50 to 21:40 UTC: sync failures and remaining workflow states

A: Observable sync progress, Pause/Retry/Cancel, interrupted upload and reconnect, preserving take identity and avoiding duplicate submission. Run only when a supported, authorized way to expose the transfer state is ready. Current offline/reconnect permission does not authorize bandwidth changes. Do not create giant recordings to manufacture a window.

B: Finish remaining project/milestone/assignment workflow, review/multi-author states and applicable role-specific actions from the existing ledger. Include navigation interruption, repeated action, failure/retry and cached/offline behavior where those change the requirement's outcome.

If A's transfer-window prerequisite remains unavailable, immediately consume the next runnable A gap or help execute B requirements. Keep mocked/integration failure tests useful but labeled as such, not Maestro/live proof.

Exit: Error/recovery coverage grows beyond happy paths; remaining blockers are specific dependencies, not repeatedly attempted exploration.

### Batch 4 — 21:40 to 22:30 UTC: remaining surfaces and affected visuals

B: Remaining settings/profile/account/navigation surfaces and the untested rows of the existing 13-surface map. Verify reachable settings entry, back/close behavior, persistence and theme switching. Compare actual screenshots for affected states against the agreed Lovable reference; matching token structure is not visual proof.

A: Execute previously blocked high-priority checks only when the prerequisite has materially changed, then run the highest-risk remaining ledger rows.

Legal: One final route/body/back smoke if affected by integration. Do not reopen the known #725 contradictory-copy loop.

Packaging: Continue issue-separated local branches and PR descriptions in parallel. Do not wait until the last twenty minutes to split commits.

Exit: Every major surface has an honest tested/failed/blocked/untested state, with evidence and its next concrete check.

### Final gate — 22:30 to 23:40 UTC: integrated regression, not new exploration

Integrate completed fixes, run static checks and existing combined sync/recording suites, then execute the full available Maestro suite split by device and independent fixture ownership. A owns recording/sync/account-safety flows; B owns app entry/hierarchy/resources/settings/role flows. Use the same final application revision.

Run all shipped variants at least once against that revision. Require a second clean execution for newly added nondeterministic lifecycle/offline/recovery paths; a flaky rerun does not erase the first failure. Investigate failures, apply authorized repairs and rerun affected suites. Do not count skipped, authored-only or setup-failed flows as passes.

No new speculative audio/gRPC tooling, emulator provisioning, broad refactor or report churn. Remaining already-runnable acceptance work can continue while independent regression runs.

### 23:40 to 00:00 UTC: truthful closeout

Preserve all takes, restore the primary account/network/device state, capture final results, finish issue branch separation and update the existing report once. State the exact verified scope, known defects, unexecuted scope and blockers. If any required row or compound group is unaccounted for, say the full audit is incomplete.

## 5. Blocker handling and dependencies

Matt’s ongoing execution preference: assign each blocked check a separate owner and exact dependency while both device owners advance runnable queue work. Retry a blocked check only after materially new evidence or a concrete correction. Never weaken assertions or safety constraints to obtain a pass.

- Guest connectivity gates server-dependent work, not cached/offline/local UI tests.
- Fresh authentication gates authenticated B work, not logged-out flows or harness authoring.
- A populated catalogue fixture gates resource lifecycle proof, not other surfaces.
- An observable authorized transfer window gates live mid-upload assertions. Request the precise approval only if a ready supported method needs it; do not wait idly for it.
- Independent server agreement remains blocked until a supported authenticated metadata/readback interface is available. Host health, an app acknowledgement and a local DB row are not independent server proof. No secret extraction or unsupported API.
- Decodable audio with nonzero digital signal is not audible playback proof. If no ready deterministic input/output route exists, retain that gap and move on.
- Android Back gestures are not drawer gestures. Do not repeat them as drawer testing.

For an unchanged blocker, capture the exact prerequisite once and move to the next queue item. Retry after new evidence, changed prerequisites or an actual repair, not merely because another turn began. A short diagnostic timebox is for switching useful work, not for declaring the blocked requirement complete.

## 6. Completion gates and evidence

A requirement is complete only when the issue/comment-derived acceptance criterion, applicable role/state/error/offline/recovery behavior, durable Maestro flow, successful executed run and evidence all agree. Pure service invariants can have focused tests, but those do not satisfy a user-visible E2E requirement alone.

Each result needs: requirement/issue ID, role, fixture, state, device serial, app revision, flow/command, outcome and evidence location. Newly fixed defects need fail-before and pass-after proof at the relevant level. Preserve first failures and flake diagnostics. Do not conflate implemented, unit-tested, live-verified and repeatably E2E-verified.

At 20:00 and 21:40, publish completed requirement counts, newly covered surfaces and blocker changes. Estimate remaining time from measured batch throughput and remaining complexity. Do not infer deadline feasibility from the 86-row subset or raw Maestro command counts.

Full completion requires disposition of the entire audited candidate scope, decomposition of applicable compound groups, and no unresolved required acceptance coverage. The 00:00 checkpoint must show the gap if that standard is not reached.

## 7. Fix/PR discipline, costs and communication

- One issue per local branch/patch/PR packet. Keep #734 independent. For #730/#731, preserve the original shared commit on a recovery ref; split hunks and their regression tests in an isolated packaging worktree, validate each issue branch and the recombined result, and record any unavoidable dependency. Do not reset or rewrite the active integration checkout while devices run.
- Search for an existing matching issue before filing a duplicate. Use only mattrace-gloo. No push, published PR or merge until explicitly authorized; prepare reviewable local branches and draft descriptions now.
- Cursor usage is optional, not a reason to duplicate work. Cheap mechanical work for repetitive test/metadata edits, Sonnet for diagnosis, Opus High only for a genuinely new design decision. This plan does not need another design pass. Stop a usage bucket before exceeding the user's 40% ceiling; refresh usage sparsely at meaningful boundaries.
- Report meaningful batch completions, material blockers and final results promptly. No one-assertion updates and no repeated PDF replacement. If a batch runs long, say what is complete and what remains.

Immediate instruction: execute Batch 0 now, then consume this queue in order. Only safety, a verified dependency, a newly found critical defect or the user's changed instruction may reorder it. Record the reason once and continue; do not redesign the plan after each test.


### Current recording preservation baseline (V7 postflight)

Preserve all seven owner10 takes: four uploaded and three pending at V7 postflight.
Read the current device state before every admission; six-take guards are historical
and must not authorize new work. Verse7 is now populated and is not an empty capture
fixture. Keep the original six metadata/file-hash receipts and all earlier failures.
The guest runtime revision remains unattested.
