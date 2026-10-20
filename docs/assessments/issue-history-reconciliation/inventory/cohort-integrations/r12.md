# Reviewer r12 — wave 4 mid-late-gap-cont2

- reviewed_at_utc: `2026-10-20T01:15:08Z`
- ids: 380, 404, 405, 407, 408, 409, 410, 411, 412, 417, 420, 422, 423, 424, 428, 435, 438, 442, 443, 446, 447, 448, 451, 452 (n=24)
- skip: #721
- recommend_complete_count: **24**
- recommend_complete_false_count: **0**

| issue | state (corpus) | recommend_complete | finding (short) |
| --- | --- | --- | --- |
| #380 | closed | true | Docs AC delivered by #394; closed same day. No product runtime change. |
| #404 | closed | true | Single-page Record scroll AC on HEAD via #418; closed after human QA. Adjacent waveform/audio bugs tracked separately. |
| #405 | closed | true | CI parity AC present on HEAD via #406; closed same day. |
| #407 | closed | true | Settings toggle AC + live consumers on HEAD. Named divergence: online account sync of drafting_unit not found (dirty ... |
| #408 | open | true | Core #408 UI on HEAD via #535/#541. Issue still open: product waived auto-select; scrubbing concern remains product-t... |
| #409 | closed | true | Title/nav AC on HEAD. Named divergence: Record capture waveform does not pass tickMarks (plain scrubber); QA earlier ... |
| #410 | closed | true | Mixed-mode + labeling AC on HEAD via #473; product accepted after nav clarification to #409. |
| #411 | closed | true | Stitch playback AC on HEAD via #506; product waived timer-reset concern. |
| #412 | closed | true | Baseline shell player AC on HEAD via #455; product passed with known design follow-up. |
| #417 | open | true | Source now preserves kind:image and gates imagesMaps. Issue still open (board hygiene); no dedicated #417 PR link. |
| #420 | closed | true | Parent tracker satisfied via Phase1 merge + follow-up issues; Phase2 done in #422; Phase3/4 remain open children. |
| #422 | closed | true | Phase2 Expo sync AC on HEAD via #460; closed. |
| #423 | open | true | Audit complete: OPEN_TICKET_UNRESOLVED — merge queue not enabled; docs still defer to #423. |
| #424 | open | true | Audit complete: OPEN_TICKET_UNRESOLVED — Phase3 ownership split not implemented on HEAD. |
| #428 | closed | true | Assignee stub AC on HEAD via #437; closed. QA noted sync validation incomplete but passed ticket. |
| #435 | closed | true | Dependabot harden AC on HEAD via #463; closed. |
| #438 | closed | true | Pericope data-layer AC on HEAD via #445; closed after bandwidth redesign. |
| #442 | open | true | Product AC implemented (#538) and QA/product approved; GitHub issue still open (OPEN_TICKET_UNRESOLVED board state). |
| #443 | closed | true | Advanced/Complete progression AC on HEAD via #519; #542 is separate empty-recording gate. |
| #446 | open | true | Queue re-fetch AC on HEAD via #672; issue open awaiting board/DevQA close, not missing code. |
| #447 | closed | true | APK seed AC on HEAD via #450; closed. Consumed by #438 sync. |
| #448 | open | true | Copy/state AC implemented (#673). Complete≠QA pass; issue open for device verification when fixtures available. |
| #451 | open | true | Audit complete: AGREED AC still open; no comment surface in working tree. Blocked on #452 + API per issue body. |
| #452 | open | true | Audit complete: AGREED AC still open; Observer read-only Draft view absent from working tree. |

## Counts

- reviewed: 24
- recommend_complete=true: 24
- recommend_complete=false: 0

Open-but-recommend_complete (audit done; AC met or named open divergence): 408, 417, 423, 424, 442, 446, 448, 451, 452.

Artifacts: `/tmp/fluent-issue-review-r12.json`, `/tmp/fluent-issue-review-r12.md`. Integrator merges; no coverage.csv edits.
