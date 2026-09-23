# Audit mode (Fluent Maestro)

## Default meaning of “audit #NNN”

```text
Use #NNN as source material → build scenario inventory → stabilize lab
→ execute every independent scenario → classify each PASS|FAIL|BLOCKED|SKIPPED
→ inspect existing coverage → search GitHub → suggest issues (local only) → report.
```

It does **not** mean update #NNN, create follow-ups, open a PR, comment, or move the board.

Hard gate: [`.cursor/rules/maestro-qa.mdc`](../../../../.cursor/rules/maestro-qa.mdc).

## Primary operating principle

Optimize for **maximum independent evidence** across the entire requested scope.

```text
Understand complete audit scope
→ Build scenario inventory
→ Stabilize environment
→ Execute scenario 1 → PASS or FAIL → record evidence
→ restore usable checkpoint if needed
→ Execute scenario 2 → …
→ Every planned scenario has a terminal status
→ Analyze findings → propose GitHub issues (suggestions only)
→ Final report with exact counts
```

**NOT:** Scenario 1 fails → spend the rest of the audit only on that failure → never run scenarios 2–N.

```text
FAILURE FOUND  ≠  AUDIT FINISHED
FINDING DISCOVERED  ≠  CREATE GITHUB ISSUE
```

## Audit vs implement

| Mode | Do | Don’t |
| --- | --- | --- |
| Audit | Read issue, code, flows; run Maestro; classify; report; suggest issues locally | Product fixes; silent assertion rewrites; GitHub publish |
| Implement (explicit) | Local product/test changes in scope | Remote publish unless separately asked |

Discovering a bug, weak selector, or missing coverage during an audit → **report first**. Do not quietly turn audit into a refactor.

## Contract before the test

Before encoding expected behavior:

1. Relevant issue / product requirement  
2. Current implementation  
3. Related recent PRs when relevant  
4. Existing Maestro / unit tests  
5. Compare intended vs actual  

If issue, code, newer PRs, and flows **disagree**, classify. Do **not** silently rewrite the test to whichever side currently passes.

### Worked example: Bible unit → Record

