---
description: Claim a GitHub issue, cut a branch from main, plan-gate when scope is large/ambiguous, implement to acceptance criteria, then chain into /create-pr through green CI. Epics auto-pick the highest-priority open child.
argument-hint: '<issue-number> [optional: create-pr test scope, e.g. src/services/sync.test.ts]'
---

# /start-issue — issue → branch → implement → /create-pr

You are running the **full delivery graph** for one GitHub issue in
**fluent-mobile**. Proceed autonomously except at the **plan gate** (step 5) when
scope is large/ambiguous — then write a short plan and **STOP until the user
approves**.

`$ARGUMENTS` = required issue number (`324` or `#324`), optionally followed by a
`/create-pr` test scope (e.g. `324 src/services/sync.test.ts`). Parse the first
token as `ISSUE`; the remainder (if any) is passed through to `/create-pr` as
`$ARGUMENTS`.

```
issue → (epic? auto-pick child) → assign + In Progress (Dev) → branch from main
  → plan gate? → implement → /create-pr → In PR Review → CI green
```

**Never merge.** Humans merge. Do **not** create git worktrees unless the user
explicitly asks. Do **not** re-implement `/create-pr` steps inline — read and
execute `.claude/commands/create-pr.md` at the end.

## Critical repo facts

- Issues live in `eten-tech-foundation/fluent-mobile`. Board: **Fluent Mobile
  Board** (org Project **4**, view 9). See `docs/issue-tracking.md` and
  `docs/guides/project-board.md`.
- PRs target **`main`**. Never push or open a PR with `main` as the head branch.
- Branch: `{author}/{type}/{issue-number}-{slug}` (`feature` / `fix` / `chore`
  only). Naming rules live in `.claude/commands/create-pr-branch.md` — **read
  and execute** that file; do not re-specify slug/type logic here.
- PR body uses **`Refs #NNN`** (never `Closes` / `Fixes` / `Resolves`). Issues
  stay open for QA.
- Delivery gate after commits: `/create-pr` (CI gates → code-reviewer → push →
  draft PR → board **In PR Review** → watch CI). `/open-pr` is an alias.

## Dynamic context (already gathered for you)

- Current branch: !`git rev-parse --abbrev-ref HEAD`
- Working tree: !`git status -sb`
- gh auth: !`gh auth status 2>&1 | head -3 || echo "gh not authenticated"`

## Flow — execute these steps in order

### 1. Parse arguments (hard gate)

- Extract `ISSUE` from the first token of `$ARGUMENTS` (strip a leading `#`).
- If missing or not a positive integer: **STOP** and tell the user to run
  `/start-issue <number>` (e.g. `/start-issue 324`).
- Optional remainder → `CREATE_PR_ARGS` (pass to `/create-pr` later; may be empty).

### 2. Preflight hard gates

Run before any mutate:

```bash
gh auth status
git status --porcelain
gh issue view "$ISSUE" --repo eten-tech-foundation/fluent-mobile --json number,title,state,labels,body,assignees
```

**STOP** if:

- `gh` is not authenticated
- Working tree is **dirty** (non-empty `git status --porcelain`) — tell the user
  to stash/commit/discard; do not create a worktree
- Issue `state` is `CLOSED`

### 3. Epic / children — auto-pick

Fetch sub-issues (GraphQL) and labels.

Treat as an epic when the issue has the `epic` label **or** has one or more
**open** children.

When it is an epic:

1. List open children.
2. **Auto-pick** the first by priority: label `priority-p0` / `P0` →
   `priority-p1` / `P1` → `priority-p2` / `P2` → then oldest `createdAt` among
   remaining open children.
3. Announce: parent epic `#P`, chosen child `#C`, title, and why (priority / age).
4. Set `ISSUE` / `CHOSEN` to the child number; remember `PARENT_EPIC` for PR prose.
5. If there are **no** open children but the issue has `epic`: **STOP** and say
   the epic has nothing open to pick — do not invent work.

When it is not an epic: `CHOSEN=$ISSUE`, `PARENT_EPIC` empty (unless a parent
link exists — mention in prose if known).

Re-fetch the chosen issue body/labels/AC after a pick (work from the child, not
the epic).

### 4. Kickoff — assign, board, branch

#### 4a. Assign

```bash
gh issue edit "$CHOSEN" --repo eten-tech-foundation/fluent-mobile --add-assignee @me
```

Best-effort: warn and continue on failure.

#### 4b. Project 4 — add if missing, then **In Progress (Dev)**

Follow [docs/guides/project-board.md](../../docs/guides/project-board.md):

- **STOP** if current Status is Product-owned (`In Progress (Product)`,
  `Product Ready`, `Sprint Shaping`) unless the user **explicitly named** this
  issue number.
- Do not move neighboring cards. Do not sequence `Dev Ready` by relocating it.
- Allowed for this assigned ticket: add to Project 4 if missing; set
  **`In Progress (Dev)`**.

