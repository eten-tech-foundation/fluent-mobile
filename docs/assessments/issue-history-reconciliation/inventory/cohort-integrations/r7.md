# fluent-issue-review-r7 (wave 3)

- domain: `early-remainder-ui-auth-adjacent`
- ids (22): [3, 7, 8, 19, 22, 36, 39, 40, 47, 48, 50, 51, 52, 53, 71, 84, 85, 86, 99, 106, 107, 108]
- recommend_complete true: **22** / false: **0**
- reviewed_at_utc: 2026-10-20T01:11:35Z
- skipped: #721 (Sync lead)
- outputs: `/tmp/fluent-issue-review-r7.json`, `/tmp/fluent-issue-review-r7.md`

| ID | recommend_complete | ≤2 sentences |
| --- | --- | --- |
| #3 | true | Docs-only discovery ticket; closed state is history. Explicit comment delivers SharePoint artifact — NO_PRODUCT_FIX, not a deferred bug. |
| #7 | true | Infra/dev-env ticket. iOS mention is historical vs android-only.mdc — CONFIRMED_CURRENT_SOURCE drift of the ticket text, not an open product bug. |
| #8 | true | Library install AC confirmed. Demo CRUD page AC has no explicit product waive — named CONFIRMED_CURRENT_SOURCE divergence (closed ≠ demo still shipping). |
| #19 | true | Storage/continue AC largely CONFIRMED_CURRENT_SOURCE; original home inline-per-step UI drifted without an explicit waive — record as named divergence, not as #721. |
| #22 | true | Infra chore with no product journey AC. Closed checkbox ≠ proof of a specific PR; living architecture.mdc is current structure evidence. |
| #36 | true | Closed with empty thread. Import/upsert/user-switch intent matches current sync architecture; no explicit later decision narrowed #36 — AGREED remains in force with CONFIRMED_CURRENT_SOURCE implementation. |
| #39 | true | Layout/trigger AC (not permission). Closed with 0 comments; PR #242 is material delivery. |
| #40 | true | Layout/settings AC. PR #80 + approve comment are LATEST_EXPLICIT_DECISION for delivery; later drawer chrome is CONFIRMED_CURRENT_SOURCE evolution, not deferral. |
| #47 | true | Layout-only shell ticket (no permission AC). PR #131 delivers shell; living Inferred docs ≠ waive. |
| #48 | true | Layout AC with empty comment thread. PR #153 material; dual-state selection/playing confirmed in source. |
| #50 | true | Layout chapter-selection AC. Do not conflate with #51 QA failures on resource download. |
| #51 | true | Complete audit records named unwaived QA failures after close date — complete≠conformance. Explicit deferral absent; treat remaining deselection/chapter-switch issues as bugs/follow-ups (#702), not deferred AC. |
| #52 | true | UI control AC delivered via PR #307. API readiness note is eng context — do not treat as deferral of Pause/Cancel; catalog gaps are separate completeness risk. |
| #53 | true | Layout/storage AC. PR #316 is material despite QA wording about merge linkage; closed≠current Nightly proof. |
| #71 | true | Explicitly supersedes #49 silent overwrite. QA cosmetic ≠ open multi-take bug; complete≠claim Nightly re-pass. |
| #84 | true | Layout multi-account panel. No remove affordance in panel footer — matches out-of-scope note. |
| #85 | true | Layout affordance for #84. Conditional ≥2 accounts gate confirmed in source. |
| #86 | true | Auth-adjacent multi-account add flow. Cap enforcement confirmed; living §1 Inferred ≠ waive session-retention AC. |
| #99 | true | Schema AC landed via PR #246 + migrations. Linkage decision = bible_text_id canonical — LATEST_EXPLICIT_DECISION in schema comments/#99 thread. |
| #106 | true | Explicit deferral/descope dated 2026-06-30 — not a missing implementation bug. Original AC no longer in force. |
| #107 | true | Explicit descope vs Better Auth — LATEST_EXPLICIT_DECISION. Missing OFFLINE_MODE is intentional NO_PRODUCT_FIX, not OPEN_TICKET_UNRESOLVED. |
| #108 | true | Docs-only AC delivered via PR #136. Infra/eng documentation — no user-facing product journey. |

## Notes
- complete ≠ QA pass / conformance; #51 records named unwaived post-close QA failures.
- Layout vs permission: #40/#47/#48/#50/#52/#53/#71/#84/#85 are layout (or UI) slices; #86 is auth-adjacent session/cap.
- Explicit descope (#106/#107) ≠ open bugs; missing decision elsewhere recorded as CONFIRMED_CURRENT_SOURCE divergence.
- Living product-behavior rows labeled Inferred are not product agreement.
