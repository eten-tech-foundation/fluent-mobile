# Start Issue (Cursor)

Cursor entry point — **do not duplicate instructions here.**

Read and follow the canonical command:

**`.claude/commands/start-issue.md`**

Full graph: claim GitHub issue → Project 4 **In Progress (Dev)** → branch from
`main` → plan-gate when large/ambiguous → implement → chain `/create-pr`
through green CI.

Usage: `/start-issue 324` (optional trailing `/create-pr` test scope, e.g.
`/start-issue 324 src/services/sync.test.ts`). Epics auto-pick the
highest-priority open child.