Best-effort warn-and-continue on API failure (except the Product-column STOP
above). Resolve Status option IDs **by name** when possible. Verified Project 4
IDs (eten-tech-foundation project #4):

- Project: `PVT_kwDOB8vK1s4A34c5`
- Status field: `PVTSSF_lADOB8vK1s4A34c5zgs8akY`
- `In Progress (Dev)`: `db53740f`

```bash
ISSUE=$CHOSEN
CURSOR=""
ITEM_ID=""

while :; do
  if [ -z "$CURSOR" ]; then
    PAGE=$(gh api graphql -f query='
      query($n: Int!) {
        repository(owner: "eten-tech-foundation", name: "fluent-mobile") {
          issue(number: $n) {
            projectItems(first: 20) {
              pageInfo { hasNextPage endCursor }
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
      }' -F n=$ISSUE)
  else
    PAGE=$(gh api graphql -f query='
      query($n: Int!, $c: String!) {
        repository(owner: "eten-tech-foundation", name: "fluent-mobile") {
          issue(number: $n) {
            projectItems(first: 20, after: $c) {
              pageInfo { hasNextPage endCursor }
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
      }' -F n=$ISSUE -f c="$CURSOR")
  fi

  ITEM_ID=$(printf '%s' "$PAGE" | jq -r '[.data.repository.issue.projectItems.nodes[] | select(.project.number == 4) | .id] | first // empty')
  [ -n "$ITEM_ID" ] && break
  HAS=$(printf '%s' "$PAGE" | jq -r '.data.repository.issue.projectItems.pageInfo.hasNextPage')
  CURSOR=$(printf '%s' "$PAGE" | jq -r '.data.repository.issue.projectItems.pageInfo.endCursor // empty')
  [ "$HAS" = "true" ] && [ -n "$CURSOR" ] || break
done

# If missing from Project 4: gh project item-add 4 --owner eten-tech-foundation \
#   --url https://github.com/eten-tech-foundation/fluent-mobile/issues/$ISSUE
# then re-query ITEM_ID (same paginated GraphQL + jq scalar `.id`).

# If Status is In Progress (Product) | Product Ready | Sprint Shaping → STOP.
# Else set Status to In Progress (Dev) (option db53740f).
```

#### 4c. Branch from `main`

If a local or `origin` branch matching `*/${CHOSEN}-*` already exists: **resume**
it (`git switch` / track remote). Do not recreate.

If an **open PR** already exists for that head: skip implement (step 6);
announce and hand off to `.claude/commands/create-pr.md`.

Otherwise **read and execute** `.claude/commands/create-pr-branch.md` for
`$CHOSEN`:

- Always base on `origin/main` (`git fetch origin main`). Do not branch off a
  random feature branch.
- Skip the “Create this branch?” prompt (this command is the explicit ask).
- Still print the final branch name before `git checkout -b`.

### 5. Plan gate (large / ambiguous → STOP for approval)

**Require a short plan and wait for explicit user approval** before coding when
**any** of:

- Chosen issue still has the `epic` label, or body describes multiple phases /
  stacked PRs
- Acceptance criteria imply measurement + conditional config
- Clear multi-area / architecture / native-module / dependency-bump scope
- Requirements are underspecified (you cannot name the primary files to touch)

**Skip the plan** (implement immediately) when: single clear bugfix, small
docs/chore, or AC that maps to an obvious small file set.

When the gate fires:

1. Write a short plan (objective, files/areas, AC mapping, risks, that
   `/create-pr` will use `Refs #<CHOSEN>` and any parent-epic prose).
2. **STOP** and ask the user to approve (or adjust). Do not start implementation.
3. After they approve, continue from step 6 — do not re-ask.

### 6. Implement

- Implement to the chosen issue’s acceptance criteria ([AGENTS.md](../../AGENTS.md)).
- Follow `CLAUDE.md`, `.cursor/rules/`, and matching `.claude/skills/*/SKILL.md`
  when the work matches a skill.
- Layer boundaries: no `fetch` in screens; no SQL in UI; reads via `queries.ts`
  ([architecture.mdc](../../.cursor/rules/architecture.mdc)).
- New UI uses `theme` from `src/theme/`. Android-only — no iOS config/CI/docs.
- Keep the working tree ready for `/create-pr` (code-reviewer runs on the
  working diff inside `/create-pr`).

### 7. Chain into `/create-pr`

Read and **fully execute** `.claude/commands/create-pr.md` with `CREATE_PR_ARGS`
as that command’s `$ARGUMENTS`.

Ensure the PR body:

- `Refs #<CHOSEN>` on its own line under Details
- If `PARENT_EPIC` is set: prose `Part of #<PARENT_EPIC>` (do **not** use
  closing keywords on the epic)

`/create-pr` owns: local CI gates, code-reviewer, push, `gh pr create --draft
--base main`, board → **In PR Review**, CI watch to green, never merge.

### 8. Report

Print:

- Chosen issue URL (+ parent epic if any, and auto-pick rationale)
- Branch name
- Plan: skipped | approved (one line)
- PR URL
- Local checks + code-reviewer verdict + **CI = green**
- Board: In Progress (Dev) then In PR Review, or WARN if a move failed

Do **not** claim done while CI is red/pending or review findings remain unfixed
without an explicit per-item human waiver in the PR body.
