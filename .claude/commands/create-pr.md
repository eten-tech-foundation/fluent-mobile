---
description: Open a draft GitHub PR against main with the Fluent template, Refs #NNN, code-reviewer, Project 4 In PR Review, and CI watch to green. Never merge. /open-pr is an alias.
argument-hint: '[optional: targeted test path/pattern]'
---

# /create-pr — open a draft PR for fluent-mobile

You are opening a GitHub pull request for **fluent-mobile**. Proceed
autonomously — make sensible choices and report them. **Never merge.**

`/open-pr` is an alias of this command (same file).

**PR body:** Always fill [`.cursor/templates/pr-template.md`](../../.cursor/templates/pr-template.md)
(same sections as `/generate-pr-description`). Mandatory for every agent-opened
PR ([delivery.mdc](../../.cursor/rules/delivery.mdc)).

**Tracker:** Project 4 Fluent Mobile Board — [docs/issue-tracking.md](../../docs/issue-tracking.md).

## Critical repo facts you MUST enforce

- **Base branch is `main`.** Pass `--base main` explicitly. Never push
  `origin main`. Never open a PR with `main` as the **head** branch.
- **Title:** `[#NNN]: Title text` (sentence case after the colon).
- **Body:** `Refs #NNN` on its own line under Details. **Never**
  `Closes` / `Fixes` / `Resolves`.
- **Assignee:** `--assignee @me`.
- **Draft** by default (`gh pr create --draft`).
- Package manager is **npm** only.

## Dynamic context (already gathered for you)

- Current branch: !`git rev-parse --abbrev-ref HEAD`
- Working tree: !`git status -sb`
- gh auth: !`gh auth status 2>&1 | head -3 || echo "gh not authenticated"`

## Flow — execute these steps in order

### 1. Validate the branch (hard gate)

- If the current branch is `main`: **STOP** and tell the developer to create a
  ticketed feature branch first (`/create-pr-branch` or `/start-issue`).
- If the branch name does not match `{author}/{type}/{issue-number}-{slug}` with
  `type` in `feature` | `fix` | `chore`, warn (do not hard-block) and continue.

### 2. Sync and inspect the delta against `main`

```bash
git fetch origin main
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

- If `git log origin/main..HEAD` is empty: **STOP** — nothing to open a PR for.
- Read the commits and the diffstat. These are source material for title and body.

### 3. Run local checks (**hard-block** — do not push/open over red)

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

If `$ARGUMENTS` is provided, treat it as a targeted test scope **in addition to**
the four gates (never skip format/lint/typecheck). If the full test suite looks
slow or times out, fall back to a targeted run over the changed areas (infer from
the diffstat) and clearly note that you did so — still run the other three gates
in full.

**Hard gate:** If any of the four commands fail, **STOP**. Fix locally and re-run
until green (max practical iterations in-session). Do **not** push or open the PR
while those failures remain.

Also check:

```bash
git status --porcelain
git branch --show-current
```

Warn on uncommitted changes unless the user wants them included.

### 3b. Convention review (**hard-block** on any unfixed finding)

Run this on the **working diff** (staged + unstaged) **before the final commit /
push**. Launch the repo **`code-reviewer`** agent
(`.claude/agents/code-reviewer.md`) on that working tree (fall back to
`origin/main...HEAD` only if the working tree is clean).

- Fix **every** finding **before pushing** — **Blocking**, **Should-fix**,
  **Nit**. Severity only orders the work; it does **not** make a finding optional.
- If any finding remains **unfixed and not explicitly waived**: **STOP**, fix,
  re-run local checks (step 3), and re-run `code-reviewer`.
- The only escape is an **explicit per-item human waiver** documented in the PR
  body (what was waived, why, who approved). Do not invent waivers; do not
  batch-waive an entire severity.
- Do **not** skip this step to save time.

Board-move failures later in this command are **non-gating** and unrelated to
this hard gate.

### 4. Push the branch

Feature branch only — **never** `git push origin main`
([delivery.mdc](../../.cursor/rules/delivery.mdc)):

```bash
git push -u origin HEAD
```

### 5. Create the draft PR

Detect issue number from the branch (`…/173-…` or leading `173-…`). Fetch with:

```bash
gh issue view NNN --repo eten-tech-foundation/fluent-mobile --json number,title,body
```

**Title:** `[#NNN]: Title text` from the issue title (strip `[Mobile App]`-style
prefixes; sentence case after the colon). Fallback without an issue: derive from
the branch slug.

**Body:** Load [`.cursor/templates/pr-template.md`](../../.cursor/templates/pr-template.md)
and pre-fill:

