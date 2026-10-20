# Wave 2 review — r5 (auth-session-followons)

IDs: **87–98** · `recommend_complete`: **12 true / 0 false** · reviewed `2026-10-20T00:57:17Z`

Auth vs #41: #88/#89/#93 = Bearer accessor, SecureStore migration, restore/token-clear signOut (creds kept). Do **not** fold #41’s unverified DB wipe or 401→Login into these rows. 94–98 = epic #116 audio in this exact ID batch.

## #87 — Account switching

Offline switch via SecureStore creds + `switchActiveUser`; error banner keeps current account ([AccountSwitcherPanel.tsx](src/components/ui/AccountSwitcherPanel.tsx) 54–76). PR [#171](https://github.com/eten-tech-foundation/fluent-mobile/pull/171) merged; post-switch lands Home not Drafting (`resetNavigationAfterAccountSwitch`).

## #88 — Token injection harden

`authToken` + sync `buildHeaders` / logged `publicRequest` on HEAD ([authToken.ts](src/services/authToken.ts), [httpClient.ts](src/services/httpClient.ts) 41–87). PR [#141](https://github.com/eten-tech-foundation/fluent-mobile/pull/141) merged — Bearer plumbing only, not #41 sign-out/401 UI.

## #89 — expo-secure-store migration

`keychain.ts` on `expo-secure-store`, `fluent.auth.<userId>`, enumeration via KV; `react-native-keychain` gone. PR [#142](https://github.com/eten-tech-foundation/fluent-mobile/pull/142) merged; optional keychain→SecureStore shim explicitly skipped (re-login). This is #41’s storage-library slice.

## #90 — Login harden

`useLogin` / no KV from `LoginScreen`; theme + a11y/testIDs; shared `validateEmail`. PR [#144](https://github.com/eten-tech-foundation/fluent-mobile/pull/144) merged. Eng/UI harden of #41 journey — complete≠device QA.

## #91 — Forgot-password extract

Standalone `ForgotPasswordScreen` + routes; Login navigates out of embedded modes. Same PR [#144](https://github.com/eten-tech-foundation/fluent-mobile/pull/144). Server reset email OOS.

## #92 — Privacy / Terms routing

Login footer + Settings drawer links; `LegalDocumentLayout` ScrollView + back. Same PR [#144](https://github.com/eten-tech-foundation/fluent-mobile/pull/144). Legal copy ownership OOS.

## #93 — Auth guard / bootstrap

`restoreSession` / `signOut` in [authSession.ts](src/services/authSession.ts); provider calls restore on launch. PR [#143](https://github.com/eten-tech-foundation/fluent-mobile/pull/143): clears token + active KV, **keeps** SecureStore creds — distinct from #41 unwaived DB wipe.

## #94 — audioStorage expo-file-system

Flat `recordings/{id}.m4a` on `expo-file-system/legacy` ([audioStorage.ts](src/utils/audioStorage.ts)). PR [#224](https://github.com/eten-tech-foundation/fluent-mobile/pull/224) ships ticket Target A; Cesar Layout-C comment not adopted. Device QA unchecked on PR.

## #95 — Recording engine expo-audio

`createRecordingEngine` + `requestMicPermission` (no Alert); `RECORD_AUDIO` via app.config. Thin PR [#225](https://github.com/eten-tech-foundation/fluent-mobile/pull/225) merged — not unmerged #158.

## #96 — Playback + waveform decision

`createPlaybackEngine` + decorative `PlaybackProgressBar` (Alt placeholder bars). Closing comment cites [#229](https://github.com/eten-tech-foundation/fluent-mobile/pull/229) stack; dedicated [#226](https://github.com/eten-tech-foundation/fluent-mobile/pull/226) closed unmerged.

## #97 — useVerseAudio state machine

Pure `verseAudioReducer` + composable `useVerseAudio`; PR [#228](https://github.com/eten-tech-foundation/fluent-mobile/pull/228) merged. UI host now `RecordTab` (not ViewChapter) — named surface drift.

## #98 — Multi-take repository

Transactional `addRecordingTake` + `bible_text_id` joins; HEAD scopes `(bible_text_id, recorded_by_user_id)` / `is_selected`. PR [#227](https://github.com/eten-tech-foundation/fluent-mobile/pull/227) waived per-user until #105; later comments + current source implement that correction.

---

**Paths:** `/tmp/fluent-issue-review-r5.json` · `/tmp/fluent-issue-review-r5.md`  
**Counts:** 12 reviewed · 12 `recommend_complete=true` · 0 incomplete blockers
