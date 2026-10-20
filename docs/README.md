# Docs directory structure

This repo follows the Fluent-wide docs convention. See
[the spec](https://github.com/eten-tech-foundation/fluent-platform/blob/main/docs/features/docs-directory-structure/design.md)
in fluent-platform for the full rationale.

Hygiene map (ownership, status, evidence boundaries):
[documentation-hygiene.md](./documentation-hygiene.md).

## Folders

- `product-behavior/` — **living product / user-guide home** (how the app
  should work). Start at [product-behavior/README.md](./product-behavior/README.md).
  Not Maestro runbooks; not “code is the contract.”
- `features/<slug>/` — everything about one feature or initiative:
  `proposal.md`, `design.md`, `plan.md`, `tickets/`, `design/` (mockups).
  Only the stages that exist are present.
- `assessments/<feature-name>/` — feature audit assessments from the Mobile
  Feature Audit epic (#526): matrix results, Phase 7 reports, and gap task
  docs under `tickets/`. **Historical** — keep for trail.
- `runbooks/` — operational procedures (deploys, rollbacks, hotfixes). Not
  currently used in this repo, but part of the shared convention.
- `guides/` — process/how-to docs not tied to one feature.
- `tasks/` — standalone dated work items with no parent feature.
- Loose files at the root of `docs/` — repo-wide reference docs
  (includes `AGENT_ONBOARDING.md`, `ci.md`, `issue-tracking.md`,
  `documentation-hygiene.md`).

## Canonical index (all docs Markdown)

| Path | Kind | Start here when… |
| --- | --- | --- |
| [product-behavior/README.md](./product-behavior/README.md) | living-product | You need product behavior / roles / core flows |
| [product-behavior/roles-and-permissions.md](./product-behavior/roles-and-permissions.md) | living-product | Grants vs chapter slots |
| [product-behavior/core-flows.md](./product-behavior/core-flows.md) | living-product | User-facing core flows |
| [issue-tracking.md](./issue-tracking.md) | current | Project 4 board, branches, PR `Refs` |
| [guides/project-board.md](./guides/project-board.md) | current | Board mutation hard rules |
| [guides/qa-process.md](./guides/qa-process.md) | current | Needs QA? / post-merge nightly |
| [guides/qa-preview-testing.md](./guides/qa-preview-testing.md) | operational | Install nightly / preview APK |
| [guides/qa-multi-account-nightly.md](./guides/qa-multi-account-nightly.md) | operational | Multi-account nightly |
| [guides/maestro.md](./guides/maestro.md) | operational | Maestro harness |
| [guides/maestro-role-coverage.md](./guides/maestro-role-coverage.md) | operational | Role checklist (not live grant proof) |
| [AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md) | operational | Agent / contributor onboarding map |
| [ci.md](./ci.md) | operational | CI workflows / two clocks |
| [guides/local-development-workflow.md](./guides/local-development-workflow.md) | operational | Hosted Dev vs local Docker API |
| [guides/dependabot-process.md](./guides/dependabot-process.md) | current | Dependabot merge process |
| [guides/dependabot-resolution-log.md](./guides/dependabot-resolution-log.md) | log | Dependabot resolution history |
| [guides/expo-first-dependencies.md](./guides/expo-first-dependencies.md) | current | Prefer Expo SDK packages |
| [guides/figma-to-component.md](./guides/figma-to-component.md) | operational | Figma → Next UI components |
| [guides/api-client-standard.md](./guides/api-client-standard.md) | current | API client contract |
| [guides/recordings-sync-contract.md](./guides/recordings-sync-contract.md) | current | Recordings / sync contract |
| [guides/pericope-set-bundling.md](./guides/pericope-set-bundling.md) | current | Pericope bundling |
| [guides/ui-version-theming.md](./guides/ui-version-theming.md) | current | UI version / theming |
| [documentation-hygiene.md](./documentation-hygiene.md) | current | Full inventory + ownership |
| [features/next-ui-redesign/theme-figma-audit.md](./features/next-ui-redesign/theme-figma-audit.md) | design/historical | Theme Figma audit |
| [features/record-tab/design/README.md](./features/record-tab/design/README.md) | design | Record tab design |
| [assessments/…](./assessments/) (8 README/ticket files) | historical | #526 feature audits |

## Dev vs QA (do not conflate)

| Lane | API | Notes |
| --- | --- | --- |
| Dev | `https://dev.api.fluent.bible` | Engineering / historical emulator receipts |
| QA | `https://qa.api.fluent.bible` | Nightly / `qa.app.fluent.bible`; Maestro via `scripts/maestro-test-qa.sh` + `.env.maestro.qa` only |

Agent debug Maestro results (e.g. Tabs PASS on a preserved QA session) are **not** human Nightly signoff. Sync one-press miss cause remains open ([#721](https://github.com/eten-tech-foundation/fluent-mobile/issues/721)).

## Writing new docs

Brainstorming / writing-plans skill output goes under `docs/features/<slug>/`,
not a skill default `docs/superpowers/...` path. Prefer updating an owned
canonical file over inventing a parallel guide.