- **Contract (#47 / DraftingScreen):** tap Bible unit → select verse **and** open Record (`onOpenRecord`).  
- **Current `BibleTab`:** `_props` discarded; `handleUnitPress` only `setSelectedVerse` (+ pericope expand).  
- **Classification:** PRODUCT regression (or intentional change that never updated the shell contract) — **not** a green smoke.  
- **Continuing the suite:** manually tap `drafting-tab-record` to keep testing shared verse is a **workaround**, not a pass of the original scenario.

Required reporting shape:

```text
Bible unit tap → Record:
FAIL (PRODUCT)
Evidence: BibleTab handleUnitPress never calls onOpenRecord; DraftingScreen still passes the prop.

To continue testing shared verse state, the flow manually opened Record.

Shared verse after manual tab switch:
PASS
```

Never represent the workaround as proof that Bible tap opens Record.

## Scenario inventory (required)

At the **start** of an audit, create an internal inventory of behaviorally distinct scenarios from the feature contract (ownership/role states, stage states, online/offline/reconnect, persistence, failure/conflict, navigation). Prefer distinct states over meaningless combinatorial explosion. Add mid-audit discoveries that are in scope.

Each scenario must ultimately end as **exactly one** of:

| Status | Meaning |
| --- | --- |
| **PASS** | Behavior was exercised and matched the expected contract |
| **FAIL** | Behavior was exercised and contradicted the expected contract |
| **BLOCKED** | Attempted, but external/test-env/data limitation prevented a valid conclusion (infra after recovery budget, missing fixtures, backend down, connectivity uncontrollable) |
| **SKIPPED** | Deliberately not attempted with a justified reason (destructive shared-data mutation, out of scope / sibling audit, missing authorization) |

Never silently drop a planned scenario. Never finish with “didn't get to…”.

### Completion gate

An audit is **not** complete until every inventory row has PASS / FAIL / BLOCKED / SKIPPED.

Before the final report:

```text
Planned scenarios: N
PASS: X
FAIL: Y
BLOCKED: Z
SKIPPED: W
X + Y + Z + W must equal N
```

Use **exact** counts. Do not use `~6/10` when the inventory is known.

### Global-blocker rule

Only stop executing remaining scenarios when **all** reasonable remaining scenarios are prevented by the **same** unresolved blocker (app cannot launch after recovery budget, backend completely unavailable, emulator permanently unusable, credentials missing, every remaining scenario requires unsafe destructive mutation).

Even then: preserve evidence already collected; mark each remaining scenario BLOCKED or SKIPPED individually; explain the global blocker; do not pretend the audit was complete.

## HARD RULE: One product failure does not stop the audit

If an individual scenario fails:

1. Capture evidence (expected, actual, hierarchy/screenshot, related code/spec, repro steps).  
2. Classify (**PRODUCT** / **TEST** / **SELECTOR** / **STATE** / **ENVIRONMENT** / **MAESTRO INFRASTRUCTURE**).  
3. Decide whether it prevents **other** scenarios.  
4. If not → **continue** remaining independent scenarios.  
5. Return to deeper root-cause investigation later if it clarifies scope or other results.

A failed expectation is usually a **local** blocker, not a global one.

Example: Peer Check “assigned to another” missing Record warning → **FAIL** → record evidence → still run claim (if safe), conflict, navigation, list ownership, metadata refresh, other stages.

### Failure investigation budget

| Phase | Do |
| --- | --- |
| First pass | Enough evidence to establish the failure is real |
| Then | Continue testing the rest of the inventory |
| Later | Deeper diagnosis only if efficient and needed for scope/interpretation |

Broad evidence first; deep internals second. Do not let one bug consume the entire audit.

## Scenario independence and checkpoints

Minimize cascading failures. After a FAIL or infra blip:

1. Determine current app state  
2. Return to the nearest known checkpoint if needed  
3. Continue the next independent scenario  

Useful checkpoints: authenticated Home · My Work · project chapter list · drafting shell · Record tab · known chapter state.

Do **not** restart the whole environment after every failure. Recover the smallest necessary layer ([recovery.md](./recovery.md)). Prefer preserving authenticated session over `clearState`.

A recovered infrastructure failure does **not** invalidate already-observed product evidence. A product FAIL does **not** justify abandoning remaining coverage.

## Scope expansion (in-feature only)

Actively look for adjacent scenarios implied by the feature contract — not the entire app. Ask: meaningful states, transitions, roles/ownership, failure states, persistence, online/offline, destructive ops, stage-specific behavior. Prioritize behaviorally distinct states.

Coverage matrix (internal → expose a concise version in the report):

```text
Scenario                                 Status
------------------------------------------------
Draft + mine                             PASS
Peer Check + other                       FAIL
Online claim                             SKIPPED
Reconnect claim                          BLOCKED
…
```

## Safe destructive-testing policy

Some valid E2E scenarios mutate shared backend state (claim, release, conflict creation, reconnect mutations).

- Do **not** perform destructive shared-data ops without an approved safe mechanism.  
- Do **not** omit them forever: mark **SKIPPED** with the reason (e.g. “requires destructive assignment mutation against shared dev data”).  
- If important behavior repeatedly cannot be tested safely, call out **QA infrastructure debt** (dedicated E2E user/project, deterministic assignment fixtures). Suggest an issue — do **not** build fixtures automatically during an audit.

## Connectivity uncertainty

If app a11y reports Offline while host Wi‑Fi looks online, do **not** assume the intended online state. For connectivity-dependent scenarios: verify application-observed connectivity; wait briefly for stability when reasonable; otherwise **BLOCKED**. Do not claim online-claim was tested when the app said Offline.

## Existing automated coverage

Inspect both live behavior **and** existing automation:

| Ask | Report |
| --- | --- |
| Maestro | What domain smokes cover; what they omit |
| Unit / integration | What is proven in Jest only |
| Gaps | Important behavior with no E2E proof |
| Stale / weak | Obsolete contracts, weakened expectations, flaky selectors, duplicated coverage |

Unit coverage ≠ E2E behavior proof.

## Selector findings

Classify: **Acceptable** | **Weak** | **Missing**. Do not add `testID`s during an audit. Suggest a test-quality issue only when the selector problem materially hurts reliability — no spam for minor preferences.

## Proposed GitHub issues (suggestions only)

Every completed audit includes a **Proposed GitHub issues** section. Suggestions do **not** authorize mutation.

Before suggesting NEW:

1. Search existing GitHub issues (open and closed when relevant).  
2. Prefer linking an **EXISTING** issue over a duplicate.  
3. Prefer one coherent root-cause issue over one-per-symptom spam.

Classify each finding:

| Class | Use when |
| --- | --- |
| EXISTING ISSUE | Already tracked — cite number; do not file another |
| NEW PRODUCT ISSUE SUGGESTED | Confirmed product gap/bug |
| NEW TEST COVERAGE ISSUE SUGGESTED | Missing Maestro/unit coverage (may pair with product) |
| NEW QA INFRASTRUCTURE ISSUE SUGGESTED | Actionable project-owned lab/fixture debt |
| DOCUMENTATION / LOCAL IMPROVEMENT | Docs/skill only; optional |
| NO ISSUE NEEDED | External platform limit already documented (e.g. Cursor agent-shell CLI → MCP) |

Product bug and missing E2E coverage may both deserve suggestions — only when both are genuinely useful.

### Required format for each NEW suggested issue

```text
### Title
…

### Type
Product bug | Test coverage | QA infrastructure | Developer tooling | Documentation

### Why this deserves an issue
…

### Evidence
…

### Reproduction
…

### Expected
…

### Actual
…

### Acceptance criteria
- [ ] …

### Related issues
…

### Duplicate check
Searched: … | Existing cover: none / #NNN

### Suggested priority
Critical | High | Medium | Low
```

For EXISTING ISSUE findings:

```text
EXISTING ISSUE
#NNN — short title
Audit evidence: …
Recommendation: Add this reproduction/evidence to #NNN if the user chooses to update GitHub.
(Do not post the comment.)
```

End with a dedupe table, then ready-to-file drafts **only** for NEW suggested issues.

## Local finding format (mid-audit)

```text
Finding: …
Evidence: …
Suggested follow-up: … (optional; suggestion only)
No GitHub changes made.
```

## Final report structure (preferred)

Avoid “Pass with gaps” as the primary verdict. Prefer structured axes:

```text
## Product findings
…

## Coverage
Planned: N
Pass: X
Fail: Y
Blocked: Z
Skipped: W
(X + Y + Z + W = N)

## Scenario results
(matrix)

## Existing automated coverage
…

## Coverage gaps
…

## Selector quality
(only meaningful)

## Infrastructure
(recovered / unresolved)

## Proposed GitHub issues
(existing + suggested new)

## GitHub changes
None.

## Confidence
High | Medium | Low
(one or two sentences why)
```

Optional one-line summary afterward is fine; do not hide BLOCKED/SKIPPED behind a soft overall pass.

## Continue after BLOCKED or FAIL

A single infrastructure-blocked **or** product-failed scenario must not truncate the audit. Keep running independent scenarios. Preserve workarounds as labeled workarounds only.

## No unnecessary permission prompts

Do not ask the user to “re-auth Maestro” or “say if I should continue” after an authorized audit hits MCP `UNAVAILABLE`. Recover per [recovery.md](./recovery.md). If still blocked, report BLOCKED with recovery attempts and continue.

## Audit self-check (before finishing)

- [ ] Full meaningful scenario set identified?
- [ ] Every scenario PASS / FAIL / BLOCKED / SKIPPED?
- [ ] One early failure did not prevent unrelated testing?
- [ ] All independently executable scenarios continued?
- [ ] Product failures preserved (expectations not weakened)?
- [ ] Workarounds distinguished from passes?
- [ ] Failure classes separated (product/test/state/environment/infra)?
- [ ] Destructive scenarios handled safely (SKIPPED when needed)?
- [ ] Existing automated coverage inspected?
- [ ] Meaningful coverage gaps identified?
- [ ] GitHub searched before suggesting new issues?
- [ ] Duplicates avoided?
- [ ] Every NEW suggested issue has evidence + acceptance criteria?
- [ ] Zero GitHub mutations?
- [ ] Scenario counts exact and consistent?

If any answer is no → fix the report or continue the audit before finishing.

## Context compaction

Do not rely on chat history for bring-up. Re-read [environment.md](./environment.md) and [recovery.md](./recovery.md), run `npm run maestro:doctor`, and re-prove `inspect_screen` after compaction or a new session.
