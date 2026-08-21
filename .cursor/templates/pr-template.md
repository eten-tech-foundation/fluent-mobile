### TLDR

<!-- 2–4 sentences: what changed, why, and impact. -->

### Reviewer checklist

- [ ] GitHub issue linked in Details (`Refs #NNN` — do **not** use `Closes` / `Fixes` / `Resolves`; use `Refs: none` only for explicit no-ticket chores)
- [ ] How to verify steps completed or valid waiver noted below
- [ ] Acceptance criteria met, **or** unmet AC waived **in the issue** with linked follow-up (see `AGENTS.md`)
- [ ] Scope limited to this issue — no adjacent tickets implemented/stubbed without approval
- [ ] **Needs QA?** decided (see `docs/guides/qa-process.md`)

### Details

Refs #<!-- issue number this PR implements — or `Refs: none` for no-ticket chores -->

<!-- Short summary. For fixes: root cause + solution. -->

**Needs QA?**

- [ ] No — engineering-only (docs, CI, refactor, logging, etc.)
- [ ] Yes — post-merge nightly QA (see `docs/guides/qa-process.md`)

**Type of change:**

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation
- [ ] Maintenance / refactor

#### Technical changes

<!-- Key files — use **`path/to/file`** and bullets. Avoid nested ``` fences in PR bodies. -->

#### Testing

<!-- What you ran (`npm run lint`, `npm run typecheck`, `npm test -- --ci`, …) OR waiver + rationale. -->

### How to verify

<!-- Numbered steps for reviewers OR "Manual verification waived" + rationale. -->

1. <!-- e.g. npm run format:check && npm run lint && npm run typecheck && npm test -- --ci -->
2. <!-- manual / Android steps when behavior changed -->

**Expected:** <!-- What reviewers should confirm -->

### Follow-ups

<!-- Deferred AC → linked issues; otherwise "None". -->
