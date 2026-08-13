### TLDR

<!-- 2–4 sentences: what changed, why, and impact. -->

### Reviewer checklist

- [ ] GitHub issue linked in Details (`Refs #NNN` — do **not** use `Closes` / `Fixes` / `Resolves`)
- [ ] How to verify steps completed or valid waiver noted below
- [ ] Acceptance criteria met, **or** unmet AC waived **in the issue** with linked follow-up (see `AGENTS.md`)
- [ ] Scope limited to this issue — no adjacent tickets implemented/stubbed without approval
- [ ] **Needs QA?** decided (see `docs/guides/qa-process.md`) — if yes: `preview-build` label added
- [ ] If QA-required: QA passed **this PR’s** preview build before merge (do **not** check until QA confirms; this is the device-QA gate when Needs QA? is Yes)
- [ ] Android device tested when required **and** Needs QA? is No — do **not** check unless verified on a device

### Details

Refs #<!-- issue number this PR implements -->

<!-- Short summary. For fixes: root cause + solution. -->

**Needs QA?**

- [ ] No — engineering-only (docs, CI, refactor, logging, etc.)
- [ ] Yes — UI / native / mic / camera / filesystem / sync / device verification (`preview-build` required)

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

<!-- Deferred AC must link follow-up issues (ticket-level waiver; see AGENTS.md). -->

- [ ] <!-- e.g. #NNN — deferred AC description -->
