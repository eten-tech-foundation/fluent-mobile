# Documentation hygiene

Canonical map of every Markdown file under `docs/` (inventory date 2026-10-23;
**43** files). **Preserve history — do not delete docs.** Move authority by
labeling status and linking successors. Update this inventory when you add,
move, or retire a doc.

Root [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), and
[README.md](../README.md) are outside this inventory; flag contradictions with
them rather than weakening their rules.

## Status labels

| Label | Meaning |
| --- | --- |
| **current** | Active operational / process authority for agents or humans |
| **operational** | How-to / CI / Maestro / QA runbooks |
| **historical** | Assessment / audit snapshot; keep for trail |
| **design** | Design notes / mockups / working drafts; not process law |
| **living-product** | Product behavior guide (labels inside those files govern AC vs inference) |
| **log** | Append-only history |

## Full inventory (43 files)

| # | Path | Status | Notes |
| ---: | --- | --- | --- |
| 1 | [README.md](./README.md) | current | Canonical docs index |
| 2 | [documentation-hygiene.md](./documentation-hygiene.md) | current | This inventory |
| 3 | [issue-tracking.md](./issue-tracking.md) | current | Project 4 + PR `Refs`; Status list **not re-verified live** |
| 4 | [AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md) | operational | Agent / contributor map; gate order matches `commands.mdc` |
| 5 | [ci.md](./ci.md) | operational | CI / two clocks |
| 6–8 | [product-behavior/](./product-behavior/README.md) (3 files) | living-product | User-guide home; #721; empty UI ≠ 403 |
| 9 | [guides/project-board.md](./guides/project-board.md) | current | Aligns with `project-board.mdc` |
| 10 | [guides/dependabot-process.md](./guides/dependabot-process.md) | current | Aligns with `dependabot-workflow.mdc` |
| 11 | [guides/dependabot-resolution-log.md](./guides/dependabot-resolution-log.md) | log | Historical batches |
| 12 | [guides/expo-first-dependencies.md](./guides/expo-first-dependencies.md) | current | Aligns with Cursor/Claude expo-first adapters + `AGENTS.md` |
| 13 | [guides/figma-to-component.md](./guides/figma-to-component.md) | operational | Figma → Next UI |
| 14 | [guides/maestro.md](./guides/maestro.md) | operational | Maestro harness |
| 15 | [guides/qa-process.md](./guides/qa-process.md) | current | Needs QA / nightly |
| 16 | [guides/qa-preview-testing.md](./guides/qa-preview-testing.md) | operational | Install nightly |
| 17 | [guides/qa-multi-account-nightly.md](./guides/qa-multi-account-nightly.md) | operational | Multi-account nightly |
| 18 | [guides/local-development-workflow.md](./guides/local-development-workflow.md) | operational | Dev vs Docker API |
| 19–22 | api-client / recordings-sync / pericope / ui-version guides | current | Engineering contract guides |
| 23–28 | [features/next-ui-redesign/](./features/next-ui-redesign/README.md) (6 files) | design/historical | Working drafts + dated Lovable / Figma reviews |
| 29 | [features/record-tab/design/README.md](./features/record-tab/design/README.md) | design | Historical notice applied |
| 30 | [assessments/README.md](./assessments/README.md) | historical | Assessment index; #717 ledger archive pointer |
| 31–38 | [assessments/](./assessments/README.md) #526 audits (7 READMEs + 1 ticket) | historical | Matrices preserved |
| 39–43 | [assessments/maestro-acceptance-coverage/](./assessments/maestro-acceptance-coverage/) (5 files) | historical | #717 Maestro procedures + run evidence; files listed in [assessments/README.md](./assessments/README.md) |

The full #717 Maestro acceptance ledger is **not** on `main`; see
[assessments/README.md](./assessments/README.md#maestro-acceptance-ledger-717).

## Pins (GitHub API verified 2026-10-19 — **not** deploy proof)

Pins were verified before the 2026-10-23 inventory above and were not re-checked then.

fluent-api `main` `4336602df77ce86a4d46dfd45a7840cc3c64ebc0` · fluent-web `main`
`fb146999c051fce552417356613a20831a46b773`. Used by
[product-behavior/](./product-behavior/README.md).

## QA / Maestro evidence boundaries

| Claim | Status |
| --- | --- |
| Agent emulator Maestro PASS | Engineering receipt — **not** Nightly signoff |
| Maestro command span vs CLI wall time | Distinct metrics; do not quote one as the other |
| Empty Resources UI | Valid empty UI; **no HTTP 403 conclusion** without a transport receipt |
| Sync one-press | Open — [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721); cause unknown |
| Live grant allow/deny verified on device | **0** |

**No 100% documentation-accuracy claim.** Commands, paths, and script names
were checked on disk; live Project 4 Status names, the Dependabot queue, and
Figma node URLs were not revalidated.
