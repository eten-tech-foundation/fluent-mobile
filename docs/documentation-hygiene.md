# Documentation hygiene

Canonical map of every Markdown file under `docs/` as of the #717 dirty tree
(inventory date 2026-10-19; **33** files). **Preserve history — do not delete docs.**
Move authority by labeling status and linking successors.

## Audit allocation (historical — not permanent edit locks)

The Process / Ops / Product columns below record **who audited which files in the
2026-10-19 hygiene pass**. They are **not** permanent ownership locks. After
writers freeze, further edits follow normal ticketed PR process and supervisor
routing. Findings on files outside this process lane go to the supervisor —
no silent cross-edits.

| Audit lane (this pass) | Files covered in that lane |
| --- | --- |
| Process / hygiene | [README.md](./README.md), [issue-tracking.md](./issue-tracking.md), [documentation-hygiene.md](./documentation-hygiene.md), [guides/dependabot-process.md](./guides/dependabot-process.md), [guides/dependabot-resolution-log.md](./guides/dependabot-resolution-log.md), [guides/expo-first-dependencies.md](./guides/expo-first-dependencies.md), [guides/figma-to-component.md](./guides/figma-to-component.md), [guides/project-board.md](./guides/project-board.md) |
| Timing Ops | [AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md), [ci.md](./ci.md), [guides/maestro.md](./guides/maestro.md), [guides/maestro-role-coverage.md](./guides/maestro-role-coverage.md), [guides/qa-process.md](./guides/qa-process.md), [guides/qa-preview-testing.md](./guides/qa-preview-testing.md), [guides/qa-multi-account-nightly.md](./guides/qa-multi-account-nightly.md), [guides/local-development-workflow.md](./guides/local-development-workflow.md) |
| Contract Product | [product-behavior/](./product-behavior/) (all), [guides/api-client-standard.md](./guides/api-client-standard.md), [guides/recordings-sync-contract.md](./guides/recordings-sync-contract.md), [guides/pericope-set-bundling.md](./guides/pericope-set-bundling.md), [guides/ui-version-theming.md](./guides/ui-version-theming.md), [features/](./features/), [assessments/](./assessments/) |

Root [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), and [README.md](../README.md) were **read-only for this lane** — flag contradictions; do not weaken rules.

## Status labels

| Label | Meaning |
| --- | --- |
| **current** | Active operational / process authority for agents or humans |
| **operational** | How-to / CI / Maestro / QA runbooks |
| **historical** | Assessment / audit snapshot; keep for trail |
| **design** | Design notes / mockups; not process law |
| **living-product** | Product behavior guide (labels inside those files govern AC vs inference) |

## Full inventory (33 files)

| # | Path | Audit lane | Status | Source authority (this pass) |
| ---: | --- | --- | --- | --- |
| 1 | [README.md](./README.md) | Process | current | Canonical docs index |
| 2 | [documentation-hygiene.md](./documentation-hygiene.md) | Process | current | Inventory + ledger |
| 3 | [issue-tracking.md](./issue-tracking.md) | Process | current | Project 4 + PR `Refs`; Status list **not re-verified live** |
| 4 | [guides/project-board.md](./guides/project-board.md) | Process | current | Aligns with `project-board.mdc` |
| 5 | [guides/dependabot-process.md](./guides/dependabot-process.md) | Process | current | Aligns with `dependabot-workflow.mdc` |
| 6 | [guides/dependabot-resolution-log.md](./guides/dependabot-resolution-log.md) | Process | log | Historical batches |
| 7 | [guides/expo-first-dependencies.md](./guides/expo-first-dependencies.md) | Process | current | Aligns with `expo-first-dependencies.mdc` |
| 8 | [guides/figma-to-component.md](./guides/figma-to-component.md) | Process | operational | Figma → Next UI |
| 9 | [AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md) | Ops | operational | SourceAudio architecture (L13); 5-step gate order (L106); F1/F2 closed 17:14 Ops |
| 10 | [ci.md](./ci.md) | Ops | operational | CI / two clocks |
| 11 | [guides/maestro.md](./guides/maestro.md) | Ops | operational | Session-risk before smoke; preserved path |
| 12 | [guides/maestro-role-coverage.md](./guides/maestro-role-coverage.md) | Ops | operational | Checklist; **0** live grants |
| 13 | [guides/qa-process.md](./guides/qa-process.md) | Ops | current | Needs QA / nightly |
| 14 | [guides/qa-preview-testing.md](./guides/qa-preview-testing.md) | Ops | operational | Install nightly |
| 15 | [guides/qa-multi-account-nightly.md](./guides/qa-multi-account-nightly.md) | Ops | operational | Multi-account nightly |
| 16 | [guides/local-development-workflow.md](./guides/local-development-workflow.md) | Ops | operational | Dev vs Docker API |
| 17–19 | [product-behavior/](./product-behavior/) | Product | living-product | User-guide home; #721; empty UI ≠ 403 |
| 20–23 | api-client / recordings-sync / pericope / ui-version guides | Product | current | Contract guides; audio pin **4336602** |
| 24–25 | [features/](./features/) | Product | design/historical | Historical notices applied |
| 26–33 | [assessments/](./assessments/) (8 Markdown files) | Product | historical | Historical notices; matrices preserved |

