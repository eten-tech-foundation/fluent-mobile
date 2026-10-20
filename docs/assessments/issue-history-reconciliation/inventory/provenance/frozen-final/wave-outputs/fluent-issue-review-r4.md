# fluent-mobile issue reconciliation — reviewer r4 (wave 2)

- **Domain:** early-mvp-nav-ci
- **IDs:** 1, 2, 5, 6, 9, 10, 12, 14, 15, 17, 18, 23
- **Artifacts:** `/tmp/fluent-issue-review-r4.json`, `/tmp/fluent-issue-review-r4.md`
- **reviewed_at_utc:** 2026-10-20T00:58:21Z
- **recommend_complete:** **true = 12**, **false = 0**
- Skipped #721; did not edit coverage.csv / git / GitHub / devices.

## Per-issue (≤2 sentences)

### #1 — React Native with Expo Discovery — `recommend_complete=true`
Discovery PoC (nav/SQLite/audio/edit + findings doc) has no linked PR; sole comment is ffmpeg progress; living Expo Android app + later #49/#94–98 own audio. Complete finding: no lasting user-facing AC (closed ≠ unchecked-AC acceptance).

### #2 — MVP PoC mobile companion app — `recommend_complete=true`
Umbrella PoC scaffold delivered via PR #11 pieces; unmerged #82 is not ship; body iOS bundle id is superseded by permanent android-only policy (`app.config.ts` android-only package). Complete ≠ product/QA pass on later stage tickets.

### #5 — Create View Project Page — `recommend_complete=true`
Layout-only MVP (project title/language + folder cards) closed via PR #20 linkage but living UI is ViewProject milestone/project header + stage rows from #33/PR #55. Named layout supersession recorded; no permission AC on this ticket.

### #6 — Create View Chapter page — `recommend_complete=true`
Explicit 2026-07-01 comment replaces page with #49/#47; no “Show Source Text” strings remain; RecordTab is the living record/play surface. Layout-only; complete ≠ Record QA.

### #9 — Fluent server API integration — `recommend_complete=true`
403-demo scaffold closed by PR #13 (+#11); HEAD is Bearer `FluentAPI` `/self/*` from later #14/#41. Scaffold AC is historical.

### #10 — Initial CI/CD — `recommend_complete=true`
Lint/format + unit-test workflows present (PR #11); optional Android+iOS build wish superseded by android-only (no iOS CI). Infra-only complete finding.

### #12 — Pre-development Architecture Study — `recommend_complete=true`
2026-04-01 comment explicitly shifts to fluent-api mobile sync instead of PowerSync/Auth0; HEAD `sync.ts`/`api.ts` match that decision. Docs/R&D spike — no PR required.

### #14 — Mobile API integration & initial data sync — `recommend_complete=true`
Manual sync/upsert/independent-step AC still living (`sync.ts` + op-sqlite KV); MMKV/x-user-email/inline chrome superseded via children/#41/#38. No closing PR on epic (manual close); foundational tables in PR #20 — complete ≠ #721 Sync QA.

### #15 — Auth + identity bootstrap — `recommend_complete=true`
PR #25 shipped op-sqlite KV instead of MMKV; #41/PR #46 replaced x-user-email/no-login with Better-Auth Bearer (zero `x-user-email` in src/). Interim AC superseded.

### #17 — Sync trigger + MMKV state — `recommend_complete=true`
PR #28 delivered trigger + KV counts; storage waived to op-sqlite in-thread; Home button→Sync page via #38; API paths now `/self/*`. Trigger intent remains; UI/path divergences named.

### #18 — Inline sync status UI — `recommend_complete=true`
Layout-only four-state Home row (PR #29) narrowed by chadw 2026-04-14 then superseded by #38 cloud→SyncScreen; HEAD has no inline row. Do not conflate with #721.

### #23 — Audio recording — `recommend_complete=true`
PoC record/playback checkboxes superseded by #49/PR #229; unmerged #82 is not delivery; engines live under `src/audio/`. No permission slice here (that is #49); complete ≠ Record device QA.
