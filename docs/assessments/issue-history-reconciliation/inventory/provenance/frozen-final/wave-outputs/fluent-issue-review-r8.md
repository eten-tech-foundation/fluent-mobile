# Wave 3 review — r8 (mid-sync-nav-resources)

IDs: **109, 111, 112, 113, 114, 115, 116, 119, 120, 121, 122, 123, 124, 125, 132, 133, 137, 139, 159, 170, 173, 177** · `recommend_complete`: **22 true / 0 false** · reviewed `2026-10-20T01:10:21Z`

Outputs: `/tmp/fluent-issue-review-r8.json`, `/tmp/fluent-issue-review-r8.md`. Read-only on repo; skipped #721.

## Counts

- recommend_complete true: **22** / false: **0**
- dispositions: AGREED_REQUIREMENT 22 · LATEST_EXPLICIT_DECISION 21 · CONFIRMED_CURRENT_SOURCE 21 · SHIPPING_MAIN_VS_QA 22 · NO_PRODUCT_FIX 1 (#137)

## Paths cited (unique)

- `.cursor/hooks.json`
- `.cursor/rules/agent-guardrails.mdc`
- `.cursor/rules/android-only.mdc`
- `.cursor/rules/delivery.mdc`
- `.cursor/rules/rule-precedence.mdc`
- `.github/dependabot.yml`
- `.github/workflows/preview-build.yml`
- `.github/workflows/quality-gates.yml`
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `app.config.ts`
- `docs/AGENT_ONBOARDING.md`
- `docs/ci.md`
- `docs/guides/api-client-standard.md`
- `docs/guides/dependabot-process.md`
- `docs/guides/local-development-workflow.md`
- `docs/guides/qa-preview-testing.md`
- `docs/issue-tracking.md`
- `eslint.config.js`
- `jest.config.cjs`
- `package.json`
- `src/app/screens/SettingsScreen.tsx`
- `src/app/tabs/RecordTab.tsx`
- `src/audio/createRecordingEngine.ts`
- `src/config/apiBaseUrl.ts`
- `src/db/AGENTS.md`
- `src/db/migrations.ts`
- `src/db/queries.ts`
- `src/db/recordingsRepository.ts`
- `src/db/schema.ts`
- `src/navigation/AuthSessionProvider.tsx`
- `src/routes/_layout.tsx`
- `src/services/AGENTS.md`
- `src/services/authToken.ts`
- `src/services/bibleTextSyncGap.ts`
- `src/services/fluent-api.test.ts`
- `src/services/keychain.ts`
- `src/services/pausedTakes.ts`
- `src/services/queryClient.ts`
- `src/services/sync.ts`
- `src/test/mocks/expoMocks.test.ts`
- `src/types/api/errors.ts`
- `src/types/env.d.ts`
- `src/utils/audioStorage.ts`

## Per-issue (≤2 sentences)

### #109 — Env audit + typed runtime validation
Required no-`@env` AC is met via `apiBaseUrl.ts` + eslint bans; optional `src/config/env.ts` never shipped (documented divergence). Evidence `src/config/apiBaseUrl.ts:1-9`; https://github.com/eten-tech-foundation/fluent-mobile/pull/70.
Material: PR #70 (CNG env migration) closed #109 the same minute.

### #111 — Expo test infra (jest mocks + gate live API test)
`jest.config.cjs` maps expo-secure-store/file-system/audio to `src/test/mocks/`; `fluent-api.test.ts` is `describe.skip` unless `RUN_LIVE_API_TESTS=1`. Evidence `jest.config.cjs:14-18`; https://github.com/eten-tech-foundation/fluent-mobile/pull/155.
Material: PR #155 Fixes #111.

### #112 — EAS/dev-client onboarding + prebuild docs
Onboarding path + preview-build loop live in `docs/AGENT_ONBOARDING.md` / `qa-preview-testing.md` / `preview-build.yml`. Evidence `docs/AGENT_ONBOARDING.md:73-83,128`; https://github.com/eten-tech-foundation/fluent-mobile/issues/112#issuecomment-4870063870.
Material: 2026-07-02 closeout comment cites #70/#136/#145 as already on main.

### #113 — API client architecture standard
`ApiError` + shared `queryClient` + living `api-client-standard.md` match the eng AC on HEAD. Evidence `src/types/api/errors.ts:1-37`; https://github.com/eten-tech-foundation/fluent-mobile/pull/154.
Material: PR #154 Fixes #113.

### #114 — Lint guardrails for handoff anti-patterns
`eslint.config.js` bans `@env`/RNFS/keychain/Simform imports and direct `process.env` outside `src/config/**`. Evidence `eslint.config.js:9-47,142-143,207-210`; https://github.com/eten-tech-foundation/fluent-mobile/pull/156.
Material: PR #156 Fixes #114.

### #115 — [Epic] Authentication (better-auth)
Epic children #88–#93 delivered; HEAD uses `authToken` accessor + `expo-secure-store` keychain + `AuthSessionProvider` bootstrap. Evidence `src/services/keychain.ts:1-1,27-55,103`; https://github.com/eten-tech-foundation/fluent-mobile/pull/144.
Material: PR #144 completes remaining #115 UI after #141–#143.

### #116 — [Epic] Audio recording & playback (Expo modules)
Expo audio stack on HEAD (`audioStorage`, `createRecordingEngine`, multi-take repo); residual UI follow-ups are separate tickets. Evidence `src/utils/audioStorage.ts:1-34`; https://github.com/eten-tech-foundation/fluent-mobile/issues/116#issuecomment-5123591274.
Material: 2026-07-29 closeout comment — #94–#98 closed.

### #119 — [Epic] Local-first dev experience
Epic pivoted from mock-seed to docs-only real-API workflow (`local-development-workflow.md`). Evidence `docs/guides/local-development-workflow.md:1-46`; https://github.com/eten-tech-foundation/fluent-mobile/pull/136.
Material: PR #136 + closeout comment; #106/#107/#137 descoped.

### #120 — [Epic] Expo migration follow-ups & dev tooling
Tooling epic children present on HEAD (migrations, mocks, API standard, lint). Evidence `src/db/migrations.ts:17-28`; https://github.com/eten-tech-foundation/fluent-mobile/issues/120#issuecomment-5123591730.
Material: 2026-07-29 closeout — #109–#114 closed.

### #121 — Fix broken recordings join (chapter_assignment_id)
`RECORDINGS_JOIN_CA` joins via `bible_text_id` (no `recordings.chapter_assignment_id`); schema/docs agree. Evidence `src/db/queries.ts:84-92`; https://github.com/eten-tech-foundation/fluent-mobile/pull/227.
Material: PR #227 explicitly guards the join; #121 closed earlier without its own PR.

### #122 — Migrate to Expo SDK 56 CNG (Android-only)
Credit issue for Expo CNG Android-only migration; `app.config.ts` still CNG/Android-only (SDK advanced later). Evidence `app.config.ts:38-48,62-68`; https://github.com/eten-tech-foundation/fluent-mobile/pull/70.
Material: PR #70 merged with #122 close.

### #123 — Agent onboarding docs, PR workflow & Android-only
`docs/AGENT_ONBOARDING.md` + `android-only.mdc` still encode the shipped process/scope. Evidence `docs/AGENT_ONBOARDING.md:1-40`; https://github.com/eten-tech-foundation/fluent-mobile/pull/56.
Material: PR #56 (and body-cited #43).

### #124 — Brand Android app launch (icon + splash)
`app.config.ts` wires Fluent icon/adaptiveIcon + `react-native-bootsplash` assets. Evidence `app.config.ts:29-47,98-102`; https://github.com/eten-tech-foundation/fluent-mobile/pull/58.
Material: PR #58.

### #125 — Dependabot config + safe merge workflow
`.github/dependabot.yml` + `docs/guides/dependabot-process.md` one-at-a-time/doctor workflow remain. Evidence `.github/dependabot.yml:1-11`; https://github.com/eten-tech-foundation/fluent-mobile/pull/60.
Material: PR #60.

### #132 — Document Expo local dev auth troubleshooting
README troubleshooting documents whoami/logout/`--offline` and machine-global Expo session. Evidence `README.md:264-274`; https://github.com/eten-tech-foundation/fluent-mobile/pull/135.
Material: PR #135 (Refs #132).

### #133 — Clean up .gitignore for Android-only Expo
`.gitignore` keeps `!.env.example`, ignores `.env*`, and retains `/android` `/ios` without iOS/fastlane boilerplate. Evidence `.gitignore:40-61`; https://github.com/eten-tech-foundation/fluent-mobile/pull/134.
Material: PR #134.

### #137 — App-shell error when API URL unset/unreachable
Explicit not-planned (2026-06-30): no app-shell Retry UX; docs workflow substitutes; PR #138 closed unmerged. Evidence `src/config/apiBaseUrl.ts:1-9`; https://github.com/eten-tech-foundation/fluent-mobile/issues/137#issuecomment-4847332766.
Disposition NO_PRODUCT_FIX — reconciliation complete ≠ AC implemented.

### #139 — Add Expo Doctor to Dependabot workflow and CI
`npm run doctor` + Quality Gates `expo-doctor` job + delivery/rule-precedence rules present. Evidence `package.json:19`; https://github.com/eten-tech-foundation/fluent-mobile/pull/140.
Material: PR #140 (later #145 relocated doctor into quality-gates).

### #159 — Add agent delivery guardrails
Root `AGENTS.md` + thin `agent-guardrails.mdc` encode AC≠CI / one-ticket / abstraction / human QA. Evidence `AGENTS.md:1-40`; https://github.com/eten-tech-foundation/fluent-mobile/pull/160.
Material: PR #160; closeout comment 2026-07-20.

### #170 — Clear orphaned/unresolvable paused recording takes
Launch `clearOrphanedPausedTakes` + Settings Clear cache → `clearAllPausedTakes` on HEAD. Evidence `src/services/pausedTakes.ts:71-129`; https://github.com/eten-tech-foundation/fluent-mobile/pull/232.
Material: PR #232 Closes #170 (supersedes earlier “stays open” comments).

### #173 — Adopt Phase 1 agent/process docs
`docs/issue-tracking.md`, `docs/ci.md`, warn-only `.cursor/hooks.json`, nested `src/*/AGENTS.md` present without this ticket adding merge gates. Evidence `docs/issue-tracking.md:1-40`; https://github.com/eten-tech-foundation/fluent-mobile/pull/174.
Material: PR #174 Closes #173.

### #177 — Resolve null bibleTextId on Record tab
`sync.ts` full-fetches chapters with zero local verses; `bibleTextSyncGap.ts` documents root cause; Record disables until `bibleTextId` resolves. Evidence `src/services/bibleTextSyncGap.ts:1-10`; https://github.com/eten-tech-foundation/fluent-mobile/pull/230.
Material: PR #230 Closes #177 (TEMP toast removed).