| Section | Required content |
| ------- | ---------------- |
| **TLDR** | 2–4 sentences: what / why / impact |
| **Reviewer checklist** | Leave items unchecked unless verified ([AGENTS.md](../../AGENTS.md)) |
| **Details** | `Refs #NNN` on its own line; short summary; type-of-change checkboxes |
| **Technical changes** | Key files as `` `path` `` bullets |
| **Testing** | What gates ran (`format:check`, `lint`, `typecheck`, `npm test -- --ci`) |
| **How to verify** | Numbered steps + **Expected** |
| **Follow-ups** | Deferred AC → linked issues; otherwise say none |

Do **not** auto-check **Acceptance criteria**, **Scope**, or **Android device
tested** unless verified. Do **not** auto-check device QA for native / mic /
camera / filesystem / permissions changes.

Keep under ~400 lines; no nested fenced code blocks inside the PR body.

```bash
gh pr create --draft \
  --base main \
  --title "[#NNN]: Title" \
  --body-file /tmp/pr-body.md \
  --assignee @me
```

If the PR already exists without an assignee:

```bash
gh pr edit --add-assignee @me
```

**Issue link (Development sidebar):** `Refs #NNN` is the required non-closing
reference. GitHub’s Development widget is only auto-populated by closing
keywords or a **manual** sidebar link. Do **not** use closing keywords. After
create, if the sidebar is empty, link `#NNN` once in the GitHub UI (or ask the
user to).

**Reviewers / labels:** CODEOWNERS handles review requests after the file is on
`main`. Omit `--reviewer` unless the user asks.

Flag high-impact paths in the body when present: `package.json`,
`package-lock.json`, `app.config.ts`, `plugins/`, `eas.json`, `src/db/schema.ts`
(`android/` is gitignored CNG output).

### 6. Move the linked issue to **In PR Review** (Project 4)

Best-effort: warn and continue on failure — never fail the PR over it.

1. Parse `Refs #NNN` from the PR body (fall back to `NNN` in the branch name).
   If none, skip.
2. Do **not** move Product-owned columns (`In Progress (Product)`,
   `Product Ready`, `Sprint Shaping`).
3. Set Status to **`In PR Review`**. Resolve the option **by name** when
   possible. Verified: project `PVT_kwDOB8vK1s4A34c5`, Status field
   `PVTSSF_lADOB8vK1s4A34c5zgs8akY`, In PR Review `19224fda`.

```bash
ISSUE=<NNN>

ITEM_ID=$(gh api graphql -f query='
  query($n: Int!) {
    repository(owner: "eten-tech-foundation", name: "fluent-mobile") {
      issue(number: $n) {
        projectItems(first: 10) {
          nodes {
            id
            project { number }
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }' -F n=$ISSUE \
  --jq '.data.repository.issue.projectItems.nodes[] | select(.project.number == 4) | .id')

if [ -z "$ITEM_ID" ]; then echo "WARN: issue #$ISSUE not on Project 4; skipping."; else
  gh api graphql -f query='
    mutation($item: ID!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: "PVT_kwDOB8vK1s4A34c5"
        itemId: $item
        fieldId: "PVTSSF_lADOB8vK1s4A34c5zgs8akY"
        value: { singleSelectOptionId: "19224fda" }
      }) { projectV2Item { id } }
    }' -F item="$ITEM_ID" >/dev/null \
    && echo "Moved issue #$ISSUE to In PR Review." \
    || echo "WARN: failed to move issue #$ISSUE to In PR Review (continuing)."
fi
```

### 7. Wait for CI — **not done until green**

Opening the PR is **not** the finish line.

1. Watch required checks: `gh pr checks --watch`.
2. If any required check **fails**, treat it as your job: read the failing log,
   fix, push, and re-watch. Loop until green (or blocked on an out-of-scope
   base-branch issue — then say so explicitly and do not claim success).
3. Only then proceed to the Report step.

Do **not** tell the user the PR work is “done” while CI is red or still running,
or while any code-review finding remains unfixed without an explicit per-item
human waiver in the PR body. **Never merge.**

### 8. Report

Print the **PR URL** and a one-line recap (title, base = `main`, local check
results, **code-reviewer verdict**, **CI status = green**, whether the linked
issue was moved to In PR Review). Confirm assignee is the author
(`gh pr view --json assignees`).

## Related commands

- `/start-issue` — full issue → branch → implement → this command
- `/create-pr-branch` — branch only
- `/generate-pr-description` — body only, no `gh pr create`
- `/onboard`, `/dep-bump` — setup and dependency changes
