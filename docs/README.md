# Docs directory structure

This repo follows the Fluent-wide docs convention. See
[the spec](https://github.com/eten-tech-foundation/fluent-platform/blob/main/docs/features/docs-directory-structure/design.md)
in fluent-platform for the full rationale.

- `features/<slug>/` — everything about one feature or initiative:
  `proposal.md`, `design.md`, `plan.md`, `tickets/`, `design/` (mockups).
  Only the stages that exist are present.
- `runbooks/` — operational procedures (deploys, rollbacks, hotfixes). Not
  currently used in this repo, but part of the shared convention.
- `guides/` — process/how-to docs not tied to one feature.
- `tasks/` — standalone dated work items with no parent feature.
- Loose files at the root of `docs/` — repo-wide reference docs
  (includes `AGENT_ONBOARDING.md`, `ci.md`, `issue-tracking.md`, which
  stay here rather than moving into `guides/` since they're heavily
  linked from agent entrypoints and read as repo-wide reference material).
