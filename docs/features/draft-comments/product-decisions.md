# Product decisions — draft comments (#451 / #452 / #703)

Recorded from parent-trusted Matt approvals on **2026-10-22** (UTC times
**21:36:45** and **21:36:52**). These bind mobile implementation and the
**smallest** fluent-api prerequisite scope; they do not invent unread policy or a
new role-eligibility / permission matrix.

## Decision 1 — Conflicted canonical audio vs draft text (**NOW SETTLED**)

- **Conflicted canonical audio** is **unavailable** until the conflict is
  **resolved**.
- **Draft text remains readable** while audio is unavailable.
- Product choice is **settled by this approval** — not an open allow/block
  question for comments or Draft.
- **PR #787** currently implements undecided fail-closed conflict audio and
  **stays untouched** on this comments lane; aligning that code to the settled
  policy is a separate Observer Draft follow-up, not a remaining product
  clarification here.
- Take identity (active / hash / range) stays independent of comment anchors.

## Decision 2 — Chapter comment count & current-user marker (#703)

**Count** (chapter row `li:message-square`):

- Count **all retained comment records** for the chapter: top-level **and**
  replies, **and** retained **Unconnected** comments associated with the
  chapter.
- **EXCLUDE REACTIONS** — reactions are not comments and do not increment the
  count.
- Do **not** invent unread filtering or root-only counting.
- Delete/resolve lifetime is **not** part of this approval; those controls
  remain separate existing tickets (not this comments API prerequisite).

**Current-user marker** (`li:message-square-check`):

- True when the **current user authored any** comment on that chapter
  (top-level, reply, or emoji-only; Unconnected included if still associated).
- **Reactions alone do not set the marker.**
- Not “root only”; not “unread”.

## Decision 3 — Unconnected presentation

- Retained **Unconnected** comments appear in a **labeled section** inside the
  **existing chapter comment drawer**.
- Scope (approved): **all retained Unconnected for the open chapter**.
- Generic Unconnected requirement from #451 stands: keep visible; no implicit
  reattach when structure/range changes. Delete/resolve remain separate tickets.

## Decision 4 — Reactions (one active per person per comment)

- A user may have **at most one active reaction** on a given comment.
- Selecting a **different** emoji **replaces** the previous reaction.
- Tapping the **same** emoji **removes** the reaction.
- Reactions remain lighter-weight than replies (#451); not a nested thread;
  excluded from chapter comment count (decision 2).
