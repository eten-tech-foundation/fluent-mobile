# Audit mode (Fluent Maestro)

## Default meaning of “audit #NNN”

```text
Use #NNN as source material → inspect implementation → run/observe tests → report locally.
```

It does **not** mean update #NNN, create follow-ups, open a PR, comment, or move the board.

Hard gate: [`.cursor/rules/maestro-qa.mdc`](../../../../.cursor/rules/maestro-qa.mdc).

## Audit vs implement

| Mode | Do | Don’t |
| --- | --- | --- |
| Audit | Read issue, code, flows; run Maestro; classify; report | Product fixes; silent assertion rewrites; GitHub publish |
| Implement (explicit) | Local product/test changes in scope | Remote publish unless separately asked |

Discovering a bug, weak selector, or missing coverage during an audit → **report first**. Do not quietly turn audit into a refactor.

## Contract before the test

Before encoding expected behavior:

1. Relevant issue / product requirement  
2. Current implementation  
3. Related recent PRs when relevant  
4. Existing Maestro / unit tests  
5. Compare intended vs actual  

If issue, code, newer PRs, and flows **disagree**, stop and classify. Do **not** silently rewrite the test to whichever side currently passes.

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

## Local finding format

```text
Finding: …
Evidence: …
Suggested follow-up: Create an issue to … (draft body optional, local only)
No GitHub changes made.
```

Only create the GitHub issue after the user asks for that specific action.

## Report semantics (coverage vs product)

Separate three axes in the final chat report:

1. **Product findings** — PASS / FAIL (with class) for scenarios actually observed  
2. **Executed coverage** — how many planned scenarios completed vs BLOCKED / UNTESTED  
3. **Infrastructure confidence** — healthy / degraded / recovered  

`Pass with gaps` is appropriate when coverage is sufficient and remaining gaps are known product issues or intentional out-of-scope items.

If important scenarios were **attempted but harness-blocked**, prefer interim wording, e.g.:

```text
Interim result: observed behavior matches shell contract except one PRODUCT failure;
two scenarios remain BLOCKED by test infrastructure after recovery budget exhausted.
```

Do not let “Pass with gaps” hide “we could not test X because Maestro died.”

## Continue after BLOCKED

A single infrastructure-blocked scenario must not truncate the audit. Keep running independent scenarios. Preserve workarounds as labeled workarounds only.

## No unnecessary permission prompts

Do not ask the user to “re-auth Maestro” or “say if I should continue” after an authorized audit hits MCP `UNAVAILABLE`. Recover per [recovery.md](./recovery.md). If still blocked, report BLOCKED with recovery attempts and continue.

## Context compaction

Do not rely on chat history for bring-up. Re-read this skill’s [environment.md](./environment.md) and [recovery.md](./recovery.md), run `npm run maestro:doctor`, and re-prove `inspect_screen` after compaction or a new session.