## Pins (GitHub API verified unchanged as of this pass — **not** deploy proof)

fluent-api `main` `4336602df77ce86a4d46dfd45a7840cc3c64ebc0` · fluent-web `main` `fb146999c051fce552417356613a20831a46b773`. Prior recordings-sync pin `34375d76…` retained as **superseded provenance** only.

## QA / Maestro evidence boundaries

| Claim | Status |
| --- | --- |
| Tabs 484 agent debug | PASS — **not** Nightly signoff |
| Tabs assertion/nav span | **10.761s** (`commands.json`) |
| Tabs CLI wall | ~**27s** — distinct metric |
| Resources 484 empty copy | Valid empty UI; **no HTTP 403 conclusion**; expansion untested |
| Sync one-press | FAIL retained — [#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721); cause unknown |
| Live grant allow/deny | **0** |

## Review ledger (FINAL after Product 17-file + Ops 8-file release)

| ID | Status | Notes |
| --- | --- | --- |
| R1 | **Resolved** | Ops: session-risk **before** broad smoke; preserved manual path (no global reset/auth fallback) |
| R4 | **Resolved** | **10.761s** assertion/nav vs ~**27s** CLI wall |
| R5 | **Pass (Product release)** | Empty UI ≠ 403; mocks labeled; Nightly ≠ agent debug |
| R6 | **Mitigated** | Status list date-qualified + unverified live |
| R7 | **Pass (Product release)** | Assessment + feature historical notices; matrices preserved; #559 supersession annotated |
| Product set | **Released** | Contract 17-file receipt 17:11 |
| Ops AGENT_ONBOARDING + local-dev | **Released** | FINAL 17:14 — F1/F2 closed; 5-step gate order verified |
| Independent review | **Closed** | All three Auto writers idle; no further broad audit this lane |

### Findings closure (Ops FINAL 17:14 — read-only confirm)

| ID | Status | Evidence |
| --- | --- | --- |
| **F1** | **Closed** | Lint table no longer claims “1 warning unused `db`”; L93 is plain ESLint purpose |
| **F2** | **Closed** | L13 is `SourceAudioShell` + `useSourceAudio` architecture (paths exist); not a #235 TODO intro |
| Gate order | **Pass** | L106: `format:check` → `lint` → `architecture-guard` → `typecheck` → `npm test -- --ci` matches `commands.mdc` |
| Local Dev Metro/session | **Pass** | `local-development-workflow.md` L16: Metro inlines API URL; restart after host change; **do not** clear user10 QA session unless owner asks |
| **F3** | Open/optional | Assessment “pending merge” footers remain dated snapshot text only |

**Review closed.** Process / Ops / Product hygiene writers idle for this audit. No further broad inventory.

### Pass checks (source claims, not headers only)

| Check | Result |
| --- | --- |
| QA-first warning before broad smoke | **PASS** — `maestro.md` blockquote before smoke example |
| Preserved manual path (no clearState/login/warm-session) | **PASS** — numbered narrow path + abort if login visible |
| Empty Resources UI ≠ HTTP 403 | **PASS** — product-behavior + assessments viewing-resources banner |
| Roles vs grants; pins | **PASS** — roles doc @ 4336602 / fb14699; live grants 0 |
| Mock vs Nightly | **PASS** — explicit agent debug ≠ Nightly throughout Product/Ops |
| Historical notices preserve matrices | **PASS** — 8 assessment Markdown files (7 READMEs + 1 ticket.md) + feature design notices |
| recordings-sync pin 34375→4336602 | **PASS** — current pin + historical row retained |
| #559 merged supersession | **PASS** — returning-online-and-sync annotated |

## Process-lane claim scope

Owned process docs: path/script presence and alignment with canonical sources
(`.cursor/rules/{delivery,project-board,dependabot-workflow,expo-first-dependencies}.mdc`,
`.claude/commands/*`, PR templates, `project-board-cli.cjs`) **verified** on disk.
**Not revalidated this pass:** live Project 4 Status column names, live Dependabot
open-PR queue, or Figma file/node URLs.

## Static verification (commands not executed)

Command/template/CLI/skill paths and npm script **names** present on disk. Lint was **not** re-run; F1 is a static source vs doc-string check only.

**No 100% documentation-accuracy claim.** Device work out of scope; user10 session preserved by this lane.
