---
name: sync-claude-primitives
description: >-
  Audit and update this repo's Claude/agent configuration primitives so they stay in
  sync with the actual state of the codebase. Use this whenever the user wants to
  refresh, audit, update, or "catch up" their Claude config, skills, agents,
  commands, CLAUDE.md, AGENTS.md, docs, or .cursor bridge after architecture / CI /
  config / dependency churn — even if they only say "our agent setup is probably
  stale", "make sure the agents are up to date", or "audit our claude primitives".
  Detects drift by diffing recently merged PRs + Project 4 + the codebase against
  what the primitives claim, has an independent subagent verify every finding,
  presents each proposed change for per-change approval, then applies approved
  edits and opens a PR.
---

# Sync Claude Primitives

Keep fluent-mobile's agent configuration honest. Architecture, CI, tooling, and
dependencies drift; the primitives that describe them — skills, agents, commands,
`CLAUDE.md`, `AGENTS.md`, docs — rot until an agent reads a stale instruction.
This skill finds that rot, proves it's real, and fixes it with the user in
control of every edit.

## Operating principles

- **Read-only until the user approves.** Phases 1–4 never modify a file. The only
  writes happen in phase 5, applying edits the user explicitly selected.
- **Every finding is evidence-based.** A claim is "stale" only when you can cite
  the primitive's `file:line` AND the source-of-truth `file:line` that contradicts
  it. No vibes.
- **Verify before you show.** An independent subagent re-checks each finding
  against the live codebase before it reaches the user.
- **Degrade gracefully.** Missing `gh`, no project board, first run, shallow
  clone — all expected. Fall back, note what you skipped, keep going.

## Target model — two classes of file

### EDIT targets — primitives that get audited and updated

These describe the app. When they disagree with reality, *they* are wrong.

- `.claude/skills/*/SKILL.md`
- `.claude/agents/*.md`
- `.claude/commands/*.md`
- Root `CLAUDE.md` and `AGENTS.md`
- `docs/*.md` and `docs/guides/*.md`
- Nested `src/**/AGENTS.md`
- Convention / onboarding scripts: `scripts/*architecture*`, `scripts/*claude*`,
  `.cursor/hooks/*`
- **`.cursor/`**
  - `.cursor/commands/*.md` — **parity shims** only (must point at
    `.claude/commands/*`; no duplicated logic)
  - `.cursor/rules/*.mdc` — always-on contract; audit for drift vs
    `package.json` / workflows / docs
  - `.cursor/templates/pr-template.md` and `.github/PULL_REQUEST_TEMPLATE.md`
    (keep these two identical)

### SOURCE-OF-TRUTH inputs — read-only "reality" side, NEVER edited

- `package.json` (scripts, deps, engines), `app.config.ts`, `eas.json`
- `tsconfig.json`, ESLint config, `jest.config.cjs`, `babel.config.js`
- `.github/workflows/*.yml`, `.github/dependabot.yml`
- `src/` layout (architecture claims)

> Before relying on this list, glob the repo — if you find another file that
> clearly encodes agent state, treat it as an EDIT target and tell the user.

## State file — `.claude/.config-sync-state.json`

Committed so the team can see when the last sync ran. Shape:

```json
{
  "lastSyncedSha": "<commit SHA the last sync covered through>",
  "lastSyncedAt": "<ISO timestamp>",
  "lastRunBy": "<git user.name>",
  "notes": "<optional one-line summary of last run>"
}
```

If the file is absent (first run), treat it as such (see phase 1).

## The workflow

Track these as five todos so you don't skip verification or approval gates.

### Phase 1 — Detect the change window

1. Read `.claude/.config-sync-state.json`. If present, the window is
   `lastSyncedSha..HEAD`. If absent, fall back to roughly the last 20 merged
   PRs / ~30 days — and say so.
2. Gather what changed, each step degrading gracefully:
   - **Merged PRs:** `gh pr list --state merged --base main --limit 50
     --json number,title,mergedAt,labels,url` then filter to the window.
   - **Project board:** org Project **4** (Fluent Mobile Board). If `gh project`
     errors, skip and note that.
   - **Raw diff:** `git diff --stat <sha>..HEAD` and `git log --oneline <sha>..HEAD`.
3. Summarize the window for the user in 3–6 lines before auditing.

### Phase 2 — Audit (read-only)

Walk every EDIT target against the SOURCE-OF-TRUTH inputs and the phase-1 diff.
Hunt **three** finding types deliberately (run contradiction and gap as separate
passes):

**Type A — Contradiction** (a primitive states something now false):
- Version / dependency claims vs `package.json`, `app.config.ts`
- Command / script names vs `package.json` scripts and `.github/workflows`
- File paths that moved or were deleted
- Conventions that changed
- Removed/renamed primitives leaving dangling `.cursor` shims or bridge-rule lists

**Type B — Gap** (a primitive *should* teach something new but is silent):
For each merged PR / done board item, ask: "did this introduce a convention,
helper, script, env var, or pattern that a future agent would need — and does
any primitive actually say so?"

**Type C — Opportunity** (a net-new primitive is worth creating):
- A repeated multi-step flow that could be a command/skill
- Bar: used repeatedly, encodes non-obvious repo-specific knowledge, prevents a
  real mistake. Reject anything a base model handles fine.

Emit structured findings tagged by type (contradiction / gap / opportunity)
with `target_file`, evidence, and a proposed edit.

Dispatch parallel explore subagents by target group. Keep raw file dumps out of
the main context.

### Phase 3 — Independent verification

Hand the full findings list to a fresh review subagent (`.claude/agents/code-reviewer.md`
or `general-purpose`) whose ONLY job is to refute each finding against the live
codebase. Drop anything it can't confirm.

### Phase 4 — Present and approve (per-change)

Present numbered `[fix]` (contradiction) and `[add]` (gap) diffs. Then a
separate **Opportunities** section. Ask the user to pick which numbered changes
to apply. Default to applying nothing they didn't select. Wait for their
selection.

### Phase 5 — Execute and open a PR

1. Create a ticketed branch via `/create-pr-branch` (or `/start-issue` if the
   user named an issue). Do not invent a branch off `main` without a ticket.
2. Launch an **execution subagent** given ONLY the approved findings. It applies
   each edit precisely and reports back.
3. Update `.claude/.config-sync-state.json` with the new `HEAD` SHA, timestamp,
   `lastRunBy` (`git config user.name`), and a one-line note.
4. Sanity-check: `git diff` matches the approved set; run
   `npm run format:check`, `npm run lint`, `npm run typecheck`,
   `npm test -- --ci` if scripts or config files were touched.
5. Chain into `/create-pr` (`.claude/commands/create-pr.md`). Include
   `Refs #<issue>` — never closing keywords.

## Notes

- PRs target **`main`**. Package manager is **npm**. Android-only.
- If the change window is empty (already in sync), say so and stop — don't
  manufacture edits to look busy.
