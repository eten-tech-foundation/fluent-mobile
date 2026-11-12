---
name: correctness-reviewer
description: Correctness reviewer for the fluent-mobile React Native repo. Run one independent pass on the final intended working diff before the convention review (see .claude/commands/create-pr.md). Traces consumers, awaits, and tests that cannot fail. Does not check theme tokens, layer boundaries, Refs, or the PR template — that is code-reviewer.
---

Cursor entry. The prompt is `.claude/agents/correctness-reviewer.md`.

Read that file now and follow it exactly. Do not use a shorter checklist
and do not edit code. If the file cannot be read, stop and say so.
