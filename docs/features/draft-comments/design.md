# Draft comments — design & contracts (#451)

## 1. Settled original requirements vs approved decisions

### From [#451](https://github.com/eten-tech-foundation/fluent-mobile/issues/451) (settled in ticket)

- Entry on draft surface only (Record for translators, Draft for Observers); no
  Bible-tab comments.
- Half bottom drawer; oldest→newest; author role + timestamp; supported comment
  modalities per #451: **text**, **audio**, and **emoji-only**; emoji reactions;
  one-level replies (no nesting).
- Anchor to verse/pericope at create time; invalid later → **Unconnected**, keep
  visible.
- Depends on backend comment data model + endpoints + Observer identity, and on
  [#452](https://github.com/eten-tech-foundation/fluent-mobile/issues/452).
- Out of scope in #451: resolve/delete, a new Observer permission matrix,
  offline sync indicator, text-project parity (separate existing tickets —
  **no issue numbers linked from #451 body or comments in this bounded read**).

### From [#703](https://github.com/eten-tech-foundation/fluent-mobile/issues/703) (settled in ticket)

- Chapter row comment count + “I commented” marker; reads comments from #451;
  rows from #505.

### From [#452](https://github.com/eten-tech-foundation/fluent-mobile/issues/452) (context)

- Comments attach to Draft tab only when #451 lands; view itself does not ship
  comments.

### Matt-approved decisions (2026-10-22) — see [product-decisions.md](product-decisions.md)

1. Conflicted audio unavailable + draft text readable — **NOW SETTLED** (PR #787
   source stays untouched this lane).
2. Chapter count = all retained comment records (replies + Unconnected);
   **EXCLUDE REACTIONS**. Marker = current user authored any comment (incl.
   reply / emoji-only); reactions alone do not set marker.
3. Unconnected: labeled section; **all retained Unconnected for the open
   chapter**.
4. One active reaction per person per comment (replace / tap-same removes).

---

## 2. Bounded ownership / linkage inspection (read-only)

Searches performed (GitHub issue/PR search + #451/#452/#703 issue reads +
fluent-api `src/routes` / `src/domains` listing on `main`). **Do not treat as a
proof of global absence** — only what this bounded pass found.

| Link / artifact | Result |
| --- | --- |
| fluent-mobile #451 | Open; **no sub-issues**; **no issue comments**; body cites backend model/endpoints as dependency (unnamed ticket) |
| fluent-mobile #452 | Open; sub-issue **#773** (grants) only; notes #451 as follow-on |
| fluent-mobile #703 | Open; depends on #451 (+ #505 rows) |
| fluent-mobile search `comment` | Hits include **#451**, **#703**, #452/#773 (context) — no separate “comment API” mobile ticket found |
| fluent-api domains/routes (`main`) | **No `comments` domain/route**; domains include `verse-audio`, `translated-verses`, etc. |
| fluent-api issue search `comment` / `reaction` | **No issue titled/owned as draft-comment or reaction API** in top results (noise from unrelated “comment” substrings) |
| fluent-api PR search `comment` / `reaction` | **No matching PR** returned in bounded search |

**Conclusion for coordination:** Backend comment prerequisite is **required by
#451** but **no fluent-api issue/PR was found in this bounded search** that owns
it. Mobile must not invent a working endpoint; parent must assign API ownership
before mobile wires `FluentAPI` methods.

**Mobile audio upload convention verified (reuse gap):**

- Existing: `FluentAPI.uploadVerseAudio` + multipart helpers
  (`src/services/verseAudioFormData.ts`, recordings sync contract) for
  **canonical/take verse audio**, not comment clips.
- **Gap:** No verified comment-audio upload path, resource ID scheme, or MIME
  policy for comment attachments. **Do not reuse verse-audio PUT as
  comment-audio** without a new fluent-api contract.
- **Proposed binding (engineering default, not product approval):** new
  authenticated multipart create/attach for comment audio under the comments
  resource once API owns it; mobile can mirror Expo multipart patterns from
  verse-audio **only as a client technique**, not as endpoint reuse.

---

## 3. Proposed fluent-api prerequisite scope (PROPOSED binding)

> **Status: PROPOSED.** Minimal logical contract for implementers. Not a claim
> of existing routes. Names below are **suggested bindings**; API owners may
> rename if they preserve semantics. **Backend owner: absent** in bounded search.

### Resources & identity (PROPOSED)

- Scope: `projectId` + `chapterAssignmentId` (chapter association).
- Comment id: stable server id.
- **Anchor** (at create): verse or pericope identity as created
  (`anchorKind: 'verse' | 'pericope'`, plus the identifiers the API already uses
  for draft units — e.g. `bibleTextId` and/or inclusive coverage fields **as
  snapshot at create**). Exact JSON keys: API-owned.
- **Canonical take** (`activeTakeId` / `contentHash` / playback range) is
  **independent** of the comment anchor. Range/take changes must **not**
  implicitly reattach Unconnected comments.
- **Unconnected:** retained; still associated with the chapter; drawer shows
  **all retained Unconnected for the open chapter** (decision 3).

### Thread model

- Top-level comments + **one** reply level; further replies flatten into that
  first-level subthread (Zoom-style / #451).
- Resolve/delete are **separate existing tickets** — **not** in this API
  prerequisite slice; do not invent soft-delete semantics or count-after-delete
  policy here.

### Body modalities

- Supported comment kinds per #451: **text**, **audio**, **emoji-only**.
- How those are represented on the wire (fields, mutual exclusivity, multipart
  shape) is **engineering PROPOSED** — not claimed as original product approval
  of “any non-empty combination.”
- Author: user id, **role display** (as returned by API), timestamp.

### Reactions

- Per comment, per user: **at most one** active emoji (decision 4).
- Set / replace / clear operations (or PUT upsert + DELETE).
- Not counted as comments (decision 2).

### Chapter aggregate (for #703) — approved semantics

`GET` (or sync payload field) per chapter assignment for the active user:

| Field | Semantics (approved) |
| --- | --- |
| `commentCount` | All retained comment records for the chapter (top-level + replies + retained Unconnected). **EXCLUDE REACTIONS.** |
| `currentUserHasCommented` | True if current user authored any retained comment on the chapter (top-level, reply, or emoji-only). **Reactions alone → false.** |

### Authenticated operations (minimal; PROPOSED)

Callers must be authenticated **and** authorized for the **same target project**
via the **existing** project access / grants contract (e.g. Observer grant /
translator membership as already enforced elsewhere). Do **not** invent broad
Observer authority or a new permission matrix in this slice — **API owner
verifies** the actual permissions contract against current fluent-api rules.

Minimal ops #451 / #703 need once API owns them:

1. List comments for chapter — connected threads + **all** retained Unconnected
   for that chapter.
2. Create top-level comment (text / audio / emoji-only per wire representation).
3. Reply (one level).
4. Set/replace/clear reaction.
5. Upload/attach comment audio (**new** — see gap above).
6. Chapter aggregate for My Work (#703).

Out of this prerequisite: resolve/delete, offline sync, text-project parity
(separate tickets per #451).

---

## 4. Mobile interfaces (smallest)

### Draft surface (#451)

- `CommentIndicator` on draft verse/pericope rows when comment count > 0.
- `CommentDrawer` half-sheet: connected list + **Unconnected** labeled section
  listing **all retained Unconnected for the open chapter**; composer (text,
  mic, emoji-only); reply; reactions (one-active UX).
- Local view models should carry: comment id, anchor snapshot, connection state
  (`connected` | `unconnected`), parent id (null = top-level), author, role,
  createdAt, text, audio local/remote ref, reactions summary + current user
  reaction, pending-sync flag (**display only when offline ticket lands**).

### My Work (#703)

- Row props/aggregate: `{ commentCount: number; currentUserHasCommented: boolean }`
  with approved semantics above. No unread field. Reactions do not affect either
  field.

### Conflicted draft unit (decision 1 — **NOW SETTLED**)

- Product: audio unavailable while conflicted; draft text still shown.
- **PR #787** currently uses undecided fail-closed implementation and remains
  untouched here; not an unanswered product choice.

---

## 5. Acceptance / test matrix (docs-level)

| # | Scenario | Expect |
| --- | --- | --- |
| A1 | Conflicted unit | Draft text readable; canonical audio unavailable (**settled** policy) |
| A2 | Resolved/clean unit | Canonical audio playable when URI present (existing #452 rules) |
| B1 | Chapter with replies + Unconnected + reactions | Count = all retained comment records; **excludes reactions** |
| B2 | User authored only a reply | Marker true |
| B3 | User authored only Unconnected | Marker true; count includes it |
| B4 | User only reacted (no authored comment) | Marker false; count unchanged by reaction |
| B5 | User authored emoji-only comment | Marker true; counts as a comment |
| C1 | Unconnected for open chapter | Labeled section shows **all** retained Unconnected for that chapter |
| D1 | React with emoji A then B | Only B active |
| D2 | Tap same emoji again | Reaction cleared |
| E1 | Bible tab | No indicator / drawer |
| E2 | Nested reply attempt | Flattened to first-level subthread |
| F1 | Take/range change after comment | Anchor snapshot unchanged; may become Unconnected; no silent reattach |

---

## 6. Remaining engineering defaults (not product approvals)

Labeled **proposed** so missing API work is not mistaken for product sign-off:

1. **REST shape:** chapter-assignment-scoped collection + comment sub-resource
   (names TBD by API owner).
2. **Anchor snapshot fields:** prefer stable `bibleTextId` + optional coverage
   snapshot at create; exact JSON keys owned by fluent-api.
3. **Comment body wire representation** for text / audio / emoji-only (fields,
   exclusivity, multipart).
4. **Comment audio:** new upload contract required; verse-audio endpoints are
   **not** a verified substitute.
5. **Sync:** offline queue/pending chrome deferred to the offline/sync ticket
   named in #451 (issue number not found in this pass).
6. **Emoji reaction string:** free-form unicode emoji with server length
   validation (default), unless API standardizes an allow-list.

---

## 7. Bounded next step

1. Parent assigns **fluent-api ownership** (new or existing ticket) against the
   **PROPOSED** prerequisite scope above — no mobile `FluentAPI` methods until
   then.
2. Keep PR **#787 / #782 / #774** source unchanged on this comments branch.
3. After API contract lands: implement mobile #451 drawer/composer against real
   types; #703 consumes aggregates only.
